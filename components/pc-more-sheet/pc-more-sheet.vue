<template>
  <view v-if="show" class="mask" @tap="emit('close')">
    <view class="panel pc-card" @tap.stop>
      <view class="head">
        <text class="title">{{ title }}</text>
        <text class="sub">{{ subtitle }}</text>
      </view>
      <view
        v-for="item in items"
        :key="item.key"
        class="item"
        :class="{ danger: item.danger, disabled: item.disabled, 'pc-press': !item.disabled }"
        @tap="onItemTap(item)"
      >
        <text>{{ item.label }}</text>
      </view>
      <view class="cancel pc-press" @tap="emit('close')">取消</view>
    </view>
  </view>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '更多' },
  subtitle: { type: String, default: '' },
  items: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'select'])

function onItemTap(item) {
  emit('select', item.key)
}
</script>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(10, 6, 20, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  animation: pc-fade-up 0.2s ease both;
}
.panel {
  position: relative;
  width: 100%;
  border-radius: $pc-radius-xl $pc-radius-xl 0 0;
  padding: 28rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  border-bottom: none;
  background:
    linear-gradient(180deg, rgba(124, 58, 237, 0.14) 0%, transparent 28%),
    rgba(20, 10, 34, 0.96);
  border: 1px solid rgba(167, 139, 250, 0.22);
  border-bottom: none;
  box-shadow:
    0 -8rpx 48rpx rgba(124, 58, 237, 0.18),
    0 -2rpx 24rpx rgba(244, 63, 94, 0.1);
  animation: pc-fade-up 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 2rpx;
    border-radius: 2rpx;
    background: linear-gradient(90deg, transparent, $pc-purple, $pc-rose, transparent);
    box-shadow: 0 0 20rpx rgba(167, 139, 250, 0.45);
  }
}
.head {
  padding: 8rpx 12rpx 20rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.12);
  margin-bottom: 8rpx;
}
.title {
  display: block;
  color: $pc-text;
  font-size: 30rpx;
  font-weight: 700;
}
.sub {
  display: block;
  margin-top: 8rpx;
  color: $pc-muted;
  font-size: 22rpx;
}
.item {
  padding: 30rpx 16rpx;
  color: $pc-text;
  font-size: 28rpx;
  text-align: center;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
  transition: background 0.15s ease, color 0.15s ease;
}
.item:active {
  background: rgba(167, 139, 250, 0.1);
}
.item.danger { color: $pc-red; }
.item.danger:active { background: rgba(244, 63, 94, 0.12); }
.item.disabled {
  color: $pc-muted;
  opacity: 0.72;
}
.cancel {
  margin-top: 16rpx;
  padding: 28rpx 16rpx;
  text-align: center;
  color: $pc-muted;
  font-size: 28rpx;
  border-radius: $pc-radius-md;
  background: rgba(167, 139, 250, 0.08);
}
</style>
