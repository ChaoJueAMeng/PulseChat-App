<template>
  <view class="chats-page">
    <!-- 右滑半屏侧栏：预挂载 + CSS 跟手 -->
    <view
      v-if="drawerMounted"
      class="drawer-layer"
      :style="drawerLayerStyle"
      @touchstart.stop="onDrawerTouchStart"
      @touchmove.stop="onDrawerTouchMove"
      @touchend.stop="onDrawerTouchEnd"
      @touchcancel.stop="onDrawerTouchCancel"
    >
      <pc-chats-drawer
        :user-name="userName"
        :avatar="userAvatar"
        @action="onDrawerAction"
      />
    </view>
    <view
      v-if="drawerMounted"
      class="drawer-scrim"
      :style="drawerScrimStyle"
      @tap="closeDrawer"
      @touchstart="onScrimTouchStart"
      @touchmove="onScrimTouchMove"
      @touchend="onScrimTouchEnd"
      @touchcancel="onScrimTouchCancel"
    />

    <view class="chats-main" :style="mainShiftStyle">
      <view class="tab-track-viewport">
        <view class="tab-track" :style="trackStyle">
          <!-- 0 消息 -->
          <view
            class="tab-pane"
            @touchstart="onChatsTouchStart"
            @touchmove="onChatsTouchMove"
            @touchend="onChatsTouchEnd"
            @touchcancel="onChatsTouchEnd"
          >
            <view class="chats pc-aurora">
              <view class="page-header pc-nav-bar pc-page-header--static" :style="headerStyle">
                <view class="top pc-enter">
                  <view class="top-row">
                    <text class="hello">Hey, {{ userName }}</text>
                    <view class="actions chats-plus-actions">
                      <view
                        class="icon-btn pc-press"
                        :class="{ active: showMenu }"
                        @tap.stop="toggleMenu"
                        @touchstart.stop="onPlusTouchStart"
                      >＋</view>
                    </view>
                  </view>
                  <view class="status-row">
                    <view class="pc-glow-dot" :style="{ background: connected ? '#A78BFA' : '#F43F5E' }"></view>
                    <text class="status">{{ connected ? '实时在线' : '重连中…' }}</text>
                  </view>
                </view>

                <view class="search-bar pc-card pc-enter" style="animation-delay: 0.06s">
                  <text class="search-icon">⌕</text>
                  <input
                    class="search-input"
                    v-model="searchKeyword"
                    placeholder="搜索聊天"
                    confirm-type="search"
                  />
                  <text v-if="searchKeyword" class="search-clear pc-press" @tap="searchKeyword = ''">×</text>
                </view>
              </view>

              <view class="list-wrap">
                <view
                  class="pc-refresher"
                  :class="{ 'is-dragging': isPulling, 'is-refreshing': refreshing }"
                  :style="refresherPanelStyle"
                >
                  <view class="pc-refresher__icon" :style="refresherSpinnerStyle">
                    <view class="pc-refresher__ring" :class="{ 'is-spinning': refreshing }"></view>
                    <view class="pc-refresher__dot"></view>
                  </view>
                </view>
                <scroll-view
                  scroll-y
                  class="list"
                  :bounces="true"
                  refresher-enabled
                  :refresher-triggered="refreshing"
                  :refresher-threshold="refresherThreshold"
                  refresher-default-style="none"
                  refresher-background="transparent"
                  @refresherrefresh="refresh"
                  @refresherpulling="onRefresherPulling"
                  @refresherrestore="onRefresherRestore"
                  @refresherabort="onRefresherRestore"
                  @touchstart.stop="onChatsTouchStart"
                  @touchmove.stop="onChatsTouchMove"
                  @touchend.stop="onListTouchEnd"
                  @touchcancel.stop="onListTouchEnd"
                >
                  <template v-if="loading && !list.length">
                    <view v-for="i in 6" :key="'sk-' + i" class="skeleton"></view>
                  </template>
                  <view v-else-if="!list.length" class="empty">
                    <text class="empty-title">还没有对话</text>
                    <text class="empty-sub">去通讯录加好友，或直接和 Kimi 聊聊</text>
                  </view>
                  <view v-else-if="!filteredList.length" class="empty">
                    <text class="empty-title">未找到相关会话</text>
                    <text class="empty-sub">试试其他关键词</text>
                  </view>
                  <template v-else>
                    <view
                      v-for="item in filteredList"
                      :key="item.id"
                      class="row pc-card pc-press"
                      @tap="openChat(item)"
                      @touchstart="onRowTouchStart(item, $event)"
                      @touchmove="onRowTouchMove"
                      @touchend="onRowTouchEnd"
                      @touchcancel="onRowTouchCancel"
                    >
                      <pc-avatar :url="item.avatar" :name="item.title" :size="96" :seed="item.id" :show-badge="showAiBadge(item)" />
                      <view class="meta">
                        <view class="line1">
                          <text class="title">{{ item.title }}</text>
                          <text v-if="isItemPinned(item)" class="pin-tag">置顶</text>
                          <text v-if="isItemMuted(item)" class="mute-tag">静音</text>
                          <text class="time">{{ formatTime(item.lastMsgAt) }}</text>
                        </view>
                        <view class="line2">
                          <text class="preview" :class="{ 'preview-draft': !!item.draftText }">{{ conversationPreview(item) }}</text>
                          <view v-if="item.unreadCount" class="badge">{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</view>
                        </view>
                      </view>
                    </view>
                  </template>
                </scroll-view>
              </view>
            </view>
          </view>

          <!-- 1 通讯录 -->
          <view class="tab-pane">
            <pc-tab-contacts
              :active="tabIndex === 1"
              @swipe-start="onTrackTouchStart"
              @swipe-move="onTrackTouchMove"
              @swipe-end="onTrackTouchEnd"
              @swipe-cancel="onTrackTouchCancel"
            />
          </view>

          <!-- 2 我的 -->
          <view class="tab-pane">
            <pc-tab-mine
              :active="tabIndex === 2"
              @swipe-start="onTrackTouchStart"
              @swipe-move="onTrackTouchMove"
              @swipe-end="onTrackTouchEnd"
              @swipe-cancel="onTrackTouchCancel"
            />
          </view>
        </view>
      </view>
      <!-- 无全屏遮罩：点 Tab 也关 + 菜单（同 Tab 不会改 tabIndex） -->
      <view @touchstart="dismissMenuOnOutside">
        <pc-tabbar :current="tabIndex" />
      </view>
    </view>

    <!-- 挂在主壳根节点：避免 tab-track / chats-main 的 transform + overflow 裁切 fixed 弹层；无遮罩，不挡底层操作 -->
    <view
      v-if="showMenu"
      class="menu-popover"
      :style="menuStyle"
      @tap.stop="stopMenuTouch"
      @touchstart.stop="stopMenuTouch"
      @touchmove.stop="stopMenuTouch"
    >
      <view class="menu-arrow"></view>
      <view
        v-for="item in menuItems"
        :key="item.key"
        class="menu-item pc-press"
        @tap="onMenuSelect(item.key)"
      >
        <text class="menu-icon">{{ item.icon }}</text>
        <text class="menu-label">{{ item.label }}</text>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, watch, getCurrentInstance } from 'vue'
import { onShow, onHide, onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { conversationPreview, sortConversations, isPinned, syncBackgroundFromDetail } from '../../utils/chat-settings.js'
import { handleRootBackPress } from '../../utils/quit.js'
import {
  useMainTabTrack,
  TAB_SWIPE_MIN_DX,
  TAB_SWIPE_FLICK_MIN_DX,
  TAB_SWIPE_FLICK_MIN_VX,
  TAB_SWIPE_LEAVE_MS,
  TAB_SWIPE_ENTER_MS,
  SWIPE_AXIS_LOCK_PX,
  SWIPE_FOLLOW_FACTOR,
  SWIPE_COMMIT_RATIO,
  DRAWER_WIDTH_RATIO as SHARED_DRAWER_WIDTH_RATIO,
  SWIPE_EASING_ENTER,
  SWIPE_EASING_LEAVE,
  resolveSwipeAxis,
  tryPreventTouchScroll,
  createRafBatch,
  requestMainTab,
  runAfterTabEnter
} from '../../utils/tab-swipe.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'
import PcChatsDrawer from '../../components/pc-chats-drawer/pc-chats-drawer.vue'
import PcTabContacts from '../../components/pc-tab-contacts/pc-tab-contacts.vue'
import PcTabMine from '../../components/pc-tab-mine/pc-tab-mine.vue'

onBackPress(() => {
  if (drawerOpen.value || drawerPhase.value === 'follow' || drawerPhase.value === 'open') {
    closeDrawer()
    return true
  }
  if (showMenu.value) {
    closeMenu()
    return true
  }
  if (tabIndex.value > 0) {
    goTo(0, { animated: true })
    return true
  }
  return handleRootBackPress()
})
const store = getStore()
/** 直接读 store，WS upsert 后列表即时刷新，避免本地 list 与 store 双份状态 */
const list = computed(() => store.state.conversations || [])
const loading = ref(false)
const refreshing = ref(false)
const pullDy = ref(0)
const isPulling = ref(false)
const refresherThreshold = 72
const REFRESHER_MAX_PX = 120
const REFRESHER_HOLD_PX = 56

function clampPullHeight(dy) {
  return Math.min(Math.max(dy || 0, 0), REFRESHER_MAX_PX)
}

const refresherPanelStyle = computed(() => {
  const h = refreshing.value ? REFRESHER_HOLD_PX : clampPullHeight(pullDy.value)
  return {
    height: h + 'px',
    opacity: h > 2 ? 1 : 0
  }
})

const refresherSpinnerStyle = computed(() => {
  const h = refreshing.value ? REFRESHER_HOLD_PX : clampPullHeight(pullDy.value)
  const progress = Math.min(h / refresherThreshold, 1)
  const scale = 0.55 + progress * 0.5
  const opacity = Math.min(0.35 + progress * 0.65, 1)
  if (refreshing.value) {
    return { opacity: 1, transform: 'scale(1)' }
  }
  const deg = progress * 270
  return {
    opacity,
    transform: `rotate(${deg}deg) scale(${scale})`
  }
})
const searchKeyword = ref('')
const showMenu = ref(false)
/** 主壳当前 Tab：0 消息 / 1 通讯录 / 2 我的 */
const tabIndex = ref(0)

/* —— 右滑半屏侧栏（仅消息页：右开侧栏 / 左切通讯录） —— */
const DRAWER_WIDTH_RATIO = SHARED_DRAWER_WIDTH_RATIO
const DRAWER_AXIS_LOCK_PX = SWIPE_AXIS_LOCK_PX
const DRAWER_FOLLOW_FACTOR = SWIPE_FOLLOW_FACTOR
const DRAWER_OPEN_RATIO = SWIPE_COMMIT_RATIO
const DRAWER_LEAVE_MS = TAB_SWIPE_LEAVE_MS
const DRAWER_ENTER_MS = TAB_SWIPE_ENTER_MS

const drawerMounted = ref(false)
const drawerOpen = ref(false)
/** 0=全关，drawerWidth=全开 */
const drawerReveal = ref(0)
/** '' | 'follow' | 'open' | 'close' */
const drawerPhase = ref('')
let drawerAnimTimer = null
let windowWidthCache = 0

let gestureStartX = 0
let gestureStartY = 0
let gestureStartAt = 0
let gestureTracking = false
let gestureAxis = ''
let gestureFromDrawer = false
/** 本轮手势已进入侧栏跟手（水平锁轴后），此后忽略下拉刷新打断 */
let gestureDrawerDrag = false
let gestureBaseReveal = 0
let menuDismissedByMove = false

/** 侧栏跟手：同帧合并写 reveal，减轻三层 computed 同步刷新 */
const drawerFollowBatch = createRafBatch((reveal) => {
  if (drawerPhase.value !== 'follow') drawerPhase.value = 'follow'
  if (drawerReveal.value !== reveal) drawerReveal.value = reveal
})

function isDrawerBusy() {
  return drawerOpen.value
    || drawerPhase.value === 'follow'
    || drawerPhase.value === 'open'
    || drawerPhase.value === 'close'
}

const {
  trackStyle,
  goTo,
  cancelTrackFollow,
  onTrackSwipeStart,
  onTrackSwipeMove,
  onTrackSwipeEnd,
  onTrackSwipeCancel
} = useMainTabTrack({
  tabIndex,
  shouldIgnore: () => isDrawerBusy() || refreshing.value || (isPulling.value && gestureAxis !== 'h'),
  // 消息页：右滑归侧栏，左滑才切轨道；其它页双向切轨
  allowDx: (dx) => (tabIndex.value === 0 ? dx < 0 : true),
  onIndexChange: (idx) => {
    if (idx !== 0 && (drawerOpen.value || drawerPhase.value === 'follow')) {
      closeDrawer(false)
    }
    if (idx === 0) {
      runAfterTabEnter(() => { load() })
    }
  }
})

function onTrackTouchStart(e) {
  if (tabIndex.value === 0) return
  onTrackSwipeStart(e)
}
function onTrackTouchMove(e) {
  if (tabIndex.value === 0) return
  onTrackSwipeMove(e)
}
function onTrackTouchEnd(e) {
  if (tabIndex.value === 0) return
  onTrackSwipeEnd(e)
}
function onTrackTouchCancel(e) {
  if (tabIndex.value === 0) return
  onTrackSwipeCancel(e)
}

watch(tabIndex, (idx) => {
  if (idx !== 0) closeMenu()
})

function getWindowWidth() {
  if (windowWidthCache > 0) return windowWidthCache
  try {
    windowWidthCache = uni.getSystemInfoSync().windowWidth || 375
  } catch (e) {
    windowWidthCache = 375
  }
  return windowWidthCache
}

function getDrawerWidth() {
  return Math.round(getWindowWidth() * DRAWER_WIDTH_RATIO)
}

function clearDrawerAnimTimer() {
  if (!drawerAnimTimer) return
  clearTimeout(drawerAnimTimer)
  drawerAnimTimer = null
}

function ensureDrawerMounted() {
  if (drawerMounted.value) return
  drawerMounted.value = true
  drawerReveal.value = 0
  drawerPhase.value = ''
  drawerOpen.value = false
}

const drawerLayerStyle = computed(() => {
  const w = getDrawerWidth()
  const x = drawerReveal.value - w
  const interactive = drawerOpen.value && drawerPhase.value !== 'close'
  const style = {
    width: w + 'px',
    transform: `translate3d(${x}px,0,0)`,
    pointerEvents: interactive ? 'auto' : 'none'
  }
  if (drawerPhase.value === 'follow') {
    style.transition = 'none'
  } else if (drawerPhase.value === 'open') {
    style.transition = `transform ${DRAWER_ENTER_MS}ms ${SWIPE_EASING_ENTER}`
  } else if (drawerPhase.value === 'close') {
    style.transition = `transform ${DRAWER_LEAVE_MS}ms ${SWIPE_EASING_LEAVE}`
  }
  return style
})

const drawerScrimStyle = computed(() => {
  const w = getDrawerWidth()
  const progress = w > 0 ? Math.min(1, Math.max(0, drawerReveal.value / w)) : 0
  const interactive = drawerOpen.value && drawerPhase.value !== 'close'
  const style = {
    opacity: progress * 0.42,
    pointerEvents: interactive ? 'auto' : 'none'
  }
  if (drawerPhase.value === 'follow') {
    style.transition = 'none'
  } else if (drawerPhase.value === 'open') {
    style.transition = `opacity ${DRAWER_ENTER_MS}ms ${SWIPE_EASING_ENTER}`
  } else if (drawerPhase.value === 'close') {
    style.transition = `opacity ${DRAWER_LEAVE_MS}ms ${SWIPE_EASING_LEAVE}`
  } else {
    style.transition = 'opacity 0.15s ease'
  }
  return style
})

const mainShiftStyle = computed(() => {
  const x = drawerReveal.value
  const style = {
    transform: `translate3d(${x}px,0,0)`
  }
  if (drawerPhase.value === 'follow') {
    style.transition = 'none'
  } else if (drawerPhase.value === 'open') {
    style.transition = `transform ${DRAWER_ENTER_MS}ms ${SWIPE_EASING_ENTER}`
  } else if (drawerPhase.value === 'close') {
    style.transition = `transform ${DRAWER_LEAVE_MS}ms ${SWIPE_EASING_LEAVE}`
  }
  return style
})

function pickTouchPoint(e) {
  const t = e?.changedTouches?.[0] || e?.touches?.[0] || null
  if (!t) return null
  const x = t.clientX ?? t.pageX
  const y = t.clientY ?? t.pageY
  if (x == null || y == null) return null
  return { x: Number(x), y: Number(y) }
}

function openDrawer(animated = true) {
  closeMenu()
  ensureDrawerMounted()
  clearDrawerAnimTimer()
  drawerFollowBatch.cancel()
  const w = getDrawerWidth()
  if (!animated) {
    drawerReveal.value = w
    drawerOpen.value = true
    drawerPhase.value = ''
    return
  }
  if (drawerReveal.value <= 0) drawerReveal.value = 0
  drawerOpen.value = true
  drawerPhase.value = 'open'
  drawerReveal.value = w
  drawerAnimTimer = setTimeout(() => {
    drawerAnimTimer = null
    drawerPhase.value = ''
  }, DRAWER_ENTER_MS + 20)
}

function closeDrawer(animated = true) {
  if (!drawerMounted.value) return
  if (!drawerOpen.value && drawerPhase.value !== 'follow' && drawerPhase.value !== 'open') return
  clearDrawerAnimTimer()
  drawerFollowBatch.flush()
  gestureTracking = false
  gestureDrawerDrag = false
  const useAnim = animated !== false
  if (!useAnim) {
    drawerReveal.value = 0
    drawerOpen.value = false
    drawerPhase.value = ''
    return
  }
  drawerPhase.value = 'close'
  drawerReveal.value = 0
  drawerAnimTimer = setTimeout(() => {
    drawerAnimTimer = null
    drawerOpen.value = false
    drawerPhase.value = ''
    drawerReveal.value = 0
  }, DRAWER_LEAVE_MS + 20)
}

function finishOpenDrawerFromSwipe() {
  clearDrawerAnimTimer()
  drawerFollowBatch.flush()
  gestureTracking = false
  gestureDrawerDrag = false
  drawerOpen.value = true
  drawerPhase.value = 'open'
  drawerReveal.value = getDrawerWidth()
  drawerAnimTimer = setTimeout(() => {
    drawerAnimTimer = null
    drawerPhase.value = ''
  }, DRAWER_ENTER_MS + 20)
}

function bounceDrawer(toOpen) {
  clearDrawerAnimTimer()
  drawerFollowBatch.flush()
  gestureTracking = false
  gestureDrawerDrag = false
  const w = getDrawerWidth()
  if (toOpen) {
    drawerOpen.value = true
    drawerPhase.value = 'open'
    drawerReveal.value = w
  } else {
    drawerPhase.value = 'close'
    drawerReveal.value = 0
  }
  drawerAnimTimer = setTimeout(() => {
    drawerAnimTimer = null
    if (!toOpen) drawerOpen.value = false
    drawerPhase.value = ''
  }, (toOpen ? DRAWER_ENTER_MS : DRAWER_LEAVE_MS) + 20)
}

function shouldIgnoreDrawerGesture() {
  return refreshing.value || isPulling.value
}

function settleDrawerFromReveal(preferOpen = false) {
  if (preferOpen) {
    bounceDrawer(true)
    return
  }
  const w = getDrawerWidth()
  bounceDrawer(drawerReveal.value > w * DRAWER_OPEN_RATIO)
}

function beginGesture(e, fromDrawer) {
  // 已在跟手中勿被二次 touchstart（父/子双绑定冒泡）重置起点，否则会卡在半开
  if (gestureTracking && gestureDrawerDrag) return

  if (shouldIgnoreDrawerGesture() && !gestureDrawerDrag) {
    gestureTracking = false
    gestureAxis = ''
    // 下拉进行中开新手势：清掉可能残留的 Tab 半跟手
    cancelTabFollowOnConflict()
    return
  }
  const p = pickTouchPoint(e)
  if (!p) return
  gestureStartX = p.x
  gestureStartY = p.y
  gestureStartAt = Date.now()
  gestureTracking = true
  gestureAxis = ''
  gestureDrawerDrag = false
  gestureFromDrawer = !!fromDrawer
  gestureBaseReveal = drawerReveal.value
  menuDismissedByMove = false

  if (!fromDrawer && !isDrawerBusy() && tabIndex.value === 0) {
    onTrackSwipeStart(e)
  }
}

/** 手势被下拉刷新等打断时：轨道跟手必须回弹，避免卡在半位移 */
function cancelTabFollowOnConflict() {
  cancelTrackFollow()
  onTrackSwipeCancel()
}

/** 松手/取消后兜底清下拉视觉（refresherrestore 偶发缺失） */
function schedulePullVisualCleanup() {
  if (refreshing.value) return
  if (!isPulling.value && pullDy.value <= 0) return
  setTimeout(() => {
    if (!refreshing.value) resetPullVisual()
  }, 80)
}

function moveGesture(e) {
  if (!gestureTracking) return
  // 已锁水平轴（侧栏跟手或 Tab 左滑）后，下拉 isPulling 不得掐断横向
  // 未锁轴时：若本帧水平已占优则先锁 h 再继续；否则打断并回弹，避免半跟手卡住
  if (shouldIgnoreDrawerGesture() && !gestureDrawerDrag && gestureAxis !== 'h') {
    const pProbe = pickTouchPoint(e)
    if (pProbe) {
      const dx0 = pProbe.x - gestureStartX
      const dy0 = pProbe.y - gestureStartY
      const locked = resolveSwipeAxis(Math.abs(dx0), Math.abs(dy0), DRAWER_AXIS_LOCK_PX)
      if (locked === 'h') {
        gestureAxis = 'h'
        // 抑制已出现的下拉视觉，避免后续 shouldIgnore 再抢
        if (isPulling.value) resetPullVisual()
      } else {
        gestureTracking = false
        gestureAxis = ''
        cancelTabFollowOnConflict()
        return
      }
    } else {
      gestureTracking = false
      gestureAxis = ''
      cancelTabFollowOnConflict()
      return
    }
  }
  const p = pickTouchPoint(e)
  if (!p) return
  const dx = p.x - gestureStartX
  const dy = p.y - gestureStartY
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  // 列表上滑动时关闭 + 弹窗
  if (showMenu.value && (absX >= 6 || absY >= 6) && !menuDismissedByMove) {
    menuDismissedByMove = true
    closeMenu()
  }

  if (!gestureAxis) {
    gestureAxis = resolveSwipeAxis(absX, absY, DRAWER_AXIS_LOCK_PX)
    if (!gestureAxis) return
    if (gestureAxis === 'v') {
      cancelTabFollowOnConflict()
      return
    }
  }
  if (gestureAxis !== 'h') return

  tryPreventTouchScroll(e)

  const w = getDrawerWidth()
  const closing = drawerOpen.value || gestureFromDrawer

  // 关闭态：左滑交给轨道跟手切页；右滑切入侧栏
  if (!closing && !gestureDrawerDrag && dx <= 0) {
    onTrackSwipeMove(e)
    return
  }

  // 右滑开侧栏时取消轨道跟手，避免两套 transform 叠加
  cancelTabFollowOnConflict()

  ensureDrawerMounted()
  gestureDrawerDrag = true

  // 跟手全程双向：可滑到全开/全关，松手再按阈值 settle（不再单向锁死）
  let next = gestureBaseReveal + dx * DRAWER_FOLLOW_FACTOR
  next = Math.max(0, Math.min(w, next))
  drawerFollowBatch.queue(next)
}

function endGesture(e) {
  drawerFollowBatch.flush()
  // 父/子均绑了 touchend 时第二次进来：若仍停在 follow，必须 settle，避免卡半开
  if (!gestureTracking) {
    if (drawerPhase.value === 'follow') settleDrawerFromReveal()
    // 此前因下拉打断已 tracking=false：仍须清掉可能残留的 Tab 跟手
    cancelTabFollowOnConflict()
    return
  }
  const wasTracking = gestureTracking
  const axis = gestureAxis
  const fromDrawer = gestureFromDrawer
  const wasDrawerDrag = gestureDrawerDrag
  const startX = gestureStartX
  const startAt = gestureStartAt
  const baseReveal = gestureBaseReveal
  gestureTracking = false
  gestureAxis = ''
  gestureDrawerDrag = false

  // 跟手态优先 settle；勿因 isPulling 提前 return 留下半开
  if (drawerPhase.value === 'follow' || wasDrawerDrag) {
    const w = getDrawerWidth()
    const p = pickTouchPoint(e)
    if (!p || axis === 'v') {
      settleDrawerFromReveal()
      return
    }
    const dx = p.x - startX
    const absX = Math.abs(dx)
    const elapsed = Math.max(Date.now() - startAt, 1)
    const vx = absX / elapsed
    const isFlick = absX >= TAB_SWIPE_FLICK_MIN_DX && vx >= TAB_SWIPE_FLICK_MIN_VX

    // 速度优先：快扫方向决定开/关；否则按露出比例
    if (isFlick) {
      if (dx > 0) {
        finishOpenDrawerFromSwipe()
        return
      }
      if (dx < 0) {
        closeDrawer()
        return
      }
    }
    bounceDrawer(drawerReveal.value > w * DRAWER_OPEN_RATIO || (drawerOpen.value && dx >= 0))
    return
  }

  // 未锁水平时与下拉互斥：松手回弹 Tab；已水平跟手则继续 settle
  if (shouldIgnoreDrawerGesture() && axis !== 'h') {
    cancelTabFollowOnConflict()
    return
  }

  const p = pickTouchPoint(e)
  if (!p || axis === 'v') {
    cancelTabFollowOnConflict()
    return
  }

  const dx = p.x - startX
  const absX = Math.abs(dx)
  const elapsed = Math.max(Date.now() - startAt, 1)
  const vx = absX / elapsed

  // 已锁水平则信任；未锁时再判一次，平手归纵向
  if (axis !== 'h') {
    const dy = p.y - gestureStartY
    if (resolveSwipeAxis(absX, Math.abs(dy), DRAWER_AXIS_LOCK_PX) !== 'h') {
      cancelTabFollowOnConflict()
      return
    }
  }

  const isFullSwipe = absX >= TAB_SWIPE_MIN_DX
  const isFlick = absX >= TAB_SWIPE_FLICK_MIN_DX && vx >= TAB_SWIPE_FLICK_MIN_VX
  const enough = isFullSwipe || isFlick

  // 侧栏已开但未进入 follow（短滑）：左滑关闭
  if ((drawerOpen.value || fromDrawer) && enough && dx < 0) {
    cancelTabFollowOnConflict()
    closeDrawer()
    return
  }

  // 未进入侧栏跟手：右滑轻扫也可打开；左滑交给 tab
  if (wasTracking && enough && dx > 0 && !drawerOpen.value && baseReveal <= 0) {
    cancelTabFollowOnConflict()
    ensureDrawerMounted()
    finishOpenDrawerFromSwipe()
    return
  }

  if (!isDrawerBusy()) {
    onTrackSwipeEnd(e)
  } else {
    cancelTabFollowOnConflict()
  }
}

/** 菜单外交互：关弹窗，不拦截底层手势（无全屏 scrim） */
function dismissMenuOnOutside() {
  if (showMenu.value) closeMenu()
}

function onChatsTouchStart(e) {
  // 非消息页不应走到这里；兜底交给轨道
  if (tabIndex.value !== 0) {
    onTrackSwipeStart(e)
    return
  }
  // 无遮罩时：点列表/空白即关弹窗，保持页面可交互
  dismissMenuOnOutside()
  beginGesture(e, false)
}

function onChatsTouchMove(e) {
  moveGesture(e)
}

function onChatsTouchEnd(e) {
  endGesture(e)
  schedulePullVisualCleanup()
}

function onListTouchEnd(e) {
  endGesture(e)
  // refresher 偶发不回调 restore 时清掉残留，避免后续下拉“僵住”
  schedulePullVisualCleanup()
}

function onDrawerTouchStart(e) {
  beginGesture(e, true)
}

function onDrawerTouchMove(e) {
  moveGesture(e)
}

function onDrawerTouchEnd(e) {
  endGesture(e)
}

function onDrawerTouchCancel() {
  drawerFollowBatch.cancel()
  gestureTracking = false
  gestureAxis = ''
  gestureDrawerDrag = false
  cancelTabFollowOnConflict()
  if (drawerPhase.value === 'follow') {
    settleDrawerFromReveal()
  }
}

function onScrimTouchStart(e) {
  beginGesture(e, true)
}

function onScrimTouchMove(e) {
  moveGesture(e)
}

function onScrimTouchEnd(e) {
  endGesture(e)
}

function onScrimTouchCancel() {
  onDrawerTouchCancel()
}

const menuStyle = ref({})
const sysInfo = uni.getSystemInfoSync()
const statusBarHeight = ref(sysInfo.statusBarHeight || 20)
const pageProxy = getCurrentInstance()?.proxy
let pullRaf = 0
let pendingPullDy = 0
let loadGen = 0

const headerStyle = computed(() => ({
  paddingTop: statusBarHeight.value + 'px'
}))

function updateMenuPosition(onReady) {
  const query = uni.createSelectorQuery()
  if (pageProxy) query.in(pageProxy)
  query
    .select('.chats-plus-actions')
    .boundingClientRect((rect) => {
      if (rect) {
        const { windowWidth } = uni.getSystemInfoSync()
        menuStyle.value = {
          top: `${rect.bottom + uni.upx2px(18)}px`,
          right: `${Math.max(windowWidth - rect.right, 0)}px`
        }
      }
      if (onReady) onReady()
    })
    .exec()
}

/** 拦截加号 touch，避免冒泡进 tab-pane 手势（否则同一次点击会先关再开，或跟手关掉弹层） */
function onPlusTouchStart() {}

function stopMenuTouch() {}

const menuItems = [
  { key: 'search', label: '加好友', icon: '⌕' },
  { key: 'group', label: '创建群聊', icon: '⊕' },
  { key: 'ai', label: '找 Kimi', icon: '✦' }
]

const userName = computed(() => store.state.user?.nickname || '旅人')
const userAvatar = computed(() => store.state.user?.avatar || '')
const connected = computed(() => store.state.connected)

const filteredList = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return list.value
  return list.value.filter((item) => {
    const title = (item.title || '').toLowerCase()
    const preview = conversationPreview(item).toLowerCase()
    const peerName = (item.peer?.nickname || '').toLowerCase()
    return title.includes(kw) || preview.includes(kw) || peerName.includes(kw)
  })
})

function resetPullVisual() {
  if (pullRaf) {
    clearTimeout(pullRaf)
    pullRaf = 0
  }
  pendingPullDy = 0
  isPulling.value = false
  if (!refreshing.value) pullDy.value = 0
}

async function load() {
  const gen = ++loadGen
  // 已有列表时勿置 loading，避免切页入场时触发多余重绘
  if (!(store.state.conversations || []).length) loading.value = true
  try {
    const data = await store.fetchConversations(() => api.conversations())
    if (gen !== loadGen) return
    ;(data || []).forEach((c) => {
      if (c && c.id != null) syncBackgroundFromDetail(c.id, c)
    })
  } catch (e) {
  } finally {
    if (gen !== loadGen) return
    loading.value = false
    refreshing.value = false
    resetPullVisual()
  }
}

function refresh() {
  if (pullRaf) {
    clearTimeout(pullRaf)
    pullRaf = 0
  }
  pendingPullDy = 0
  isPulling.value = false
  refreshing.value = true
  pullDy.value = REFRESHER_HOLD_PX
  load()
}

function onRefresherPulling(e) {
  if (refreshing.value) return
  // 横向手势进行中：抑制下拉视觉接管，避免 isPulling 与 Tab/侧栏抢主手势
  if (gestureAxis === 'h' || gestureDrawerDrag) {
    if (isPulling.value) resetPullVisual()
    return
  }
  const d = e.detail || {}
  pendingPullDy = typeof d.dy === 'number' ? d.dy : (typeof d.deltaY === 'number' ? d.deltaY : 0)
  isPulling.value = true
  // 下拉过程按帧合并，减少 style 抖动
  if (pullRaf) return
  pullRaf = setTimeout(() => {
    pullRaf = 0
    // 已松手/中止后不再回写高度，避免小幅下拉后刷新标卡住
    if (refreshing.value || !isPulling.value) return
    // 节流回调时若已锁水平，丢弃下拉高度
    if (gestureAxis === 'h' || gestureDrawerDrag) {
      resetPullVisual()
      return
    }
    pullDy.value = Math.max(pendingPullDy, 0)
  }, 16)
}

function onRefresherRestore() {
  // 未达刷新阈值松手：立刻清掉节流回调与高度
  resetPullVisual()
}

function openChat(item) {
  closeMenu()
  uni.navigateTo({ url: '/pages/chat/chat?id=' + item.id + '&title=' + encodeURIComponent(item.title || '聊天') })
}

async function openAi() {
  const conv = await api.openAiChat()
  openChat(conv)
}

function goSearch() { uni.navigateTo({ url: '/pages/search/search' }) }
function goGroup() { uni.navigateTo({ url: '/pages/group-create/group-create' }) }
function goStickers() { uni.navigateTo({ url: '/pages/sticker-manage/sticker-manage' }) }
function goProfile() { uni.navigateTo({ url: '/pages/profile-edit/profile-edit' }) }
function goContacts() { requestMainTab(1) }
function goMine() { requestMainTab(2) }

function scanCode() {
  uni.scanCode({
    onlyFromCamera: false,
    success: (res) => {
      const raw = String(res?.result || '').trim()
      if (!raw) {
        uni.showToast({ title: '未识别到内容', icon: 'none' })
        return
      }
      // 项目暂无独立扫码落地页：识别结果带到加好友搜索
      uni.navigateTo({
        url: '/pages/search/search',
        success: () => {
          uni.showToast({ title: '已识别，可搜索添加', icon: 'none' })
        }
      })
      try {
        uni.setStorageSync('pc_scan_keyword', raw)
      } catch (e) {}
    },
    fail: (err) => {
      const msg = err?.errMsg || ''
      if (/cancel|取消/i.test(msg)) return
      uni.showToast({ title: '无法打开扫一扫', icon: 'none' })
    }
  })
}

function onDrawerAction(key) {
  closeDrawer(false)
  if (key === 'scan') scanCode()
  else if (key === 'search') goSearch()
  else if (key === 'group') goGroup()
  else if (key === 'ai') openAi()
  else if (key === 'contacts') goContacts()
  else if (key === 'stickers') goStickers()
  else if (key === 'profile') goProfile()
  else if (key === 'mine') goMine()
}

function toggleMenu() {
  if (isDrawerBusy()) closeDrawer(false)
  if (showMenu.value) {
    closeMenu()
    return
  }
  updateMenuPosition(() => {
    showMenu.value = true
  })
}

function closeMenu() {
  showMenu.value = false
}

function onMenuSelect(key) {
  closeMenu()
  if (key === 'ai') openAi()
  else if (key === 'group') goGroup()
  else if (key === 'search') goSearch()
}

function applyList(next) {
  store.setConversations(sortConversations(next || []))
}

async function togglePin(item) {
  const next = !isPinned(item)
  try {
    const updated = await api.updateConvSettings(item.id, { pinned: next ? 1 : 0 })
    store.upsertConversation(updated || { ...item, pinned: next ? 1 : 0, pinnedAt: next ? Date.now() : null })
    uni.showToast({ title: next ? '已置顶' : '已取消置顶', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '设置失败', icon: 'none' })
  }
}

async function toggleNotify(item) {
  const muted = !!(item.muted ?? item.mute)
  const nextMuted = !muted
  try {
    await api.updateConvSettings(item.id, { mute: nextMuted ? 1 : 0 })
    applyList(list.value.map((c) => {
      if (Number(c.id) !== Number(item.id)) return c
      return { ...c, muted: nextMuted, mute: nextMuted ? 1 : 0 }
    }))
    uni.showToast({ title: nextMuted ? '已关闭通知' : '已开启通知', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '设置失败', icon: 'none' })
  }
}

/** 长按判定：按下不动超过阈值时长才触发，垂直滑动列表时应取消，避免误触长按菜单 */
const LONG_PRESS_DELAY_MS = 500
const LONG_PRESS_MOVE_PX = 10
const rowPressState = {
  active: false,
  moved: false,
  fired: false,
  item: null,
  startX: 0,
  startY: 0
}
let rowLongPressTimer = null

function pickRowTouchPoint(e) {
  const t = e?.changedTouches?.[0] || e?.touches?.[0] || null
  if (!t) return null
  const x = t.clientX ?? t.pageX
  const y = t.clientY ?? t.pageY
  if (x == null || y == null) return null
  return { x: Number(x), y: Number(y) }
}

function clearRowLongPressTimer() {
  if (!rowLongPressTimer) return
  clearTimeout(rowLongPressTimer)
  rowLongPressTimer = null
}

function cancelRowLongPress() {
  clearRowLongPressTimer()
  rowPressState.active = false
  rowPressState.item = null
}

function onRowTouchStart(item, e) {
  // 弹窗打开时点到列表行：先关弹窗，保留可交互
  dismissMenuOnOutside()
  clearRowLongPressTimer()
  const p = pickRowTouchPoint(e)
  rowPressState.active = true
  rowPressState.moved = false
  rowPressState.fired = false
  rowPressState.item = item
  rowPressState.startX = p?.x ?? 0
  rowPressState.startY = p?.y ?? 0
  rowLongPressTimer = setTimeout(() => {
    if (!rowPressState.active || rowPressState.moved || rowPressState.fired || !rowPressState.item) return
    rowPressState.fired = true
    rowPressState.active = false
    const target = rowPressState.item
    rowPressState.item = null
    onLong(target)
  }, LONG_PRESS_DELAY_MS)
}

function onRowTouchMove(e) {
  if (!rowPressState.active) return
  const p = pickRowTouchPoint(e)
  const dx = Math.abs((p?.x ?? rowPressState.startX) - rowPressState.startX)
  const dy = Math.abs((p?.y ?? rowPressState.startY) - rowPressState.startY)
  // 位移超过阈值视为在滑动列表，取消长按计时，避免上下滑动误触长按菜单
  if (dx >= LONG_PRESS_MOVE_PX || dy >= LONG_PRESS_MOVE_PX) {
    rowPressState.moved = true
    cancelRowLongPress()
  }
}

function onRowTouchEnd() {
  cancelRowLongPress()
}

function onRowTouchCancel() {
  cancelRowLongPress()
}

function onLong(item) {
  const pinned = isPinned(item)
  const muted = !!(item.muted ?? item.mute)
  uni.showActionSheet({
    itemList: [
      '标记已读',
      pinned ? '取消置顶' : '置顶聊天',
      muted ? '开启消息通知' : '关闭消息通知',
      item.hasBot ? '已接入 AI' : '添加 Kimi 机器人'
    ],
    success: async (res) => {
      if (res.tapIndex === 0) {
        await api.markRead(item.id)
        store.markConversationReadLocal(item.id, item.lastMsgId)
        load()
      } else if (res.tapIndex === 1) {
        togglePin(item)
      } else if (res.tapIndex === 2) {
        await toggleNotify(item)
      } else if (res.tapIndex === 3 && !item.hasBot) {
        await api.addBot(item.id)
        const tip = item.type === 1 && !item.peer?.bot
          ? 'Kimi 已加入，私聊中请 @Kimi 才会回复'
          : 'Kimi 已加入'
        uni.showToast({ title: tip, icon: 'none', duration: 2500 })
        load()
      }
    }
  })
}

function showAiBadge(item) {
  if (item.showAiBadge === true) return true
  // 兼容旧接口：仅 Kimi 私聊（对方为 bot）显示角标，不因挂载 Kimi 而显示
  return item.type === 1 && !!item.peer?.bot
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMsgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = Math.round((startOfToday - startOfMsgDay) / 86400000)
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  if (dayDiff === 0) return hm
  if (dayDiff === 1) return '昨天 ' + hm
  if (dayDiff > 1 && dayDiff < 7) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  if (d.getFullYear() === now.getFullYear()) return mm + '-' + dd
  return d.getFullYear() + '-' + mm + '-' + dd
}
function isItemPinned(item) {
  return isPinned(item)
}
function isItemMuted(item) {
  return !!(item.muted ?? item.mute)
}

onShow(() => {
  try { uni.hideTabBar({ animation: false }) } catch (e) {}
  // 仅当前在消息页时刷新列表；入场期间略推迟
  if (tabIndex.value === 0) {
    runAfterTabEnter(() => { load() })
  }
})

onHide(() => {
  // 离开页面时清掉未触发的长按计时器，避免残留状态影响下次进入
  cancelRowLongPress()
  closeMenu()
  if (drawerOpen.value || drawerPhase.value === 'follow') {
    closeDrawer(false)
  }
})
</script>

<style scoped lang="scss">
.chats-page {
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: $pc-bg;
}
.chats-main {
  height: 100%;
  width: 100%;
  position: relative;
  z-index: 1;
  will-change: transform;
  box-sizing: border-box;
  background: $pc-bg;
  overflow: hidden;
}
.tab-track-viewport {
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
}
.tab-track {
  height: 100%;
  width: 300%;
  display: flex;
  flex-direction: row;
  will-change: transform;
  backface-visibility: hidden;
}
.tab-pane {
  width: 33.333333%;
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}
.drawer-layer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 220;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  will-change: transform;
}
.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 210;
  background: rgba(10, 6, 20, 0.55);
  will-change: opacity;
}
.chats {
  height: 100%;
  padding: 0 28rpx calc(140rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.page-header {
  margin: 0 -28rpx 8rpx;
  padding: 0 28rpx 16rpx;
  width: calc(100% + 56rpx);
}
.top { margin-bottom: 20rpx; padding-top: 12rpx; }
.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.hello { flex: 1; min-width: 0; font-size: 42rpx; font-weight: 800; color: $pc-text; letter-spacing: 0.5rpx; }
.status-row { display: flex; align-items: center; gap: 10rpx; margin-top: 10rpx; }
.status { color: $pc-muted; font-size: 22rpx; }
.actions { flex-shrink: 0; position: relative; }
.icon-btn {
  width: 76rpx; height: 76rpx; border-radius: $pc-radius-md;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
  color: #fff; font-size: 40rpx; font-weight: 700;
  box-shadow: 0 10rpx 28rpx rgba(124, 58, 237, 0.35);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  &.active {
    box-shadow: 0 0 0 3rpx rgba(167, 139, 250, 0.45), 0 10rpx 28rpx rgba(124, 58, 237, 0.45);
  }
}
.menu-popover {
  position: fixed;
  z-index: 1001;
  min-width: 280rpx;
  padding: 10rpx 0;
  border-radius: $pc-radius-lg;
  background:
    linear-gradient(180deg, rgba(124, 58, 237, 0.18) 0%, transparent 36%),
    rgba(20, 10, 34, 0.97);
  border: 1px solid rgba(167, 139, 250, 0.28);
  box-shadow:
    0 12rpx 40rpx rgba(88, 28, 135, 0.42),
    0 0 24rpx rgba(167, 139, 250, 0.12);
  animation: pc-bubble-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  transform-origin: top right;
}
.menu-arrow {
  position: absolute;
  top: -14rpx;
  right: 22rpx;
  width: 0;
  height: 0;
  border-left: 14rpx solid transparent;
  border-right: 14rpx solid transparent;
  border-bottom: 14rpx solid rgba(28, 16, 48, 0.97);
  filter: drop-shadow(0 -2rpx 4rpx rgba(167, 139, 250, 0.2));
  &::after {
    content: '';
    position: absolute;
    top: 2rpx;
    left: -12rpx;
    width: 0;
    height: 0;
    border-left: 12rpx solid transparent;
    border-right: 12rpx solid transparent;
    border-bottom: 12rpx solid rgba(167, 139, 250, 0.22);
  }
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 28rpx;
  color: $pc-text;
  font-size: 28rpx;
  transition: background 0.15s ease;
  &:active { background: rgba(167, 139, 250, 0.14); }
  &:not(:last-child) {
    border-bottom: 1px solid rgba(167, 139, 250, 0.1);
  }
}
.menu-icon {
  width: 40rpx;
  text-align: center;
  font-size: 28rpx;
  color: $pc-purple;
}
.menu-label {
  flex: 1;
  font-weight: 600;
  letter-spacing: 0.5rpx;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 22rpx;
  margin-bottom: 8rpx;
  border-radius: $pc-radius-lg;
}
.search-icon {
  color: $pc-muted;
  font-size: 32rpx;
  line-height: 1;
}
.search-input {
  flex: 1;
  height: 64rpx;
  color: $pc-text;
  font-size: 26rpx;
  background: transparent;
}
.search-clear {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $pc-radius-pill;
  color: $pc-muted;
  font-size: 36rpx;
  line-height: 1;
  background: rgba(167, 139, 250, 0.12);
}
.list-wrap {
  flex: 1;
  height: 0;
  position: relative;
  overflow: hidden;
}
.list { height: 100%; background: transparent; }
.row {
  display: flex; gap: 22rpx; padding: 26rpx; border-radius: $pc-radius-lg; margin-bottom: 18rpx;
}
.meta { flex: 1; overflow: hidden; }
.line1, .line2 { display: flex; justify-content: space-between; align-items: center; gap: 8rpx; }
.line1 .title { flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title { font-size: 30rpx; font-weight: 700; color: $pc-text; }
.pin-tag {
  margin-left: 10rpx;
  font-size: 18rpx;
  color: $pc-purple;
  padding: 2rpx 10rpx;
  border-radius: $pc-radius-pill;
  border: 1px solid rgba(167, 139, 250, 0.35);
}
.mute-tag {
  margin-left: 8rpx;
  font-size: 18rpx;
  color: $pc-muted;
  padding: 2rpx 10rpx;
  border-radius: $pc-radius-pill;
  border: 1px solid rgba(155, 138, 175, 0.35);
}
.time { font-size: 20rpx; color: #7A6B8C; margin-left: auto; flex-shrink: 0; white-space: nowrap; }
.preview {
  margin-top: 12rpx; font-size: 24rpx; color: $pc-muted;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 420rpx;
}
.preview-draft { color: #F9A8D4; }
.badge {
  min-width: 34rpx; height: 34rpx; padding: 0 10rpx; border-radius: $pc-radius-pill;
  background: linear-gradient(135deg, $pc-rose, $pc-red);
  color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
}
.skeleton {
  height: 128rpx; border-radius: $pc-radius-lg; margin-bottom: 18rpx;
  background: linear-gradient(90deg, rgba(167,139,250,.06), rgba(244,63,94,.1), rgba(167,139,250,.06));
  background-size: 200% 100%; animation: pc-shine 1.2s linear infinite;
}
.empty { padding: 140rpx 40rpx; text-align: center; }
.empty-title { display: block; font-size: 32rpx; color: $pc-text; margin-bottom: 12rpx; }
.empty-sub { color: $pc-muted; font-size: 24rpx; }
</style>
