import { api } from './request.js'
import { getStore } from '../store/index.js'
import { cacheLocalAs } from './image-cache.js'
import { pickImages } from './media-pick.js'
import { reportCaught } from './error-report.js'

/** 无自定义头像时的默认占位图（本地静态资源） */
export const DEFAULT_AVATAR = '/static/avatar-default.png'

/** 选择图片并上传头像，返回更新后的用户对象 */
export async function pickAndUploadAvatar() {
  const choose = await pickImages({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera']
  })
  const filePath = choose.tempFilePaths?.[0]
  if (!filePath) {
    throw new Error('未选择图片')
  }

  uni.showLoading({ title: '上传中…', mask: true })
  try {
    const up = await api.upload(filePath, { category: 'avatar' })
    if (up?.url) {
      try { await cacheLocalAs(up.url, filePath) } catch (e) {
    reportCaught('avatar.catch', e)
  }
    }
    const user = await api.updateMe({ avatar: up.url })
    const store = getStore()
    store.state.user = user
    uni.setStorageSync('pc_user', user)
    uni.showToast({ title: '头像已更新', icon: 'none' })
    return user
  } finally {
    uni.hideLoading()
  }
}
