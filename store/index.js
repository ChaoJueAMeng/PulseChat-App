import { reactive } from 'vue'
import { sortConversations } from '../utils/chat-settings.js'

let _store = null

export function createPiniaLikeStore() {
  const state = reactive({
    token: '',
    refreshToken: '',
    user: null,
    conversations: [],
    onlineMap: {},
    connected: false,
    /** 当前打开的聊天会话 id，用于抑制该会话的应用内提醒 */
    activeChatId: null
  })


  const store = {
    state,
    hydrate() {
      try {
        state.token = uni.getStorageSync('pc_token') || ''
        state.refreshToken = uni.getStorageSync('pc_refresh') || ''
        state.user = uni.getStorageSync('pc_user') || null
      } catch (e) {}
    },
    setAuth(payload) {
      state.token = payload.accessToken
      state.refreshToken = payload.refreshToken
      state.user = payload.user
      uni.setStorageSync('pc_token', state.token)
      uni.setStorageSync('pc_refresh', state.refreshToken)
      uni.setStorageSync('pc_user', state.user)
    },
    clearAuth() {
      state.token = ''
      state.refreshToken = ''
      state.user = null
      state.conversations = []
      state.activeChatId = null
      uni.removeStorageSync('pc_token')
      uni.removeStorageSync('pc_refresh')
      uni.removeStorageSync('pc_user')
    },
    setConversations(list) {
      state.conversations = sortConversations(list || [])
    },
    upsertConversation(conv) {
      if (!conv || conv.id == null) return
      const id = Number(conv.id)
      const prev = state.conversations
      const next = prev.filter(c => Number(c.id) !== id)
      next.unshift(conv)
      // 单次赋值，避免 splice + 再赋值触发两次渲染
      state.conversations = sortConversations(next)
    },
    setActiveChatId(id) {
      state.activeChatId = id == null ? null : Number(id)
    },
    totalUnread() {
      return (state.conversations || []).reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0)
    },
    setOnline(userId, online) {
      state.onlineMap[userId] = online
    },
    setConnected(v) {
      state.connected = v
    }
  }
  _store = store
  return store
}

export function getStore() {
  if (!_store) return createPiniaLikeStore()
  return _store
}
