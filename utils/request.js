import { BASE_URL } from './config.js'
import { getStore } from '../store/index.js'

export function request({ url, method = 'GET', data, auth = true, header = {}, silent = false }) {
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
    uni.request({
      url: BASE_URL + url,
      method,
      data,
      header: headers,
      success: (res) => {
        let body = res.data
        // 部分端上 JSON 会以字符串返回
        if (typeof body === 'string') {
          try { body = JSON.parse(body) } catch (e) { body = null }
        }
        if (res.statusCode === 401 || (body && body.code === 401)) {
          store.clearAuth()
          if (!silent) {
            uni.showToast({ title: (body && body.message) || '请重新登录', icon: 'none' })
          }
          uni.reLaunch({ url: '/pages/login/login' })
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
        if (!silent) {
          uni.showToast({ title: '网络异常', icon: 'none' })
        }
        reject(err)
      }
    })
  })
}

export const api = {
  login: (data) => request({ url: '/api/auth/login', method: 'POST', data, auth: false }),
  register: (data) => request({ url: '/api/auth/register', method: 'POST', data, auth: false }),
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
  groupMembers: (id) => request({ url: '/api/conversations/' + id + '/members' }),
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
  messages: (conversationId, beforeId) => request({
    url: '/api/messages?conversationId=' + conversationId + (beforeId ? '&beforeId=' + beforeId : '')
  }),
  sendMessage: (data) => request({ url: '/api/messages', method: 'POST', data }),
  recallMessage: (id) => request({ url: '/api/messages/' + id + '/recall', method: 'POST' }),
  /** 消息附表情：{ emoji }，再点同一表情为取消；silent 便于后端未上线时降级 */
  reactMessage: (id, data) => request({
    url: '/api/messages/' + id + '/react',
    method: 'POST',
    data,
    silent: true
  }),
  openAiChat: () => request({ url: '/api/ai/chat', method: 'POST' }),
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
  upload: (filePath, options = {}) => new Promise((resolve, reject) => {
    const store = getStore()
    const category = options.category ? '?category=' + encodeURIComponent(options.category) : ''
    uni.uploadFile({
      url: BASE_URL + '/api/files/upload' + category,
      filePath,
      name: 'file',
      header: { Authorization: 'Bearer ' + store.state.token },
      success: (res) => {
        try {
          const body = JSON.parse(res.data)
          if (body.code === 0) resolve(body.data)
          else {
            uni.showToast({ title: body.message || '上传失败', icon: 'none' })
            reject(new Error(body.message || '上传失败'))
          }
        } catch (e) {
          reject(e)
        }
      },
      fail: reject
    })
  })
}
