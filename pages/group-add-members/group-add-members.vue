<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">添加成员</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view class="panel pc-card pc-enter">
        <view class="label-row">
          <text class="label">从好友中选择</text>
          <text v-if="candidates.length" class="label-extra">已选 {{ selected.length }} / {{ candidates.length }}</text>
        </view>

        <template v-if="loading">
          <view v-for="i in 4" :key="'sk-' + i" class="pc-skeleton sk-row"></view>
        </template>

        <view v-else-if="!candidates.length" class="pc-empty pc-empty--compact">
          <view class="pc-empty__icon">✓</view>
          <text class="pc-empty__title">好友都已在群里</text>
          <text class="pc-empty__sub">暂无可添加的好友，去认识更多朋友吧</text>
          <view class="pc-empty__action pc-press" @tap="goSearch">去添加好友</view>
        </view>

        <template v-else>
          <view
            v-for="f in candidates"
            :key="f.id"
            class="row pc-press"
            :class="{ on: isSelected(f.friendId) }"
            @tap="toggle(f.friendId)"
          >
            <view class="pc-check" :class="{ on: isSelected(f.friendId) }"></view>
            <pc-avatar
              :url="f.user?.avatar"
              :name="f.remark || f.user?.nickname"
              :size="72"
              :seed="f.friendId"
            />
            <view class="meta">
              <text class="name">{{ f.remark || f.user?.nickname || '好友' }}</text>
              <text v-if="f.remark && f.user?.nickname" class="sub">昵称 {{ f.user.nickname }}</text>
            </view>
          </view>
        </template>
      </view>
      <button
        v-if="candidates.length || loading"
        class="pc-btn create"
        :class="{ 'is-busy': submitting }"
        :disabled="submitting"
        @tap="submit"
      >{{ submitting ? '添加中…' : (selected.length ? `添加 ${selected.length} 位成员` : '添加成员') }}</button>
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


const conversationId = ref(null)
const friends = ref([])
const memberIds = ref([])
const selected = ref([])
const submitting = ref(false)
const loading = ref(true)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

const candidates = computed(() => {
  const inGroup = new Set((memberIds.value || []).map(Number))
  return (friends.value || []).filter(f => !inGroup.has(Number(f.friendId)))
})

function goBack() {
  uni.navigateBack()
}

function goSearch() {
  uni.navigateTo({ url: '/pages/search/search' })
}

function isSelected(id) {
  return selected.value.includes(Number(id))
}

function toggle(id) {
  const n = Number(id)
  if (selected.value.includes(n)) {
    selected.value = selected.value.filter(x => x !== n)
  } else {
    selected.value.push(n)
  }
  try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
}

async function load() {
  loading.value = true
  try {
    const myId = getStore().state.user?.id
    const [friendList, members] = await Promise.all([
      api.friends(),
      api.groupMembers(conversationId.value).catch(async () => {
        // 兼容旧后端无 /members 时，回退到会话详情
        const detail = await api.conversation(conversationId.value)
        return detail.members || []
      })
    ])
    friends.value = friendList || []
    memberIds.value = (members || []).map(m => m.userId)
    // 排除自己（通常已在群内）
    if (myId != null) memberIds.value.push(myId)
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (submitting.value) return
  if (!selected.value.length) {
    uni.showToast({ title: '请选择要添加的好友', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    await api.inviteMembers(conversationId.value, selected.value)
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
    uni.showToast({ title: `已添加 ${selected.value.length} 位成员`, icon: 'success' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch (e) {
  } finally {
    submitting.value = false
  }
}

onLoad(async (q) => {
  conversationId.value = Number(q.id)
  if (!Number.isFinite(conversationId.value) || conversationId.value <= 0) {
    uni.showToast({ title: '群聊不存在', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
    return
  }
  try {
    const detail = await api.conversation(conversationId.value)
    const myId = getStore().state.user?.id
    if (myId == null || Number(detail.ownerId) !== Number(myId)) {
      uni.showToast({ title: '仅群主可添加成员', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 500)
      return
    }
    await load()
  } catch (e) {
    setTimeout(() => uni.navigateBack(), 400)
  }
})

onShow(() => {
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
.body { flex: 1; height: 0; padding: 28rpx; box-sizing: border-box; }
.panel { border-radius: $pc-radius-lg; padding: 24rpx; margin-bottom: 18rpx; }
.label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.label { display: block; color: $pc-muted; font-size: 24rpx; }
.label-extra { color: $pc-purple; font-size: 22rpx; }
.sk-row { height: 104rpx; margin-bottom: 10rpx; border-radius: $pc-radius-md; }
.row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 18rpx 8rpx;
  border-radius: $pc-radius-md;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
  transition: background 0.18s ease;
  &:last-child { border-bottom: none; }
  &.on { background: rgba(167, 139, 250, 0.08); }
}
.meta { flex: 1; min-width: 0; }
.name {
  display: block; color: $pc-text; font-size: 28rpx;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.sub { display: block; color: $pc-muted; font-size: 22rpx; margin-top: 4rpx; }
.create {
  margin-top: 24rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: $pc-radius-pill;
}
</style>
