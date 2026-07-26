<template>
  <view class="chat-page pc-aurora" :style="pageStyle">
    <view class="nav-bar pc-nav-bar" :style="navBarWrapStyle">
      <view class="nav-inner" :style="navInnerStyle">
        <view class="nav-back pc-press" @tap="goBack">
          <text class="nav-back-icon">‹</text>
        </view>
        <text class="nav-title">{{ title }}</text>
        <view class="nav-more pc-press" @tap="openMoreMenu">
          <view class="hamburger">
            <view class="bar"></view>
            <view class="bar"></view>
            <view class="bar"></view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="!connected" class="banner">网络波动，正在重连脉冲通道…</view>
    <view v-else-if="convType === 1 && peer && !peer.bot && !isFriend" class="banner warn">你们已不是好友，无法发送新消息</view>
    <view v-else-if="isAiPrivate && messages.length === 0" class="banner tip">可以直接发图片，Kimi 会识别并回应</view>
    <scroll-view
      scroll-y
      class="msgs"
      :scroll-into-view="scrollInto"
      :scroll-top="scrollTop"
      :scroll-with-animation="scrollAnim"
      @scroll="onScroll"
      @scrolltoupper="loadMore"
    >
      <view class="msgs-inner" :style="msgsInnerStyle">
        <view v-if="typingText" class="typing">{{ typingText }}</view>
        <view
          v-for="(m, index) in messages"
          :key="m.clientMsgId || m.id"
          class="msg-block"
        >
          <view v-if="shouldShowTime(m, index)" class="msg-time">
            <text class="msg-time-text">{{ formatMsgTime(m.createdAt) }}</text>
          </view>
          <view
            :id="'m-' + m.id"
            class="msg-row"
            :class="{ mine: m.mine, ai: m.msgType === 5 }"
          >
            <view v-if="!m.mine" class="msg-avatar-wrap">
              <pc-avatar
                :url="senderAvatar(m)"
                :name="senderNickname(m)"
                :size="72"
                :seed="m.senderId || 0"
                :show-badge="isBotSender(m)"
              />
            </view>
            <view class="msg-col">
              <text v-if="showSenderName(m)" class="sender-name">{{ senderNickname(m) }}</text>
                <view
                class="bubble"
                :class="{
                  active: menuMsg && menuMsg.id === m.id,
                  sticker: m.msgType === MSG_EMOJI,
                  media: m.msgType === 2
                }"
                @longpress.stop="onMsgLong(m)"
              >
                <view
                  v-if="replyOf(m)"
                  class="quote-card pc-press"
                  @tap.stop="scrollToQuoted(replyOf(m))"
                >
                  <text class="quote-name">{{ replyOf(m).senderName || '用户' }}</text>
                  <text class="quote-text">{{ replyOf(m).content || '[消息]' }}</text>
                </view>
                <image
                  v-if="m.msgType === 2 && !mediaFailed(m)"
                  :src="mediaSrc(m)"
                  mode="widthFix"
                  class="img"
                  :fade-show="false"
                  @error="onMediaError(m)"
                  @tap="preview(m.content)"
                />
                <view v-else-if="m.msgType === 2" class="img-fallback" @tap="retryMedia(m)">
                  <text class="img-fallback-text">图片加载失败，点按重试</text>
                </view>
                <image
                  v-else-if="m.msgType === MSG_EMOJI && !mediaFailed(m)"
                  :src="mediaSrc(m)"
                  mode="aspectFit"
                  class="sticker-img"
                  :fade-show="false"
                  @error="onMediaError(m)"
                  @tap="preview(m.content)"
                />
                <view v-else-if="m.msgType === MSG_EMOJI" class="img-fallback sticker-fallback" @tap="retryMedia(m)">
                  <text class="img-fallback-text">表情加载失败</text>
                </view>
                <view v-else-if="m.msgType === MSG_VOICE" class="voice-bubble pc-press" @tap="togglePlayVoice(m)">
                  <view class="voice-play" :class="{ playing: playingId === m.id, mine: m.mine }">
                    <text class="voice-play-icon">{{ playingId === m.id ? '❚❚' : '▶' }}</text>
                  </view>
                  <view class="voice-body">
                    <view class="voice-bars" :class="{ anim: playingId === m.id }">
                      <view v-for="i in 4" :key="i" class="voice-bar" :style="{ animationDelay: (i * 0.12) + 's' }"></view>
                    </view>
                    <text class="voice-dur">{{ voiceDurationText(m) }}</text>
                  </view>
                </view>
                <text v-else class="txt">{{ m.content }}</text>
                <text v-if="m.streaming" class="cursor">▍</text>
              </view>
              <view v-if="reactionChips(m).length" class="react-strip" :class="{ mine: m.mine }">
                <text
                  v-for="r in reactionChips(m)"
                  :key="r.emoji"
                  class="react-chip"
                  :class="{ mine: r.mine }"
                  @tap.stop="onChipReact(m, r.emoji)"
                >{{ r.emoji }}<text v-if="r.count > 1" class="react-n">{{ r.count }}</text></text>
              </view>
            </view>
          </view>
        </view>
        <view id="bottom-anchor" class="bottom-anchor"></view>
      </view>
    </scroll-view>

    <view
      v-if="auxInputOpen"
      class="aux-dismiss-mask"
      @tap="dismissAuxInput"
    />

    <view v-if="showAt" class="at-panel pc-card" @tap.stop>
      <view class="at-item" v-for="mem in members" :key="mem.userId" @tap="pickAt(mem)">
        @{{ memberDisplayName(mem) || mem.nickname }}{{ mem.memberType === 2 ? ' · AI' : '' }}
      </view>
    </view>

    <pc-emoji-panel :show="showEmoji" @pick="insertEmoji" />
    <pc-sticker-panel
      ref="stickerPanelRef"
      :show="showSticker"
      @pick="sendSticker"
      @manage="openStickerManage"
    />

    <view v-if="recording" class="record-overlay">
      <view class="record-panel pc-card" :class="{ cancel: recordCancel }">
        <view class="record-pulse"></view>
        <text class="record-tip">{{ recordCancel ? '松开取消' : '松开发送，上滑取消' }}</text>
      </view>
    </view>

    <view v-if="blockedPrivateChat" class="friend-banner">你们已不是好友，无法发送新消息</view>

    <view v-if="showEditor" class="editor-overlay">
      <view class="editor-header pc-nav-bar" :style="editorHeaderStyle">
        <text class="editor-action pc-press" @tap="closeEditor">取消</text>
        <text class="editor-title">编辑消息</text>
        <text class="editor-action confirm pc-press" @tap="confirmEditor">完成</text>
      </view>
      <view class="editor-body pc-card">
        <textarea
          class="editor-textarea"
          v-model="editorText"
          :focus="editorFocus"
          :maxlength="-1"
          :show-confirm-bar="false"
          placeholder="说点有脉冲感的…"
          placeholder-class="ph"
        />
        <text class="editor-count">{{ editorText.length }} 字</text>
      </view>
    </view>

    <view v-if="showComposer" class="composer-wrap" :style="composerWrapStyle" @tap.stop>
      <view class="composer pc-card">
        <view v-if="replyTarget" class="reply-bar">
          <view class="reply-bar__body">
            <text class="reply-bar__label">引用 {{ replyTarget.name }}</text>
            <text class="reply-bar__preview">{{ replyTarget.preview }}</text>
          </view>
          <text class="reply-bar__close pc-press" @tap="clearReply">×</text>
        </view>
        <view class="input-row">
          <view class="input-field">
            <view
              v-if="voiceMode"
              class="voice-hold pc-press"
              :class="{ recording: recording, cancel: recordCancel }"
              @touchstart.stop.prevent="onVoiceTouchStart"
              @touchmove.stop.prevent="onVoiceTouchMove"
              @touchend.stop.prevent="onVoiceTouchEnd"
              @touchcancel.stop.prevent="onVoiceTouchCancel"
            >{{ recording ? (recordCancel ? '松开取消' : '松开发送') : '按住 说话' }}</view>
            <view v-else class="textarea-box">
              <textarea
                class="input textarea"
                :class="{ 'at-max': atMaxHeight }"
                v-model="text"
                :cursor="cursor"
                :auto-height="!atMaxHeight"
                :maxlength="-1"
                :show-confirm-bar="false"
                confirm-type="send"
                :style="textareaStyle"
                :adjust-position="false"
                @confirm="send"
                @input="onTextInput"
                @linechange="onLineChange"
                @keyboardheightchange="onTextareaKeyboard"
                placeholder="说点有脉冲感的…"
                placeholder-class="ph"
              />
              <view v-if="showExpand" class="expand-btn pc-press" @tap="openEditor">
                <view class="ico-expand">
                  <view class="ico-expand__corner tl"></view>
                  <view class="ico-expand__corner br"></view>
                </view>
              </view>
            </view>
          </view>
          <button v-if="!voiceMode" class="send pc-btn" :class="{ sending: sendPulse }" @tap="send">发送</button>
        </view>
        <view class="tools">
          <view class="tool pc-press" :class="{ active: voiceMode }" @tap="toggleVoiceMode">
            <view class="tool-ico ico-mic">
              <view class="ico-mic__head"></view>
              <view class="ico-mic__arc"></view>
              <view class="ico-mic__stand"></view>
            </view>
          </view>
          <text class="tool pc-press" :class="{ active: showEmoji }" @tap="toggleEmoji">☺</text>
          <text class="tool pc-press" :class="{ active: showSticker }" @tap="toggleSticker">贴</text>
          <view class="tool pc-press" @tap="pickImage">
            <view class="tool-ico ico-img">
              <view class="ico-img__frame"></view>
              <view class="ico-img__sun"></view>
              <view class="ico-img__hill"></view>
            </view>
          </view>
          <text class="tool pc-press" @tap="toggleAt">@</text>
          <text class="tool pc-press" @tap="addBot">AI</text>
        </view>
      </view>
    </view>

    <pc-msg-menu
      :show="!!menuMsg"
      :anchor="menuAnchor"
      :actions="menuActions"
      @close="closeMsgMenu"
      @action="onMenuAction"
      @react="onMenuReact"
    />

    <view v-if="showForward" class="fwd-mask" @tap="closeForward">
      <view class="fwd-panel pc-card" @tap.stop>
        <view class="fwd-head">
          <text class="fwd-title">转发到</text>
          <text class="fwd-close pc-press" @tap="closeForward">取消</text>
        </view>
        <scroll-view scroll-y class="fwd-list">
          <view v-if="!forwardList.length" class="fwd-empty">暂无会话可转发</view>
          <view
            v-for="c in forwardList"
            :key="c.id"
            class="fwd-item pc-press"
            @tap="confirmForward(c)"
          >
            <pc-avatar :url="c.avatar" :name="c.title" :size="72" :seed="c.id" />
            <text class="fwd-name">{{ c.title || '会话' }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import { onLoad, onShow, onUnload, onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { fullUrl } from '../../utils/url.js'
import { getDisplayUrl, ensureCached, prefetchAll, forgetCached, cacheLocalAs, isLocalMediaPath } from '../../utils/image-cache.js'
import { getStore } from '../../store/index.js'
import { subscribeConversation, onWs, sendStomp } from '../../utils/ws.js'
import { getBackground } from '../../utils/chat-settings.js'
import { MSG_VOICE, parseVoiceExtra, formatVoiceDuration } from '../../utils/voice.js'
import { MSG_EMOJI } from '../../utils/sticker.js'
import {
  getReplyMeta,
  getReactions,
  groupReactions,
  toggleReaction,
  setReaction,
  buildReplyExtra,
  msgPreviewText,
  stringifyExtra
} from '../../utils/msg-extra.js'
import { handlePageBackPress } from '../../utils/quit.js'
import PcEmojiPanel from '../../components/pc-emoji-panel/pc-emoji-panel.vue'
import PcStickerPanel from '../../components/pc-sticker-panel/pc-sticker-panel.vue'
import PcMsgMenu from '../../components/pc-msg-menu/pc-msg-menu.vue'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

const instance = getCurrentInstance()

onBackPress(() => {
  if (menuMsg.value) {
    closeMsgMenu()
    return true
  }
  if (showForward.value) {
    closeForward()
    return true
  }
  if (replyTarget.value) {
    clearReply()
    return true
  }
  return handlePageBackPress()
})

const conversationId = ref(null)
const title = ref('聊天')
const convType = ref(1)
const ownerId = ref(null)
const peer = ref(null)
const isFriend = ref(false)
const chatBg = ref('')
/** 实际用于渲染的背景地址（优先本地缓存） */
const chatBgDisplay = ref('')
const statusBarHeight = ref(20)
const navBarHeight = ref(44)
const navPaddingRight = ref(12)
const messages = ref([])
const text = ref('')
const scrollInto = ref('')
const scrollTop = ref(0)
const scrollAnim = ref(false)
const members = ref([])
const showAt = ref(false)
const showEmoji = ref(false)
const showSticker = ref(false)
const stickerPanelRef = ref(null)
const cursor = ref(-1)
const atUserIds = ref([])
const typingText = ref('')
const store = getStore()
const connected = computed(() => store.state.connected)
const streamingMap = ref({})
const sendPulse = ref(false)
const voiceMode = ref(false)
/** 表情 / 表情包 / @ / 语音模式任一开启时，可点空白处收起 */
const auxInputOpen = computed(() => showEmoji.value || showSticker.value || showAt.value || voiceMode.value)
const recording = ref(false)
const recordCancel = ref(false)
const playingId = ref(null)
const showEditor = ref(false)
const editorText = ref('')
const editorFocus = ref(false)
const inputLineCount = ref(1)
const atMaxHeight = ref(false)
const menuMsg = ref(null)
const menuAnchor = ref(null)
const replyTarget = ref(null)
const showForward = ref(false)
const forwardList = ref([])
const forwardSource = ref(null)
/** 单行高度约 40px，最多约 5 行 */
const INPUT_LINE_H = 40
const INPUT_MIN_LINES = 1
const INPUT_MAX_LINES = 5
const EXPAND_CHAR_THRESHOLD = 80
/** 距底部小于该阈值视为「在底部」（px） */
const NEAR_BOTTOM_PX = 80
let nearBottom = true
let msgsViewH = 0
let offs = []
let typingTimer = null
let scrollTimers = []
let recorder = null
let recordStartY = 0
let recordStartTime = 0
let voiceWillSend = false
let audioCtx = null
let readMarkTimer = null
let lastMarkedMsgId = 0
let pendingReadMsgId = 0
/** AI 流式：合并 delta 刷新，避免每个 token 触发整页滚动/重绘 */
let aiDeltaMap = Object.create(null)
let aiFlushTimer = null
let aiScrollPending = false
let typingActive = false

const isPrivateHuman = computed(() => convType.value === 1 && peer.value && !peer.value.bot)
const isAiPrivate = computed(() => convType.value === 1 && peer.value && !!peer.value.bot)
const isNonFriendPrivate = computed(() => isPrivateHuman.value && !isFriend.value)
const blockedPrivateChat = computed(() => isNonFriendPrivate.value)
const showComposer = computed(() => !blockedPrivateChat.value)
const isGroupChat = computed(() => convType.value === 2)

const navBarWrapStyle = computed(() => ({
  paddingTop: statusBarHeight.value + 'px',
  paddingRight: navPaddingRight.value + 'px'
}))

const navInnerStyle = computed(() => ({
  height: navBarHeight.value + 'px'
}))

const editorHeaderStyle = computed(() => ({
  paddingTop: (statusBarHeight.value + 8) + 'px'
}))

const textareaStyle = computed(() => ({
  minHeight: (INPUT_MIN_LINES * INPUT_LINE_H) + 'px',
  maxHeight: (INPUT_MAX_LINES * INPUT_LINE_H) + 'px'
}))

const showExpand = computed(() => {
  if (voiceMode.value || showEditor.value) return false
  return text.value.length >= EXPAND_CHAR_THRESHOLD
    || atMaxHeight.value
    || inputLineCount.value >= INPUT_MAX_LINES - 1
})

const keyboardHeight = ref(0)

const composerWrapStyle = computed(() => {
  const kb = keyboardHeight.value
  if (kb <= 0) return {}
  return {
    bottom: kb + 'px',
    // 键盘已盖住底部安全区，去掉额外 inset，避免空隙过大
    paddingBottom: '12px'
  }
})

const msgsInnerStyle = computed(() => {
  const kb = keyboardHeight.value
  if (kb <= 0) return {}
  return {
    paddingBottom: `calc(320rpx + ${kb}px)`
  }
})

const pageStyle = computed(() => {
  if (!chatBgDisplay.value) return {}
  const url = chatBgDisplay.value
  return {
    backgroundImage: `linear-gradient(165deg, rgba(10,6,20,0.72), rgba(26,11,40,0.78)), url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})

function applyKeyboardHeight(height) {
  const h = Math.max(0, Math.round(Number(height) || 0))
  const prev = keyboardHeight.value
  if (h === prev) {
    if (h > 0) nextTick(() => scrollToBottom(true))
    return
  }
  keyboardHeight.value = h
  if (h > 0) {
    showEmoji.value = false
    showSticker.value = false
    showAt.value = false
    nextTick(() => scrollToBottom(true, true))
  } else if (prev > 0) {
    nextTick(() => {
      uni.createSelectorQuery()
        .select('.msgs')
        .boundingClientRect((rect) => {
          if (rect?.height) msgsViewH = rect.height
        })
        .exec()
    })
  }
}

function onKeyboardHeightChange(res) {
  applyKeyboardHeight(res?.height)
}

function onTextareaKeyboard(e) {
  applyKeyboardHeight(e?.detail?.height)
}

/** 图片/表情加载失败或强制网络回退：key -> url | '__failed__' */
const mediaSrcOverride = ref({})

function mediaKey(m) {
  if (!m) return ''
  return String(m.id || m.clientMsgId || m.content || '')
}

function mediaSrc(m) {
  if (!m?.content) return ''
  const key = mediaKey(m)
  const override = mediaSrcOverride.value[key]
  if (override && override !== '__failed__') return override
  return getDisplayUrl(m.content) || fullUrl(m.content)
}

function mediaFailed(m) {
  return mediaSrcOverride.value[mediaKey(m)] === '__failed__'
}

function onMediaError(m) {
  if (!m?.content) return
  const key = mediaKey(m)
  const cur = mediaSrc(m)
  // 本地缓存失效：清缓存后回退完整网络 URL 再试一次
  if (isLocalMediaPath(cur)) {
    forgetCached(m.content)
    const remote = fullUrl(m.content)
    if (remote && remote !== cur) {
      mediaSrcOverride.value = { ...mediaSrcOverride.value, [key]: remote }
      return
    }
  }
  // 已是网络地址仍失败：再强制用归一化后的 fullUrl 重试一次（避免错误 host / 双斜杠）
  const remote = fullUrl(m.content)
  if (remote && remote !== cur && mediaSrcOverride.value[key] !== remote) {
    forgetCached(m.content)
    mediaSrcOverride.value = { ...mediaSrcOverride.value, [key]: remote }
    return
  }
  mediaSrcOverride.value = { ...mediaSrcOverride.value, [key]: '__failed__' }
}

function retryMedia(m) {
  if (!m?.content) return
  const key = mediaKey(m)
  forgetCached(m.content)
  const next = { ...mediaSrcOverride.value }
  delete next[key]
  mediaSrcOverride.value = next
  ensureCached(m.content).catch(() => {})
}

async function resolveChatBackground(raw) {
  chatBg.value = raw || ''
  if (!raw) {
    chatBgDisplay.value = ''
    return
  }
  chatBgDisplay.value = getDisplayUrl(raw)
  try {
    const local = await ensureCached(raw)
    if (local) chatBgDisplay.value = local
  } catch (e) {}
}

function initNavBarLayout(sys) {
  statusBarHeight.value = sys.statusBarHeight || 20
  const titleBarHeight = sys.platform === 'ios' ? 44 : 48
  navBarHeight.value = titleBarHeight
  navPaddingRight.value = Math.max(12, (sys.safeAreaInsets?.right || 0) + 8)
  // #ifdef MP-WEIXIN
  try {
    const capsule = uni.getMenuButtonBoundingClientRect()
    navBarHeight.value = (capsule.top - statusBarHeight.value) * 2 + capsule.height
    navPaddingRight.value = Math.max(12, (sys.windowWidth || 375) - capsule.left + 8)
  } catch (e) {
    navPaddingRight.value = 96
  }
  // #endif
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.switchTab({ url: '/pages/chats/chats' })
  }
}

async function loadFriendStatus() {
  if (!peer.value?.id) {
    isFriend.value = false
    return
  }
  try {
    const res = await api.checkFriend(peer.value.id)
    isFriend.value = !!(res?.friend || res?.isFriend)
  } catch (e) {
    isFriend.value = false
  }
}

function showSendError(e) {
  const msg = e?.message || '发送失败'
  uni.showToast({ title: msg, icon: 'none' })
}

onLoad(async (q) => {
  initNavBarLayout(uni.getSystemInfoSync())

  conversationId.value = Number(q.id)
  getStore().setActiveChatId(conversationId.value)
  title.value = decodeURIComponent(q.title || '聊天')
  chatBg.value = getBackground(conversationId.value)
  await resolveChatBackground(chatBg.value)
  subscribeConversation(conversationId.value)
  await loadHistory()
  const detail = await api.conversation(conversationId.value)
  members.value = detail.members || []
  convType.value = detail.type || 1
  ownerId.value = detail.ownerId != null ? Number(detail.ownerId) : null
  peer.value = detail.peer || null
  if (detail.title) title.value = detail.title
  if (convType.value === 1 && peer.value && !peer.value.bot) {
    await loadFriendStatus()
  } else {
    isFriend.value = false
  }
  if (messages.value.length) {
    markConversationRead(messages.value[messages.value.length - 1].id, true)
  }
})

onShow(async () => {
  if (conversationId.value) getStore().setActiveChatId(conversationId.value)
  if (!conversationId.value) return
  try {
    const detail = await api.conversation(conversationId.value)
    members.value = detail.members || []
    convType.value = detail.type || 1
    ownerId.value = detail.ownerId != null ? Number(detail.ownerId) : null
    peer.value = detail.peer || null
    if (detail.title) title.value = detail.title
  } catch (e) {}
  chatBg.value = getBackground(conversationId.value)
  await resolveChatBackground(chatBg.value)
  if (convType.value === 1 && peer.value && !peer.value.bot) {
    await loadFriendStatus()
  }
  if (messages.value.length) {
    markConversationRead(messages.value[messages.value.length - 1].id, true)
  }
  if (showSticker.value && stickerPanelRef.value?.reload) {
    stickerPanelRef.value.reload()
  }
})

onUnload(() => {
  const store = getStore()
  if (store.state.activeChatId === conversationId.value) {
    store.setActiveChatId(null)
  }
})

onMounted(() => {
  initRecorder()
  try {
    uni.onKeyboardHeightChange(onKeyboardHeightChange)
  } catch (e) {}
  offs.push(onWs('chat', (msg) => {
    if (msg.conversationId !== conversationId.value) return
    const myId = getStore().state.user?.id
    const stick = nearBottom || msg.senderId === myId
    upsertMsg(msg)
    if (stick) scrollToBottom(true)
    if (msg.senderId !== myId && msg.id) {
      markConversationRead(msg.id)
    }
  }))
  offs.push(onWs('ai', (chunk) => {
    if (chunk.conversationId !== conversationId.value) return
    handleAi(chunk)
  }))
  offs.push(onWs('typing', (p) => {
    if (!p.typing) { typingText.value = ''; return }
    const mem = findMember(p.userId)
    typingText.value = (memberDisplayName(mem) || '对方') + ' 正在输入…'
  }))
  offs.push(onWs('react', (payload) => {
    const myId = getStore().state.user?.id
    // 自己发出的事件已乐观更新，忽略回声避免抖动
    if (payload?.userId != null && Number(payload.userId) === Number(myId)) return
    applyRemoteReaction(payload)
  }))
  // 测一次可视高度，供 nearBottom 判断
  nextTick(() => {
    uni.createSelectorQuery()
      .select('.msgs')
      .boundingClientRect((rect) => {
        if (rect?.height) msgsViewH = rect.height
      })
      .exec()
  })
})

onUnmounted(() => {
  try {
    uni.offKeyboardHeightChange(onKeyboardHeightChange)
  } catch (e) {}
  keyboardHeight.value = 0
  offs.forEach(fn => fn && fn())
  clearTimeout(readMarkTimer)
  clearTimeout(aiFlushTimer)
  aiDeltaMap = Object.create(null)
  if (pendingReadMsgId > lastMarkedMsgId && conversationId.value) {
    const msgId = pendingReadMsgId
    pendingReadMsgId = 0
    api.markRead(conversationId.value, msgId, true).catch(() => {})
  }
  clearScrollTimers()
  stopVoicePlayback()
  if (recorder && recording.value) {
    voiceWillSend = false
    recorder.stop()
  }
})

function clearScrollTimers() {
  scrollTimers.forEach(clearTimeout)
  scrollTimers = []
}

/** 标记当前会话已读；WebSocket 高频消息时合并请求 */
function markConversationRead(lastMsgId, immediate = false) {
  if (!conversationId.value || !lastMsgId) return
  pendingReadMsgId = Math.max(pendingReadMsgId, lastMsgId)
  const flush = async () => {
    const msgId = pendingReadMsgId
    pendingReadMsgId = 0
    if (!msgId || msgId <= lastMarkedMsgId) return
    lastMarkedMsgId = msgId
    try {
      await api.markRead(conversationId.value, msgId, true)
    } catch (e) {}
  }
  clearTimeout(readMarkTimer)
  if (immediate) {
    flush()
  } else {
    readMarkTimer = setTimeout(flush, 300)
  }
}

function onScroll(e) {
  const d = e?.detail || {}
  const top = Number(d.scrollTop) || 0
  const contentH = Number(d.scrollHeight) || 0
  if (msgsViewH > 0 && contentH > 0) {
    nearBottom = top + msgsViewH >= contentH - NEAR_BOTTOM_PX
  }
}

/**
 * 可靠滚到底：
 * 1) 先清空再设 scroll-into-view（同值不触发）
 * 2) createSelectorQuery 算 maxTop 写入 scroll-top 兜底
 * 3) 首次进入可多次延迟，避免 DOM 未渲染完
 */
function scrollToBottom(animated = false, settle = false) {
  clearScrollTimers()
  scrollAnim.value = !!animated
  const run = () => {
    scrollInto.value = ''
    nextTick(() => {
      scrollInto.value = 'bottom-anchor'
      // settle / 首次进入才做完整测高；日常消息用 into-view 即可
      if (!settle) return
      uni.createSelectorQuery()
        .select('.msgs')
        .boundingClientRect()
        .select('.msgs-inner')
        .boundingClientRect()
        .exec((res) => {
          const view = res?.[0]
          const inner = res?.[1]
          if (!view || !inner) return
          msgsViewH = view.height || msgsViewH
          const maxTop = Math.max(0, (inner.height || 0) - (view.height || 0))
          scrollTop.value = scrollTop.value === maxTop ? maxTop + 0.1 : maxTop
          nearBottom = true
        })
    })
  }
  nextTick(() => {
    run()
    if (settle) {
      scrollTimers.push(setTimeout(run, 80))
      scrollTimers.push(setTimeout(run, 240))
    }
  })
}

/** 流式输出轻量贴底：只改 into-view，不做测高 */
function scrollToBottomLite() {
  scrollAnim.value = false
  if (scrollInto.value === 'bottom-anchor') {
    scrollInto.value = ''
    nextTick(() => { scrollInto.value = 'bottom-anchor' })
  } else {
    scrollInto.value = 'bottom-anchor'
  }
  nearBottom = true
}

async function loadHistory(beforeId) {
  const list = await api.messages(conversationId.value, beforeId)
  if (!beforeId) {
    messages.value = list || []
    // 首次加载：无动画 + 多次 settle，展示最新消息
    scrollToBottom(false, true)
  } else {
    // 上拉加载更早消息：保持当前位置，不强制贴底
    messages.value = [...(list || []), ...messages.value]
  }
  prefetchAll((list || []).filter(m => (m.msgType === 2 || m.msgType === MSG_EMOJI) && m.content).map(m => m.content))
}

async function loadMore() {
  if (!messages.value.length) return
  await loadHistory(messages.value[0].id)
}

function findMember(userId) {
  if (userId == null) return null
  return members.value.find(x => Number(x.userId) === Number(userId)) || null
}

function memberDisplayName(mem) {
  if (!mem) return ''
  return (mem.remark || mem.nickname || '').trim()
}

function senderNickname(m) {
  // 私聊对方：优先会话标题（已含备注）
  if (!isGroupChat.value && peer.value && Number(m.senderId) === Number(peer.value.id)) {
    if (title.value && title.value !== '聊天') return title.value
    if (peer.value.nickname) return peer.value.nickname
  }
  const mem = findMember(m.senderId)
  const fromMem = memberDisplayName(mem)
  if (fromMem) return fromMem
  if (m.sender?.nickname) return m.sender.nickname
  if (m.msgType === 5 || Number(m.senderId) === 1) return 'Kimi'
  return '用户'
}

function senderAvatar(m) {
  if (!isGroupChat.value && peer.value && Number(m.senderId) === Number(peer.value.id)) {
    return peer.value.avatar || ''
  }
  const mem = findMember(m.senderId)
  if (mem?.avatar) return mem.avatar
  if (m.sender?.avatar) return m.sender.avatar
  return ''
}

function isBotSender(m) {
  if (!m) return false
  if (m.msgType === 5 || Number(m.senderId) === 1) return true
  if (m.sender?.bot) return true
  return Number(findMember(m.senderId)?.memberType) === 2
}

function showSenderName(m) {
  return !m.mine
}

/** 相邻消息间隔超过该阈值时展示时间条 */
const TIME_GAP_MS = 5 * 60 * 1000

function parseMsgTime(t) {
  if (!t) return null
  if (Array.isArray(t)) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = t
    const date = new Date(y, (mo || 1) - 1, d || 1, h, mi, s)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(t)
  return Number.isNaN(date.getTime()) ? null : date
}

function msgTimeMs(m) {
  const d = parseMsgTime(m?.createdAt)
  return d ? d.getTime() : 0
}

function shouldShowTime(m, index) {
  const t = msgTimeMs(m)
  if (!t) return false
  if (index <= 0) return true
  const prev = messages.value[index - 1]
  const pt = msgTimeMs(prev)
  if (!pt) return true
  return t - pt >= TIME_GAP_MS
}

function formatMsgTime(t) {
  const d = parseMsgTime(t)
  if (!d) return ''
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
  const startOfDay = (x) => {
    const y = new Date(x)
    y.setHours(0, 0, 0, 0)
    return y.getTime()
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (dayDiff === 0) return hm
  if (dayDiff === 1) return '昨天 ' + hm
  if (dayDiff > 1 && dayDiff < 7) {
    const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return weeks[d.getDay()] + ' ' + hm
  }
  if (d.getFullYear() === now.getFullYear()) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm
  }
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm
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
  const existIdx = messages.value.findIndex(m => m.id === msg.id)
  if (existIdx >= 0) {
    // 原地更新，避免整表 map 重建
    messages.value[existIdx] = { ...messages.value[existIdx], ...msg }
    return
  }
  messages.value.push(msg)
  if ((msg.msgType === 2 || msg.msgType === MSG_EMOJI) && msg.content) prefetchAll([msg.content])
}

function flushAiDeltas() {
  aiFlushTimer = null
  const pending = aiDeltaMap
  aiDeltaMap = Object.create(null)
  let changed = false
  for (const id in pending) {
    const idx = messages.value.findIndex(m => m.clientMsgId === id)
    if (idx >= 0) {
      messages.value[idx].content = pending[id]
      changed = true
    }
  }
  if (changed && nearBottom && !aiScrollPending) {
    aiScrollPending = true
    nextTick(() => {
      aiScrollPending = false
      scrollToBottomLite()
    })
  }
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
    if (nearBottom) scrollToBottomLite()
  } else if (chunk.type === 'delta') {
    aiDeltaMap[chunk.clientMsgId] = chunk.content
    if (!aiFlushTimer) {
      aiFlushTimer = setTimeout(flushAiDeltas, 64)
    }
  } else if (chunk.type === 'done') {
    if (aiFlushTimer) {
      clearTimeout(aiFlushTimer)
      flushAiDeltas()
    }
    const idx = messages.value.findIndex(m => m.clientMsgId === chunk.clientMsgId)
    if (idx >= 0) {
      messages.value[idx].content = chunk.content
      messages.value[idx].streaming = false
      if (nearBottom) scrollToBottomLite()
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
    atUserIds: resolveAtUserIds(content)
  }
  if (replyTarget.value?.msg) {
    payload.extraJson = buildReplyExtra(replyTarget.value.msg, replyTarget.value.name)
  }
  text.value = ''
  cursor.value = -1
  atUserIds.value = []
  inputLineCount.value = 1
  atMaxHeight.value = false
  showAt.value = false
  clearReply()
  closeEmojiPanel()
  sendPulse.value = true
  setTimeout(() => { sendPulse.value = false }, 280)
  try {
    uni.vibrateShort && uni.vibrateShort({})
    const msg = await api.sendMessage(payload)
    upsertMsg(msg)
    scrollToBottom(true)
  } catch (e) {
    showSendError(e)
  }
}

function onTextInput(e) {
  text.value = e.detail.value
  cursor.value = e.detail.cursor ?? text.value.length
  if (text.value.split('\n').length >= INPUT_MAX_LINES) {
    atMaxHeight.value = true
  }
  // 输入状态只发一次 start，避免每个按键打 WS
  if (!typingActive) {
    typingActive = true
    sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: true })
  }
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    typingActive = false
    sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: false })
  }, 1200)
}

function onLineChange(e) {
  const detail = e.detail || {}
  const lineCount = detail.lineCount || 1
  const height = detail.height || 0
  inputLineCount.value = lineCount
  atMaxHeight.value = lineCount >= INPUT_MAX_LINES || height >= INPUT_MAX_LINES * INPUT_LINE_H
}

function openEditor() {
  editorText.value = text.value
  showEditor.value = true
  closeEmojiPanel()
  showAt.value = false
  nextTick(() => { editorFocus.value = true })
}

function closeEditor() {
  showEditor.value = false
  editorFocus.value = false
}

function confirmEditor() {
  text.value = editorText.value
  cursor.value = editorText.value.length
  closeEditor()
  nextTick(() => {
    inputLineCount.value = Math.max(1, editorText.value.split('\n').length)
    atMaxHeight.value = inputLineCount.value >= INPUT_MAX_LINES
  })
}

function closeEmojiPanel() {
  showEmoji.value = false
}

function closeStickerPanel() {
  showSticker.value = false
}

function closeAuxPanels() {
  closeEmojiPanel()
  closeStickerPanel()
  showAt.value = false
  closeEditor()
  closeMsgMenu()
}

/** 点击输入区外空白：关闭表情/表情包/@，并退出语音模式回到普通输入 */
function dismissAuxInput() {
  if (recording.value) return
  closeEmojiPanel()
  closeStickerPanel()
  showAt.value = false
  voiceMode.value = false
}

function toggleVoiceMode() {
  voiceMode.value = !voiceMode.value
  if (voiceMode.value) closeAuxPanels()
}

function initRecorder() {
  if (!uni.getRecorderManager) return
  recorder = uni.getRecorderManager()
  recorder.onStop(async (res) => {
    recording.value = false
    if (!voiceWillSend || !res.tempFilePath) return
    const elapsed = Date.now() - recordStartTime
    if (elapsed < 800) {
      uni.showToast({ title: '说话时间太短', icon: 'none' })
      return
    }
    const duration = Math.max(1, Math.round(elapsed / 1000))
    await sendVoice(res.tempFilePath, duration)
  })
  recorder.onError(() => {
    recording.value = false
    voiceWillSend = false
    uni.showToast({ title: '录音失败', icon: 'none' })
  })
}

async function ensureRecordAuth() {
  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    uni.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record']) {
          resolve(true)
          return
        }
        uni.authorize({
          scope: 'scope.record',
          success: () => resolve(true),
          fail: () => {
            uni.showModal({
              title: '需要麦克风权限',
              content: '请在设置中允许录音，以发送语音消息',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) uni.openSetting({})
              }
            })
            resolve(false)
          }
        })
      },
      fail: () => resolve(false)
    })
  })
  // #endif
  // #ifndef MP-WEIXIN
  return true
  // #endif
}

async function onVoiceTouchStart(e) {
  if (!recorder) {
    uni.showToast({ title: '当前环境不支持录音', icon: 'none' })
    return
  }
  const ok = await ensureRecordAuth()
  if (!ok) return
  closeAuxPanels()
  recordStartY = e.touches?.[0]?.clientY || 0
  recordCancel.value = false
  recording.value = true
  voiceWillSend = true
  recordStartTime = Date.now()
  stopVoicePlayback()
  recorder.start({ duration: 60000, format: 'mp3' })
  uni.vibrateShort && uni.vibrateShort({})
}

function onVoiceTouchMove(e) {
  if (!recording.value) return
  const y = e.touches?.[0]?.clientY || recordStartY
  recordCancel.value = recordStartY - y > 80
}

function finishVoiceTouch() {
  if (!recording.value) return
  voiceWillSend = !recordCancel.value
  recording.value = false
  recordCancel.value = false
  recorder.stop()
}

function onVoiceTouchEnd() {
  finishVoiceTouch()
}

function onVoiceTouchCancel() {
  voiceWillSend = false
  if (!recording.value) return
  recording.value = false
  recordCancel.value = false
  recorder.stop()
}

async function sendVoice(filePath, duration) {
  uni.showLoading({ title: '发送中…', mask: true })
  try {
    const up = await api.upload(filePath)
    const base = { duration }
    const extraJson = replyTarget.value?.msg
      ? buildReplyExtra(replyTarget.value.msg, replyTarget.value.name, base)
      : stringifyExtra(base)
    const msg = await api.sendMessage({
      conversationId: conversationId.value,
      content: up.url,
      msgType: MSG_VOICE,
      extraJson
    })
    clearReply()
    upsertMsg(msg)
    scrollToBottom(true)
    uni.vibrateShort && uni.vibrateShort({})
  } catch (e) {
    showSendError(e)
  } finally {
    uni.hideLoading()
  }
}

function voiceDurationText(m) {
  return formatVoiceDuration(parseVoiceExtra(m.extraJson).duration)
}

function stopVoicePlayback() {
  if (!audioCtx) return
  audioCtx.stop()
  audioCtx.destroy()
  audioCtx = null
  playingId.value = null
}

function togglePlayVoice(m) {
  if (m.msgType !== MSG_VOICE || !m.content) return
  if (playingId.value === m.id) {
    stopVoicePlayback()
    return
  }
  stopVoicePlayback()
  audioCtx = uni.createInnerAudioContext()
  audioCtx.src = fullUrl(m.content)
  audioCtx.onEnded(() => { playingId.value = null })
  audioCtx.onStop(() => { playingId.value = null })
  audioCtx.onError(() => {
    playingId.value = null
    uni.showToast({ title: '播放失败', icon: 'none' })
  })
  audioCtx.play()
  playingId.value = m.id
}

function toggleEmoji() {
  showEmoji.value = !showEmoji.value
  if (showEmoji.value) {
    closeStickerPanel()
    showAt.value = false
    voiceMode.value = false
  }
}

function toggleSticker() {
  showSticker.value = !showSticker.value
  if (showSticker.value) {
    closeEmojiPanel()
    showAt.value = false
    voiceMode.value = false
  }
}

function openStickerManage() {
  closeAuxPanels()
  uni.navigateTo({ url: '/pages/sticker-manage/sticker-manage' })
}

async function sendSticker(sticker) {
  if (!sticker?.url || blockedPrivateChat.value) return
  const payload = {
    conversationId: conversationId.value,
    content: sticker.url,
    msgType: MSG_EMOJI
  }
  if (replyTarget.value?.msg) {
    payload.extraJson = buildReplyExtra(replyTarget.value.msg, replyTarget.value.name)
  }
  try {
    const msg = await api.sendMessage(payload)
    clearReply()
    upsertMsg(msg)
    scrollToBottom(true)
  } catch (e) {
    showSendError(e)
  }
}

function insertEmoji(emoji) {
  const pos = cursor.value >= 0 ? cursor.value : text.value.length
  text.value = text.value.slice(0, pos) + emoji + text.value.slice(pos)
  cursor.value = pos + emoji.length
  sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: true })
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: false })
  }, 1200)
}

function toggleAt() {
  showAt.value = !showAt.value
  if (showAt.value) {
    closeEmojiPanel()
    closeStickerPanel()
    voiceMode.value = false
  }
}
function pickAt(mem) {
  atUserIds.value = Array.from(new Set([...atUserIds.value, mem.userId]))
  text.value += '@' + (memberDisplayName(mem) || mem.nickname || '用户') + ' '
  showAt.value = false
}

async function addBot() {
  closeAuxPanels()
  await api.addBot(conversationId.value)
  const detail = await api.conversation(conversationId.value)
  members.value = detail.members || []
  const tip = isPrivateHuman.value
    ? 'Kimi 已加入，私聊中请 @Kimi 才会回复'
    : 'Kimi 已加入会话'
  uni.showToast({ title: tip, icon: 'none', duration: 2500 })
}

/** 发送前按正文同步 atUserIds，避免删掉 @ 后仍带上 bot id */
function resolveAtUserIds(content) {
  if (!atUserIds.value.length) return undefined
  const text = content || ''
  const kept = atUserIds.value.filter((uid) => {
    const mem = members.value.find((m) => Number(m.userId) === Number(uid))
    const name = memberDisplayName(mem) || mem?.nickname || ''
    if (name && text.includes('@' + name)) return true
    // 兼容手打 @Kimi / @Kimi助手
    if (Number(uid) === 1 && (/@Kimi\b/i.test(text) || text.includes('@Kimi助手') || text.includes('@机器人'))) {
      return true
    }
    return false
  })
  return kept.length ? kept : undefined
}

function pickImage() {
  closeEmojiPanel()
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const file = res.tempFilePaths[0]
      try {
        const up = await api.upload(file)
        if (!up?.url) {
          throw new Error('上传成功但未返回图片地址')
        }
        try {
          await cacheLocalAs(up.url, file)
        } catch (e) {}
        const payload = {
          conversationId: conversationId.value,
          content: up.url,
          msgType: 2
        }
        if (replyTarget.value?.msg) {
          payload.extraJson = buildReplyExtra(replyTarget.value.msg, replyTarget.value.name)
        }
        const msg = await api.sendMessage(payload)
        clearReply()
        upsertMsg(msg)
        scrollToBottom(true)
      } catch (e) {
        showSendError(e)
      }
    }
  })
}

function preview(path) {
  const url = getDisplayUrl(path) || fullUrl(path)
  if (!url) {
    uni.showToast({ title: '图片地址无效', icon: 'none' })
    return
  }
  uni.previewImage({ urls: [url] })
}

function replyOf(m) {
  return getReplyMeta(m)
}

function reactionChips(m) {
  const myId = store.state.user?.id
  return groupReactions(getReactions(m), myId)
}

function clearReply() {
  replyTarget.value = null
}

function closeMsgMenu() {
  menuMsg.value = null
  menuAnchor.value = null
}

const menuActions = computed(() => {
  const m = menuMsg.value
  if (!m) return []
  const list = [
    { key: 'copy', label: '复制', icon: '⎘' },
    { key: 'forward', label: '转发', icon: '↗' },
    { key: 'quote', label: '引用', icon: '❝' },
    { key: 'delete', label: '删除', icon: '⌫', danger: true }
  ]
  // 图片 / 表情包消息：可加入我的表情包
  if ((m.msgType === 2 || m.msgType === MSG_EMOJI) && m.content) {
    list.splice(2, 0, { key: 'addSticker', label: '添加表情', icon: '☆' })
  }
  if (m.mine && m.id && m.msgType !== 4) {
    const delIdx = list.findIndex(a => a.key === 'delete')
    list.splice(delIdx >= 0 ? delIdx : list.length, 0, { key: 'recall', label: '撤回', icon: '↶' })
  }
  return list
})

function onMsgLong(m) {
  if (!m || m.msgType === 4 || m.streaming) return
  closeAuxPanels()
  const proxy = instance?.proxy
  const q = uni.createSelectorQuery()
  if (proxy) q.in(proxy)
  q.select('#m-' + m.id).boundingClientRect((rect) => {
    if (!rect) return
    menuAnchor.value = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }
    menuMsg.value = m
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
  }).exec()
}

function onMenuAction(key) {
  const m = menuMsg.value
  closeMsgMenu()
  if (!m) return
  if (key === 'copy') copyMessage(m)
  else if (key === 'forward') openForward(m)
  else if (key === 'quote') quoteMessage(m)
  else if (key === 'addSticker') addMessageAsSticker(m)
  else if (key === 'delete') deleteMessage(m)
  else if (key === 'recall') recallMessage(m)
}

async function addMessageAsSticker(m) {
  if (!m?.content || (m.msgType !== 2 && m.msgType !== MSG_EMOJI)) {
    uni.showToast({ title: '仅支持图片消息', icon: 'none' })
    return
  }
  try {
    uni.showLoading({ title: '添加中', mask: true })
    await api.addSticker({ url: m.content })
    uni.hideLoading()
    uni.showToast({ title: '已加入表情包', icon: 'none' })
    if (stickerPanelRef.value?.reload) {
      stickerPanelRef.value.reload()
    }
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e?.message || '添加失败', icon: 'none' })
  }
}

function onMenuReact(emoji) {
  const m = menuMsg.value
  closeMsgMenu()
  if (!m || !emoji) return
  applyReaction(m, emoji)
}

function onChipReact(m, emoji) {
  if (!m || !emoji) return
  applyReaction(m, emoji)
}

function patchMsgExtra(msgId, extraJson) {
  const idx = messages.value.findIndex(x => Number(x.id) === Number(msgId))
  if (idx < 0) return
  messages.value[idx] = { ...messages.value[idx], extraJson }
}

function applyRemoteReaction(payload) {
  if (!payload) return
  const msgId = payload.messageId ?? payload.msgId ?? payload.id
  if (msgId == null) return
  if (payload.conversationId != null && Number(payload.conversationId) !== Number(conversationId.value)) {
    return
  }
  // 服务端直接回传完整消息
  if (payload.extraJson != null && payload.senderId != null && payload.content !== undefined) {
    upsertMsg(payload)
    return
  }
  if (payload.message && payload.message.id) {
    upsertMsg(payload.message)
    return
  }
  const idx = messages.value.findIndex(x => Number(x.id) === Number(msgId))
  if (idx < 0) return
  // 优先用服务端合并后的完整 extraJson，避免并发回应时丢状态
  if (payload.extraJson) {
    patchMsgExtra(msgId, payload.extraJson)
    return
  }
  const emoji = payload.emoji
  const userId = payload.userId ?? payload.reactorId
  if (!emoji) return
  const active = payload.active !== false && payload.removed !== true
  const next = setReaction(messages.value[idx], emoji, userId, active)
  patchMsgExtra(msgId, next)
}

async function applyReaction(m, emoji) {
  if (!m?.id || !emoji) return
  const myId = store.state.user?.id
  const toggled = toggleReaction(m, emoji, myId)
  patchMsgExtra(m.id, toggled.extraJson)

  const body = {
    conversationId: conversationId.value,
    messageId: m.id,
    emoji,
    active: toggled.active,
    userId: myId
  }
  // WS 广播给会话内其他人
  try {
    sendStomp('/app/chat.react', body)
  } catch (e) {}

  // REST 持久化；WS 已广播时仍以服务端结果校准本地
  try {
    const res = await api.reactMessage(m.id, { emoji, active: toggled.active })
    if (res) {
      if (res.extraJson != null || res.id) upsertMsg(res)
      else if (res.message) upsertMsg(res.message)
      else if (res.extraJson) patchMsgExtra(m.id, res.extraJson)
    }
  } catch (e) {}
}

function copyMessage(m) {
  if (m.msgType === 2) {
    uni.setClipboardData({
      data: fullUrl(m.content),
      success: () => uni.showToast({ title: '图片链接已复制', icon: 'none' })
    })
    return
  }
  if (m.msgType === MSG_VOICE) {
    uni.showToast({ title: '语音消息无法复制', icon: 'none' })
    return
  }
  const content = String(m.content || '')
  if (!content) {
    uni.showToast({ title: '无内容可复制', icon: 'none' })
    return
  }
  uni.setClipboardData({
    data: content,
    success: () => uni.showToast({ title: '已复制', icon: 'none' })
  })
}

function quoteMessage(m) {
  if (blockedPrivateChat.value) {
    uni.showToast({ title: '当前无法发送消息', icon: 'none' })
    return
  }
  replyTarget.value = {
    msg: m,
    name: senderNickname(m),
    preview: msgPreviewText(m)
  }
  voiceMode.value = false
  showEmoji.value = false
  showAt.value = false
}

async function recallMessage(m) {
  if (!m?.mine || !m.id) return
  try {
    const updated = await api.recallMessage(m.id)
    upsertMsg(updated)
  } catch (e) {
    uni.showToast({ title: e?.message || '撤回失败', icon: 'none' })
  }
}

function deleteMessage(m) {
  uni.showModal({
    title: '删除消息',
    content: '删除后仅自己不可见，对方仍可看到',
    confirmColor: '#F43F5E',
    success: (res) => {
      if (!res.confirm) return
      const idx = messages.value.findIndex(
        x => (m.id && x.id === m.id) || (m.clientMsgId && x.clientMsgId === m.clientMsgId)
      )
      if (idx >= 0) messages.value.splice(idx, 1)
    }
  })
}

async function openForward(m) {
  forwardSource.value = m
  showForward.value = true
  try {
    const list = await api.conversations()
    forwardList.value = (list || []).filter(c => Number(c.id) !== Number(conversationId.value))
    store.setConversations(list || [])
  } catch (e) {
    forwardList.value = (store.state.conversations || []).filter(
      c => Number(c.id) !== Number(conversationId.value)
    )
  }
}

function closeForward() {
  showForward.value = false
  forwardSource.value = null
}

async function confirmForward(conv) {
  const m = forwardSource.value
  if (!m || !conv?.id) return
  const payload = {
    conversationId: Number(conv.id),
    content: m.content,
    msgType: m.msgType === 5 ? 1 : m.msgType
  }
  if (m.msgType === MSG_VOICE) {
    const dur = parseVoiceExtra(m.extraJson).duration
    payload.extraJson = stringifyExtra({ duration: dur })
  }
  try {
    uni.showLoading({ title: '转发中', mask: true })
    await api.sendMessage(payload)
    uni.hideLoading()
    closeForward()
    uni.showToast({ title: '已转发', icon: 'none' })
  } catch (e) {
    uni.hideLoading()
    showSendError(e)
  }
}

function scrollToQuoted(reply) {
  if (!reply?.msgId) return
  const id = 'm-' + reply.msgId
  scrollAnim.value = true
  scrollInto.value = ''
  nextTick(() => { scrollInto.value = id })
}

function openMoreMenu() {
  closeMsgMenu()
  closeAuxPanels()
  voiceMode.value = false
  if (!conversationId.value) return
  uni.navigateTo({
    url: '/pages/chat-more/chat-more?id=' + conversationId.value
      + '&title=' + encodeURIComponent(title.value || '聊天')
  })
}
</script>

<style lang="scss">
/* 禁止页面级横向/纵向滚动，仅消息区滚动 */
page {
  height: 100%;
  overflow: hidden;
  width: 100%;
  background: #0A0614;
}
</style>

<style scoped lang="scss">
.chat-page {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.nav-bar {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  z-index: 100;
}
.nav-inner {
  display: flex;
  align-items: center;
  padding: 0 8rpx;
  box-sizing: border-box;
}
.nav-back,
.nav-more {
  width: 88rpx;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.nav-back-icon {
  font-size: 52rpx;
  font-weight: 300;
  color: $pc-text;
  line-height: 1;
  margin-top: -4rpx;
}
.nav-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 32rpx;
  font-weight: 500;
  color: $pc-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 8rpx;
}
.hamburger {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7rpx;
}
.bar {
  height: 4rpx;
  border-radius: 4rpx;
  background: $pc-text;
  box-shadow: 0 0 8rpx rgba(167, 139, 250, 0.35);
}
.friend-banner {
  flex-shrink: 0;
  background: rgba(244, 63, 94, 0.14);
  color: $pc-rose;
  text-align: center;
  font-size: 22rpx;
  padding: 14rpx 20rpx;
  letter-spacing: 0.5rpx;
  width: 100%;
  box-sizing: border-box;
}
.banner {
  flex-shrink: 0;
  background: rgba(244, 63, 94, 0.16); color: $pc-rose; text-align: center;
  font-size: 22rpx; padding: 12rpx; letter-spacing: 0.5rpx;
  width: 100%;
  box-sizing: border-box;
}
.banner.tip {
  background: rgba(167, 139, 250, 0.14);
  color: #c4b5fd;
}
.banner.warn {
  background: rgba(244, 63, 94, 0.16);
  color: $pc-rose;
}
.msgs {
  flex: 1;
  height: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}
.msgs-inner {
  padding: 28rpx;
  padding-bottom: calc(320rpx + env(safe-area-inset-bottom));
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}
.bottom-anchor { height: 1px; width: 100%; }
.typing { color: $pc-muted; font-size: 22rpx; margin-bottom: 14rpx; }
.msg-block {
  max-width: 100%;
  box-sizing: border-box;
}
.msg-time {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8rpx 0 18rpx;
}
.msg-time-text {
  font-size: 22rpx;
  color: $pc-muted;
  letter-spacing: 0.5rpx;
  line-height: 1.3;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(20, 12, 36, 0.35);
}
.msg-row {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  margin-bottom: 20rpx;
  max-width: 100%;
  box-sizing: border-box;
}
.msg-row.mine { justify-content: flex-end; }
.msg-avatar-wrap {
  flex-shrink: 0;
  padding-top: 4rpx;
}
.msg-col {
  display: flex;
  flex-direction: column;
  max-width: 68%;
  min-width: 0;
}
.mine .msg-col { align-items: flex-end; }
.sender-name {
  font-size: 22rpx;
  color: $pc-muted;
  margin-bottom: 6rpx;
  padding: 0 4rpx;
  line-height: 1.3;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai .sender-name { color: rgba(251, 113, 133, 0.88); }
.bubble {
  max-width: 100%; padding: 20rpx 24rpx;
  border-radius: $pc-radius-lg $pc-radius-lg $pc-radius-lg 12rpx;
  background: rgba(28, 16, 48, 0.92);
  border: 1px solid rgba(167, 139, 250, 0.18);
  color: $pc-text;
  position: relative;
  box-sizing: border-box;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.bubble.active {
  box-shadow: 0 0 0 2rpx rgba(167, 139, 250, 0.55), 0 8rpx 28rpx rgba(124, 58, 237, 0.28);
}
.mine .bubble {
  border-radius: $pc-radius-lg $pc-radius-lg 12rpx $pc-radius-lg;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.42), rgba(244, 63, 94, 0.28));
  border-color: rgba(167, 139, 250, 0.35);
}
.ai .bubble {
  border-color: rgba(244, 63, 94, 0.32);
}
.quote-card {
  margin: -4rpx 0 14rpx;
  padding: 12rpx 14rpx;
  border-radius: 12rpx;
  background: rgba(10, 6, 20, 0.28);
  border-left: 4rpx solid rgba(167, 139, 250, 0.7);
}
.mine .quote-card {
  background: rgba(10, 6, 20, 0.22);
  border-left-color: rgba(251, 113, 133, 0.75);
}
.quote-name {
  display: block;
  font-size: 22rpx;
  color: $pc-purple;
  margin-bottom: 4rpx;
  font-weight: 600;
}
.mine .quote-name { color: rgba(251, 182, 206, 0.95); }
.quote-text {
  display: block;
  font-size: 24rpx;
  color: $pc-muted;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.react-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 8rpx;
  max-width: 100%;
  &.mine { justify-content: flex-end; }
}
.react-chip {
  display: inline-flex;
  align-items: center;
  gap: 2rpx;
  padding: 2rpx 10rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  line-height: 1.2;
  background: rgba(28, 16, 48, 0.88);
  border: 1px solid rgba(167, 139, 250, 0.22);
  color: $pc-text;
  &.mine {
    border-color: rgba(167, 139, 250, 0.45);
    background: rgba(124, 58, 237, 0.28);
  }
}
.react-n {
  font-size: 20rpx;
  color: $pc-muted;
  margin-left: 4rpx;
  font-weight: 600;
}
.txt { font-size: 28rpx; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.cursor { color: $pc-purple; margin-left: 4rpx; animation: pc-pulse 0.8s infinite; }
.img {
  width: 360rpx;
  min-height: 160rpx;
  max-width: 100%;
  border-radius: $pc-radius-md;
  display: block;
  background: rgba(28, 16, 48, 0.55);
}
.img-fallback {
  width: 360rpx;
  min-height: 160rpx;
  max-width: 100%;
  border-radius: $pc-radius-md;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24rpx;
  box-sizing: border-box;
  background: rgba(28, 16, 48, 0.72);
  border: 1px dashed rgba(167, 139, 250, 0.35);
}
.img-fallback.sticker-fallback {
  width: 220rpx;
  min-height: 220rpx;
}
.img-fallback-text {
  font-size: 24rpx;
  color: $pc-muted;
  text-align: center;
  line-height: 1.4;
}
.sticker-img {
  width: 220rpx;
  height: 220rpx;
  max-width: 100%;
  border-radius: $pc-radius-md;
  display: block;
}
.bubble.sticker,
.bubble.media {
  padding: 8rpx;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.mine .bubble.sticker,
.mine .bubble.media {
  background: transparent;
  border-color: transparent;
}
.aux-dismiss-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 25;
  background: transparent;
}
.at-panel {
  position: fixed;
  left: 20rpx;
  right: 20rpx;
  bottom: calc(280rpx + env(safe-area-inset-bottom));
  z-index: 30;
  border-radius: $pc-radius-md; padding: 8rpx 0;
  max-height: 260rpx; overflow: auto;
  animation: pc-fade-up 0.25s ease;
}
.at-item { padding: 18rpx 24rpx; color: $pc-text; font-size: 26rpx; }
.composer-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 28;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 12rpx 20rpx calc(12rpx + env(safe-area-inset-bottom));
  pointer-events: none;
}
.composer {
  pointer-events: auto;
  border-radius: $pc-radius-xl;
  padding: 14rpx 16rpx 12rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.reply-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 14rpx;
  border-radius: 14rpx;
  background: rgba(167, 139, 250, 0.1);
  border-left: 4rpx solid $pc-purple;
}
.reply-bar__body {
  flex: 1;
  min-width: 0;
}
.reply-bar__label {
  display: block;
  font-size: 22rpx;
  color: $pc-purple;
  font-weight: 600;
  margin-bottom: 4rpx;
}
.reply-bar__preview {
  display: block;
  font-size: 24rpx;
  color: $pc-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reply-bar__close {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $pc-muted;
  font-size: 36rpx;
  line-height: 1;
  flex-shrink: 0;
}
.fwd-mask {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(10, 6, 20, 0.72);
  display: flex;
  align-items: flex-end;
}
.fwd-panel {
  width: 100%;
  max-height: 70vh;
  border-radius: $pc-radius-xl $pc-radius-xl 0 0;
  padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  border-bottom: none;
  animation: pc-fade-up 0.22s ease both;
}
.fwd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.12);
}
.fwd-title {
  font-size: 30rpx;
  font-weight: 700;
  color: $pc-text;
}
.fwd-close {
  font-size: 26rpx;
  color: $pc-muted;
  padding: 8rpx 12rpx;
}
.fwd-list {
  max-height: 56vh;
}
.fwd-empty {
  padding: 48rpx 16rpx;
  text-align: center;
  color: $pc-muted;
  font-size: 26rpx;
}
.fwd-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 8rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
}
.fwd-name {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: $pc-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.input-row {
  display: flex;
  align-items: flex-end;
  gap: 12rpx;
  width: 100%;
}
.input-field {
  flex: 1;
  min-width: 0;
}
.textarea-box {
  position: relative;
  width: 100%;
}
.tools {
  display: flex;
  gap: 10rpx;
  flex-shrink: 0;
  padding-top: 2rpx;
}
$tool-ico-idle: #9B8AAF;
$tool-ico-lit: #C4B5FD;
.tool {
  width: 56rpx; height: 56rpx; border-radius: $pc-radius-sm;
  display: flex; align-items: center; justify-content: center;
  background: rgba(167, 139, 250, 0.1); color: $pc-muted; font-size: 22rpx;
  transition: transform 0.12s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.tool:active { background: rgba(244, 63, 94, 0.16); color: $pc-text; }
.tool.active {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.32), rgba(244, 63, 94, 0.22));
  color: $pc-text;
  box-shadow: 0 0 16rpx rgba(167, 139, 250, 0.2);
}
.tool-ico {
  position: relative;
  width: 34rpx;
  height: 34rpx;
}
.ico-mic__head {
  position: absolute;
  left: 11rpx;
  top: 2rpx;
  width: 12rpx;
  height: 16rpx;
  border-radius: 6rpx;
  border: 2.5rpx solid $tool-ico-idle;
  background: transparent;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.ico-mic__arc {
  position: absolute;
  left: 6rpx;
  top: 14rpx;
  width: 22rpx;
  height: 11rpx;
  border: 2.5rpx solid $tool-ico-idle;
  border-top: none;
  border-radius: 0 0 11rpx 11rpx;
  background: transparent;
  transition: border-color 0.2s ease;
}
.ico-mic__stand {
  position: absolute;
  left: 15.5rpx;
  top: 25rpx;
  width: 3rpx;
  height: 6rpx;
  border-radius: 2rpx;
  background: $tool-ico-idle;
  transition: background 0.2s ease;
}
.ico-img__frame {
  position: absolute;
  left: 3rpx;
  top: 5rpx;
  width: 28rpx;
  height: 22rpx;
  border-radius: 5rpx;
  border: 2.5rpx solid $tool-ico-idle;
  background: transparent;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.ico-img__sun {
  position: absolute;
  left: 8rpx;
  top: 10rpx;
  width: 6rpx;
  height: 6rpx;
  border-radius: 50%;
  background: $tool-ico-idle;
  transition: background 0.2s ease;
}
.ico-img__hill {
  position: absolute;
  left: 9rpx;
  top: 18rpx;
  width: 0;
  height: 0;
  border-left: 9rpx solid transparent;
  border-right: 9rpx solid transparent;
  border-bottom: 9rpx solid $tool-ico-idle;
  transition: border-bottom-color 0.2s ease;
}
.tool:active .ico-mic__head,
.tool:active .ico-mic__arc { border-color: $tool-ico-lit; }
.tool:active .ico-mic__stand,
.tool:active .ico-img__sun { background: $tool-ico-lit; }
.tool:active .ico-img__frame { border-color: $tool-ico-lit; }
.tool:active .ico-img__hill { border-bottom-color: $tool-ico-lit; }
.tool.active .ico-mic__head {
  border-color: $pc-purple;
  background: rgba(167, 139, 250, 0.22);
  box-shadow: 0 0 8rpx rgba(167, 139, 250, 0.35);
}
.tool.active .ico-mic__arc { border-color: $pc-magenta; }
.tool.active .ico-mic__stand { background: $pc-rose; }
.tool.active .ico-img__frame {
  border-color: $pc-purple;
  background: rgba(167, 139, 250, 0.12);
}
.tool.active .ico-img__sun { background: $pc-magenta; }
.tool.active .ico-img__hill { border-bottom-color: $pc-rose; }
.input {
  width: 100%;
  box-sizing: border-box;
  min-height: 72rpx;
  max-height: 200rpx;
  padding: 16rpx 18rpx;
  color: $pc-text;
  background: rgba(255, 255, 255, 0.04);
  border-radius: $pc-radius-md;
  font-size: 28rpx;
  line-height: 1.45;
}
.textarea-box .input {
  padding-right: 54rpx;
}
.input.at-max {
  overflow-y: auto;
}
.expand-btn {
  position: absolute;
  right: 6rpx;
  bottom: 6rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: $pc-radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(167, 139, 250, 0.14);
  border: 1px solid rgba(167, 139, 250, 0.22);
  z-index: 2;
}
.expand-btn:active {
  background: rgba(244, 63, 94, 0.18);
  border-color: rgba(244, 63, 94, 0.32);
}
.ico-expand {
  position: relative;
  width: 22rpx;
  height: 22rpx;
}
.ico-expand__corner {
  position: absolute;
  width: 10rpx;
  height: 10rpx;
  border: 2rpx solid $pc-purple;
}
.ico-expand__corner.tl {
  left: 0;
  top: 0;
  border-right: none;
  border-bottom: none;
  border-radius: 2rpx 0 0 0;
}
.ico-expand__corner.br {
  right: 0;
  bottom: 0;
  border-left: none;
  border-top: none;
  border-radius: 0 0 2rpx 0;
}
.ph { color: #6B5C7A; }
.send {
  flex-shrink: 0;
  height: 72rpx; line-height: 72rpx; padding: 0 28rpx;
  border-radius: $pc-radius-pill; font-size: 26rpx; margin: 0;
  align-self: flex-end;
}
.send.sending { animation: pc-press-pop 0.28s ease; }
.voice-bubble {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 220rpx;
}
.voice-play {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(167, 139, 250, 0.18);
  border: 1px solid rgba(167, 139, 250, 0.28);
  flex-shrink: 0;
}
.mine .voice-play {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.22);
}
.voice-play.playing {
  box-shadow: 0 0 18rpx rgba(244, 63, 94, 0.35);
}
.voice-play-icon {
  font-size: 20rpx;
  color: $pc-text;
  line-height: 1;
}
.voice-body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.voice-bars {
  display: flex;
  align-items: flex-end;
  gap: 6rpx;
  height: 32rpx;
}
.voice-bar {
  width: 6rpx;
  height: 12rpx;
  border-radius: 6rpx;
  background: rgba(167, 139, 250, 0.55);
}
.mine .voice-bar { background: rgba(255, 255, 255, 0.72); }
.voice-bars.anim .voice-bar {
  animation: voice-wave 0.9s ease-in-out infinite;
}
@keyframes voice-wave {
  0%, 100% { height: 12rpx; opacity: 0.55; }
  50% { height: 30rpx; opacity: 1; }
}
.voice-dur {
  font-size: 24rpx;
  color: $pc-muted;
  flex-shrink: 0;
}
.mine .voice-dur { color: rgba(245, 237, 255, 0.82); }
.voice-hold {
  width: 100%;
  min-width: 0;
  min-height: 72rpx;
  border-radius: $pc-radius-md;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: $pc-text;
  background: rgba(167, 139, 250, 0.12);
  border: 1px solid rgba(167, 139, 250, 0.22);
  user-select: none;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.voice-hold.recording {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.34), rgba(244, 63, 94, 0.24));
  border-color: rgba(244, 63, 94, 0.42);
  box-shadow: 0 0 24rpx rgba(244, 63, 94, 0.18);
}
.voice-hold.cancel {
  background: rgba(244, 63, 94, 0.22);
  border-color: rgba(244, 63, 94, 0.5);
  color: $pc-rose;
}
.record-overlay {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(300rpx + env(safe-area-inset-bottom));
  z-index: 40;
  display: flex;
  justify-content: center;
  pointer-events: none;
  animation: pc-fade-up 0.2s ease;
}
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: linear-gradient(165deg, rgba(10, 6, 20, 0.97), rgba(26, 11, 40, 0.98));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  animation: pc-fade-up 0.22s ease;
}
.editor-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx 20rpx;
}
.editor-action {
  font-size: 28rpx;
  color: $pc-muted;
  padding: 8rpx 4rpx;
  min-width: 88rpx;
}
.editor-action.confirm {
  text-align: right;
  color: $pc-purple;
  font-weight: 500;
}
.editor-title {
  font-size: 30rpx;
  font-weight: 500;
  color: $pc-text;
}
.editor-body {
  flex: 1;
  margin: 0 20rpx calc(20rpx + env(safe-area-inset-bottom));
  border-radius: $pc-radius-lg;
  padding: 20rpx 24rpx 16rpx;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-shadow: 0 12rpx 48rpx rgba(124, 58, 237, 0.18);
}
.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 0;
  color: $pc-text;
  font-size: 30rpx;
  line-height: 1.6;
  background: transparent;
}
.editor-count {
  flex-shrink: 0;
  text-align: right;
  font-size: 22rpx;
  color: $pc-muted;
  padding-top: 12rpx;
}
.record-panel {
  padding: 28rpx 40rpx;
  border-radius: $pc-radius-lg;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  min-width: 360rpx;
  box-shadow: 0 12rpx 40rpx rgba(124, 58, 237, 0.22);
}
.record-panel.cancel {
  border-color: rgba(244, 63, 94, 0.45);
  box-shadow: 0 12rpx 40rpx rgba(244, 63, 94, 0.2);
}
.record-pulse {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(244, 63, 94, 0.35), rgba(124, 58, 237, 0.18));
  animation: pc-pulse 1s infinite;
}
.record-panel.cancel .record-pulse {
  background: radial-gradient(circle, rgba(244, 63, 94, 0.5), rgba(244, 63, 94, 0.15));
}
.record-tip {
  font-size: 24rpx;
  color: $pc-muted;
}
.record-panel.cancel .record-tip { color: $pc-rose; }
</style>
