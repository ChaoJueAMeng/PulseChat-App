<template>
  <view
    class="mine pc-aurora"
    @touchstart="$emit('swipeStart', $event)"
    @touchmove="$emit('swipeMove', $event)"
    @touchend="$emit('swipeEnd', $event)"
    @touchcancel="$emit('swipeCancel', $event)"
  >
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-title-wrap">
        <text class="pc-nav-title">我的</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
      @touchstart.stop="$emit('swipeStart', $event)"
      @touchmove.stop="$emit('swipeMove', $event)"
      @touchend.stop="$emit('swipeEnd', $event)"
      @touchcancel.stop="$emit('swipeCancel', $event)"
    >
      <view class="hero pc-card pc-enter pc-press" @tap="goEdit">
        <view class="hero-avatar" @tap.stop="changeAvatar">
          <pc-avatar
            :url="user?.avatar"
            :name="user?.nickname || 'P'"
            :size="128"
            clickable
          />
          <view class="hero-avatar__edit">
            <text>换</text>
          </view>
        </view>
        <view class="info">
          <text class="name">{{ user?.nickname || '用户' }}</text>
          <view v-if="user?.account" class="acc-row" @tap.stop="copyAccount">
            <text class="acc">账号 {{ user.account }}</text>
            <text class="acc-copy">复制</text>
          </view>
          <text class="bio-line">{{ user?.bio || '这个人很酷，什么都没写' }}</text>
        </view>
        <view class="pc-chevron"></view>
      </view>

      <view class="group pc-enter" style="animation-delay: 0.06s">
        <text class="group-title">账号与安全</text>
        <view class="menu pc-card">
          <view class="item pc-press" @tap="goEdit">
            <view class="pc-item-ico">✎</view>
            <text class="item-label">编辑资料</text>
            <view class="pc-chevron"></view>
          </view>
          <view class="item pc-press" :class="{ 'is-static': !!user?.email }" @tap="goBindEmail">
            <view class="pc-item-ico">✉</view>
            <text class="item-label">邮箱</text>
            <text v-if="user?.email" class="item-extra">{{ user.email }}</text>
            <text v-else class="item-extra hint">未绑定</text>
            <view v-if="user?.email" class="item-lock">
              <text>已绑定</text>
            </view>
            <view v-else class="pc-chevron"></view>
          </view>
          <view class="item pc-press" @tap="goPhone">
            <view class="pc-item-ico">☏</view>
            <text class="item-label">手机号</text>
            <text v-if="user?.phone" class="item-extra">{{ maskPhone(user.phone) }}</text>
            <text v-else class="item-extra hint">未添加</text>
            <view class="pc-chevron"></view>
          </view>
          <view class="item pc-press" @tap="goPassword">
            <view class="pc-item-ico">⚿</view>
            <text class="item-label">修改密码</text>
            <text v-if="!user?.email" class="item-extra hint">需先绑定邮箱</text>
            <view class="pc-chevron"></view>
          </view>
        </view>
      </view>

      <view class="group pc-enter" style="animation-delay: 0.09s">
        <text class="group-title">功能</text>
        <view class="menu pc-card">
          <view class="item pc-press" @tap="goStickers">
            <view class="pc-item-ico">☺</view>
            <text class="item-label">表情包管理</text>
            <view class="pc-chevron"></view>
          </view>
          <view class="item pc-press" :class="{ 'is-busy': openingAi }" @tap="openAi">
            <view class="pc-item-ico">✦</view>
            <text class="item-label">与 Kimi 私聊</text>
            <text v-if="openingAi" class="item-extra hint">打开中…</text>
            <view class="pc-chevron"></view>
          </view>
          <view class="item switch-row">
            <view class="pc-item-ico">♪</view>
            <view class="switch-texts">
              <text class="item-label">消息提醒</text>
              <text class="switch-desc">新消息与好友申请将弹出系统通知</text>
            </view>
            <switch
              :checked="notifyPrefs.enabled"
              color="#A78BFA"
              @change="onNotifyEnabled"
            />
          </view>
        </view>
      </view>

      <view class="group pc-enter" style="animation-delay: 0.12s">
        <view class="menu pc-card">
          <view class="item danger pc-press" @tap="logout">
            <view class="pc-item-ico danger">⏻</view>
            <text class="item-label">退出登录</text>
          </view>
        </view>
      </view>

      <text class="version">PulseChat · v{{ appVersion }}</text>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { pickAndUploadAvatar } from '../../utils/avatar.js'
import {
  getNotifyPrefs,
  setNotifyPrefs,
  registerPushClient,
  unregisterPushClient
} from '../../utils/notify.js'
import { runAfterTabEnter } from '../../utils/tab-swipe.js'
import { disconnectWs } from '../../utils/ws.js'
import PcAvatar from '../pc-avatar/pc-avatar.vue'

const props = defineProps({
  active: { type: Boolean, default: false }
})

defineEmits(['swipeStart', 'swipeMove', 'swipeEnd', 'swipeCancel'])

const store = getStore()
const user = ref(store.state.user || null)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
const notifyPrefs = ref(getNotifyPrefs())
const openingAi = ref(false)
const appVersion = readAppVersion()

function readAppVersion() {
  try {
    const info = uni.getSystemInfoSync() || {}
    return info.appVersion || info.appWgtVersion || '1.0'
  } catch (e) {
    return '1.0'
  }
}

/** 手机号中间四位打码，避免个人页直接暴露完整号码 */
function maskPhone(phone) {
  const s = String(phone || '')
  if (s.length !== 11) return s
  return s.slice(0, 3) + '****' + s.slice(7)
}

function onNotifyEnabled(e) {
  const enabled = !!e.detail.value
  notifyPrefs.value = setNotifyPrefs({ enabled })
  if (enabled) {
    registerPushClient().catch(() => {})
  } else {
    unregisterPushClient().catch(() => {})
  }
}

async function load() {
  user.value = await api.me()
  store.state.user = user.value
  uni.setStorageSync('pc_user', user.value)
}

function goEdit() { uni.navigateTo({ url: '/pages/profile-edit/profile-edit' }) }
function goBindEmail() {
  if (user.value?.email) {
    uni.showToast({ title: '邮箱绑定后不可更改', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/account/bind-email' })
}
function goPhone() { uni.navigateTo({ url: '/pages/account/phone' }) }
function goPassword() {
  if (!user.value?.email) {
    uni.showToast({ title: '请先绑定邮箱', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/account/change-password' })
}
function goStickers() { uni.navigateTo({ url: '/pages/sticker-manage/sticker-manage' }) }
async function changeAvatar() {
  try {
    user.value = await pickAndUploadAvatar()
  } catch (e) {
    if (e?.errMsg && e.errMsg.includes('cancel')) return
    uni.showToast({ title: e?.message || '上传失败', icon: 'none' })
  }
}
async function openAi() {
  if (openingAi.value) return
  openingAi.value = true
  try {
    const conv = await api.openAiChat()
    uni.navigateTo({ url: '/pages/chat/chat?id=' + conv.id + '&title=' + encodeURIComponent('Kimi助手') })
  } catch (e) {
  } finally {
    openingAi.value = false
  }
}
function copyAccount() {
  const account = user.value?.account || ''
  if (!account) {
    uni.showToast({ title: '暂无账号', icon: 'none' })
    return
  }
  uni.setClipboardData({
    data: account,
    showToast: false,
    success: () => {
      try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
      uni.showToast({ title: '账号已复制', icon: 'success' })
    },
    fail: () => {
      uni.showToast({ title: '复制失败', icon: 'none' })
    }
  })
}
function logout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后将无法接收新消息通知，确定退出当前账号？',
    confirmText: '退出',
    confirmColor: '#F43F5E',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await unregisterPushClient()
      } catch (e) {}
      getStore().clearAuth()
      disconnectWs()
      uni.reLaunch({ url: '/pages/login/login' })
    }
  })
}

watch(() => props.active, (v) => {
  if (!v) return
  notifyPrefs.value = getNotifyPrefs()
  runAfterTabEnter(() => { load() })
}, { immediate: true })
</script>

<style scoped lang="scss">
.mine {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.page-header {
  margin: 0;
  width: 100%;
  flex-shrink: 0;
}
.body {
  flex: 1;
  height: 0;
  padding: 28rpx 28rpx calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.hero {
  display: flex; gap: 24rpx; align-items: center; padding: 32rpx 28rpx 32rpx 32rpx; margin-bottom: 28rpx;
  border-radius: $pc-radius-xl;
  background:
    linear-gradient(135deg, rgba(124, 58, 237, 0.22) 0%, transparent 55%),
    linear-gradient(315deg, rgba(244, 63, 94, 0.14) 0%, transparent 50%),
    rgba(28, 16, 48, 0.92);
}
.hero-avatar {
  position: relative;
  flex-shrink: 0;
}
.hero-avatar__edit {
  position: absolute;
  right: -6rpx;
  bottom: -6rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
  border: 3rpx solid rgba(20, 10, 34, 0.95);
  box-shadow: 0 4rpx 12rpx rgba(124, 58, 237, 0.4);
  text { color: #fff; font-size: 18rpx; font-weight: 700; line-height: 1; }
}
.info { flex: 1; min-width: 0; }
.name {
  display: block; font-size: 36rpx; font-weight: 800; color: $pc-text;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.acc-row {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 10rpx;
  padding: 6rpx 14rpx 6rpx 0;
}
.acc { color: $pc-muted; font-size: 22rpx; }
.acc-copy {
  font-size: 20rpx;
  color: $pc-purple;
  padding: 2rpx 12rpx;
  border-radius: $pc-radius-pill;
  background: rgba(167, 139, 250, 0.14);
}
.bio-line {
  display: block;
  margin-top: 8rpx;
  color: #8B7A9E;
  font-size: 22rpx;
  line-height: 1.5;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.group { margin-bottom: 26rpx; }
.group-title {
  display: block;
  color: $pc-muted;
  font-size: 22rpx;
  letter-spacing: 1rpx;
  margin: 0 8rpx 14rpx;
}
.menu { border-radius: $pc-radius-xl; overflow: hidden; }
.item {
  display: flex; align-items: center; gap: 20rpx;
  padding: 26rpx 24rpx 26rpx 24rpx; color: $pc-text; font-size: 28rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.1);
  transition: background 0.15s ease;
  &:last-child { border-bottom: none; }
  &:active { background: rgba(167, 139, 250, 0.08); }
  &.danger { color: $pc-rose; }
  &.danger:active { background: rgba(244, 63, 94, 0.1); }
  &.is-static:active { background: transparent; }
  &.is-busy { opacity: 0.7; }
}
.item-label { flex: 1; min-width: 0; }
.item-extra {
  color: $pc-muted; font-size: 22rpx; flex-shrink: 1; min-width: 0;
  max-width: 280rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  &.hint { color: #6B5C7A; }
}
.item-lock {
  flex-shrink: 0;
  padding: 4rpx 14rpx;
  border-radius: $pc-radius-pill;
  background: rgba(167, 139, 250, 0.12);
  text { font-size: 20rpx; color: $pc-purple; }
}
.switch-row {
  &:active { background: transparent; }
}
.switch-texts {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.switch-desc { color: $pc-muted; font-size: 22rpx; }
.version {
  display: block;
  text-align: center;
  color: #4F4362;
  font-size: 20rpx;
  letter-spacing: 1rpx;
  padding: 8rpx 0 24rpx;
}
</style>
