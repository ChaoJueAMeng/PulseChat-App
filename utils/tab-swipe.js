import { ref, onUnmounted } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'

/** 首页三个主 Tab：聊天 / 通讯录 / 我的（同壳轨道；后两者为兼容 redirect 桩） */
export const TAB_PATHS = [
  '/pages/chats/chats',
  '/pages/contacts/contacts',
  '/pages/mine/mine'
]
export const MAIN_TAB_PATH = TAB_PATHS[0]
export const TAB_COUNT = TAB_PATHS.length

/* —— 左右滑切页阈值（px / 比例 / 速度） —— */
export const TAB_SWIPE_MIN_DX = 48
export const TAB_SWIPE_MAX_DY_RATIO = 1
export const TAB_SWIPE_FLICK_MIN_DX = 28
export const TAB_SWIPE_FLICK_MIN_VX = 0.35

/** 轴锁定死区（px） */
export const SWIPE_AXIS_LOCK_PX = 10
/** 跟手位移系数 */
export const SWIPE_FOLLOW_FACTOR = 0.92
/** settle 提交比例（相对一屏宽 / 侧栏宽） */
export const SWIPE_COMMIT_RATIO = 0.35
export const DRAWER_WIDTH_RATIO = 0.78
export const SWIPE_SCREEN_COMMIT_RATIO = SWIPE_COMMIT_RATIO * DRAWER_WIDTH_RATIO
/** 旧 leave 跟手上限（会话页等仍可能引用） */
export const SWIPE_FOLLOW_MAX_RATIO = 0.26
export const SWIPE_VX_SAMPLE_MS = 48
export const SWIPE_EASING_ENTER = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const SWIPE_EASING_LEAVE = 'cubic-bezier(0.4, 0, 1, 1)'
export const SWIPE_EASING_CANCEL = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

export const TAB_SWIPE_LEAVE_MS = 160
export const TAB_SWIPE_ENTER_MS = 260
/** 轨道 settle 时长 */
export const TAB_TRACK_SETTLE_MS = 280
/** 边界橡皮筋阻尼 */
export const TAB_TRACK_RUBBER = 0.32

const raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame.bind(typeof window !== 'undefined' ? window : globalThis)
  : (cb) => setTimeout(cb, 16)
const caf = typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame.bind(typeof window !== 'undefined' ? window : globalThis)
  : (id) => clearTimeout(id)

/**
 * 首段位移超过死区后锁轴；平手归纵向，避免抢列表滚动。
 * @returns {''|'h'|'v'}
 */
export function resolveSwipeAxis(absX, absY, lockPx = SWIPE_AXIS_LOCK_PX) {
  if (absX < lockPx && absY < lockPx) return ''
  return absX > absY ? 'h' : 'v'
}

export function tryPreventTouchScroll(e) {
  try {
    if (typeof e?.preventDefault === 'function') e.preventDefault()
    if (typeof e?.stopPropagation === 'function') e.stopPropagation()
  } catch (err) { /* App 部分端无 preventDefault */ }
}

/**
 * @param {{ absX: number, vx: number, followAbs?: number, followMax?: number, minDx?: number, flickMinDx?: number, flickMinVx?: number, commitRatio?: number }} p
 */
export function shouldCommitHorizontalSwipe(p = {}) {
  const absX = Math.abs(p.absX || 0)
  const vx = Math.max(0, p.vx || 0)
  const minDx = p.minDx ?? TAB_SWIPE_MIN_DX
  const flickMinDx = p.flickMinDx ?? TAB_SWIPE_FLICK_MIN_DX
  const flickMinVx = p.flickMinVx ?? TAB_SWIPE_FLICK_MIN_VX
  const commitRatio = p.commitRatio ?? SWIPE_COMMIT_RATIO
  const isFull = absX >= minDx
  const isFlick = absX >= flickMinDx && vx >= flickMinVx
  const followMax = p.followMax || 0
  const followAbs = Math.abs(p.followAbs || 0)
  const isRatio = followMax > 0 && followAbs > followMax * commitRatio
  return isFull || isFlick || isRatio
}

/**
 * @param {(payload: any) => void} apply
 */
export function createRafBatch(apply) {
  let id = null
  let pending = null
  return {
    queue(payload) {
      pending = payload
      if (id != null) return
      id = raf(() => {
        id = null
        const p = pending
        pending = null
        if (p != null) apply(p)
      })
    },
    flush() {
      if (id != null) {
        caf(id)
        id = null
      }
      if (pending == null) return
      const p = pending
      pending = null
      apply(p)
    },
    cancel() {
      if (id != null) {
        caf(id)
        id = null
      }
      pending = null
    },
    get pending() {
      return pending
    }
  }
}

function getWindowWidthCached(cache) {
  if (cache.value > 0) return cache.value
  try {
    cache.value = uni.getSystemInfoSync().windowWidth || 375
  } catch (e) {
    cache.value = 375
  }
  return cache.value
}

/** 最近一次主 Tab 切页时间；供子页推迟重活 */
let lastTabSwitchAt = 0

export function runAfterTabEnter(fn, delayMs = 80) {
  if (typeof fn !== 'function') return
  if (!lastTabSwitchAt) {
    fn()
    return
  }
  const wait = Math.max(0, lastTabSwitchAt + delayMs - Date.now())
  if (wait <= 0) fn()
  else setTimeout(fn, wait)
}

/** 外部（通知 / 桩页）请求切到某主 Tab；壳未挂载时写入 pending */
let pendingMainTab = -1
/** @type {{ goTo: (index: number, opts?: object) => void, getIndex: () => number } | null} */
let mainTabController = null

export function registerMainTabController(ctrl) {
  mainTabController = ctrl || null
}

export function unregisterMainTabController(ctrl) {
  if (!ctrl || mainTabController === ctrl) mainTabController = null
}

export function setPendingMainTab(index) {
  if (index < 0 || index >= TAB_COUNT) return
  pendingMainTab = index
}

export function consumePendingMainTab() {
  const i = pendingMainTab
  pendingMainTab = -1
  return i
}

/**
 * 切到主壳某 Tab（同壳跟手轨道；若不在消息壳顶层则 switchTab 回壳）
 * @param {number} toIndex
 * @param {{ animated?: boolean }} [opts]
 */
export function requestMainTab(toIndex, opts = {}) {
  if (toIndex < 0 || toIndex >= TAB_COUNT) return
  lastTabSwitchAt = Date.now()

  let onMainShell = false
  try {
    const pages = getCurrentPages()
    const route = String(pages[pages.length - 1]?.route || '')
    onMainShell = /pages\/chats\/chats$/.test(route)
  } catch (e) {
    onMainShell = false
  }

  if (onMainShell && mainTabController) {
    pendingMainTab = -1
    mainTabController.goTo(toIndex, opts)
    return
  }

  pendingMainTab = toIndex
  uni.switchTab({
    url: MAIN_TAB_PATH,
    fail: () => {}
  })
}

/**
 * 兼容旧 API：底部栏 / 侧栏入口
 * @param {number} _fromIndex
 * @param {number} toIndex
 */
export async function switchTabAnimated(_fromIndex, toIndex) {
  requestMainTab(toIndex, { animated: true })
}

/**
 * 将 contacts / mine 桩页立刻落到主壳对应 index
 * @param {number} index
 */
export function redirectStubToMainTab(index) {
  setPendingMainTab(index)
  // 桩页自身不是壳：必须 switchTab 回消息壳（即使 controller 仍因 Tab 保活而存在）
  uni.switchTab({
    url: MAIN_TAB_PATH,
    complete: () => {
      if (!mainTabController) return
      const pending = consumePendingMainTab()
      if (pending >= 0) mainTabController.goTo(pending, { animated: false })
    }
  })
}

/**
 * 主壳三页横向轨道：跟手露出邻页 + settle 整页
 * @param {{
 *   tabIndex: import('vue').Ref<number>,
 *   shouldIgnore?: () => boolean,
 *   allowDx?: (dx: number) => boolean,
 *   onIndexChange?: (index: number) => void
 * }} options
 */
export function useMainTabTrack(options = {}) {
  const tabIndex = options.tabIndex
  const trackStyle = ref({})
  const windowWidthCache = { value: 0 }

  let trackX = 0
  let phase = '' // '' | 'follow' | 'settle'
  let settleTimer = null
  let paintedTransform = ''
  let paintedTransition = ''

  const followBatch = createRafBatch((x) => {
    trackX = x
    phase = 'follow'
    paint(true)
  })

  function windowWidth() {
    return getWindowWidthCached(windowWidthCache)
  }

  function settledX(index) {
    return -index * windowWidth()
  }

  function paint(force = false) {
    const transform = `translate3d(${Math.round(trackX * 2) / 2}px,0,0)`
    let transition = 'none'
    let willChange = 'auto'
    if (phase === 'follow') {
      transition = 'none'
      willChange = 'transform'
    } else if (phase === 'settle') {
      transition = `transform ${TAB_TRACK_SETTLE_MS}ms ${SWIPE_EASING_ENTER}`
      willChange = 'transform'
    }
    if (
      !force
      && transform === paintedTransform
      && transition === paintedTransition
    ) {
      return
    }
    paintedTransform = transform
    paintedTransition = transition
    trackStyle.value = { transform, transition, willChange }
  }

  function clearSettleTimer() {
    if (!settleTimer) return
    clearTimeout(settleTimer)
    settleTimer = null
  }

  function snapToIndex(index, animated) {
    const next = Math.max(0, Math.min(TAB_COUNT - 1, index))
    const target = settledX(next)
    clearSettleTimer()
    followBatch.cancel()
    const prev = tabIndex.value
    if (next !== prev) {
      lastTabSwitchAt = Date.now()
      tabIndex.value = next
      if (typeof options.onIndexChange === 'function') {
        options.onIndexChange(next)
      }
    }
    if (!animated || Math.abs(trackX - target) < 0.5) {
      trackX = target
      phase = ''
      paint(true)
      return
    }
    // 先钉住当前帧，再开 transition
    phase = 'follow'
    paint(true)
    raf(() => {
      trackX = target
      phase = 'settle'
      paint(true)
      settleTimer = setTimeout(() => {
        settleTimer = null
        trackX = target
        phase = ''
        paint(true)
      }, TAB_TRACK_SETTLE_MS + 24)
    })
  }

  function goTo(index, opts = {}) {
    const animated = opts.animated !== false
    snapToIndex(index, animated)
  }

  function applyRubber(x) {
    const w = windowWidth()
    const min = -(TAB_COUNT - 1) * w
    const max = 0
    if (x > max) return max + (x - max) * TAB_TRACK_RUBBER
    if (x < min) return min + (x - min) * TAB_TRACK_RUBBER
    return x
  }

  function cancelFollow() {
    followBatch.cancel()
    if (phase === 'follow') {
      snapToIndex(tabIndex.value, true)
    }
  }

  // —— 手势 ——
  let startX = 0
  let startY = 0
  let startAt = 0
  let baseX = 0
  let tracking = false
  let axis = ''
  let followActive = false
  let sampleX = 0
  let sampleAt = 0
  let recentVx = 0
  let lastStartStamp = -1
  let lastMoveStamp = -1
  let lastEndStamp = -1

  function shouldIgnore() {
    return typeof options.shouldIgnore === 'function' && options.shouldIgnore()
  }

  function pickTouch(e) {
    return e?.changedTouches?.[0] || e?.touches?.[0] || null
  }

  function point(t) {
    return {
      x: t.clientX ?? t.pageX ?? 0,
      y: t.clientY ?? t.pageY ?? 0
    }
  }

  function eventStamp(e) {
    const s = e?.timeStamp
    return typeof s === 'number' && s > 0 ? s : -1
  }

  function noteSample(x) {
    const now = Date.now()
    const dt = now - sampleAt
    if (dt > 0 && dt <= SWIPE_VX_SAMPLE_MS * 3) {
      recentVx = Math.abs(x - sampleX) / dt
    }
    sampleX = x
    sampleAt = now
  }

  function onTouchStart(e) {
    const stamp = eventStamp(e)
    if (stamp >= 0 && stamp === lastStartStamp) return
    if (stamp >= 0) lastStartStamp = stamp
    if (shouldIgnore()) return
    const t = pickTouch(e)
    if (!t) return
    // settle 中允许打断
    clearSettleTimer()
    followBatch.cancel()
    const p = point(t)
    startX = p.x
    startY = p.y
    startAt = Date.now()
    sampleX = p.x
    sampleAt = startAt
    recentVx = 0
    tracking = true
    axis = ''
    followActive = false
    baseX = settledX(tabIndex.value)
    // 若仍在半途，以当前视觉位置为基线
    if (phase === 'follow' || phase === 'settle') {
      baseX = trackX
    }
    lastMoveStamp = -1
    lastEndStamp = -1
  }

  function onTouchMove(e) {
    if (!tracking) return
    const stamp = eventStamp(e)
    if (stamp >= 0 && stamp === lastMoveStamp) return
    if (stamp >= 0) lastMoveStamp = stamp
    if (shouldIgnore() && axis !== 'h' && !followActive) {
      tracking = false
      cancelFollow()
      return
    }
    const t = pickTouch(e)
    if (!t) return
    const p = point(t)
    const dx = p.x - startX
    const dy = p.y - startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    if (!axis) {
      axis = resolveSwipeAxis(absX, absY)
      if (!axis) return
      if (axis === 'v') return
    }
    if (axis !== 'h') return

    tryPreventTouchScroll(e)

    if (typeof options.allowDx === 'function' && !options.allowDx(dx)) {
      if (followActive) cancelFollow()
      return
    }

    noteSample(p.x)
    const next = applyRubber(baseX + dx * SWIPE_FOLLOW_FACTOR)
    followActive = true
    followBatch.queue(next)
  }

  function onTouchEnd(e) {
    const stamp = eventStamp(e)
    if (stamp >= 0 && stamp === lastEndStamp) return
    if (stamp >= 0) lastEndStamp = stamp
    if (!tracking) {
      if (followActive || phase === 'follow') cancelFollow()
      return
    }
    const lockedH = axis === 'h' || followActive
    tracking = false
    if (shouldIgnore() && !lockedH) {
      cancelFollow()
      return
    }
    if (axis === 'v') {
      cancelFollow()
      return
    }

    followBatch.flush()
    const t = pickTouch(e)
    if (!t) {
      cancelFollow()
      return
    }
    const p = point(t)
    const dx = p.x - startX
    const absX = Math.abs(dx)
    const elapsed = Math.max(Date.now() - startAt, 1)
    const avgVx = absX / elapsed
    const vx = Math.max(avgVx, recentVx)

    if (typeof options.allowDx === 'function' && !options.allowDx(dx)) {
      cancelFollow()
      return
    }

    if (!lockedH) {
      const dy = p.y - startY
      if (resolveSwipeAxis(absX, Math.abs(dy)) !== 'h') {
        cancelFollow()
        return
      }
    }

    const w = windowWidth()
    const delta = trackX - settledX(tabIndex.value)
    if (!shouldCommitHorizontalSwipe({
      absX,
      vx,
      followAbs: followActive ? Math.abs(delta) : 0,
      followMax: followActive ? w : 0
    })) {
      cancelFollow()
      return
    }

    let next = tabIndex.value
    const isFlick = absX >= TAB_SWIPE_FLICK_MIN_DX && vx >= TAB_SWIPE_FLICK_MIN_VX
    if (isFlick) {
      next = dx < 0
        ? Math.min(TAB_COUNT - 1, tabIndex.value + 1)
        : Math.max(0, tabIndex.value - 1)
    } else if (delta < -w * SWIPE_COMMIT_RATIO) {
      next = Math.min(TAB_COUNT - 1, tabIndex.value + 1)
    } else if (delta > w * SWIPE_COMMIT_RATIO) {
      next = Math.max(0, tabIndex.value - 1)
    }

    followActive = false
    snapToIndex(next, true)
  }

  function onTouchCancel() {
    tracking = false
    axis = ''
    followActive = false
    cancelFollow()
  }

  const controller = {
    goTo,
    getIndex: () => tabIndex.value,
    cancelFollow,
    get following() {
      return followActive || phase === 'follow'
    },
    get axis() {
      return axis
    }
  }

  registerMainTabController(controller)

  // 初始钉到当前 index
  trackX = settledX(tabIndex.value)
  phase = ''
  paint(true)

  onShow(() => {
    registerMainTabController(controller)
    const pending = consumePendingMainTab()
    if (pending >= 0 && pending !== tabIndex.value) {
      goTo(pending, { animated: false })
    } else {
      // 从子页返回时校正宽度变化
      trackX = settledX(tabIndex.value)
      phase = ''
      paint(true)
    }
  })

  onHide(() => {
    // 壳隐藏时仍保留 controller，便于桩页 redirect；完全卸载时再清
  })

  onUnmounted(() => {
    clearSettleTimer()
    followBatch.cancel()
    unregisterMainTabController(controller)
  })

  return {
    trackStyle,
    goTo,
    cancelTrackFollow: cancelFollow,
    isTrackFollowing: () => followActive || phase === 'follow',
    getTrackAxis: () => axis,
    onTrackSwipeStart: onTouchStart,
    onTrackSwipeMove: onTouchMove,
    onTrackSwipeEnd: onTouchEnd,
    onTrackSwipeCancel: onTouchCancel
  }
}

/**
 * @deprecated 旧 leave/enter 切页已废弃；保留空实现以免误引用崩溃
 */
export function useTabPageTransition() {
  return {
    tabAnimClass: ref(''),
    tabFollowStyle: ref({}),
    onTabSwipeStart() {},
    onTabSwipeMove() {},
    onTabSwipeEnd() {},
    onTabSwipeCancel() {}
  }
}

/**
 * @deprecated 请用 useMainTabTrack
 */
export function createTabSwipe() {
  return {
    onTabSwipeStart() {},
    onTabSwipeMove() {},
    onTabSwipeEnd() {},
    onTabSwipeCancel() {}
  }
}
