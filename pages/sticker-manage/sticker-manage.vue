<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">{{ editing ? '选择表情包' : '表情包管理' }}</text>
        <text
          v-if="list.length"
          class="nav-action pc-press"
          @tap="toggleEdit"
        >{{ editing ? '完成' : '编辑' }}</text>
        <view v-else class="nav-action-placeholder"></view>
      </view>
    </view>

    <view class="body">
      <view class="toolbar pc-card">
        <text class="tip">{{ list.length }}/{{ max }} · 长按拖动排序</text>
        <view class="toolbar-actions">
          <text class="btn pc-press" @tap="batchAdd">批量添加</text>
          <text
            v-if="editing && selected.size"
            class="btn danger pc-press"
            @tap="batchRemove"
          >删除({{ selected.size }})</text>
        </view>
      </view>

      <view v-if="loading" class="empty">加载中…</view>
      <view v-else-if="!list.length" class="empty">
        <text class="empty-title">还没有表情包</text>
        <text class="empty-sub">点击「批量添加」从相册选择图片</text>
      </view>

      <view
        v-else
        class="grid"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view
          v-for="(s, index) in list"
          :key="s.id"
          class="cell"
          :class="{
            selected: selected.has(s.id),
            dragging: dragIndex === index,
            dim: dragIndex >= 0 && dragIndex !== index
          }"
          :style="cellStyle(index)"
          @tap="onTap(s, index)"
          @longpress="onLongPress(index, $event)"
          @touchstart="onTouchStart(index, $event)"
        >
          <image class="img" :src="mediaUrl(s.url)" mode="aspectFit" lazy-load />
          <view v-if="editing" class="check" :class="{ on: selected.has(s.id) }">
            <text v-if="selected.has(s.id)">✓</text>
          </view>
          <view v-if="!editing" class="order">{{ index + 1 }}</view>
        </view>
      </view>
    </view>
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
const selected = ref(new Set())
const max = MAX_USER_STICKERS
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

const dragIndex = ref(-1)
const overIndex = ref(-1)
let startY = 0
let cellH = 0
let dragging = false
let orderDirty = false

function mediaUrl(url) {
  return fullUrl(url)
}

function goBack() {
  if (editing.value) {
    editing.value = false
    selected.value = new Set()
    return
  }
  uni.navigateBack()
}

function toggleEdit() {
  editing.value = !editing.value
  selected.value = new Set()
  dragIndex.value = -1
  overIndex.value = -1
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
  if (dragging) return
  if (!editing.value) return
  const next = new Set(selected.value)
  if (next.has(s.id)) next.delete(s.id)
  else next.add(s.id)
  selected.value = next
}

function onLongPress(index, e) {
  if (editing.value) return
  dragging = true
  dragIndex.value = index
  overIndex.value = index
  orderDirty = false
  const t = e.touches?.[0] || e.changedTouches?.[0]
  startY = t?.clientY || t?.pageY || 0
  // 估算单元格高度（含间距）
  try {
    const sys = uni.getSystemInfoSync()
    cellH = Math.max(72, (sys.windowWidth || 375) * 0.25)
  } catch (err) {
    cellH = 90
  }
  try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (err) {}
}

function onTouchStart(index, e) {
  if (dragIndex.value < 0) return
  const t = e.touches?.[0]
  if (t) startY = t.clientY || t.pageY || startY
}

function onTouchMove(e) {
  if (dragIndex.value < 0 || !dragging) return
  const t = e.touches?.[0]
  if (!t) return
  const y = t.clientY || t.pageY || 0
  const delta = y - startY
  const steps = Math.round(delta / cellH)
  let target = dragIndex.value + steps
  target = Math.max(0, Math.min(list.value.length - 1, target))
  if (target === overIndex.value) return
  overIndex.value = target
  if (target !== dragIndex.value) {
    const arr = list.value.slice()
    const [item] = arr.splice(dragIndex.value, 1)
    arr.splice(target, 0, item)
    list.value = arr
    dragIndex.value = target
    startY = y
    orderDirty = true
  }
}

async function onTouchEnd() {
  if (dragIndex.value < 0) return
  const dirty = orderDirty
  dragIndex.value = -1
  overIndex.value = -1
  dragging = false
  orderDirty = false
  if (!dirty) return
  try {
    const ids = list.value.map(s => s.id)
    list.value = (await api.reorderStickers(ids)) || list.value
  } catch (e) {
    uni.showToast({ title: e?.message || '排序失败', icon: 'none' })
    await load()
  }
}

function cellStyle(index) {
  if (dragIndex.value !== index) return {}
  return {
    zIndex: 5,
    transform: 'scale(1.06)'
  }
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
        list.value = [...list.value, ...(created || [])]
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

function batchRemove() {
  const ids = Array.from(selected.value)
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
        selected.value = new Set()
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
  min-height: 100vh;
}
.page-header {
  width: 100%;
}
.nav-action {
  min-width: 72rpx;
  text-align: right;
  padding-right: 20rpx;
  font-size: 28rpx;
  color: $pc-purple;
}
.nav-action-placeholder {
  width: 72rpx;
}
.body {
  padding: 20rpx 24rpx calc(40rpx + env(safe-area-inset-bottom));
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
  transition: transform 0.12s ease, opacity 0.12s ease;
  &.dim { opacity: 0.55; }
  &.dragging {
    opacity: 1;
  }
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
