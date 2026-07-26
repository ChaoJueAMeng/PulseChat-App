<template>
  <view
    class="pc-avatar"
    :class="{ 'pc-avatar--clickable': clickable }"
    :style="wrapStyle"
    @tap="onTap"
  >
    <image
      class="pc-avatar__img"
      :src="imageSrc"
      mode="aspectFill"
      lazy-load
      :fade-show="false"
      @error="onImageError"
    />
    <view v-if="badgeText" class="pc-avatar__badge">{{ badgeText }}</view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getDisplayUrl, ensureCached, forgetCached, isLocalMediaPath } from '../../utils/image-cache.js'
import { DEFAULT_AVATAR } from '../../utils/avatar.js'

const SIZE_MAP = { sm: 76, md: 80, lg: 128, xl: 168 }

const props = defineProps({
  url: { type: String, default: '' },
  src: { type: String, default: '' },
  name: { type: String, default: '?' },
  size: { type: [Number, String], default: 80 },
  badge: { type: String, default: '' },
  showBadge: { type: Boolean, default: false },
  seed: { type: [Number, String], default: 0 },
  clickable: { type: Boolean, default: false }
})

const emit = defineEmits(['tap'])

const imageFailed = ref(false)
const imageSrc = ref(DEFAULT_AVATAR)
const avatarUrl = computed(() => props.url || props.src || '')
let resolveToken = 0

async function resolveImage() {
  const token = ++resolveToken
  imageFailed.value = false
  const raw = avatarUrl.value
  if (!raw) {
    imageSrc.value = DEFAULT_AVATAR
    return
  }

  const display = getDisplayUrl(raw)
  if (token !== resolveToken) return
  imageSrc.value = display || DEFAULT_AVATAR

  try {
    const local = await ensureCached(raw)
    if (token !== resolveToken) return
    if (local && local !== imageSrc.value) {
      imageSrc.value = local
    }
  } catch (e) {}
}

watch(avatarUrl, () => { resolveImage() }, { immediate: true })

const badgeText = computed(() => props.badge || (props.showBadge ? 'AI' : ''))

const resolvedSize = computed(() => {
  if (typeof props.size === 'string' && SIZE_MAP[props.size]) {
    return SIZE_MAP[props.size]
  }
  return Number(props.size) || 80
})

const wrapStyle = computed(() => ({
  width: resolvedSize.value + 'rpx',
  height: resolvedSize.value + 'rpx'
}))

function onImageError() {
  const cur = imageSrc.value
  if (!cur || cur === DEFAULT_AVATAR) {
    imageFailed.value = true
    imageSrc.value = DEFAULT_AVATAR
    return
  }
  // 本地缓存损坏：清缓存后回退网络地址再试一次
  if (isLocalMediaPath(cur) && avatarUrl.value) {
    forgetCached(avatarUrl.value)
    const remote = getDisplayUrl(avatarUrl.value)
    if (remote && remote !== cur) {
      imageSrc.value = remote
      return
    }
  }
  imageFailed.value = true
  imageSrc.value = DEFAULT_AVATAR
}

function onTap(e) {
  if (props.clickable) emit('tap', e)
}
</script>

<style scoped lang="scss">
.pc-avatar {
  position: relative;
  flex-shrink: 0;
  border-radius: $pc-radius-md;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $pc-bg-3;
}

.pc-avatar--clickable:active {
  transform: scale(0.96);
  opacity: 0.92;
}

.pc-avatar__img {
  width: 100%;
  height: 100%;
  display: block;
}

.pc-avatar__badge {
  position: absolute;
  right: -4rpx;
  bottom: -4rpx;
  padding: 2rpx 10rpx;
  border-radius: $pc-radius-pill;
  background: linear-gradient(135deg, $pc-purple-deep, $pc-red);
  color: #fff;
  font-size: 18rpx;
  font-weight: 700;
  border: 2rpx solid rgba(10, 6, 20, 0.85);
}
</style>
