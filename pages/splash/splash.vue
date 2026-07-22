<template>
  <view class="splash pc-aurora">
    <view class="orb orb-a"></view>
    <view class="orb orb-b"></view>
    <view class="brand-wrap">
      <text class="brand">PulseChat</text>
      <text class="tag">霓虹脉冲 · 实时对话</text>
      <view class="wave">
        <view class="bar" v-for="n in 7" :key="n" :style="{ animationDelay: (n * 0.08) + 's' }"></view>
      </view>
    </view>
  </view>
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
  animation: pc-float 4s ease-in-out infinite;
}
.orb-a {
  width: 280rpx; height: 280rpx; left: -40rpx; top: 120rpx;
  background: radial-gradient(circle, rgba(46,230,166,.45), transparent 70%);
}
.orb-b {
  width: 360rpx; height: 360rpx; right: -80rpx; bottom: 160rpx;
  background: radial-gradient(circle, rgba(41,208,255,.35), transparent 70%);
  animation-delay: .6s;
}
.brand-wrap { text-align: center; z-index: 2; }
.brand {
  display: block;
  font-size: 72rpx;
  font-weight: 800;
  letter-spacing: 4rpx;
  background: linear-gradient(120deg, #2EE6A6, #29D0FF, #FF6B4A, #2EE6A6);
  background-size: 220% 220%;
  -webkit-background-clip: text;
  color: transparent;
  animation: pc-shine 4s linear infinite;
}
.tag { display: block; margin-top: 18rpx; color: #7F93A8; font-size: 26rpx; }
.wave { margin-top: 48rpx; display: flex; gap: 10rpx; justify-content: center; height: 60rpx; align-items: flex-end; }
.bar {
  width: 10rpx; height: 20rpx; border-radius: 8rpx;
  background: linear-gradient(180deg, #29D0FF, #2EE6A6);
  animation: bounce 0.9s ease-in-out infinite;
}
@keyframes bounce {
  0%, 100% { height: 18rpx; opacity: .5; }
  50% { height: 56rpx; opacity: 1; }
}
</style>
