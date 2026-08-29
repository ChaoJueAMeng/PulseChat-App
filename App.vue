<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { getStore } from './store/index.js'
import { connectWs, ensureWs, pauseWsForBackground, notifyAppForeground } from './utils/ws.js'
import { installFeedback } from './utils/feedback.js'
import { installNotifyListener, onAppShowNotify, scheduleRegisterPushClient, setAppVisible } from './utils/notify.js'
import { api } from './utils/request.js'

/** 与后端 pulsechat.push.foreground-debounce-ms 对齐：away 后短时不标前台，避免漏推 */
const PRESENCE_ACTIVE_DEBOUNCE_MS = 2500
/** 多等一点，避免请求到达时仍差几毫秒被服务端 debounce 拒绝，导致真前台却长期无 fg */
const PRESENCE_ACTIVE_SERVER_BUFFER_MS = 350
let lastHideAt = 0
let presenceActiveTimer = null

/** template 隐私弹窗同意后才会进入业务；再兜底一次，避免误触发推送 SDK */
function isPrivacyAgreed() {
  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.runtime && typeof plus.runtime.isAgreePrivacy === 'function') {
      return !!plus.runtime.isAgreePrivacy()
    }
  } catch (e) {}
  // #endif
  return true
}

function clearPresenceActiveTimer() {
  if (presenceActiveTimer) {
    clearTimeout(presenceActiveTimer)
    presenceActiveTimer = null
  }
}

/** 回到前台：立刻续连 WS；前台标记可延迟，避免 hide/show 抖动漏掉 UniPush */
function markPresenceActiveSoon() {
  clearPresenceActiveTimer()
  const store = getStore()
  if (!store.state.token) return
  ensureWs()
  const elapsed = lastHideAt > 0 ? Date.now() - lastHideAt : PRESENCE_ACTIVE_DEBOUNCE_MS
  const delay = elapsed < PRESENCE_ACTIVE_DEBOUNCE_MS
    ? (PRESENCE_ACTIVE_DEBOUNCE_MS - elapsed + PRESENCE_ACTIVE_SERVER_BUFFER_MS)
    : 0
  const run = () => {
    presenceActiveTimer = null
    api.presenceActive().catch(() => {})
    setTimeout(() => {
      if (store.state.connected) notifyAppForeground()
    }, 400)
  }
  if (delay > 0) {
    presenceActiveTimer = setTimeout(run, delay)
  } else {
    run()
  }
}

async function bootstrapApp() {
  if (!isPrivacyAgreed()) return
  installFeedback()
  installNotifyListener()
  setAppVisible(true)
  const store = getStore()
  store.hydrate()
  if (store.state.token) {
    connectWs(store.state.token)
    scheduleRegisterPushClient(800)
    try {
      await store.fetchConversations(() => api.conversations())
    } catch (e) {}
  }
  try { uni.hideTabBar({ animation: false }) } catch (e) {}
}

/** App 端关闭 WebView 边缘回弹，避免非必要区域下拉整页拉伸 */
function disableCurrentWebviewBounce() {
  // #ifdef APP-PLUS
  try {
    const pages = getCurrentPages()
    const page = pages && pages.length ? pages[pages.length - 1] : null
    const wv = page && typeof page.$getAppWebview === 'function'
      ? page.$getAppWebview()
      : (typeof plus !== 'undefined' ? plus.webview.currentWebview() : null)
    if (wv && typeof wv.setStyle === 'function') {
      wv.setStyle({ bounce: 'none' })
    }
  } catch (e) {}
  // #endif
}

function scheduleDisableBounce() {
  // #ifdef APP-PLUS
  setTimeout(disableCurrentWebviewBounce, 30)
  setTimeout(disableCurrentWebviewBounce, 180)
  // #endif
}

function installBounceGuard() {
  // #ifdef APP-PLUS
  ;['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack'].forEach((method) => {
    try {
      uni.addInterceptor(method, {
        success: scheduleDisableBounce,
        complete: scheduleDisableBounce
      })
    } catch (e) {}
  })
  // #endif
}

onLaunch(() => {
  installBounceGuard()
  bootstrapApp()
  scheduleDisableBounce()
})

onShow(() => {
  if (!isPrivacyAgreed()) return
  setAppVisible(true)
  onAppShowNotify()
  scheduleDisableBounce()
  markPresenceActiveSoon()
})

onHide(() => {
  clearPresenceActiveTimer()
  lastHideAt = Date.now()
  setAppVisible(false)
  const store = getStore()
  if (!store.state.token) return
  // 1) HTTP 立刻清前台标记（切后台瞬间 WS/JS 可能已被挂起）
  // 2) 断开 WS，避免服务端仍判在线/前台而漏推 UniPush
  api.presenceAway().catch(() => {})
  pauseWsForBackground()
})
</script>

<style lang="scss">
@import './styles/theme.scss';

page {
  background: $pc-bg;
  color: $pc-text;
  font-family: 'Avenir Next', 'PingFang SC', 'SF Pro Display', 'Microsoft YaHei', sans-serif;
  min-height: 100%;
  /* 抑制非必要边缘过度滚动造成的整页拉伸（不继承到子滚动容器） */
  overscroll-behavior-y: none;
  overscroll-behavior-x: none;
}

/* 内部 scroll-view 允许自身边缘 overscroll，实现列表局部回弹 */
.uni-scroll-view,
.uni-scroll-view-content {
  overscroll-behavior-y: auto;
}

view, text {
  box-sizing: border-box;
}

.pc-btn {
  border: none;
  color: #fff;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(120deg, #7C3AED 0%, #A78BFA 42%, #F43F5E 100%);
  box-shadow: 0 8rpx 24rpx rgba(124, 58, 237, 0.28);
}

.pc-btn:active {
  opacity: 0.92;
}

/* 列表卡片用实色底，避免每行 backdrop-filter 造成滚动掉帧 */
.pc-card {
  background: rgba(28, 16, 48, 0.92);
  border: 1px solid rgba(167, 139, 250, 0.16);
  box-shadow: 0 8rpx 24rpx rgba(10, 6, 20, 0.28);
}
</style>
