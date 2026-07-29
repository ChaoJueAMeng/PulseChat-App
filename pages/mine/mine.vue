<template>
  <view class="mine-page">
  <view
    class="mine pc-aurora"
    :class="tabAnimClass"
    @touchstart="onTabSwipeStart"
    @touchend="onTabSwipeEnd"
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
      @touchstart="onTabSwipeStart"
      @touchend="onTabSwipeEnd"
    >
      <view class="hero pc-card pc-enter">
        <pc-avatar
          :url="user?.avatar"
          :name="user?.nickname || 'P'"
          :size="128"
          clickable
          @tap="changeAvatar"
        />
        <view class="info">
          <text class="name">{{ user?.nickname || '用户' }}</text>
          <text v-if="user?.account" class="acc">账号 {{ user.account }}</text>
          <text v-if="user?.phone" class="phone">{{ user.phone }}</text>
        </view>
      </view>

      <view class="menu pc-card pc-enter" style="animation-delay: 0.08s">
        <view class="item pc-press" @tap="goEdit">编辑资料</view>
        <view class="item pc-press" @tap="goStickers">表情包管理</view>
        <view class="item pc-press" @tap="openAi">与 Kimi 私聊</view>
        <view class="item pc-press" @tap="copyAccount">复制账号</view>
        <view class="item danger pc-press" @tap="logout">退出登录</view>
      </view>

      <view class="menu notify-menu pc-card pc-enter" style="animation-delay: 0.11s">
        <view class="item switch-row">
          <view class="switch-texts">
            <text class="switch-title">消息提醒</text>
            <text class="switch-desc">新消息与好友申请将弹出系统通知栏</text>
          </view>
          <switch
            :checked="notifyPrefs.enabled"
            color="#A78BFA"
            @change="onNotifyEnabled"
          />
        </view>
      </view>

      <view class="bio pc-card pc-enter" style="animation-delay: 0.14s">
        <text class="label">个性签名</text>
        <text class="text">{{ user?.bio || '这个人很酷，什么都没写' }}</text>
      </view>
    </scroll-view>
  </view>
  <pc-tabbar :current="2" />
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow, onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { pickAndUploadAvatar } from '../../utils/avatar.js'
import {
  getNotifyPrefs,
  setNotifyPrefs,
  registerPushClient,
  unregisterPushClient
} from '../../utils/notify.js'
import { handleRootBackPress } from '../../utils/quit.js'
import { useTabPageTransition } from '../../utils/tab-swipe.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

onBackPress(() => handleRootBackPress())
const { tabAnimClass, onTabSwipeStart, onTabSwipeEnd } = useTabPageTransition(2)

const store = getStore()
const user = ref(store.state.user || null)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
const notifyPrefs = ref(getNotifyPrefs())

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
  const conv = await api.openAiChat()
  uni.navigateTo({ url: '/pages/chat/chat?id=' + conv.id + '&title=' + encodeURIComponent('Kimi助手') })
}
function copyAccount() {
  uni.setClipboardData({ data: user.value?.account || '' })
}
async function logout() {
  try {
    await unregisterPushClient()
  } catch (e) {}
  getStore().clearAuth()
  uni.reLaunch({ url: '/pages/login/login' })
}

onShow(() => {
  try { uni.hideTabBar({ animation: false }) } catch (e) {}
  notifyPrefs.value = getNotifyPrefs()
  load()
})
</script>

<style scoped lang="scss">
.mine-page {
  height: 100vh;
  overflow: hidden;
}
.mine {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
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
  display: flex; gap: 24rpx; align-items: center; padding: 32rpx; margin-bottom: 24rpx;
  border-radius: $pc-radius-xl;
}
.info { flex: 1; min-width: 0; }
.name { display: block; font-size: 36rpx; font-weight: 800; color: $pc-text; }
.acc, .phone { display: block; margin-top: 8rpx; color: $pc-muted; font-size: 22rpx; }
.menu { border-radius: $pc-radius-xl; overflow: hidden; margin-bottom: 24rpx; }
.item {
  padding: 30rpx 28rpx; color: $pc-text; font-size: 28rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.1);
  &:last-child { border-bottom: none; }
  &.danger { color: $pc-rose; }
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  &.disabled { opacity: 0.45; }
}
.switch-texts {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.switch-title { color: $pc-text; font-size: 28rpx; }
.switch-desc { color: $pc-muted; font-size: 22rpx; }
.notify-menu .item:last-child { border-bottom: none; }
.bio { padding: 28rpx; border-radius: $pc-radius-xl; }
.label { display: block; color: $pc-muted; font-size: 22rpx; margin-bottom: 12rpx; }
.text { color: $pc-text; font-size: 26rpx; line-height: 1.6; }
</style>
