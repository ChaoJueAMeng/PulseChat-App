<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">修改密码</text>
      </view>
    </view>

    <scroll-view scroll-y class="body" :bounces="true">
      <view class="panel pc-card pc-enter">
        <view class="tip-box">
          <text class="tip-ico">✉</text>
          <text class="tip">验证码将发送到 <text class="tip-strong">{{ maskedEmail || '已绑定邮箱' }}</text></text>
        </view>
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
            @confirm="focusNext('password')"
          />
          <text class="code-btn pc-press" :class="{ disabled: codeSeconds > 0 || sending }" @tap="sendCode">
            {{ codeSeconds > 0 ? codeSeconds + 's 后重发' : (sending ? '发送中…' : '获取验证码') }}
          </text>
        </view>
        <text class="label">新密码</text>
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
        <text class="label">确认新密码</text>
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
        <button
          class="pc-btn save"
          :class="{ 'is-busy': loading }"
          :loading="loading"
          :disabled="loading"
          @tap="submit"
        >{{ loading ? '保存中…' : '保存' }}</button>
      </view>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { useFormFocus } from '../../utils/form-focus.js'

const { focusTarget, onFocus, onBlur, fieldClass, focusNext } = useFormFocus()
const maskedEmail = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)
const loading = ref(false)
const sending = ref(false)
const codeSeconds = ref(0)
let codeTimer = null
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
const confirmMismatch = computed(() => (
  !!confirmPassword.value && !!password.value && confirmPassword.value !== password.value
))

function goBack() {
  uni.navigateBack()
}

/** 邮箱打码：保留前 2 位与域名，避免在页面上完整暴露 */
function maskEmail(email) {
  const s = String(email || '')
  const at = s.indexOf('@')
  if (at <= 0) return s
  const name = s.slice(0, at)
  const domain = s.slice(at)
  if (name.length <= 2) return name[0] + '***' + domain
  return name.slice(0, 2) + '***' + domain
}

onMounted(async () => {
  try {
    const me = await api.me()
    if (!me?.email) {
      uni.showToast({ title: '请先绑定邮箱', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 400)
      return
    }
    maskedEmail.value = maskEmail(me.email)
  } catch (e) {}
})

onUnmounted(() => {
  if (codeTimer) clearInterval(codeTimer)
})

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

async function sendCode() {
  if (codeSeconds.value > 0 || sending.value) return
  sending.value = true
  try {
    await api.sendPasswordCode()
    uni.showToast({ title: '验证码已发送', icon: 'none' })
    startCountdown()
    focusNext('code')
  } catch (e) {
  } finally {
    sending.value = false
  }
}

async function submit() {
  if (loading.value) return
  if (!/^\d{6}$/.test(code.value || '')) {
    uni.showToast({ title: '请输入6位验证码', icon: 'none' })
    return
  }
  if (!password.value) {
    uni.showToast({ title: '请设置新密码', icon: 'none' })
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
    const user = await api.updatePassword({ code: code.value, newPassword: password.value })
    getStore().state.user = user
    uni.setStorageSync('pc_user', user)
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
    uni.showToast({ title: '密码已更新', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch (e) {
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.body {
  flex: 1;
  height: 0;
  padding: 28rpx;
  box-sizing: border-box;
}
.panel {
  width: 100%;
  border-radius: $pc-radius-xl;
  padding: 32rpx;
  box-sizing: border-box;
}
.tip-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 18rpx;
  border-radius: $pc-radius-md;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.tip-ico {
  flex-shrink: 0;
  width: 32rpx; height: 32rpx; line-height: 32rpx;
  border-radius: 50%;
  text-align: center;
  font-size: 18rpx;
  color: $pc-purple;
  background: rgba(167, 139, 250, 0.18);
}
.tip { flex: 1; color: $pc-muted; font-size: 22rpx; line-height: 1.5; }
.tip-strong { color: $pc-text; font-weight: 600; }
.label { display: block; color: $pc-muted; font-size: 24rpx; margin: 22rpx 0 12rpx; }
.input-row { display: flex; align-items: center; gap: 12rpx; }
.input {
  height: 92rpx; padding: 0 28rpx; border-radius: $pc-radius-md;
  background: rgba(255, 255, 255, 0.04); color: $pc-text;
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.input.flex { flex: 1; min-width: 0; }
.input.is-error { border-color: rgba(244, 63, 94, 0.6) !important; }
.field-error { display: block; margin-top: 10rpx; padding-left: 8rpx; color: $pc-rose; font-size: 22rpx; }
.eye, .code-btn {
  flex-shrink: 0; height: 64rpx; line-height: 64rpx; padding: 0 20rpx;
  color: $pc-purple; font-size: 24rpx; font-weight: 600;
  border-radius: $pc-radius-pill; background: rgba(167, 139, 250, 0.1);
  transition: color 0.2s ease, background 0.2s ease;
}
.code-btn.disabled { color: #6B5C7A; background: rgba(255, 255, 255, 0.03); pointer-events: none; }
.ph { color: rgba(226, 232, 240, 0.35); }
.save {
  margin-top: 32rpx; height: 88rpx; line-height: 88rpx;
  border-radius: $pc-radius-pill;
}
</style>
