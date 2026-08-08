import { WS_URL } from './config.js'
import { getStore } from '../store/index.js'

let socketTask = null
let heartbeatTimer = null
let reconnectTimer = null
/** 连接世代：主动重建时递增，忽略旧 socket 的 close/error */
let connId = 0
let reconnectAttempts = 0
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
    try { h(payload) } catch (e) {}
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
  try { task.close() } catch (e) {}
}

export function connectWs(token) {
  if (!token) return
  pausedForBackground = false
  clearReconnectTimer()
  closeSocketSoft()
  reconnectAttempts = 0

  const myId = ++connId
  const store = getStore()
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
      'heart-beat:10000,10000\n' +
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
    if (data.startsWith('CONNECTED')) {
      connecting = false
      reconnectAttempts = 0
      store.setConnected(true)
      resubscribeActiveDestinations(myId)
      startHeartbeat()
      emit('connected')
      return
    }
    if (data.startsWith('MESSAGE')) {
      const bodyIdx = data.indexOf('\n\n')
      if (bodyIdx < 0) return
      const headers = data.slice(0, bodyIdx)
      const bodyRaw = data.slice(bodyIdx + 2).replace(/\0$/, '')
      const destLine = headers.split('\n').find(l => l.startsWith('destination:'))
      const destination = destLine ? destLine.slice('destination:'.length) : ''
      let body = null
      try { body = JSON.parse(bodyRaw) } catch (e) { body = bodyRaw }
      emit('message', { destination, body })
      if (destination.includes('/topic/conversation.') && destination.endsWith('.ai')) {
        if (body && typeof body === 'object') emit('ai', body)
      } else if (destination.includes('/topic/conversation.') && destination.endsWith('.typing')) {
        if (body && typeof body === 'object') emit('typing', body)
      } else if (destination.includes('/topic/conversation.') && destination.endsWith('.react')) {
        if (body && typeof body === 'object') emit('react', body)
      } else if (destination.includes('/topic/conversation.')) {
        // 会话主题也可能推送 reaction 事件
        if (body && typeof body === 'object' && (body.type === 'reaction' || body.type === 'message_react')) {
          emit('react', body)
        } else if (body && typeof body === 'object') {
          emit('chat', body)
        }
      } else if (destination.includes('/topic/presence')) {
        if (body && typeof body === 'object' && body.userId != null) {
          store.setOnline(body.userId, body.online)
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
  })

  task.onClose(() => {
    if (myId !== connId) return
    if (socketTask === task) socketTask = null
    connecting = false
    store.setConnected(false)
    stopHeartbeat()
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
      try { task.close() } catch (e) {}
      socketTask = null
      stopHeartbeat()
      if (getStore().state.token) scheduleReconnect()
    }
  })
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
  } catch (e) {}
  connecting = false
  closeSocketSoft()
  try {
    getStore().setConnected(false)
  } catch (e) {}
}

export function notifyAppForeground() {
  try {
    sendStomp('/app/chat.foreground', {})
  } catch (e) {}
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
      try { off && off() } catch (e) {}
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
  // 连上立刻打一次，缩短 presence 空窗，避免误发离线推送
  sendStomp('/app/chat.heartbeat', {})
  heartbeatTimer = setInterval(() => {
    sendStomp('/app/chat.heartbeat', {})
  }, 20000)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
