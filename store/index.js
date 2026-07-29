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
    activeChatId: null,
    /** 本地已读水位：conversationId -> lastReadMsgId，用于忽略迟到的未读推送 */
    readWatermark: {}
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
      state.readWatermark = {}
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
      const old = prev.find(c => Number(c.id) === id)
      // 与本地已有字段合并，避免推送体缺字段时冲掉 mute/标题等
      const merged = old ? { ...old, ...conv } : conv
      const next = prev.filter(c => Number(c.id) !== id)
      next.unshift(merged)
      // 单次赋值，避免 splice + 再赋值触发两次渲染
      state.conversations = sortConversations(next)
    },
    /** 标记本地已读并清零未读红点，防止 WS/列表刷新把旧未读写回 */
    markConversationReadLocal(conversationId, lastMsgId) {
      if (conversationId == null) return
      const id = Number(conversationId)
      const msgId = Number(lastMsgId) || 0
      if (msgId > 0) {
        const prev = Number(state.readWatermark[id]) || 0
        if (msgId > prev) {
          state.readWatermark = { ...state.readWatermark, [id]: msgId }
        }
      }
      const old = (state.conversations || []).find(c => Number(c.id) === id)
      if (!old || !old.unreadCount) return
      this.upsertConversation({ id, unreadCount: 0 })
    },
    isReadUpTo(conversationId, lastMsgId) {
      const id = Number(conversationId)
      const msgId = Number(lastMsgId) || 0
      if (!id || !msgId) return false
      return msgId <= (Number(state.readWatermark[id]) || 0)
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
