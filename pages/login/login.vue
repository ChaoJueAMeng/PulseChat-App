<template>
  <view class="login pc-aurora">
    <view class="hero pc-enter">
      <text class="logo">PulseChat</text>
      <text class="desc">登录你的脉冲账号</text>
    </view>

    <view class="panel pc-card pc-enter" style="animation-delay: 0.1s">
      <view class="mode-tabs">
        <view class="mode-btn" :class="{ on: mode === 'password' }" @tap="mode = 'password'">
          <text class="mode-btn-text">密码登录</text>
        </view>
        <view class="mode-btn" :class="{ on: mode === 'code' }" @tap="mode = 'code'">
          <text class="mode-btn-text">验证码登录</text>
        </view>
      </view>

      <template v-if="mode === 'password'">
        <view class="field">
          <text class="label">账号</text>
          <input
            class="input pc-input"
            :class="fieldClass('account')"
            v-model="account"
            placeholder="请输入手机号或邮箱"
            placeholder-class="ph"
            confirm-type="next"
            @focus="onFocus('account')"
            @blur="onBlur"
            @confirm="focusNext('password')"
          />
        </view>
        <view class="field">
          <text class="label">密码</text>
          <view class="input-row">
            <input
              class="input flex pc-input"
              :class="fieldClass('password')"
              :password="!showPassword"
              :focus="focusTarget === 'password'"
              maxlength="32"
              v-model="password"
              placeholder="6-32位密码"
              placeholder-class="ph"
              confirm-type="done"
              @focus="onFocus('password')"
              @blur="onBlur"
              @confirm="submit"
            />
            <text class="eye pc-press" @tap="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</text>
          </view>
        </view>
      </template>

      <template v-else>
        <view class="field">
          <text class="label">邮箱</text>
          <input
            class="input pc-input"
            :class="fieldClass('email')"
            v-model="email"
            placeholder="请输入邮箱"
            placeholder-class="ph"
            confirm-type="next"
            @focus="onFocus('email')"
            @blur="onBlur"
            @confirm="focusNext('code')"
          />
        </view>
        <view class="field">
          <text class="label">验证码</text>
          <view class="input-row">
            <input
              class="input flex pc-input"
              :class="fieldClass('code')"
              :focus="focusTarget === 'code'"
              type="number"
              maxlength="6"
              v-model="code"
              placeholder="6位验证码"
              placeholder-class="ph"
              confirm-type="done"
              @focus="onFocus('code')"
              @blur="onBlur"
              @confirm="submit"
            />
            <text class="code-btn pc-press" :class="{ disabled: codeSeconds > 0 || sending }" @tap="sendLoginCode">
              {{ codeSeconds > 0 ? codeSeconds + 's 后重发' : (sending ? '发送中…' : '获取验证码') }}
            </text>
          </view>
        </view>
      </template>

      <button
        class="pc-btn enter"
        :class="{ 'is-busy': loading }"
        :loading="loading"
        :disabled="loading"
        @tap="submit"
      >{{ loading ? '登录中…' : '登录' }}</button>
      <view class="switch-row">
        <text class="switch-text">还没有账号？</text>
        <text class="switch-link" @tap="goRegister">去注册</text>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { connectWs } from '../../utils/ws.js'
import { scheduleRegisterPushClient } from '../../utils/notify.js'
import { useFormFocus } from '../../utils/form-focus.js'
import { reportCaught } from '../../utils/error-report.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^1\d{10}$/

const { focusTarget, onFocus, onBlur, fieldClass, focusNext } = useFormFocus()
const mode = ref('password')
const account = ref('')
const email = ref('')
const password = ref('')
const code = ref('')
const showPassword = ref(false)
const loading = ref(false)
const sending = ref(false)
const codeSeconds = ref(0)
let codeTimer = null

function goRegister() {
  uni.navigateTo({ url: '/pages/register/register' })
}

function startCountdown() {
  clearCountdown()
  codeSeconds.value = 60
  codeTimer = setInterval(() => {
    codeSeconds.value -= 1
    if (codeSeconds.value <= 0) clearCountdown()
  }, 1000)
}

function clearCountdown() {
  if (codeTimer) {
    clearInterval(codeTimer)
    codeTimer = null
  }
  if (codeSeconds.value < 0) codeSeconds.value = 0
}

onUnmounted(clearCountdown)

/** 一般做法：含 @ 按邮箱；纯 11 位手机号按手机；否则报错 */
function resolveAccount(raw) {
  const value = (raw || '').trim()
  if (!value) {
    return { error: '请输入手机号或邮箱' }
  }
  if (value.includes('@')) {
    if (!EMAIL_RE.test(value)) {
      return { error: '邮箱格式不对' }
    }
    return { email: value }
  }
  if (/^\d+$/.test(value)) {
    if (!PHONE_RE.test(value)) {
      return { error: '手机号格式不对' }
    }
    return { phone: value }
  }
  return { error: '请输入正确的手机号或邮箱' }
}

async function afterAuth(data, toast) {
  const store = getStore()
  store.setAuth(data)
  connectWs(data.accessToken)
  scheduleRegisterPushClient(500)
  try {
    await store.fetchConversations(() => api.conversations())
  } catch (e) {
    reportCaught('login.afterAuth.conversations', e)
  }
  uni.vibrateShort && uni.vibrateShort()
  uni.showToast({ title: toast, icon: 'none' })
  setTimeout(() => uni.switchTab({ url: '/pages/chats/chats' }), 400)
}

async function sendLoginCode() {
  if (codeSeconds.value > 0 || sending.value) return
  if (!EMAIL_RE.test((email.value || '').trim())) {
    uni.showToast({ title: '邮箱格式不对', icon: 'none' })
    return
  }
  sending.value = true
  try {
    await api.sendEmailCode({ email: email.value.trim(), purpose: 'login' })
    uni.showToast({ title: '验证码已发送', icon: 'none' })
    startCountdown()
  } catch (e) {
  } finally {
    sending.value = false
  }
}

async function submit() {
  if (loading.value) return
  if (mode.value === 'code') {
    if (!EMAIL_RE.test((email.value || '').trim())) {
      uni.showToast({ title: '邮箱格式不对', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(code.value || '')) {
      uni.showToast({ title: '请输入6位验证码', icon: 'none' })
      return
    }
    loading.value = true
    try {
      const data = await api.loginByEmailCode({
        email: email.value.trim(),
        code: code.value
      })
      await afterAuth(data, '登录成功')
    } catch (e) {
    } finally {
      loading.value = false
    }
    return
  }

  const resolved = resolveAccount(account.value)
  if (resolved.error) {
    uni.showToast({ title: resolved.error, icon: 'none' })
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
  loading.value = true
  try {
    const payload = { password: password.value }
    if (resolved.phone) payload.phone = resolved.phone
    else payload.email = resolved.email
    const data = await api.login(payload)
    await afterAuth(data, '登录成功')
  } catch (e) {
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login { min-height: 100vh; padding: 140rpx 44rpx 60rpx; }
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
.mode-tabs {
  display: flex; gap: 16rpx; margin-bottom: 32rpx;
}
.mode-btn {
  flex: 1;
  height: 72rpx;
  border-radius: $pc-radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(167, 139, 250, 0.18);
  transition: all 0.2s ease;
  &.on {
    background: rgba(167, 139, 250, 0.22);
    border-color: rgba(167, 139, 250, 0.55);
    box-shadow: 0 0 24rpx rgba(167, 139, 250, 0.18);
  }
}
.mode-btn-text {
  font-size: 26rpx;
  color: #6B5C7A;
  font-weight: 600;
}
.mode-btn.on .mode-btn-text {
  color: $pc-purple;
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
.eye, .code-btn {
  flex-shrink: 0; height: 64rpx; line-height: 64rpx; padding: 0 20rpx;
  color: $pc-purple; font-size: 24rpx; font-weight: 600;
  border-radius: $pc-radius-pill; background: rgba(167, 139, 250, 0.1);
  transition: color 0.2s ease, background 0.2s ease;
}
.code-btn.disabled { color: #6B5C7A; background: rgba(255, 255, 255, 0.03); pointer-events: none; }
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
