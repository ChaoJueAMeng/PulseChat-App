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
        <view class="avatar-ring">
          <pc-avatar
            :url="avatar"
            :name="nickname"
            :size="168"
            clickable
            @tap="changeAvatar"
          />
        </view>
        <text class="avatar-tip pc-press" @tap="changeAvatar">点击更换头像</text>
      </view>

      <view class="panel pc-card pc-enter" style="animation-delay: 0.06s">
        <text class="label">昵称</text>
        <input
          class="input nickname-input"
          v-model="nickname"
          maxlength="64"
          placeholder="请输入昵称"
          placeholder-class="ph"
        />
        <text class="label">个性签名</text>
        <textarea class="area" v-model="bio" maxlength="255" placeholder="写点什么…" placeholder-class="ph" />
        <button class="pc-btn save" @tap="save">保存</button>
      </view>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../utils/request.js'
import { getStore } from '../../store/index.js'
import { pickAndUploadAvatar } from '../../utils/avatar.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'


const nickname = ref('')
const bio = ref('')
const avatar = ref('')
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

function goBack() {
  uni.navigateBack()
}

onMounted(async () => {
  const me = await api.me()
  nickname.value = me.nickname || ''
  bio.value = me.bio || ''
  avatar.value = me.avatar || ''
})

async function changeAvatar() {
  try {
    const user = await pickAndUploadAvatar()
    avatar.value = user.avatar || ''
  } catch (e) {
    if (e?.errMsg && e.errMsg.includes('cancel')) return
    uni.showToast({ title: e?.message || '上传失败', icon: 'none' })
  }
}

async function save() {
  const nick = (nickname.value || '').trim()
  if (!nick) {
    uni.showToast({ title: '昵称不能为空', icon: 'none' })
    return
  }
  try {
    const user = await api.updateMe({
      nickname: nick,
      bio: bio.value,
      avatar: avatar.value || null
    })
    getStore().state.user = user
    uni.setStorageSync('pc_user', user)
    nickname.value = user.nickname || nick
    uni.showToast({ title: '已保存', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
  } catch (e) {}
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
  padding: 8rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.85), rgba(244, 63, 94, 0.75));
  box-shadow: 0 0 40rpx rgba(167, 139, 250, 0.35), 0 16rpx 48rpx rgba(124, 58, 237, 0.28);
}
.avatar-ring :deep(.pc-avatar) {
  border-radius: 50%;
}
.avatar-tip {
  margin-top: 18rpx;
  color: $pc-purple;
  font-size: 24rpx;
  letter-spacing: 1rpx;
}
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
