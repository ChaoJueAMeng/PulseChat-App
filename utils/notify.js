import { getStore } from '../store/index.js'
import { sortConversations } from './chat-settings.js'
import { api } from './request.js'
import { requestMainTab } from './tab-swipe.js'
import { reportCaught } from './error-report.js'

/**
 * UniPush 2.0：真机启用；模拟器（尤其 MuMu）个推会疯狂重试拖垮进程，自动跳过。
 * 前台：WebSocket + 本地系统通知。
 * 后台（进程存活）/离线：服务端 UniPush；切后台会清前台标记并断开 WS，避免「在线却弹不出通知」。
 */
function isLikelyEmulator() {
  try {
    const info = uni.getSystemInfoSync() || {}
    const hay = [
      info.model,
      info.brand,
      info.deviceModel,
      info.deviceBrand,
      info.system
    ].filter(Boolean).join(' ').toLowerCase()
    return /emulator|sdk_gphone|android sdk built for|genymotion|mumu|nox|ldplayer|bluestacks|leidian|xiaoyao|memu|vbox|virtualbox|tiantian|yeshen|雷电|夜神|逍遥/.test(hay)
  } catch (e) {
    return false
  }
}

function isUniPushEnabled() {
  if (typeof plus === 'undefined') return false
  try {
    if (plus.runtime && typeof plus.runtime.isAgreePrivacy === 'function' && !plus.runtime.isAgreePrivacy()) {
      return false
    }
  } catch (e) {
    reportCaught('notify.isUniPushEnabled', e, { level: 'debug' })
  }
  return !isLikelyEmulator()
}

const ENABLED_KEY = 'pc_notify_enabled'
const CID_KEY = 'pc_push_client_id'
const CHANNEL_ID = 'pulse_chat_messages'
const CHANNEL_NAME = '消息通知'

let appVisible = true
let lastBecameVisibleAt = 0
/** 回前台后短窗口内，个推离线库批量透传不要逐条弹系统通知 */
const RESUME_PUSH_COALESCE_MS = 2800
let resumeBatchCount = 0
let resumeBatchTimer = null
let resumeBatchSample = null
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
  } catch (e) {
    reportCaught('notify.readFlag', e, { level: 'debug' })
  }
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
  const next = !!visible
  if (next && !appVisible) {
    lastBecameVisibleAt = Date.now()
    resumeBatchCount = 0
    resumeBatchSample = null
    if (resumeBatchTimer) {
      clearTimeout(resumeBatchTimer)
      resumeBatchTimer = null
    }
  }
  appVisible = next
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
  requestMainTab(1, { animated: false })
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

/** Android 系统层是否允许通知（权限关则本地/厂商推送都可能无栏） */
function areAndroidNotificationsEnabled() {
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return true
  try {
    const main = plus.android.runtimeMainActivity()
    const Context = plus.android.importClass('android.content.Context')
    const nm = main.getSystemService(Context.NOTIFICATION_SERVICE)
    plus.android.importClass(nm)
    if (typeof nm.areNotificationsEnabled === 'function') {
      return !!nm.areNotificationsEnabled()
    }
  } catch (e) {
    reportCaught('notify.areAndroidNotificationsEnabled', e, { level: 'debug' })
  }
  return true
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
  if (!isUniPushEnabled()) return false
  // UniPush 2.0 推荐本地通知 API
  try {
    if (typeof uni !== 'undefined' && typeof uni.createPushMessage === 'function') {
      uni.createPushMessage({
        title: String(title || '脉冲'),
        content: String(content || ''),
        payload: withLocalMark(payload),
        sound: 'system',
        cover: false
      })
      return true
    }
  } catch (e) {
    reportCaught('notify.createPlusPushMessage', e, { level: 'debug' })
  }
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

  // Android：优先原生 Notification，稳定弹出系统通知栏（前台/后台均可）
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
  } catch (e) {
    reportCaught('notify.consumePendingNotifyPayload', e, { level: 'debug' })
  }
}

function normalizePushPayload(raw) {
  let payload = raw
  try {
    if (typeof payload === 'string') payload = JSON.parse(payload || '{}')
  } catch (e) {
    payload = {}
  }
  if (payload === 'LocalMSG') return null
  if (payload && typeof payload === 'object' && payload._pcLocal) return null
  return payload && typeof payload === 'object' ? payload : {}
}

function flushResumePushBatch() {
  if (resumeBatchTimer) {
    clearTimeout(resumeBatchTimer)
    resumeBatchTimer = null
  }
  const sample = resumeBatchSample
  const n = resumeBatchCount
  resumeBatchSample = null
  resumeBatchCount = 0
  if (!sample || n <= 0) return
  if (n === 1) {
    createSystemNotification(sample.title, sample.content, sample.data, sample.notifyId)
    return
  }
  createSystemNotification(
    '脉冲',
    '你有 ' + n + ' 条新消息',
    sample.data,
    sample.notifyId
  )
}

function shouldCoalesceResumePush() {
  if (!appVisible || lastBecameVisibleAt <= 0) return false
  return (Date.now() - lastBecameVisibleAt) < RESUME_PUSH_COALESCE_MS
}

function showIncomingPush(msg) {
  if (!msg) return
  const data = normalizePushPayload(msg.payload ?? msg.data?.payload ?? msg.data)
  if (data == null) return
  // 点击通知栏 / iOS aps 已由系统展示，不再重复创建
  if (msg.aps || msg.type === 'click') return
  const title = msg.title || msg.data?.title || data.title || '脉冲'
  const content = msg.content || msg.data?.content || data.content || '你有一条新消息'
  const notifyId = data.convId != null ? Number(data.convId) : (Date.now() % 100000)
  // 真正后台（进程仍醒、JS 能跑）：本地强制出栏；force_notification 未必对在线透传出栏
  // 刚回前台：个推离线库批量下发透传，合并成一条，避免「打开 App 一起弹」
  if (shouldCoalesceResumePush()) {
    resumeBatchCount += 1
    resumeBatchSample = { title, content, data, notifyId }
    if (!resumeBatchTimer) {
      resumeBatchTimer = setTimeout(() => {
        resumeBatchTimer = null
        flushResumePushBatch()
      }, 450)
    }
    return
  }
  createSystemNotification(title, content, data, notifyId)
}

function installPushHandlers() {
  if (!isUniPushEnabled()) return
  if (pushHandlersInstalled) return
  if (typeof plus === 'undefined') return
  pushHandlersInstalled = true

  // UniPush 2.0 推荐 API
  try {
    if (typeof uni !== 'undefined' && typeof uni.onPushMessage === 'function') {
      uni.onPushMessage((res) => {
        if (!res) return
        if (res.type === 'click') {
          const data = res.data || {}
          handleNotifyPayload(data.payload != null ? data.payload : data)
          return
        }
        if (res.type === 'receive') {
          showIncomingPush({
            title: res.data?.title,
            content: res.data?.content,
            payload: res.data?.payload != null ? res.data.payload : res.data,
            aps: res.data?.aps
          })
        }
      })
    }
  } catch (e) {
    reportCaught('notify.installPushListeners.onPushMessage', e, { level: 'debug' })
  }

  try {
    if (plus.push && typeof plus.push.setAutoNotification === 'function') {
      plus.push.setAutoNotification(true)
    }
  } catch (e) {
    reportCaught('notify.installPushListeners.setAutoNotification', e, { level: 'debug' })
  }
  try {
    if (plus.push) {
      plus.push.addEventListener('click', (msg) => {
        handleNotifyPayload(msg?.payload)
      }, false)
    }
  } catch (e) {
    reportCaught('notify.installPushListeners.click', e, { level: 'debug' })
  }
  // 云端透传推送：未自动展示时转为系统通知（本地消息带 _pcLocal，直接忽略）
  try {
    if (plus.push) {
      plus.push.addEventListener('receive', (msg) => {
        showIncomingPush(msg)
      }, false)
    }
  } catch (e) {
    reportCaught('notify.installPushListeners.receive', e, { level: 'debug' })
  }
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
      // 系统通知总开关关闭时，本地 Notification / 厂商通道都可能无栏
      if (!areAndroidNotificationsEnabled()) {
        try {
          console.warn('[notify] Android 通知权限未开启，系统通知栏将无法展示')
        } catch (e) {
          reportCaught('notify.requestNotifyPermission.warn', e, { level: 'debug' })
        }
      }
      return
    }
  } catch (e) {
    reportCaught('notify.requestNotifyPermission.android', e, { level: 'debug' })
  }
  // iOS：触发系统通知授权弹窗（同时可拿到 CID）
  if (!isUniPushEnabled()) return
  try {
    resolvePushClientId().catch(() => {})
  } catch (e) {
    reportCaught('notify.requestNotifyPermission.ios', e, { level: 'debug' })
  }
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
  } catch (e) {
    reportCaught('notify.detectPlatform', e, { level: 'debug' })
  }
  return undefined
}

function cacheClientId(cid) {
  if (!cid) return
  try {
    uni.setStorageSync(CID_KEY, String(cid))
  } catch (e) {
    reportCaught('notify.cacheClientId', e, { level: 'debug' })
  }
}

function readCachedClientId() {
  try {
    const v = uni.getStorageSync(CID_KEY)
    return v ? String(v) : ''
  } catch (e) {
    return ''
  }
}

/** 单次尝试获取 UniPush / 个推 CID */
function tryResolvePushClientIdOnce() {
  if (!isUniPushEnabled()) return Promise.resolve('')
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
    } catch (e) {
    reportCaught('notify.finish', e, { level: 'debug' })
  }
    tryPlusClientId(finish)
  })
}

/** 获取 CID；个推初始化较慢时短轮询，避免登录后立刻上报为空 */
export async function resolvePushClientId() {
  if (!isUniPushEnabled()) return ''
  const delays = [0, 800, 2000, 4000, 8000]
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await new Promise((r) => setTimeout(r, delays[i]))
    }
    const cid = await tryResolvePushClientIdOnce()
    if (cid) return cid
  }
  return readCachedClientId() || ''
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
  } catch (e) {
    reportCaught('notify.tryPlusClientId', e, { level: 'debug' })
  }
  finish('')
}

/** 登录后 / App 启动：上报 CID 供离线推送 */
export async function registerPushClient() {
  if (!isUniPushEnabled()) return ''
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

/** 延迟重试：自定义基座 / 正式包上 CID 常延迟就绪（曾出现登录后 1 分钟才有 CID） */
export function scheduleRegisterPushClient(delayMs = 800) {
  if (!isUniPushEnabled()) return
  if (registerPushTimer) {
    clearTimeout(registerPushTimer)
    registerPushTimer = null
  }
  const delays = [delayMs, delayMs + 2500, delayMs + 8000, delayMs + 20000]
  registerPushTimer = setTimeout(() => {
    registerPushTimer = null
    registerPushClient().catch(() => {})
  }, delays[0])
  for (let i = 1; i < delays.length; i++) {
    setTimeout(() => {
      registerPushClient().catch(() => {})
    }, delays[i])
  }
}

/** 退出登录：解绑当前设备 CID */
export async function unregisterPushClient() {
  const cid = readCachedClientId()
  try {
    await api.unregisterPushToken(cid ? { clientId: cid } : {})
  } catch (e) {
    reportCaught('notify.unregisterPushClient', e)
  }
  try {
    uni.removeStorageSync(CID_KEY)
  } catch (e) {
    reportCaught('notify.unregisterPushClient', e)
  }
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

  if (body.type !== 'conversation_updated') {
    if (body.type === 'conversation_cleared') {
      const payload = body.payload || {}
      const conv = payload.conversation
      const id = payload.conversationId != null ? payload.conversationId : conv?.id
      if (id == null) return
      const store = getStore()
      if (conv) {
        store.upsertConversation({
          ...conv,
          lastMsgId: null,
          lastMsgPreview: '',
          lastMsgAt: null,
          unreadCount: 0,
          aiStreaming: false,
          aiStreamClientMsgId: null,
          aiStreamContent: ''
        })
      } else {
        store.upsertConversation({
          id,
          lastMsgId: null,
          lastMsgPreview: '',
          lastMsgAt: null,
          unreadCount: 0
        })
      }
      return
    }
    return
  }
  const payload = body.payload
  if (!payload || payload.id == null) return

  const store = getStore()
  const prev = (store.state.conversations || []).find(c => Number(c.id) === Number(payload.id))
  const prevUnread = Number(prev?.unreadCount) || 0
  const activeId = store.state.activeChatId
  const viewing = appVisible && activeId != null && Number(activeId) === Number(payload.id)
  // 正在看该会话，或本地已读水位已覆盖最新消息时，忽略迟到的未读增量
  // （@Kimi / AI 落库会先推 unread>0，随后 markRead 才清零，否则回列表仍留红点）
  let nextPayload = payload
  if (viewing) {
    const lastMsgId = Number(payload.lastMsgId) || 0
    if (lastMsgId > 0) store.markConversationReadLocal(payload.id, lastMsgId)
    nextPayload = { ...payload, unreadCount: 0 }
  } else if (store.isReadUpTo(payload.id, payload.lastMsgId) && (Number(payload.unreadCount) || 0) > 0) {
    nextPayload = { ...payload, unreadCount: 0 }
  } else if ((Number(payload.unreadCount) || 0) === 0 && payload.lastMsgId) {
    // 已读回推：抬高本地水位，挡住更晚到达的未读推送
    store.markConversationReadLocal(payload.id, payload.lastMsgId)
  }
  const nextUnread = Number(nextPayload.unreadCount) || 0
  store.upsertConversation(nextPayload)

  // 正在看该会话且 App 在前台时，不再弹系统通知
  if (viewing) return
  if (nextUnread <= prevUnread) return

  alertNewMessage(nextPayload)
}

let installed = false

export function installNotifyListener() {
  if (installed) return
  try {
    if (typeof plus !== 'undefined' && plus.runtime && typeof plus.runtime.isAgreePrivacy === 'function' && !plus.runtime.isAgreePrivacy()) {
      return
    }
  } catch (e) {
    reportCaught('notify.installNotifyListener', e, { level: 'debug' })
  }
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
    // 无效 CID 被服务端清理后，回到前台必须重新 getPushClientId 并上报
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
