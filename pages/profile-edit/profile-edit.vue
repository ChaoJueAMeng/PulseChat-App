<template>
  <view class="page pc-aurora">
    <view class="panel pc-card">
      <text class="label">昵称</text>
      <input class="input" v-model="nickname" />
      <text class="label">个性签名</text>
      <textarea class="area" v-model="bio" />
      <button class="pc-btn save" @tap="save">保存</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'

const nickname = ref('')
const bio = ref('')

onMounted(async () => {
  const me = await api.me()
  nickname.value = me.nickname || ''
  bio.value = me.bio || ''
})

async function save() {
  const user = await api.updateMe({ nickname: nickname.value, bio: bio.value })
  getStore().state.user = user
  uni.setStorageSync('pc_user', user)
  uni.showToast({ title: '已保存', icon: 'none' })
  setTimeout(() => uni.navigateBack(), 400)
}
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 24rpx; }
.panel { border-radius: 24rpx; padding: 28rpx; }
.label { display: block; color: #7F93A8; font-size: 24rpx; margin: 12rpx 0; }
.input, .area {
  width: 100%; padding: 18rpx; color: #E8F4FF; background: rgba(255,255,255,.04); border-radius: 14rpx; margin-bottom: 12rpx;
}
.area { min-height: 160rpx; }
.save { margin-top: 20rpx; height: 84rpx; line-height: 84rpx; border-radius: 999rpx; }
</style>
