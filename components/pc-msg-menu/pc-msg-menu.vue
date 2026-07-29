<template>
  <!--
    mask 仅用于视觉变暗，不拦截任何触摸（pointer-events: none）。
    关闭逻辑统一交给页面根节点：任何未被下方两个气泡拦截（.stop）的触摸，
    都会穿透 mask 直达消息列表/导航栏等真实元素，由页面级 touchstart 统一关闭菜单，
    从而使点击和滑动都能在关闭弹窗的同时正常触发底层元素本身的行为。
  -->
  <view v-if="show" class="mask">
    <!-- 附上表情：默认在消息上方，顶部空间不足时改到消息下方 -->
    <view
      class="bubble react-bubble"
      :class="{ below: reactBelow, overlay: overlayMode, 'pos-ready': posReady }"
      :style="reactStyle"
      @tap.stop
      @touchstart.stop
      @touchmove.stop
    >
      <view v-if="reactBelow && !overlayMode" class="arrow above"></view>
      <view class="react-row">
        <text
          v-for="e in reactionEmojis"
          :key="e"
          class="react pc-press"
          @tap="onReact(e)"
        >{{ e }}</text>
        <view class="more-btn pc-press" :class="{ open: moreOpen }" @tap="toggleMore">
          <view class="more-chevron"></view>
        </view>
      </view>
      <view
        v-if="morePanelAlive"
        class="more-panel"
        :class="{ open: moreOpen }"
        @tap.stop
      >
        <scroll-view scroll-y class="more-scroll" :bounces="true" :style="moreScrollStyle">
          <view class="more-grid">
            <text
              v-for="(e, i) in moreEmojis"
              :key="'m-' + i + e"
              class="more-cell pc-press"
              @tap="onReact(e)"
            >{{ e }}</text>
          </view>
        </scroll-view>
      </view>
      <view v-if="!reactBelow && !overlayMode" class="arrow below"></view>
    </view>

    <!-- 下方：功能操作 -->
    <view class="bubble action-bubble" :class="{ overlay: overlayMode, 'pos-ready': posReady }" :style="actionStyle" @tap.stop @touchstart.stop @touchmove.stop>
      <view v-if="!overlayMode" class="arrow above"></view>
      <view class="actions">
        <view
          v-for="a in actions"
          :key="a.key"
          class="action pc-press"
          :class="{ danger: a.danger }"
          @tap="onAction(a)"
        >
          <view class="ico" :class="['ico-' + a.key, { danger: a.danger }]">
            <template v-if="a.key === 'forward'">
              <view class="fwd-curve"></view>
              <view class="fwd-head"></view>
            </template>
          </view>
          <text class="label">{{ a.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { QUICK_REACTIONS, EMOJI_CATEGORIES } from '../../utils/emoji.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  /** { left, top, width, height } px */
  anchor: { type: Object, default: null },
  actions: { type: Array, default: () => [] },
  reactions: { type: Array, default: () => QUICK_REACTIONS }
})

const emit = defineEmits(['action', 'react'])

const MORE_ANIM_MS = 260
/** 箭头 / 面板视觉展开态 */
const moreOpen = ref(false)
/** 面板是否仍挂载（收起动画结束后再卸） */
const morePanelAlive = ref(false)
/** 布局高度是否按展开计算（收起动画期间保持） */
const moreLayoutOpen = ref(false)
/** 首帧落位后再允许 top/left 过渡，避免首次弹出从错误位置滑入 */
const posReady = ref(false)
let moreAnimTimer = null
let posReadyTimer = null

const reactionEmojis = computed(() => (
  props.reactions?.length ? props.reactions : QUICK_REACTIONS
))

const moreEmojis = computed(() => {
  const quick = new Set(reactionEmojis.value)
  const all = []
  EMOJI_CATEGORIES.forEach((cat) => {
    ;(cat.emojis || []).forEach((e) => {
      if (!quick.has(e) && !all.includes(e)) all.push(e)
    })
  })
  return all.length ? all : reactionEmojis.value
})

function clearMoreAnimTimer() {
  if (!moreAnimTimer) return
  clearTimeout(moreAnimTimer)
  moreAnimTimer = null
}

function clearPosReadyTimer() {
  if (!posReadyTimer) return
  clearTimeout(posReadyTimer)
  posReadyTimer = null
}

function resetMorePanel() {
  clearMoreAnimTimer()
  moreOpen.value = false
  morePanelAlive.value = false
  moreLayoutOpen.value = false
}

function openMorePanel() {
  clearMoreAnimTimer()
  morePanelAlive.value = true
  moreLayoutOpen.value = true
  moreOpen.value = false
  nextTick(() => {
    moreOpen.value = true
  })
}

function closeMorePanel() {
  if (!morePanelAlive.value && !moreOpen.value && !moreLayoutOpen.value) return
  moreOpen.value = false
  clearMoreAnimTimer()
  moreAnimTimer = setTimeout(() => {
    morePanelAlive.value = false
    moreLayoutOpen.value = false
    moreAnimTimer = null
  }, MORE_ANIM_MS)
}

watch(() => props.show, (v) => {
  clearPosReadyTimer()
  if (!v) {
    resetMorePanel()
    posReady.value = false
    return
  }
  // 先无过渡落位，等入场动画差不多结束后再启用位置过渡
  posReady.value = false
  nextTick(() => {
    posReadyTimer = setTimeout(() => {
      posReadyTimer = null
      if (props.show) posReady.value = true
    }, 180)
  })
})

function layout() {
  const a = props.anchor || {}
  const sys = uni.getSystemInfoSync()
  const winW = sys.windowWidth || 375
  const winH = sys.windowHeight || 667
  const safeTop = (sys.safeAreaInsets?.top ?? sys.statusBarHeight ?? 20) + 4
  const safeBottom = (sys.safeAreaInsets?.bottom ?? 0) + 8
  const rpx = winW / 750
  const edgePad = 8
  const gap = 8
  const reactClosedH = Math.max(48, Math.ceil(118 * rpx))
  const actionH = Math.max(64, Math.ceil(118 * rpx))
  const moreRowH = Math.ceil(50 * rpx)
  const moreRows = Math.max(1, Math.ceil(moreEmojis.value.length / 8))
  const moreGridPadV = Math.ceil(12 * rpx)
  const morePanelChrome = Math.ceil(10 * rpx) + 2
  const moreScrollMaxH = Math.ceil(220 * rpx)
  let moreScrollH = 0
  if (moreLayoutOpen.value) {
    const contentH = moreRows * moreRowH + moreGridPadV
    moreScrollH = Math.min(moreScrollMaxH, contentH)
  }
  let morePanelH = moreLayoutOpen.value ? morePanelChrome + moreScrollH : 0
  // 首栏定位只用闭合高度，避免展开时整块气泡上移导致首栏跳动；
  // 二级面板高度只影响向下扩展与操作区避让。
  let reactFullH = reactClosedH + morePanelH
  const reactW = Math.min(292, Math.max(250, winW - 36))
  const actionW = Math.min(280, Math.max(230, winW - 48))
  const cx = (a.left || 0) + (a.width || 0) / 2

  let reactLeft = cx - reactW / 2
  reactLeft = Math.max(edgePad, Math.min(reactLeft, winW - reactW - edgePad))
  let actionLeft = cx - actionW / 2
  actionLeft = Math.max(edgePad, Math.min(actionLeft, winW - actionW - edgePad))

  const anchorTop = a.top || 0
  const anchorBottom = anchorTop + (a.height || 0)
  const viewportH = Math.max(0, winH - safeTop - safeBottom)

  if (moreLayoutOpen.value) {
    const maxStackH = viewportH - reactClosedH - actionH - gap
    if (maxStackH > 0 && moreScrollH > maxStackH) {
      moreScrollH = maxStackH
      morePanelH = morePanelChrome + moreScrollH
      reactFullH = reactClosedH + morePanelH
    }
  }

  // 首栏相对消息的位置始终按闭合高度计算，展开时只向下长出面板
  const preferredAbove = anchorTop - gap - reactClosedH
  const preferredBelow = anchorBottom + gap
  const spaceAbove = anchorTop - safeTop - gap
  const spaceBelow = winH - safeBottom - anchorBottom - gap
  const canReactAbove = spaceAbove >= reactClosedH
  const canReactBelow = spaceBelow >= reactClosedH
  const stackH = reactFullH + gap + actionH
  const maxBottom = winH - safeBottom

  let reactTop
  let reactBelow = false
  if (canReactAbove) {
    reactTop = preferredAbove
  } else if (canReactBelow) {
    reactTop = preferredBelow
    reactBelow = true
  } else {
    // 上下都放不下闭合首栏时，先贴消息附近，后面再整体钳制
    reactTop = Math.max(safeTop, Math.min(preferredBelow, maxBottom - reactClosedH))
  }

  // 操作区紧跟首栏(+展开面板)，消息下方时至少不低于消息底
  let actionTop = reactTop + reactFullH + gap
  if (!reactBelow) {
    actionTop = Math.max(actionTop, anchorBottom + gap)
  }

  // 底部溢出：整组上移刚好放下，绝不单独把 action 往上钳导致误判 overlay 再飞顶
  if (actionTop + actionH > maxBottom) {
    const shift = actionTop + actionH - maxBottom
    reactTop -= shift
    actionTop -= shift
  }
  if (reactTop < safeTop) {
    reactTop = safeTop
    actionTop = reactTop + reactFullH + gap
    if (actionTop + actionH > maxBottom) {
      actionTop = maxBottom - actionH
    }
  }

  // 仍重叠时强制分离；若已在消息下方，继续锚定下方只做最小上移
  const overlapGap = actionTop - (reactTop + reactFullH)
  const needOverlay = (!canReactAbove && !canReactBelow) || overlapGap < gap

  if (needOverlay) {
    if (reactBelow || (!canReactAbove && canReactBelow)) {
      reactTop = Math.min(preferredBelow, maxBottom - stackH)
      reactTop = Math.max(safeTop, reactTop)
      reactBelow = true
      actionTop = reactTop + reactFullH + gap
    } else {
      // 上方模式：从 preferredAbove 只上移到能放下堆叠，不要无脑贴 safeTop
      reactTop = Math.min(preferredAbove, maxBottom - stackH)
      reactTop = Math.max(safeTop, reactTop)
      reactBelow = false
      actionTop = reactTop + reactFullH + gap
    }
  }

  return {
    overlay: needOverlay,
    reactBelow,
    moreScrollH,
    react: { width: reactW + 'px', left: reactLeft + 'px', top: reactTop + 'px' },
    action: { width: actionW + 'px', left: actionLeft + 'px', top: actionTop + 'px' }
  }
}

const layoutState = computed(() => layout())
const overlayMode = computed(() => !!layoutState.value.overlay)
const reactBelow = computed(() => !!layoutState.value.reactBelow)
const moreScrollStyle = computed(() => {
  const h = Number(layoutState.value.moreScrollH) || 0
  return h > 0 ? { maxHeight: h + 'px' } : {}
})
const reactStyle = computed(() => layoutState.value.react)
const actionStyle = computed(() => layoutState.value.action)

function onAction(a) {
  if (!a || a.disabled) return
  emit('action', a.key)
}
function onReact(emoji) {
  closeMorePanel()
  emit('react', emoji)
}
function toggleMore() {
  if (moreOpen.value || moreLayoutOpen.value) closeMorePanel()
  else openMorePanel()
}
</script>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(10, 6, 20, 0.2);
  /* 不拦截触摸：让弹窗外的触摸穿透到底层元素（消息列表/导航栏等） */
  pointer-events: none;
}
.bubble {
  position: fixed;
  z-index: 1201;
  box-sizing: border-box;
  /* mask 设为 pointer-events: none，这里需显式恢复，否则会被继承为 none */
  pointer-events: auto;
  border-radius: 12rpx;
  background:
    linear-gradient(180deg, rgba(124, 58, 237, 0.16) 0%, transparent 48%),
    rgba(22, 12, 38, 0.97);
  border: 1px solid rgba(167, 139, 250, 0.3);
  box-shadow:
    0 8rpx 22rpx rgba(10, 6, 20, 0.45),
    0 0 14rpx rgba(167, 139, 250, 0.1);
  animation: msg-menu-in 0.16s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.react-bubble {
  padding: 8rpx 8rpx 10rpx;
  overflow: visible;
  transform-origin: bottom center;
  &.below {
    transform-origin: top center;
  }
  &.overlay {
    transform-origin: center center;
  }
  /* 仅在已显示后的位置变化启用，避免首次弹出误滑动 */
  &.pos-ready {
    transition:
      top 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      left 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.22s ease;
  }
}
.action-bubble {
  padding: 8rpx 6rpx 10rpx;
  overflow: hidden;
  transform-origin: top center;
  &.overlay {
    transform-origin: center center;
  }
  &.pos-ready {
    transition:
      top 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      left 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.22s ease;
  }
}
.react-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  gap: 4rpx;
  padding: 0;
}
.react {
  flex: 1 1 0;
  min-width: 0;
  height: 48rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  line-height: 1;
  background: rgba(255, 255, 255, 0.02);
  transition: transform 0.14s ease, background 0.18s ease, box-shadow 0.18s ease;
  &:active {
    transform: scale(1.08);
    background: rgba(167, 139, 250, 0.18);
    box-shadow: 0 0 0 1px rgba(196, 181, 253, 0.18) inset;
  }
}
.more-btn {
  flex: 0 0 46rpx;
  width: 46rpx;
  height: 46rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(167, 139, 250, 0.22), rgba(124, 58, 237, 0.16));
  box-shadow: 0 0 0 1px rgba(196, 181, 253, 0.1) inset;
  transition: background 0.22s ease, box-shadow 0.22s ease;
  &.open {
    background: linear-gradient(180deg, rgba(196, 181, 253, 0.32), rgba(124, 58, 237, 0.24));
  }
  &.open .more-chevron {
    margin-top: 6rpx;
    transform: rotate(-135deg);
  }
}
.more-chevron {
  width: 16rpx;
  height: 16rpx;
  margin-top: -6rpx;
  border-right: 5rpx solid #e9e0ff;
  border-bottom: 5rpx solid #e9e0ff;
  border-radius: 0 0 6rpx 0;
  box-sizing: border-box;
  transform: rotate(45deg);
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}
.more-panel {
  margin-top: 0;
  max-height: 0;
  opacity: 0;
  transform: translateY(-16rpx);
  border-radius: 14rpx;
  background: rgba(10, 6, 20, 0.62);
  border: 1px solid transparent;
  overflow: hidden;
  pointer-events: none;
  /* 只做面板自身上下滑入，不改变首栏的 fixed top */
  transition:
    max-height 0.26s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease,
    transform 0.26s cubic-bezier(0.22, 1, 0.36, 1),
    margin-top 0.26s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.2s ease;
  &.open {
    margin-top: 6rpx;
    max-height: 280rpx;
    opacity: 1;
    transform: translateY(0);
    border-color: rgba(167, 139, 250, 0.2);
    pointer-events: auto;
  }
}
.more-scroll {
  max-height: 220rpx;
}
.more-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 6rpx;
}
.more-cell {
  width: 12.5%;
  height: 50rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  line-height: 1;
  border-radius: 12rpx;
  box-sizing: border-box;
  &:active { background: rgba(167, 139, 250, 0.16); }
}
.actions {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  justify-content: space-between;
  width: 100%;
  gap: 4rpx;
  padding: 0;
}
.action {
  flex: 1 1 0;
  min-width: 0;
  min-height: 92rpx;
  padding: 8rpx 4rpx 6rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  border-radius: 14rpx;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.015);
  transition: transform 0.14s ease, background 0.18s ease, box-shadow 0.18s ease;
  &:active {
    background: rgba(167, 139, 250, 0.12);
    transform: translateY(1rpx);
    box-shadow: 0 0 0 1px rgba(196, 181, 253, 0.08) inset;
  }
  &.danger .label { color: $pc-rose; }
}
.ico {
  width: 48rpx;
  height: 48rpx;
  border-radius: 14rpx;
  position: relative;
  background:
    radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.22), transparent 34%),
    linear-gradient(180deg, rgba(167, 139, 250, 0.3), rgba(124, 58, 237, 0.18));
  box-shadow:
    0 0 0 1px rgba(196, 181, 253, 0.14) inset,
    0 6rpx 16rpx rgba(76, 29, 149, 0.22);
  flex-shrink: 0;
}
.ico::before,
.ico::after {
  content: '';
  position: absolute;
  box-sizing: border-box;
}
.ico.danger {
  background:
    radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.2), transparent 34%),
    linear-gradient(180deg, rgba(251, 113, 133, 0.3), rgba(190, 24, 93, 0.18));
  box-shadow:
    0 0 0 1px rgba(251, 113, 133, 0.16) inset,
    0 6rpx 16rpx rgba(136, 19, 55, 0.24);
}
.ico-copy::before {
  left: 18rpx;
  top: 11rpx;
  width: 16rpx;
  height: 18rpx;
  border-radius: 5rpx;
  border: 2rpx solid #f5f3ff;
  background: rgba(245, 243, 255, 0.08);
}
.ico-copy::after {
  left: 12rpx;
  top: 17rpx;
  width: 16rpx;
  height: 18rpx;
  border-radius: 5rpx;
  border: 2rpx solid rgba(245, 243, 255, 0.82);
  background: rgba(245, 243, 255, 0.08);
}
/* 转发：圆润弯折箭头（自下向上再朝右），避免抽象断弧 */
.ico-forward::before,
.ico-forward::after {
  display: none;
}
.fwd-curve {
  position: absolute;
  left: 14rpx;
  top: 15rpx;
  width: 17rpx;
  height: 18rpx;
  box-sizing: border-box;
  border-left: 3.5rpx solid #f5f3ff;
  border-top: 3.5rpx solid #f5f3ff;
  border-radius: 15rpx 0 0 0;
}
.fwd-head {
  position: absolute;
  right: 9rpx;
  top: 11rpx;
  width: 13rpx;
  height: 13rpx;
  box-sizing: border-box;
  border-top: 3.5rpx solid #f5f3ff;
  border-right: 3.5rpx solid #f5f3ff;
  border-radius: 4rpx;
  transform: rotate(45deg);
}
.ico-quote::before,
.ico-quote::after {
  width: 11rpx;
  height: 16rpx;
  border: 3rpx solid #f5f3ff;
  border-top-color: transparent;
  border-right-color: transparent;
  border-radius: 0 0 0 14rpx;
  transform: rotate(22deg);
}
.ico-quote::before {
  left: 11rpx;
  top: 14rpx;
}
.ico-quote::after {
  left: 25rpx;
  top: 14rpx;
}
.ico-addSticker::before {
  left: 12rpx;
  top: 13rpx;
  width: 13rpx;
  height: 13rpx;
  border-radius: 50%;
  background: #fda4af;
  box-shadow:
    11rpx 0 0 #fda4af,
    0 0 10rpx rgba(251, 113, 133, 0.35);
}
.ico-addSticker::after {
  left: 17.5rpx;
  top: 18rpx;
  width: 13rpx;
  height: 13rpx;
  background: #fda4af;
  transform: rotate(45deg);
  border-radius: 2rpx;
}
.ico-delete::before {
  left: 14rpx;
  top: 18rpx;
  width: 20rpx;
  height: 16rpx;
  border-radius: 0 0 6rpx 6rpx;
  border: 2rpx solid #fff1f2;
  border-top: none;
}
.ico-delete::after {
  left: 12rpx;
  top: 13rpx;
  width: 24rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: #fff1f2;
  box-shadow: 7rpx -5rpx 0 -1rpx #fff1f2;
}
.ico-recall::before {
  left: 13rpx;
  top: 13rpx;
  width: 22rpx;
  height: 22rpx;
  border: 3rpx solid #f5f3ff;
  border-left-color: transparent;
  border-radius: 50%;
  transform: rotate(8deg);
}
.ico-recall::after {
  left: 12rpx;
  top: 11rpx;
  width: 11rpx;
  height: 11rpx;
  border-left: 3rpx solid #f5f3ff;
  border-bottom: 3rpx solid #f5f3ff;
  border-radius: 2rpx;
  transform: rotate(8deg);
}
.label {
  font-size: 18rpx;
  color: #c4b5fd;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  font-weight: 500;
}
.arrow {
  position: absolute;
  left: 50%;
  width: 0;
  height: 0;
  margin-left: -8rpx;
  border-left: 8rpx solid transparent;
  border-right: 8rpx solid transparent;
  &.below {
    bottom: -12rpx;
    border-top: 12rpx solid rgba(22, 12, 38, 0.97);
  }
  &.above {
    top: -12rpx;
    border-bottom: 12rpx solid rgba(22, 12, 38, 0.97);
  }
}
@keyframes msg-menu-in {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(4rpx);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
