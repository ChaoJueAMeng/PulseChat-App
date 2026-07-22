<template>
  <view class="login pc-aurora">
    <view class="hero">
      <text class="logo">PulseChat</text>
      <text class="desc">输入手机号即刻进入 · 账号自动生成</text>
    </view>

    <view class="panel pc-card">
      <view class="field">
        <text class="label">手机号</text>
        <input class="input" type="number" maxlength="11" v-model="phone" placeholder="请输入11位手机号" placeholder-class="ph" />
      </view>
      <view class="field">
        <text class="label">昵称（可选）</text>
        <input class="input" v-model="nickname" placeholder="给你一个闪亮的名字" placeholder-class="ph" />
      </view>
      <button class="pc-btn enter" :loading="loading" @tap="submit">脉冲进入</button>
      <text class="tip">跳过短信验证 · 仅用于体验环境</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { connectWs } from '../../utils/ws.js'

const phone = ref('')
const nickname = ref('')
const loading = ref(false)

async function submit() {
  if (!/^1\d{10}$/.test(phone.value)) {
    uni.showToast({ title: '手机号格式不对', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const data = await api.phoneLogin({ phone: phone.value, nickname: nickname.value || undefined })
    const store = getStore()
    store.setAuth(data)
    connectWs(data.accessToken)
    uni.vibrateShort && uni.vibrateShort()
    if (data.isNewUser) {
      uni.showToast({ title: '账号 ' + data.user.account + ' 已生成', icon: 'none', duration: 2200 })
    }
    setTimeout(() => uni.switchTab({ url: '/pages/chats/chats' }), 400)
  } catch (e) {
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login { min-height: 100vh; padding: 120rpx 40rpx 60rpx; }
.hero { margin-bottom: 60rpx; }
.logo {
  font-size: 64rpx; font-weight: 800; letter-spacing: 2rpx;
  background: linear-gradient(100deg, #2EE6A6, #29D0FF 60%, #FFC857);
  -webkit-background-clip: text; color: transparent;
}
.desc { display: block; margin-top: 16rpx; color: #7F93A8; font-size: 26rpx; }
.panel { border-radius: 28rpx; padding: 40rpx 32rpx; }
.field { margin-bottom: 28rpx; }
.label { display: block; color: #9CB0C4; font-size: 24rpx; margin-bottom: 12rpx; }
.input {
  height: 88rpx; padding: 0 24rpx; border-radius: 18rpx;
  background: rgba(255,255,255,0.04); color: #E8F4FF;
  border: 1px solid rgba(41,208,255,0.18);
}
.ph { color: #5d6f80; }
.enter { margin-top: 12rpx; height: 92rpx; line-height: 92rpx; border-radius: 999rpx; font-size: 30rpx; }
.tip { display: block; text-align: center; margin-top: 24rpx; color: #5d6f80; font-size: 22rpx; }
</style>
