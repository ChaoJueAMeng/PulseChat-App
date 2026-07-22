import { WS_URL } from './config.js'
import { getStore } from '../store/index.js'

let socketTask = null
let heartbeatTimer = null
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

export function connectWs(token) {
  if (!token) return
  if (socketTask) {
    try { socketTask.close() } catch (e) {}
  }
  const store = getStore()
  // 原生 WebSocket + 简化 STOMP 帧
  socketTask = uni.connectSocket({
    url: WS_URL,
    complete: () => {}
  })

  socketTask.onOpen(() => {
    const connectFrame =
      'CONNECT\n' +
      'accept-version:1.2\n' +
      'heart-beat:10000,10000\n' +
      'Authorization:Bearer ' + token + '\n\n\0'
    socketTask.send({ data: connectFrame })
  })

  socketTask.onMessage((res) => {
    const data = typeof res.data === 'string' ? res.data : ''
    if (data.startsWith('CONNECTED')) {
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
      } else if (destination.includes('/topic/conversation.')) {
        emit('chat', body)
      } else if (destination.includes('/topic/presence')) {
        store.setOnline(body.userId, body.online)
        emit('presence', body)
      } else if (destination.includes('/queue/notify')) {
        emit('notify', body)
      }
    }
  })

  socketTask.onClose(() => {
    store.setConnected(false)
    stopHeartbeat()
    setTimeout(() => connectWs(getStore().state.token), 2500)
  })

  socketTask.onError(() => {
    store.setConnected(false)
  })
}

export function subscribe(destination) {
  if (!socketTask) return
  const id = 'sub-' + destination.replace(/[^\w]/g, '')
  const frame = 'SUBSCRIBE\nid:' + id + '\ndestination:' + destination + '\n\n\0'
  socketTask.send({ data: frame })
}

export function subscribeConversation(conversationId) {
  subscribe('/topic/conversation.' + conversationId)
  subscribe('/topic/conversation.' + conversationId + '.typing')
  subscribe('/topic/conversation.' + conversationId + '.ai')
}

export function sendStomp(destination, payload) {
  if (!socketTask) return
  const body = JSON.stringify(payload)
  const frame =
    'SEND\n' +
    'destination:' + destination + '\n' +
    'content-type:application/json\n\n' +
    body + '\0'
  socketTask.send({ data: frame })
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
