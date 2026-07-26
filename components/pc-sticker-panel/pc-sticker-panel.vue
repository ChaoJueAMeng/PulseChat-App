<template>
  <view v-if="show" class="sticker-panel pc-card">
    <view class="head">
      <text class="title">表情包</text>
      <text class="count">{{ list.length }}/{{ max }}</text>
      <view class="spacer"></view>
      <text class="link pc-press" @tap="emit('manage')">管理</text>
    </view>
    <scroll-view scroll-y class="grid-wrap">
      <view v-if="loading" class="empty">加载中…</view>
      <view v-else-if="!list.length" class="empty">
        <text class="empty-title">还没有表情包</text>
        <text class="empty-sub pc-press" @tap="emit('manage')">去添加</text>
      </view>
      <view v-else class="grid">
        <view
          v-for="s in list"
          :key="s.id"
          class="cell pc-press"
          @tap="pick(s)"
        >
          <image class="img" :src="mediaUrl(s.url)" mode="aspectFit" lazy-load />
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { api } from '../../utils/request.js'
import { fullUrl } from '../../utils/url.js'
import { MAX_USER_STICKERS } from '../../utils/sticker.js'

const props = defineProps({
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['pick', 'manage'])

const list = ref([])
const loading = ref(false)
const max = MAX_USER_STICKERS

function mediaUrl(url) {
  return fullUrl(url)
}

async function load() {
  loading.value = true
  try {
    list.value = (await api.stickers()) || []
  } catch (e) {
    list.value = []
  } finally {
    loading.value = false
  }
}

function pick(s) {
  if (!s?.url) return
  emit('pick', s)
}

watch(() => props.show, (v) => {
  if (v) load()
})

defineExpose({ reload: load })
</script>

<style scoped lang="scss">
.sticker-panel {
  position: fixed;
  left: 20rpx;
  right: 20rpx;
  bottom: calc(280rpx + env(safe-area-inset-bottom));
  z-index: 30;
  border-radius: $pc-radius-md;
  padding: 12rpx 0 8rpx;
  animation: pc-fade-up 0.25s ease;
  box-shadow: 0 -8rpx 32rpx rgba(124, 58, 237, 0.12);
}
.head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 4rpx 20rpx 12rpx;
  border-bottom: 1px solid rgba(167, 139, 250, 0.12);
}
.title {
  font-size: 26rpx;
  font-weight: 700;
  color: $pc-text;
}
.count {
  font-size: 22rpx;
  color: $pc-muted;
}
.spacer { flex: 1; }
.link {
  font-size: 24rpx;
  color: $pc-purple;
  padding: 8rpx 12rpx;
}
.grid-wrap {
  max-height: 360rpx;
  padding: 12rpx 12rpx 4rpx;
  box-sizing: border-box;
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 25%;
  padding: 10rpx;
  box-sizing: border-box;
}
.img {
  width: 100%;
  height: 140rpx;
  border-radius: 12rpx;
  background: rgba(167, 139, 250, 0.08);
}
.empty {
  padding: 48rpx 20rpx;
  text-align: center;
  color: $pc-muted;
  font-size: 24rpx;
}
.empty-title {
  display: block;
  margin-bottom: 12rpx;
}
.empty-sub {
  color: $pc-purple;
}
</style>
