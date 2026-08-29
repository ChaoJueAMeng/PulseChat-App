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

    <view class="body">
      <view class="panel pc-card pc-enter">
        <text class="label">手机号</text>
        <input class="input" type="number" maxlength="11" v-model="phone" placeholder="请输入11位手机号" placeholder-class="ph" />
        <button class="pc-btn save" :loading="loading" @tap="submit">保存</button>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'

const phone = ref('')
const hasPhone = ref(false)
const loading = ref(false)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

function goBack() {
  uni.navigateBack()
}

onMounted(async () => {
  try {
    const me = await api.me()
    hasPhone.value = !!me?.phone
  } catch (e) {}
})

async function submit() {
  if (!/^1\d{10}$/.test(phone.value)) {
    uni.showToast({ title: '手机号格式不对', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const user = await api.updatePhone({ phone: phone.value })
    getStore().state.user = user
    uni.setStorageSync('pc_user', user)
    uni.showToast({ title: '已保存', icon: 'none' })
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
.label { display: block; color: $pc-muted; font-size: 24rpx; margin: 18rpx 0 12rpx; }
.input {
  height: 92rpx; padding: 0 28rpx; border-radius: $pc-radius-md;
  background: rgba(255, 255, 255, 0.04); color: $pc-text;
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.ph { color: rgba(226, 232, 240, 0.35); }
.save {
  margin-top: 32rpx; height: 88rpx; line-height: 88rpx;
  border-radius: $pc-radius-pill;
}
</style>
