<template>
  <view class="contacts pc-aurora">
    <view class="section">
      <text class="sec-title">新的朋友</text>
      <view v-if="!pending.length" class="hint">暂无好友申请</view>
      <view v-for="p in pending" :key="p.id" class="row pc-card">
        <view class="avatar">{{ (p.user?.nickname || '?').slice(0,1) }}</view>
        <view class="meta">
          <text class="name">{{ p.user?.nickname }}</text>
          <text class="sub">{{ p.user?.account }}</text>
        </view>
        <view class="ops">
          <text class="ok" @tap="accept(p.id)">同意</text>
          <text class="no" @tap="reject(p.id)">拒绝</text>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="sec-head">
        <text class="sec-title">好友</text>
        <text class="link" @tap="goSearch">添加</text>
      </view>
      <view v-for="f in friends" :key="f.id" class="row pc-card" @tap="openPrivate(f.friendId, f.user?.nickname)">
        <view class="avatar">{{ (f.remark || f.user?.nickname || '?').slice(0,1) }}</view>
        <view class="meta">
          <text class="name">{{ f.remark || f.user?.nickname }}</text>
          <text class="sub">{{ f.user?.account }} · {{ f.user?.phone }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'

const friends = ref([])
const pending = ref([])

async function load() {
  friends.value = await api.friends() || []
  pending.value = await api.pendingFriends() || []
}

async function accept(id) {
  await api.acceptFriend(id)
  uni.showToast({ title: '已成为好友', icon: 'none' })
  load()
}
async function reject(id) {
  await api.rejectFriend(id)
  load()
}
async function openPrivate(peerId, name) {
  const conv = await api.privateChat(peerId)
  uni.navigateTo({ url: '/pages/chat/chat?id=' + conv.id + '&title=' + encodeURIComponent(name || '私聊') })
}
function goSearch() { uni.navigateTo({ url: '/pages/search/search' }) }

onShow(load)
</script>

<style scoped lang="scss">
.contacts { min-height: 100vh; padding: 24rpx; }
.section { margin-bottom: 28rpx; }
.sec-head { display: flex; justify-content: space-between; align-items: center; }
.sec-title { color: #9CB0C4; font-size: 24rpx; margin-bottom: 14rpx; display: block; }
.link { color: #2EE6A6; font-size: 24rpx; }
.hint { color: #5d6f80; font-size: 24rpx; margin-bottom: 12rpx; }
.row { display: flex; align-items: center; gap: 18rpx; padding: 22rpx; border-radius: 22rpx; margin-bottom: 14rpx; }
.avatar {
  width: 78rpx; height: 78rpx; border-radius: 20rpx; background: #1B4F72;
  display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;
}
.meta { flex: 1; }
.name { display: block; color: #E8F4FF; font-size: 28rpx; font-weight: 700; }
.sub { display: block; color: #7F93A8; font-size: 22rpx; margin-top: 6rpx; }
.ops { display: flex; gap: 16rpx; }
.ok { color: #2EE6A6; }
.no { color: #FF6B4A; }
</style>
