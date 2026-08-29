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

    <view class="body">
      <view class="panel pc-card pc-enter">
        <text class="tip">验证码将发送到 {{ maskedEmail || '已绑定邮箱' }}</text>
        <text class="label">验证码</text>
        <view class="input-row">
          <input class="input flex" type="number" maxlength="6" v-model="code" placeholder="6位验证码" placeholder-class="ph" />
          <text class="code-btn" :class="{ disabled: codeSeconds > 0 || sending }" @tap="sendCode">
            {{ codeSeconds > 0 ? codeSeconds + 's' : (sending ? '发送中' : '获取验证码') }}
          </text>
        </view>
        <text class="label">新密码</text>
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
        <text class="label">确认新密码</text>
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
        <button class="pc-btn save" :loading="loading" @tap="submit">保存</button>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'

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

function goBack() {
  uni.navigateBack()
}

onMounted(async () => {
  try {
    const me = await api.me()
    if (!me?.email) {
      uni.showToast({ title: '请先绑定邮箱', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 400)
      return
    }
    maskedEmail.value = me.email
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
  } catch (e) {
  } finally {
    sending.value = false
  }
}

async function submit() {
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
    uni.showToast({ title: '密码已更新', icon: 'none' })
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
.eye, .code-btn { flex-shrink: 0; padding: 0 12rpx; color: $pc-purple; font-size: 24rpx; }
.code-btn.disabled { color: #6B5C7A; }
.ph { color: rgba(226, 232, 240, 0.35); }
.save {
  margin-top: 32rpx; height: 88rpx; line-height: 88rpx;
  border-radius: $pc-radius-pill;
}
</style>
