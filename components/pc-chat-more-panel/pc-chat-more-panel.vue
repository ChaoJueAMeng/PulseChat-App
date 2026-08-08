<template>
  <view
    class="panel-root"
    @touchstart="onPanelSwipeStart"
    @touchmove="onPanelSwipeMove"
    @touchend="onPanelSwipeEnd"
    @touchcancel="onPanelSwipeCancel"
  >
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
      @touchstart="onPanelSwipeStart"
      @touchmove="onPanelSwipeMove"
      @touchend="onPanelSwipeEnd"
      @touchcancel="onPanelSwipeCancel"
    >
      <view v-if="isGroup" class="hero pc-card pc-enter">
        <view class="avatar-wrap">
          <pc-avatar
            :url="avatar"
            :name="groupTitle || '群'"
            :size="128"
            :seed="conversationId"
            clickable
            @tap="previewAvatar"
          />
          <text v-if="isOwner" class="avatar-tip pc-press" @tap.stop="changeGroupAvatar">点击更换</text>
        </view>
        <view class="hero-meta">
          <text class="hero-name">{{ groupTitle || '群聊' }}</text>
          <text class="hero-sub">{{ memberCount }} 名成员</text>
        </view>
      </view>

      <view v-if="isGroup" class="panel pc-card pc-enter" style="animation-delay: 0.04s">
        <text class="label">群名称</text>
        <input
          v-if="isOwner"
          class="input"
          v-model="editTitle"
          maxlength="30"
          placeholder="输入群名称"
        />
        <text v-else class="readonly">{{ groupTitle || '未设置' }}</text>

        <text class="label">群公告</text>
        <textarea
          v-if="isOwner"
          class="area"
          v-model="editNotice"
          maxlength="200"
          placeholder="填写群公告，让成员了解群规"
        />
        <text v-else class="readonly notice">{{ editNotice || '暂无公告' }}</text>

        <button v-if="isOwner" class="pc-btn save" :disabled="saving" @tap="saveGroupInfo">
          {{ saving ? '保存中…' : '保存群资料' }}
        </button>
      </view>

      <view v-if="isGroup" class="menu pc-card pc-enter" style="animation-delay: 0.08s">
        <view class="item pc-press" @tap="goMembers">
          <text>群成员</text>
          <text class="item-extra">{{ memberCount }} ›</text>
        </view>
        <view v-if="isOwner" class="item pc-press" @tap="goAddMembers">
          <text>添加成员</text>
          <text class="item-extra">›</text>
        </view>
        <view v-if="isOwner" class="item pc-press" @tap="goRemoveMembers">
          <text>移除成员</text>
          <text class="item-extra">›</text>
        </view>
      </view>

      <view v-if="isFriendPrivate" class="menu pc-card pc-enter">
        <view class="item pc-press" @tap="goFriendProfile">
          <text>好友资料</text>
          <text class="item-extra">›</text>
        </view>
      </view>

      <view v-if="isNonFriendPrivate" class="menu pc-card pc-enter">
        <view
          class="item pc-press"
          :class="{ disabled: applied }"
          @tap="applyAddFriend"
        >
          <text>{{ applied ? '已申请' : '加好友' }}</text>
        </view>
      </view>

      <view class="menu pc-card pc-enter" :style="{ animationDelay: isGroup ? '0.12s' : '0.06s' }">
        <view class="item switch-row">
          <text>置顶聊天</text>
          <switch :checked="pinned" color="#A78BFA" @change="onPinChange" />
        </view>
        <view class="item switch-row">
          <text>消息通知</text>
          <switch :checked="!muted" color="#A78BFA" @change="onNotifyChange" />
        </view>
        <view class="item pc-press" @tap="pickChatBackground">
          <text>{{ chatBg ? '清除聊天背景' : '设置聊天背景' }}</text>
          <text class="item-extra">›</text>
        </view>
      </view>

      <view v-if="isAiPrivate" class="menu pc-card pc-enter danger-menu" style="animation-delay: 0.1s">
        <view class="item danger pc-press" @tap="confirmClearAiHistory">清空聊天记录</view>
      </view>

      <view v-if="isFriendPrivate" class="menu pc-card pc-enter danger-menu" style="animation-delay: 0.1s">
        <view class="item danger pc-press" @tap="confirmDeleteFriend">删除好友</view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../../utils/request.js'
import { fullUrl } from '../../utils/url.js'
import { getStore } from '../../store/index.js'
import { isPinned, syncBackgroundFromDetail } from '../../utils/chat-settings.js'
import { cacheLocalAs, getDisplayUrl } from '../../utils/image-cache.js'
import PcAvatar from '../pc-avatar/pc-avatar.vue'

const props = defineProps({
  conversationId: { type: [Number, String], default: null },
  initialTitle: { type: String, default: '' },
  /** 预挂载后即可拉资料 */
  active: { type: Boolean, default: false },
  /** 面板可见时再轻量刷新（从子页返回等） */
  visible: { type: Boolean, default: false },
  /** 递增时强制刷新（会话页 onShow 且更多仍打开） */
  refreshSeq: { type: Number, default: 0 },
  /** 嵌在会话页内：返回发 close，而非 navigateBack */
  embedded: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'exit-chat', 'background-changed', 'swipe-start', 'swipe-move', 'swipe-end', 'swipe-cancel'])

const convType = ref(1)
const ownerId = ref(null)
const peer = ref(null)
const groupTitle = ref('')
const avatar = ref('')
const editTitle = ref('')
const editNotice = ref('')
const members = ref([])
const isFriend = ref(false)
const applied = ref(false)
const pinned = ref(false)
const muted = ref(false)
const chatBg = ref('')
const saving = ref(false)
let loadedForId = null
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

const myId = computed(() => getStore().state.user?.id)
const isGroup = computed(() => Number(convType.value) === 2)
const isOwner = computed(() => {
  return isGroup.value && myId.value != null && ownerId.value != null
    && Number(myId.value) === Number(ownerId.value)
})
const isPrivateHuman = computed(() => Number(convType.value) === 1 && peer.value && !peer.value.bot)
const isAiPrivate = computed(() => Number(convType.value) === 1 && peer.value && !!peer.value.bot)
const isFriendPrivate = computed(() => isPrivateHuman.value && isFriend.value)
const isNonFriendPrivate = computed(() => isPrivateHuman.value && !isFriend.value)
const memberCount = computed(() => (members.value || []).filter(m => Number(m.memberType) !== 2).length
  || (members.value || []).length)
const pageTitle = computed(() => (isGroup.value ? '群聊设置' : '聊天设置'))

function onPanelSwipeStart(e) {
  emit('swipe-start', e)
}
function onPanelSwipeMove(e) {
  emit('swipe-move', e)
}
function onPanelSwipeEnd(e) {
  emit('swipe-end', e)
}
function onPanelSwipeCancel(e) {
  emit('swipe-cancel', e)
}

function goBack() {
  if (props.embedded) {
    emit('close')
    return
  }
  uni.navigateBack()
}

async function load() {
  const id = Number(props.conversationId)
  if (!id) return
  const detail = await api.conversation(id)
  convType.value = detail.type || 1
  ownerId.value = detail.ownerId != null ? Number(detail.ownerId) : null
  peer.value = detail.peer || null
  groupTitle.value = detail.title || ''
  avatar.value = detail.avatar || ''
  editTitle.value = detail.title || ''
  editNotice.value = detail.notice || ''
  members.value = detail.members || []
  muted.value = !!(detail.muted ?? detail.mute)
  pinned.value = isPinned(detail)
  chatBg.value = syncBackgroundFromDetail(id, detail) || ''

  if (isPrivateHuman.value && peer.value?.id) {
    try {
      const res = await api.checkFriend(peer.value.id)
      isFriend.value = !!(res?.friend || res?.isFriend)
      applied.value = !!(res?.pending || res?.applied)
    } catch (e) {
      isFriend.value = false
    }
  }
  loadedForId = id
}

watch(
  () => props.initialTitle,
  (title) => {
    if (title && !groupTitle.value) {
      groupTitle.value = title
      editTitle.value = title
    }
  },
  { immediate: true }
)

watch(
  () => [Number(props.conversationId) || 0, props.active],
  ([id, active]) => {
    if (!active || !id) return
    if (loadedForId === id) return
    load().catch(() => {})
  },
  { immediate: true }
)

watch(
  () => props.visible,
  (vis, prev) => {
    if (!vis || !props.active || !props.conversationId) return
    // 每次真正打开时刷新（含从群成员等子页返回后再次聚焦）
    if (vis && !prev) load().catch(() => {})
  }
)

watch(
  () => props.refreshSeq,
  (seq) => {
    if (!seq || !props.visible || !props.conversationId) return
    load().catch(() => {})
  }
)

function previewAvatar() {
  const path = avatar.value
  if (!path) {
    uni.showToast({ title: '暂无群头像', icon: 'none' })
    return
  }
  const src = fullUrl(path) || getDisplayUrl(path)
  if (!src) {
    uni.showToast({ title: '暂无群头像', icon: 'none' })
    return
  }
  uni.previewImage({ urls: [src], current: src })
}

function changeGroupAvatar() {
  if (!isOwner.value) return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const path = res.tempFilePaths?.[0]
      if (!path) return
      uni.showLoading({ title: '上传中…', mask: true })
      try {
        const up = await api.upload(path, { category: 'avatar' })
        const url = up.url || ''
        if (url) await cacheLocalAs(url, path)
        await api.updateGroup(Number(props.conversationId), { avatar: url })
        avatar.value = url
        uni.showToast({ title: '群头像已更新', icon: 'none' })
      } catch (e) {
        uni.showToast({ title: e?.message || '上传失败', icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    }
  })
}

async function saveGroupInfo() {
  if (!isOwner.value || saving.value) return
  const title = (editTitle.value || '').trim()
  if (!title) {
    uni.showToast({ title: '请填写群名称', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await api.updateGroup(Number(props.conversationId), {
      title,
      notice: editNotice.value == null ? '' : String(editNotice.value)
    })
    groupTitle.value = title
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function goMembers() {
  uni.navigateTo({
    url: '/pages/group-members/group-members?id=' + props.conversationId
      + '&title=' + encodeURIComponent(groupTitle.value || '群聊')
  })
}

function goAddMembers() {
  if (!isOwner.value) {
    uni.showToast({ title: '仅群主可添加成员', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: '/pages/group-add-members/group-add-members?id=' + props.conversationId
      + '&title=' + encodeURIComponent(groupTitle.value || '群聊')
  })
}

function goRemoveMembers() {
  if (!isOwner.value) return
  uni.navigateTo({
    url: '/pages/group-members/group-members?id=' + props.conversationId
      + '&title=' + encodeURIComponent(groupTitle.value || '群聊')
      + '&mode=remove'
  })
}

function goFriendProfile() {
  if (!peer.value?.id) return
  uni.navigateTo({
    url: '/pages/friend-profile/friend-profile?userId=' + peer.value.id
      + '&convId=' + props.conversationId
      + '&title=' + encodeURIComponent(groupTitle.value || peer.value.nickname || '好友资料')
  })
}

async function applyAddFriend() {
  if (!peer.value?.id || applied.value) return
  try {
    await api.applyFriend(peer.value.id)
    await load()
    uni.showToast({
      title: isFriend.value ? '已成为好友' : '已发送申请',
      icon: 'none'
    })
  } catch (e) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  }
}

async function onPinChange(e) {
  const next = !!e.detail.value
  try {
    const detail = await api.updateConvSettings(Number(props.conversationId), { pinned: next ? 1 : 0 })
    pinned.value = !!(detail?.pinned ?? (next ? 1 : 0))
    getStore().upsertConversation(detail || { id: Number(props.conversationId), pinned: next ? 1 : 0, pinnedAt: next ? Date.now() : null })
    uni.showToast({ title: next ? '已置顶' : '已取消置顶', icon: 'none' })
  } catch (err) {
    pinned.value = !next
    uni.showToast({ title: err?.message || '设置失败', icon: 'none' })
  }
}

async function onNotifyChange(e) {
  const enable = !!e.detail.value
  const nextMuted = !enable
  try {
    await api.updateConvSettings(Number(props.conversationId), { mute: nextMuted ? 1 : 0 })
    muted.value = nextMuted
    uni.showToast({ title: nextMuted ? '已关闭通知' : '已开启通知', icon: 'none' })
  } catch (err) {
    muted.value = !nextMuted
  }
}

async function pickChatBackground() {
  const id = Number(props.conversationId)
  if (chatBg.value) {
    uni.showLoading({ title: '清除中…', mask: true })
    try {
      const detail = await api.updateConvSettings(id, { background: '' })
      syncBackgroundFromDetail(id, detail || { background: '' })
      chatBg.value = ''
      emit('background-changed', '')
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
        emit('background-changed', chatBg.value)
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
  const name = peer.value?.nickname || groupTitle.value || '该好友'
  uni.showModal({
    title: '删除好友',
    content: '确定删除好友「' + name + '」吗？删除后将解除好友关系。',
    confirmText: '删除',
    confirmColor: '#F43F5E',
    success: async (res) => {
      if (!res.confirm || !peer.value?.id) return
      try {
        await api.deleteFriend(peer.value.id)
        uni.showToast({ title: '已删除好友', icon: 'none' })
        setTimeout(() => {
          if (props.embedded) {
            emit('exit-chat')
          } else {
            uni.navigateBack({ delta: 2 })
          }
        }, 400)
      } catch (e) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
      }
    }
  })
}

function confirmClearAiHistory() {
  if (!isAiPrivate.value || !props.conversationId) return
  uni.showModal({
    title: '清空聊天记录',
    content: '将删除与 Kimi 的本地与云端全部聊天记录，之后 Kimi 将不再记得此前对话。此操作不可恢复。',
    confirmText: '清空',
    confirmColor: '#F43F5E',
    success: async (res) => {
      if (!res.confirm) return
      uni.showLoading({ title: '清空中…', mask: true })
      try {
        const vo = await api.clearAiChatHistory(Number(props.conversationId))
        const store = getStore()
        if (vo) {
          store.upsertConversation({
            ...vo,
            lastMsgId: null,
            lastMsgPreview: '',
            lastMsgAt: null,
            unreadCount: 0,
            aiStreaming: false,
            aiStreamClientMsgId: null,
            aiStreamContent: ''
          })
        } else {
          store.upsertConversation({
            id: Number(props.conversationId),
            lastMsgId: null,
            lastMsgPreview: '',
            lastMsgAt: null,
            unreadCount: 0
          })
        }
        try {
          uni.setStorageSync('pc_cleared_conv_' + props.conversationId, Date.now())
        } catch (e) {}
        try {
          uni.$emit('pc-conversation-cleared', { conversationId: Number(props.conversationId) })
        } catch (e) {}
        uni.showToast({ title: '已清空聊天记录', icon: 'none' })
        setTimeout(() => {
          if (props.embedded) emit('close')
          else uni.navigateBack()
        }, 350)
      } catch (e) {
        uni.showToast({ title: e?.message || '清空失败', icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    }
  })
}
</script>

<style scoped lang="scss">
.panel-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.body {
  flex: 1;
  height: 0;
  padding: 28rpx;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.hero {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 32rpx;
  border-radius: $pc-radius-xl;
  margin-bottom: 22rpx;
}
.avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}
.avatar-tip {
  font-size: 20rpx;
  color: $pc-purple;
}
.hero-meta { flex: 1; min-width: 0; }
.hero-name {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: $pc-text;
}
.hero-sub {
  display: block;
  margin-top: 10rpx;
  color: $pc-muted;
  font-size: 22rpx;
}
.panel {
  border-radius: $pc-radius-xl;
  padding: 28rpx;
  margin-bottom: 22rpx;
  box-sizing: border-box;
}
.label {
  display: block;
  color: $pc-muted;
  font-size: 22rpx;
  margin: 8rpx 0 12rpx;
}
.input {
  display: block;
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  color: $pc-text;
  font-size: 30rpx;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.04);
  border-radius: $pc-radius-md;
  border: 1px solid rgba(167, 139, 250, 0.14);
  margin-bottom: 16rpx;
}
.area {
  display: block;
  width: 100%;
  min-height: 160rpx;
  padding: 20rpx 24rpx;
  box-sizing: border-box;
  color: $pc-text;
  font-size: 26rpx;
  line-height: 1.5;
  background: rgba(255, 255, 255, 0.04);
  border-radius: $pc-radius-md;
  border: 1px solid rgba(167, 139, 250, 0.14);
  margin-bottom: 16rpx;
}
.readonly {
  display: block;
  color: $pc-text;
  font-size: 28rpx;
  margin-bottom: 18rpx;
  line-height: 1.5;
  &.notice { color: $pc-muted; white-space: pre-wrap; }
}
.save {
  margin-top: 8rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: $pc-radius-pill;
  font-size: 28rpx;
  &[disabled] { opacity: 0.55; }
}
.menu {
  border-radius: $pc-radius-xl;
  overflow: hidden;
  margin-bottom: 22rpx;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 30rpx 28rpx;
  color: $pc-text;
  font-size: 28rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.1);
  &:last-child { border-bottom: none; }
  &.disabled { opacity: 0.45; pointer-events: none; }
  &.danger { color: $pc-rose; justify-content: center; }
}
.item-extra { color: $pc-muted; font-size: 24rpx; }
.switch-row { padding-right: 20rpx; }
.danger-menu .item { border-bottom: none; }
</style>
