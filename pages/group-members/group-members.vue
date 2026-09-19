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

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view v-if="removeMode && isOwner" class="tip pc-enter">选择要移除的成员（不可移除自己与群主）</view>

      <template v-if="loading && !members.length">
        <view v-for="i in 5" :key="'sk-' + i" class="pc-skeleton pc-skeleton--row"></view>
      </template>

      <view v-else-if="!members.length" class="pc-empty">
        <view class="pc-empty__icon">◎</view>
        <text class="pc-empty__title">暂无成员</text>
        <text class="pc-empty__sub">{{ isOwner ? '点击右上角「添加」邀请好友加入' : '群里还没有其他成员' }}</text>
      </view>

      <view
        v-for="(m, idx) in members"
        :key="m.userId"
        class="row pc-card pc-press pc-enter"
        :class="{ 'is-removable': removeMode && isOwner && canRemove(m), 'is-locked': removeMode && !canRemove(m) }"
        :style="{ animationDelay: (Math.min(idx, 12) * 0.03) + 's' }"
        @tap="onRowTap(m)"
      >
        <pc-avatar :url="m.avatar" :name="m.nickname" :size="80" :seed="m.userId" :show-badge="isBot(m)" />
        <view class="meta">
          <view class="name-row">
            <text class="name">{{ displayName(m) }}</text>
            <text v-if="isOwnerRole(m)" class="badge">群主</text>
            <text v-else-if="isBot(m)" class="badge ai">AI</text>
            <text v-if="isSelf(m)" class="badge me">我</text>
          </view>
          <text class="sub">{{ roleHint(m) }}</text>
        </view>
        <view
          v-if="removeMode && isOwner && canRemove(m)"
          class="pc-pill danger pc-press"
          @tap.stop="confirmRemove(m)"
        >
          <text>移除</text>
        </view>
        <view v-else-if="!removeMode && !isSelf(m) && !isBot(m)" class="pc-chevron"></view>
      </view>
    </scroll-view>
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
const loading = ref(false)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))


const myId = computed(() => getStore().state.user?.id)
const isOwner = computed(() => {
  const me = myId.value
  return me != null && ownerId.value != null && Number(me) === Number(ownerId.value)
})
const pageTitle = computed(() => {
  if (removeMode.value) return '移除成员'
  return members.value.length ? `群成员（${members.value.length}）` : '群成员'
})

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
  loading.value = true
  try {
    const detail = await api.conversation(conversationId.value)
    ownerId.value = detail.ownerId != null ? Number(detail.ownerId) : null
    if (removeMode.value && !isOwner.value) {
      removeMode.value = false
    }
    // 会话详情已含成员列表，避免再打独立 /members（旧后端无此接口会弹「接口不存在」）
    const list = detail.members || []
    // 群主排前面，其次普通成员，AI 助手放最后
    members.value = [...list].sort((a, b) => {
      const ao = isOwnerRole(a) ? 0 : (isBot(a) ? 2 : 1)
      const bo = isOwnerRole(b) ? 0 : (isBot(b) ? 2 : 1)
      return ao - bo
    })
  } catch (e) {
  } finally {
    loading.value = false
  }
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
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
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
  height: 0;
  padding: 28rpx;
  box-sizing: border-box;
}
.tip {
  color: $pc-muted;
  font-size: 24rpx;
  margin-bottom: 18rpx;
  padding: 0 8rpx;
}
.row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  margin-bottom: 14rpx;
  border-radius: $pc-radius-lg;
  transition: opacity 0.18s ease, border-color 0.18s ease;
  &.is-removable { border-color: rgba(244, 63, 94, 0.28); }
  &.is-locked { opacity: 0.55; }
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
</style>
