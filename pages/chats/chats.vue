<template>
  <view class="chats-page">
  <view
    class="chats pc-aurora"
    :class="tabAnimClass"
    @touchstart="onTabSwipeStart"
    @touchend="onTabSwipeEnd"
  >
    <view class="page-header pc-nav-bar pc-page-header--static" :style="headerStyle">
      <view class="top pc-enter">
        <view class="top-row">
          <text class="hello">Hey, {{ userName }}</text>
          <view class="actions">
            <view class="icon-btn pc-press" :class="{ active: showMenu }" @tap.stop="toggleMenu">＋</view>
          </view>
        </view>
        <view class="status-row">
          <view class="pc-glow-dot" :style="{ background: connected ? '#A78BFA' : '#F43F5E' }"></view>
          <text class="status">{{ connected ? '实时在线' : '重连中…' }}</text>
        </view>
      </view>

      <view class="search-bar pc-card pc-enter" style="animation-delay: 0.06s">
        <text class="search-icon">⌕</text>
        <input
          class="search-input"
          v-model="searchKeyword"
          placeholder="搜索聊天"
          confirm-type="search"
        />
        <text v-if="searchKeyword" class="search-clear pc-press" @tap="searchKeyword = ''">×</text>
      </view>
    </view>

    <view class="list-wrap">
      <view
        class="pc-refresher"
        :class="{ 'is-dragging': isPulling, 'is-refreshing': refreshing }"
        :style="refresherPanelStyle"
      >
        <view class="pc-refresher__icon" :style="refresherSpinnerStyle">
          <view class="pc-refresher__ring" :class="{ 'is-spinning': refreshing }"></view>
          <view class="pc-refresher__dot"></view>
        </view>
      </view>
      <scroll-view
        scroll-y
        class="list"
        refresher-enabled
        :refresher-triggered="refreshing"
        :refresher-threshold="refresherThreshold"
        refresher-default-style="none"
        refresher-background="transparent"
        @refresherrefresh="refresh"
        @refresherpulling="onRefresherPulling"
        @refresherrestore="onRefresherRestore"
        @refresherabort="onRefresherRestore"
        @touchstart="onTabSwipeStart"
        @touchend="onTabSwipeEnd"
      >
        <template v-if="loading && !list.length">
          <view v-for="i in 6" :key="'sk-' + i" class="skeleton"></view>
        </template>
        <view v-else-if="!list.length" class="empty">
          <text class="empty-title">还没有对话</text>
          <text class="empty-sub">去通讯录加好友，或直接和 Kimi 聊聊</text>
        </view>
        <view v-else-if="!filteredList.length" class="empty">
          <text class="empty-title">未找到相关会话</text>
          <text class="empty-sub">试试其他关键词</text>
        </view>
        <template v-else>
          <view
            v-for="item in filteredList"
            :key="item.id"
            class="row pc-card pc-press"
            @tap="openChat(item)"
            @longpress="onLong(item)"
          >
            <pc-avatar :url="item.avatar" :name="item.title" :size="96" :seed="item.id" :show-badge="showAiBadge(item)" />
            <view class="meta">
            <view class="line1">
              <text class="title">{{ item.title }}</text>
              <text v-if="isItemPinned(item)" class="pin-tag">置顶</text>
              <text v-if="isItemMuted(item)" class="mute-tag">静音</text>
              <text class="time">{{ formatTime(item.lastMsgAt) }}</text>
            </view>
              <view class="line2">
                <text class="preview">{{ item.lastMsgPreview || '开始一段脉冲对话吧' }}</text>
                <view v-if="item.unreadCount" class="badge">{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</view>
              </view>
            </view>
          </view>
        </template>
      </scroll-view>
    </view>
    <view v-if="showMenu" class="menu-mask" @tap="closeMenu"></view>
    <view v-if="showMenu" class="menu-popover" :style="menuStyle" @tap.stop>
      <view class="menu-arrow"></view>
      <view
        v-for="item in menuItems"
        :key="item.key"
        class="menu-item pc-press"
        @tap="onMenuSelect(item.key)"
      >
        <text class="menu-icon">{{ item.icon }}</text>
        <text class="menu-label">{{ item.label }}</text>
      </view>
    </view>
  </view>
  <pc-tabbar :current="0" />
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onShow, onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { onWs } from '../../utils/ws.js'
import { sortConversations, isPinned, setPinned } from '../../utils/chat-settings.js'
import { handleRootBackPress } from '../../utils/quit.js'
import { useTabPageTransition } from '../../utils/tab-swipe.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

onBackPress(() => handleRootBackPress())
const store = getStore()
const list = ref([])
const loading = ref(false)
const refreshing = ref(false)
const pullDy = ref(0)
const isPulling = ref(false)
const refresherThreshold = 72
const REFRESHER_MAX_PX = 120
const REFRESHER_HOLD_PX = 56

function clampPullHeight(dy) {
  return Math.min(Math.max(dy || 0, 0), REFRESHER_MAX_PX)
}

const refresherPanelStyle = computed(() => {
  const h = refreshing.value ? REFRESHER_HOLD_PX : clampPullHeight(pullDy.value)
  return {
    height: h + 'px',
    opacity: h > 2 ? 1 : 0
  }
})

const refresherSpinnerStyle = computed(() => {
  const h = refreshing.value ? REFRESHER_HOLD_PX : clampPullHeight(pullDy.value)
  const progress = Math.min(h / refresherThreshold, 1)
  const scale = 0.55 + progress * 0.5
  const opacity = Math.min(0.35 + progress * 0.65, 1)
  if (refreshing.value) {
    return { opacity: 1, transform: 'scale(1)' }
  }
  const deg = progress * 270
  return {
    opacity,
    transform: `rotate(${deg}deg) scale(${scale})`
  }
})
const searchKeyword = ref('')
const showMenu = ref(false)
const { tabAnimClass, onTabSwipeStart, onTabSwipeEnd } = useTabPageTransition(0, {
  shouldIgnore: () => showMenu.value || refreshing.value || isPulling.value
})
const menuStyle = ref({})
const sysInfo = uni.getSystemInfoSync()
const statusBarHeight = ref(sysInfo.statusBarHeight || 20)
let offs = []
let syncTimer = null
let pullRaf = 0
let pendingPullDy = 0
let loadGen = 0

const headerStyle = computed(() => ({
  paddingTop: statusBarHeight.value + 'px'
}))

function updateMenuPosition(onReady) {
  uni.createSelectorQuery()
    .select('.actions')
    .boundingClientRect((rect) => {
      if (rect) {
        const { windowWidth } = uni.getSystemInfoSync()
        menuStyle.value = {
          top: `${rect.bottom + uni.upx2px(18)}px`,
          right: `${windowWidth - rect.right}px`
        }
      }
      if (onReady) onReady()
    })
    .exec()
}

const menuItems = [
  { key: 'search', label: '加好友', icon: '⌕' },
  { key: 'group', label: '创建群聊', icon: '⊕' },
  { key: 'ai', label: '找 Kimi', icon: '✦' }
]

const userName = computed(() => store.state.user?.nickname || '旅人')
const connected = computed(() => store.state.connected)

const filteredList = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return list.value
  return list.value.filter((item) => {
    const title = (item.title || '').toLowerCase()
    const preview = (item.lastMsgPreview || '').toLowerCase()
    const peerName = (item.peer?.nickname || '').toLowerCase()
    return title.includes(kw) || preview.includes(kw) || peerName.includes(kw)
  })
})

/** 从 store 同步列表，避免每条 WS 都打 HTTP */
function syncFromStore() {
  list.value = store.state.conversations || []
}

function scheduleSyncFromStore() {
  if (syncTimer) return
  syncTimer = setTimeout(() => {
    syncTimer = null
    syncFromStore()
  }, 80)
}

function resetPullVisual() {
  if (pullRaf) {
    clearTimeout(pullRaf)
    pullRaf = 0
  }
  pendingPullDy = 0
  isPulling.value = false
  if (!refreshing.value) pullDy.value = 0
}

async function load() {
  const gen = ++loadGen
  loading.value = true
  try {
    const data = await api.conversations()
    if (gen !== loadGen) return
    list.value = sortConversations(data || [])
    store.setConversations(list.value)
  } catch (e) {
  } finally {
    if (gen !== loadGen) return
    loading.value = false
    refreshing.value = false
    resetPullVisual()
  }
}

function refresh() {
  if (pullRaf) {
    clearTimeout(pullRaf)
    pullRaf = 0
  }
  pendingPullDy = 0
  isPulling.value = false
  refreshing.value = true
  pullDy.value = REFRESHER_HOLD_PX
  load()
}

function onRefresherPulling(e) {
  if (refreshing.value) return
  const d = e.detail || {}
  pendingPullDy = typeof d.dy === 'number' ? d.dy : (typeof d.deltaY === 'number' ? d.deltaY : 0)
  isPulling.value = true
  // 下拉过程按帧合并，减少 style 抖动
  if (pullRaf) return
  pullRaf = setTimeout(() => {
    pullRaf = 0
    // 已松手/中止后不再回写高度，避免小幅下拉后刷新标卡住
    if (refreshing.value || !isPulling.value) return
    pullDy.value = Math.max(pendingPullDy, 0)
  }, 16)
}

function onRefresherRestore() {
  // 未达刷新阈值松手：立刻清掉节流回调与高度
  resetPullVisual()
}

function openChat(item) {
  uni.navigateTo({ url: '/pages/chat/chat?id=' + item.id + '&title=' + encodeURIComponent(item.title || '聊天') })
}

async function openAi() {
  const conv = await api.openAiChat()
  openChat(conv)
}

function goSearch() { uni.navigateTo({ url: '/pages/search/search' }) }
function goGroup() { uni.navigateTo({ url: '/pages/group-create/group-create' }) }

function toggleMenu() {
  if (showMenu.value) {
    closeMenu()
    return
  }
  updateMenuPosition(() => {
    showMenu.value = true
  })
}

function closeMenu() {
  showMenu.value = false
}

function onMenuSelect(key) {
  closeMenu()
  if (key === 'ai') openAi()
  else if (key === 'group') goGroup()
  else if (key === 'search') goSearch()
}

function applyList(next) {
  list.value = sortConversations(next || [])
  store.setConversations(list.value)
}

function togglePin(item) {
  const next = !isPinned(item.id)
  setPinned(item.id, next)
  applyList(list.value)
  uni.showToast({ title: next ? '已置顶' : '已取消置顶', icon: 'none' })
}

async function toggleNotify(item) {
  const muted = !!(item.muted ?? item.mute)
  const nextMuted = !muted
  try {
    await api.updateConvSettings(item.id, { mute: nextMuted ? 1 : 0 })
    applyList(list.value.map((c) => {
      if (Number(c.id) !== Number(item.id)) return c
      return { ...c, muted: nextMuted, mute: nextMuted ? 1 : 0 }
    }))
    uni.showToast({ title: nextMuted ? '已关闭通知' : '已开启通知', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '设置失败', icon: 'none' })
  }
}

function onLong(item) {
  const pinned = isPinned(item.id)
  const muted = !!(item.muted ?? item.mute)
  uni.showActionSheet({
    itemList: [
      '标记已读',
      pinned ? '取消置顶' : '置顶聊天',
      muted ? '开启消息通知' : '关闭消息通知',
      item.hasBot ? '已接入 AI' : '添加 Kimi 机器人'
    ],
    success: async (res) => {
      if (res.tapIndex === 0) {
        await api.markRead(item.id)
        load()
      } else if (res.tapIndex === 1) {
        togglePin(item)
      } else if (res.tapIndex === 2) {
        await toggleNotify(item)
      } else if (res.tapIndex === 3 && !item.hasBot) {
        await api.addBot(item.id)
        const tip = item.type === 1 && !item.peer?.bot
          ? 'Kimi 已加入，私聊中请 @Kimi 才会回复'
          : 'Kimi 已加入'
        uni.showToast({ title: tip, icon: 'none', duration: 2500 })
        load()
      }
    }
  })
}

function showAiBadge(item) {
  if (item.showAiBadge === true) return true
  // 兼容旧接口：仅 Kimi 私聊（对方为 bot）显示角标，不因挂载 Kimi 而显示
  return item.type === 1 && !!item.peer?.bot
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return h + ':' + m
}
function isItemPinned(item) {
  return isPinned(item.id)
}
function isItemMuted(item) {
  return !!(item.muted ?? item.mute)
}

onShow(() => {
  try { uni.hideTabBar({ animation: false }) } catch (e) {}
  // 有缓存先展示，再后台刷新，减少切 Tab 白屏等待
  if (store.state.conversations?.length && !list.value.length) {
    syncFromStore()
  }
  load()
})
onMounted(() => {
  // notify 已 upsert store，这里只做本地同步，禁止每条消息 HTTP 全量拉取
  offs.push(onWs('notify', (body) => {
    if (body?.type === 'conversation_updated') {
      scheduleSyncFromStore()
    }
  }))
  offs.push(onWs('connected', () => {
    scheduleSyncFromStore()
  }))
})
onUnmounted(() => {
  offs.forEach((fn) => fn && fn())
  offs = []
  clearTimeout(syncTimer)
  clearTimeout(pullRaf)
})
</script>

<style scoped lang="scss">
.chats-page {
  height: 100vh;
  overflow: hidden;
}
.chats {
  height: 100%;
  padding: 0 28rpx calc(140rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.page-header {
  margin: 0 -28rpx 8rpx;
  padding: 0 28rpx 16rpx;
  width: calc(100% + 56rpx);
}
.top { margin-bottom: 20rpx; padding-top: 12rpx; }
.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.hello { flex: 1; min-width: 0; font-size: 42rpx; font-weight: 800; color: $pc-text; letter-spacing: 0.5rpx; }
.status-row { display: flex; align-items: center; gap: 10rpx; margin-top: 10rpx; }
.status { color: $pc-muted; font-size: 22rpx; }
.actions { flex-shrink: 0; position: relative; }
.icon-btn {
  width: 76rpx; height: 76rpx; border-radius: $pc-radius-md;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
  color: #fff; font-size: 40rpx; font-weight: 700;
  box-shadow: 0 10rpx 28rpx rgba(124, 58, 237, 0.35);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  &.active {
    box-shadow: 0 0 0 3rpx rgba(167, 139, 250, 0.45), 0 10rpx 28rpx rgba(124, 58, 237, 0.45);
  }
}
.menu-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.menu-popover {
  position: fixed;
  z-index: 1001;
  min-width: 280rpx;
  padding: 10rpx 0;
  border-radius: $pc-radius-lg;
  background:
    linear-gradient(180deg, rgba(124, 58, 237, 0.18) 0%, transparent 36%),
    rgba(20, 10, 34, 0.97);
  border: 1px solid rgba(167, 139, 250, 0.28);
  box-shadow:
    0 12rpx 40rpx rgba(88, 28, 135, 0.42),
    0 0 24rpx rgba(167, 139, 250, 0.12);
  animation: pc-bubble-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  transform-origin: top right;
}
.menu-arrow {
  position: absolute;
  top: -14rpx;
  right: 22rpx;
  width: 0;
  height: 0;
  border-left: 14rpx solid transparent;
  border-right: 14rpx solid transparent;
  border-bottom: 14rpx solid rgba(28, 16, 48, 0.97);
  filter: drop-shadow(0 -2rpx 4rpx rgba(167, 139, 250, 0.2));
  &::after {
    content: '';
    position: absolute;
    top: 2rpx;
    left: -12rpx;
    width: 0;
    height: 0;
    border-left: 12rpx solid transparent;
    border-right: 12rpx solid transparent;
    border-bottom: 12rpx solid rgba(167, 139, 250, 0.22);
  }
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 28rpx;
  color: $pc-text;
  font-size: 28rpx;
  transition: background 0.15s ease;
  &:active { background: rgba(167, 139, 250, 0.14); }
  &:not(:last-child) {
    border-bottom: 1px solid rgba(167, 139, 250, 0.1);
  }
}
.menu-icon {
  width: 40rpx;
  text-align: center;
  font-size: 28rpx;
  color: $pc-purple;
}
.menu-label {
  flex: 1;
  font-weight: 600;
  letter-spacing: 0.5rpx;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 22rpx;
  margin-bottom: 8rpx;
  border-radius: $pc-radius-lg;
}
.search-icon {
  color: $pc-muted;
  font-size: 32rpx;
  line-height: 1;
}
.search-input {
  flex: 1;
  height: 64rpx;
  color: $pc-text;
  font-size: 26rpx;
  background: transparent;
}
.search-clear {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $pc-radius-pill;
  color: $pc-muted;
  font-size: 36rpx;
  line-height: 1;
  background: rgba(167, 139, 250, 0.12);
}
.list-wrap {
  flex: 1;
  height: 0;
  position: relative;
  overflow: hidden;
}
.list { height: 100%; background: transparent; }
.row {
  display: flex; gap: 22rpx; padding: 26rpx; border-radius: $pc-radius-lg; margin-bottom: 18rpx;
}
.meta { flex: 1; overflow: hidden; }
.line1, .line2 { display: flex; justify-content: space-between; align-items: center; gap: 8rpx; }
.line1 .title { flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title { font-size: 30rpx; font-weight: 700; color: $pc-text; }
.pin-tag {
  margin-left: 10rpx;
  font-size: 18rpx;
  color: $pc-purple;
  padding: 2rpx 10rpx;
  border-radius: $pc-radius-pill;
  border: 1px solid rgba(167, 139, 250, 0.35);
}
.mute-tag {
  margin-left: 8rpx;
  font-size: 18rpx;
  color: $pc-muted;
  padding: 2rpx 10rpx;
  border-radius: $pc-radius-pill;
  border: 1px solid rgba(155, 138, 175, 0.35);
}
.time { font-size: 20rpx; color: #7A6B8C; margin-left: auto; }
.preview {
  margin-top: 12rpx; font-size: 24rpx; color: $pc-muted;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 420rpx;
}
.badge {
  min-width: 34rpx; height: 34rpx; padding: 0 10rpx; border-radius: $pc-radius-pill;
  background: linear-gradient(135deg, $pc-rose, $pc-red);
  color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
}
.skeleton {
  height: 128rpx; border-radius: $pc-radius-lg; margin-bottom: 18rpx;
  background: linear-gradient(90deg, rgba(167,139,250,.06), rgba(244,63,94,.1), rgba(167,139,250,.06));
  background-size: 200% 100%; animation: pc-shine 1.2s linear infinite;
}
.empty { padding: 140rpx 40rpx; text-align: center; }
.empty-title { display: block; font-size: 32rpx; color: $pc-text; margin-bottom: 12rpx; }
.empty-sub { color: $pc-muted; font-size: 24rpx; }
</style>
