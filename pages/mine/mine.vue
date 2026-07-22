<template>
  <view class="mine pc-aurora">
    <view class="hero pc-card">
      <view class="avatar">{{ (user?.nickname || 'P').slice(0,1) }}</view>
      <view>
        <text class="name">{{ user?.nickname }}</text>
        <text class="acc">账号 {{ user?.account }}</text>
        <text class="phone">{{ user?.phone }}</text>
      </view>
    </view>

    <view class="menu pc-card">
      <view class="item" @tap="goEdit">编辑资料</view>
      <view class="item" @tap="openAi">与 Kimi 私聊</view>
      <view class="item" @tap="copyAccount">复制账号</view>
      <view class="item danger" @tap="logout">退出登录</view>
    </view>

    <view class="bio pc-card">
      <text class="label">个性签名</text>
      <text class="text">{{ user?.bio || '这个人很酷，什么都没写' }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'

const user = ref(null)

async function load() {
  user.value = await api.me()
  const store = getStore()
  store.state.user = user.value
  uni.setStorageSync('pc_user', user.value)
}

function goEdit() { uni.navigateTo({ url: '/pages/profile-edit/profile-edit' }) }
async function openAi() {
  const conv = await api.openAiChat()
  uni.navigateTo({ url: '/pages/chat/chat?id=' + conv.id + '&title=' + encodeURIComponent('Kimi助手') })
}
function copyAccount() {
  uni.setClipboardData({ data: user.value?.account || '' })
}
function logout() {
  getStore().clearAuth()
  uni.reLaunch({ url: '/pages/login/login' })
}

onShow(load)
</script>

<style scoped lang="scss">
.mine { min-height: 100vh; padding: 24rpx; }
.hero {
  display: flex; gap: 24rpx; align-items: center; padding: 32rpx; border-radius: 28rpx; margin-bottom: 20rpx;
}
.avatar {
  width: 120rpx; height: 120rpx; border-radius: 32rpx;
  background: linear-gradient(135deg, #2EE6A6, #29D0FF); color: #041018;
  display: flex; align-items: center; justify-content: center; font-size: 48rpx; font-weight: 800;
}
.name { display: block; font-size: 36rpx; font-weight: 800; color: #E8F4FF; }
.acc, .phone { display: block; color: #7F93A8; font-size: 22rpx; margin-top: 6rpx; }
.menu, .bio { border-radius: 24rpx; padding: 8rpx 0; margin-bottom: 20rpx; }
.item { padding: 28rpx 28rpx; color: #E8F4FF; font-size: 28rpx; border-bottom: 1px solid rgba(255,255,255,.04); }
.item:last-child { border-bottom: none; }
.danger { color: #FF6B4A; }
.label { display: block; color: #7F93A8; font-size: 22rpx; padding: 24rpx 28rpx 8rpx; }
.text { display: block; color: #E8F4FF; font-size: 28rpx; padding: 0 28rpx 28rpx; }
</style>
