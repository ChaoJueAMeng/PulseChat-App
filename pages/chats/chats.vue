<template>
  <view class="chats pc-aurora">
    <view class="top">
      <view>
        <text class="hello">Hey, {{ userName }}</text>
        <view class="status-row">
          <view class="pc-glow-dot" :style="{ background: connected ? '#2EE6A6' : '#FF6B4A' }"></view>
          <text class="status">{{ connected ? '实时在线' : '重连中…' }}</text>
        </view>
      </view>
      <view class="actions">
        <view class="icon-btn" @tap="goSearch">＋</view>
      </view>
    </view>

    <view class="quick">
      <view class="chip" @tap="openAi">✨ 找 Kimi</view>
      <view class="chip" @tap="goGroup">👥 建群</view>
      <view class="chip" @tap="goSearch">🔍 搜人</view>
    </view>

    <scroll-view scroll-y class="list" @refresherrefresh="refresh" refresher-enabled :refresher-triggered="refreshing">
      <view v-if="loading && !list.length" class="skeleton" v-for="i in 6" :key="i"></view>
      <view v-if="!loading && !list.length" class="empty">
        <text class="empty-title">还没有对话</text>
        <text class="empty-sub">去通讯录加好友，或直接和 Kimi 聊聊</text>
      </view>
      <view
        v-for="item in list"
        :key="item.id"
        class="row pc-card"
        @tap="openChat(item)"
        @longpress="onLong(item)"
      >
        <view class="avatar" :style="{ background: avatarColor(item) }">
          <text>{{ avatarText(item) }}</text>
          <view v-if="item.hasBot" class="bot-badge">AI</view>
        </view>
        <view class="meta">
          <view class="line1">
            <text class="title">{{ item.title }}</text>
            <text class="time">{{ formatTime(item.lastMsgAt) }}</text>
          </view>
          <view class="line2">
            <text class="preview">{{ item.lastMsgPreview || '开始一段脉冲对话吧' }}</text>
            <view v-if="item.unreadCount" class="badge">{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { onWs } from '../../utils/ws.js'

const store = getStore()
const list = ref([])
const loading = ref(false)
const refreshing = ref(false)
let off = null

const userName = computed(() => store.state.user?.nickname || '旅人')
const connected = computed(() => store.state.connected)

async function load() {
  loading.value = true
  try {
    const data = await api.conversations()
    list.value = data || []
    store.setConversations(list.value)
  } catch (e) {
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function refresh() {
  refreshing.value = true
  load()
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

function onLong(item) {
  uni.showActionSheet({
    itemList: ['标记已读', item.hasBot ? '已接入 AI' : '添加 Kimi 机器人'],
    success: async (res) => {
      if (res.tapIndex === 0) {
        await api.markRead(item.id)
        load()
      }
      if (res.tapIndex === 1 && !item.hasBot) {
        await api.addBot(item.id)
        uni.showToast({ title: 'Kimi 已加入', icon: 'none' })
        load()
      }
    }
  })
}

function avatarText(item) {
  return (item.title || '?').slice(0, 1)
}
function avatarColor(item) {
  const colors = ['#1F6F5B', '#1B4F72', '#6B3E26', '#3D2C8D', '#0E4D64']
  return colors[(item.id || 0) % colors.length]
}
function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return h + ':' + m
}

onShow(() => { load() })
onMounted(() => {
  off = onWs('chat', () => load())
  onWs('notify', () => load())
})
onUnmounted(() => { if (off) off() })
</script>

<style scoped lang="scss">
.chats { min-height: 100vh; padding: 24rpx 24rpx 0; }
.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.hello { font-size: 40rpx; font-weight: 800; color: #E8F4FF; }
.status-row { display: flex; align-items: center; gap: 10rpx; margin-top: 8rpx; }
.status { color: #7F93A8; font-size: 22rpx; }
.icon-btn {
  width: 72rpx; height: 72rpx; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #2EE6A6, #29D0FF); color: #041018; font-size: 40rpx; font-weight: 700;
}
.quick { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.chip {
  padding: 14rpx 22rpx; border-radius: 999rpx; font-size: 22rpx; color: #D7F7FF;
  background: rgba(41,208,255,0.12); border: 1px solid rgba(41,208,255,0.22);
}
.list { height: calc(100vh - 260rpx); }
.row {
  display: flex; gap: 20rpx; padding: 24rpx; border-radius: 24rpx; margin-bottom: 18rpx;
  animation: pc-bubble-in .35s ease;
}
.avatar {
  width: 92rpx; height: 92rpx; border-radius: 24rpx; display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 36rpx; font-weight: 700; position: relative;
}
.bot-badge {
  position: absolute; right: -8rpx; bottom: -8rpx; font-size: 16rpx; padding: 4rpx 8rpx; border-radius: 8rpx;
  background: #FF6B4A; color: #fff;
}
.meta { flex: 1; overflow: hidden; }
.line1, .line2 { display: flex; justify-content: space-between; align-items: center; }
.title { font-size: 30rpx; font-weight: 700; color: #E8F4FF; }
.time { font-size: 20rpx; color: #6f8296; }
.preview { margin-top: 10rpx; font-size: 24rpx; color: #7F93A8; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 420rpx; }
.badge {
  min-width: 34rpx; height: 34rpx; padding: 0 10rpx; border-radius: 999rpx; background: #FF6B4A;
  color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
  animation: pc-pulse 1.4s infinite;
}
.skeleton {
  height: 120rpx; border-radius: 24rpx; margin-bottom: 18rpx;
  background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04));
  background-size: 200% 100%; animation: pc-shine 1.2s linear infinite;
}
.empty { padding: 120rpx 40rpx; text-align: center; }
.empty-title { display: block; font-size: 32rpx; color: #E8F4FF; margin-bottom: 12rpx; }
.empty-sub { color: #7F93A8; font-size: 24rpx; }
</style>
