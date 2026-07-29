<template>
  <view class="profile pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">{{ pageTitle }}</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view class="hero pc-card pc-enter">
        <pc-avatar
          :url="user?.avatar"
          :name="displayName"
          :size="128"
          :seed="user?.id"
          clickable
          @tap="previewAvatar"
        />
        <view class="info">
          <text class="name">{{ displayName }}</text>
          <text v-if="remark && user?.nickname" class="nick">昵称 {{ user.nickname }}</text>
          <text class="acc">账号 {{ user?.account }}</text>
          <text class="phone">{{ user?.phone }}</text>
        </view>
      </view>

      <view class="bio pc-card pc-enter" style="animation-delay: 0.08s">
        <text class="label">个性签名</text>
        <text class="text">{{ user?.bio || '这个人很酷，什么都没写' }}</text>
      </view>

      <view
        v-if="isFriend && !isSelf"
        class="menu pc-card pc-enter"
        style="animation-delay: 0.1s"
      >
        <view
          v-for="item in moreItems"
          :key="item.key"
          class="item pc-press"
          :class="{ danger: item.danger }"
          @tap="onActionSelect(item.key)"
        >
          <text>{{ item.label }}</text>
        </view>
      </view>

      <view class="actions pc-enter" style="animation-delay: 0.14s">
        <button v-if="isSelf" class="pc-btn chat-btn applied-btn" disabled>这是你自己</button>
        <button v-else-if="isFriend" class="pc-btn chat-btn" @tap="openChat">发消息</button>
        <view v-else-if="incomingPending" class="incoming-actions">
          <button class="pc-btn chat-btn" @tap="acceptIncoming">同意好友申请</button>
          <button class="pc-btn reject-btn" @tap="rejectIncoming">拒绝</button>
        </view>
        <button
          v-else
          class="pc-btn chat-btn"
          :class="{ 'applied-btn': applied }"
          :disabled="applied"
          @tap="addFriend"
        >{{ applied ? '已申请' : '加好友' }}</button>
      </view>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow, onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { fullUrl } from '../../utils/url.js'
import { cacheLocalAs, getDisplayUrl } from '../../utils/image-cache.js'
import { isPinned, syncBackgroundFromDetail } from '../../utils/chat-settings.js'
import { getStore } from '../../store/index.js'
import { showModal } from '../../utils/feedback.js'
import { handlePageBackPress } from '../../utils/quit.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

onBackPress(() => handlePageBackPress())


const userId = ref(null)
const user = ref(null)
const remark = ref('')
const convId = ref(null)
const fromChat = ref(false)
const isFriend = ref(false)
const applied = ref(false)
const incomingPending = ref(false)
const incomingApplyId = ref(null)
const adding = ref(false)
const pinned = ref(false)
const muted = ref(false)
const chatBg = ref('')
const pageTitle = ref('好友资料')
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
const isSelf = computed(() => {
  const me = getStore().state.user
  return me?.id != null && userId.value != null && Number(me.id) === Number(userId.value)
})
const displayName = computed(() => remark.value || user.value?.nickname || '用户')

const moreItems = computed(() => {
  if (!isFriend.value || isSelf.value) return []
  return [
    { key: 'remark', label: remark.value ? '修改备注' : '设置备注' },
    { key: 'pin', label: pinned.value ? '取消置顶' : '设为置顶' },
    { key: 'notify', label: muted.value ? '开启消息通知' : '消息通知设置' },
    { key: 'bg', label: chatBg.value ? '清除聊天背景' : '设置聊天背景' },
    { key: 'delete', label: '删除好友', danger: true }
  ]
})

function goBack() {
  uni.navigateBack()
}

function previewAvatar() {
  const path = user.value?.avatar
  if (!path) {
    uni.showToast({ title: '暂无头像', icon: 'none' })
    return
  }
  const src = fullUrl(path) || getDisplayUrl(path)
  if (!src) {
    uni.showToast({ title: '暂无头像', icon: 'none' })
    return
  }
  uni.previewImage({ urls: [src], current: src })
}

function syncTitle() {
  pageTitle.value = displayName.value || '好友资料'
}

onLoad(async (q) => {
  const id = Number(q.userId)
  if (!Number.isFinite(id) || id <= 0) {
    uni.showToast({ title: '用户不存在', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
    return
  }
  userId.value = id
  fromChat.value = !!q.convId
  convId.value = q.convId ? Number(q.convId) : null
  if (q.title) {
    pageTitle.value = decodeURIComponent(q.title)
  }
  user.value = await api.userProfile(userId.value)
  await loadFriendStatus()
  if (isFriend.value) {
    await loadConvSettings()
  }
  syncTitle()
})

onShow(() => {
})

async function loadFriendStatus() {
  const targetId = user.value?.id || userId.value
  if (!targetId) return
  try {
    const res = await api.checkFriend(targetId)
    if (res?.friend || res?.isFriend) {
      isFriend.value = true
      applied.value = false
      incomingPending.value = false
      remark.value = (res?.remark || '').trim()
    } else {
      isFriend.value = false
      remark.value = ''
      applied.value = !!(res?.pending || res?.applied)
      incomingPending.value = !!res?.incomingPending
      if (incomingPending.value) {
        await loadIncomingApplyId(targetId)
      } else {
        incomingApplyId.value = null
      }
    }
  } catch (e) {}
}

async function loadIncomingApplyId(targetId) {
  try {
    const list = await api.pendingFriends()
    const hit = (list || []).find(p => p.friendId === targetId || p.user?.id === targetId)
    incomingApplyId.value = hit?.id || null
  } catch (e) {
    incomingApplyId.value = null
  }
}

async function promptRemark(opts = {}) {
  const targetId = user.value?.id || userId.value
  if (!targetId) return
  const res = await showModal({
    title: opts.title || (remark.value ? '修改备注' : '设置备注'),
    editable: true,
    editableValue: remark.value || '',
    placeholderText: user.value?.nickname ? `备注名（${user.value.nickname}）` : '请输入备注名',
    confirmText: '保存',
    cancelText: opts.cancelText || '取消'
  })
  if (!res.confirm) return
  const next = (res.content || '').trim()
  try {
    const vo = await api.updateFriendRemark(targetId, next)
    remark.value = (vo?.remark || next || '').trim()
    syncTitle()
    uni.showToast({ title: remark.value ? '备注已保存' : '已清除备注', icon: 'none' })
  } catch (e) {
    // request.js 已统一 toast；此处避免静默失败被误认为已保存
  }
}

async function acceptIncoming() {
  if (!incomingApplyId.value) {
    uni.showToast({ title: '未找到待处理申请', icon: 'none' })
    return
  }
  try {
    await api.acceptFriend(incomingApplyId.value)
    isFriend.value = true
    incomingPending.value = false
    uni.showToast({ title: '已成为好友', icon: 'none' })
    await loadConvSettings()
    await promptRemark({ title: '设置备注', cancelText: '跳过' })
  } catch (e) {}
}

async function rejectIncoming() {
  if (!incomingApplyId.value) return
  try {
    await api.rejectFriend(incomingApplyId.value)
    incomingPending.value = false
    incomingApplyId.value = null
    uni.showToast({ title: '已拒绝', icon: 'none' })
  } catch (e) {}
}

async function ensureConv() {
  if (convId.value) return convId.value
  const conv = await api.privateChat(userId.value)
  convId.value = conv.id
  return conv.id
}

async function loadConvSettings() {
  try {
    await ensureConv()
    const detail = await api.conversation(convId.value)
    pinned.value = isPinned(detail)
    chatBg.value = syncBackgroundFromDetail(convId.value, detail)
    muted.value = !!(detail.muted ?? detail.mute)
  } catch (e) {}
}

function onActionSelect(key) {
  if (key === 'remark') promptRemark()
  else if (key === 'pin') togglePin()
  else if (key === 'notify') toggleMute()
  else if (key === 'bg') pickChatBackground()
  else if (key === 'delete') confirmDeleteFriend()
}

async function addFriend() {
  const targetId = user.value?.id || userId.value
  if (applied.value || incomingPending.value || adding.value || !targetId) return
  adding.value = true
  try {
    await api.applyFriend(targetId)
    await loadFriendStatus()
    if (isFriend.value) {
      await loadConvSettings()
      uni.showToast({ title: '已成为好友', icon: 'none' })
      await promptRemark({ title: '设置备注', cancelText: '跳过' })
    } else {
      uni.showToast({ title: '已发送申请', icon: 'none' })
    }
  } catch (e) {
    const msg = String(e?.message || '')
    if (/已申请|已发送|pending|重复/i.test(msg)) {
      applied.value = true
    } else if (msg) {
      uni.showToast({ title: msg, icon: 'none' })
    }
  } finally {
    adding.value = false
  }
}

async function openChat() {
  if (fromChat.value && convId.value) {
    uni.navigateBack()
    return
  }
  const id = await ensureConv()
  uni.navigateTo({
    url: '/pages/chat/chat?id=' + id + '&title=' + encodeURIComponent(displayName.value || '私聊')
  })
}

async function togglePin() {
  if (!convId.value) return
  const next = !pinned.value
  try {
    const detail = await api.updateConvSettings(convId.value, { pinned: next ? 1 : 0 })
    pinned.value = !!(detail?.pinned ?? (next ? 1 : 0))
    getStore().upsertConversation(detail || { id: convId.value, pinned: next ? 1 : 0, pinnedAt: next ? Date.now() : null })
    uni.showToast({ title: pinned.value ? '已置顶' : '已取消置顶', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '设置失败', icon: 'none' })
  }
}

function toggleMute() {
  if (muted.value) {
    applyMute(false)
    return
  }
  uni.showActionSheet({
    itemList: ['关闭消息通知'],
    success: (res) => {
      if (res.tapIndex === 0) applyMute(true)
    }
  })
}

async function applyMute(next) {
  try {
    const id = await ensureConv()
    await api.updateConvSettings(id, { mute: next ? 1 : 0 })
    muted.value = next
    uni.showToast({ title: next ? '已关闭通知' : '已开启通知', icon: 'none' })
  } catch (e) {}
}

async function pickChatBackground() {
  const id = await ensureConv()
  if (chatBg.value) {
    uni.showLoading({ title: '清除中…', mask: true })
    try {
      const detail = await api.updateConvSettings(id, { background: '' })
      syncBackgroundFromDetail(id, detail || { background: '' })
      chatBg.value = ''
      uni.showToast({ title: '已清除背景', icon: 'none' })
    } catch (e) {
      uni.showToast({ title: e?.message || '清除失败', icon: 'none' })
    } finally {
      uni.hideLoading()
    }
    return
  }
  uni.chooseImage({
    count: 1,
    success: async (imgRes) => {
      const path = imgRes.tempFilePaths[0]
      uni.showLoading({ title: '设置中…', mask: true })
      try {
        const up = await api.upload(path)
        const url = up.url || ''
        if (!url) throw new Error('上传失败')
        await cacheLocalAs(url, path)
        const detail = await api.updateConvSettings(id, { background: url })
        const saved = syncBackgroundFromDetail(id, detail || { background: url })
        chatBg.value = saved || url
        uni.showToast({ title: '背景已设置', icon: 'none' })
      } catch (e) {
        uni.showToast({ title: e?.message || '设置失败', icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    }
  })
}

function confirmDeleteFriend() {
  const name = displayName.value || '该好友'
  uni.showModal({
    title: '删除好友',
    content: '确定删除好友「' + name + '」吗？删除后将解除好友关系。',
    confirmText: '删除',
    confirmColor: '#F43F5E',
    success: async (res) => {
      if (!res.confirm || !userId.value) return
      try {
        await api.deleteFriend(userId.value)
        isFriend.value = false
        applied.value = false
        incomingPending.value = false
        remark.value = ''
        uni.showToast({ title: '已删除好友', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 400)
      } catch (e) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
      }
    }
  })
}
</script>

<style scoped lang="scss">
.profile {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}
.body { flex: 1; height: 0; padding: 28rpx; box-sizing: border-box; }
.hero {
  display: flex;
  gap: 28rpx;
  align-items: center;
  padding: 36rpx;
  border-radius: $pc-radius-xl;
  margin-bottom: 22rpx;
}
.name { display: block; font-size: 36rpx; font-weight: 800; color: $pc-text; }
.nick, .acc, .phone { display: block; color: $pc-muted; font-size: 22rpx; margin-top: 8rpx; }
.bio { border-radius: $pc-radius-lg; margin-bottom: 22rpx; }
.label { display: block; color: $pc-muted; font-size: 22rpx; padding: 24rpx 30rpx 8rpx; }
.text { display: block; color: $pc-text; font-size: 28rpx; padding: 0 30rpx 30rpx; line-height: 1.5; }
.menu {
  border-radius: $pc-radius-lg;
  padding: 8rpx 0;
  margin-bottom: 22rpx;
}
.item {
  padding: 30rpx 30rpx;
  color: $pc-text;
  font-size: 28rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
  transition: background 0.15s ease;
}
.item:active { background: rgba(167, 139, 250, 0.08); }
.item:last-child { border-bottom: none; }
.item.danger { color: $pc-red; }
.item.danger:active { background: rgba(244, 63, 94, 0.12); }
.actions { padding: 0 8rpx; }
.incoming-actions { display: flex; flex-direction: column; gap: 16rpx; }
.reject-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: $pc-radius-pill;
  font-size: 28rpx;
  background: rgba(244, 63, 94, 0.12) !important;
  color: $pc-red;
  box-shadow: none;
}
.chat-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: $pc-radius-pill;
  font-size: 28rpx;
}
.applied-btn {
  opacity: 0.55;
  background: rgba(167, 139, 250, 0.22) !important;
  box-shadow: none;
}
</style>
