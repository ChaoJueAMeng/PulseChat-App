<template>
  <view class="search pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">搜索</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view class="box pc-card pc-enter">
        <input class="input" v-model="keyword" placeholder="手机号 / 账号 / 昵称" confirm-type="search" @confirm="doSearch" />
        <button class="pc-btn btn" @tap="doSearch">搜索</button>
      </view>

      <view
        v-for="(u, idx) in list"
        :key="u.id"
        class="row pc-card pc-press"
        :style="{ animationDelay: (idx * 0.04) + 's' }"
        @tap="openProfile(u)"
      >
        <pc-avatar :url="u.avatar" :name="u.nickname" :size="76" :seed="u.id" />
        <view class="meta">
          <text class="name">{{ u.nickname }}</text>
          <text class="sub">{{ u.account }} · {{ u.phone }}</text>
        </view>
        <text
          v-if="actionLabel(u)"
          class="add"
          :class="{ disabled: isActionDisabled(u) }"
          @tap.stop="onAction(u)"
        >{{ actionLabel(u) }}</text>
      </view>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed } from 'vue'
import { api } from '../../utils/request.js'
import { showModal } from '../../utils/feedback.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'


const keyword = ref('')
const list = ref([])
const statusMap = ref({})
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

function goBack() {
  uni.navigateBack()
}

async function doSearch() {
  if (!keyword.value.trim()) return
  const users = await api.searchUsers(keyword.value.trim()) || []
  list.value = users
  statusMap.value = {}
  await Promise.all(users.map(async (u) => {
    if (!u?.id) return
    try {
      const res = await api.checkFriend(u.id)
      statusMap.value[u.id] = res || {}
    } catch (e) {
      statusMap.value[u.id] = {}
    }
  }))
}

function actionLabel(u) {
  const s = statusMap.value[u.id]
  if (!s) return '加好友'
  if (s.friend || s.isFriend) return '已是好友'
  if (s.incomingPending) return '待处理'
  if (s.pending || s.applied) return '已申请'
  return '加好友'
}

function isActionDisabled(u) {
  const s = statusMap.value[u.id]
  if (!s) return false
  return !!(s.friend || s.isFriend || s.incomingPending || s.pending || s.applied)
}

async function promptRemark(friendId, nickname) {
  if (!friendId) return
  const res = await showModal({
    title: '设置备注',
    editable: true,
    placeholderText: nickname ? `备注名（${nickname}）` : '请输入备注名',
    confirmText: '保存',
    cancelText: '跳过'
  })
  if (!res.confirm) return
  const next = (res.content || '').trim()
  if (!next) return
  try {
    await api.updateFriendRemark(friendId, next)
    uni.showToast({ title: '备注已设置', icon: 'none' })
  } catch (e) {}
}

async function onAction(u) {
  if (isActionDisabled(u)) return
  try {
    await api.applyFriend(u.id)
    const res = await api.checkFriend(u.id)
    statusMap.value[u.id] = res || {}
    if (res?.friend || res?.isFriend) {
      uni.showToast({ title: '已成为好友', icon: 'none' })
      await promptRemark(u.id, u.nickname)
    } else {
      uni.showToast({ title: '已发送申请', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  }
}

function openProfile(u) {
  if (!u?.id) return
  uni.navigateTo({
    url: '/pages/friend-profile/friend-profile?userId=' + u.id
      + '&fromSearch=1'
      + '&title=' + encodeURIComponent(u.nickname || '用户资料')
  })
}
</script>

<style scoped lang="scss">
.search {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.body { flex: 1; height: 0; padding: 28rpx; box-sizing: border-box; }
.box {
  display: flex; gap: 14rpx; padding: 18rpx;
  border-radius: $pc-radius-lg; margin-bottom: 22rpx;
}
.input {
  flex: 1; height: 76rpx; padding: 0 22rpx; color: $pc-text;
  background: rgba(255, 255, 255, 0.04); border-radius: $pc-radius-md;
}
.btn {
  height: 76rpx; line-height: 76rpx; padding: 0 30rpx;
  border-radius: $pc-radius-pill; margin: 0; font-size: 26rpx;
}
.row {
  display: flex; align-items: center; gap: 16rpx; padding: 24rpx;
  border-radius: $pc-radius-lg; margin-bottom: 14rpx;
  animation: pc-bubble-in 0.35s ease both;
}
.meta { flex: 1; }
.name { display: block; color: $pc-text; font-weight: 700; }
.sub { display: block; color: $pc-muted; font-size: 22rpx; margin-top: 6rpx; }
.add { color: $pc-purple; font-size: 26rpx; }
.add.muted { color: $pc-muted; }
.add.disabled { color: $pc-muted; opacity: 0.7; }
</style>
