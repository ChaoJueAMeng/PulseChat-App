import { BASE_URL } from './config.js'
import { getStore } from '../store/index.js'

/** 仅对网络层 fail 做 Toast 节流：断网期间只弹一次，网络恢复(任意请求成功)后重置 */
let networkToastShown = false
function resetNetworkToastState() {
  networkToastShown = false
}
function showNetworkToastThrottled() {
  if (networkToastShown) return
  networkToastShown = true
  uni.showToast({ title: '网络异常', icon: 'none' })
}

const NETWORK_RETRY_ATTEMPTS = 1 // 1~2 次短重试；重试期间不弹 Toast
const NETWORK_RETRY_DELAY_MS = 420

/** 并发 401 时共用一次 refresh，避免刷爆 /api/auth/refresh */
let refreshInflight = null

function headerValue(headers, name) {
  if (!headers) return ''
  const want = String(name).toLowerCase()
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === want) {
      const v = headers[key]
      return v == null ? '' : String(v)
    }
  }
  return ''
}

/** 后端 JwtAuthFilter 滑动续期时通过响应头下发新 token */
function applySlideRenewHeaders(resHeaders) {
  const access = headerValue(resHeaders, 'X-Access-Token')
  const refresh = headerValue(resHeaders, 'X-Refresh-Token')
  if (!access && !refresh) return
  getStore().updateTokens(access || undefined, refresh || undefined)
}

function forceReLogin(message, silent) {
  const store = getStore()
  store.clearAuth()
  if (!silent) {
    uni.showToast({ title: message || '请重新登录', icon: 'none' })
  }
  uni.reLaunch({ url: '/pages/login/login' })
}

function refreshAuthTokens() {
  const store = getStore()
  const refreshToken = store.state.refreshToken
  if (!refreshToken) {
    return Promise.reject(new Error('无刷新令牌'))
  }
  if (refreshInflight) return refreshInflight
  refreshInflight = new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + '/api/auth/refresh',
      method: 'POST',
      data: { refreshToken },
      header: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Accept-Charset': 'UTF-8'
      },
      success: (res) => {
        let body = res.data
        if (typeof body === 'string') {
          try { body = JSON.parse(body) } catch (e) { body = null }
        }
        if (res.statusCode === 401 || (body && body.code === 401)) {
          reject(new Error((body && body.message) || '刷新令牌已失效'))
          return
        }
        if (!body || body.code !== 0 || !body.data || !body.data.accessToken) {
          reject(new Error((body && body.message) || '刷新失败'))
          return
        }
        store.setAuth(body.data)
        resolve(body.data)
      },
      fail: reject
    })
  }).finally(() => {
    refreshInflight = null
  })
  return refreshInflight
}

export function request({ url, method = 'GET', data, auth = true, header = {}, silent = false, _retriedAfterRefresh = false }) {
  const store = getStore()
  const headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json',
    'Accept-Charset': 'UTF-8',
    ...header
  }
  if (auth && store.state.token) {
    headers.Authorization = 'Bearer ' + store.state.token
  }
  return new Promise((resolve, reject) => {
    const attempt = (retryNo) => {
      uni.request({
        url: BASE_URL + url,
        method,
        data,
        header: headers,
        success: (res) => {
          // 只要请求成功到达服务端，就视为网络恢复，允许下次断网再提示
          resetNetworkToastState()
          applySlideRenewHeaders(res.header)

          let body = res.data
          // 部分端上 JSON 会以字符串返回
          if (typeof body === 'string') {
            try { body = JSON.parse(body) } catch (e) { body = null }
          }
          if (res.statusCode === 401 || (body && body.code === 401)) {
            if (auth && !_retriedAfterRefresh && store.state.refreshToken) {
              refreshAuthTokens()
                .then(() => request({
                  url,
                  method,
                  data,
                  auth,
                  header,
                  silent,
                  _retriedAfterRefresh: true
                }))
                .then(resolve)
                .catch(() => {
                  forceReLogin((body && body.message) || '请重新登录', silent)
                  reject(new Error((body && body.message) || '未登录'))
                })
              return
            }
            forceReLogin((body && body.message) || '请重新登录', silent)
            reject(new Error((body && body.message) || '未登录'))
            return
          }
          if (!body || typeof body.code === 'undefined') {
            // 兼容 Spring 默认错误体 {status,error,path}
            const tip = (body && (body.message || body.error))
              || ('服务异常(' + (res.statusCode || '?') + ')')
            if (!silent) {
              uni.showToast({ title: String(tip).slice(0, 40), icon: 'none' })
            }
            reject(new Error(tip))
            return
          }
          if (body.code !== 0) {
            if (!silent) {
              uni.showToast({ title: body.message || '请求失败', icon: 'none' })
            }
            reject(new Error(body.message || '请求失败'))
            return
          }
          resolve(body.data)
        },
        fail: (err) => {
          if (retryNo < NETWORK_RETRY_ATTEMPTS) {
            setTimeout(() => attempt(retryNo + 1), NETWORK_RETRY_DELAY_MS + retryNo * 120)
            return
          }
          if (!silent) showNetworkToastThrottled()
          reject(err)
        }
      })
    }

    attempt(0)
  })
}

export const api = {
  login: (data) => request({ url: '/api/auth/login', method: 'POST', data, auth: false }),
  register: (data) => request({ url: '/api/auth/register', method: 'POST', data, auth: false }),
  refresh: (refreshToken) => request({
    url: '/api/auth/refresh',
    method: 'POST',
    data: { refreshToken },
    auth: false,
    silent: true
  }),
  me: () => request({ url: '/api/users/me' }),
  updateMe: (data) => request({ url: '/api/users/me', method: 'PUT', data }),
  searchUsers: (keyword) => request({ url: '/api/users/search?keyword=' + encodeURIComponent(keyword) }),
  friends: () => request({ url: '/api/friends' }),
  pendingFriends: () => request({ url: '/api/friends/pending' }),
  applyFriend: (friendId, remark) => request({
    url: '/api/friends/apply',
    method: 'POST',
    data: remark ? { friendId, remark } : { friendId }
  }),
  acceptFriend: (id) => request({ url: '/api/friends/' + id + '/accept', method: 'POST' }),
  rejectFriend: (id) => request({ url: '/api/friends/' + id + '/reject', method: 'POST' }),
  conversations: () => request({ url: '/api/conversations' }),
  conversation: (id) => request({ url: '/api/conversations/' + id }),
  privateChat: (peerId) => request({ url: '/api/conversations/private/' + peerId, method: 'POST' }),
  createGroup: (data) => request({ url: '/api/conversations/groups', method: 'POST', data }),
  groupMembers: (id) => request({ url: '/api/conversations/' + id + '/members', silent: true }),
  inviteMembers: (id, memberIds) => request({
    url: '/api/conversations/' + id + '/invite',
    method: 'POST',
    data: { memberIds }
  }),
  kickMember: (id, targetId) => request({
    url: '/api/conversations/' + id + '/kick/' + targetId,
    method: 'POST'
  }),
  addBot: (id) => request({ url: '/api/conversations/' + id + '/bot', method: 'POST' }),
  markRead: (id, lastMsgId, silent = false) => request({ url: '/api/conversations/' + id + '/read', method: 'POST', data: { lastMsgId }, silent }),
  updateConvDraft: (id, data) => request({ url: '/api/conversations/' + id + '/draft', method: 'PUT', data }),
  messages: (conversationId, beforeId, silent = false) => request({
    url: '/api/messages?conversationId=' + conversationId + (beforeId ? '&beforeId=' + beforeId : ''),
    silent
  }),
  sendMessage: (data) => request({ url: '/api/messages', method: 'POST', data }),
  recallMessage: (id) => request({ url: '/api/messages/' + id + '/recall', method: 'POST' }),
  /** 消息附表情：{ emoji, active }，再点同一表情为取消 */
  reactMessage: (id, data) => request({
    url: '/api/messages/' + id + '/react',
    method: 'POST',
    data,
    silent: true
  }),
  openAiChat: () => request({ url: '/api/ai/chat', method: 'POST' }),
  /** 清空与 Kimi 私聊的云端聊天记录与上下文 */
  clearAiChatHistory: (conversationId) => request({
    url: '/api/ai/chat/' + conversationId + '/clear',
    method: 'POST'
  }),
  botProfile: () => request({ url: '/api/ai/bot' }),
  userProfile: (id) => request({ url: '/api/users/' + id }),
  checkFriend: (friendId) => request({ url: '/api/friends/check/' + friendId, silent: true }),
  deleteFriend: (friendId) => request({ url: '/api/friends/user/' + friendId, method: 'DELETE' }),
  updateConvSettings: (id, data) => request({ url: '/api/conversations/' + id + '/settings', method: 'PUT', data }),
  updateGroup: (id, data) => request({ url: '/api/conversations/' + id, method: 'PUT', data }),
  updateFriendRemark: (friendId, remark) => request({
    url: '/api/friends/' + friendId + '/remark',
    method: 'PUT',
    data: { remark: remark == null ? '' : remark }
  }),
  stickers: () => request({ url: '/api/stickers' }),
  addSticker: (data) => request({ url: '/api/stickers', method: 'POST', data }),
  batchAddStickers: (items) => request({
    url: '/api/stickers/batch',
    method: 'POST',
    data: { items }
  }),
  deleteSticker: (id) => request({ url: '/api/stickers/' + id, method: 'DELETE' }),
  batchDeleteStickers: (ids) => request({
    url: '/api/stickers/batch-delete',
    method: 'POST',
    data: { ids }
  }),
  reorderStickers: (ids) => request({
    url: '/api/stickers/reorder',
    method: 'PUT',
    data: { ids }
  }),
  registerPushToken: (data) => request({
    url: '/api/users/me/push-token',
    method: 'POST',
    data,
    silent: true
  }),
  unregisterPushToken: (data) => {
    const cid = data && data.clientId ? encodeURIComponent(data.clientId) : ''
    return request({
      url: '/api/users/me/push-token' + (cid ? '?clientId=' + cid : ''),
      method: 'DELETE',
      silent: true
    })
  },
  /** App 切后台：立刻清前台标记，便于 UniPush */
  presenceAway: () => request({
    url: '/api/users/me/presence/away',
    method: 'POST',
    silent: true
  }),
  /** App 回前台 */
  presenceActive: () => request({
    url: '/api/users/me/presence/active',
    method: 'POST',
    silent: true
  }),
  upload: (filePath, options = {}) => new Promise((resolve, reject) => {
    const store = getStore()
    const category = options.category ? '?category=' + encodeURIComponent(options.category) : ''
    const doUpload = () => {
      uni.uploadFile({
        url: BASE_URL + '/api/files/upload' + category,
        filePath,
        name: 'file',
        header: { Authorization: 'Bearer ' + store.state.token },
        success: (res) => {
          applySlideRenewHeaders(res.header)
          try {
            const body = JSON.parse(res.data)
            if (body.code === 0) {
              resolve(body.data)
              return
            }
            if (body.code === 401 || res.statusCode === 401) {
              if (!options._retriedAfterRefresh && store.state.refreshToken) {
                refreshAuthTokens()
                  .then(() => api.upload(filePath, { ...options, _retriedAfterRefresh: true }))
                  .then(resolve)
                  .catch(() => {
                    forceReLogin(body.message || '请重新登录', false)
                    reject(new Error(body.message || '未登录'))
                  })
                return
              }
              forceReLogin(body.message || '请重新登录', false)
              reject(new Error(body.message || '未登录'))
              return
            }
            uni.showToast({ title: body.message || '上传失败', icon: 'none' })
            reject(new Error(body.message || '上传失败'))
          } catch (e) {
            reject(e)
          }
        },
        fail: reject
      })
    }
    doUpload()
  })
}
