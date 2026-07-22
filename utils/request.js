import { BASE_URL } from './config.js'
import { getStore } from '../store/index.js'

export function request({ url, method = 'GET', data, auth = true, header = {} }) {
  const store = getStore()
  const headers = {
    'Content-Type': 'application/json',
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
        const body = res.data
        if (res.statusCode === 401) {
          store.clearAuth()
          uni.reLaunch({ url: '/pages/login/login' })
          reject(new Error('未登录'))
          return
        }
        if (!body || typeof body.code === 'undefined') {
          reject(new Error('响应异常'))
          return
        }
        if (body.code !== 0) {
          uni.showToast({ title: body.message || '请求失败', icon: 'none' })
          reject(new Error(body.message || '请求失败'))
          return
        }
        resolve(body.data)
      },
      fail: (err) => {
        uni.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      }
    })
  })
}

export const api = {
  phoneLogin: (data) => request({ url: '/api/auth/phone', method: 'POST', data, auth: false }),
  me: () => request({ url: '/api/users/me' }),
  updateMe: (data) => request({ url: '/api/users/me', method: 'PUT', data }),
  searchUsers: (keyword) => request({ url: '/api/users/search?keyword=' + encodeURIComponent(keyword) }),
  friends: () => request({ url: '/api/friends' }),
  pendingFriends: () => request({ url: '/api/friends/pending' }),
  applyFriend: (friendId, remark) => request({ url: '/api/friends/apply', method: 'POST', data: { friendId, remark } }),
  acceptFriend: (id) => request({ url: '/api/friends/' + id + '/accept', method: 'POST' }),
  rejectFriend: (id) => request({ url: '/api/friends/' + id + '/reject', method: 'POST' }),
  conversations: () => request({ url: '/api/conversations' }),
  conversation: (id) => request({ url: '/api/conversations/' + id }),
  privateChat: (peerId) => request({ url: '/api/conversations/private/' + peerId, method: 'POST' }),
  createGroup: (data) => request({ url: '/api/conversations/groups', method: 'POST', data }),
  addBot: (id) => request({ url: '/api/conversations/' + id + '/bot', method: 'POST' }),
  markRead: (id, lastMsgId) => request({ url: '/api/conversations/' + id + '/read', method: 'POST', data: { lastMsgId } }),
  messages: (conversationId, beforeId) => request({
    url: '/api/messages?conversationId=' + conversationId + (beforeId ? '&beforeId=' + beforeId : '')
  }),
  sendMessage: (data) => request({ url: '/api/messages', method: 'POST', data }),
  recallMessage: (id) => request({ url: '/api/messages/' + id + '/recall', method: 'POST' }),
  openAiChat: () => request({ url: '/api/ai/chat', method: 'POST' }),
  botProfile: () => request({ url: '/api/ai/bot' }),
  upload: (filePath) => new Promise((resolve, reject) => {
    const store = getStore()
    uni.uploadFile({
      url: BASE_URL + '/api/files/upload',
      filePath,
      name: 'file',
      header: { Authorization: 'Bearer ' + store.state.token },
      success: (res) => {
        try {
          const body = JSON.parse(res.data)
          if (body.code === 0) resolve(body.data)
          else reject(new Error(body.message))
        } catch (e) {
          reject(e)
        }
      },
      fail: reject
    })
  })
}
