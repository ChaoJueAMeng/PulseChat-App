<template>
  <view v-if="show" class="mask" @tap="onClose" @touchmove.stop.prevent>
    <!-- 上方：附上表情 -->
    <view class="bubble react-bubble" :style="reactStyle" @tap.stop>
      <view class="react-row">
        <text
          v-for="e in reactionEmojis"
          :key="e"
          class="react pc-press"
          @tap="onReact(e)"
        >{{ e }}</text>
        <view class="more-btn pc-press" :class="{ open: moreOpen }" @tap="toggleMore">
          <text class="more-ico">{{ moreOpen ? '▴' : '▾' }}</text>
        </view>
      </view>
      <view v-if="moreOpen" class="more-panel" @tap.stop>
        <scroll-view scroll-y class="more-scroll">
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
      <view class="arrow below"></view>
    </view>

    <!-- 下方：功能操作 -->
    <view class="bubble action-bubble" :style="actionStyle" @tap.stop>
      <view class="arrow above"></view>
      <view class="actions">
        <view
          v-for="a in actions"
          :key="a.key"
          class="action pc-press"
          :class="{ danger: a.danger }"
          @tap="onAction(a)"
        >
          <text class="ico">{{ a.icon }}</text>
          <text class="label">{{ a.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { QUICK_REACTIONS, EMOJI_CATEGORIES } from '../../utils/emoji.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  /** { left, top, width, height } px */
  anchor: { type: Object, default: null },
  actions: { type: Array, default: () => [] },
  reactions: { type: Array, default: () => QUICK_REACTIONS }
})

const emit = defineEmits(['close', 'action', 'react'])

const moreOpen = ref(false)

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

watch(() => props.show, (v) => {
  if (!v) moreOpen.value = false
})

function layout() {
  const a = props.anchor || {}
  const sys = uni.getSystemInfoSync()
  const winW = sys.windowWidth || 375
  const winH = sys.windowHeight || 667
  const reactW = Math.min(292, Math.max(250, winW - 36))
  const actionW = Math.min(280, Math.max(230, winW - 48))
  const cx = (a.left || 0) + (a.width || 0) / 2

  let reactLeft = cx - reactW / 2
  reactLeft = Math.max(8, Math.min(reactLeft, winW - reactW - 8))
  let actionLeft = cx - actionW / 2
  actionLeft = Math.max(8, Math.min(actionLeft, winW - actionW - 8))

  const gap = 6
  const reactBottom = Math.max(8, winH - (a.top || 0) + gap)
  const actionTop = Math.min(winH - 56, (a.top || 0) + (a.height || 0) + gap)

  return {
    react: { width: reactW + 'px', left: reactLeft + 'px', bottom: reactBottom + 'px' },
    action: { width: actionW + 'px', left: actionLeft + 'px', top: actionTop + 'px' }
  }
}

const reactStyle = computed(() => layout().react)
const actionStyle = computed(() => layout().action)

function onClose() {
  moreOpen.value = false
  emit('close')
}
function onAction(a) {
  if (!a || a.disabled) return
  emit('action', a.key)
}
function onReact(emoji) {
  moreOpen.value = false
  emit('react', emoji)
}
function toggleMore() {
  moreOpen.value = !moreOpen.value
}
</script>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(10, 6, 20, 0.2);
}
.bubble {
  position: fixed;
  z-index: 1201;
  box-sizing: border-box;
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
  padding: 6rpx 6rpx 8rpx;
  overflow: visible;
  transform-origin: bottom center;
}
.action-bubble {
  padding: 6rpx 4rpx 8rpx;
  overflow: hidden;
  transform-origin: top center;
}
.react-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  gap: 0;
  padding: 0 2rpx;
}
.react {
  flex: 1 1 0;
  min-width: 0;
  height: 40rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  line-height: 1;
  &:active {
    transform: scale(1.1);
    background: rgba(167, 139, 250, 0.16);
  }
}
.more-btn {
  flex: 0 0 36rpx;
  width: 36rpx;
  height: 36rpx;
  margin-left: 2rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(167, 139, 250, 0.14);
  &.open {
    background: rgba(167, 139, 250, 0.28);
  }
}
.more-ico {
  font-size: 18rpx;
  color: $pc-muted;
  line-height: 1;
}
.more-panel {
  margin-top: 6rpx;
  border-radius: 10rpx;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(167, 139, 250, 0.18);
  overflow: hidden;
}
.more-scroll {
  max-height: 220rpx;
}
.more-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 6rpx 4rpx;
}
.more-cell {
  width: 12.5%;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  line-height: 1;
  border-radius: 8rpx;
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
  gap: 0;
  padding: 0;
}
.action {
  flex: 1 1 0;
  min-width: 0;
  padding: 2rpx 1rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
  border-radius: 8rpx;
  box-sizing: border-box;
  &:active { background: rgba(167, 139, 250, 0.12); }
  &.danger .label { color: $pc-rose; }
  &.danger .ico { color: $pc-rose; }
}
.ico {
  width: 38rpx;
  height: 38rpx;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
  color: $pc-text;
  background: rgba(167, 139, 250, 0.12);
  line-height: 1;
  flex-shrink: 0;
}
.label {
  font-size: 16rpx;
  color: $pc-muted;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
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
