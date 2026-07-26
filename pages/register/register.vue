<template>
  <view class="register pc-aurora">
    <view class="hero pc-enter">
      <text class="logo">PulseChat</text>
      <text class="desc">创建你的脉冲账号</text>
    </view>

    <view class="panel pc-card pc-enter" style="animation-delay: 0.1s">
      <view class="field">
        <text class="label">手机号</text>
        <input class="input" type="number" maxlength="11" v-model="phone" placeholder="请输入11位手机号" placeholder-class="ph" />
      </view>
      <view class="field">
        <text class="label">昵称（可选）</text>
        <input class="input" v-model="nickname" placeholder="给你一个闪亮的名字" placeholder-class="ph" />
      </view>
      <view class="field">
        <text class="label">密码</text>
        <view class="input-row">
          <input
            class="input flex"
            :password="!showPassword"
            maxlength="32"
            v-model="password"
            placeholder="6-32位密码"
            placeholder-class="ph"
          />
          <text class="eye" @tap="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</text>
        </view>
      </view>
      <view class="field">
        <text class="label">确认密码</text>
        <view class="input-row">
          <input
            class="input flex"
            :password="!showConfirm"
            maxlength="32"
            v-model="confirmPassword"
            placeholder="再次输入密码"
            placeholder-class="ph"
          />
          <text class="eye" @tap="showConfirm = !showConfirm">{{ showConfirm ? '隐藏' : '显示' }}</text>
        </view>
      </view>
      <button class="pc-btn enter" :loading="loading" @tap="submit">注册</button>
      <view class="switch-row">
        <text class="switch-text">已有账号？</text>
        <text class="switch-link" @tap="goLogin">去登录</text>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { connectWs } from '../../utils/ws.js'
import { scheduleRegisterPushClient } from '../../utils/notify.js'

const phone = ref('')
const nickname = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)
const loading = ref(false)

function goLogin() {
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: '/pages/login/login' })
  })
}

async function submit() {
  if (!/^1\d{10}$/.test(phone.value)) {
    uni.showToast({ title: '手机号格式不对', icon: 'none' })
    return
  }
  if (!password.value) {
    uni.showToast({ title: '请输入密码', icon: 'none' })
    return
  }
  if (password.value.length < 6 || password.value.length > 32) {
    uni.showToast({ title: '密码长度为6-32位', icon: 'none' })
    return
  }
  if (password.value !== confirmPassword.value) {
    uni.showToast({ title: '两次密码不一致', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const data = await api.register({
      phone: phone.value,
      nickname: nickname.value || undefined,
      password: password.value
    })
    const store = getStore()
    store.setAuth(data)
    connectWs(data.accessToken)
    scheduleRegisterPushClient(500)
    try {
      store.setConversations(await api.conversations() || [])
    } catch (e) {}
    uni.vibrateShort && uni.vibrateShort()
    uni.showToast({ title: '账号 ' + data.user.account + ' 已生成', icon: 'none', duration: 2200 })
    setTimeout(() => uni.switchTab({ url: '/pages/chats/chats' }), 400)
  } catch (e) {
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.register { min-height: 100vh; padding: 140rpx 44rpx 60rpx; }
.hero { margin-bottom: 72rpx; }
.logo {
  font-size: 68rpx; font-weight: 800; letter-spacing: 2rpx;
  background: linear-gradient(100deg, $pc-purple, $pc-magenta 45%, $pc-red);
  background-size: 180% 180%;
  -webkit-background-clip: text; color: transparent;
  animation: pc-shine 5s linear infinite;
}
.desc { display: block; margin-top: 18rpx; color: $pc-muted; font-size: 26rpx; line-height: 1.5; }
.panel {
  border-radius: $pc-radius-xl; padding: 44rpx 36rpx;
  animation: pc-soft-glow 4s ease-in-out infinite;
}
.field { margin-bottom: 28rpx; }
.label { display: block; color: $pc-muted; font-size: 24rpx; margin-bottom: 12rpx; }
.input-row {
  display: flex; align-items: center; gap: 12rpx;
}
.input {
  height: 92rpx; padding: 0 28rpx; border-radius: $pc-radius-md;
  background: rgba(255, 255, 255, 0.04); color: $pc-text;
  border: 1px solid rgba(167, 139, 250, 0.2);
  transition: border-color 0.2s ease;
}
.input.flex { flex: 1; min-width: 0; }
.eye {
  flex-shrink: 0; padding: 0 12rpx; color: $pc-purple; font-size: 24rpx;
}
.ph { color: #6B5C7A; }
.enter {
  margin-top: 16rpx; height: 96rpx; line-height: 96rpx;
  border-radius: $pc-radius-pill; font-size: 30rpx;
}
.switch-row {
  display: flex; justify-content: center; align-items: center;
  gap: 8rpx; margin-top: 28rpx;
}
.switch-text { color: #6B5C7A; font-size: 24rpx; }
.switch-link { color: $pc-purple; font-size: 24rpx; }
</style>
