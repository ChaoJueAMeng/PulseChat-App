import { getStore } from '../store/index.js'
import { sortConversations } from './chat-settings.js'
import { api } from './request.js'

const ENABLED_KEY = 'pc_notify_enabled'
const CID_KEY = 'pc_push_client_id'
const CHANNEL_ID = 'pulse_chat_messages'
const CHANNEL_NAME = '消息通知'

let appVisible = true
let pushHandlersInstalled = false
let channelReady = false
let notifySeq = 1
let registerPushTimer = null
let registeringPush = false

function readFlag(key, defaultValue = true) {
  try {
    const v = uni.getStorageSync(key)
    if (v === '' || v === undefined || v === null) return defaultValue
    if (v === false || v === 0 || v === '0' || v === 'false') return false
    return true
  } catch (e) {
    return defaultValue
  }
}

function writeFlag(key, value) {
  try {
    uni.setStorageSync(key, !!value)
  } catch (e) {}
}

export function getNotifyPrefs() {
  return {
    enabled: readFlag(ENABLED_KEY, true)
  }
}

export function setNotifyPrefs(partial = {}) {
  if (partial.enabled !== undefined) writeFlag(ENABLED_KEY, partial.enabled)
  return getNotifyPrefs()
}

export function setAppVisible(visible) {
  appVisible = !!visible
}

export function isAppVisible() {
  return appVisible
}

function isMutedConv(conv) {
  return !!(conv?.muted ?? conv?.mute)
}

function previewText(text, max = 36) {
  const raw = String(text || '发来一条新消息').trim()
  return raw.length > max ? raw.slice(0, max) + '…' : raw
}

function openChatFromPayload(data) {
  if (!data || data.convId == null) return
  const id = Number(data.convId)
  if (!Number.isFinite(id) || id <= 0) return
  const title = encodeURIComponent(data.title || '聊天')
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  const route = cur?.route || ''
  if (route.includes('pages/chat/chat') && Number(cur?.options?.id) === id) {
    return
  }
  uni.navigateTo({
    url: '/pages/chat/chat?id=' + id + '&title=' + title,
    fail: () => {
      uni.switchTab({ url: '/pages/chats/chats' })
    }
  })
}

function openContactsFromFriendNotify() {
  uni.switchTab({ url: '/pages/contacts/contacts' })
}

function handleNotifyPayload(raw) {
  let data = {}
  try {
    data = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {})
  } catch (e) {
    data = {}
  }
  if (data.type === 'friend_request' || data.type === 'friend_accepted') {
    openContactsFromFriendNotify()
    return
  }
  openChatFromPayload(data)
}

function ensureAndroidChannel() {
  if (channelReady) return CHANNEL_ID
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return ''
  try {
    const main = plus.android.runtimeMainActivity()
    const Context = plus.android.importClass('android.content.Context')
    const NotificationManager = plus.android.importClass('android.app.NotificationManager')
    const Build = plus.android.importClass('android.os.Build')
    if (!Build || Build.VERSION.SDK_INT < 26) {
      channelReady = true
      return CHANNEL_ID
    }
    const NotificationChannel = plus.android.importClass('android.app.NotificationChannel')
    const nm = main.getSystemService(Context.NOTIFICATION_SERVICE)
    plus.android.importClass(nm)
    let channel = nm.getNotificationChannel(CHANNEL_ID)
    if (!channel) {
      channel = new NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH
      )
      channel.enableLights(true)
      channel.enableVibration(true)
      channel.setShowBadge(true)
      channel.setDescription('会话消息与好友申请')
      nm.createNotificationChannel(channel)
    }
    channelReady = true
    return CHANNEL_ID
  } catch (e) {
    return ''
  }
}

function withLocalMark(payload) {
  return { ...(payload || {}), _pcLocal: 1 }
}

/** Android 原生系统通知（不依赖厂商推送通道） */
function createAndroidNativeNotification(title, content, payload, notifyId) {
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return false
  try {
    const channelId = ensureAndroidChannel() || CHANNEL_ID
    const main = plus.android.runtimeMainActivity()
    const Context = plus.android.importClass('android.content.Context')
    const Intent = plus.android.importClass('android.content.Intent')
    const PendingIntent = plus.android.importClass('android.app.PendingIntent')
    const Notification = plus.android.importClass('android.app.Notification')
    const Build = plus.android.importClass('android.os.Build')

    const data = withLocalMark(payload)
    const intent = main.getPackageManager().getLaunchIntentForPackage(main.getPackageName())
    if (!intent) return false
    intent.putExtra('pc_notify_payload', JSON.stringify(data))
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)

    let piFlags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= 23) {
      piFlags = piFlags | PendingIntent.FLAG_IMMUTABLE
    }
    const requestCode = Number(notifyId) || (notifySeq++ % 100000)
    const pendingIntent = PendingIntent.getActivity(main, requestCode, intent, piFlags)

    let builder
    if (Build.VERSION.SDK_INT >= 26) {
      builder = new Notification.Builder(main, channelId)
    } else {
      builder = new Notification.Builder(main)
    }

    const smallIcon = main.getApplicationInfo().icon
    builder.setContentTitle(String(title || '脉冲'))
    builder.setContentText(String(content || ''))
    builder.setSmallIcon(smallIcon)
    builder.setAutoCancel(true)
    builder.setContentIntent(pendingIntent)
    builder.setWhen(Date.now())
    if (typeof builder.setShowWhen === 'function') builder.setShowWhen(true)
    if (Build.VERSION.SDK_INT >= 16) {
      builder.setPriority(Notification.PRIORITY_HIGH)
    }
    if (Build.VERSION.SDK_INT >= 21) {
      builder.setVisibility(Notification.VISIBILITY_PUBLIC)
      builder.setDefaults(Notification.DEFAULT_ALL)
      builder.setCategory(Notification.CATEGORY_MESSAGE)
    } else {
      builder.setDefaults(Notification.DEFAULT_ALL)
    }

    const nm = main.getSystemService(Context.NOTIFICATION_SERVICE)
    plus.android.importClass(nm)
    const notification = Build.VERSION.SDK_INT >= 16 ? builder.build() : builder.getNotification()
    nm.notify(requestCode, notification)
    return true
  } catch (e) {
    return false
  }
}

function createPlusPushMessage(title, content, payload) {
  if (typeof plus === 'undefined' || !plus.push || typeof plus.push.createMessage !== 'function') {
    return false
  }
  try {
    const channelId = ensureAndroidChannel()
    const options = {
      title: String(title || '脉冲'),
      cover: false,
      sound: 'system'
    }
    if (channelId) options.channelId = channelId
    plus.push.createMessage(String(content || ''), JSON.stringify(withLocalMark(payload)), options)
    return true
  } catch (e) {
    return false
  }
}

/** 统一创建系统通知栏消息 */
function createSystemNotification(title, content, payload, notifyId) {
  const prefs = getNotifyPrefs()
  if (!prefs.enabled) return false
  if (typeof plus === 'undefined') return false

  installPushHandlers()

  // Android：优先原生 Notification，稳定弹出系统通知栏
  if (plus.os.name === 'Android') {
    if (createAndroidNativeNotification(title, content, payload, notifyId)) return true
  }

  return createPlusPushMessage(title, content, payload)
}

function consumePendingNotifyPayload() {
  try {
    const main = typeof plus !== 'undefined' && plus.os.name === 'Android'
      ? plus.android.runtimeMainActivity()
      : null
    if (!main) return
    const intent = main.getIntent()
    if (!intent) return
    const raw = intent.getStringExtra('pc_notify_payload')
    if (!raw) return
    intent.removeExtra('pc_notify_payload')
    handleNotifyPayload(raw)
  } catch (e) {}
}

function installPushHandlers() {
  if (pushHandlersInstalled) return
  if (typeof plus === 'undefined' || !plus.push) return
  pushHandlersInstalled = true
  try {
    if (typeof plus.push.setAutoNotification === 'function') {
      plus.push.setAutoNotification(true)
    }
  } catch (e) {}
  try {
    plus.push.addEventListener('click', (msg) => {
      handleNotifyPayload(msg?.payload)
    }, false)
  } catch (e) {}
  // 云端透传推送：未自动展示时转为系统通知（本地消息带 _pcLocal，直接忽略）
  try {
    plus.push.addEventListener('receive', (msg) => {
      if (!msg) return
      let payload = msg.payload
      try {
        if (typeof payload === 'string') payload = JSON.parse(payload || '{}')
      } catch (e) {
        payload = {}
      }
      if (payload === 'LocalMSG') return
      if (payload && typeof payload === 'object' && payload._pcLocal) return
      // 已是通知栏消息（含 aps）时不再重复创建
      if (msg.aps || msg.type === 'click') return
      const data = payload && typeof payload === 'object' ? payload : {}
      const title = msg.title || data.title || '脉冲'
      const content = msg.content || data.content || '你有一条新消息'
      const notifyId = data.convId != null ? Number(data.convId) : (Date.now() % 100000)
      createSystemNotification(title, content, data, notifyId)
    }, false)
  } catch (e) {}
}

function requestNotifyPermission() {
  if (typeof plus === 'undefined') return
  try {
    if (plus.os.name === 'Android') {
      const Build = plus.android.importClass('android.os.Build')
      if (Build && Build.VERSION.SDK_INT >= 33) {
        plus.android.requestPermissions(
          ['android.permission.POST_NOTIFICATIONS'],
          () => {},
          () => {}
        )
      }
      ensureAndroidChannel()
      return
    }
  } catch (e) {}
  // iOS：触发系统通知授权弹窗（同时可拿到 CID）
  try {
    resolvePushClientId().catch(() => {})
  } catch (e) {}
}

function detectPlatform() {
  try {
    if (typeof plus !== 'undefined' && plus.os && plus.os.name) {
      const name = String(plus.os.name).toLowerCase()
      if (name.includes('android')) return 'android'
      if (name.includes('ios')) return 'ios'
      if (name.includes('harmony')) return 'harmony'
      return name
    }
  } catch (e) {}
  return undefined
}

function cacheClientId(cid) {
  if (!cid) return
  try {
    uni.setStorageSync(CID_KEY, String(cid))
  } catch (e) {}
}

function readCachedClientId() {
  try {
    const v = uni.getStorageSync(CID_KEY)
    return v ? String(v) : ''
  } catch (e) {
    return ''
  }
}

/** 获取 UniPush / 个推 CID */
export function resolvePushClientId() {
  return new Promise((resolve) => {
    const finish = (cid) => {
      const id = cid ? String(cid).trim() : ''
      if (id) cacheClientId(id)
      resolve(id)
    }
    try {
      if (typeof uni !== 'undefined' && typeof uni.getPushClientId === 'function') {
        uni.getPushClientId({
          success: (res) => finish(res?.cid || res?.clientid || ''),
          fail: () => tryPlusClientId(finish)
        })
        return
      }
    } catch (e) {}
    tryPlusClientId(finish)
  })
}

function tryPlusClientId(finish) {
  try {
    if (typeof plus === 'undefined' || !plus.push) {
      finish('')
      return
    }
    if (typeof plus.push.getClientInfoAsync === 'function') {
      plus.push.getClientInfoAsync((info) => {
        finish(info?.clientid || info?.clientId || '')
      }, () => finish(''))
      return
    }
    if (typeof plus.push.getClientInfo === 'function') {
      const info = plus.push.getClientInfo()
      finish(info?.clientid || info?.clientId || '')
      return
    }
  } catch (e) {}
  finish('')
}

/** 登录后 / App 启动：上报 CID 供离线推送 */
export async function registerPushClient() {
  const prefs = getNotifyPrefs()
  if (!prefs.enabled) return ''
  const store = getStore()
  if (!store.state.token) return ''
  if (registeringPush) return readCachedClientId()
  registeringPush = true
  try {
    const cid = await resolvePushClientId()
    if (!cid) return ''
    await api.registerPushToken({
      clientId: cid,
      platform: detectPlatform()
    })
    return cid
  } catch (e) {
    return ''
  } finally {
    registeringPush = false
  }
}

/** 延迟重试：自定义基座上 CID 有时稍后才就绪 */
export function scheduleRegisterPushClient(delayMs = 800) {
  if (registerPushTimer) {
    clearTimeout(registerPushTimer)
    registerPushTimer = null
  }
  registerPushTimer = setTimeout(() => {
    registerPushTimer = null
    registerPushClient().catch(() => {})
  }, delayMs)
  // 再补一次，覆盖晚到的 CID
  setTimeout(() => {
    registerPushClient().catch(() => {})
  }, delayMs + 2500)
}

/** 退出登录：解绑当前设备 CID */
export async function unregisterPushClient() {
  const cid = readCachedClientId()
  try {
    await api.unregisterPushToken(cid ? { clientId: cid } : {})
  } catch (e) {}
  try {
    uni.removeStorageSync(CID_KEY)
  } catch (e) {}
}

export function alertNewMessage(conv) {
  const prefs = getNotifyPrefs()
  if (!prefs.enabled) return
  if (isMutedConv(conv)) return

  const title = conv?.title || '新消息'
  const content = previewText(conv?.lastMsgPreview)
  const payload = {
    type: 'chat',
    convId: conv?.id,
    title: conv?.title || '聊天'
  }
  const notifyId = conv?.id != null ? Number(conv.id) : (Date.now() % 100000)
  createSystemNotification(title, content, payload, notifyId)
}

export function alertFriendNotify(type, payload) {
  const prefs = getNotifyPrefs()
  if (!prefs.enabled) return

  const name = payload?.nickname || payload?.account || '有人'
  let title = '好友通知'
  let content = '你有一条新的好友消息'
  if (type === 'friend_request') {
    title = '新的好友申请'
    content = name + ' 请求添加你为好友'
  } else if (type === 'friend_accepted') {
    title = '好友申请已通过'
    content = name + ' 已同意你的好友申请'
  }

  const data = { type, ...(payload || {}) }
  const notifyId = 900000 + (type === 'friend_request' ? 1 : 2)
  createSystemNotification(title, content, data, notifyId)
}

/** 处理 /user/queue/notify */
export function handleNotifyMessage(body) {
  if (!body || !body.type) return

  if (body.type === 'friend_request' || body.type === 'friend_accepted') {
    alertFriendNotify(body.type, body.payload || {})
    return
  }

  if (body.type !== 'conversation_updated') return
  const payload = body.payload
  if (!payload || payload.id == null) return

  const store = getStore()
  const prev = (store.state.conversations || []).find(c => Number(c.id) === Number(payload.id))
  const prevUnread = Number(prev?.unreadCount) || 0
  const nextUnread = Number(payload.unreadCount) || 0
  store.upsertConversation(payload)

  const activeId = store.state.activeChatId
  // 正在看该会话且 App 在前台时，不再弹系统通知
  if (appVisible && activeId != null && Number(activeId) === Number(payload.id)) {
    return
  }
  if (nextUnread <= prevUnread) return

  alertNewMessage(payload)
}

let installed = false

export function installNotifyListener() {
  if (installed) return
  installed = true
  installPushHandlers()
  requestNotifyPermission()
  consumePendingNotifyPayload()
  import('./ws.js').then(({ onWs }) => {
    onWs('notify', (body) => handleNotifyMessage(body))
  }).catch(() => {})
  const store = getStore()
  if (store.state.token) {
    scheduleRegisterPushClient(600)
  }
}

/** App 从后台回到前台时：补点通知点击跳转、续连 WS、刷新 CID */
export function onAppShowNotify() {
  consumePendingNotifyPayload()
  requestNotifyPermission()
  const store = getStore()
  if (store.state.token) {
    scheduleRegisterPushClient(400)
  }
}

export function totalUnread(conversations) {
  return (conversations || []).reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0)
}

export function applySortedConversations(list) {
  const store = getStore()
  store.setConversations(sortConversations(list || []))
}
