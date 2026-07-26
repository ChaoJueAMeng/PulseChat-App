<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row" :class="{ 'has-side': isOwner && !removeMode }">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">{{ pageTitle }}</text>
        <text
          v-if="isOwner && !removeMode"
          class="nav-action pc-press"
          @tap="goAdd"
        >添加</text>
        <view v-else class="pc-nav-side"></view>
      </view>
    </view>

    <view class="body">
      <view v-if="removeMode && isOwner" class="tip pc-enter">选择要移除的成员（不可移除自己与群主）</view>
      <view v-if="!members.length" class="empty">暂无成员</view>
      <view
        v-for="(m, idx) in members"
        :key="m.userId"
        class="row pc-card pc-press pc-enter"
        :style="{ animationDelay: (idx * 0.03) + 's' }"
        @tap="onRowTap(m)"
      >
        <pc-avatar :url="m.avatar" :name="m.nickname" :size="80" :seed="m.userId" />
        <view class="meta">
          <view class="name-row">
            <text class="name">{{ displayName(m) }}</text>
            <text v-if="isOwnerRole(m)" class="badge">群主</text>
            <text v-else-if="isBot(m)" class="badge ai">AI</text>
            <text v-if="isSelf(m)" class="badge me">我</text>
          </view>
          <text class="sub">{{ roleHint(m) }}</text>
        </view>
        <text
          v-if="removeMode && isOwner && canRemove(m)"
          class="remove pc-press"
          @tap.stop="confirmRemove(m)"
        >移除</text>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

const ROLE_OWNER = 2
const MEMBER_BOT = 2

const conversationId = ref(null)
const groupTitle = ref('')
const members = ref([])
const ownerId = ref(null)
const removeMode = ref(false)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

const myId = computed(() => getStore().state.user?.id)
const isOwner = computed(() => {
  const me = myId.value
  return me != null && ownerId.value != null && Number(me) === Number(ownerId.value)
})
const pageTitle = computed(() => removeMode.value ? '移除成员' : '群成员')

function goBack() {
  uni.navigateBack()
}

function isSelf(m) {
  return myId.value != null && Number(m.userId) === Number(myId.value)
}

function isBot(m) {
  return Number(m.memberType) === MEMBER_BOT
}

function isOwnerRole(m) {
  return Number(m.role) === ROLE_OWNER
    || (ownerId.value != null && Number(m.userId) === Number(ownerId.value))
}

function canRemove(m) {
  if (!m || isSelf(m) || isBot(m) || isOwnerRole(m)) return false
  return true
}

function displayName(m) {
  return m.nickname || '用户'
}

function roleHint(m) {
  if (isBot(m)) return 'AI 助手'
  if (isOwnerRole(m)) return '群主'
  return '群成员'
}

async function load() {
  if (!conversationId.value) return
  const detail = await api.conversation(conversationId.value)
  ownerId.value = detail.ownerId != null ? Number(detail.ownerId) : null
  if (removeMode.value && !isOwner.value) {
    removeMode.value = false
  }
  try {
    members.value = await api.groupMembers(conversationId.value) || []
  } catch (e) {
    members.value = detail.members || []
  }
  // 群主排前面
  members.value = [...members.value].sort((a, b) => {
    const ao = isOwnerRole(a) ? 0 : (isBot(a) ? 2 : 1)
    const bo = isOwnerRole(b) ? 0 : (isBot(b) ? 2 : 1)
    return ao - bo
  })
}

function goAdd() {
  if (!isOwner.value) {
    uni.showToast({ title: '仅群主可添加成员', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: '/pages/group-add-members/group-add-members?id=' + conversationId.value
      + '&title=' + encodeURIComponent(groupTitle.value || '群聊')
  })
}

function onRowTap(m) {
  if (removeMode.value) {
    if (canRemove(m)) confirmRemove(m)
    return
  }
  if (isSelf(m)) {
    uni.showToast({ title: '这是你自己', icon: 'none' })
    return
  }
  if (isBot(m)) {
    uni.showToast({ title: 'AI 助手暂无个人资料', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: '/pages/friend-profile/friend-profile?userId=' + m.userId
      + '&title=' + encodeURIComponent(displayName(m))
  })
}

function confirmRemove(m) {
  if (!isOwner.value) {
    uni.showToast({ title: '仅群主可移除成员', icon: 'none' })
    return
  }
  if (!canRemove(m)) {
    if (isSelf(m)) uni.showToast({ title: '不能移除自己', icon: 'none' })
    else if (isOwnerRole(m)) uni.showToast({ title: '不能移除群主', icon: 'none' })
    else if (isBot(m)) uni.showToast({ title: '不能移除 AI 助手', icon: 'none' })
    return
  }
  const name = displayName(m)
  uni.showModal({
    title: '移除成员',
    content: '确定将「' + name + '」移出群聊吗？',
    confirmText: '移除',
    confirmColor: '#F43F5E',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await api.kickMember(conversationId.value, m.userId)
        uni.showToast({ title: '已移除成员', icon: 'none' })
        await load()
      } catch (e) {}
    }
  })
}

onLoad((q) => {
  conversationId.value = Number(q.id)
  removeMode.value = q.mode === 'remove'
  if (q.title) groupTitle.value = decodeURIComponent(q.title)
  if (!Number.isFinite(conversationId.value) || conversationId.value <= 0) {
    uni.showToast({ title: '群聊不存在', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
  }
})

onShow(() => {
  if (conversationId.value) load()
})
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.pc-nav-row {
  position: relative;
}
.nav-action {
  flex-shrink: 0;
  min-width: 72rpx;
  text-align: center;
  color: $pc-purple;
  font-size: 28rpx;
  padding: 12rpx 8rpx;
}
.body {
  flex: 1;
  padding: 28rpx;
  box-sizing: border-box;
}
.tip {
  color: $pc-muted;
  font-size: 24rpx;
  margin-bottom: 18rpx;
  padding: 0 8rpx;
}
.empty {
  color: $pc-muted;
  text-align: center;
  padding: 80rpx 0;
  font-size: 26rpx;
}
.row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  margin-bottom: 14rpx;
  border-radius: $pc-radius-lg;
}
.meta { flex: 1; min-width: 0; }
.name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-wrap: wrap;
}
.name {
  color: $pc-text;
  font-size: 30rpx;
  font-weight: 600;
}
.badge {
  font-size: 20rpx;
  color: #F5EDFF;
  background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  line-height: 1.4;
}
.badge.ai {
  background: rgba(167, 139, 250, 0.28);
  color: $pc-purple;
}
.badge.me {
  background: rgba(255, 255, 255, 0.08);
  color: $pc-muted;
}
.sub {
  display: block;
  color: $pc-muted;
  font-size: 22rpx;
  margin-top: 6rpx;
}
.remove {
  color: $pc-red;
  font-size: 26rpx;
  padding: 12rpx 8rpx;
}
</style>
