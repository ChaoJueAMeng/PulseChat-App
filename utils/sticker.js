/** 表情包消息类型，与后端 ChatConstants.MSG_EMOJI 一致 */
export const MSG_EMOJI = 3

/** 每位用户最多表情包数量 */
export const MAX_USER_STICKERS = 100

/** 单张表情包上限，与后端 FileStorageService.STICKER_MAX_BYTES 一致 */
export const STICKER_MAX_BYTES = 2 * 1024 * 1024

function getFileSize(filePath) {
  return new Promise((resolve) => {
    uni.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size) || 0),
      fail: () => resolve(-1)
    })
  })
}

/**
 * 从 chooseImage 结果中剔除超过 2MB 的图片。
 * @returns {{ paths: string[], skipped: number }}
 */
export async function filterOversizedStickerPaths(chooseRes) {
  const paths = chooseRes?.tempFilePaths || []
  const tempFiles = chooseRes?.tempFiles || []
  const sizeMap = Object.create(null)
  for (const f of tempFiles) {
    const p = f?.path || f?.tempFilePath
    if (p != null && f.size != null) sizeMap[p] = Number(f.size) || 0
  }
  const ok = []
  let skipped = 0
  for (const p of paths) {
    let size = sizeMap[p]
    if (size == null) size = await getFileSize(p)
    // size < 0 表示无法探测，交给上传接口校验
    if (size > STICKER_MAX_BYTES) {
      skipped++
      continue
    }
    ok.push(p)
  }
  return { paths: ok, skipped }
}

export function formatStickerAddToast(added, skipped) {
  if (added > 0 && skipped > 0) return `已添加 ${added} 个，已跳过 ${skipped} 张超限图片`
  if (added > 0) return `已添加 ${added} 个`
  if (skipped > 0) return `已跳过 ${skipped} 张超限图片`
  return '添加失败'
}

function isOversizedUploadError(err) {
  const msg = err?.message || ''
  return msg.includes('2MB') || msg.includes('不能超过')
}

/**
 * 批量上传并添加表情包：超 2MB 的图片仅跳过，其余继续添加。
 * @returns {{ created: any[], added: number, skipped: number }}
 */
export async function batchUploadStickers(api, chooseRes, options = {}) {
  const currentCount = options.currentCount || 0
  const max = options.max || MAX_USER_STICKERS
  const { paths, skipped: skippedSize } = await filterOversizedStickerPaths(chooseRes)
  let skipped = skippedSize
  const items = []
  for (const p of paths) {
    if (currentCount + items.length >= max) break
    try {
      const up = await api.upload(p, { category: 'sticker' })
      if (up?.url) items.push({ url: up.url })
    } catch (e) {
      if (isOversizedUploadError(e)) {
        skipped++
        continue
      }
      throw e
    }
  }
  if (!items.length) {
    return { created: [], added: 0, skipped }
  }
  const created = await api.batchAddStickers(items)
  return { created: created || [], added: items.length, skipped }
}
