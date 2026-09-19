<template>
  <view class="page pc-aurora">
    <view class="page-header pc-nav-bar pc-page-header" :style="headerStyle">
      <view class="pc-nav-row">
        <view class="pc-nav-back pc-press" @tap="goBack">
          <text class="pc-nav-back-icon">‹</text>
        </view>
        <text class="pc-nav-title">创建群聊</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="body"
      :bounces="true"
    >
      <view class="panel pc-card pc-enter">
        <text class="label">群名称</text>
        <input
          class="input pc-input"
          :class="{ 'is-focus': titleFocus }"
          v-model="title"
          :maxlength="TITLE_MAX"
          placeholder="比如 霓虹小队"
          placeholder-class="ph"
          confirm-type="done"
          @focus="titleFocus = true"
          @blur="titleFocus = false"
        />
        <text class="pc-counter" :class="{ 'is-near': title.length >= TITLE_MAX - 4 }">{{ title.length }}/{{ TITLE_MAX }}</text>
      </view>

      <view class="panel pc-card pc-enter" style="animation-delay: 0.06s">
        <view class="label-row">
          <text class="label">选择好友</text>
          <text v-if="friends.length" class="label-extra">
            已选 {{ selected.length }} / {{ friends.length }}
          </text>
        </view>

        <template v-if="loading">
          <view v-for="i in 4" :key="'sk-' + i" class="pc-skeleton sk-row"></view>
        </template>

        <view v-else-if="!friends.length" class="pc-empty pc-empty--compact">
          <view class="pc-empty__icon">☺</view>
          <text class="pc-empty__title">还没有好友</text>
          <text class="pc-empty__sub">先添加几位好友，再回来创建群聊</text>
          <view class="pc-empty__action pc-press" @tap="goSearch">去添加好友</view>
        </view>

        <template v-else>
          <view
            v-for="f in friends"
            :key="f.id"
            class="row pc-press"
            :class="{ on: isSelected(f.friendId) }"
            @tap="toggle(f.friendId)"
          >
            <view class="pc-check" :class="{ on: isSelected(f.friendId) }"></view>
            <pc-avatar
              :url="f.user?.avatar"
              :name="f.remark || f.user?.nickname"
              :size="72"
              :seed="f.friendId"
            />
            <view class="meta">
              <text class="name">{{ f.remark || f.user?.nickname || '好友' }}</text>
              <text v-if="f.remark && f.user?.nickname" class="sub">昵称 {{ f.user.nickname }}</text>
            </view>
          </view>
        </template>
      </view>

      <button
        class="pc-btn create"
        :class="{ 'is-busy': creating }"
        :disabled="creating"
        @tap="create"
      >{{ creating ? '创建中…' : (selected.length ? `创建群聊（${selected.length + 1} 人）` : '创建群聊') }}</button>
    </scroll-view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../utils/request.js'
import PcAvatar from '../../components/pc-avatar/pc-avatar.vue'

const TITLE_MAX = 30

const title = ref('')
const titleFocus = ref(false)
const friends = ref([])
const selected = ref([])
const loading = ref(false)
const creating = ref(false)
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

function goBack() {
  uni.navigateBack()
}

function goSearch() {
  uni.navigateTo({ url: '/pages/search/search' })
}

onMounted(async () => {
  loading.value = true
  try {
    friends.value = await api.friends() || []
  } catch (e) {
    friends.value = []
  } finally {
    loading.value = false
  }
})

function isSelected(id) {
  return selected.value.includes(id)
}

function toggle(id) {
  if (selected.value.includes(id)) selected.value = selected.value.filter(x => x !== id)
  else selected.value.push(id)
  try { uni.vibrateShort && uni.vibrateShort({ type: 'light' }) } catch (e) {}
}

async function create() {
  if (creating.value) return
  if (!title.value.trim()) {
    uni.showToast({ title: '请填写群名', icon: 'none' })
    return
  }
  if (!selected.value.length) {
    uni.showToast({ title: '请至少选择一位好友', icon: 'none' })
    return
  }
  creating.value = true
  try {
    const conv = await api.createGroup({ title: title.value.trim(), memberIds: selected.value })
    uni.redirectTo({ url: '/pages/chat/chat?id=' + conv.id + '&title=' + encodeURIComponent(conv.title) })
  } catch (e) {
    // request.js 已统一 toast
  } finally {
    creating.value = false
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
.body { flex: 1; height: 0; padding: 28rpx; box-sizing: border-box; }
.panel { border-radius: $pc-radius-lg; padding: 24rpx; margin-bottom: 18rpx; }
.input {
  height: 88rpx; padding: 0 24rpx; color: $pc-text; font-size: 30rpx; font-weight: 600;
  background: rgba(255, 255, 255, 0.04); border-radius: $pc-radius-md;
  border: 1px solid rgba(167, 139, 250, 0.16);
  margin-bottom: 10rpx;
}
.ph { color: #6B5C7A; font-weight: 400; }
.label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.label { display: block; color: $pc-muted; margin-bottom: 12rpx; font-size: 24rpx; }
.label-row .label { margin-bottom: 0; }
.label-extra { color: $pc-purple; font-size: 22rpx; }
.sk-row { height: 104rpx; margin-bottom: 10rpx; border-radius: $pc-radius-md; }
.row {
  display: flex; align-items: center; gap: 18rpx; padding: 18rpx 8rpx;
  border-radius: $pc-radius-md;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
  transition: background 0.18s ease;
  &:last-child { border-bottom: none; }
  &.on { background: rgba(167, 139, 250, 0.08); }
}
.meta { flex: 1; min-width: 0; }
.name {
  display: block; color: $pc-text; font-size: 28rpx;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.sub { display: block; color: $pc-muted; font-size: 22rpx; margin-top: 4rpx; }
.create {
  margin-top: 24rpx; height: 92rpx; line-height: 92rpx;
  border-radius: $pc-radius-pill;
}
</style>
