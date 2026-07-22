<template>
  <view class="chat-page pc-aurora">
    <view v-if="!connected" class="banner">网络波动，正在重连脉冲通道…</view>
    <scroll-view
      scroll-y
      class="msgs"
      :scroll-into-view="scrollInto"
      :scroll-with-animation="true"
      @scrolltoupper="loadMore"
    >
      <view v-if="typingText" class="typing">{{ typingText }}</view>
      <view
        v-for="m in messages"
        :id="'m-' + m.id"
        :key="m.clientMsgId || m.id"
        class="msg-row"
        :class="{ mine: m.mine, ai: m.msgType === 5 }"
      >
        <view class="bubble" @longpress="onMsgLong(m)">
          <image v-if="m.msgType === 2" :src="fullUrl(m.content)" mode="widthFix" class="img" @tap="preview(m.content)" />
          <text v-else class="txt">{{ m.content }}</text>
          <text v-if="m.streaming" class="cursor">▍</text>
        </view>
      </view>
      <view id="bottom-anchor"></view>
    </scroll-view>

    <view v-if="showAt" class="at-panel pc-card">
      <view class="at-item" v-for="mem in members" :key="mem.userId" @tap="pickAt(mem)">
        @{{ mem.nickname }}{{ mem.memberType === 2 ? ' · AI' : '' }}
      </view>
    </view>

    <view class="composer pc-card">
      <view class="tools">
        <text class="tool" @tap="pickImage">图</text>
        <text class="tool" @tap="toggleAt">@</text>
        <text class="tool" @tap="addBot">AI</text>
      </view>
      <input
        class="input"
        v-model="text"
        confirm-type="send"
        @confirm="send"
        @input="onTyping"
        placeholder="说点有脉冲感的…"
        placeholder-class="ph"
      />
      <button class="send pc-btn" @tap="send">发送</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { BASE_URL } from '../../utils/config.js'
import { getStore } from '../../store/index.js'
import { subscribeConversation, onWs, sendStomp } from '../../utils/ws.js'

const conversationId = ref(null)
const title = ref('聊天')
const messages = ref([])
const text = ref('')
const scrollInto = ref('bottom-anchor')
const members = ref([])
const showAt = ref(false)
const atUserIds = ref([])
const typingText = ref('')
const connected = ref(true)
const streamingMap = ref({})
let offs = []
let typingTimer = null

onLoad(async (q) => {
  conversationId.value = Number(q.id)
  title.value = decodeURIComponent(q.title || '聊天')
  uni.setNavigationBarTitle({ title: title.value })
  subscribeConversation(conversationId.value)
  await loadHistory()
  const detail = await api.conversation(conversationId.value)
  members.value = detail.members || []
  if (messages.value.length) {
    await api.markRead(conversationId.value, messages.value[messages.value.length - 1].id)
  }
})

onMounted(() => {
  const store = getStore()
  connected.value = store.state.connected
  offs.push(onWs('chat', (msg) => {
    if (msg.conversationId !== conversationId.value) return
    upsertMsg(msg)
    scrollInto.value = 'bottom-anchor'
  }))
  offs.push(onWs('ai', (chunk) => {
    if (chunk.conversationId !== conversationId.value) return
    handleAi(chunk)
  }))
  offs.push(onWs('typing', (p) => {
    if (!p.typing) { typingText.value = ''; return }
    const mem = members.value.find(m => m.userId === p.userId)
    typingText.value = (mem?.nickname || '对方') + ' 正在输入…'
  }))
  offs.push(onWs('connected', () => { connected.value = true }))
})

onUnmounted(() => offs.forEach(fn => fn && fn()))

async function loadHistory(beforeId) {
  const list = await api.messages(conversationId.value, beforeId)
  if (!beforeId) {
    messages.value = list || []
  } else {
    messages.value = [...(list || []), ...messages.value]
  }
  setTimeout(() => { scrollInto.value = 'bottom-anchor' }, 50)
}

async function loadMore() {
  if (!messages.value.length) return
  await loadHistory(messages.value[0].id)
}

function upsertMsg(msg) {
  const myId = getStore().state.user?.id
  msg.mine = msg.senderId === myId
  if (msg.clientMsgId && streamingMap.value[msg.clientMsgId]) {
    const idx = messages.value.findIndex(m => m.clientMsgId === msg.clientMsgId)
    if (idx >= 0) {
      messages.value[idx] = { ...messages.value[idx], ...msg, streaming: false }
      delete streamingMap.value[msg.clientMsgId]
      return
    }
  }
  if (messages.value.some(m => m.id === msg.id)) {
    messages.value = messages.value.map(m => m.id === msg.id ? { ...m, ...msg } : m)
    return
  }
  messages.value.push(msg)
}

function handleAi(chunk) {
  if (chunk.type === 'start') {
    streamingMap.value[chunk.clientMsgId] = true
    messages.value.push({
      clientMsgId: chunk.clientMsgId,
      conversationId: conversationId.value,
      senderId: 1,
      msgType: 5,
      content: '',
      mine: false,
      streaming: true
    })
  } else if (chunk.type === 'delta') {
    const idx = messages.value.findIndex(m => m.clientMsgId === chunk.clientMsgId)
    if (idx >= 0) {
      messages.value[idx].content = chunk.content
      scrollInto.value = 'bottom-anchor'
    }
  } else if (chunk.type === 'done') {
    const idx = messages.value.findIndex(m => m.clientMsgId === chunk.clientMsgId)
    if (idx >= 0) {
      messages.value[idx].content = chunk.content
      messages.value[idx].streaming = false
    }
  }
}

async function send() {
  const content = text.value.trim()
  if (!content) return
  const payload = {
    conversationId: conversationId.value,
    content,
    msgType: 1,
    atUserIds: atUserIds.value.length ? [...atUserIds.value] : undefined
  }
  text.value = ''
  atUserIds.value = []
  showAt.value = false
  try {
    uni.vibrateShort && uni.vibrateShort({})
    const msg = await api.sendMessage(payload)
    upsertMsg(msg)
    scrollInto.value = 'bottom-anchor'
  } catch (e) {}
}

function onTyping() {
  sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: true })
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: false })
  }, 1200)
}

function toggleAt() { showAt.value = !showAt.value }
function pickAt(mem) {
  atUserIds.value = Array.from(new Set([...atUserIds.value, mem.userId]))
  text.value += '@' + mem.nickname + ' '
  showAt.value = false
}

async function addBot() {
  await api.addBot(conversationId.value)
  const detail = await api.conversation(conversationId.value)
  members.value = detail.members || []
  uni.showToast({ title: 'Kimi 已加入会话', icon: 'none' })
}

function pickImage() {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const file = res.tempFilePaths[0]
      const up = await api.upload(file)
      const msg = await api.sendMessage({
        conversationId: conversationId.value,
        content: up.url,
        msgType: 2
      })
      upsertMsg(msg)
    }
  })
}

function fullUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return BASE_URL + path
}
function preview(path) {
  uni.previewImage({ urls: [fullUrl(path)] })
}

function onMsgLong(m) {
  if (!m.mine || m.msgType === 4) return
  uni.showActionSheet({
    itemList: ['撤回'],
    success: async (res) => {
      if (res.tapIndex === 0) {
        const updated = await api.recallMessage(m.id)
        upsertMsg(updated)
      }
    }
  })
}
</script>

<style scoped lang="scss">
.chat-page { height: 100vh; display: flex; flex-direction: column; }
.banner {
  background: rgba(255,107,74,.18); color: #FFB29F; text-align: center;
  font-size: 22rpx; padding: 10rpx;
}
.msgs { flex: 1; padding: 24rpx; }
.typing { color: #7F93A8; font-size: 22rpx; margin-bottom: 12rpx; }
.msg-row { display: flex; margin-bottom: 18rpx; animation: pc-bubble-in .28s ease; }
.msg-row.mine { justify-content: flex-end; }
.bubble {
  max-width: 72%; padding: 18rpx 22rpx; border-radius: 22rpx;
  background: rgba(18, 36, 52, 0.92); border: 1px solid rgba(41,208,255,.16); color: #E8F4FF;
  position: relative;
}
.mine .bubble {
  background: linear-gradient(135deg, rgba(46,230,166,.28), rgba(41,208,255,.25));
  border-color: rgba(46,230,166,.35);
}
.ai .bubble {
  border-color: rgba(255,107,74,.35);
  box-shadow: 0 0 24rpx rgba(255,107,74,.12);
}
.txt { font-size: 28rpx; line-height: 1.5; white-space: pre-wrap; }
.cursor { color: #2EE6A6; margin-left: 4rpx; animation: pc-pulse 0.8s infinite; }
.img { width: 360rpx; border-radius: 16rpx; }
.at-panel { margin: 0 20rpx 12rpx; border-radius: 18rpx; padding: 8rpx 0; max-height: 260rpx; overflow: auto; }
.at-item { padding: 18rpx 24rpx; color: #D7F7FF; font-size: 26rpx; }
.composer {
  margin: 12rpx 16rpx 24rpx; border-radius: 24rpx; padding: 14rpx 16rpx;
  display: flex; align-items: center; gap: 12rpx;
}
.tools { display: flex; gap: 8rpx; }
.tool {
  width: 56rpx; height: 56rpx; border-radius: 14rpx; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,.06); color: #9CB0C4; font-size: 22rpx;
}
.input {
  flex: 1; height: 68rpx; padding: 0 16rpx; color: #E8F4FF;
  background: rgba(255,255,255,.04); border-radius: 14rpx;
}
.ph { color: #5d6f80; }
.send {
  height: 68rpx; line-height: 68rpx; padding: 0 26rpx; border-radius: 999rpx; font-size: 26rpx; margin: 0;
}
</style>
