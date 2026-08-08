<template>
  <view class="page pc-aurora" :class="pageAnimClass">
    <pc-chat-more-panel
      :conversation-id="conversationId"
      :initial-title="initialTitle"
      :active="!!conversationId"
      @close="goBack"
    />
  </view>
  <pc-feedback />
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow, onBackPress } from '@dcloudio/uni-app'
import { handlePageBackPress } from '../../utils/quit.js'
import PcChatMorePanel from '../../components/pc-chat-more-panel/pc-chat-more-panel.vue'

onBackPress(() => handlePageBackPress())

const conversationId = ref(null)
const initialTitle = ref('')
const pageAnimClass = ref('')
let playEnterOnShow = false
let enterTimer = null

function goBack() {
  uni.navigateBack()
}

onLoad((q) => {
  conversationId.value = Number(q.id)
  if (q.title) initialTitle.value = decodeURIComponent(q.title)
  playEnterOnShow = q.enter === '1' || q.enter === 1
})

onShow(() => {
  if (playEnterOnShow) {
    playEnterOnShow = false
    if (enterTimer) clearTimeout(enterTimer)
    pageAnimClass.value = 'pc-tab-enter-from-right'
    enterTimer = setTimeout(() => {
      enterTimer = null
      pageAnimClass.value = ''
    }, 260)
  }
})
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
</style>
