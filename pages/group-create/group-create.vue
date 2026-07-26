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

    <view class="body">
      <view class="panel pc-card pc-enter">
        <input class="input" v-model="title" placeholder="群名称，比如 霓虹小队" />
      </view>
      <view class="panel pc-card pc-enter" style="animation-delay: 0.06s">
        <text class="label">选择好友</text>
        <view v-for="f in friends" :key="f.id" class="row pc-press" @tap="toggle(f.friendId)">
          <view class="check" :class="{ on: selected.includes(f.friendId) }"></view>
          <text class="name">{{ f.remark || f.user?.nickname }}</text>
        </view>
      </view>
      <button class="pc-btn create" @tap="create">创建群聊</button>
    </view>
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../utils/request.js'

const title = ref('')
const friends = ref([])
const selected = ref([])
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
const headerStyle = computed(() => ({ paddingTop: statusBarHeight + 'px' }))

function goBack() {
  uni.navigateBack()
}

onMounted(async () => {
  friends.value = await api.friends() || []
})

function toggle(id) {
  if (selected.value.includes(id)) selected.value = selected.value.filter(x => x !== id)
  else selected.value.push(id)
}

async function create() {
  if (!title.value.trim()) {
    uni.showToast({ title: '请填写群名', icon: 'none' })
    return
  }
  if (!selected.value.length) {
    uni.showToast({ title: '请选择成员', icon: 'none' })
    return
  }
  const conv = await api.createGroup({ title: title.value.trim(), memberIds: selected.value })
  uni.redirectTo({ url: '/pages/chat/chat?id=' + conv.id + '&title=' + encodeURIComponent(conv.title) })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.body { flex: 1; padding: 28rpx; box-sizing: border-box; }
.panel { border-radius: $pc-radius-lg; padding: 24rpx; margin-bottom: 18rpx; }
.input {
  height: 84rpx; padding: 0 22rpx; color: $pc-text;
  background: rgba(255, 255, 255, 0.04); border-radius: $pc-radius-md;
}
.label { display: block; color: $pc-muted; margin-bottom: 12rpx; font-size: 24rpx; }
.row {
  display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0;
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
  transition: opacity 0.15s ease;
}
.check {
  width: 36rpx; height: 36rpx; border-radius: 12rpx;
  border: 1px solid $pc-purple; transition: background 0.2s ease, border-color 0.2s ease;
}
.check.on {
  background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
  border-color: transparent;
}
.name { color: $pc-text; }
.create {
  margin-top: 24rpx; height: 92rpx; line-height: 92rpx;
  border-radius: $pc-radius-pill;
}
</style>
