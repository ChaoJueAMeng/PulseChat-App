<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { getStore } from './store/index.js'
import { connectWs, ensureWs } from './utils/ws.js'
import { installFeedback } from './utils/feedback.js'
import { installNotifyListener, onAppShowNotify, scheduleRegisterPushClient, setAppVisible } from './utils/notify.js'
import { api } from './utils/request.js'

onLaunch(async () => {
  installFeedback()
  installNotifyListener()
  setAppVisible(true)
  const store = getStore()
  store.hydrate()
  if (store.state.token) {
    connectWs(store.state.token)
    scheduleRegisterPushClient(800)
    try {
      const data = await api.conversations()
      store.setConversations(data || [])
    } catch (e) {}
  }
  try { uni.hideTabBar({ animation: false }) } catch (e) {}
})

onShow(() => {
  setAppVisible(true)
  onAppShowNotify()
  const store = getStore()
  if (store.state.token) ensureWs()
})

onHide(() => {
  setAppVisible(false)
})
</script>

<style lang="scss">
@import './styles/theme.scss';

page {
  background: $pc-bg;
  color: $pc-text;
  font-family: 'Avenir Next', 'PingFang SC', 'SF Pro Display', 'Microsoft YaHei', sans-serif;
  min-height: 100%;
}

view, text {
  box-sizing: border-box;
}

.pc-btn {
  border: none;
  color: #fff;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(120deg, #7C3AED 0%, #A78BFA 42%, #F43F5E 100%);
  box-shadow: 0 8rpx 24rpx rgba(124, 58, 237, 0.28);
}

.pc-btn:active {
  opacity: 0.92;
}

/* 列表卡片用实色底，避免每行 backdrop-filter 造成滚动掉帧 */
.pc-card {
  background: rgba(28, 16, 48, 0.92);
  border: 1px solid rgba(167, 139, 250, 0.16);
  box-shadow: 0 8rpx 24rpx rgba(10, 6, 20, 0.28);
}
</style>
