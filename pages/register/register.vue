<template>
  <view class="register pc-aurora">
    <view class="hero pc-enter">
      <text class="logo">PulseChat</text>
      <text class="desc">创建你的脉冲账号</text>
    </view>

    <view class="panel pc-card pc-enter" style="animation-delay: 0.1s">
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
            confirm-type="next"
            @focus="onFocus('code')"
            @blur="onBlur"
            @confirm="focusNext('nickname')"
          />
          <text class="code-btn pc-press" :class="{ disabled: codeSeconds > 0 || sending }" @tap="sendRegisterCode">
            {{ codeSeconds > 0 ? codeSeconds + 's 后重发' : (sending ? '发送中…' : '获取验证码') }}
          </text>
        </view>
      </view>
      <view class="field">
        <text class="label">昵称<text class="label-opt">（可选）</text></text>
        <input
          class="input pc-input"
          :class="fieldClass('nickname')"
          :focus="focusTarget === 'nickname'"
          v-model="nickname"
          maxlength="64"
          placeholder="给你一个闪亮的名字"
          placeholder-class="ph"
          confirm-type="next"
          @focus="onFocus('nickname')"
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
            :focus="focusTarget === 'password'"
            :password="!showPassword"
            maxlength="32"
            v-model="password"
            placeholder="6-32位密码"
            placeholder-class="ph"
            confirm-type="next"
            @focus="onFocus('password')"
            @blur="onBlur"
            @confirm="focusNext('confirm')"
          />
          <text class="eye pc-press" @tap="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</text>
        </view>
        <view v-if="password" class="strength">
          <view class="strength-bar">
            <view class="strength-fill" :class="'lv-' + strength.level" :style="{ width: strength.percent + '%' }"></view>
          </view>
          <text class="strength-text" :class="'lv-' + strength.level">{{ strength.label }}</text>
        </view>
      </view>
      <view class="field">
        <text class="label">确认密码</text>
        <view class="input-row">
          <input
            class="input flex pc-input"
            :class="[fieldClass('confirm'), { 'is-error': confirmMismatch }]"
            :focus="focusTarget === 'confirm'"
            :password="!showConfirm"
            maxlength="32"
            v-model="confirmPassword"
            placeholder="再次输入密码"
            placeholder-class="ph"
            confirm-type="done"
            @focus="onFocus('confirm')"
            @blur="onBlur"
            @confirm="submit"
          />
          <text class="eye pc-press" @tap="showConfirm = !showConfirm">{{ showConfirm ? '隐藏' : '显示' }}</text>
        </view>
        <text v-if="confirmMismatch" class="field-error">两次输入的密码不一致</text>
      </view>
      <button
        class="pc-btn enter"
        :class="{ 'is-busy': loading }"
        :loading="loading"
        :disabled="loading"
        @tap="submit"
      >{{ loading ? '注册中…' : '注册' }}</button>
      <view class="switch-row">
        <text class="switch-text">已有账号？</text>
        <text class="switch-link" @tap="goLogin">去登录</text>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { connectWs } from '../../utils/ws.js'
import { scheduleRegisterPushClient } from '../../utils/notify.js'
import { useFormFocus } from '../../utils/form-focus.js'
import { reportCaught } from '../../utils/error-report.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const { focusTarget, onFocus, onBlur, fieldClass, focusNext } = useFormFocus()
const email = ref('')
const code = ref('')
const nickname = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)
const loading = ref(false)
const sending = ref(false)
const codeSeconds = ref(0)
let codeTimer = null

/** 密码强度：长度 + 字符种类的简单评估，仅作输入引导 */
const strength = computed(() => {
  const p = password.value || ''
  if (!p) return { level: 0, percent: 0, label: '' }
  let score = 0
  if (p.length >= 6) score += 1
  if (p.length >= 10) score += 1
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(p)).length
  if (kinds >= 2) score += 1
  if (kinds >= 3) score += 1
  if (p.length < 6) return { level: 1, percent: 20, label: '太短' }
  if (score <= 2) return { level: 1, percent: 34, label: '较弱' }
  if (score === 3) return { level: 2, percent: 67, label: '中等' }
  return { level: 3, percent: 100, label: '强' }
})

/** 两次密码都已输入且不一致时即时提示，避免提交后才发现 */
const confirmMismatch = computed(() => (
  !!confirmPassword.value && !!password.value && confirmPassword.value !== password.value
))

function goLogin() {
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: '/pages/login/login' })
  })
}

function startCountdown() {
  if (codeTimer) {
    clearInterval(codeTimer)
    codeTimer = null
  }
  codeSeconds.value = 60
  codeTimer = setInterval(() => {
    codeSeconds.value -= 1
    if (codeSeconds.value <= 0) {
      clearInterval(codeTimer)
      codeTimer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (codeTimer) clearInterval(codeTimer)
})

async function sendRegisterCode() {
  if (codeSeconds.value > 0 || sending.value) return
  if (!EMAIL_RE.test((email.value || '').trim())) {
    uni.showToast({ title: '邮箱格式不对', icon: 'none' })
    return
  }
  sending.value = true
  try {
    await api.sendEmailCode({ email: email.value.trim(), purpose: 'register' })
    uni.showToast({ title: '验证码已发送', icon: 'none' })
    startCountdown()
  } catch (e) {
  } finally {
    sending.value = false
  }
}

async function submit() {
  if (loading.value) return
  if (!EMAIL_RE.test((email.value || '').trim())) {
    uni.showToast({ title: '邮箱格式不对', icon: 'none' })
    return
  }
  if (!/^\d{6}$/.test(code.value || '')) {
    uni.showToast({ title: '请输入6位验证码', icon: 'none' })
    return
  }
  if (!password.value) {
    uni.showToast({ title: '请设置密码', icon: 'none' })
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
      email: email.value.trim(),
      code: code.value,
      nickname: nickname.value || undefined,
      password: password.value
    })
    const store = getStore()
    store.setAuth(data)
    connectWs(data.accessToken)
    scheduleRegisterPushClient(500)
    try {
      await store.fetchConversations(() => api.conversations())
    } catch (e) {
      reportCaught('register.afterAuth.conversations', e)
    }
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
.register { min-height: 100vh; padding: 100rpx 44rpx 60rpx; }
.hero { margin-bottom: 48rpx; }
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
.field { margin-bottom: 24rpx; }
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
.input.is-error { border-color: rgba(244, 63, 94, 0.6) !important; }
.label-opt { color: #6B5C7A; font-size: 22rpx; }
.eye, .code-btn {
  flex-shrink: 0; height: 64rpx; line-height: 64rpx; padding: 0 20rpx;
  color: $pc-purple; font-size: 24rpx; font-weight: 600;
  border-radius: $pc-radius-pill; background: rgba(167, 139, 250, 0.1);
  transition: color 0.2s ease, background 0.2s ease;
}
.code-btn.disabled { color: #6B5C7A; background: rgba(255, 255, 255, 0.03); pointer-events: none; }
.ph { color: #6B5C7A; }
.field-error {
  display: block;
  margin-top: 10rpx;
  padding-left: 8rpx;
  color: $pc-rose;
  font-size: 22rpx;
}
.strength {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 12rpx;
  padding: 0 4rpx;
}
.strength-bar {
  flex: 1;
  height: 6rpx;
  border-radius: 6rpx;
  background: rgba(167, 139, 250, 0.12);
  overflow: hidden;
}
.strength-fill {
  height: 100%;
  border-radius: 6rpx;
  transition: width 0.25s ease, background 0.25s ease;
  &.lv-1 { background: linear-gradient(90deg, #F43F5E, #FB7185); }
  &.lv-2 { background: linear-gradient(90deg, #E879F9, #A78BFA); }
  &.lv-3 { background: linear-gradient(90deg, #7C3AED, #A78BFA, #38BDF8); }
}
.strength-text {
  flex-shrink: 0;
  font-size: 20rpx;
  min-width: 48rpx;
  text-align: right;
  &.lv-1 { color: $pc-rose; }
  &.lv-2 { color: $pc-magenta; }
  &.lv-3 { color: $pc-purple; }
}
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
