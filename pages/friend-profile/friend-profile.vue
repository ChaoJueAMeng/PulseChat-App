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
          <view class="name-row">
            <text class="name">{{ displayName }}</text>
            <text v-if="isSelf" class="tag me">我</text>
            <text v-else-if="isFriend" class="tag">好友</text>
          </view>
          <text v-if="remark && user?.nickname" class="nick">昵称 {{ user.nickname }}</text>
          <text v-if="user?.account" class="acc">账号 {{ user.account }}</text>
          <text v-if="user?.phone" class="phone">{{ user.phone }}</text>
        </view>
      </view>

      <view class="bio pc-card pc-enter" style="animation-delay: 0.08s">
        <text class="label">个性签名</text>
        <text class="text" :class="{ placeholder: !user?.bio }">{{ user?.bio || '这个人很酷，什么都没写' }}</text>
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
          <view class="pc-item-ico" :class="{ danger: item.danger }">{{ item.icon }}</view>
          <text class="item-label">{{ item.label }}</text>
          <text v-if="item.value" class="item-value">{{ item.value }}</text>
          <view v-if="item.toggle" class="dot" :class="{ on: item.on }"></view>
          <view v-else class="pc-chevron"></view>
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
import { pickImages } from '../../utils/media-pick.js'
import { isPickCancel } from '../../utils/media-msg.js'
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
    { key: 'remark', icon: '✎', label: '备注', value: remark.value || '未设置' },
    { key: 'pin', icon: '⇈', label: '置顶聊天', toggle: true, on: pinned.value },
    { key: 'notify', icon: '♪', label: '消息通知', toggle: true, on: !muted.value },
    { key: 'bg', icon: '▣', label: '聊天背景', value: chatBg.value ? '已设置' : '默认' },
    { key: 'delete', icon: '⌫', label: '删除好友', danger: true }
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

let mutePending = false

/** 通知开关可随时反向切换，直接执行即可，无需二次确认 */
function toggleMute() {
  applyMute(!muted.value)
}

async function applyMute(next) {
  if (mutePending) return
  mutePending = true
  try {
    const id = await ensureConv()
    await api.updateConvSettings(id, { mute: next ? 1 : 0 })
    muted.value = next
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
    uni.showToast({ title: next ? '已关闭通知' : '已开启通知', icon: 'none' })
  } catch (e) {
  } finally {
    mutePending = false
  }
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
  let path
  try {
    const imgRes = await pickImages({ count: 1 })
    path = imgRes.tempFilePaths?.[0]
  } catch (e) {
    if (isPickCancel(e)) return
    uni.showToast({ title: e?.message || '无法打开相册', icon: 'none' })
    return
  }
  if (!path) return
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
.info { flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 12rpx; min-width: 0; }
.name {
  font-size: 36rpx; font-weight: 800; color: $pc-text;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.tag {
  flex-shrink: 0;
  font-size: 20rpx;
  color: $pc-purple;
  padding: 2rpx 12rpx;
  border-radius: $pc-radius-pill;
  background: rgba(167, 139, 250, 0.14);
  &.me { color: $pc-muted; background: rgba(255, 255, 255, 0.08); }
}
.nick, .acc, .phone { display: block; color: $pc-muted; font-size: 22rpx; margin-top: 8rpx; }
.bio { border-radius: $pc-radius-lg; margin-bottom: 22rpx; }
.label { display: block; color: $pc-muted; font-size: 22rpx; padding: 24rpx 30rpx 8rpx; }
.text { display: block; color: $pc-text; font-size: 28rpx; padding: 0 30rpx 30rpx; line-height: 1.5; }
.text.placeholder { color: #6B5C7A; }
.menu {
  border-radius: $pc-radius-lg;
  padding: 8rpx 0;
  margin-bottom: 22rpx;
}
.item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 26rpx;
  color: $pc-text;
  font-size: 28rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
  transition: background 0.15s ease;
}
.item:active { background: rgba(167, 139, 250, 0.08); }
.item:last-child { border-bottom: none; }
.item.danger { color: $pc-red; }
.item.danger:active { background: rgba(244, 63, 94, 0.12); }
.item-label { flex: 1; min-width: 0; }
.item-value {
  flex-shrink: 1; min-width: 0; max-width: 260rpx;
  color: $pc-muted; font-size: 22rpx;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/* 开关点：置顶 / 通知状态一眼可见 */
.dot {
  flex-shrink: 0;
  width: 64rpx;
  height: 36rpx;
  border-radius: 999rpx;
  background: rgba(155, 138, 175, 0.25);
  position: relative;
  transition: background 0.2s ease;
  margin-right: 4rpx;
  &::after {
    content: '';
    position: absolute;
    top: 4rpx;
    left: 4rpx;
    width: 28rpx;
    height: 28rpx;
    border-radius: 50%;
    background: #F5EDFF;
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  &.on {
    background: linear-gradient(120deg, $pc-purple-deep, $pc-purple);
    &::after { transform: translateX(28rpx); }
  }
}
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
