<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">编辑资料</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view class="avatar-section pc-enter">
        <view class="avatar-ring pc-press" :class="{ 'is-uploading': uploadingAvatar }" @tap="changeAvatar">
          <pc-avatar
            :url="avatar"
            :name="nickname"
            :size="168"
          />
          <view class="avatar-mask">
            <view v-if="uploadingAvatar" class="avatar-spin"></view>
            <text v-else class="avatar-mask__text">更换</text>
          </view>
        </view>
        <text class="avatar-tip">{{ uploadingAvatar ? '上传中…' : '点击头像更换' }}</text>
      </view>

      <template v-if="loading">
        <view class="panel pc-card pc-enter" style="animation-delay: 0.06s">
          <view class="pc-skeleton sk-label"></view>
          <view class="pc-skeleton sk-input"></view>
          <view class="pc-skeleton sk-label"></view>
          <view class="pc-skeleton sk-area"></view>
        </view>
      </template>

      <view v-else class="panel pc-card pc-enter" style="animation-delay: 0.06s">
        <view class="label-row">
          <text class="label">昵称</text>
          <text class="pc-counter" :class="{ 'is-near': nickname.length >= NICK_MAX - 6 }">{{ nickname.length }}/{{ NICK_MAX }}</text>
        </view>
        <input
          class="input nickname-input pc-input"
          :class="[fieldClass('nickname'), { 'is-error': nicknameEmpty }]"
          :focus="focusTarget === 'nickname'"
          v-model="nickname"
          :maxlength="NICK_MAX"
          placeholder="请输入昵称"
          placeholder-class="ph"
          confirm-type="next"
          @focus="onFocus('nickname')"
          @blur="onBlur"
          @confirm="focusNext('bio')"
        />
        <text v-if="nicknameEmpty" class="field-error">昵称不能为空</text>

        <view class="label-row">
          <text class="label">个性签名</text>
          <text class="pc-counter" :class="{ 'is-near': bio.length >= BIO_MAX - 20 }">{{ bio.length }}/{{ BIO_MAX }}</text>
        </view>
        <textarea
          class="area pc-input"
          :class="fieldClass('bio')"
          :focus="focusTarget === 'bio'"
          v-model="bio"
          :maxlength="BIO_MAX"
          :show-confirm-bar="false"
          placeholder="写点什么，让朋友更了解你…"
          placeholder-class="ph"
          @focus="onFocus('bio')"
          @blur="onBlur"
        />

        <button
          class="pc-btn save"
          :class="{ 'is-busy': saving }"
          :loading="saving"
          :disabled="saving || !dirty"
          @tap="save"
        >{{ saving ? '保存中…' : (dirty ? '保存' : '未修改') }}</button>
      </view>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onBackPress } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { pickAndUploadAvatar } from '../../utils/avatar.js'
import { useFormFocus } from '../../utils/form-focus.js'
import { handlePageBackPress } from '../../utils/quit.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

const NICK_MAX = 64
const BIO_MAX = 255

const { focusTarget, onFocus, onBlur, fieldClass, focusNext } = useFormFocus()
const nickname = ref('')
const bio = ref('')
const avatar = ref('')
const loading = ref(true)
const saving = ref(false)
const uploadingAvatar = ref(false)
/** 进入页面时的快照，用于判断是否有未保存修改 */
const snapshot = ref({ nickname: '', bio: '' })
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

const dirty = computed(() => (
  (nickname.value || '').trim() !== snapshot.value.nickname
  || (bio.value || '') !== snapshot.value.bio
))
const nicknameEmpty = computed(() => !loading.value && !(nickname.value || '').trim())

function leave() {
  uni.navigateBack()
}

/** 有未保存的修改时，返回前二次确认 */
function goBack() {
  if (!dirty.value || saving.value) {
    leave()
    return
  }
  uni.showModal({
    title: '放弃修改？',
    content: '你有尚未保存的资料修改，离开后将丢失。',
    confirmText: '放弃',
    cancelText: '继续编辑',
    confirmColor: '#F43F5E',
    success: (res) => {
      if (res.confirm) leave()
    }
  })
}

onBackPress(() => {
  // 先关掉主题弹层（如本页的「放弃修改」确认框），再判断是否拦截返回
  if (handlePageBackPress()) return true
  if (!dirty.value || saving.value) return false
  goBack()
  return true
})

onMounted(async () => {
  try {
    const me = await api.me()
    nickname.value = me.nickname || ''
    bio.value = me.bio || ''
    avatar.value = me.avatar || ''
    snapshot.value = { nickname: nickname.value.trim(), bio: bio.value }
  } catch (e) {
    const cached = getStore().state.user
    if (cached) {
      nickname.value = cached.nickname || ''
      bio.value = cached.bio || ''
      avatar.value = cached.avatar || ''
      snapshot.value = { nickname: nickname.value.trim(), bio: bio.value }
    }
  } finally {
    loading.value = false
  }
})

async function changeAvatar() {
  if (uploadingAvatar.value) return
  uploadingAvatar.value = true
  try {
    // 头像上传成功即直接落库（avatar.js 内已 toast），与昵称 / 签名的「保存」相互独立
    const user = await pickAndUploadAvatar()
    avatar.value = user.avatar || ''
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
  } catch (e) {
    if (e?.errMsg && e.errMsg.includes('cancel')) return
    uni.showToast({ title: e?.message || '上传失败', icon: 'none' })
  } finally {
    uploadingAvatar.value = false
  }
}

async function save() {
  if (saving.value || !dirty.value) return
  const nick = (nickname.value || '').trim()
  if (!nick) {
    uni.showToast({ title: '昵称不能为空', icon: 'none' })
    focusNext('nickname')
    return
  }
  saving.value = true
  try {
    const user = await api.updateMe({
      nickname: nick,
      bio: bio.value,
      avatar: avatar.value || null
    })
    getStore().state.user = user
    uni.setStorageSync('pc_user', user)
    nickname.value = user.nickname || nick
    snapshot.value = { nickname: nickname.value.trim(), bio: bio.value }
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => leave(), 500)
  } catch (e) {
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.body {
  flex: 1;
  height: 0;
  padding: 28rpx;
  box-sizing: border-box;
}
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28rpx;
}
.avatar-ring {
  position: relative;
  padding: 8rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.85), rgba(244, 63, 94, 0.75));
  box-shadow: 0 0 40rpx rgba(167, 139, 250, 0.35), 0 16rpx 48rpx rgba(124, 58, 237, 0.28);
  &.is-uploading .avatar-mask { opacity: 1; }
}
.avatar-ring :deep(.pc-avatar) {
  border-radius: 50%;
}
.avatar-mask {
  position: absolute;
  inset: 8rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 6, 20, 0.45);
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}
.avatar-ring:active .avatar-mask { opacity: 1; }
.avatar-mask__text {
  color: #fff;
  font-size: 24rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
}
.avatar-spin {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  animation: pc-spin 0.75s linear infinite;
}
.avatar-tip {
  margin-top: 18rpx;
  color: $pc-purple;
  font-size: 24rpx;
  letter-spacing: 1rpx;
}
.sk-label { width: 120rpx; height: 24rpx; border-radius: 8rpx; margin: 18rpx 0 14rpx; }
.sk-input { height: 112rpx; border-radius: $pc-radius-md; }
.sk-area { height: 168rpx; border-radius: $pc-radius-md; }
.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18rpx 0 12rpx;
}
.label-row .label { margin: 0; }
.field-error { display: block; margin: -2rpx 0 10rpx 8rpx; color: $pc-rose; font-size: 22rpx; }
.input.is-error { border-color: rgba(244, 63, 94, 0.6) !important; }
.panel {
  width: 100%;
  max-width: 100%;
  border-radius: $pc-radius-xl;
  padding: 32rpx;
  box-sizing: border-box;
}
.label { display: block; color: $pc-muted; font-size: 24rpx; margin: 18rpx 0 12rpx; }
.input, .area {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  color: $pc-text;
  background: rgba(255, 255, 255, 0.04);
  border-radius: $pc-radius-md;
  margin-bottom: 12rpx;
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.nickname-input,
.input {
  height: 112rpx;
  min-height: 112rpx;
  line-height: 1.4;
  padding: 28rpx 28rpx;
  font-size: 34rpx;
  font-weight: 600;
}
.area {
  width: 100%;
  min-height: 168rpx;
  font-size: 28rpx;
  line-height: 1.5;
  padding: 24rpx 28rpx;
}
.ph { color: rgba(226, 232, 240, 0.35); }
.save {
  margin-top: 24rpx; height: 88rpx; line-height: 88rpx;
  border-radius: $pc-radius-pill;
}
</style>
