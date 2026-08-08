<template>
  <view class="drawer-root">
    <view class="drawer-header" :style="headerStyle">
      <view class="profile pc-press" @tap="emit('action', 'profile')">
        <pc-avatar :url="avatar" :name="userName || 'P'" :size="96" />
        <view class="profile-meta">
          <text class="profile-name">{{ userName || '旅人' }}</text>
          <text class="profile-sub">查看或编辑资料</text>
        </view>
        <text class="profile-arrow">›</text>
      </view>
    </view>

    <scroll-view scroll-y class="drawer-body" :bounces="true">
      <view class="section">
        <text class="sec-label">快捷</text>
        <view class="menu pc-card">
          <view
            v-for="item in quickItems"
            :key="item.key"
            class="item pc-press"
            @tap="emit('action', item.key)"
          >
            <text class="item-icon">{{ item.icon }}</text>
            <text class="item-label">{{ item.label }}</text>
            <text class="item-arrow">›</text>
          </view>
        </view>
      </view>

      <view class="section">
        <text class="sec-label">更多</text>
        <view class="menu pc-card">
          <view
            v-for="item in moreItems"
            :key="item.key"
            class="item pc-press"
            @tap="emit('action', item.key)"
          >
            <text class="item-icon">{{ item.icon }}</text>
            <text class="item-label">{{ item.label }}</text>
            <text class="item-arrow">›</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import PcAvatar from '../pc-avatar/pc-avatar.vue'

defineProps({
  userName: { type: String, default: '' },
  avatar: { type: String, default: '' }
})

const emit = defineEmits(['action', 'close'])

const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

const quickItems = [
  { key: 'scan', label: '扫一扫', icon: '▣' },
  { key: 'search', label: '添加好友', icon: '⌕' },
  { key: 'group', label: '创建群聊', icon: '⊕' },
  { key: 'ai', label: '找 Kimi', icon: '✦' }
]

const moreItems = [
  { key: 'contacts', label: '通讯录', icon: '◎' },
  { key: 'stickers', label: '表情包管理', icon: '☺' },
  { key: 'profile', label: '编辑资料', icon: '✎' },
  { key: 'mine', label: '设置与账号', icon: '⚙' }
]
</script>

<style scoped lang="scss">
.drawer-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  background:
    linear-gradient(165deg, rgba(74, 29, 107, 0.55) 0%, transparent 42%),
    linear-gradient(180deg, #140A22 0%, #0A0614 100%);
  border-right: 1px solid rgba(167, 139, 250, 0.22);
  box-shadow: 12rpx 0 40rpx rgba(88, 28, 135, 0.35);
}
.drawer-header {
  flex-shrink: 0;
  padding: 12rpx 28rpx 20rpx;
  background: linear-gradient(105deg, rgba(36, 18, 63, 0.96) 0%, rgba(74, 29, 107, 0.9) 55%, rgba(122, 31, 76, 0.85) 100%);
  border-bottom: 1px solid rgba(232, 121, 249, 0.16);
}
.profile {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 8rpx;
}
.profile-meta {
  flex: 1;
  min-width: 0;
}
.profile-name {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: $pc-text;
}
.profile-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: $pc-muted;
}
.profile-arrow {
  color: $pc-muted;
  font-size: 36rpx;
  line-height: 1;
}
.drawer-body {
  flex: 1;
  height: 0;
  padding: 24rpx 24rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.section {
  margin-bottom: 28rpx;
}
.sec-label {
  display: block;
  margin: 0 8rpx 14rpx;
  font-size: 22rpx;
  color: $pc-muted;
  letter-spacing: 1rpx;
}
.menu {
  border-radius: $pc-radius-xl;
  overflow: hidden;
}
.item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 28rpx 26rpx;
  color: $pc-text;
  font-size: 28rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.1);
  &:last-child { border-bottom: none; }
  &:active { background: rgba(167, 139, 250, 0.12); }
}
.item-icon {
  width: 40rpx;
  text-align: center;
  color: $pc-purple;
  font-size: 28rpx;
}
.item-label {
  flex: 1;
  font-weight: 600;
}
.item-arrow {
  color: $pc-muted;
  font-size: 30rpx;
}
</style>
