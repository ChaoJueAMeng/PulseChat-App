<template>
  <view v-if="show" class="emoji-panel pc-card" @tap.stop>
    <view class="tabs">
      <text
        v-for="cat in categories"
        :key="cat.key"
        class="tab pc-press"
        :class="{ active: activeKey === cat.key }"
        @tap="activeKey = cat.key"
      >{{ cat.label }}</text>
    </view>
    <scroll-view
      scroll-y
      class="grid-wrap"
      :bounces="true"
    >
      <view class="grid">
        <text
          v-for="(e, i) in currentEmojis"
          :key="activeKey + '-' + i"
          class="cell pc-press"
          @tap="pick(e)"
        >{{ e }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { EMOJI_CATEGORIES } from '../../utils/emoji.js'

defineProps({
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['pick'])

const categories = EMOJI_CATEGORIES
const activeKey = ref(categories[0].key)

const currentEmojis = computed(() => {
  const cat = categories.find(c => c.key === activeKey.value)
  return cat ? cat.emojis : []
})

function pick(emoji) {
  emit('pick', emoji)
}
</script>

<style scoped lang="scss">
.emoji-panel {
  position: fixed;
  left: 20rpx;
  right: 20rpx;
  bottom: calc(280rpx + env(safe-area-inset-bottom));
  z-index: 30;
  border-radius: $pc-radius-md;
  padding: 12rpx 0 8rpx;
  animation: pc-fade-up 0.25s ease;
  box-shadow: 0 -8rpx 32rpx rgba(124, 58, 237, 0.12);
}
.tabs {
  display: flex;
  gap: 8rpx;
  padding: 0 16rpx 12rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.12);
}
.tab {
  padding: 10rpx 22rpx;
  border-radius: $pc-radius-pill;
  font-size: 24rpx;
  color: $pc-muted;
  background: rgba(167, 139, 250, 0.06);
  transition: background 0.2s ease, color 0.2s ease;
}
.tab.active {
  color: $pc-text;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.32), rgba(244, 63, 94, 0.22));
  box-shadow: 0 0 16rpx rgba(167, 139, 250, 0.18);
}
.grid-wrap {
  max-height: 360rpx;
  padding: 8rpx 12rpx 4rpx;
  box-sizing: border-box;
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 12.5%;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  border-radius: $pc-radius-sm;
  transition: background 0.15s ease, transform 0.12s ease;
}
.cell:active {
  background: rgba(244, 63, 94, 0.14);
  transform: scale(1.12);
}
</style>
