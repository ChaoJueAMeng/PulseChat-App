<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { getStore } from './store/index.js'
import { connectWs } from './utils/ws.js'

onLaunch(() => {
  const store = getStore()
  store.hydrate()
  if (store.state.token) {
    connectWs(store.state.token)
  }
})
</script>

<style lang="scss">
@import './styles/theme.scss';

page {
  background: $pc-bg;
  color: $pc-text;
  font-family: 'DIN Alternate', 'Avenir Next', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  min-height: 100%;
}

view, text {
  box-sizing: border-box;
}

.pc-btn {
  border: none;
  color: #041018;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(120deg, #2EE6A6, #29D0FF 55%, #FF6B4A);
  box-shadow: 0 10rpx 40rpx rgba(46, 230, 166, 0.28);
}

.pc-card {
  background: rgba(12, 28, 40, 0.72);
  border: 1px solid rgba(46, 230, 166, 0.18);
  backdrop-filter: blur(12px);
}
</style>
