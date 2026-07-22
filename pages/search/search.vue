<template>
  <view class="search pc-aurora">
    <view class="box pc-card">
      <input class="input" v-model="keyword" placeholder="手机号 / 账号 / 昵称" confirm-type="search" @confirm="doSearch" />
      <button class="pc-btn btn" @tap="doSearch">搜索</button>
    </view>
    <view v-for="u in list" :key="u.id" class="row pc-card">
      <view class="avatar">{{ (u.nickname || '?').slice(0,1) }}</view>
      <view class="meta">
        <text class="name">{{ u.nickname }}</text>
        <text class="sub">{{ u.account }} · {{ u.phone }}</text>
      </view>
      <text class="add" @tap="add(u)">加好友</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../../utils/request.js'

const keyword = ref('')
const list = ref([])

async function doSearch() {
  if (!keyword.value.trim()) return
  list.value = await api.searchUsers(keyword.value.trim()) || []
}
async function add(u) {
  await api.applyFriend(u.id)
  uni.showToast({ title: '已发送申请', icon: 'none' })
}
</script>

<style scoped lang="scss">
.search { min-height: 100vh; padding: 24rpx; }
.box { display: flex; gap: 12rpx; padding: 16rpx; border-radius: 20rpx; margin-bottom: 20rpx; }
.input { flex: 1; height: 72rpx; padding: 0 18rpx; color: #E8F4FF; background: rgba(255,255,255,.04); border-radius: 14rpx; }
.btn { height: 72rpx; line-height: 72rpx; padding: 0 28rpx; border-radius: 999rpx; margin: 0; font-size: 26rpx; }
.row { display: flex; align-items: center; gap: 16rpx; padding: 22rpx; border-radius: 20rpx; margin-bottom: 14rpx; }
.avatar { width: 72rpx; height: 72rpx; border-radius: 18rpx; background: #0E4D64; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.meta { flex: 1; }
.name { display: block; color: #E8F4FF; font-weight: 700; }
.sub { display: block; color: #7F93A8; font-size: 22rpx; margin-top: 6rpx; }
.add { color: #2EE6A6; font-size: 26rpx; }
</style>
