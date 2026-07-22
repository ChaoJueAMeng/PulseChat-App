<template>
  <view class="page pc-aurora">
    <view class="panel pc-card">
      <input class="input" v-model="title" placeholder="群名称，比如 霓虹小队" />
    </view>
    <view class="panel pc-card">
      <text class="label">选择好友</text>
      <view v-for="f in friends" :key="f.id" class="row" @tap="toggle(f.friendId)">
        <view class="check" :class="{ on: selected.includes(f.friendId) }"></view>
        <text class="name">{{ f.remark || f.user?.nickname }}</text>
      </view>
    </view>
    <button class="pc-btn create" @tap="create">创建群聊</button>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../utils/request.js'

const title = ref('')
const friends = ref([])
const selected = ref([])

onMounted(async () => {
  friends.value = await api.friends() || []
})

function toggle(id) {
  if (selected.value.includes(id)) selected.value = selected.value.filter(x => x !== id)
  else selected.value.push(id)
}

async function create() {
  if (!title.value.trim()) {
    uni.showToast({ title: '请填写群名', icon: 'none' })
    return
  }
  if (!selected.value.length) {
    uni.showToast({ title: '请选择成员', icon: 'none' })
    return
  }
  const conv = await api.createGroup({ title: title.value.trim(), memberIds: selected.value })
  uni.redirectTo({ url: '/pages/chat/chat?id=' + conv.id + '&title=' + encodeURIComponent(conv.title) })
}
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 24rpx; }
.panel { border-radius: 22rpx; padding: 20rpx; margin-bottom: 18rpx; }
.input { height: 80rpx; padding: 0 18rpx; color: #E8F4FF; background: rgba(255,255,255,.04); border-radius: 14rpx; }
.label { display: block; color: #7F93A8; margin-bottom: 12rpx; font-size: 24rpx; }
.row { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.check { width: 34rpx; height: 34rpx; border-radius: 10rpx; border: 1px solid #2EE6A6; }
.check.on { background: #2EE6A6; }
.name { color: #E8F4FF; }
.create { margin-top: 20rpx; height: 88rpx; line-height: 88rpx; border-radius: 999rpx; }
</style>
