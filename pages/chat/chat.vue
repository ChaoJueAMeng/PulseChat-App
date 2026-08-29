<template>
  <view class="chat-root">
  <view
    class="chat-page pc-aurora"
    :style="pageStyle"
    @touchstart="onChatSwipeStart"
    @touchmove="onChatSwipeMove"
    @touchend="onChatSwipeEnd"
    @touchcancel="onChatSwipeCancel"
  >
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
      :bounces="true"
      :scroll-into-view="scrollInto"
      :scroll-top="scrollTop"
      :scroll-with-animation="scrollAnim"
      :upper-threshold="LOAD_MORE_THRESHOLD"
      @scroll="onScroll"
      @scrolltoupper="loadMore"
      @touchstart="onChatSwipeStart"
      @touchmove="onChatSwipeMove"
      @touchend="onChatSwipeEnd"
      @touchcancel="onChatSwipeCancel"
    >
      <view class="msgs-inner">
        <view v-if="!hasMoreHistory && messages.length" class="history-end">没有更早的消息了</view>
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
                clickable
                @tap.stop="openSenderProfile(m)"
                @longpress.stop="mentionSender(m)"
              />
            </view>
            <view class="msg-col">
              <text v-if="showSenderName(m)" class="sender-name">{{ senderNickname(m) }}</text>
                <view
                class="bubble"
                :class="{
                  active: menuMsg && menuMsg.id === m.id,
                  sticker: !isRecalledMsg(m) && m.msgType === MSG_EMOJI,
                  media: !isRecalledMsg(m) && ((m.msgType === 2 && !m.__imageCaption && m.__imageCount <= 1) || m.msgType === MSG_VIDEO),
                  file: !isRecalledMsg(m) && m.msgType === MSG_FILE,
                  'img-with-caption': !isRecalledMsg(m) && m.msgType === 2 && (!!m.__imageCaption || m.__imageCount > 1),
                  recalled: isRecalledMsg(m)
                }"
                @touchstart="onBubbleTouchStart(m, $event)"
                @touchmove="onBubbleTouchMove"
                @touchend="onBubbleTouchEnd"
                @touchcancel="onBubbleTouchCancel"
              >
                <view
                  v-if="!isRecalledMsg(m) && replyOf(m)"
                  class="quote-card pc-press"
                  @tap.stop="scrollToQuoted(replyOf(m))"
                >
                  <text class="quote-name">{{ replyOf(m).senderName || '用户' }}</text>
                  <text class="quote-text">{{ replyOf(m).content || '[消息]' }}</text>
                </view>
                <text v-if="isRecalledMsg(m)" class="txt recall-txt">{{ m.content || '消息已撤回' }}</text>
                <template v-else-if="m.msgType === 2">
                  <view
                    class="img-album"
                    :class="[
                      m.__imageCount > 1 ? 'multi' : '',
                      m.__imageCount > 1 ? ('count-' + Math.min(m.__imageCount, 4)) : ''
                    ]"
                  >
                    <image
                      v-for="(url, ii) in m.__imageUrls"
                      :id="'mi-' + m.id + '-' + ii"
                      :key="ii + '-' + url"
                      :src="mediaSrcAt(m, ii)"
                      :mode="m.__imageCount > 1 ? 'aspectFill' : 'widthFix'"
                      class="img"
                      :class="{ cell: m.__imageCount > 1 }"
                      :fade-show="false"
                      @error="onMediaErrorAt(m, ii)"
                      @tap="previewImages(m, ii)"
                    />
                  </view>
                  <text v-if="m.__imageCaption" class="txt img-caption">{{ m.__imageCaption }}</text>
                </template>
                <image
                  v-else-if="m.msgType === MSG_EMOJI && !mediaFailed(m)"
                  :src="mediaSrc(m)"
                  mode="aspectFit"
                  class="sticker-img"
                  :fade-show="false"
                  @error="onMediaError(m)"
                  @tap="previewImages(m)"
                />
                <view v-else-if="m.msgType === MSG_EMOJI" class="img-fallback sticker-fallback" @tap="retryMedia(m)">
                  <text class="img-fallback-text">表情加载失败</text>
                </view>
                <view v-else-if="m.msgType === MSG_VOICE" class="voice-wrap">
                  <view class="voice-bubble pc-press" @tap="togglePlayVoice(m)">
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
                  <text v-if="voiceTranscriptOf(m)" class="voice-transcript" :class="{ mine: m.mine }">{{ voiceTranscriptOf(m) }}</text>
                </view>
                <view
                  v-else-if="m.msgType === MSG_VIDEO"
                  class="video-card pc-press"
                  @tap.stop="openVideoMsg(m)"
                >
                  <view class="video-card__cover">
                    <view class="video-card__play">
                      <view class="video-card__play-tri"></view>
                    </view>
                    <text v-if="videoDurationOf(m)" class="video-card__dur">{{ videoDurationOf(m) }}</text>
                  </view>
                </view>
                <view
                  v-else-if="m.msgType === MSG_FILE"
                  class="file-card pc-press"
                  @tap.stop="openFileMsg(m)"
                >
                  <view class="file-ico">
                    <view class="file-ico__tab"></view>
                    <view class="file-ico__body"></view>
                  </view>
                  <view class="file-meta">
                    <text class="file-name">{{ fileNameOf(m) }}</text>
                    <text v-if="fileSizeOf(m)" class="file-size">{{ fileSizeOf(m) }}</text>
                  </view>
                </view>
                <text v-else class="txt">{{ m.content }}</text>
                <text v-if="m.streaming" class="cursor">▍</text>
              </view>
              <view v-if="!isRecalledMsg(m) && reactionChips(m).length" class="react-strip" :class="{ mine: m.mine }">
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

    <view v-if="showTypingIndicator" class="typing-bar">
      <text class="typing">{{ typingText }}</text>
    </view>

    <view
      v-if="auxInputOpen"
      class="aux-dismiss-mask"
      @tap="dismissAuxInput"
    />

    <view v-if="showAt" class="at-panel pc-card" @tap.stop>
      <view
        class="at-item"
        v-for="mem in members"
        :key="mem.userId"
        @tap="pickAt(mem)"
      >
        @{{ memberMentionName(mem) || mem.nickname }}{{ mem.memberType === 2 ? ' · AI' : '' }}
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
        <view v-if="stagedImages.length" class="stage-bar">
          <scroll-view scroll-x class="stage-bar__scroll" :show-scrollbar="false">
            <view class="stage-bar__list">
              <view
                v-for="(item, idx) in stagedImages"
                :key="item.id"
                class="stage-bar__item"
              >
                <image class="stage-bar__thumb" :src="item.localPath" mode="aspectFill" />
                <text class="stage-bar__remove pc-press" @tap="removeStagedImage(idx)">×</text>
              </view>
              <view
                v-if="stagedImages.length < STAGE_IMAGE_MAX"
                class="stage-bar__add pc-press"
                @tap="pickImage"
              >
                <text class="stage-bar__add-icon">＋</text>
              </view>
            </view>
          </scroll-view>
          <text class="stage-bar__clear pc-press" @tap="clearStagedImages">清空</text>
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
                :placeholder="stagedImages.length ? '添加说明（可选）…' : '说点有脉冲感的…'"
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
          <view v-if="!isAiPrivate" class="tool pc-press" :class="{ active: voiceMode }" @tap="toggleVoiceMode">
            <view class="tool-ico ico-mic">
              <view class="ico-mic__head"></view>
              <view class="ico-mic__arc"></view>
              <view class="ico-mic__stand"></view>
            </view>
          </view>
          <text class="tool pc-press" :class="{ active: showEmoji }" @tap="toggleEmoji">☺</text>
          <view class="tool pc-press" :class="{ active: showSticker }" @tap="toggleSticker">
            <view class="tool-ico ico-heart">
              <view class="ico-heart__l"></view>
              <view class="ico-heart__r"></view>
              <view class="ico-heart__tip"></view>
            </view>
          </view>
          <view class="tool pc-press" @tap="pickImage">
            <view class="tool-ico ico-img">
              <view class="ico-img__frame"></view>
              <view class="ico-img__sun"></view>
              <view class="ico-img__hill"></view>
            </view>
          </view>
          <view v-if="!isAiPrivate" class="tool pc-press" @tap="pickVideo">
            <view class="tool-ico ico-video">
              <view class="ico-video__frame"></view>
              <view class="ico-video__play"></view>
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
      @action="onMenuAction"
      @react="onMenuReact"
    />

    <view v-if="showForward" class="fwd-mask" @tap="closeForward">
      <view class="fwd-panel pc-card" @tap.stop>
        <view class="fwd-head">
          <text class="fwd-title">转发到</text>
          <text class="fwd-close pc-press" @tap="closeForward">取消</text>
        </view>
        <scroll-view scroll-y class="fwd-list" :bounces="true">
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

  <!-- 同页「更多」侧滑层：预挂载 + CSS 跟手，避免 navigateTo 整页卡顿 -->
  <view
    v-if="moreMounted"
    class="chat-more-layer pc-aurora"
    :style="moreLayerStyle"
  >
    <pc-chat-more-panel
      :conversation-id="conversationId"
      :initial-title="title"
      :active="moreMounted"
      :visible="moreOpen"
      :refresh-seq="moreRefreshSeq"
      embedded
      @close="closeMorePanel"
      @exit-chat="exitChatFromMore"
      @background-changed="onMoreBgChanged"
      @swipe-start="onMoreSwipeStart"
      @swipe-move="onMoreSwipeMove"
      @swipe-end="onMoreSwipeEnd"
      @swipe-cancel="onMoreSwipeCancel"
    />
  </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import { onLoad, onShow, onHide, onUnload, onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { fullUrl } from '../../utils/url.js'
import { getDisplayUrl, ensureCached, prefetchAll, forgetCached, cacheLocalAs, isLocalMediaPath } from '../../utils/image-cache.js'
import {
  peekVideoCached,
  abortVideoDownload,
  prefetchVideos,
  cacheVideoLocalAs
} from '../../utils/video-cache.js'
import { getStore } from '../../store/index.js'
import { subscribeConversation, onWs, sendStomp } from '../../utils/ws.js'
import { getBackground, syncBackgroundFromDetail } from '../../utils/chat-settings.js'
import {
  getCachedMessages,
  setCachedMessages,
  scheduleCacheMessages,
  clearCachedMessages
} from '../../utils/message-cache.js'
import { MSG_VOICE, parseVoiceExtra, formatVoiceDuration, voiceTranscriptText } from '../../utils/voice.js'
import { MSG_EMOJI } from '../../utils/sticker.js'
import { MSG_VIDEO, MSG_FILE, isPickCancel, formatFileSize } from '../../utils/media-msg.js'
import { pickImages, pickVideos } from '../../utils/media-pick.js'
import {
  getReplyMeta,
  getCaption,
  getImageUrls,
  getReactions,
  groupReactions,
  toggleReaction,
  setReaction,
  buildReplyExtra,
  msgPreviewText,
  stringifyExtra,
  parseExtra
} from '../../utils/msg-extra.js'
import { handlePageBackPress } from '../../utils/quit.js'
import {
  feedbackState,
  updatePreviewAlbum,
  setPreviewReachEarlierHandler,
  closePreview,
  openVideoPlayer,
  closeVideoPlayer
} from '../../utils/feedback.js'
import {
  TAB_SWIPE_LEAVE_MS,
  TAB_SWIPE_ENTER_MS,
  SWIPE_AXIS_LOCK_PX,
  SWIPE_FOLLOW_FACTOR,
  SWIPE_COMMIT_RATIO,
  SWIPE_SCREEN_COMMIT_RATIO,
  SWIPE_EASING_ENTER,
  SWIPE_EASING_LEAVE,
  SWIPE_EASING_CANCEL,
  SWIPE_VX_SAMPLE_MS,
  resolveSwipeAxis,
  tryPreventTouchScroll,
  shouldCommitHorizontalSwipe,
  createRafBatch,
  requestMainTab
} from '../../utils/tab-swipe.js'
import PcEmojiPanel from '../../components/pc-emoji-panel/pc-emoji-panel.vue'
import PcStickerPanel from '../../components/pc-sticker-panel/pc-sticker-panel.vue'
import PcMsgMenu from '../../components/pc-msg-menu/pc-msg-menu.vue'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'
import PcChatMorePanel from '../../components/pc-chat-more-panel/pc-chat-more-panel.vue'

const instance = getCurrentInstance()

onBackPress(() => {
  if (feedbackState.videoPlayer.show) {
    closeVideoPlayer()
    return true
  }
  if (feedbackState.preview.show) {
    closePreview()
    return true
  }
  if (menuMsg.value) {
    closeMsgMenu()
    return true
  }
  if (showForward.value) {
    closeForward()
    return true
  }
  if (stagedImages.value.length) {
    clearStagedImages()
    return true
  }
  if (replyTarget.value) {
    clearReply()
    return true
  }
  if (moreOpen.value || morePhase.value === 'follow' || morePhase.value === 'open') {
    closeMorePanel()
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
/** 长按多图消息时命中的图片 URL（用于「添加表情」） */
const menuStickerUrl = ref(null)
/** 最近一次气泡触摸坐标，供 longpress 无坐标时回退 */
const lastBubbleTouch = ref({ x: 0, y: 0 })
const LONG_PRESS_DELAY_MS = 380
const LONG_PRESS_MOVE_PX = 10
const bubblePressState = {
  active: false,
  moved: false,
  fired: false,
  msg: null,
  startX: 0,
  startY: 0
}
const replyTarget = ref(null)
/** 待发送图片：[{ id, localPath }]，发送时再上传 */
const STAGE_IMAGE_MAX = 9
const stagedImages = ref([])
let stagedImageSeq = 0
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
/** 距顶部小于该阈值时预取更早消息（px），并同步给 scroll-view upper-threshold */
const LOAD_MORE_THRESHOLD = 400
/** 与后端默认分页一致 */
const HISTORY_PAGE_SIZE = 30
const loadingMore = ref(false)
const hasMoreHistory = ref(true)
let nearBottom = true
let msgsViewH = 0
/** 当前滚动位置（onScroll 维护，用于插入历史后还原） */
let currentScrollTop = 0
/** 防止滚动事件连发重复请求 */
let loadMoreLock = false
/** 预览相册拉取更早图片的并发锁 */
let previewEarlierLock = false
let offs = []
let typingTimer = null
let scrollTimers = []
let recorder = null
let recordStartY = 0
let recordStartTime = 0
let voiceWillSend = false
/** 按住说话时并行识别的文稿（后端 ASR 的补充） */
let liveVoiceTranscript = ''
let h5SpeechRec = null
let audioCtx = null
let readMarkTimer = null
let lastMarkedMsgId = 0
let pendingReadMsgId = 0
/** AI 流式：合并 delta 刷新，避免每个 token 触发整页滚动/重绘 */
let aiDeltaMap = Object.create(null)
let aiFlushTimer = null
let aiScrollPending = false
let typingActive = false
let bubbleLongPressTimer = null

const isPrivateHuman = computed(() => convType.value === 1 && peer.value && !peer.value.bot)
const isAiPrivate = computed(() => convType.value === 1 && peer.value && !!peer.value.bot)
const isNonFriendPrivate = computed(() => isPrivateHuman.value && !isFriend.value)
const blockedPrivateChat = computed(() => isNonFriendPrivate.value)
const showComposer = computed(() => !blockedPrivateChat.value)
const isGroupChat = computed(() => convType.value === 2)
const showTypingIndicator = computed(() => isPrivateHuman.value && !!typingText.value)
const myUserId = computed(() => store.state.user?.id)

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
let offConversationSubscription = null
let draftPersistTimer = null
let draftSyncSeq = 0

/** adjustResize 下视口已收缩，只需去掉被键盘盖住的 safe-area，勿再加 bottom */
const composerWrapStyle = computed(() => {
  if (keyboardHeight.value <= 0) return {}
  return { paddingBottom: '12px' }
})

/** 与侧栏 / utils/tab-swipe 手感对齐；会话↔更多用同页叠层跟手，退出列表仍 leave 后 navigateBack */
const CHAT_SWIPE_AXIS_LOCK_PX = SWIPE_AXIS_LOCK_PX
const CHAT_SWIPE_FOLLOW_FACTOR = SWIPE_FOLLOW_FACTOR
/** 右滑退出：达到屏宽该比例即可提交（≈ 侧栏 0.35×0.78） */
const CHAT_SWIPE_LEAVE_RATIO = SWIPE_SCREEN_COMMIT_RATIO
/** 右滑跟手视觉上限（相对屏宽）；超出后橡胶阻尼，避免硬顶死 */
const CHAT_SWIPE_FOLLOW_MAX_RATIO = 0.52
const CHAT_SWIPE_RUBBER = 0.18
const CHAT_SWIPE_LEAVE_MS = TAB_SWIPE_LEAVE_MS
const CHAT_SWIPE_ENTER_MS = TAB_SWIPE_ENTER_MS
const CHAT_SWIPE_CANCEL_MS = 150
/** 打开更多时会话层轻微左移（对齐主 Tab leave 约 22%） */
const CHAT_MORE_PARALLAX = 0.22
/** 瞬时速度采样窗口（ms），松手判定用近期速度而非全程均值 */
const CHAT_SWIPE_VX_SAMPLE_MS = SWIPE_VX_SAMPLE_MS
/** 更多层 settle 比例，对齐侧栏 DRAWER_OPEN_RATIO */
const CHAT_MORE_COMMIT_RATIO = SWIPE_COMMIT_RATIO
const CHAT_EASING_ENTER = SWIPE_EASING_ENTER
const CHAT_EASING_LEAVE = SWIPE_EASING_LEAVE
const CHAT_EASING_CANCEL = SWIPE_EASING_CANCEL

const swipeOffset = ref(0)
const swipeOpacity = ref(1)
/** '' | 'follow' | 'leave' | 'cancel' —— 手势轴用 plain 变量，避免轴锁触发多余渲染 */
const swipePhase = ref('')
let swipeAxis = '' // '' | 'h' | 'v'
let swipeStartX = 0
let swipeStartY = 0
let swipeStartAt = 0
let swipeTracking = false
let swipeNavigating = false
let swipeLeaveTimer = null
let swipeWindowWidth = 0
/** 去重：scroll-view 与页面根节点在 H5 可能各触发一次同戳 touch */
let swipeStartStamp = -1
let swipeMoveStamp = -1
let swipeSampleX = 0
let swipeSampleAt = 0
let swipeRecentVx = 0

/** 同页「更多」侧滑层 */
const moreMounted = ref(false)
const moreOpen = ref(false)
const moreRefreshSeq = ref(0)
/** 相对打开位置的位移：0=全开，+windowWidth=关在右侧 */
const moreOffset = ref(0)
/** '' | 'follow' | 'open' | 'close' */
const morePhase = ref('')
let moreAnimTimer = null
let moreSwipeTracking = false
let moreSwipeStartX = 0
let moreSwipeStartY = 0
let moreSwipeStartAt = 0
let moreSwipeAxis = ''
let moreSwipeBase = 0
let moreStartStamp = -1
let moreMoveStamp = -1
let moreSampleX = 0
let moreSampleAt = 0
let moreRecentVx = 0

/** 跟手：同帧多次 touchmove 合并为一次写 ref，避免 App 桥接掉帧 */
const chatFollowBatch = createRafBatch((payload) => {
  if (payload.chatX != null && swipeOffset.value !== payload.chatX) {
    swipeOffset.value = payload.chatX
  }
  if (payload.chatOp != null && swipeOpacity.value !== payload.chatOp) {
    swipeOpacity.value = payload.chatOp
  }
  if (payload.phase != null && swipePhase.value !== payload.phase) {
    swipePhase.value = payload.phase
  }
  if (payload.moreX != null && moreOffset.value !== payload.moreX) {
    moreOffset.value = payload.moreX
  }
  if (payload.morePhase != null && morePhase.value !== payload.morePhase) {
    morePhase.value = payload.morePhase
  }
})

function getSwipeWindowWidth() {
  if (swipeWindowWidth > 0) return swipeWindowWidth
  try {
    swipeWindowWidth = uni.getSystemInfoSync().windowWidth || 375
  } catch (e) {
    swipeWindowWidth = 375
  }
  return swipeWindowWidth
}

function clearSwipeLeaveTimer() {
  if (!swipeLeaveTimer) return
  clearTimeout(swipeLeaveTimer)
  swipeLeaveTimer = null
}

function clearMoreAnimTimer() {
  if (!moreAnimTimer) return
  clearTimeout(moreAnimTimer)
  moreAnimTimer = null
}

function ensureMoreMounted() {
  if (moreMounted.value) return
  if (!conversationId.value) return
  moreMounted.value = true
  moreOffset.value = getSwipeWindowWidth()
  morePhase.value = ''
  moreOpen.value = false
}

const pageStyle = computed(() => {
  const style = {}
  if (chatBgDisplay.value) {
    const url = chatBgDisplay.value
    style.backgroundImage = `linear-gradient(165deg, rgba(10,6,20,0.72), rgba(26,11,40,0.78)), url("${url}")`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  const phase = swipePhase.value
  if (phase || swipeOffset.value) {
    style.transform = `translate3d(${swipeOffset.value}px,0,0)`
    style.opacity = swipeOpacity.value
    if (phase === 'follow') {
      style.transition = 'none'
      style.willChange = 'transform'
    } else if (phase === 'leave') {
      style.transition = `transform ${CHAT_SWIPE_LEAVE_MS}ms ${CHAT_EASING_LEAVE}, opacity ${CHAT_SWIPE_LEAVE_MS}ms ${CHAT_EASING_LEAVE}`
    } else if (phase === 'cancel') {
      style.transition = `transform ${CHAT_SWIPE_CANCEL_MS}ms ${CHAT_EASING_CANCEL}, opacity ${CHAT_SWIPE_CANCEL_MS}ms ${CHAT_EASING_CANCEL}`
    }
  }
  return style
})

const moreLayerStyle = computed(() => {
  const w = getSwipeWindowWidth()
  const x = moreMounted.value ? moreOffset.value : w
  // 关闭动画中不可点；会话侧跟手打开时 moreOpen 仍为 false，保持 none 以免抢走 touch
  const interactive = moreOpen.value && morePhase.value !== 'close'
  const style = {
    transform: `translate3d(${x}px,0,0)`,
    pointerEvents: interactive ? 'auto' : 'none'
  }
  if (morePhase.value === 'follow') {
    style.transition = 'none'
    style.willChange = 'transform'
  } else if (morePhase.value === 'open') {
    style.transition = `transform ${CHAT_SWIPE_ENTER_MS}ms ${CHAT_EASING_ENTER}`
  } else if (morePhase.value === 'close') {
    style.transition = `transform ${CHAT_SWIPE_LEAVE_MS}ms ${CHAT_EASING_LEAVE}`
  }
  return style
})

function touchStampOf(e) {
  const t = Number(e?.timeStamp)
  return Number.isFinite(t) ? t : -1
}

function noteSwipeSample(x) {
  const now = Date.now()
  const dt = now - swipeSampleAt
  if (dt > 0 && dt <= CHAT_SWIPE_VX_SAMPLE_MS * 3) {
    swipeRecentVx = Math.abs(x - swipeSampleX) / dt
  }
  swipeSampleX = x
  swipeSampleAt = now
}

function noteMoreSample(x) {
  const now = Date.now()
  const dt = now - moreSampleAt
  if (dt > 0 && dt <= CHAT_SWIPE_VX_SAMPLE_MS * 3) {
    moreRecentVx = Math.abs(x - moreSampleX) / dt
  }
  moreSampleX = x
  moreSampleAt = now
}

function rubberFollow(raw, max) {
  if (raw <= max) return raw
  return max + (raw - max) * CHAT_SWIPE_RUBBER
}

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
          if (rect?.height) {
            msgsViewH = rect.height
          }
        })
        .exec()
    })
  }
}

function syncComposerMetrics(value) {
  const lines = Math.max(1, String(value || '').split('\n').length)
  inputLineCount.value = lines
  atMaxHeight.value = lines >= INPUT_MAX_LINES
}

function clearDraftPersistTimer() {
  if (draftPersistTimer) {
    clearTimeout(draftPersistTimer)
    draftPersistTimer = null
  }
}

async function persistDraftNow(updatedAt = Date.now()) {
  if (!conversationId.value) return
  const content = String(text.value || '')
  const mentions = Array.isArray(atUserIds.value)
    ? atUserIds.value.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : []
  const seq = ++draftSyncSeq
  try {
    const detail = await api.updateConvDraft(conversationId.value, {
      text: content,
      atUserIds: mentions,
      updatedAt
    })
    if (seq !== draftSyncSeq || !detail) return
    getStore().upsertConversation(detail)
  } catch (e) {}
}

function queueDraftPersist(delay = 260) {
  clearDraftPersistTimer()
  const updatedAt = Date.now()
  draftPersistTimer = setTimeout(() => {
    draftPersistTimer = null
    persistDraftNow(updatedAt)
  }, delay)
}

function restoreDraft(detail) {
  const draft = detail && typeof detail === 'object' ? detail : {}
  text.value = typeof draft.draftText === 'string' ? draft.draftText : ''
  atUserIds.value = Array.isArray(draft.draftAtUserIds)
    ? draft.draftAtUserIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : []
  cursor.value = text.value.length
  syncComposerMetrics(text.value)
}

function bindConversationSubscription() {
  if (!conversationId.value) return
  if (offConversationSubscription) {
    try { offConversationSubscription() } catch (e) {}
  }
  offConversationSubscription = subscribeConversation(conversationId.value)
}

function unbindConversationSubscription() {
  if (!offConversationSubscription) return
  try { offConversationSubscription() } catch (e) {}
  offConversationSubscription = null
}

watch([text, atUserIds], () => {
  queueDraftPersist()
}, { deep: true })

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
  return mediaSrcAt(m, 0)
}

function mediaSrcAt(m, index) {
  const urls = imageUrlsOf(m)
  const path = urls[index] || m?.content
  if (!path) return ''
  const key = mediaKey(m) + '#' + index
  const override = mediaSrcOverride.value[key]
  if (override && override !== '__failed__') return override
  return getDisplayUrl(path) || fullUrl(path)
}

function mediaFailed(m) {
  return mediaSrcOverride.value[mediaKey(m) + '#0'] === '__failed__'
    || mediaSrcOverride.value[mediaKey(m)] === '__failed__'
}

function onMediaError(m) {
  onMediaErrorAt(m, 0)
}

function onMediaErrorAt(m, index) {
  const urls = imageUrlsOf(m)
  const path = urls[index] || m?.content
  if (!path) return
  const key = mediaKey(m) + '#' + index
  const cur = mediaSrcAt(m, index)
  // 本地缓存失效：清缓存后回退完整网络 URL 再试一次
  if (isLocalMediaPath(cur)) {
    forgetCached(path)
    const remote = fullUrl(path)
    if (remote && remote !== cur) {
      mediaSrcOverride.value = { ...mediaSrcOverride.value, [key]: remote }
      return
    }
  }
  // 已是网络地址仍失败：再强制用归一化后的 fullUrl 重试一次（避免错误 host / 双斜杠）
  const remote = fullUrl(path)
  if (remote && remote !== cur && mediaSrcOverride.value[key] !== remote) {
    forgetCached(path)
    mediaSrcOverride.value = { ...mediaSrcOverride.value, [key]: remote }
    return
  }
  mediaSrcOverride.value = { ...mediaSrcOverride.value, [key]: '__failed__' }
}

function retryMedia(m) {
  const urls = imageUrlsOf(m)
  if (!urls.length && !m?.content) return
  const next = { ...mediaSrcOverride.value }
  const targets = urls.length ? urls : [m.content]
  targets.forEach((path, i) => {
    forgetCached(path)
    delete next[mediaKey(m) + '#' + i]
    delete next[mediaKey(m)]
    ensureCached(path).catch(() => {})
  })
  mediaSrcOverride.value = next
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

function applyConversationDetail(detail) {
  if (!detail) return
  members.value = detail.members || []
  convType.value = detail.type || 1
  ownerId.value = detail.ownerId != null ? Number(detail.ownerId) : null
  peer.value = detail.peer || null
  if (detail.title) title.value = detail.title
  restoreAiStream(detail)
  chatBg.value = syncBackgroundFromDetail(conversationId.value, detail)
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

function goBack(navOpts) {
  const useCustomAnim = navOpts && typeof navOpts === 'object' && typeof navOpts.animationType === 'string'
  const pages = getCurrentPages()
  if (pages.length > 1) {
    if (useCustomAnim) {
      uni.navigateBack({
        animationType: navOpts.animationType,
        animationDuration: navOpts.animationDuration ?? 0
      })
    } else {
      uni.navigateBack()
    }
  } else {
    uni.switchTab({ url: '/pages/chats/chats' })
  }
}

function shouldIgnoreChatSwipe() {
  return !!(
    swipeNavigating
    || moreOpen.value
    || morePhase.value === 'open'
    || morePhase.value === 'close'
    || recording.value
    || showEditor.value
    || showForward.value
    || menuMsg.value
    || keyboardHeight.value > 0
  )
}

function resetChatSwipeVisual() {
  chatFollowBatch.cancel()
  swipeOffset.value = 0
  swipeOpacity.value = 1
  swipePhase.value = ''
  swipeAxis = ''
}

function resetChatSwipe() {
  clearSwipeLeaveTimer()
  swipeTracking = false
  resetChatSwipeVisual()
}

function bounceChatSwipeBack() {
  chatFollowBatch.flush()
  clearSwipeLeaveTimer()
  swipeTracking = false
  const fromChat = swipeOffset.value
  const fromOpacity = swipeOpacity.value
  const fromMore = moreOffset.value
  const bouncingMore = morePhase.value === 'follow' && !moreOpen.value
  swipePhase.value = 'cancel'
  swipeOffset.value = fromChat
  swipeOpacity.value = fromOpacity
  if (bouncingMore) {
    const w = getSwipeWindowWidth()
    morePhase.value = 'close'
    moreOffset.value = fromMore
    clearMoreAnimTimer()
    nextTick(() => {
      swipeOffset.value = 0
      swipeOpacity.value = 1
      moreOffset.value = w
    })
    moreAnimTimer = setTimeout(() => {
      moreAnimTimer = null
      morePhase.value = ''
      moreOffset.value = w
    }, CHAT_SWIPE_CANCEL_MS + 20)
  } else {
    nextTick(() => {
      swipeOffset.value = 0
      swipeOpacity.value = 1
    })
  }
  swipeLeaveTimer = setTimeout(() => {
    swipeLeaveTimer = null
    resetChatSwipeVisual()
  }, CHAT_SWIPE_CANCEL_MS + 20)
}

function leaveDistanceFor(dx) {
  const base = getSwipeWindowWidth() * CHAT_SWIPE_LEAVE_RATIO
  const current = Math.abs(swipeOffset.value)
  return Math.max(base, current + 20) * (dx > 0 ? 1 : -1)
}

function finishOpenMoreFromSwipe() {
  chatFollowBatch.flush()
  clearSwipeLeaveTimer()
  clearMoreAnimTimer()
  swipeTracking = false
  moreOpen.value = true
  // 先挂上 open 过渡，再在下一帧落到 0，避免与 follow(transition:none) 同帧合并导致无动画
  const from = moreOffset.value
  const fromParallax = swipeOffset.value
  morePhase.value = 'open'
  moreOffset.value = from
  swipePhase.value = 'cancel'
  swipeOffset.value = fromParallax
  swipeOpacity.value = 1
  nextTick(() => {
    moreOffset.value = 0
    swipeOffset.value = 0
  })
  moreAnimTimer = setTimeout(() => {
    moreAnimTimer = null
    morePhase.value = ''
    resetChatSwipeVisual()
  }, CHAT_SWIPE_ENTER_MS + 20)
}

function commitChatSwipeLeave(dx) {
  chatFollowBatch.flush()
  const goRight = dx > 0
  if (!goRight && !conversationId.value) {
    bounceChatSwipeBack()
    return
  }
  clearSwipeLeaveTimer()
  swipeTracking = false

  if (!goRight) {
    // 左滑：同页打开更多，不再 navigateTo
    ensureMoreMounted()
    finishOpenMoreFromSwipe()
    return
  }

  // 右滑：离场后返回聊天列表
  swipeNavigating = true
  const target = leaveDistanceFor(dx)
  const targetOpacity = 0.25
  swipePhase.value = 'leave'
  nextTick(() => {
    swipeOffset.value = target
    swipeOpacity.value = targetOpacity
  })

  swipeLeaveTimer = setTimeout(() => {
    swipeLeaveTimer = null
    goBack({ animationType: 'none', animationDuration: 0 })
    swipeLeaveTimer = setTimeout(() => {
      swipeLeaveTimer = null
      resetChatSwipeVisual()
      swipeNavigating = false
    }, 80)
  }, CHAT_SWIPE_LEAVE_MS + 16)
}

function openMorePanel(animated = true) {
  if (!conversationId.value) return
  if (moreOpen.value && morePhase.value !== 'close') return
  ensureMoreMounted()
  clearMoreAnimTimer()
  const w = getSwipeWindowWidth()
  if (!animated) {
    moreOffset.value = 0
    moreOpen.value = true
    morePhase.value = ''
    return
  }
  moreOffset.value = w
  moreOpen.value = true
  morePhase.value = 'open'
  nextTick(() => {
    moreOffset.value = 0
  })
  moreAnimTimer = setTimeout(() => {
    moreAnimTimer = null
    morePhase.value = ''
  }, CHAT_SWIPE_ENTER_MS + 20)
}

function closeMorePanel(animated = true) {
  chatFollowBatch.flush()
  if (!moreMounted.value) return
  if (!moreOpen.value && morePhase.value !== 'follow' && morePhase.value !== 'open') return
  clearMoreAnimTimer()
  const w = getSwipeWindowWidth()
  const useAnim = animated !== false
  if (!useAnim) {
    moreOffset.value = w
    moreOpen.value = false
    morePhase.value = ''
    resetChatSwipeVisual()
    return
  }
  const fromMore = moreOffset.value
  const fromChat = swipeOffset.value
  morePhase.value = 'close'
  moreOffset.value = fromMore
  swipePhase.value = 'cancel'
  swipeOffset.value = fromChat
  swipeOpacity.value = 1
  nextTick(() => {
    moreOffset.value = w
    swipeOffset.value = 0
  })
  moreAnimTimer = setTimeout(() => {
    moreAnimTimer = null
    moreOpen.value = false
    morePhase.value = ''
    moreOffset.value = w
    resetChatSwipeVisual()
  }, CHAT_SWIPE_LEAVE_MS + 20)
}

function exitChatFromMore() {
  clearMoreAnimTimer()
  moreOpen.value = false
  morePhase.value = ''
  moreMounted.value = false
  goBack({ animationType: 'none', animationDuration: 0 })
}

async function onMoreBgChanged(url) {
  chatBg.value = url || ''
  await resolveChatBackground(chatBg.value)
}

function onChatSwipeStart(e) {
  const stamp = touchStampOf(e)
  if (stamp >= 0 && stamp === swipeStartStamp) return
  if (stamp >= 0) swipeStartStamp = stamp

  const hadMenu = !!menuMsg.value
  onOutsideMenuTouch()
  // 收起长按菜单的这次触摸不连带触发导航手势
  if (hadMenu || shouldIgnoreChatSwipe()) {
    resetChatSwipe()
    return
  }
  clearSwipeLeaveTimer()
  chatFollowBatch.cancel()
  const p = pickTouchPoint(e)
  if (!p) return
  swipeStartX = p.x
  swipeStartY = p.y
  swipeStartAt = Date.now()
  swipeSampleX = p.x
  swipeSampleAt = swipeStartAt
  swipeRecentVx = 0
  swipeMoveStamp = -1
  swipeTracking = true
  swipeAxis = ''
  swipePhase.value = ''
  swipeOffset.value = 0
  swipeOpacity.value = 1
}

function onChatSwipeMove(e) {
  if (!swipeTracking) return
  const stamp = touchStampOf(e)
  if (stamp >= 0 && stamp === swipeMoveStamp) return
  if (stamp >= 0) swipeMoveStamp = stamp

  // 水平已锁后勿因面板/键盘瞬时状态掐断跟手
  if (shouldIgnoreChatSwipe() && swipeAxis !== 'h') {
    resetChatSwipe()
    return
  }
  const p = pickTouchPoint(e)
  if (!p) return
  const dx = p.x - swipeStartX
  const dy = p.y - swipeStartY
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (!swipeAxis) {
    swipeAxis = resolveSwipeAxis(absX, absY, CHAT_SWIPE_AXIS_LOCK_PX)
    if (!swipeAxis) return
    if (swipeAxis === 'v') {
      // 交给消息列表纵向滚动，彻底退出水平跟踪
      swipeTracking = false
      chatFollowBatch.cancel()
      swipePhase.value = ''
      swipeOffset.value = 0
      swipeOpacity.value = 1
      return
    }
  }

  if (swipeAxis !== 'h') return
  tryPreventTouchScroll(e)
  noteSwipeSample(p.x)

  if (dx < 0) {
    // 左滑跟手打开更多层（更多层 1:1，会话层仅视差）；跟手不改 opacity
    ensureMoreMounted()
    const w = getSwipeWindowWidth()
    const capped = Math.max(-w, Math.min(0, dx * CHAT_SWIPE_FOLLOW_FACTOR))
    chatFollowBatch.queue({
      phase: 'follow',
      chatX: capped * CHAT_MORE_PARALLAX,
      chatOp: 1,
      morePhase: 'follow',
      moreX: w + capped
    })
    return
  }

  // 右滑退出会话：1:1 跟手 + 超出上限橡胶阻尼；跟手阶段保持 opacity=1
  const w = getSwipeWindowWidth()
  const maxFollow = w * CHAT_SWIPE_FOLLOW_MAX_RATIO
  const capped = rubberFollow(Math.max(0, dx * CHAT_SWIPE_FOLLOW_FACTOR), maxFollow)
  chatFollowBatch.queue({
    phase: 'follow',
    chatX: capped,
    chatOp: 1
  })
}

function finishChatSwipe(e) {
  const axis = swipeAxis
  const tracking = swipeTracking
  chatFollowBatch.flush()
  if (!tracking) {
    if (axis === 'h' && swipePhase.value === 'follow') bounceChatSwipeBack()
    return
  }
  swipeTracking = false
  if (shouldIgnoreChatSwipe() && axis !== 'h') {
    bounceChatSwipeBack()
    return
  }
  if (axis !== 'h') {
    resetChatSwipeVisual()
    return
  }

  const p = pickTouchPoint(e)
  if (!p) {
    bounceChatSwipeBack()
    return
  }
  const dx = p.x - swipeStartX
  const absX = Math.abs(dx)
  const elapsed = Math.max(Date.now() - swipeStartAt, 1)
  const avgVx = absX / elapsed
  // 优先用近期瞬时速度，快速轻扫更灵敏
  const vx = Math.max(avgVx, swipeRecentVx)

  const w = getSwipeWindowWidth()
  // 已锁水平轴：不再用终点 dy 否决（抬手常带纵向漂移）
  const followAbs = dx > 0
    ? swipeOffset.value
    : (w - moreOffset.value)
  const followMax = dx > 0 ? w * CHAT_SWIPE_LEAVE_RATIO : w
  if (!shouldCommitHorizontalSwipe({
    absX,
    vx,
    followAbs: swipePhase.value === 'follow' ? followAbs : 0,
    followMax: swipePhase.value === 'follow' ? followMax : 0,
    commitRatio: dx > 0 ? 1 : CHAT_MORE_COMMIT_RATIO
  })) {
    bounceChatSwipeBack()
    return
  }

  commitChatSwipeLeave(dx)
}

function onChatSwipeEnd(e) {
  finishChatSwipe(e)
}

function onChatSwipeCancel() {
  if (swipeNavigating) return
  bounceChatSwipeBack()
}

function shouldIgnoreMoreSwipe() {
  return !!(
    !moreOpen.value
    || morePhase.value === 'open'
    || morePhase.value === 'close'
    || swipeNavigating
  )
}

function onMoreSwipeStart(e) {
  if (shouldIgnoreMoreSwipe()) {
    moreSwipeTracking = false
    return
  }
  const stamp = touchStampOf(e)
  if (stamp >= 0 && stamp === moreStartStamp) return
  if (stamp >= 0) moreStartStamp = stamp

  const p = pickTouchPoint(e)
  if (!p) return
  chatFollowBatch.cancel()
  moreSwipeStartX = p.x
  moreSwipeStartY = p.y
  moreSwipeStartAt = Date.now()
  moreSampleX = p.x
  moreSampleAt = moreSwipeStartAt
  moreRecentVx = 0
  moreMoveStamp = -1
  moreSwipeTracking = true
  moreSwipeAxis = ''
  moreSwipeBase = moreOffset.value
}

function onMoreSwipeMove(e) {
  if (!moreSwipeTracking) return
  const stamp = touchStampOf(e)
  if (stamp >= 0 && stamp === moreMoveStamp) return
  if (stamp >= 0) moreMoveStamp = stamp

  if (shouldIgnoreMoreSwipe() && moreSwipeAxis !== 'h') {
    moreSwipeTracking = false
    return
  }
  const p = pickTouchPoint(e)
  if (!p) return
  const dx = p.x - moreSwipeStartX
  const dy = p.y - moreSwipeStartY
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (!moreSwipeAxis) {
    moreSwipeAxis = resolveSwipeAxis(absX, absY, CHAT_SWIPE_AXIS_LOCK_PX)
    if (!moreSwipeAxis) return
    if (moreSwipeAxis === 'v') {
      moreSwipeTracking = false
      return
    }
  }
  if (moreSwipeAxis !== 'h') return
  tryPreventTouchScroll(e)
  noteMoreSample(p.x)
  // 仅右滑关闭；左滑忽略
  const w = getSwipeWindowWidth()
  const next = Math.max(0, Math.min(w, moreSwipeBase + Math.max(0, dx) * CHAT_SWIPE_FOLLOW_FACTOR))
  chatFollowBatch.queue({
    morePhase: 'follow',
    moreX: next,
    phase: 'follow',
    chatX: -((w - next) * CHAT_MORE_PARALLAX),
    chatOp: 1
  })
}

function finishMoreSwipe(e) {
  chatFollowBatch.flush()
  if (!moreSwipeTracking) {
    if (morePhase.value === 'follow' && moreOpen.value) {
      // 跟手中断：按位移决定开/关
      const w = getSwipeWindowWidth()
      if (moreOffset.value > w * CHAT_MORE_COMMIT_RATIO) closeMorePanel()
      else {
        const from = moreOffset.value
        morePhase.value = 'open'
        moreOffset.value = from
        nextTick(() => {
          moreOffset.value = 0
          swipeOffset.value = 0
        })
        clearMoreAnimTimer()
        moreAnimTimer = setTimeout(() => {
          moreAnimTimer = null
          morePhase.value = ''
          resetChatSwipeVisual()
        }, CHAT_SWIPE_ENTER_MS + 20)
      }
    }
    return
  }
  moreSwipeTracking = false
  if (shouldIgnoreMoreSwipe() && moreSwipeAxis !== 'h') return
  if (moreSwipeAxis !== 'h') return

  const p = pickTouchPoint(e)
  if (!p) {
    morePhase.value = 'open'
    moreOffset.value = 0
    return
  }
  const dx = p.x - moreSwipeStartX
  const absX = Math.abs(dx)
  const elapsed = Math.max(Date.now() - moreSwipeStartAt, 1)
  const avgVx = absX / elapsed
  const vx = Math.max(avgVx, moreRecentVx)

  const w = getSwipeWindowWidth()
  const isRatio = moreOffset.value > w * CHAT_MORE_COMMIT_RATIO
  if (dx > 0 && shouldCommitHorizontalSwipe({
    absX,
    vx,
    followAbs: isRatio ? moreOffset.value : 0,
    followMax: isRatio ? w : 0,
    commitRatio: CHAT_MORE_COMMIT_RATIO
  })) {
    closeMorePanel()
    return
  }
  // 未达阈值：从当前跟手位置弹回打开态
  const from = moreOffset.value
  morePhase.value = 'open'
  moreOffset.value = from
  swipePhase.value = 'cancel'
  nextTick(() => {
    moreOffset.value = 0
    swipeOffset.value = 0
  })
  clearMoreAnimTimer()
  moreAnimTimer = setTimeout(() => {
    moreAnimTimer = null
    morePhase.value = ''
    resetChatSwipeVisual()
  }, CHAT_SWIPE_ENTER_MS + 20)
}

function onMoreSwipeEnd(e) {
  finishMoreSwipe(e)
}

function onMoreSwipeCancel() {
  chatFollowBatch.cancel()
  moreSwipeTracking = false
  if (!moreOpen.value) return
  morePhase.value = 'open'
  moreOffset.value = 0
  swipeOffset.value = 0
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
  // 尽早预挂载「更多」层，避免首滑中途创建 DOM 造成跟手卡顿
  ensureMoreMounted()
  resolveChatBackground(getBackground(conversationId.value)).catch(() => {})
  bindConversationSubscription()
  const cached = getCachedMessages(conversationId.value)
  if (cached.length) {
    messages.value = cached.map((msg) => normalizeMsg(msg))
    hasMoreHistory.value = cached.length >= HISTORY_PAGE_SIZE
    scrollToBottom(false, true)
    prefetchMsgMedia(messages.value)
  }
  let detail = null
  const settled = await Promise.allSettled([
    loadHistory(),
    api.conversation(conversationId.value)
  ])
  if (settled[1].status === 'fulfilled') {
    detail = settled[1].value
  }
  applyConversationDetail(detail)
  restoreDraft(detail)
  resolveChatBackground(chatBg.value).catch(() => {})
  if (convType.value === 1 && peer.value && !peer.value.bot) {
    loadFriendStatus().catch(() => {})
  } else {
    isFriend.value = false
  }
  if (messages.value.length) {
    markConversationRead(messages.value[messages.value.length - 1].id, true)
  }
})

onShow(async () => {
  // 右滑退出列表动画残留清理；同页更多不走路由，无需特殊复位
  if (!swipeNavigating && !moreOpen.value) {
    clearSwipeLeaveTimer()
    resetChatSwipeVisual()
    swipeTracking = false
  }
  if (moreOpen.value) moreRefreshSeq.value += 1
  if (conversationId.value) getStore().setActiveChatId(conversationId.value)
  if (!conversationId.value) return
  try {
    const detail = await api.conversation(conversationId.value)
    applyConversationDetail(detail)
  } catch (e) {
    chatBg.value = getBackground(conversationId.value)
  }
  resolveChatBackground(chatBg.value).catch(() => {})
  if (!isPrivateHuman.value) {
    clearRemoteTyping()
  }
  if (convType.value === 1 && peer.value && !peer.value.bot) {
    loadFriendStatus().catch(() => {})
  }
  // 从「清空聊天记录」返回时，同步重拉空历史
  if (consumeClearedFlag(conversationId.value)) {
    await applyLocalHistoryCleared()
  }
  if (messages.value.length) {
    markConversationRead(messages.value[messages.value.length - 1].id, true)
  }
  if (showSticker.value && stickerPanelRef.value?.reload) {
    stickerPanelRef.value.reload()
  }
})

onHide(() => {
  stopTypingStatus(true)
  clearRemoteTyping()
})

onUnload(() => {
  clearSwipeLeaveTimer()
  stopTypingStatus(true)
  clearRemoteTyping()
  clearDraftPersistTimer()
  persistDraftNow()
  if (conversationId.value && messages.value.length) {
    setCachedMessages(conversationId.value, messages.value)
  }
  unbindConversationSubscription()
  const store = getStore()
  // 离开前先落本地已读水位并清红点，再清 activeChatId，避免迟到 WS 把未读写回
  const lastId = pendingReadMsgId
    || lastMarkedMsgId
    || (messages.value.length ? messages.value[messages.value.length - 1].id : 0)
  if (conversationId.value && lastId) {
    store.markConversationReadLocal(conversationId.value, lastId)
  }
  if (store.state.activeChatId === conversationId.value) {
    store.setActiveChatId(null)
  }
  previewEarlierLock = false
  if (feedbackState.videoPlayer.show) closeVideoPlayer()
  if (feedbackState.preview.show) closePreview()
  else setPreviewReachEarlierHandler(null)
})

onMounted(() => {
  initRecorder()
  try {
    uni.onKeyboardHeightChange(onKeyboardHeightChange)
  } catch (e) {}
  offs.push(onWs('chat', (msg) => {
    if (!msg || typeof msg !== 'object') return
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
    if (!chunk || typeof chunk !== 'object') return
    if (chunk.conversationId !== conversationId.value) return
    handleAi(chunk)
  }))
  offs.push(onWs('typing', (p) => {
    if (!p || typeof p !== 'object') return
    if (Number(p.conversationId) !== Number(conversationId.value)) return
    if (!isPrivateHuman.value) {
      clearRemoteTyping()
      return
    }
    if (p.userId != null && Number(p.userId) === Number(myUserId.value)) return
    if (!p.typing) { clearRemoteTyping(); return }
    const mem = findMember(p.userId)
    typingText.value = (memberDisplayName(mem) || '对方') + ' 正在输入…'
  }))
  offs.push(onWs('react', (payload) => {
    if (!payload || typeof payload !== 'object') return
    const myId = getStore().state.user?.id
    // 自己发出的事件已乐观更新，忽略回声避免抖动
    if (payload.userId != null && Number(payload.userId) === Number(myId)) return
    applyRemoteReaction(payload)
  }))
  offs.push(onWs('notify', (body) => {
    if (!body || typeof body !== 'object' || body.type !== 'conversation_cleared') return
    const id = body.payload?.conversationId != null
      ? body.payload.conversationId
      : body.payload?.conversation?.id
    if (Number(id) !== Number(conversationId.value)) return
    applyLocalHistoryCleared()
  }))
  const onCleared = (payload) => {
    const id = payload?.conversationId != null ? payload.conversationId : payload
    if (Number(id) !== Number(conversationId.value)) return
    applyLocalHistoryCleared()
  }
  try {
    uni.$on('pc-conversation-cleared', onCleared)
    offs.push(() => {
      try { uni.$off('pc-conversation-cleared', onCleared) } catch (e) {}
    })
  } catch (e) {}
  // 测一次可视高度，供 nearBottom 判断
  nextTick(() => {
    uni.createSelectorQuery()
      .select('.msgs')
      .boundingClientRect((rect) => {
        if (rect?.height) {
          msgsViewH = rect.height
        }
      })
      .exec()
  })
})

onUnmounted(() => {
  stopTypingStatus(false)
  clearRemoteTyping()
  clearDraftPersistTimer()
  try {
    uni.offKeyboardHeightChange(onKeyboardHeightChange)
  } catch (e) {}
  keyboardHeight.value = 0
  offs.forEach(fn => fn && fn())
  clearTimeout(readMarkTimer)
  clearTimeout(aiFlushTimer)
  clearTimeout(bubbleLongPressTimer)
  aiDeltaMap = Object.create(null)
  if (pendingReadMsgId > lastMarkedMsgId && conversationId.value) {
    const msgId = pendingReadMsgId
    pendingReadMsgId = 0
    lastMarkedMsgId = msgId
    getStore().markConversationReadLocal(conversationId.value, msgId)
    api.markRead(conversationId.value, msgId, true).catch(() => {})
  }
  clearScrollTimers()
  stopVoicePlayback()
  if (recorder && recording.value) {
    voiceWillSend = false
    try { recorder.stop() } catch (e) {}
  }
})

function clearScrollTimers() {
  scrollTimers.forEach(clearTimeout)
  scrollTimers = []
}

function clearRemoteTyping() {
  typingText.value = ''
}

function canUseTyping() {
  return !!conversationId.value && isPrivateHuman.value && !blockedPrivateChat.value
}

function stopTypingStatus(notifyRemote = false) {
  clearTimeout(typingTimer)
  typingTimer = null
  if (notifyRemote && typingActive && canUseTyping()) {
    sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: false })
  }
  typingActive = false
}

function touchTypingStatus() {
  if (!canUseTyping()) return
  if (!typingActive) {
    typingActive = true
    sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: true })
  }
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    if (!typingActive || !canUseTyping()) {
      typingActive = false
      typingTimer = null
      return
    }
    typingActive = false
    typingTimer = null
    sendStomp('/app/chat.typing', { conversationId: conversationId.value, typing: false })
  }, 1200)
}

/** 标记当前会话已读；WebSocket 高频消息时合并请求 */
function markConversationRead(lastMsgId, immediate = false) {
  if (!conversationId.value || !lastMsgId) return
  pendingReadMsgId = Math.max(pendingReadMsgId, lastMsgId)
  // 先乐观清红点，避免 AI/@ 消息的 conversation_updated 把未读写进列表
  getStore().markConversationReadLocal(conversationId.value, pendingReadMsgId)
  const flush = async () => {
    const msgId = pendingReadMsgId
    pendingReadMsgId = 0
    if (!msgId || msgId <= lastMarkedMsgId) return
    lastMarkedMsgId = msgId
    getStore().markConversationReadLocal(conversationId.value, msgId)
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
  cancelBubbleLongPress(true)
  if (menuMsg.value) closeMsgMenu()
  const d = e?.detail || {}
  const top = Number(d.scrollTop) || 0
  const contentH = Number(d.scrollHeight) || 0
  currentScrollTop = top
  if (msgsViewH > 0 && contentH > 0) {
    nearBottom = top + msgsViewH >= contentH - NEAR_BOTTOM_PX
  }
  // 距顶一定距离即预取，不必等顶到头
  if (top <= LOAD_MORE_THRESHOLD) {
    if (connected.value) loadMore()
  }
}

function measureMsgsInnerHeight() {
  return new Promise((resolve) => {
    uni.createSelectorQuery()
      .select('.msgs-inner')
      .boundingClientRect()
      .exec((res) => {
        resolve(Number(res?.[0]?.height) || 0)
      })
  })
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
          currentScrollTop = maxTop
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
  // 断连期间避免刷网络异常 Toast：走 silent 模式（仍让函数失败以保持原调用行为）
  const list = await api.messages(conversationId.value, beforeId, !connected.value)
  const rows = (list || []).map((msg) => normalizeMsg(msg))
  if (!beforeId) {
    messages.value = rows
    hasMoreHistory.value = rows.length >= HISTORY_PAGE_SIZE
    setCachedMessages(conversationId.value, rows)
    // 首次加载：无动画 + 多次 settle，展示最新消息
    scrollToBottom(false, true)
    // 首屏内容较矮时静默补拉，避免一上滑就顶到头
    if (hasMoreHistory.value) {
      setTimeout(() => {
        if (connected.value && currentScrollTop <= LOAD_MORE_THRESHOLD) loadMore()
      }, 320)
    }
  } else {
    // 上拉加载更早消息：保持当前位置，不强制贴底
    messages.value = [...rows, ...messages.value]
    if (!rows.length || rows.length < HISTORY_PAGE_SIZE) {
      hasMoreHistory.value = false
    }
    // 缓存仍只保留最近一页，便于下次进房秒开
    scheduleCacheMessages(conversationId.value, messages.value)
  }
  prefetchMsgMedia(rows)
  return rows
}

function consumeClearedFlag(convId) {
  if (convId == null) return false
  const key = 'pc_cleared_conv_' + convId
  try {
    const ts = uni.getStorageSync(key)
    if (!ts) return false
    uni.removeStorageSync(key)
    return true
  } catch (e) {
    return false
  }
}

/** 云端已清空后，同步本页消息列表与 AI 流式中间态 */
async function applyLocalHistoryCleared() {
  messages.value = []
  hasMoreHistory.value = false
  typingText.value = ''
  aiDeltaMap = Object.create(null)
  clearTimeout(aiFlushTimer)
  clearCachedMessages(conversationId.value)
  try {
    await loadHistory()
  } catch (e) {
    messages.value = []
    hasMoreHistory.value = false
    clearCachedMessages(conversationId.value)
  }
}

/**
 * 拉取更早一页历史并还原滚动位置（列表上滑与预览边界加载共用）。
 * @returns {Promise<Array>} 本页消息（升序），失败或无更多时返回 []
 */
async function fetchEarlierHistoryPage() {
  if (loadMoreLock || loadingMore.value || !connected.value || !hasMoreHistory.value || !messages.value.length) {
    return []
  }
  loadMoreLock = true
  const beforeH = await measureMsgsInnerHeight()
  loadingMore.value = true
  let rows = []
  try {
    rows = await loadHistory(messages.value[0].id)
  } catch (e) {
    rows = []
  } finally {
    loadingMore.value = false
  }
  if (!rows.length) {
    setTimeout(() => { loadMoreLock = false }, 48)
    return []
  }
  await nextTick()
  await new Promise((r) => setTimeout(r, 16))
  if (nearBottom) {
    // 首屏补拉 / 底部预取：保持贴底，勿用高度差把视口拽走
    scrollToBottom(false, true)
  } else {
    const afterH = await measureMsgsInnerHeight()
    const delta = Math.max(0, afterH - beforeH)
    if (delta > 0) {
      scrollAnim.value = false
      scrollInto.value = ''
      const nextTop = currentScrollTop + delta
      scrollTop.value = scrollTop.value === nextTop ? nextTop + 0.01 : nextTop
      currentScrollTop = nextTop
    }
  }
  setTimeout(() => { loadMoreLock = false }, 48)
  return rows
}

/**
 * 预取更早消息，并按内容高度差还原滚动位置，避免上滑跳动。
 */
async function loadMore() {
  if (!connected.value) return
  const rows = await fetchEarlierHistoryPage()
  if (!rows.length) return
  // 仍靠近顶部则继续预取，填满可视区域（底部补拉走 nearBottom 分支）
  if (!nearBottom && currentScrollTop <= LOAD_MORE_THRESHOLD && hasMoreHistory.value) {
    setTimeout(() => loadMore(), 64)
  }
}

function findMember(userId) {
  if (userId == null) return null
  return members.value.find(x => Number(x.userId) === Number(userId)) || null
}

function memberDisplayName(mem) {
  if (!mem) return ''
  return (mem.remark || mem.nickname || '').trim()
}

function memberMentionName(mem) {
  if (!mem) return ''
  return (mem.nickname || mem.remark || '').trim()
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

function senderMentionName(m) {
  if (!m) return ''
  if (!isGroupChat.value && peer.value && Number(m.senderId) === Number(peer.value.id)) {
    if (peer.value.nickname) return String(peer.value.nickname).trim()
  }
  const mem = findMember(m.senderId)
  const fromMem = memberMentionName(mem)
  if (fromMem) return fromMem
  if (m.sender?.nickname) return String(m.sender.nickname).trim()
  if (m.msgType === 5 || Number(m.senderId) === 1) return 'Kimi'
  return '用户'
}

function insertMention(name, userId) {
  const display = String(name || '').trim()
  if (!display) return
  const pos = cursor.value >= 0 ? cursor.value : text.value.length
  const before = text.value.slice(0, pos)
  const after = text.value.slice(pos)
  const token = '@' + display
  const beforeTrimmed = before.replace(/\s+$/, '')
  const afterTrimmed = after.replace(/^\s+/, '')
  if (beforeTrimmed.endsWith(token) && (!afterTrimmed || afterTrimmed.startsWith(token))) {
    cursor.value = before.length
    showAt.value = false
    return
  }
  const prefix = before && !/[\s\n]$/.test(before) ? ' ' : ''
  const suffix = !after || /^[\s\n]/.test(after) ? '' : ' '
  const insertText = prefix + token + ' ' + suffix
  text.value = before + insertText + after
  cursor.value = (before + insertText).length
  if (userId != null) {
    atUserIds.value = Array.from(new Set([...atUserIds.value, Number(userId)]))
  }
  showAt.value = false
}

function openSelfProfile() {
  requestMainTab(2, { animated: false })
}

function openSenderProfile(m) {
  if (!m) return
  const senderId = Number(m.senderId)
  if (!senderId) return
  if (myUserId.value != null && senderId === Number(myUserId.value)) {
    openSelfProfile()
    return
  }
  if (isBotSender(m)) {
    uni.showToast({ title: 'AI 助手暂无个人资料', icon: 'none' })
    return
  }
  const name = senderNickname(m) || '用户'
  const url = '/pages/friend-profile/friend-profile?userId=' + senderId
    + '&convId=' + conversationId.value
    + '&title=' + encodeURIComponent(name)
  uni.navigateTo({ url })
}

function mentionSender(m) {
  if (!m) return
  const senderId = Number(m.senderId)
  if (myUserId.value != null && senderId === Number(myUserId.value)) {
    uni.showToast({ title: '不能 @ 自己', icon: 'none' })
    return
  }
  closeMsgMenu()
  closeEmojiPanel()
  closeStickerPanel()
  voiceMode.value = false
  insertMention(senderMentionName(m), senderId)
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
  if (!msg || typeof msg !== 'object') return
  const myId = getStore().state.user?.id
  msg = normalizeMsg({ ...msg, mine: msg.senderId === myId })
  if (msg.clientMsgId && streamingMap.value[msg.clientMsgId]) {
    const idx = messages.value.findIndex(m => m.clientMsgId === msg.clientMsgId)
    if (idx >= 0) {
      messages.value[idx] = normalizeMsg({ ...messages.value[idx], ...msg, streaming: false })
      delete streamingMap.value[msg.clientMsgId]
      scheduleCacheMessages(conversationId.value, messages.value)
      return
    }
  }
  const existIdx = messages.value.findIndex(m => m.id === msg.id)
  if (existIdx >= 0) {
    // 原地更新，避免整表 map 重建
    messages.value[existIdx] = normalizeMsg({ ...messages.value[existIdx], ...msg })
    scheduleCacheMessages(conversationId.value, messages.value)
    return
  }
  messages.value.push(msg)
  prefetchMsgMedia(msg)
  scheduleCacheMessages(conversationId.value, messages.value)
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

/** 根据会话详情中的 AI 流式状态恢复等待气泡（退出重进仍可见） */
function restoreAiStream(detail) {
  if (!detail?.aiStreaming) {
    const staleIdx = messages.value.findIndex(m => m.streaming && !m.id && Number(m.senderId) === 1)
    if (staleIdx < 0) return
    const id = messages.value[staleIdx].clientMsgId
    if (id) delete streamingMap.value[id]
    messages.value.splice(staleIdx, 1)
    // 等待期间若漏掉 done/正式消息，补拉最新历史
    syncLatestAfterAiDone()
    return
  }
  const clientMsgId = detail.aiStreamClientMsgId || ('ai-pending-' + conversationId.value)
  const content = detail.aiStreamContent || ''
  const existIdx = messages.value.findIndex(m =>
    (m.clientMsgId && m.clientMsgId === clientMsgId)
    || (m.streaming && Number(m.senderId) === 1 && !m.id)
  )
  if (existIdx >= 0) {
    const oldId = messages.value[existIdx].clientMsgId
    if (oldId && oldId !== clientMsgId) delete streamingMap.value[oldId]
    streamingMap.value[clientMsgId] = true
    messages.value[existIdx] = {
      ...messages.value[existIdx],
      clientMsgId,
      content: content || messages.value[existIdx].content || '',
      streaming: true,
      senderId: 1,
      msgType: 5,
      mine: false
    }
  } else {
    streamingMap.value[clientMsgId] = true
    messages.value.push({
      clientMsgId,
      conversationId: conversationId.value,
      senderId: 1,
      msgType: 5,
      content,
      mine: false,
      streaming: true
    })
  }
  if (nearBottom) scrollToBottomLite()
}

async function syncLatestAfterAiDone() {
  if (!conversationId.value) return
  try {
    const list = await api.messages(conversationId.value, undefined, !connected.value)
    const rows = list || []
    for (const msg of rows) {
      upsertMsg(msg)
    }
    if (nearBottom) scrollToBottomLite()
  } catch (e) {}
}

function ensureAiStreamingBubble(clientMsgId, content) {
  if (!clientMsgId) return -1
  let idx = messages.value.findIndex(m => m.clientMsgId === clientMsgId)
  if (idx >= 0) return idx
  // 排队占位气泡 → 换成真实 clientMsgId
  idx = messages.value.findIndex(m =>
    m.streaming && Number(m.senderId) === 1 && !m.id
    && String(m.clientMsgId || '').startsWith('ai-pending-')
  )
  if (idx >= 0) {
    const oldId = messages.value[idx].clientMsgId
    if (oldId) delete streamingMap.value[oldId]
    streamingMap.value[clientMsgId] = true
    messages.value[idx] = {
      ...messages.value[idx],
      clientMsgId,
      content: content != null ? content : (messages.value[idx].content || ''),
      streaming: true
    }
    return idx
  }
  streamingMap.value[clientMsgId] = true
  messages.value.push({
    clientMsgId,
    conversationId: conversationId.value,
    senderId: 1,
    msgType: 5,
    content: content || '',
    mine: false,
    streaming: true
  })
  return messages.value.length - 1
}

function handleAi(chunk) {
  if (!chunk || typeof chunk !== 'object') return
  if (chunk.type === 'start') {
    ensureAiStreamingBubble(chunk.clientMsgId, '')
    if (nearBottom) scrollToBottomLite()
  } else if (chunk.type === 'delta') {
    ensureAiStreamingBubble(chunk.clientMsgId, chunk.content)
    aiDeltaMap[chunk.clientMsgId] = chunk.content
    if (!aiFlushTimer) {
      aiFlushTimer = setTimeout(flushAiDeltas, 64)
    }
  } else if (chunk.type === 'done') {
    if (aiFlushTimer) {
      clearTimeout(aiFlushTimer)
      flushAiDeltas()
    }
    const idx = ensureAiStreamingBubble(chunk.clientMsgId, chunk.content)
    if (idx >= 0) {
      messages.value[idx].content = chunk.content
      messages.value[idx].streaming = false
      // 保留 streamingMap，等正式消息 upsert 时合并并清理，避免重复气泡
      if (nearBottom) scrollToBottomLite()
    }
  }
}

async function send() {
  const content = text.value.trim()
  const staged = stagedImages.value
  if (!content && !staged.length) return
  stopTypingStatus(true)
  if (staged.length) {
    await sendStagedImages()
    return
  }
  const textSnapshot = text.value
  const atSnap = atUserIds.value.slice()
  const replySnap = replyTarget.value
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
  syncComposerMetrics('')
  queueDraftPersist(0)
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
    text.value = textSnapshot
    atUserIds.value = atSnap
    cursor.value = textSnapshot.length
    syncComposerMetrics(textSnapshot)
    if (replySnap) replyTarget.value = replySnap
    showSendError(e)
  }
}

async function sendStagedImages() {
  stopTypingStatus(true)
  const items = stagedImages.value.slice()
  const paths = items.map((x) => x.localPath)
  const caption = text.value.trim()
  const atIds = caption ? resolveAtUserIds(caption) : undefined
  const base = {}
  if (caption) base.caption = caption
  const snapshot = items
  const textSnapshot = text.value
  const atSnap = atUserIds.value.slice()
  const replySnap = replyTarget.value
  stagedImages.value = []
  text.value = ''
  cursor.value = -1
  atUserIds.value = []
  syncComposerMetrics('')
  queueDraftPersist(0)
  showAt.value = false
  clearReply()
  closeEmojiPanel()
  sendPulse.value = true
  setTimeout(() => { sendPulse.value = false }, 280)
  uni.showLoading({ title: paths.length > 1 ? `上传 ${paths.length} 张…` : '发送中…', mask: true })
  try {
    const ups = await Promise.all(paths.map((p) => api.upload(p)))
    const urls = []
    for (let i = 0; i < ups.length; i++) {
      const up = ups[i]
      if (!up?.url) throw new Error('上传成功但未返回图片地址')
      urls.push(up.url)
      try {
        await cacheLocalAs(up.url, paths[i])
      } catch (e) {}
    }
    if (urls.length > 1) base.images = urls
    const extraJson = replySnap?.msg
      ? buildReplyExtra(replySnap.msg, replySnap.name, base)
      : (Object.keys(base).length ? stringifyExtra(base) : undefined)
    const payload = {
      conversationId: conversationId.value,
      content: urls[0],
      msgType: 2
    }
    if (extraJson) payload.extraJson = extraJson
    if (atIds) payload.atUserIds = atIds
    uni.vibrateShort && uni.vibrateShort({})
    const msg = await api.sendMessage(payload)
    upsertMsg(msg)
    scrollToBottom(true)
  } catch (e) {
    stagedImages.value = snapshot
    text.value = textSnapshot
    cursor.value = textSnapshot.length
    atUserIds.value = atSnap
    syncComposerMetrics(textSnapshot)
    if (replySnap) replyTarget.value = replySnap
    showSendError(e)
  } finally {
    uni.hideLoading()
  }
}

function onTextInput(e) {
  text.value = e.detail.value
  cursor.value = e.detail.cursor ?? text.value.length
  if (text.value.split('\n').length >= INPUT_MAX_LINES) {
    atMaxHeight.value = true
  }
  if (!text.value.trim()) {
    stopTypingStatus(true)
    return
  }
  touchTypingStatus()
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
    syncComposerMetrics(editorText.value)
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
  if (isAiPrivate.value) {
    voiceMode.value = false
    return
  }
  voiceMode.value = !voiceMode.value
  if (voiceMode.value) closeAuxPanels()
}

function initRecorder() {
  if (!uni.getRecorderManager) return
  try {
    recorder = uni.getRecorderManager()
  } catch (e) {
    recorder = null
    return
  }
  recorder.onStop(async (res) => {
    recording.value = false
    const transcript = stopLiveSpeechRecognize()
    if (!voiceWillSend || !res?.tempFilePath) return
    const elapsed = Date.now() - recordStartTime
    if (elapsed < 800) {
      uni.showToast({ title: '说话时间太短', icon: 'none' })
      return
    }
    const duration = Math.max(1, Math.round(elapsed / 1000))
    try {
      await sendVoice(res.tempFilePath, duration, transcript)
    } catch (e) {
      showSendError(e)
    }
  })
  recorder.onError(() => {
    recording.value = false
    voiceWillSend = false
    stopLiveSpeechRecognize()
    uni.showToast({ title: '录音失败', icon: 'none' })
  })
}

/**
 * 仅 H5 可选实时转写；App 端禁止 plus.speech。
 * 原因：RecorderManager 与 plus.speech 同时抢麦克风会导致原生闪退；
 * App 转写交给后端 ASR（VoiceTranscriptService）。
 */
function startLiveSpeechRecognize() {
  liveVoiceTranscript = ''
  // #ifdef H5
  try {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) return
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (ev) => {
      let text = ''
      for (let i = 0; i < ev.results.length; i++) {
        text += (ev.results[i] && ev.results[i][0] && ev.results[i][0].transcript) || ''
      }
      liveVoiceTranscript = String(text || '').trim()
    }
    rec.onerror = () => {}
    rec.start()
    h5SpeechRec = rec
  } catch (e) {}
  // #endif
}

function stopLiveSpeechRecognize() {
  const text = liveVoiceTranscript
  liveVoiceTranscript = ''
  // #ifdef H5
  try {
    if (h5SpeechRec) {
      h5SpeechRec.onresult = null
      h5SpeechRec.stop()
    }
  } catch (e) {}
  // #endif
  h5SpeechRec = null
  return text
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
  if (recording.value) return
  const ok = await ensureRecordAuth()
  if (!ok) return
  closeAuxPanels()
  recordStartY = e.touches?.[0]?.clientY || 0
  recordCancel.value = false
  recording.value = true
  voiceWillSend = true
  recordStartTime = Date.now()
  stopVoicePlayback()
  // App 不做本地实时识别，避免与 RecorderManager 抢麦闪退；转写由后端 ASR 完成
  startLiveSpeechRecognize()
  try {
    recorder.start({ duration: 60000, format: 'mp3' })
  } catch (err) {
    recording.value = false
    voiceWillSend = false
    stopLiveSpeechRecognize()
    uni.showToast({ title: '无法开始录音', icon: 'none' })
    return
  }
  try { uni.vibrateShort && uni.vibrateShort({}) } catch (e) {}
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
  try { recorder && recorder.stop() } catch (e) {}
}

function onVoiceTouchEnd() {
  finishVoiceTouch()
}

function onVoiceTouchCancel() {
  voiceWillSend = false
  if (!recording.value) return
  recording.value = false
  recordCancel.value = false
  stopLiveSpeechRecognize()
  try { recorder && recorder.stop() } catch (e) {}
}

async function sendVoice(filePath, duration, transcript) {
  uni.showLoading({ title: '发送中…', mask: true })
  try {
    const up = await api.upload(filePath)
    const base = { duration }
    const t = transcript != null ? String(transcript).trim() : ''
    if (t) base.transcript = t
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
  return formatVoiceDuration(parseVoiceExtra(m?.extraJson).duration)
}

function voiceTranscriptOf(m) {
  return voiceTranscriptText(m?.extraJson)
}

function stopVoicePlayback() {
  if (!audioCtx) return
  const ctx = audioCtx
  audioCtx = null
  playingId.value = null
  try { ctx.stop() } catch (e) {}
  try { ctx.destroy() } catch (e) {}
}

function togglePlayVoice(m) {
  if (!m || m.msgType !== MSG_VOICE || !m.content) return
  if (playingId.value === m.id) {
    stopVoicePlayback()
    return
  }
  stopVoicePlayback()
  try {
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
  } catch (e) {
    stopVoicePlayback()
    uni.showToast({ title: '播放失败', icon: 'none' })
  }
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
  touchTypingStatus()
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
  insertMention(memberMentionName(mem) || '用户', mem.userId)
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
    const name = memberMentionName(mem) || ''
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
  const remain = STAGE_IMAGE_MAX - stagedImages.value.length
  if (remain <= 0) {
    uni.showToast({ title: `最多选择 ${STAGE_IMAGE_MAX} 张`, icon: 'none' })
    return
  }
  pickImages({ count: remain }).then((res) => {
    const files = res.tempFilePaths || []
    if (!files.length) return
    voiceMode.value = false
    const next = stagedImages.value.slice()
    files.forEach((file) => {
      if (next.length >= STAGE_IMAGE_MAX) return
      stagedImageSeq += 1
      next.push({ id: 's' + stagedImageSeq, localPath: file })
    })
    stagedImages.value = next
  }).catch((e) => {
    if (isPickCancel(e)) return
    uni.showToast({ title: e?.message || '无法选择图片', icon: 'none' })
  })
}

function compactExtra(obj) {
  const out = {}
  Object.keys(obj || {}).forEach((k) => {
    const v = obj[k]
    if (v == null || v === '') return
    out[k] = v
  })
  return out
}

async function sendUploadedAttachment({ path, category, msgType, extra }) {
  uni.showLoading({ title: '发送中…', mask: true })
  try {
    const up = await api.upload(path, { category })
    if (!up?.url) throw new Error('上传成功但未返回文件地址')
    if (msgType === MSG_VIDEO) {
      try { await cacheVideoLocalAs(up.url, path) } catch (e) {}
    }
    const base = compactExtra(extra)
    const extraJson = replyTarget.value?.msg
      ? buildReplyExtra(replyTarget.value.msg, replyTarget.value.name, base)
      : (Object.keys(base).length ? stringifyExtra(base) : undefined)
    const payload = {
      conversationId: conversationId.value,
      content: up.url,
      msgType
    }
    if (extraJson) payload.extraJson = extraJson
    uni.vibrateShort && uni.vibrateShort({})
    const msg = await api.sendMessage(payload)
    clearReply()
    upsertMsg(msg)
    scrollToBottom(true)
  } catch (e) {
    showSendError(e)
  } finally {
    uni.hideLoading()
  }
}

async function pickVideo() {
  closeEmojiPanel()
  try {
    const picked = await pickVideos()
    await sendUploadedAttachment({
      path: picked.path,
      category: 'video',
      msgType: MSG_VIDEO,
      extra: {
        name: picked.name,
        size: picked.size,
        duration: picked.duration,
        width: picked.width,
        height: picked.height
      }
    })
  } catch (e) {
    if (isPickCancel(e)) return
    uni.showToast({ title: e?.message || '无法选择视频', icon: 'none' })
  }
}

function fileNameOf(m) {
  const extra = parseExtra(m?.extraJson)
  const name = extra.name == null ? '' : String(extra.name).trim()
  return name || '文件'
}

function fileSizeOf(m) {
  const extra = parseExtra(m?.extraJson)
  return formatFileSize(extra.size)
}

function videoDurationOf(m) {
  const extra = parseExtra(m?.extraJson)
  const sec = Number(extra.duration)
  if (!Number.isFinite(sec) || sec <= 0) return ''
  return formatVoiceDuration(sec)
}

async function openVideoMsg(m) {
  if (isRecalledMsg(m)) return
  const sourceUrl = m?.content
  if (!sourceUrl || String(sourceUrl).trim() === '消息已撤回') {
    uni.showToast({ title: '视频地址无效', icon: 'none' })
    return
  }
  stopVoicePlayback()
  const remote = fullUrl(sourceUrl)
  const extra = parseExtra(m?.extraJson)
  const title = (extra.name == null ? '' : String(extra.name).trim()) || '视频'
  // 播放远程 URL 时不要同时后台下载同一文件（抢带宽会卡顿）
  abortVideoDownload(sourceUrl)
  abortVideoDownload(remote)
  // 已有本地缓存则播本地，否则直接播远程；打开后不再换 src
  const cached = peekVideoCached(sourceUrl)
  openVideoPlayer({
    src: cached || remote,
    sourceUrl: remote,
    title
  })
}

async function openFileMsg(m) {
  const url = fullUrl(m?.content)
  if (!url) {
    uni.showToast({ title: '文件地址无效', icon: 'none' })
    return
  }
  uni.showLoading({ title: '打开中…', mask: true })
  try {
    const dl = await new Promise((resolve, reject) => {
      uni.downloadFile({ url, success: resolve, fail: reject })
    })
    if (dl.statusCode && dl.statusCode !== 200) throw new Error('下载失败')
    await new Promise((resolve, reject) => {
      uni.openDocument({
        filePath: dl.tempFilePath,
        showMenu: true,
        success: resolve,
        fail: reject
      })
    })
  } catch (e) {
    uni.showToast({ title: e?.message || '无法打开文件', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

function removeStagedImage(idx) {
  const next = stagedImages.value.slice()
  next.splice(idx, 1)
  stagedImages.value = next
}

function clearStagedImages() {
  stagedImages.value = []
}

function imageCaption(m) {
  return m?.__imageCaption || getCaption(m)
}

function imageUrlsOf(m) {
  return Array.isArray(m?.__imageUrls) ? m.__imageUrls : getImageUrls(m)
}

function normalizeMsg(msg) {
  if (!msg || typeof msg !== 'object') return msg
  const imageUrls = getImageUrls(msg)
  const imageCaption = getCaption(msg)
  return {
    ...msg,
    __imageUrls: imageUrls,
    __imageCount: imageUrls.length,
    __imageCaption: imageCaption
  }
}

/** 后端撤回只改 status=2 / content，不改 msgType；UI 必须以 status 为准 */
function isRecalledMsg(m) {
  return !!m && Number(m.status) === 2
}

function mediaPrefetchTargets(msg) {
  if (!msg || isRecalledMsg(msg)) return []
  if (msg.msgType === 2) return imageUrlsOf(msg)
  if (msg.msgType === MSG_EMOJI && msg.content) return [msg.content]
  return []
}

function videoPrefetchTargets(msg) {
  if (!msg || isRecalledMsg(msg) || msg.msgType !== MSG_VIDEO || !msg.content) return []
  return [msg.content]
}

function prefetchMsgMedia(list) {
  const msgs = Array.isArray(list) ? list : (list ? [list] : [])
  prefetchAll(msgs.flatMap((m) => mediaPrefetchTargets(m)))
  // 播放中不要再后台拉视频，避免和播放器抢带宽导致卡顿
  if (feedbackState.videoPlayer.show) return
  prefetchVideos(msgs.flatMap((m) => videoPrefetchTargets(m)))
}

/** 可进入聊天图片/表情包相册的消息 */
function isAlbumMsg(msg) {
  return !!msg && (msg.msgType === 2 || msg.msgType === MSG_EMOJI)
}

/** 相册用 URL：普通图走 images/content，表情包走 content */
function albumUrlsOf(msg) {
  if (!msg) return []
  if (msg.msgType === MSG_EMOJI) {
    const s = msg.content == null ? '' : String(msg.content).trim()
    return s ? [s] : []
  }
  if (msg.msgType === 2) return imageUrlsOf(msg)
  return []
}

/**
 * 从消息列表提取图片/表情包相册项（按消息时间顺序）。
 * 顺序：消息时间/id 升序，同条多图按 images 顺序。
 */
function extractChatImageAlbum(msgList) {
  const sources = []
  const displays = []
  const items = []
  const keys = new Set()
  const list = Array.isArray(msgList) ? msgList : []
  for (const msg of list) {
    if (!isAlbumMsg(msg)) continue
    const urls = albumUrlsOf(msg)
    for (let ii = 0; ii < urls.length; ii++) {
      const src = urls[ii]
      if (!src) continue
      const display = getDisplayUrl(src) || fullUrl(src)
      if (!display) continue
      const key = `${msg.id != null ? msg.id : 'x'}:${ii}:${src}`
      if (keys.has(key)) continue
      keys.add(key)
      sources.push(src)
      displays.push(display)
      items.push({
        messageId: msg.id != null ? msg.id : null,
        msgType: msg.msgType,
        imageIndex: ii,
        sourceUrl: src
      })
    }
  }
  return { sources, displays, keys: Array.from(keys), items }
}

/** 收集当前已加载消息中的全部图片/表情包（按消息时间顺序），供预览左右滑动 */
function collectLoadedChatImages(focusMsg, focusIndex = 0) {
  const { sources, displays, items } = extractChatImageAlbum(messages.value)
  let current = 0
  let found = false

  if (focusMsg && isAlbumMsg(focusMsg)) {
    const list = albumUrlsOf(focusMsg)
    const safeIndex = Math.min(Math.max(0, focusIndex), Math.max(0, list.length - 1))
    const focusSrc = list[safeIndex]
    const focusDisplay = focusSrc ? (getDisplayUrl(focusSrc) || fullUrl(focusSrc)) : ''
    // 优先按「消息引用 + 图序」定位，避免同 URL 多条消息时指错
    let walk = 0
    for (const msg of messages.value) {
      if (!isAlbumMsg(msg)) continue
      const urls = albumUrlsOf(msg)
      for (let ii = 0; ii < urls.length; ii++) {
        const src = urls[ii]
        if (!src) continue
        const display = getDisplayUrl(src) || fullUrl(src)
        if (!display) continue
        if (msg === focusMsg && ii === safeIndex) {
          current = walk
          found = true
          break
        }
        walk++
      }
      if (found) break
    }
    if (!found && focusSrc) {
      const idx = sources.findIndex((u, i) => u === focusSrc || displays[i] === focusDisplay)
      if (idx >= 0) {
        current = idx
        found = true
      } else if (focusDisplay) {
        sources.push(focusSrc)
        displays.push(focusDisplay)
        items.push({
          messageId: focusMsg.id != null ? focusMsg.id : null,
          msgType: focusMsg.msgType,
          imageIndex: safeIndex,
          sourceUrl: focusSrc
        })
        current = sources.length - 1
        found = true
      }
    }
  }

  return { sources, displays, items, current }
}

/**
 * 预览滑到相册头部附近：继续拉历史，把更早图片/表情包插入 urls 头部并校正 current。
 * 连续纯文本页会多翻几页，直到出现图片或没有更早消息。
 */
async function loadEarlierPreviewImages() {
  if (previewEarlierLock) return
  if (!feedbackState.preview.show) return
  if (!hasMoreHistory.value) {
    updatePreviewAlbum({ hasMoreEarlier: false, loadingEarlier: false })
    return
  }
  if (!connected.value) {
    updatePreviewAlbum({ hasMoreEarlier: hasMoreHistory.value, loadingEarlier: false })
    return
  }
  previewEarlierLock = true
  updatePreviewAlbum({ loadingEarlier: true, hasMoreEarlier: true })

  const focusSource = feedbackState.preview.sourceUrls[feedbackState.preview.current] || ''
  const focusDisplay = feedbackState.preview.urls[feedbackState.preview.current] || ''
  let gotImages = 0
  let guard = 0
  const MAX_EMPTY_PAGES = 8

  try {
    while (
      feedbackState.preview.show
      && connected.value
      && hasMoreHistory.value
      && gotImages === 0
      && guard < MAX_EMPTY_PAGES
    ) {
      guard++
      // 等待列表侧 loadMore 释放锁
      let wait = 0
      while ((loadMoreLock || loadingMore.value) && wait < 40) {
        await new Promise((r) => setTimeout(r, 50))
        wait++
      }
      if (!feedbackState.preview.show) break
      const rows = await fetchEarlierHistoryPage()
      if (!rows.length) break
      const album = extractChatImageAlbum(rows)
      gotImages = album.displays.length
    }

    if (!feedbackState.preview.show) return

    const { sources, displays, items } = extractChatImageAlbum(messages.value)
    if (!displays.length) {
      updatePreviewAlbum({
        hasMoreEarlier: hasMoreHistory.value,
        loadingEarlier: false
      })
      return
    }

    // 以加载结束时用户正在看的图为准（加载中可能已左右滑）
    const liveIdx = feedbackState.preview.current
    const liveItem = Array.isArray(feedbackState.preview.items)
      ? feedbackState.preview.items[liveIdx]
      : null
    const liveSource = feedbackState.preview.sourceUrls[liveIdx] || focusSource
    const liveDisplay = feedbackState.preview.urls[liveIdx] || focusDisplay
    let current = liveIdx

    // 优先按消息引用定位，避免同 URL / 加载中滑动导致指错页
    if (liveItem && liveItem.messageId != null) {
      const byMsg = items.findIndex((it) =>
        it
        && Number(it.messageId) === Number(liveItem.messageId)
        && Number(it.imageIndex || 0) === Number(liveItem.imageIndex || 0)
      )
      if (byMsg >= 0) current = byMsg
      else {
        const idx = sources.findIndex((s, i) =>
          (liveSource && s === liveSource) || (liveDisplay && displays[i] === liveDisplay)
        )
        if (idx >= 0) current = idx
      }
    } else {
      const idx = sources.findIndex((s, i) =>
        (liveSource && s === liveSource) || (liveDisplay && displays[i] === liveDisplay)
      )
      if (idx >= 0) current = idx
      else {
        const fb = sources.findIndex((s, i) =>
          (focusSource && s === focusSource) || (focusDisplay && displays[i] === focusDisplay)
        )
        if (fb >= 0) current = fb
      }
    }

    updatePreviewAlbum({
      urls: displays,
      sourceUrls: sources,
      items,
      current,
      hasMoreEarlier: hasMoreHistory.value,
      loadingEarlier: false
    })

    // 本轮成功扩到了更早图片，且仍靠近头部：稍后再填缓冲，避开 swiper 同步/快滑窗口
    if (gotImages > 0 && current <= 1 && hasMoreHistory.value) {
      setTimeout(() => {
        if (feedbackState.preview.show && feedbackState.preview.current <= 1 && connected.value) {
          loadEarlierPreviewImages()
        }
      }, 480)
    }
  } catch (e) {
    updatePreviewAlbum({ loadingEarlier: false, hasMoreEarlier: hasMoreHistory.value })
    uni.showToast({ title: e?.message || '加载更多图片失败', icon: 'none' })
  } finally {
    previewEarlierLock = false
  }
}

/** 预览长按「转发」：关闭预览后走现有转发选会话流程 */
function onPreviewForward(item) {
  closePreview()
  let msg = null
  if (item?.messageId != null) {
    msg = messages.value.find((m) => Number(m.id) === Number(item.messageId)) || null
  }
  if (!msg && item?.sourceUrl) {
    msg = {
      id: item.messageId,
      content: item.sourceUrl,
      msgType: item.msgType === MSG_EMOJI ? MSG_EMOJI : 2
    }
  }
  if (!msg) {
    uni.showToast({ title: '无法转发', icon: 'none' })
    return
  }
  nextTick(() => openForward(msg))
}

function previewImages(m, index = 0) {
  const { sources, displays, items, current } = collectLoadedChatImages(m, index)
  if (!displays.length) {
    uni.showToast({ title: '图片地址无效', icon: 'none' })
    return
  }
  setPreviewReachEarlierHandler(loadEarlierPreviewImages)
  uni.previewImage({
    urls: displays,
    current,
    sourceUrls: sources,
    items,
    hasMoreEarlier: hasMoreHistory.value,
    onReachEarlier: loadEarlierPreviewImages,
    onForward: onPreviewForward
  })
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
  menuStickerUrl.value = null
}

/**
 * 长按菜单展开期间，任何未在弹窗内部被拦截（.stop）的触摸都会冒泡到页面根节点。
 * 这里统一收口：无论是点击还是滑动的起始触摸，只要落在弹窗以外，一律关闭菜单，
 * 并且不调用 preventDefault/stopPropagation，底层元素（消息列表、导航栏等）
 * 仍会正常收到这次触摸，从而自然衔接后续的滑动或点击行为。
 */
function onOutsideMenuTouch() {
  if (menuMsg.value) closeMsgMenu()
}

const menuActions = computed(() => {
  const m = menuMsg.value
  if (!m) return []
  const list = [
    { key: 'copy', label: '复制', icon: '⎘' },
    { key: 'quote', label: '引用', icon: '❝' },
    { key: 'delete', label: '删除', icon: '⌫', danger: true }
  ]
  if (m.msgType !== MSG_FILE) {
    list.splice(1, 0, { key: 'forward', label: '转发', icon: '↗' })
  }
  // 图片 / 表情包消息：可加入我的表情包
  const canAddSticker = m.msgType === MSG_EMOJI
    ? !!m.content
    : m.msgType === 2 && imageUrlsOf(m).length > 0
  if (canAddSticker) {
    const quoteIdx = list.findIndex(a => a.key === 'quote')
    list.splice(quoteIdx >= 0 ? quoteIdx : list.length, 0, { key: 'addSticker', label: '添加表情', icon: '☆' })
  }
  if (m.mine && m.id && m.msgType !== 4 && !isRecalledMsg(m)) {
    const delIdx = list.findIndex(a => a.key === 'delete')
    list.splice(delIdx >= 0 ? delIdx : list.length, 0, { key: 'recall', label: '撤回', icon: '↶' })
  }
  return list
})

function pickTouchPoint(e) {
  const t = e?.changedTouches?.[0] || e?.touches?.[0] || null
  if (!t) return null
  const x = t.clientX ?? t.pageX
  const y = t.clientY ?? t.pageY
  if (x == null || y == null) return null
  return { x: Number(x), y: Number(y) }
}

function clearBubbleLongPressTimer() {
  if (!bubbleLongPressTimer) return
  clearTimeout(bubbleLongPressTimer)
  bubbleLongPressTimer = null
}

function cancelBubbleLongPress(markMoved = false) {
  clearBubbleLongPressTimer()
  if (markMoved) bubblePressState.moved = true
  bubblePressState.active = false
  bubblePressState.msg = null
}

function onBubbleTouchStart(m, e) {
  const p = pickTouchPoint(e)
  if (p) lastBubbleTouch.value = p
  if (!m || m.msgType === 4 || isRecalledMsg(m) || m.streaming) return
  clearBubbleLongPressTimer()
  bubblePressState.active = true
  bubblePressState.moved = false
  bubblePressState.fired = false
  bubblePressState.msg = m
  bubblePressState.startX = p?.x ?? 0
  bubblePressState.startY = p?.y ?? 0
  bubbleLongPressTimer = setTimeout(() => {
    if (!bubblePressState.active || bubblePressState.moved || bubblePressState.fired || !bubblePressState.msg) {
      return
    }
    bubblePressState.fired = true
    bubblePressState.active = false
    const target = bubblePressState.msg
    bubblePressState.msg = null
    onMsgLong(target, e)
  }, LONG_PRESS_DELAY_MS)
}

function onBubbleTouchMove(e) {
  if (!bubblePressState.active) return
  const p = pickTouchPoint(e)
  if (p) lastBubbleTouch.value = p
  const dx = Math.abs((p?.x ?? bubblePressState.startX) - bubblePressState.startX)
  const dy = Math.abs((p?.y ?? bubblePressState.startY) - bubblePressState.startY)
  if (dx >= LONG_PRESS_MOVE_PX || dy >= LONG_PRESS_MOVE_PX) {
    cancelBubbleLongPress(true)
  }
}

function onBubbleTouchEnd() {
  cancelBubbleLongPress(false)
}

function onBubbleTouchCancel() {
  cancelBubbleLongPress(true)
}

function rectContains(rect, x, y) {
  if (!rect) return false
  const left = rect.left ?? 0
  const top = rect.top ?? 0
  const right = rect.right != null ? rect.right : left + (rect.width || 0)
  const bottom = rect.bottom != null ? rect.bottom : top + (rect.height || 0)
  return x >= left && x <= right && y >= top && y <= bottom
}

function resolveLongPressStickerUrl(m, point, imgRects) {
  if (!m) return null
  if (m.msgType === MSG_EMOJI) return m.content || null
  if (m.msgType !== 2) return null
  const urls = imageUrlsOf(m)
  if (!urls.length) return m.content || null
  if (point && Array.isArray(imgRects) && imgRects.length) {
    for (let i = 0; i < imgRects.length; i++) {
      if (rectContains(imgRects[i], point.x, point.y)) {
        return urls[i] || urls[0] || m.content || null
      }
    }
  }
  return urls[0] || m.content || null
}

function onMsgLong(m, e) {
  if (!m || m.msgType === 4 || isRecalledMsg(m) || m.streaming) return
  closeAuxPanels()
  const touch = pickTouchPoint(e) || lastBubbleTouch.value || null
  const urls = m.msgType === 2 ? imageUrlsOf(m) : []
  const proxy = instance?.proxy
  const q = uni.createSelectorQuery()
  if (proxy) q.in(proxy)
  q.select('#m-' + m.id).boundingClientRect()
  urls.forEach((_, ii) => {
    q.select('#mi-' + m.id + '-' + ii).boundingClientRect()
  })
  q.exec((res) => {
    const rect = res && res[0]
    if (!rect) return
    const imgRects = urls.length ? (res.slice(1, 1 + urls.length) || []) : []
    menuStickerUrl.value = resolveLongPressStickerUrl(m, touch, imgRects)
    menuAnchor.value = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }
    menuMsg.value = m
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (err) {}
  })
}

function onMenuAction(key) {
  const m = menuMsg.value
  const stickerUrl = menuStickerUrl.value
  closeMsgMenu()
  if (!m) return
  if (key === 'copy') copyMessage(m)
  else if (key === 'forward') openForward(m)
  else if (key === 'quote') quoteMessage(m)
  else if (key === 'addSticker') addMessageAsSticker(m, stickerUrl)
  else if (key === 'delete') deleteMessage(m)
  else if (key === 'recall') recallMessage(m)
}

async function addMessageAsSticker(m, preferredUrl) {
  const urls = m?.msgType === 2 ? imageUrlsOf(m) : []
  const url = preferredUrl
    || (m?.msgType === MSG_EMOJI ? m.content : null)
    || urls[0]
    || m?.content
  if (!url || (m.msgType !== 2 && m.msgType !== MSG_EMOJI)) {
    uni.showToast({ title: '仅支持图片消息', icon: 'none' })
    return
  }
  try {
    uni.showLoading({ title: '添加中', mask: true })
    await api.addSticker({ url })
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
  messages.value[idx] = normalizeMsg({ ...messages.value[idx], extraJson })
  scheduleCacheMessages(conversationId.value, messages.value)
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
    const cap = imageCaption(m)
    const urls = imageUrlsOf(m).map((u) => fullUrl(u)).filter(Boolean)
    const linkBlock = urls.join('\n')
    const data = cap ? (cap + '\n' + linkBlock) : linkBlock
    uni.setClipboardData({
      data,
      success: () => uni.showToast({ title: cap ? '已复制' : '图片链接已复制', icon: 'none' })
    })
    return
  }
  if (m.msgType === MSG_VOICE) {
    uni.showToast({ title: '语音消息无法复制', icon: 'none' })
    return
  }
  if (m.msgType === MSG_FILE) {
    uni.showToast({ title: '文件消息无法复制', icon: 'none' })
    return
  }
  if (m.msgType === MSG_VIDEO) {
    const url = fullUrl(m.content) || ''
    const name = fileNameOf(m)
    const data = name ? (name + '\n' + url) : url
    if (!data.trim()) {
      uni.showToast({ title: '无内容可复制', icon: 'none' })
      return
    }
    uni.setClipboardData({
      data,
      success: () => uni.showToast({ title: '已复制', icon: 'none' })
    })
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
      scheduleCacheMessages(conversationId.value, messages.value)
    }
  })
}

async function openForward(m) {
  if (m?.msgType === MSG_FILE) {
    uni.showToast({ title: '不支持转发文件消息', icon: 'none' })
    return
  }
  forwardSource.value = m
  showForward.value = true
  try {
    const list = await api.conversations()
    // 包含当前会话，允许转发回本聊天
    forwardList.value = list || []
    store.setConversations(list || [])
  } catch (e) {
    forwardList.value = store.state.conversations || []
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
    const ve = parseVoiceExtra(m.extraJson)
    const base = { duration: ve.duration }
    if (ve.transcript) base.transcript = ve.transcript
    payload.extraJson = stringifyExtra(base)
  } else if (m.msgType === 2) {
    const base = {}
    const cap = imageCaption(m)
    const urls = imageUrlsOf(m)
    if (cap) base.caption = cap
    if (urls.length > 1) base.images = urls
    if (Object.keys(base).length) payload.extraJson = stringifyExtra(base)
  } else if (m.msgType === MSG_VIDEO) {
    const extra = parseExtra(m.extraJson)
    const base = compactExtra({
      name: extra.name,
      size: extra.size,
      mime: extra.mime,
      duration: extra.duration,
      width: extra.width,
      height: extra.height
    })
    if (Object.keys(base).length) payload.extraJson = stringifyExtra(base)
  }
  try {
    uni.showLoading({ title: '转发中', mask: true })
    const sent = await api.sendMessage(payload)
    uni.hideLoading()
    closeForward()
    // 转发回本聊天：本地立刻插入，避免仅依赖 WS 回声
    if (Number(conv.id) === Number(conversationId.value) && sent) {
      upsertMsg(sent)
      scrollToBottom(true)
    }
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
  openMorePanel(true)
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
.chat-root {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
}
.chat-page {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  will-change: transform;
  transform: translateZ(0);
}
.chat-more-layer {
  position: absolute;
  inset: 0;
  z-index: 300;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  will-change: transform;
  background: #0A0614;
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
  /* 输入区已在文档流底部，无需再为 fixed 输入栏预留大块 padding */
  padding-bottom: 28rpx;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}
.history-end {
  text-align: center;
  font-size: 22rpx;
  color: $pc-muted;
  padding: 8rpx 0 20rpx;
  opacity: 0.85;
}
.bottom-anchor { height: 1px; width: 100%; }
.typing-bar {
  flex-shrink: 0;
  padding: 0 28rpx 8rpx;
}
.typing {
  display: inline-block;
  color: $pc-muted;
  font-size: 22rpx;
  line-height: 1.4;
}
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
.bubble.recalled {
  opacity: 0.78;
}
.recall-txt {
  color: $pc-muted;
  font-style: italic;
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
.img-album {
  display: block;
  max-width: 360rpx;
}
.img-album.multi {
  display: flex;
  flex-wrap: wrap;
  gap: 6rpx;
  width: 360rpx;
}
.img-album.multi .img.cell {
  width: calc(50% - 3rpx);
  height: 176rpx;
  min-height: 0;
  border-radius: 10rpx;
}
.img-album.multi.count-3 .img.cell:first-child,
.img-album.multi.count-1 .img.cell {
  width: 100%;
  height: 220rpx;
}
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
.bubble.media,
.bubble.file {
  padding: 8rpx;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.mine .bubble.sticker,
.mine .bubble.media,
.mine .bubble.file {
  background: transparent;
  border-color: transparent;
}
.bubble.img-with-caption {
  padding: 8rpx 8rpx 16rpx;
}
.img-caption {
  display: block;
  margin-top: 12rpx;
  padding: 0 12rpx;
}
.video-card {
  width: 420rpx;
  max-width: 100%;
  border-radius: $pc-radius-md;
  overflow: hidden;
  background: rgba(28, 16, 48, 0.72);
  border: 1px solid rgba(167, 139, 250, 0.2);
}
.video-card__cover {
  position: relative;
  width: 100%;
  height: 280rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 35% 30%, rgba(124, 58, 237, 0.35) 0%, transparent 55%),
    radial-gradient(ellipse at 70% 75%, rgba(244, 63, 94, 0.22) 0%, transparent 50%),
    linear-gradient(160deg, rgba(20, 12, 36, 0.95), rgba(40, 18, 64, 0.9));
}
.video-card__play {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(124, 58, 237, 0.42);
  border: 2rpx solid rgba(196, 181, 253, 0.55);
  box-shadow: 0 8rpx 24rpx rgba(10, 6, 20, 0.35);
}
.video-card__play-tri {
  width: 0;
  height: 0;
  margin-left: 6rpx;
  border-top: 14rpx solid transparent;
  border-bottom: 14rpx solid transparent;
  border-left: 22rpx solid #F5EDFF;
}
.video-card__dur {
  position: absolute;
  right: 14rpx;
  bottom: 12rpx;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: rgba(245, 237, 255, 0.9);
  background: rgba(10, 6, 20, 0.55);
}
.file-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 280rpx;
  max-width: 420rpx;
  padding: 16rpx 18rpx;
  border-radius: $pc-radius-md;
  background: rgba(28, 16, 48, 0.72);
  border: 1px solid rgba(167, 139, 250, 0.22);
}
.mine .file-card {
  background: rgba(124, 58, 237, 0.28);
  border-color: rgba(167, 139, 250, 0.32);
}
.file-ico {
  position: relative;
  width: 44rpx;
  height: 40rpx;
  flex-shrink: 0;
}
.file-ico__tab {
  position: absolute;
  left: 2rpx;
  top: 2rpx;
  width: 16rpx;
  height: 10rpx;
  border: 2.5rpx solid rgba(196, 181, 253, 0.85);
  border-bottom: none;
  border-radius: 6rpx 6rpx 0 0;
  background: transparent;
  box-sizing: border-box;
}
.file-ico__body {
  position: absolute;
  left: 2rpx;
  top: 10rpx;
  width: 40rpx;
  height: 28rpx;
  border: 2.5rpx solid rgba(196, 181, 253, 0.85);
  border-radius: 0 8rpx 8rpx 8rpx;
  background: transparent;
  box-sizing: border-box;
}
.file-meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.file-name {
  font-size: 26rpx;
  line-height: 1.35;
  color: $pc-text;
  word-break: break-all;
}
.file-size {
  font-size: 22rpx;
  color: $pc-muted;
}
.mine .file-size { color: rgba(245, 237, 255, 0.72); }
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
  /* 文档流底部 + softinputMode:adjustResize，随视口收缩贴在键盘上方，避免再手动 bottom 造成双倍上移 */
  position: relative;
  flex-shrink: 0;
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
.stage-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 14rpx;
  border-radius: 14rpx;
  background: rgba(167, 139, 250, 0.1);
  border: 1px solid rgba(167, 139, 250, 0.22);
}
.stage-bar__scroll {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}
.stage-bar__list {
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  padding: 2rpx 0;
}
.stage-bar__item {
  position: relative;
  width: 96rpx;
  height: 96rpx;
  flex-shrink: 0;
}
.stage-bar__thumb {
  width: 96rpx;
  height: 96rpx;
  border-radius: 12rpx;
  background: rgba(28, 16, 48, 0.55);
}
.stage-bar__remove {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: rgba(28, 16, 48, 0.85);
  color: #fff;
  font-size: 28rpx;
  line-height: 36rpx;
  text-align: center;
}
.stage-bar__add {
  width: 96rpx;
  height: 96rpx;
  border-radius: 12rpx;
  border: 1px dashed rgba(167, 139, 250, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(28, 16, 48, 0.28);
}
.stage-bar__add-icon {
  color: $pc-purple;
  font-size: 40rpx;
  line-height: 1;
}
.stage-bar__clear {
  flex-shrink: 0;
  color: $pc-muted;
  font-size: 24rpx;
  padding: 8rpx 4rpx;
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
  flex-wrap: wrap;
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
.ico-video__frame {
  position: absolute;
  left: 2rpx;
  top: 6rpx;
  width: 30rpx;
  height: 22rpx;
  border-radius: 6rpx;
  border: 2.5rpx solid $tool-ico-idle;
  background: transparent;
  transition: border-color 0.2s ease;
}
.ico-video__play {
  position: absolute;
  left: 14rpx;
  top: 11rpx;
  width: 0;
  height: 0;
  border-top: 6rpx solid transparent;
  border-bottom: 6rpx solid transparent;
  border-left: 9rpx solid $tool-ico-idle;
  transition: border-left-color 0.2s ease;
}
.ico-heart__l,
.ico-heart__r {
  position: absolute;
  top: 7rpx;
  width: 13rpx;
  height: 13rpx;
  border-radius: 50%;
  background: $tool-ico-idle;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.ico-heart__l { left: 5rpx; }
.ico-heart__r { left: 14rpx; }
.ico-heart__tip {
  position: absolute;
  left: 9.5rpx;
  top: 12rpx;
  width: 13rpx;
  height: 13rpx;
  background: $tool-ico-idle;
  transform: rotate(45deg);
  border-radius: 2rpx;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.tool:active .ico-mic__head,
.tool:active .ico-mic__arc { border-color: $tool-ico-lit; }
.tool:active .ico-mic__stand,
.tool:active .ico-img__sun,
.tool:active .ico-heart__l,
.tool:active .ico-heart__r,
.tool:active .ico-heart__tip { background: $tool-ico-lit; }
.tool:active .ico-img__frame,
.tool:active .ico-video__frame { border-color: $tool-ico-lit; }
.tool:active .ico-img__hill { border-bottom-color: $tool-ico-lit; }
.tool:active .ico-video__play { border-left-color: $tool-ico-lit; }
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
.tool.active .ico-heart__l,
.tool.active .ico-heart__r,
.tool.active .ico-heart__tip {
  background: $pc-rose;
  box-shadow: 0 0 8rpx rgba(244, 63, 94, 0.35);
}
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
.voice-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8rpx;
  max-width: 420rpx;
}
.voice-transcript {
  font-size: 24rpx;
  line-height: 1.45;
  color: $pc-muted;
  padding: 0 8rpx;
  word-break: break-word;
}
.mine .voice-transcript {
  color: rgba(245, 237, 255, 0.78);
  text-align: right;
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
