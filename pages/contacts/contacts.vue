<template>
  <view class="contacts-page">
  <view
    class="contacts pc-aurora"
    :class="tabAnimClass"
    @touchstart="onTabSwipeStart"
    @touchend="onTabSwipeEnd"
  >
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-title-wrap">
        <text class="pc-nav-title">通讯录</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
      @touchstart="onTabSwipeStart"
      @touchend="onTabSwipeEnd"
    >
      <view class="section pc-enter">
        <text class="sec-title">新的朋友</text>
        <view v-if="!pending.length" class="hint">暂无好友申请</view>
        <view v-for="p in pending" :key="p.id" class="row pc-card">
          <pc-avatar :url="p.user?.avatar" :name="p.user?.nickname" :size="80" :seed="p.user?.id" />
          <view class="meta">
            <text class="name">{{ p.user?.nickname }}</text>
            <text class="sub">{{ p.user?.account }}</text>
          </view>
          <view class="ops">
            <text class="ok pc-press" :class="{ disabled: acceptingId === p.id }" @tap="accept(p.id)">同意</text>
            <text class="no pc-press" @tap="reject(p.id)">拒绝</text>
          </view>
        </view>
      </view>

      <view class="section pc-enter" style="animation-delay: 0.08s">
        <view class="sec-head">
          <text class="sec-title">好友</text>
          <text class="link pc-press" @tap="goSearch">添加</text>
        </view>
        <view
          v-for="f in friends"
          :key="f.id"
          class="row pc-card pc-press"
          @tap="openProfile(f)"
        >
          <pc-avatar :url="f.user?.avatar" :name="f.remark || f.user?.nickname" :size="80" :seed="f.friendId" />
          <view class="meta">
            <text class="name">{{ f.remark || f.user?.nickname }}</text>
            <text class="sub">{{ f.user?.account }} · {{ f.user?.phone }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
  <pc-tabbar :current="1" />
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onShow, onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { showModal } from '../../utils/feedback.js'
import { onWs } from '../../utils/ws.js'
import { handleRootBackPress } from '../../utils/quit.js'
import { useTabPageTransition } from '../../utils/tab-swipe.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

onBackPress(() => handleRootBackPress())
const { tabAnimClass, onTabSwipeStart, onTabSwipeEnd } = useTabPageTransition(1)

const friends = ref([])
const pending = ref([])
const acceptingId = ref(null)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
let offNotify = null

async function load() {
  friends.value = await api.friends() || []
  pending.value = await api.pendingFriends() || []
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
    await load()
  } catch (e) {}
}

async function accept(id) {
  if (acceptingId.value === id) return
  const item = pending.value.find(p => p.id === id)
  acceptingId.value = id
  try {
    await api.acceptFriend(id)
    uni.showToast({ title: '已成为好友', icon: 'none' })
    await load()
    await promptRemark(item?.friendId || item?.user?.id, item?.user?.nickname)
  } catch (e) {
    // request.js 已 toast
  } finally {
    acceptingId.value = null
  }
}
async function reject(id) {
  try {
    await api.rejectFriend(id)
    load()
  } catch (e) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  }
}
function openProfile(f) {
  const name = f.remark || f.user?.nickname || '好友资料'
  uni.navigateTo({
    url: '/pages/friend-profile/friend-profile?userId=' + f.friendId
      + '&friend=1'
      + '&title=' + encodeURIComponent(name)
  })
}
function goSearch() { uni.navigateTo({ url: '/pages/search/search' }) }

onShow(() => {
  try { uni.hideTabBar({ animation: false }) } catch (e) {}
  load()
})

onMounted(() => {
  offNotify = onWs('notify', (body) => {
    if (body?.type === 'friend_request' || body?.type === 'friend_accepted') {
      load()
    }
  })
})
onUnmounted(() => {
  if (offNotify) offNotify()
})
</script>

<style scoped lang="scss">
.contacts-page {
  height: 100vh;
  overflow: hidden;
}
.contacts {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.page-header {
  margin: 0;
  width: 100%;
  flex-shrink: 0;
}
.body {
  flex: 1;
  height: 0;
  padding: 28rpx 28rpx calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.section { margin-bottom: 32rpx; }
.sec-head { display: flex; justify-content: space-between; align-items: center; }
.sec-title { color: $pc-muted; font-size: 24rpx; margin-bottom: 16rpx; display: block; letter-spacing: 1rpx; }
.link { color: $pc-purple; font-size: 24rpx; }
.hint { color: #6B5C7A; font-size: 24rpx; margin-bottom: 12rpx; }
.row {
  display: flex; align-items: center; gap: 18rpx; padding: 24rpx;
  border-radius: $pc-radius-lg; margin-bottom: 14rpx;
}
.meta { flex: 1; }
.name { display: block; color: $pc-text; font-size: 28rpx; font-weight: 700; }
.sub { display: block; color: $pc-muted; font-size: 22rpx; margin-top: 6rpx; }
.ops { display: flex; gap: 16rpx; }
.ok { color: $pc-purple; }
.ok.disabled { opacity: 0.45; pointer-events: none; }
.no { color: $pc-red; }
</style>
