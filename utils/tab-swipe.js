import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

/** 首页三个主 Tab：聊天 / 通讯录 / 我的 */
export const TAB_PATHS = [
  '/pages/chats/chats',
  '/pages/contacts/contacts',
  '/pages/mine/mine'
]

const MIN_DX = 72
/** |dy| 超过 |dx| 的该比例则视为纵向滑动，不切换 */
const MAX_DY_RATIO = 0.7
const LEAVE_MS = 180
const ENTER_MS = 300

let pendingEnterDir = '' // 'forward' | 'back'
let leaveHandler = null
let switching = false

function setLeaveHandler(fn) {
  leaveHandler = fn
}

/**
 * 带动画的 Tab 切换（滑动 / 点击底部栏共用）
 * @param {number} fromIndex
 * @param {number} toIndex
 */
export async function switchTabAnimated(fromIndex, toIndex) {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= TAB_PATHS.length) return
  if (switching) return
  switching = true

  const direction = toIndex > fromIndex ? 'forward' : 'back'
  pendingEnterDir = direction

  try {
    if (typeof leaveHandler === 'function') {
      await leaveHandler(direction)
    }
  } catch (e) {}

  await new Promise((resolve) => {
    uni.switchTab({
      url: TAB_PATHS[toIndex],
      complete: resolve,
      fail: resolve
    })
  })

  setTimeout(() => {
    switching = false
  }, ENTER_MS + 40)
}

/**
 * 主页挂载：切页动画 class + 左右滑手势
 * @param {number} currentIndex
 * @param {{ shouldIgnore?: () => boolean }} [options]
 */
export function useTabPageTransition(currentIndex, options = {}) {
  const tabAnimClass = ref('')
  let enterTimer = null
  let leaveTimer = null

  function clearTimers() {
    if (enterTimer) {
      clearTimeout(enterTimer)
      enterTimer = null
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = null
    }
  }

  function playLeave(direction) {
    clearTimers()
    tabAnimClass.value = direction === 'forward'
      ? 'pc-tab-leave-left'
      : 'pc-tab-leave-right'
    return new Promise((resolve) => {
      leaveTimer = setTimeout(() => {
        leaveTimer = null
        resolve()
      }, LEAVE_MS)
    })
  }

  function playEnter(direction) {
    clearTimers()
    tabAnimClass.value = direction === 'forward'
      ? 'pc-tab-enter-from-right'
      : 'pc-tab-enter-from-left'
    enterTimer = setTimeout(() => {
      tabAnimClass.value = ''
      enterTimer = null
    }, ENTER_MS)
  }

  onShow(() => {
    setLeaveHandler(playLeave)
    const dir = pendingEnterDir
    pendingEnterDir = ''
    if (dir) playEnter(dir)
    else tabAnimClass.value = ''
  })

  const swipe = createTabSwipe(currentIndex, {
    ...options,
    switchTo: (next) => switchTabAnimated(currentIndex, next)
  })

  return {
    tabAnimClass,
    onTabSwipeStart: swipe.onTabSwipeStart,
    onTabSwipeEnd: swipe.onTabSwipeEnd
  }
}

/**
 * 主页左右滑切换 Tab
 * @param {number} currentIndex 0 聊天 / 1 通讯录 / 2 我的
 * @param {{ shouldIgnore?: () => boolean, switchTo?: (next: number) => void }} [options]
 */
export function createTabSwipe(currentIndex, options = {}) {
  let startX = 0
  let startY = 0
  let tracking = false

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

  function onTouchStart(e) {
    if (shouldIgnore() || switching) return
    const t = pickTouch(e)
    if (!t) return
    const p = point(t)
    startX = p.x
    startY = p.y
    tracking = true
  }

  function onTouchEnd(e) {
    if (!tracking) return
    tracking = false
    if (shouldIgnore() || switching) return
    const t = pickTouch(e)
    if (!t) return
    const p = point(t)
    const dx = p.x - startX
    const dy = p.y - startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (absX < MIN_DX) return
    if (absY > absX * MAX_DY_RATIO) return

    let next = -1
    if (dx < 0 && currentIndex < TAB_PATHS.length - 1) next = currentIndex + 1
    else if (dx > 0 && currentIndex > 0) next = currentIndex - 1
    if (next < 0) return

    if (typeof options.switchTo === 'function') options.switchTo(next)
    else switchTabAnimated(currentIndex, next)
  }

  return {
    onTabSwipeStart: onTouchStart,
    onTabSwipeEnd: onTouchEnd
  }
}
