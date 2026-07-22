let _store = null

export function createPiniaLikeStore() {
  const state = {
    token: '',
    refreshToken: '',
    user: null,
    conversations: [],
    onlineMap: {},
    connected: false
  }

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
      uni.removeStorageSync('pc_token')
      uni.removeStorageSync('pc_refresh')
      uni.removeStorageSync('pc_user')
    },
    setConversations(list) {
      state.conversations = list || []
    },
    upsertConversation(conv) {
      const idx = state.conversations.findIndex(c => c.id === conv.id)
      if (idx >= 0) state.conversations.splice(idx, 1)
      state.conversations.unshift(conv)
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
