<template>
  <view class="search pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">搜索</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view class="box pc-card pc-enter" :class="{ 'is-focus': inputFocus }">
        <text class="box-icon">⌕</text>
        <input
          class="input"
          v-model="keyword"
          :focus="autoFocus"
          placeholder="手机号 / 账号 / 昵称"
          placeholder-class="ph"
          confirm-type="search"
          @focus="inputFocus = true"
          @blur="inputFocus = false"
          @confirm="doSearch"
        />
        <text v-if="keyword" class="clear pc-press" @tap="clearKeyword">×</text>
        <button
          class="pc-btn btn"
          :class="{ 'is-busy': searching }"
          :disabled="searching || !keyword.trim()"
          @tap="doSearch"
        >{{ searching ? '搜索中' : '搜索' }}</button>
      </view>

      <template v-if="searching">
        <view v-for="i in 3" :key="'sk-' + i" class="pc-skeleton pc-skeleton--row"></view>
      </template>

      <view v-else-if="!searched" class="pc-empty pc-empty--compact">
        <view class="pc-empty__icon">⌕</view>
        <text class="pc-empty__title">找到你的朋友</text>
        <text class="pc-empty__sub">支持按手机号、账号或昵称精确 / 模糊搜索</text>
      </view>

      <view v-else-if="!list.length" class="pc-empty pc-empty--compact">
        <view class="pc-empty__icon">?</view>
        <text class="pc-empty__title">未找到相关用户</text>
        <text class="pc-empty__sub">「{{ lastKeyword }}」暂无匹配结果，换个关键词试试</text>
      </view>

      <template v-else>
        <text class="result-count">找到 {{ list.length }} 位用户</text>
        <view
          v-for="(u, idx) in list"
          :key="u.id"
          class="row pc-card pc-press"
          :style="{ animationDelay: (idx * 0.04) + 's' }"
          @tap="openProfile(u)"
        >
          <pc-avatar :url="u.avatar" :name="u.nickname" :size="76" :seed="u.id" />
          <view class="meta">
            <text class="name">{{ u.nickname || '用户' }}</text>
            <text class="sub">{{ subLine(u) }}</text>
          </view>
          <view
            v-if="actionLabel(u)"
            class="pc-pill"
            :class="{
              ghost: isActionDisabled(u),
              disabled: applyingId === u.id,
              'pc-press': !isActionDisabled(u)
            }"
            @tap.stop="onAction(u)"
          >
            <text>{{ applyingId === u.id ? '发送中' : actionLabel(u) }}</text>
          </view>
        </view>
      </template>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../utils/request.js'
import { showModal } from '../../utils/feedback.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'


const keyword = ref('')
const list = ref([])
const statusMap = ref({})
const searching = ref(false)
/** 是否已执行过一次搜索（区分初始提示与空结果） */
const searched = ref(false)
const lastKeyword = ref('')
const inputFocus = ref(false)
const autoFocus = ref(false)
const applyingId = ref(null)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))
let searchGen = 0

onLoad(() => {
  let prefilled = false
  try {
    const cached = uni.getStorageSync('pc_scan_keyword')
    if (cached) {
      prefilled = true
      keyword.value = String(cached)
      uni.removeStorageSync('pc_scan_keyword')
      doSearch()
    }
  } catch (e) {}
  // 无预填关键词时自动弹出键盘；延迟避免与页面入场动画抢帧
  if (!prefilled) {
    setTimeout(() => { autoFocus.value = true }, 260)
  }
})

function goBack() {
  uni.navigateBack()
}

function clearKeyword() {
  keyword.value = ''
  autoFocus.value = false
  setTimeout(() => { autoFocus.value = true }, 30)
}

/** 账号 / 手机号按存在情况拼接，避免出现悬空的「·」 */
function subLine(u) {
  return [u?.account, u?.phone].filter(Boolean).join(' · ') || '暂无更多信息'
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw || searching.value) return
  const gen = ++searchGen
  searching.value = true
  lastKeyword.value = kw
  try {
    const users = await api.searchUsers(kw) || []
    if (gen !== searchGen) return
    list.value = users
    statusMap.value = {}
    searched.value = true
    await Promise.all(users.map(async (u) => {
      if (!u?.id) return
      try {
        const res = await api.checkFriend(u.id)
        if (gen === searchGen) statusMap.value[u.id] = res || {}
      } catch (e) {
        if (gen === searchGen) statusMap.value[u.id] = {}
      }
    }))
  } catch (e) {
    // request.js 已统一 toast
  } finally {
    if (gen === searchGen) searching.value = false
  }
}

function actionLabel(u) {
  const s = statusMap.value[u.id]
  if (!s) return '加好友'
  if (s.friend || s.isFriend) return '已是好友'
  if (s.incomingPending) return '待处理'
  if (s.pending || s.applied) return '已申请'
  return '加好友'
}

function isActionDisabled(u) {
  const s = statusMap.value[u.id]
  if (!s) return false
  return !!(s.friend || s.isFriend || s.incomingPending || s.pending || s.applied)
}

async function promptRemark(friendId, nickname) {
  if (!friendId) return
  const res = await showModal({
    title: '设置备注',
    editable: true,
    placeholderText: nickname ? `备注名（${nickname}）` : '请输入备注名',
    confirmText: '保存',
    cancelText: '跳过'
  })
  if (!res.confirm) return
  const next = (res.content || '').trim()
  if (!next) return
  try {
    await api.updateFriendRemark(friendId, next)
    uni.showToast({ title: '备注已设置', icon: 'none' })
  } catch (e) {}
}

async function onAction(u) {
  if (isActionDisabled(u) || applyingId.value) return
  applyingId.value = u.id
  try {
    await api.applyFriend(u.id)
    const res = await api.checkFriend(u.id)
    statusMap.value[u.id] = res || {}
    try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
    if (res?.friend || res?.isFriend) {
      uni.showToast({ title: '已成为好友', icon: 'success' })
      await promptRemark(u.id, u.nickname)
    } else {
      uni.showToast({ title: '已发送申请', icon: 'success' })
    }
  } catch (e) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  } finally {
    applyingId.value = null
  }
}

function openProfile(u) {
  if (!u?.id) return
  uni.navigateTo({
    url: '/pages/friend-profile/friend-profile?userId=' + u.id
      + '&fromSearch=1'
      + '&title=' + encodeURIComponent(u.nickname || '用户资料')
  })
}
</script>

<style scoped lang="scss">
.search {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.body { flex: 1; height: 0; padding: 28rpx; box-sizing: border-box; }
.box {
  display: flex; align-items: center; gap: 12rpx; padding: 14rpx 14rpx 14rpx 22rpx;
  border-radius: $pc-radius-lg; margin-bottom: 22rpx;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  &.is-focus {
    border-color: rgba(167, 139, 250, 0.6);
    box-shadow: 0 0 0 4rpx rgba(167, 139, 250, 0.12), 0 0 28rpx rgba(167, 139, 250, 0.14);
  }
}
.box-icon { color: $pc-muted; font-size: 34rpx; line-height: 1; flex-shrink: 0; }
.input {
  flex: 1; min-width: 0; height: 72rpx; color: $pc-text; font-size: 28rpx;
  background: transparent;
}
.ph { color: #6B5C7A; }
.clear {
  width: 44rpx; height: 44rpx; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: $pc-radius-pill; color: $pc-muted; font-size: 36rpx; line-height: 1;
  background: rgba(167, 139, 250, 0.12);
}
.btn {
  height: 68rpx; line-height: 68rpx; padding: 0 28rpx; flex-shrink: 0;
  border-radius: $pc-radius-pill; margin: 0; font-size: 26rpx;
}
.result-count {
  display: block;
  color: #6B5C7A;
  font-size: 22rpx;
  margin: 0 8rpx 14rpx;
  letter-spacing: 0.5rpx;
}
.row {
  display: flex; align-items: center; gap: 16rpx; padding: 24rpx;
  border-radius: $pc-radius-lg; margin-bottom: 14rpx;
  animation: pc-bubble-in 0.35s ease both;
}
.meta { flex: 1; min-width: 0; }
.name {
  display: block; color: $pc-text; font-weight: 700;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.sub {
  display: block; color: $pc-muted; font-size: 22rpx; margin-top: 6rpx;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
</style>
