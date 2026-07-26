<template>
  <view class="splash pc-aurora">
    <view class="orb orb-a"></view>
    <view class="orb orb-b"></view>
    <view class="orb orb-c"></view>
    <view class="brand-wrap">
      <text class="brand">PulseChat</text>
      <text class="tag">紫红脉冲 · 实时对话</text>
      <view class="wave">
        <view class="bar" v-for="n in 7" :key="n" :style="{ animationDelay: (n * 0.08) + 's' }"></view>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { onMounted } from 'vue'
import { getStore } from '../../store/index.js'

onMounted(() => {
  const store = getStore()
  store.hydrate()
  setTimeout(() => {
    if (store.state.token) {
      uni.switchTab({ url: '/pages/chats/chats' })
    } else {
      uni.reLaunch({ url: '/pages/login/login' })
    }
  }, 1400)
})
</script>

<style scoped lang="scss">
.splash {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(2px);
  animation: pc-float 4.5s ease-in-out infinite;
}
.orb-a {
  width: 300rpx; height: 300rpx; left: -50rpx; top: 100rpx;
  background: radial-gradient(circle, rgba(167, 139, 250, 0.48), transparent 70%);
}
.orb-b {
  width: 380rpx; height: 380rpx; right: -90rpx; bottom: 140rpx;
  background: radial-gradient(circle, rgba(244, 63, 94, 0.36), transparent 70%);
  animation-delay: 0.6s;
}
.orb-c {
  width: 200rpx; height: 200rpx; left: 40%; top: 24%;
  background: radial-gradient(circle, rgba(232, 121, 249, 0.28), transparent 70%);
  animation-delay: 1.1s;
}
.brand-wrap { text-align: center; z-index: 2; animation: pc-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
.brand {
  display: block;
  font-size: 76rpx;
  font-weight: 800;
  letter-spacing: 4rpx;
  background: linear-gradient(120deg, $pc-purple, $pc-magenta, $pc-red, $pc-purple);
  background-size: 220% 220%;
  -webkit-background-clip: text;
  color: transparent;
  animation: pc-shine 4s linear infinite;
}
.tag { display: block; margin-top: 20rpx; color: $pc-muted; font-size: 26rpx; letter-spacing: 2rpx; }
.wave { margin-top: 56rpx; display: flex; gap: 10rpx; justify-content: center; height: 64rpx; align-items: flex-end; }
.bar {
  width: 10rpx; height: 20rpx; border-radius: 10rpx;
  background: linear-gradient(180deg, $pc-purple, $pc-red);
  animation: bounce 0.9s ease-in-out infinite;
}
@keyframes bounce {
  0%, 100% { height: 18rpx; opacity: 0.5; }
  50% { height: 56rpx; opacity: 1; }
}
</style>
