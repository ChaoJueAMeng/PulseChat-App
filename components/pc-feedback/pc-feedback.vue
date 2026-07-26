<template>
  <!-- Toast -->
  <view
    v-if="isHost && state.toast.show"
    class="pc-toast-wrap"
    :class="'pos-' + (state.toast.position || 'center')"
    @touchmove.stop.prevent
  >
    <view
      class="pc-toast pc-card"
      :class="['icon-' + state.toast.icon, { compact: state.toast.icon === 'none' }]"
    >
      <view v-if="state.toast.icon === 'success'" class="pc-toast-icon success">
        <view class="tick" />
      </view>
      <view v-else-if="state.toast.icon === 'error'" class="pc-toast-icon error">
        <text>!</text>
      </view>
      <view v-else-if="state.toast.icon === 'loading'" class="pc-toast-icon loading">
        <view class="spinner" />
      </view>
      <text class="pc-toast-text">{{ state.toast.title }}</text>
    </view>
  </view>

  <!-- Loading -->
  <view
    v-if="isHost && state.loading.show"
    class="pc-loading-mask"
    :class="{ dim: state.loading.mask }"
    @touchmove.stop.prevent
  >
    <view class="pc-loading-box pc-card">
      <view class="pc-loading-spinner" />
      <text class="pc-loading-text">{{ state.loading.title }}</text>
    </view>
  </view>

  <!-- Modal：遮罩与卡片拆开，避免 App 端父级 tap/touchmove 挡住原生 input -->
  <view v-if="isHost && state.modal.show" class="pc-modal-root">
    <view
      class="pc-modal-mask"
      :class="{ plain: state.modal.editable }"
      @touchmove.stop.prevent
      @tap="onModalMask"
    ></view>
    <view class="pc-modal pc-card" :class="{ editable: state.modal.editable }">
      <text v-if="state.modal.title" class="pc-modal-title">{{ state.modal.title }}</text>
      <text v-if="state.modal.content" class="pc-modal-content">{{ state.modal.content }}</text>
      <view v-if="state.modal.editable" class="pc-modal-field">
        <input
          class="pc-modal-input"
          type="text"
          maxlength="64"
          confirm-type="done"
          :focus="modalFocus"
          :adjust-position="true"
          :cursor-spacing="40"
          :placeholder="state.modal.placeholderText"
          placeholder-class="pc-modal-ph"
          :value="modalInput"
          @input="onModalInput"
          @confirm="onModalConfirm"
        />
      </view>
      <view class="pc-modal-actions">
        <view
          v-if="state.modal.showCancel"
          class="pc-modal-btn cancel pc-press"
          @tap="onModalCancel"
        >
          <text>{{ state.modal.cancelText }}</text>
        </view>
        <view
          class="pc-modal-btn confirm pc-press"
          :class="{ danger: isDangerConfirm }"
          :style="confirmStyle"
          @tap="onModalConfirm"
        >
          <text>{{ state.modal.confirmText }}</text>
        </view>
      </view>
    </view>
  </view>

  <!-- Image Preview -->
  <view
    v-if="isHost && state.preview.show"
    class="pc-preview"
    @touchmove.stop.prevent
  >
    <swiper
      class="pc-preview-swiper"
      :current="state.preview.current"
      @change="onPreviewChange"
      @tap="onPreviewClose"
    >
      <swiper-item v-for="(url, idx) in state.preview.urls" :key="idx">
        <view class="pc-preview-slide">
          <image
            class="pc-preview-img"
            :src="url"
            mode="aspectFit"
            @tap.stop="onPreviewClose"
            @longpress.stop="onPreviewLongPress"
          />
        </view>
      </swiper-item>
    </swiper>
    <view v-if="state.preview.urls.length > 1" class="pc-preview-indicator">
      <text>{{ state.preview.current + 1 }} / {{ state.preview.urls.length }}</text>
    </view>
    <view class="pc-preview-hint">
      <text>长按保存图像</text>
    </view>
  </view>

  <!-- ActionSheet -->
  <view v-if="isHost && state.sheet.show" class="pc-sheet-mask" @touchmove.stop.prevent @tap="onSheetCancel">
    <view class="pc-sheet" @tap.stop>
      <view v-if="state.sheet.title" class="pc-sheet-head">
        <text class="pc-sheet-title">{{ state.sheet.title }}</text>
      </view>
      <view class="pc-sheet-group">
        <view
          v-for="(label, index) in state.sheet.itemList"
          :key="index"
          class="pc-sheet-item pc-press"
          :class="{ last: index === state.sheet.itemList.length - 1 }"
          :style="sheetItemStyle"
          @tap="onSheetSelect(index)"
        >
          <text>{{ label }}</text>
        </view>
      </view>
      <view class="pc-sheet-cancel pc-press" @tap="onSheetCancel">
        <text>取消</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  feedbackState,
  acquireFeedbackHost,
  isActiveFeedbackHost,
  resolveModal,
  resolveActionSheet,
  closePreview,
  setPreviewCurrent,
  showActionSheet,
  toast,
  showLoading,
  hideLoading
} from '../../utils/feedback.js'

const state = feedbackState
const hostId = ref(0)
const isHost = computed(() => isActiveFeedbackHost(hostId.value))
const modalInput = ref('')
const modalFocus = ref(false)
let saving = false
let focusTimer = null

function claimHost() {
  hostId.value = acquireFeedbackHost()
}

claimHost()
onShow(() => {
  claimHost()
})

watch(
  () => [state.modal.show, state.modal.editable, isHost.value],
  ([show, editable, host]) => {
    if (focusTimer) {
      clearTimeout(focusTimer)
      focusTimer = null
    }
    modalFocus.value = false
    if (show && host) {
      modalInput.value = state.modal.editableValue || ''
      if (editable) {
        // 延后聚焦，等弹层挂载完成（App 端立刻 focus 常无效）
        focusTimer = setTimeout(() => {
          if (isActiveFeedbackHost(hostId.value)) modalFocus.value = true
          focusTimer = null
        }, 200)
      }
    }
  }
)

function onModalInput(e) {
  modalInput.value = e.detail?.value ?? e.target?.value ?? ''
}

const isDangerConfirm = computed(() => {
  const c = (state.modal.confirmColor || '').toLowerCase().replace(/\s/g, '')
  const dangerColors = ['#f43f5e', '#e11d48', '#ef4444', '#dc2626', '#be123c', '#fb7185']
  return dangerColors.includes(c) || state.modal.confirmText === '删除'
})

const confirmStyle = computed(() => {
  if (state.modal.confirmColor && !isDangerConfirm.value) {
    return { color: state.modal.confirmColor }
  }
  return {}
})

const sheetItemStyle = computed(() => {
  if (state.sheet.itemColor) return { color: state.sheet.itemColor }
  return {}
})

function onModalMask() {
  // 点击遮罩不关闭，与原生 modal 行为接近
}

function onModalCancel() {
  modalFocus.value = false
  resolveModal({ confirm: false, cancel: true, content: modalInput.value })
}

function onModalConfirm() {
  modalFocus.value = false
  resolveModal({ confirm: true, cancel: false, content: modalInput.value })
}

function onSheetSelect(index) {
  resolveActionSheet(index)
}

function onSheetCancel() {
  resolveActionSheet(-1)
}

function onPreviewChange(e) {
  setPreviewCurrent(e.detail?.current ?? 0)
}

function onPreviewClose() {
  if (state.sheet.show) return
  closePreview()
}

function onPreviewLongPress() {
  if (saving) return
  showActionSheet({
    itemList: ['保存图像'],
    success: (res) => {
      if (res.tapIndex === 0) saveCurrentImage()
    }
  })
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url,
      success: (r) => {
        if (r.statusCode === 200 && r.tempFilePath) resolve(r.tempFilePath)
        else reject(new Error('download fail'))
      },
      fail: reject
    })
  })
}

function saveToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    uni.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: reject
    })
  })
}

async function saveCurrentImage() {
  if (saving) return
  const url = state.preview.urls[state.preview.current]
  if (!url) {
    toast({ title: '图片无效', icon: 'none' })
    return
  }

  saving = true
  showLoading({ title: '保存中…', mask: true })
  try {
    let filePath = url
    if (/^https?:\/\//i.test(url)) {
      filePath = await downloadFile(url)
    }
    await saveToAlbum(filePath)
    hideLoading()
    toast({ title: '已保存到相册', icon: 'success' })
  } catch (e) {
    hideLoading()
    // #ifdef APP-PLUS
    try {
      const granted = await new Promise((resolve) => {
        plus.android.requestPermissions(
          ['android.permission.WRITE_EXTERNAL_STORAGE'],
          (res) => resolve(!!(res?.granted && res.granted.length)),
          () => resolve(false)
        )
      })
      if (granted) {
        try {
          let filePath = url
          if (/^https?:\/\//i.test(url)) filePath = await downloadFile(url)
          await saveToAlbum(filePath)
          toast({ title: '已保存到相册', icon: 'success' })
          saving = false
          return
        } catch (err) {}
      }
    } catch (err) {}
    // #endif
    toast({ title: '保存失败，请检查相册权限', icon: 'none' })
  } finally {
    saving = false
  }
}
</script>

<style scoped lang="scss">
.pc-toast-wrap {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 12000;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  box-sizing: border-box;
}

.pc-toast-wrap.pos-bottom {
  align-items: flex-end;
  padding-bottom: calc(180rpx + env(safe-area-inset-bottom));
}

.pc-toast-wrap.pos-top {
  align-items: flex-start;
  padding-top: calc(160rpx + env(safe-area-inset-top));
}

.pc-toast {
  max-width: 78%;
  min-width: 180rpx;
  padding: 28rpx 36rpx;
  border-radius: $pc-radius-lg;
  background:
    linear-gradient(160deg, rgba(124, 58, 237, 0.28) 0%, transparent 48%),
    linear-gradient(200deg, rgba(232, 121, 249, 0.12) 0%, transparent 42%),
    rgba(20, 10, 34, 0.94);
  border: 1px solid rgba(232, 121, 249, 0.32);
  box-shadow:
    0 16rpx 48rpx rgba(10, 6, 20, 0.55),
    0 0 36rpx rgba(124, 58, 237, 0.22);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  animation: pc-bubble-in 0.22s ease both;
  pointer-events: none;
}

.pc-toast.compact {
  flex-direction: row;
  padding: 22rpx 40rpx;
  border-radius: 999rpx;
  min-width: 0;
  background:
    linear-gradient(105deg, rgba(74, 29, 107, 0.92) 0%, rgba(122, 31, 76, 0.9) 100%),
    rgba(20, 10, 34, 0.96);
  border-color: rgba(232, 121, 249, 0.36);
  box-shadow:
    0 12rpx 36rpx rgba(10, 6, 20, 0.5),
    0 0 28rpx rgba(232, 121, 249, 0.2);
}

.pc-toast-text {
  color: $pc-text;
  font-size: 28rpx;
  line-height: 1.45;
  text-align: center;
  word-break: break-word;
}

.pc-toast.compact .pc-toast-text {
  font-size: 26rpx;
  letter-spacing: 0.5rpx;
}

.pc-toast-icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 700;
}

.pc-toast-icon.success {
  background: rgba(167, 139, 250, 0.18);
  border: 2rpx solid rgba(167, 139, 250, 0.55);
}
.pc-toast-icon.success .tick {
  width: 18rpx;
  height: 30rpx;
  border-right: 4rpx solid $pc-purple;
  border-bottom: 4rpx solid $pc-purple;
  transform: rotate(45deg) translate(-2rpx, -4rpx);
}

.pc-toast-icon.error {
  background: rgba(244, 63, 94, 0.16);
  border: 2rpx solid rgba(244, 63, 94, 0.5);
  color: $pc-red;
}

.pc-toast-icon.loading .spinner {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(167, 139, 250, 0.2);
  border-top-color: $pc-magenta;
  border-right-color: $pc-purple;
  animation: pc-spin 0.75s linear infinite;
}

.pc-loading-mask {
  position: fixed;
  inset: 0;
  z-index: 11900;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pc-loading-mask.dim {
  background: rgba(10, 6, 20, 0.45);
  backdrop-filter: blur(2px);
}

.pc-loading-box {
  min-width: 200rpx;
  padding: 36rpx 40rpx;
  border-radius: $pc-radius-lg;
  background:
    linear-gradient(160deg, rgba(124, 58, 237, 0.2) 0%, transparent 50%),
    rgba(20, 10, 34, 0.96);
  border: 1px solid rgba(167, 139, 250, 0.28);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  box-shadow: 0 16rpx 48rpx rgba(10, 6, 20, 0.5);
  animation: pc-bubble-in 0.2s ease both;
}

.pc-loading-spinner {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  border: 5rpx solid rgba(167, 139, 250, 0.18);
  border-top-color: $pc-magenta;
  border-right-color: $pc-purple;
  animation: pc-spin 0.75s linear infinite;
  box-shadow: 0 0 20rpx rgba(167, 139, 250, 0.25);
}

.pc-loading-text {
  color: $pc-text;
  font-size: 26rpx;
}

.pc-modal-root {
  position: fixed;
  inset: 0;
  z-index: 11800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  box-sizing: border-box;
}

.pc-modal-mask {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: rgba(10, 6, 20, 0.72);
  backdrop-filter: blur(6px);
}

/* 可编辑态去掉 blur，避免 App 端原生 input 点击失效 */
.pc-modal-mask.plain {
  backdrop-filter: none;
}

.pc-modal {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 620rpx;
  border-radius: $pc-radius-xl;
  padding: 40rpx 32rpx 28rpx;
  background:
    linear-gradient(180deg, rgba(124, 58, 237, 0.16) 0%, transparent 36%),
    rgba(20, 10, 34, 0.97);
  border: 1px solid rgba(167, 139, 250, 0.28);
  box-shadow:
    0 24rpx 64rpx rgba(10, 6, 20, 0.55),
    0 0 40rpx rgba(124, 58, 237, 0.16);
}

.pc-modal:not(.editable) {
  animation: pc-bubble-in 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pc-modal-title {
  display: block;
  text-align: center;
  color: $pc-text;
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
}

.pc-modal-content {
  display: block;
  text-align: center;
  color: $pc-muted;
  font-size: 26rpx;
  line-height: 1.55;
  padding: 0 8rpx 8rpx;
  white-space: pre-wrap;
  word-break: break-word;
}

.pc-modal-field {
  margin-top: 20rpx;
  width: 100%;
  border-radius: $pc-radius-md;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(167, 139, 250, 0.28);
  overflow: hidden;
}

.pc-modal-input {
  display: block;
  width: 100%;
  height: 112rpx;
  min-height: 112rpx;
  line-height: 112rpx;
  padding: 0 28rpx;
  box-sizing: border-box;
  color: $pc-text;
  font-size: 32rpx;
  font-weight: 600;
  background: transparent;
}

.pc-modal-ph {
  color: #6B5C7A;
  font-weight: 400;
}

.pc-modal-actions {
  margin-top: 32rpx;
  display: flex;
  gap: 16rpx;
}

.pc-modal-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
}

.pc-modal-btn.cancel {
  color: $pc-muted;
  background: rgba(167, 139, 250, 0.1);
  border: 1px solid rgba(167, 139, 250, 0.16);
}

.pc-modal-btn.confirm {
  color: #fff;
  background: linear-gradient(120deg, #7C3AED 0%, #A78BFA 45%, #E879F9 100%);
  box-shadow: 0 8rpx 24rpx rgba(124, 58, 237, 0.35);
}

.pc-modal-btn.confirm.danger {
  background: linear-gradient(120deg, #BE123C 0%, #F43F5E 55%, #FB7185 100%);
  box-shadow: 0 8rpx 24rpx rgba(244, 63, 94, 0.32);
}

/* 图片预览 */
.pc-preview {
  position: fixed;
  inset: 0;
  z-index: 11600;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(122, 31, 76, 0.35) 0%, transparent 55%),
    radial-gradient(ellipse at 80% 80%, rgba(124, 58, 237, 0.22) 0%, transparent 45%),
    rgba(6, 3, 12, 0.97);
  animation: pc-fade-up 0.2s ease both;
}

.pc-preview-swiper {
  width: 100%;
  height: 100%;
}

.pc-preview-slide {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pc-preview-img {
  width: 100%;
  height: 100%;
}

.pc-preview-indicator {
  position: absolute;
  top: calc(28rpx + env(safe-area-inset-top));
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.pc-preview-indicator text {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: $pc-text;
  background: rgba(20, 10, 34, 0.72);
  border: 1px solid rgba(167, 139, 250, 0.28);
}

.pc-preview-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.pc-preview-hint text {
  font-size: 22rpx;
  color: rgba(245, 237, 255, 0.55);
  letter-spacing: 1rpx;
}

/* ActionSheet —— 独立圆角块，贴近系统「保存图像 / 取消」形态 */
.pc-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 11700;
  background: rgba(10, 6, 20, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  padding: 20rpx 20rpx calc(20rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  animation: pc-fade-up 0.2s ease both;
}

.pc-sheet {
  width: 100%;
  animation: pc-fade-up 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pc-sheet-head {
  padding: 12rpx 12rpx 18rpx;
  margin-bottom: 4rpx;
}

.pc-sheet-title {
  display: block;
  text-align: center;
  color: $pc-muted;
  font-size: 24rpx;
}

.pc-sheet-group {
  border-radius: $pc-radius-xl;
  overflow: hidden;
  background:
    linear-gradient(160deg, rgba(124, 58, 237, 0.22) 0%, transparent 48%),
    linear-gradient(200deg, rgba(232, 121, 249, 0.1) 0%, transparent 40%),
    rgba(28, 16, 48, 0.96);
  border: 1px solid rgba(232, 121, 249, 0.28);
  box-shadow:
    0 12rpx 40rpx rgba(10, 6, 20, 0.45),
    0 0 28rpx rgba(124, 58, 237, 0.16);
}

.pc-sheet-item {
  padding: 34rpx 16rpx;
  color: $pc-text;
  font-size: 30rpx;
  font-weight: 600;
  text-align: center;
  border-bottom: 1px solid rgba(167, 139, 250, 0.12);
  letter-spacing: 1rpx;
}

.pc-sheet-item.last {
  border-bottom: none;
}

.pc-sheet-item:active {
  background: rgba(232, 121, 249, 0.14);
}

.pc-sheet-cancel {
  margin-top: 16rpx;
  padding: 32rpx 16rpx;
  text-align: center;
  color: rgba(245, 237, 255, 0.78);
  font-size: 30rpx;
  font-weight: 600;
  border-radius: $pc-radius-xl;
  background:
    linear-gradient(160deg, rgba(74, 29, 107, 0.55) 0%, transparent 60%),
    rgba(20, 10, 34, 0.94);
  border: 1px solid rgba(167, 139, 250, 0.22);
  box-shadow: 0 8rpx 28rpx rgba(10, 6, 20, 0.4);
}

.pc-sheet-cancel:active {
  background: rgba(167, 139, 250, 0.12);
}

@keyframes pc-spin {
  to { transform: rotate(360deg); }
}
</style>
