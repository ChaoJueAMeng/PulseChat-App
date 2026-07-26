<template>
  <view class="pc-tabbar">
    <view class="pc-tabbar__safe">
      <view
        v-for="(item, index) in tabs"
        :key="item.path"
        class="pc-tabbar__item"
        :class="{ 'is-active': current === index, 'is-bounce': bounceIndex === index }"
        @tap="onTap(index)"
      >
        <view class="pc-tabbar__icon-wrap">
          <view class="pc-tabbar__glow" />
          <!-- 聊天：圆角气泡 -->
          <view v-if="item.key === 'chat'" class="ico ico-chat">
            <view class="ico-chat__body" />
            <view class="ico-chat__tail" />
            <view class="ico-chat__dot d1" />
            <view class="ico-chat__dot d2" />
            <view class="ico-chat__dot d3" />
          </view>
          <!-- 通讯录：圆角卡片 + 人物 -->
          <view v-else-if="item.key === 'contact'" class="ico ico-contact">
            <view class="ico-contact__card" />
            <view class="ico-contact__head" />
            <view class="ico-contact__body" />
          </view>
          <!-- 我的：柔和人物 -->
          <view v-else class="ico ico-mine">
            <view class="ico-mine__head" />
            <view class="ico-mine__body" />
          </view>
          <view v-if="item.key === 'chat' && chatBadge > 0" class="pc-tabbar__badge">
            {{ chatBadge > 99 ? '99+' : chatBadge }}
          </view>
        </view>
        <text class="pc-tabbar__label">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getStore } from '../../store/index.js'
import { TAB_PATHS, switchTabAnimated } from '../../utils/tab-swipe.js'

const props = defineProps({
  /** 当前 Tab：0 聊天 / 1 通讯录 / 2 我的 */
  current: { type: Number, default: 0 }
})

const bounceIndex = ref(-1)
const store = getStore()
const chatBadge = computed(() => store.totalUnread())

const tabs = [
  { key: 'chat', text: '聊天', path: TAB_PATHS[0] },
  { key: 'contact', text: '通讯录', path: TAB_PATHS[1] },
  { key: 'mine', text: '我的', path: TAB_PATHS[2] }
]

function hideNative() {
  try {
    uni.hideTabBar({ animation: false })
  } catch (e) { /* ignore */ }
}

function onTap(index) {
  bounceIndex.value = index
  setTimeout(() => { bounceIndex.value = -1 }, 420)
  if (index === props.current) return
  switchTabAnimated(props.current, index)
}

onMounted(hideNative)
onShow(hideNative)
</script>

<style scoped lang="scss">
$inactive: #7A6B8C;
$active-a: #A78BFA;
$active-b: #E879F9;
$active-c: #F43F5E;

.pc-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: #12081C;
  border-top: 1px solid rgba(167, 139, 250, 0.14);
  box-shadow: 0 -8rpx 24rpx rgba(10, 6, 20, 0.35);
}

.pc-tabbar__safe {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  padding: 8rpx 12rpx calc(8rpx + env(safe-area-inset-bottom));
  min-height: 108rpx;
}

.pc-tabbar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  padding: 8rpx 0 4rpx;
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.pc-tabbar__item:active {
  transform: scale(0.93);
}

.pc-tabbar__icon-wrap {
  position: relative;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pc-tabbar__badge {
  position: absolute;
  top: -6rpx;
  right: -14rpx;
  z-index: 3;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #FB7185, #F43F5E);
  color: #fff;
  font-size: 16rpx;
  font-weight: 700;
  line-height: 28rpx;
  text-align: center;
  box-shadow: 0 4rpx 12rpx rgba(244, 63, 94, 0.4);
}

.pc-tabbar__glow {
  position: absolute;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(167, 139, 250, 0.38), rgba(244, 63, 94, 0.12) 55%, transparent 72%);
  opacity: 0;
  transform: scale(0.55);
  transition: opacity 0.28s ease, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

/* —— 通用图标容器 —— */
.ico {
  position: relative;
  z-index: 1;
  width: 44rpx;
  height: 44rpx;
  transform: scale(1);
  opacity: 0.82;
  transition:
    transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease;
}

/* —— 聊天气泡 —— */
.ico-chat__body {
  position: absolute;
  left: 4rpx;
  top: 4rpx;
  width: 34rpx;
  height: 28rpx;
  border-radius: 16rpx;
  border: 3.5rpx solid $inactive;
  background: transparent;
  transition: border-color 0.28s ease, background 0.28s ease, box-shadow 0.28s ease;
}
.ico-chat__tail {
  position: absolute;
  left: 8rpx;
  bottom: 2rpx;
  width: 12rpx;
  height: 12rpx;
  border-left: 3.5rpx solid $inactive;
  border-bottom: 3.5rpx solid $inactive;
  border-radius: 0 0 0 10rpx;
  transform: rotate(-28deg);
  transition: border-color 0.28s ease;
}
.ico-chat__dot {
  position: absolute;
  top: 15rpx;
  width: 4.5rpx;
  height: 4.5rpx;
  border-radius: 50%;
  background: $inactive;
  transition: background 0.28s ease;
}
.ico-chat__dot.d1 { left: 12rpx; }
.ico-chat__dot.d2 { left: 20rpx; }
.ico-chat__dot.d3 { left: 28rpx; }

/* —— 通讯录 —— */
.ico-contact__card {
  position: absolute;
  left: 6rpx;
  top: 3rpx;
  width: 32rpx;
  height: 38rpx;
  border-radius: 12rpx;
  border: 3.5rpx solid $inactive;
  background: transparent;
  transition: border-color 0.28s ease, background 0.28s ease, box-shadow 0.28s ease;
}
.ico-contact__head {
  position: absolute;
  left: 16rpx;
  top: 11rpx;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  border: 3rpx solid $inactive;
  transition: border-color 0.28s ease, background 0.28s ease;
}
.ico-contact__body {
  position: absolute;
  left: 12rpx;
  top: 26rpx;
  width: 20rpx;
  height: 10rpx;
  border: 3rpx solid $inactive;
  border-bottom: none;
  border-radius: 12rpx 12rpx 0 0;
  transition: border-color 0.28s ease, background 0.28s ease;
}

/* —— 我的 —— */
.ico-mine__head {
  position: absolute;
  left: 12rpx;
  top: 4rpx;
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  border: 3.5rpx solid $inactive;
  background: transparent;
  transition: border-color 0.28s ease, background 0.28s ease, box-shadow 0.28s ease;
}
.ico-mine__body {
  position: absolute;
  left: 6rpx;
  top: 26rpx;
  width: 32rpx;
  height: 16rpx;
  border: 3.5rpx solid $inactive;
  border-bottom: none;
  border-radius: 18rpx 18rpx 0 0;
  background: transparent;
  transition: border-color 0.28s ease, background 0.28s ease;
}

.pc-tabbar__label {
  font-size: 20rpx;
  color: $inactive;
  letter-spacing: 1rpx;
  transition: color 0.28s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), font-weight 0.2s ease;
  opacity: 0.9;
}

/* —— 选中态：紫红过渡 + 缩放 —— */
.pc-tabbar__item.is-active .pc-tabbar__glow {
  opacity: 1;
  transform: scale(1.2);
}

.pc-tabbar__item.is-active .ico {
  transform: scale(1.12);
  opacity: 1;
}

.pc-tabbar__item.is-active .pc-tabbar__label {
  color: #C4B5FD;
  font-weight: 600;
  transform: translateY(-1rpx);
}

.pc-tabbar__item.is-active .ico-chat__body {
  border-color: $active-a;
  background: linear-gradient(145deg, rgba(167, 139, 250, 0.22), rgba(244, 63, 94, 0.12));
}
.pc-tabbar__item.is-active .ico-chat__tail {
  border-color: $active-b;
}
.pc-tabbar__item.is-active .ico-chat__dot {
  background: $active-c;
}

.pc-tabbar__item.is-active .ico-contact__card {
  border-color: $active-a;
  background: linear-gradient(160deg, rgba(167, 139, 250, 0.18), rgba(232, 121, 249, 0.1));
}
.pc-tabbar__item.is-active .ico-contact__head {
  border-color: $active-b;
  background: rgba(232, 121, 249, 0.25);
}
.pc-tabbar__item.is-active .ico-contact__body {
  border-color: $active-c;
}

.pc-tabbar__item.is-active .ico-mine__head {
  border-color: $active-a;
  background: linear-gradient(145deg, rgba(167, 139, 250, 0.35), rgba(244, 63, 94, 0.2));
}
.pc-tabbar__item.is-active .ico-mine__body {
  border-color: $active-b;
  background: linear-gradient(180deg, rgba(232, 121, 249, 0.2), transparent);
}

/* —— 点击弹跳 —— */
.pc-tabbar__item.is-bounce .ico {
  animation: pc-tab-bounce 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pc-tabbar__item.is-bounce .pc-tabbar__glow {
  animation: pc-tab-glow 0.42s ease-out;
}

@keyframes pc-tab-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(0.84); }
  62% { transform: scale(1.22); }
  100% { transform: scale(1.12); }
}

@keyframes pc-tab-glow {
  0% { opacity: 0.35; transform: scale(0.65); }
  45% { opacity: 1; transform: scale(1.4); }
  100% { opacity: 1; transform: scale(1.2); }
}
</style>
