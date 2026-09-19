<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">绑定邮箱</text>
      </view>
    </view>

    <scroll-view scroll-y class="body" :bounces="true">
      <view class="panel pc-card pc-enter">
        <view class="tip-box">
          <text class="tip-ico">!</text>
          <text class="tip">邮箱用于验证码登录与找回密码，绑定后无法更改</text>
        </view>
        <text class="label">邮箱</text>
        <input
          class="input pc-input"
          :class="fieldClass('email')"
          v-model="email"
          :focus="focusTarget === 'email'"
          placeholder="请输入邮箱"
          placeholder-class="ph"
          confirm-type="next"
          @focus="onFocus('email')"
          @blur="onBlur"
          @confirm="focusNext('code')"
        />
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
          <text class="code-btn pc-press" :class="{ disabled: codeSeconds > 0 || sending }" @tap="sendCode">
            {{ codeSeconds > 0 ? codeSeconds + 's 后重发' : (sending ? '发送中…' : '获取验证码') }}
          </text>
        </view>
        <button
          class="pc-btn save"
          :class="{ 'is-busy': loading }"
          :loading="loading"
          :disabled="loading"
          @tap="submit"
        >{{ loading ? '绑定中…' : '绑定' }}</button>
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const { focusTarget, onFocus, onBlur, fieldClass, focusNext } = useFormFocus()
const email = ref('')
const code = ref('')
const loading = ref(false)
const sending = ref(false)
const codeSeconds = ref(0)
let codeTimer = null
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

function goBack() {
  uni.navigateBack()
}

onMounted(async () => {
  try {
    const me = await api.me()
    if (me?.email) {
      uni.showToast({ title: '邮箱绑定后不可更改', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 400)
      return
    }
  } catch (e) {}
  // 页面入场动画结束后自动聚焦，减少一次点击
  setTimeout(() => focusNext('email'), 200)
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
  if (!EMAIL_RE.test((email.value || '').trim())) {
    uni.showToast({ title: '邮箱格式不对', icon: 'none' })
    return
  }
  sending.value = true
  try {
    await api.sendBindEmailCode({ email: email.value.trim() })
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
  loading.value = true
  try {
    const user = await api.bindEmail({ email: email.value.trim(), code: code.value })
    getStore().state.user = user
    uni.setStorageSync('pc_user', user)
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
    uni.showToast({ title: '绑定成功', icon: 'success' })
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
  align-items: flex-start;
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
  font-size: 20rpx; font-weight: 700;
  color: $pc-purple;
  background: rgba(167, 139, 250, 0.18);
}
.tip { flex: 1; color: $pc-muted; font-size: 22rpx; line-height: 1.5; }
.label { display: block; color: $pc-muted; font-size: 24rpx; margin: 22rpx 0 12rpx; }
.input-row { display: flex; align-items: center; gap: 12rpx; }
.input {
  height: 92rpx; padding: 0 28rpx; border-radius: $pc-radius-md;
  background: rgba(255, 255, 255, 0.04); color: $pc-text;
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.input.flex { flex: 1; min-width: 0; }
.code-btn {
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
