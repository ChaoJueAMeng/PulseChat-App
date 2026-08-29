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

    <view class="body">
      <view class="panel pc-card pc-enter">
        <text class="tip">邮箱绑定后无法更改</text>
        <text class="label">邮箱</text>
        <input class="input" v-model="email" placeholder="请输入邮箱" placeholder-class="ph" />
        <text class="label">验证码</text>
        <view class="input-row">
          <input class="input flex" type="number" maxlength="6" v-model="code" placeholder="6位验证码" placeholder-class="ph" />
          <text class="code-btn" :class="{ disabled: codeSeconds > 0 || sending }" @tap="sendCode">
            {{ codeSeconds > 0 ? codeSeconds + 's' : (sending ? '发送中' : '获取验证码') }}
          </text>
        </view>
        <button class="pc-btn save" :loading="loading" @tap="submit">绑定</button>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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
    }
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
    uni.showToast({ title: '绑定成功', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
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
.tip { display: block; color: $pc-muted; font-size: 22rpx; margin-bottom: 12rpx; }
.label { display: block; color: $pc-muted; font-size: 24rpx; margin: 18rpx 0 12rpx; }
.input-row { display: flex; align-items: center; gap: 12rpx; }
.input {
  height: 92rpx; padding: 0 28rpx; border-radius: $pc-radius-md;
  background: rgba(255, 255, 255, 0.04); color: $pc-text;
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.input.flex { flex: 1; min-width: 0; }
.code-btn { flex-shrink: 0; padding: 0 12rpx; color: $pc-purple; font-size: 24rpx; }
.code-btn.disabled { color: #6B5C7A; }
.ph { color: rgba(226, 232, 240, 0.35); }
.save {
  margin-top: 32rpx; height: 88rpx; line-height: 88rpx;
  border-radius: $pc-radius-pill;
}
</style>
