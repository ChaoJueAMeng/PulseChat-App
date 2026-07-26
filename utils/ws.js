import { WS_URL } from './config.js'
import { getStore } from '../store/index.js'

let socketTask = null
let heartbeatTimer = null
let reconnectTimer = null
/** 连接世代：主动重建时递增，忽略旧 socket 的 close/error */
let connId = 0
/** 是否正在主动关闭（避免触发自动重连） */
let closingIntentionally = false
/** 是否处于握手中（已创建 socket，尚未收到 CONNECTED） */
let connecting = false

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
  if (reconnectTimer) return
  const token = getStore().state.token
  if (!token) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    const t = getStore().state.token
    if (t) connectWs(t)
  }, 2500)
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
  clearReconnectTimer()
  closeSocketSoft()

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
      store.setConnected(true)
      subscribe('/user/queue/notify')
      subscribe('/topic/presence')
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
        emit('ai', body)
      } else if (destination.includes('/topic/conversation.') && destination.endsWith('.typing')) {
        emit('typing', body)
      } else if (destination.includes('/topic/conversation.') && destination.endsWith('.react')) {
        emit('react', body)
      } else if (destination.includes('/topic/conversation.')) {
        // 会话主题也可能推送 reaction 事件
        if (body && (body.type === 'reaction' || body.type === 'message_react')) {
          emit('react', body)
        } else {
          emit('chat', body)
        }
      } else if (destination.includes('/topic/presence')) {
        store.setOnline(body.userId, body.online)
        emit('presence', body)
      } else if (destination.includes('/queue/notify')) {
        if (body && (body.type === 'reaction' || body.type === 'message_react')) {
          emit('react', body.payload || body)
        } else {
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
  if (getStore().state.connected || connecting) return
  connectWs(token)
}

export function subscribe(destination) {
  if (!socketTask) return
  const id = 'sub-' + destination.replace(/[^\w]/g, '')
  const frame = 'SUBSCRIBE\nid:' + id + '\ndestination:' + destination + '\n\n\0'
  try {
    socketTask.send({ data: frame })
  } catch (e) {}
}

export function subscribeConversation(conversationId) {
  subscribe('/topic/conversation.' + conversationId)
  subscribe('/topic/conversation.' + conversationId + '.typing')
  subscribe('/topic/conversation.' + conversationId + '.ai')
  subscribe('/topic/conversation.' + conversationId + '.react')
}

export function sendStomp(destination, payload) {
  if (!socketTask) return
  const body = JSON.stringify(payload)
  const frame =
    'SEND\n' +
    'destination:' + destination + '\n' +
    'content-type:application/json\n\n' +
    body + '\0'
  try {
    socketTask.send({ data: frame })
  } catch (e) {}
}

function startHeartbeat() {
  stopHeartbeat()
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
