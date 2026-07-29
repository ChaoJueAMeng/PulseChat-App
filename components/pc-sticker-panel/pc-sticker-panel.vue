<template>
  <view v-if="show" class="sticker-panel pc-card" @tap.stop>
    <view class="head">
      <text class="title">表情包</text>
      <text class="count">{{ list.length }}/{{ max }}</text>
      <view class="spacer"></view>
      <text class="link pc-press" @tap="emit('manage')">管理</text>
    </view>
    <scroll-view
      scroll-y
      class="grid-wrap"
      :bounces="true"
    >
      <view v-if="loading" class="empty">加载中…</view>
      <view v-else class="grid">
        <view class="cell add-cell pc-press" @tap="addStickers">
          <view class="add-box">
            <text class="add-ico">+</text>
          </view>
        </view>
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

/** 复用管理页同款：选图 → 上传 → batchAdd（后端默认插到最前） */
function addStickers() {
  const remain = max - list.value.length
  if (remain <= 0) {
    uni.showToast({ title: '已达上限 100 个', icon: 'none' })
    return
  }
  uni.chooseImage({
    count: Math.min(9, remain),
    sizeType: ['compressed'],
    success: async (res) => {
      const paths = res.tempFilePaths || []
      if (!paths.length) return
      uni.showLoading({ title: '上传中', mask: true })
      try {
        const items = []
        for (const p of paths) {
          if (list.value.length + items.length >= max) break
          const up = await api.upload(p, { category: 'sticker' })
          if (up?.url) items.push({ url: up.url })
        }
        if (!items.length) throw new Error('上传失败')
        const created = await api.batchAddStickers(items)
        list.value = [...(created || []), ...list.value]
        uni.showToast({ title: '已添加 ' + items.length + ' 个', icon: 'none' })
      } catch (e) {
        uni.showToast({ title: e?.message || '添加失败', icon: 'none' })
        await load()
      } finally {
        uni.hideLoading()
      }
    }
  })
}

watch(() => props.show, (v) => {
  if (v) {
    load()
  }
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
.add-box {
  width: 100%;
  height: 140rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(167, 139, 250, 0.1);
  border: 2rpx dashed rgba(167, 139, 250, 0.45);
  box-sizing: border-box;
}
.add-ico {
  font-size: 64rpx;
  line-height: 1;
  color: $pc-purple;
}
.empty {
  padding: 48rpx 20rpx;
  text-align: center;
  color: $pc-muted;
  font-size: 24rpx;
}
</style>
