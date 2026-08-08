<template>
  <view class="stub" />
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { redirectStubToMainTab } from '../../utils/tab-swipe.js'

/** 兼容 tabBar / 通知 switchTab：立刻落到主壳通讯录轨 */
onShow(() => {
  try { uni.hideTabBar({ animation: false }) } catch (e) {}
  redirectStubToMainTab(1)
})
</script>

<style scoped>
.stub {
  height: 100vh;
  background: #0A0614;
}
</style>
