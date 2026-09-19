<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">{{ hasPhone ? '修改手机号' : '添加手机号' }}</text>
      </view>
    </view>

    <scroll-view scroll-y class="body" :bounces="true">
      <view class="panel pc-card pc-enter">
        <view v-if="currentPhone" class="current">
          <text class="current-label">当前手机号</text>
          <text class="current-value">{{ currentPhone }}</text>
        </view>
        <text class="label">{{ hasPhone ? '新手机号' : '手机号' }}</text>
        <input
          class="input pc-input"
          :class="[fieldClass('phone'), { 'is-error': phoneInvalid }]"
          :focus="focusTarget === 'phone'"
          type="number"
          maxlength="11"
          v-model="phone"
          placeholder="请输入11位手机号"
          placeholder-class="ph"
          confirm-type="done"
          @focus="onFocus('phone')"
          @blur="onBlur"
          @confirm="submit"
        />
        <view class="input-meta">
          <text v-if="phoneInvalid" class="field-error">手机号需为 1 开头的 11 位数字</text>
          <text v-else class="field-hint">用于账号找回与好友通过手机号找到你</text>
          <text class="pc-counter" :class="{ 'is-near': phone.length === 11 }">{{ phone.length }}/11</text>
        </view>
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
import { ref, computed, onMounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { useFormFocus } from '../../utils/form-focus.js'

const PHONE_RE = /^1\d{10}$/
const { focusTarget, onFocus, onBlur, fieldClass, focusNext } = useFormFocus()
const phone = ref('')
const currentPhone = ref('')
const hasPhone = computed(() => !!currentPhone.value)
const loading = ref(false)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
/** 输满 11 位但格式不对时即时提示（未输满不打扰） */
const phoneInvalid = computed(() => phone.value.length === 11 && !PHONE_RE.test(phone.value))

function goBack() {
  uni.navigateBack()
}

onMounted(async () => {
  try {
    const me = getStore().state.user || await api.me()
    currentPhone.value = me?.phone || ''
  } catch (e) {}
  setTimeout(() => focusNext('phone'), 200)
})

async function submit() {
  if (loading.value) return
  if (!PHONE_RE.test(phone.value)) {
    uni.showToast({ title: '手机号格式不对', icon: 'none' })
    return
  }
  if (currentPhone.value && phone.value === currentPhone.value) {
    uni.showToast({ title: '与当前手机号相同', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const user = await api.updatePhone({ phone: phone.value })
    getStore().state.user = user
    uni.setStorageSync('pc_user', user)
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
    uni.showToast({ title: '已保存', icon: 'success' })
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
.current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 20rpx;
  border-radius: $pc-radius-md;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.current-label { color: $pc-muted; font-size: 22rpx; }
.current-value { color: $pc-text; font-size: 26rpx; font-weight: 600; letter-spacing: 1rpx; }
.label { display: block; color: $pc-muted; font-size: 24rpx; margin: 22rpx 0 12rpx; }
.input {
  height: 92rpx; padding: 0 28rpx; border-radius: $pc-radius-md;
  background: rgba(255, 255, 255, 0.04); color: $pc-text;
  border: 1px solid rgba(167, 139, 250, 0.14);
  font-size: 32rpx; letter-spacing: 2rpx;
}
.input.is-error { border-color: rgba(244, 63, 94, 0.6) !important; }
.input-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 12rpx;
  padding: 0 6rpx;
}
.field-hint { flex: 1; color: #6B5C7A; font-size: 22rpx; }
.field-error { flex: 1; color: $pc-rose; font-size: 22rpx; }
.ph { color: rgba(226, 232, 240, 0.35); letter-spacing: 0; }
.save {
  margin-top: 32rpx; height: 88rpx; line-height: 88rpx;
  border-radius: $pc-radius-pill;
}
</style>
