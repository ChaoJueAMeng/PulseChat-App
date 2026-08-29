// #ifdef APP-PLUS
import { chooseSystemMedia } from '@/uni_modules/uni-chooseSystemImage'
// #endif
import { showActionSheet } from './feedback.js'
import {
  MAX_UPLOAD_BYTES,
  fileNameFromPath,
  normalizeLocalPath
} from './media-msg.js'

function isAndroidApp() {
  let android = false
  // #ifdef APP-PLUS
  try {
    android = String(plus.os.name || '').toLowerCase() === 'android'
  } catch (e) {
    android = false
  }
  // #endif
  return android
}

function getFileSize(filePath) {
  return new Promise((resolve) => {
    uni.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size) || 0),
      fail: () => resolve(-1)
    })
  })
}

export async function assertUnderUploadLimit(path, knownSize) {
  let size = knownSize
  // SAF 等来源偶发 size=0/未知，以本地 getFileInfo 为准
  if (size == null || !(Number(size) > 0)) {
    size = await getFileSize(path)
  }
  size = Number(size)
  if (!(size > 0)) {
    const alt = normalizeLocalPath(path)
    if (alt && alt !== path) {
      size = await getFileSize(alt)
    }
  }
  size = Number(size)
  if (!(size > 0)) {
    const err = new Error('文件为空或无法读取，请重新选择')
    uni.showToast({ title: err.message, icon: 'none' })
    throw err
  }
  if (size > MAX_UPLOAD_BYTES) {
    const err = new Error('文件不能超过 100MB')
    uni.showToast({ title: err.message, icon: 'none' })
    throw err
  }
  return size
}

function pickViaPlugin({ count, mediaType }) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    if (typeof chooseSystemMedia === 'function') {
      chooseSystemMedia({
        count: Math.max(1, Number(count) || 1),
        mediaType: mediaType || ['image'],
        pageOrientation: 'portrait',
        success: resolve,
        fail: reject
      })
      return
    }
    // #endif
    reject(new Error('系统选图不可用'))
  })
}

function pickViaChooseImage({ count, sizeType, sourceType }) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      sizeType,
      sourceType,
      success: resolve,
      fail: reject
    })
  })
}

async function toChooseImageResult(paths) {
  const list = (paths || []).map(normalizeLocalPath).filter(Boolean)
  for (const p of list) {
    await assertUnderUploadLimit(p)
  }
  return {
    tempFilePaths: list,
    tempFiles: list.map((path) => ({ path })),
    paths: list
  }
}

/**
 * 选图。Android App 相册走系统 Photo Picker（uni-chooseSystemMedia），
 * 拍摄仍用相机；其它端走 uni.chooseImage。
 */
export async function pickImages(options = {}) {
  const count = Math.max(1, Number(options.count) || 1)
  const sourceType = Array.isArray(options.sourceType) && options.sourceType.length
    ? options.sourceType.slice()
    : ['album', 'camera']
  const sizeType = options.sizeType
  const hasAlbum = sourceType.includes('album')
  const hasCamera = sourceType.includes('camera')

  if (isAndroidApp() && hasAlbum && hasCamera) {
    const tapIndex = await new Promise((resolve, reject) => {
      showActionSheet({
        itemList: ['拍摄', '从相册选择'],
        success: (res) => resolve(res.tapIndex),
        fail: reject
      })
    })
    if (tapIndex === 0) {
      const res = await pickViaChooseImage({ count, sizeType, sourceType: ['camera'] })
      return toChooseImageResult(res.tempFilePaths || [])
    }
    const pluginRes = await pickViaPlugin({ count, mediaType: ['image'] })
    return toChooseImageResult(pluginRes.filePaths || [])
  }

  if (isAndroidApp() && hasAlbum) {
    const pluginRes = await pickViaPlugin({ count, mediaType: ['image'] })
    return toChooseImageResult(pluginRes.filePaths || [])
  }

  const res = await pickViaChooseImage({ count, sizeType, sourceType })
  return toChooseImageResult(res.tempFilePaths || [])
}

/**
 * 选 1 个视频。Android App 走系统选择器，其它端走 uni.chooseVideo。
 */
export async function pickVideos(options = {}) {
  if (isAndroidApp()) {
    const pluginRes = await pickViaPlugin({ count: 1, mediaType: ['video'] })
    const raw = (pluginRes.filePaths || [])[0]
    const path = normalizeLocalPath(raw)
    if (!path) throw new Error('未选择视频或本地缓存失败')
    const size = await assertUnderUploadLimit(path)
    if (!(size > 0)) throw new Error('视频文件为空，请重新选择')
    return { path, size, name: fileNameFromPath(path) }
  }
  if (typeof uni.chooseVideo !== 'function') {
    throw new Error('当前平台暂不支持选择视频')
  }
  const res = await new Promise((resolve, reject) => {
    uni.chooseVideo({
      sourceType: options.sourceType || ['album', 'camera'],
      compressed: false,
      success: resolve,
      fail: reject
    })
  })
  const path = normalizeLocalPath(res.tempFilePath)
  if (!path) throw new Error('未选择视频')
  const size = await assertUnderUploadLimit(path, res.size)
  if (!(size > 0)) throw new Error('视频文件为空，请重新选择')
  return {
    path,
    size,
    duration: res.duration,
    width: res.width,
    height: res.height,
    name: fileNameFromPath(path) || res.name
  }
}

export { isAndroidApp }
