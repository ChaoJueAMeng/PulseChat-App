<template>
  <view
    class="contacts pc-aurora"
    @touchstart="$emit('swipeStart', $event)"
    @touchmove="$emit('swipeMove', $event)"
    @touchend="$emit('swipeEnd', $event)"
    @touchcancel="$emit('swipeCancel', $event)"
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
      @touchstart.stop="$emit('swipeStart', $event)"
      @touchmove.stop="$emit('swipeMove', $event)"
      @touchend.stop="$emit('swipeEnd', $event)"
      @touchcancel.stop="$emit('swipeCancel', $event)"
    >
      <template v-if="loading && !loadedOnce">
        <view class="section">
          <view class="pc-skeleton sk-title"></view>
          <view v-for="i in 5" :key="'sk-' + i" class="pc-skeleton pc-skeleton--row"></view>
        </view>
      </template>

      <template v-else>
        <view v-if="pending.length" class="section pc-enter">
          <view class="sec-head">
            <view class="sec-title-row">
              <text class="sec-title">新的朋友</text>
              <text class="pc-count">{{ pending.length > 99 ? '99+' : pending.length }}</text>
            </view>
          </view>
          <view v-for="p in pending" :key="p.id" class="row pc-card">
            <pc-avatar :url="p.user?.avatar" :name="p.user?.nickname" :size="80" :seed="p.user?.id" />
            <view class="meta">
              <text class="name">{{ p.user?.nickname || '用户' }}</text>
              <text class="sub">{{ subLine(p.user) || '请求添加你为好友' }}</text>
            </view>
            <view class="ops">
              <view
                class="pc-pill pc-press"
                :class="{ disabled: busyId === p.id }"
                @tap="accept(p.id)"
              >
                <text>{{ busyId === p.id ? '处理中' : '同意' }}</text>
              </view>
              <view
                class="pc-pill ghost pc-press"
                :class="{ disabled: busyId === p.id }"
                @tap="reject(p.id)"
              >
                <text>拒绝</text>
              </view>
            </view>
          </view>
        </view>

        <view class="section pc-enter" style="animation-delay: 0.06s">
          <view class="sec-head">
            <view class="sec-title-row">
              <text class="sec-title">好友</text>
              <text v-if="friends.length" class="sec-num">{{ friends.length }}</text>
            </view>
            <text class="link pc-press" @tap="goSearch">＋ 添加</text>
          </view>

          <view v-if="!friends.length" class="pc-empty pc-empty--compact pc-card empty-card">
            <view class="pc-empty__icon">☺</view>
            <text class="pc-empty__title">还没有好友</text>
            <text class="pc-empty__sub">通过手机号、账号或昵称找到朋友，开始第一段脉冲对话</text>
            <view class="pc-empty__action pc-press" @tap="goSearch">去添加好友</view>
          </view>

          <view
            v-for="f in friends"
            :key="f.id"
            class="row pc-card pc-press"
            @tap="openProfile(f)"
          >
            <pc-avatar :url="f.user?.avatar" :name="f.remark || f.user?.nickname" :size="80" :seed="f.friendId" />
            <view class="meta">
              <text class="name">{{ f.remark || f.user?.nickname || '好友' }}</text>
              <text class="sub">{{ subLine(f.user, f.remark) }}</text>
            </view>
            <view class="pc-chevron"></view>
          </view>
        </view>
      </template>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '../../utils/request.js'
import { showModal } from '../../utils/feedback.js'
import { onWs } from '../../utils/ws.js'
import { runAfterTabEnter } from '../../utils/tab-swipe.js'
import PcAvatar from '../pc-avatar/pc-avatar.vue'

const props = defineProps({
  active: { type: Boolean, default: false }
})

defineEmits(['swipeStart', 'swipeMove', 'swipeEnd', 'swipeCancel'])

const friends = ref([])
const pending = ref([])
/** 正在处理（同意 / 拒绝）的申请 id，避免重复点击 */
const busyId = ref(null)
const loading = ref(false)
const loadedOnce = ref(false)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
let offNotify = null
let loadGen = 0

/** 副标题：有备注时补昵称；账号 / 手机号按存在情况拼接，避免出现悬空的「·」 */
function subLine(user, remark) {
  const parts = []
  if (remark && user?.nickname) parts.push('昵称 ' + user.nickname)
  if (user?.account) parts.push(user.account)
  if (user?.phone) parts.push(user.phone)
  return parts.join(' · ')
}

async function load() {
  const gen = ++loadGen
  if (!loadedOnce.value) loading.value = true
  try {
    const [f, p] = await Promise.all([api.friends(), api.pendingFriends()])
    if (gen !== loadGen) return
    friends.value = f || []
    pending.value = p || []
    loadedOnce.value = true
  } catch (e) {
    // request.js 已统一 toast
  } finally {
    if (gen === loadGen) loading.value = false
  }
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
  if (busyId.value) return
  const item = pending.value.find(p => p.id === id)
  busyId.value = id
  try {
    await api.acceptFriend(id)
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (err) {}
    uni.showToast({ title: '已成为好友', icon: 'success' })
    await load()
    await promptRemark(item?.friendId || item?.user?.id, item?.user?.nickname)
  } catch (e) {
  } finally {
    busyId.value = null
  }
}

async function reject(id) {
  if (busyId.value) return
  busyId.value = id
  try {
    await api.rejectFriend(id)
    pending.value = pending.value.filter(p => p.id !== id)
    uni.showToast({ title: '已拒绝', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  } finally {
    busyId.value = null
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

function goSearch() {
  uni.navigateTo({ url: '/pages/search/search' })
}

watch(() => props.active, (v) => {
  if (!v) return
  runAfterTabEnter(() => { load() })
}, { immediate: true })

onMounted(() => {
  if (!loadedOnce.value) load()
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
.contacts {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
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
.sec-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding: 0 4rpx;
}
.sec-title-row { display: flex; align-items: center; gap: 12rpx; }
.sec-title { color: $pc-muted; font-size: 24rpx; letter-spacing: 1rpx; }
.sec-num { color: #6B5C7A; font-size: 22rpx; }
.link {
  color: $pc-purple;
  font-size: 24rpx;
  font-weight: 600;
  padding: 8rpx 14rpx;
  border-radius: $pc-radius-pill;
  background: rgba(167, 139, 250, 0.1);
}
.sk-title { width: 160rpx; height: 28rpx; margin-bottom: 18rpx; border-radius: 8rpx; }
.empty-card { border-radius: $pc-radius-xl; margin-bottom: 14rpx; }
.row {
  display: flex; align-items: center; gap: 18rpx; padding: 24rpx;
  border-radius: $pc-radius-lg; margin-bottom: 14rpx;
}
.meta { flex: 1; min-width: 0; }
.name {
  display: block; color: $pc-text; font-size: 28rpx; font-weight: 700;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.sub {
  display: block; color: $pc-muted; font-size: 22rpx; margin-top: 6rpx;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.ops { display: flex; gap: 12rpx; flex-shrink: 0; }
</style>
