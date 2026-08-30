import { reportCaught } from './error-report.js'

/** 视频消息类型，与后端 ChatConstants.MSG_VIDEO 一致 */
export const MSG_VIDEO = 7
/** 文件消息类型（历史兼容，已不再允许新发送），与后端 ChatConstants.MSG_FILE 一致 */
export const MSG_FILE = 8

/** 单文件上限，与后端 PulseChatProperties.Upload.maxBytes 一致 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return Math.round(n) + ' B'
  if (n < 1024 * 1024) {
    const kb = n / 1024
    return (kb < 10 ? kb.toFixed(1) : String(Math.round(kb))) + ' KB'
  }
  const mb = n / (1024 * 1024)
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + ' MB'
}

export function isPickCancel(err) {
  if (!err) return false
  const code = err.code ?? err.errCode
  if (Number(code) === 2101001) return true
  const msg = String(err.errMsg || err.message || '')
  return /cancel/i.test(msg)
}

export function fileNameFromPath(path) {
  const s = String(path || '').split('?')[0]
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  const name = i >= 0 ? s.slice(i + 1) : s
  try {
    return decodeURIComponent(name)
  } catch (e) {
    return name
  }
}

export function normalizeLocalPath(path) {
  return toUploadablePath(path)
}

/**
 * uni.uploadFile 在 Android 上对 file://、content:// 经常发不出 file 字段。
 * 统一成「无 scheme 的本地绝对路径」；保留 _doc 等相对路径作为候选时由调用方处理。
 */
export function toUploadablePath(path) {
  let s = String(path || '').trim()
  if (!s) return ''
  // content:// 不能直接 uploadFile
  if (/^content:\/\//i.test(s)) return ''
  try {
    if (typeof plus !== 'undefined' && plus.io && typeof plus.io.convertLocalFileSystemURL === 'function') {
      if (
        s.startsWith('file://')
        || s.startsWith('_doc')
        || s.startsWith('_www')
        || s.startsWith('_documents')
        || s.startsWith('_downloads')
      ) {
        const abs = plus.io.convertLocalFileSystemURL(s)
        if (abs) s = String(abs)
      }
    }
  } catch (e) {
    reportCaught('media-msg.catch', e, { level: 'debug' })
  }
  if (s.startsWith('file://')) s = s.slice(7)
  // Android 偶发 file:///path（三斜杠）
  if (s.startsWith('file:/') && !s.startsWith('file://')) {
    s = s.replace(/^file:/, '')
  }
  while (s.startsWith('file://')) s = s.slice(7)
  return s
}

/** 生成 uni.uploadFile / getFileInfo 的路径候选（绝对路径优先，禁止 content:// / 避免 file://） */
export function uploadPathCandidates(filePath) {
  const list = []
  const push = (p) => {
    let s = String(p || '').trim()
    if (!s || list.includes(s)) return
    if (/^content:\/\//i.test(s)) return
    // file:// 在部分 Android 上 getFileInfo 能过，但 uploadFile 发不出 file 字段
    if (s.startsWith('file://')) s = s.slice(7)
    while (s.startsWith('file://')) s = s.slice(7)
    if (!s || list.includes(s)) return
    list.push(s)
  }
  push(toUploadablePath(filePath))
  push(filePath)
  try {
    if (typeof plus !== 'undefined' && plus.io?.convertLocalFileSystemURL) {
      const raw = String(filePath || '')
      if (
        raw.startsWith('_doc')
        || raw.startsWith('_www')
        || raw.startsWith('_documents')
        || raw.startsWith('_downloads')
        || raw.startsWith('file://')
      ) {
        push(plus.io.convertLocalFileSystemURL(raw))
      }
    }
  } catch (e) {
    reportCaught('media-msg.catch', e, { level: 'debug' })
  }
  return list
}

