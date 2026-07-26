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

    <view class="body">
      <view class="panel pc-card pc-enter">
        <text class="label">从好友中选择</text>
        <view v-if="!candidates.length" class="hint">暂无可添加的好友</view>
        <view
          v-for="f in candidates"
          :key="f.id"
          class="row pc-press"
          @tap="toggle(f.friendId)"
        >
          <view class="check" :class="{ on: selected.includes(f.friendId) }"></view>
          <pc-avatar
            :url="f.user?.avatar"
            :name="f.remark || f.user?.nickname"
            :size="64"
            :seed="f.friendId"
          />
          <text class="name">{{ f.remark || f.user?.nickname }}</text>
        </view>
      </view>
      <button class="pc-btn create" :disabled="submitting" @tap="submit">
        {{ submitting ? '添加中…' : '添加成员' }}
      </button>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

const conversationId = ref(null)
const friends = ref([])
const memberIds = ref([])
const selected = ref([])
const submitting = ref(false)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

const candidates = computed(() => {
  const inGroup = new Set((memberIds.value || []).map(Number))
  return (friends.value || []).filter(f => !inGroup.has(Number(f.friendId)))
})

function goBack() {
  uni.navigateBack()
}

function toggle(id) {
  const n = Number(id)
  if (selected.value.includes(n)) {
    selected.value = selected.value.filter(x => x !== n)
  } else {
    selected.value.push(n)
  }
}

async function load() {
  const myId = getStore().state.user?.id
  const [friendList, members] = await Promise.all([
    api.friends(),
    api.groupMembers(conversationId.value).catch(async () => {
      const detail = await api.conversation(conversationId.value)
      return detail.members || []
    })
  ])
  friends.value = friendList || []
  memberIds.value = (members || []).map(m => m.userId)
  // 排除自己（通常已在群内）
  if (myId != null) memberIds.value.push(myId)
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
    uni.showToast({ title: '已添加成员', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
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
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.body { flex: 1; padding: 28rpx; box-sizing: border-box; }
.panel { border-radius: $pc-radius-lg; padding: 24rpx; margin-bottom: 18rpx; }
.label { display: block; color: $pc-muted; margin-bottom: 12rpx; font-size: 24rpx; }
.hint {
  color: $pc-muted;
  font-size: 26rpx;
  padding: 40rpx 0;
  text-align: center;
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 0;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
}
.row:last-child { border-bottom: none; }
.check {
  width: 36rpx;
  height: 36rpx;
  border-radius: 12rpx;
  border: 1px solid $pc-purple;
  flex-shrink: 0;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.check.on {
  background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
  border-color: transparent;
}
.name { color: $pc-text; flex: 1; }
.create {
  margin-top: 24rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: $pc-radius-pill;
}
.create[disabled] { opacity: 0.55; }
</style>
