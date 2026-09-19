import { WS_URL } from './config.js'
import { getStore } from '../store/index.js'
import { reportCaught } from './error-report.js'

const HEARTBEAT_MS = 10000
const MAX_RECV_BUF = 1024 * 1024

let socketTask = null
let heartbeatTimer = null
let reconnectTimer = null
/** 连接世代：主动重建时递增，忽略旧 socket 的 close/error */
let connId = 0
let reconnectAttempts = 0
/** 当前这条连接使用的 token，用于避免同凭证重复握手 */
let connectedToken = ''
/** 未拼完的 STOMP 半包 */
let recvBuf = ''
/** 是否正在主动关闭（避免触发自动重连） */
let closingIntentionally = false
/** App 进入后台时主动暂停 WS，期间禁止自动重连 */
let pausedForBackground = false
/** 是否处于握手中（已创建 socket，尚未收到 CONNECTED） */
let connecting = false
/** 活跃订阅表：destination -> { id, count, connId } */
const subscriptions = Object.create(null)
const CORE_DESTINATIONS = ['/user/queue/notify', '/topic/presence']

const listeners = {}

export function onWs(event, handler) {
  if (!listeners[event]) listeners[event] = []
  listeners[event].push(handler)
  return () => {
    listeners[event] = (listeners[event] || []).filter(h => h !== handler)
  }
}

function emit(event, payload) {
  ;(listeners[event] || []).forEach(h => {
    try {
      h(payload)
    } catch (e) {
      reportCaught('ws.emit.' + event, e)
    }
  })
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  if (pausedForBackground) return
  if (reconnectTimer) return
  const token = getStore().state.token
  if (!token) return
  reconnectAttempts++
  const delayMs = Math.min(2500 * Math.pow(2, reconnectAttempts - 1), 20000)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (pausedForBackground) return
    const t = getStore().state.token
    if (t) connectWs(t)
  }, delayMs)
}

function subscriptionIdOf(destination) {
  return 'sub-' + String(destination || '').replace(/[^\w]/g, '')
}

function isSocketReady() {
  return !!socketTask && getStore().state.connected
}

function sendFrame(frame) {
  if (!socketTask) return false
  try {
    socketTask.send({ data: frame })
    return true
  } catch (e) {
    return false
  }
}

function sendSubscribeFrame(destination, id) {
  if (!isSocketReady()) return false
  const frame = 'SUBSCRIBE\nid:' + id + '\ndestination:' + destination + '\n\n\0'
  return sendFrame(frame)
}

function sendUnsubscribeFrame(id) {
  if (!isSocketReady()) return false
  const frame = 'UNSUBSCRIBE\nid:' + id + '\n\n\0'
  return sendFrame(frame)
}

function resubscribeActiveDestinations(activeConnId) {
  CORE_DESTINATIONS.forEach((destination) => {
    sendSubscribeFrame(destination, subscriptionIdOf(destination))
  })
  Object.keys(subscriptions).forEach((destination) => {
    const sub = subscriptions[destination]
    if (!sub || sub.count <= 0) return
    if (sendSubscribeFrame(destination, sub.id)) {
      sub.connId = activeConnId
    }
  })
}

function closeSocketSoft() {
  const task = socketTask
  if (!task) return
  closingIntentionally = true
  socketTask = null
  try {
    task.close()
  } catch (e) {
    reportCaught('ws.closeSocketSoft', e, { level: 'debug' })
  }
}

function parseStompFrame(raw) {
  const text = String(raw || '').replace(/^\u0000+/, '')
  if (!text.trim()) return null
  const sep = text.match(/\r?\n\r?\n/)
  const head = sep ? text.slice(0, sep.index) : text
  const body = sep ? text.slice(sep.index + sep[0].length).replace(/\0+$/, '') : ''
  const lines = head.split(/\r?\n/)
  const command = String(lines[0] || '').trim()
  if (!command) return null
  const headers = Object.create(null)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) headers[key] = val
  }
  return { command, headers, body }
}

function consumeRecvBuffer(onFrame) {
  while (true) {
    recvBuf = recvBuf.replace(/^[\r\n]+/, '')
    const nul = recvBuf.indexOf('\0')
    if (nul < 0) {
      if (recvBuf.length > MAX_RECV_BUF) recvBuf = ''
      return
    }
    const raw = recvBuf.slice(0, nul)
    recvBuf = recvBuf.slice(nul + 1)
    if (!raw.trim()) continue
    onFrame(raw)
  }
}

function dispatchMessage(destination, body) {
  emit('message', { destination, body })
  if (destination.includes('/topic/conversation.') && destination.endsWith('.ai')) {
    if (body && typeof body === 'object') emit('ai', body)
  } else if (destination.includes('/topic/conversation.') && destination.endsWith('.typing')) {
    if (body && typeof body === 'object') emit('typing', body)
  } else if (destination.includes('/topic/conversation.') && destination.endsWith('.react')) {
    if (body && typeof body === 'object') emit('react', body)
  } else if (destination.includes('/topic/conversation.')) {
    if (body && typeof body === 'object' && (body.type === 'reaction' || body.type === 'message_react')) {
      emit('react', body)
    } else if (body && typeof body === 'object') {
      emit('chat', body)
    }
  } else if (destination.includes('/topic/presence')) {
    if (body && typeof body === 'object' && body.userId != null) {
      getStore().setOnline(body.userId, body.online)
      emit('presence', body)
    }
  } else if (destination.includes('/queue/notify')) {
    if (body && typeof body === 'object' && (body.type === 'reaction' || body.type === 'message_react')) {
      emit('react', body.payload || body)
    } else if (body != null) {
      emit('notify', body)
    }
  }
}

function handleStompFrame(raw, myId, store) {
  const frame = parseStompFrame(raw)
  if (!frame) return
  const command = frame.command.toUpperCase()
  if (command === 'CONNECTED') {
    connecting = false
    reconnectAttempts = 0
    store.setConnected(true)
    resubscribeActiveDestinations(myId)
    startHeartbeat()
    emit('connected')
    return
  }
  if (command === 'ERROR') {
    const tip = frame.headers.message || frame.body || 'STOMP ERROR'
    reportCaught('ws.stomp.error', new Error(String(tip).slice(0, 200)))
    connecting = false
    store.setConnected(false)
    stopHeartbeat()
    closeSocketSoft()
    closingIntentionally = false
    if (getStore().state.token && !pausedForBackground) scheduleReconnect()
    return
  }
  if (command !== 'MESSAGE') return
  const destination = frame.headers.destination || ''
  let body = null
  try {
    body = frame.body ? JSON.parse(frame.body) : null
  } catch (e) {
    body = frame.body
  }
  dispatchMessage(destination, body)
}

export function connectWs(token) {
  if (!token) return
  pausedForBackground = false
  const store = getStore()
  if (socketTask && (store.state.connected || connecting) && connectedToken === token) {
    return
  }
  if (token !== connectedToken) {
    reconnectAttempts = 0
  }
  connectedToken = token
  clearReconnectTimer()
  closeSocketSoft()
  recvBuf = ''

  const myId = ++connId
  connecting = true
  store.setConnected(false)

  // 原生 WebSocket + 简化 STOMP 帧
  const task = uni.connectSocket({
    url: WS_URL,
    complete: () => {}
  })
  socketTask = task

  task.onOpen(() => {
    if (myId !== connId || socketTask !== task) return
    closingIntentionally = false
    const connectFrame =
      'CONNECT\n' +
      'accept-version:1.2\n' +
      'heart-beat:' + HEARTBEAT_MS + ',' + HEARTBEAT_MS + '\n' +
      'Authorization:Bearer ' + token + '\n\n\0'
    try {
      task.send({ data: connectFrame })
    } catch (e) {
      connecting = false
      scheduleReconnect()
    }
  })

  task.onMessage((res) => {
    if (myId !== connId || socketTask !== task) return
    const data = typeof res.data === 'string' ? res.data : ''
    if (!data) return
    recvBuf += data
    consumeRecvBuffer((raw) => handleStompFrame(raw, myId, store))
  })

  task.onClose(() => {
    if (myId !== connId) return
    if (socketTask === task) socketTask = null
    connecting = false
    store.setConnected(false)
    stopHeartbeat()
    recvBuf = ''
    const intentional = closingIntentionally
    closingIntentionally = false
    if (intentional) return
    if (!getStore().state.token) return
    scheduleReconnect()
  })

  task.onError(() => {
    if (myId !== connId) return
    store.setConnected(false)
    // 部分端上 error 后未必立刻 close，主动收尾并排队重连
    if (socketTask === task) {
      closingIntentionally = false
      connecting = false
      try {
        task.close()
      } catch (e) {
        reportCaught('ws.onError.close', e, { level: 'debug' })
      }
      socketTask = null
      stopHeartbeat()
      recvBuf = ''
      if (getStore().state.token) scheduleReconnect()
    }
  })
}

/** 登出或强制重新登录时关掉通道，并禁止按旧 token 重连 */
export function disconnectWs() {
  pausedForBackground = false
  clearReconnectTimer()
  stopHeartbeat()
  connecting = false
  connectedToken = ''
  recvBuf = ''
  reconnectAttempts = 0
  closeSocketSoft()
  try {
    getStore().setConnected(false)
  } catch (e) {
    reportCaught('ws.disconnectWs.setConnected', e)
  }
}

/** 前台恢复时确保通道可用；已连上或握手中则跳过，避免掐断进行中的连接 */
export function ensureWs() {
  const token = getStore().state.token
  if (!token) return
  pausedForBackground = false
  if (getStore().state.connected || connecting) return
  connectWs(token)
}

/**
 * App 进入后台：通知服务端清前台标记，并主动断开 WS。
 * 后台 JS 常被挂起，本地通知弹不出；断开后服务端按非前台发 UniPush。
 */
export function pauseWsForBackground() {
  pausedForBackground = true
  clearReconnectTimer()
  stopHeartbeat()
  try {
    sendStomp('/app/chat.background', {})
  } catch (e) {
    reportCaught('ws.pauseWsForBackground.send', e)
  }
  connecting = false
  closeSocketSoft()
  recvBuf = ''
  try {
    getStore().setConnected(false)
  } catch (e) {
    reportCaught('ws.pauseWsForBackground.setConnected', e)
  }
}

export function notifyAppForeground() {
  try {
    sendStomp('/app/chat.foreground', {})
  } catch (e) {
    reportCaught('ws.notifyAppForeground.send', e)
  }
}

export function subscribe(destination) {
  if (!destination) return () => {}
  let sub = subscriptions[destination]
  if (!sub) {
    sub = {
      id: subscriptionIdOf(destination),
      count: 0,
      connId: 0
    }
    subscriptions[destination] = sub
  }
  sub.count += 1
  if (sub.count === 1 && sendSubscribeFrame(destination, sub.id)) {
    sub.connId = connId
  }
  return () => unsubscribe(destination)
}

export function unsubscribe(destination) {
  const sub = subscriptions[destination]
  if (!sub) return
  sub.count -= 1
  if (sub.count > 0) return
  if (sub.connId === connId) {
    sendUnsubscribeFrame(sub.id)
  }
  delete subscriptions[destination]
}

export function subscribeConversation(conversationId) {
  const offs = [
    subscribe('/topic/conversation.' + conversationId),
    subscribe('/topic/conversation.' + conversationId + '.typing'),
    subscribe('/topic/conversation.' + conversationId + '.ai'),
    subscribe('/topic/conversation.' + conversationId + '.react')
  ]
  return () => {
    offs.forEach((off) => {
      try {
        off && off()
      } catch (e) {
        reportCaught('ws.bindCoreNotify.off', e, { level: 'debug' })
      }
    })
  }
}

export function sendStomp(destination, payload) {
  if (!socketTask) return
  const body = JSON.stringify(payload)
  const frame =
    'SEND\n' +
    'destination:' + destination + '\n' +
    'content-type:application/json\n\n' +
    body + '\0'
  sendFrame(frame)
}

function startHeartbeat() {
  stopHeartbeat()
  // 协议心跳对齐 CONNECT 声明；业务心跳给服务端 presence
  sendFrame('\n')
  sendStomp('/app/chat.heartbeat', {})
  heartbeatTimer = setInterval(() => {
    sendFrame('\n')
    sendStomp('/app/chat.heartbeat', {})
  }, HEARTBEAT_MS)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
