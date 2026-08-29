import { reactive } from 'vue'
import { sortConversations } from '../utils/chat-settings.js'
import { clearAllMessageCaches } from '../utils/message-cache.js'

const CONV_STORAGE_KEY = 'pc_conversations'
const CONV_PERSIST_DEBOUNCE_MS = 200

let _store = null
let persistTimer = null
let conversationsInflight = null

function persistConversationsSoon(list) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      uni.setStorageSync(CONV_STORAGE_KEY, list || [])
    } catch (e) {}
  }, CONV_PERSIST_DEBOUNCE_MS)
}

function clearPersistedConversations() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  try {
    uni.removeStorageSync(CONV_STORAGE_KEY)
  } catch (e) {}
}

/** HTTP 刷新时保留 store 里更新的会话摘要，避免在途请求覆盖刚到的 WS */
function mergeConversations(fromApi, fromStore, watermark) {
  const storeMap = new Map((fromStore || []).map((c) => [Number(c.id), c]))
  const wmMap = watermark || {}
  const merged = (fromApi || []).map((c) => {
    const id = Number(c.id)
    const s = storeMap.get(id)
    let result = c
    if (s) {
      const apiMsg = Number(c.lastMsgId) || 0
      const storeMsg = Number(s.lastMsgId) || 0
      const apiDraftAt = Number(c.draftUpdatedAt) || 0
      const storeDraftAt = Number(s.draftUpdatedAt) || 0
      const apiPinnedAt = Number(c.pinnedAt) || 0
      const storePinnedAt = Number(s.pinnedAt) || 0
      if (storeMsg > apiMsg) result = { ...c, ...s }
      else if (storeMsg === apiMsg && s.lastMsgPreview === '消息已撤回' && c.lastMsgPreview !== '消息已撤回') {
        result = { ...c, lastMsgPreview: s.lastMsgPreview }
      }
      if (storeDraftAt > apiDraftAt) {
        result = {
          ...result,
          draftText: s.draftText,
          draftAtUserIds: s.draftAtUserIds,
          draftUpdatedAt: s.draftUpdatedAt
        }
      }
      if (storePinnedAt > apiPinnedAt || (storePinnedAt === 0 && apiPinnedAt > 0 && !Number(s.pinned))) {
        result = {
          ...result,
          pinned: s.pinned,
          pinnedAt: s.pinnedAt
        }
      }
    }
    const lastMsgId = Number(result.lastMsgId) || 0
    const wm = Number(wmMap[id]) || 0
    if (lastMsgId > 0 && wm >= lastMsgId && (Number(result.unreadCount) || 0) > 0) {
      result = { ...result, unreadCount: 0 }
    }
    return result
  })
  return sortConversations(merged)
}

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
        const cached = uni.getStorageSync(CONV_STORAGE_KEY)
        if (Array.isArray(cached) && cached.length) {
          state.conversations = sortConversations(cached)
        }
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
    /** 滑动续期 / refresh：仅更新凭证，保留当前 user */
    updateTokens(accessToken, refreshToken) {
      if (accessToken) {
        state.token = accessToken
        uni.setStorageSync('pc_token', accessToken)
      }
      if (refreshToken) {
        state.refreshToken = refreshToken
        uni.setStorageSync('pc_refresh', refreshToken)
      }
    },
    clearAuth() {
      state.token = ''
      state.refreshToken = ''
      state.user = null
      state.conversations = []
      state.activeChatId = null
      state.readWatermark = {}
      conversationsInflight = null
      uni.removeStorageSync('pc_token')
      uni.removeStorageSync('pc_refresh')
      uni.removeStorageSync('pc_user')
      clearPersistedConversations()
      clearAllMessageCaches()
    },
    setConversations(list) {
      state.conversations = sortConversations(list || [])
      persistConversationsSoon(state.conversations)
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
      persistConversationsSoon(state.conversations)
    },
    /**
     * 共享会话列表请求：并发调用复用同一 Promise，写回走 merge，避免覆盖 WS 更新。
     * @param {() => Promise<Array>} loader
     */
    fetchConversations(loader) {
      if (conversationsInflight) return conversationsInflight
      if (typeof loader !== 'function') {
        return Promise.resolve(state.conversations)
      }
      conversationsInflight = Promise.resolve()
        .then(() => loader())
        .then((data) => {
          if (!state.token) return state.conversations
          const next = mergeConversations(data || [], state.conversations, state.readWatermark)
          this.setConversations(next)
          return state.conversations
        })
        .finally(() => {
          conversationsInflight = null
        })
      return conversationsInflight
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
