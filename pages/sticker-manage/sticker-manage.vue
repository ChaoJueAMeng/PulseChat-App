<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row has-side">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">{{ editing ? '选择表情包' : '表情包管理' }}</text>
        <view
          v-if="list.length"
          class="nav-action pc-press"
          @tap="toggleEdit"
        >
          <text class="nav-action-text">{{ editing ? '完成' : '编辑' }}</text>
        </view>
        <view v-else class="nav-action-placeholder"></view>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view class="toolbar pc-card">
        <text class="tip">{{ list.length }}/{{ max }} · 点击可置顶或删除，编辑可多选</text>
        <view class="toolbar-actions">
          <view class="btn pc-press" @tap="batchAdd">
            <text>批量添加</text>
          </view>
          <view
            v-if="editing && selectedCount"
            class="btn danger pc-press"
            @tap="batchRemove"
          >
            <text>删除({{ selectedCount }})</text>
          </view>
        </view>
      </view>

      <view v-if="loading" class="empty">加载中…</view>
      <view v-else-if="!list.length" class="empty">
        <text class="empty-title">还没有表情包</text>
        <text class="empty-sub">点击「批量添加」从相册选择图片</text>
      </view>

      <view v-else class="grid">
        <view
          v-for="(s, index) in list"
          :key="s.id"
          class="cell"
          :class="{ selected: isSelected(s.id) }"
          @tap="onTap(s, index)"
          @longpress="onLongPress(s, index)"
        >
          <image class="img" :src="mediaUrl(s.url)" mode="aspectFit" lazy-load />
          <view v-if="editing" class="check" :class="{ on: isSelected(s.id) }">
            <text v-if="isSelected(s.id)">✓</text>
          </view>
          <view v-if="!editing" class="order">{{ index + 1 }}</view>
        </view>
      </view>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { fullUrl } from '../../utils/url.js'
import { MAX_USER_STICKERS } from '../../utils/sticker.js'


const list = ref([])
const loading = ref(false)
const editing = ref(false)
/** 用普通对象做多选，避免 Set 在 App 端模板里不触发更新 */
const selectedMap = ref({})
const max = MAX_USER_STICKERS
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
const selectedCount = computed(() => Object.keys(selectedMap.value).length)

function mediaUrl(url) {
  return fullUrl(url)
}

function isSelected(id) {
  return !!selectedMap.value[id]
}

function clearSelected() {
  selectedMap.value = {}
}

function goBack() {
  if (editing.value) {
    editing.value = false
    clearSelected()
    return
  }
  uni.navigateBack()
}

function toggleEdit() {
  editing.value = !editing.value
  clearSelected()
}

async function load() {
  loading.value = true
  try {
    list.value = (await api.stickers()) || []
  } catch (e) {
    list.value = []
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function onTap(s, index) {
  if (editing.value) {
    const next = { ...selectedMap.value }
    if (next[s.id]) delete next[s.id]
    else next[s.id] = true
    selectedMap.value = next
    return
  }
  openItemActions(s, index)
}

function onLongPress(s, index) {
  if (editing.value) return
  try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (err) {}
  openItemActions(s, index)
}

function openItemActions(s, index) {
  uni.showActionSheet({
    itemList: ['放至最前', '删除'],
    success: (res) => {
      if (res.tapIndex === 0) moveToFront(index)
      else if (res.tapIndex === 1) removeOne(s)
    }
  })
}

async function moveToFront(index) {
  if (index <= 0) {
    uni.showToast({ title: '已在最前', icon: 'none' })
    return
  }
  const arr = list.value.slice()
  const [item] = arr.splice(index, 1)
  arr.unshift(item)
  try {
    const ids = arr.map(x => x.id)
    list.value = (await api.reorderStickers(ids)) || arr
    uni.showToast({ title: '已放至最前', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
    await load()
  }
}

function removeOne(s) {
  if (!s?.id) return
  uni.showModal({
    title: '删除表情包',
    content: '确定删除该表情包？',
    confirmColor: '#F43F5E',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await api.deleteSticker(s.id)
        list.value = list.value.filter(x => x.id !== s.id)
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (e) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
      }
    }
  })
}

async function batchAdd() {
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
    },
    fail: (err) => {
      const msg = err?.errMsg || ''
      if (msg.includes('cancel') || msg.includes('Cancel')) return
      uni.showToast({ title: '无法打开相册', icon: 'none' })
    }
  })
}

function batchRemove() {
  const ids = Object.keys(selectedMap.value).map(Number).filter(id => !Number.isNaN(id))
  if (!ids.length) return
  uni.showModal({
    title: '删除表情包',
    content: '确定删除选中的 ' + ids.length + ' 个表情包？',
    confirmColor: '#F43F5E',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await api.batchDeleteStickers(ids)
        const set = new Set(ids)
        list.value = list.value.filter(s => !set.has(s.id))
        clearSelected()
        editing.value = false
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (e) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
      }
    }
  })
}

onMounted(load)
onShow(load)
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.page-header {
  width: 100%;
  flex-shrink: 0;
}
.nav-action {
  min-width: 72rpx;
  min-height: 72rpx;
  padding: 0 12rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  box-sizing: border-box;
}
.nav-action-text {
  font-size: 28rpx;
  color: $pc-purple;
}
.nav-action-placeholder {
  width: 72rpx;
  flex-shrink: 0;
}
.body {
  flex: 1;
  height: 0;
  padding: 20rpx 24rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.toolbar {
  padding: 20rpx 22rpx;
  border-radius: $pc-radius-lg;
  margin-bottom: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.tip {
  font-size: 22rpx;
  color: $pc-muted;
}
.toolbar-actions {
  display: flex;
  gap: 16rpx;
}
.btn {
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: $pc-text;
  background: rgba(167, 139, 250, 0.16);
  &.danger {
    color: $pc-rose;
    background: rgba(244, 63, 94, 0.16);
  }
}
.grid {
  display: flex;
  flex-wrap: wrap;
  margin: 0 -8rpx;
}
.cell {
  width: 25%;
  padding: 8rpx;
  box-sizing: border-box;
  position: relative;
  &.selected .img {
    box-shadow: 0 0 0 3rpx rgba(167, 139, 250, 0.7);
  }
}
.img {
  width: 100%;
  height: 160rpx;
  border-radius: 14rpx;
  background: rgba(28, 16, 48, 0.88);
  border: 1px solid rgba(167, 139, 250, 0.14);
}
.check {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid rgba(245, 237, 255, 0.7);
  background: rgba(10, 6, 20, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: #fff;
  &.on {
    background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
    border-color: transparent;
  }
}
.order {
  position: absolute;
  left: 16rpx;
  bottom: 16rpx;
  min-width: 32rpx;
  padding: 2rpx 8rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  color: $pc-muted;
  background: rgba(10, 6, 20, 0.55);
  text-align: center;
}
.empty {
  padding: 80rpx 20rpx;
  text-align: center;
  color: $pc-muted;
}
.empty-title {
  display: block;
  font-size: 28rpx;
  color: $pc-text;
  margin-bottom: 12rpx;
}
.empty-sub {
  font-size: 24rpx;
}
</style>
