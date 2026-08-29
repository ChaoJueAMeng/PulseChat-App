/**
 * 会话最近一页消息本地缓存：冷启动/进房先渲染，再由网络刷新。
 * 仅缓存已落库消息（有 id、非 streaming），每会话最多 MAX_MSGS 条。
 */

const INDEX_KEY = 'pc_msg_cache_index'
const KEY_PREFIX = 'pc_msg_hist_'
const MAX_MSGS = 30
const MAX_CONVS = 40
const PERSIST_DEBOUNCE_MS = 280

/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const persistTimers = new Map()

function storageKey(conversationId) {
  return KEY_PREFIX + Number(conversationId)
}

function readIndex() {
  try {
    const list = uni.getStorageSync(INDEX_KEY)
    return Array.isArray(list) ? list.map(Number).filter((id) => id > 0) : []
  } catch (e) {
    return []
  }
}

function writeIndex(ids) {
  try {
    uni.setStorageSync(INDEX_KEY, ids || [])
  } catch (e) {}
}

function touchIndex(conversationId) {
  const id = Number(conversationId)
  if (!id) return
  const next = [id, ...readIndex().filter((x) => x !== id)].slice(0, MAX_CONVS)
  const dropped = readIndex().filter((x) => !next.includes(x))
  writeIndex(next)
  for (const oldId of dropped) {
    try {
      uni.removeStorageSync(storageKey(oldId))
    } catch (e) {}
  }
}

/** 去掉仅前端用的临时字段，缩小存储体积 */
function toCacheRow(msg) {
  if (!msg || typeof msg !== 'object' || msg.id == null) return null
  if (msg.streaming) return null
  const row = { ...msg }
  delete row.streaming
  delete row.__imageUrls
  delete row.__imageCount
  delete row.__imageCaption
  delete row.__pending
  delete row.__fail
  return row
}

/**
 * @param {number|string} conversationId
 * @returns {Array<object>}
 */
export function getCachedMessages(conversationId) {
  const id = Number(conversationId)
  if (!id) return []
  try {
    const list = uni.getStorageSync(storageKey(id))
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

/**
 * @param {number|string} conversationId
 * @param {Array<object>} messages 当前会话已加载消息（升序）；只持久化末尾一页
 */
export function setCachedMessages(conversationId, messages) {
  const id = Number(conversationId)
  if (!id) return
  const rows = (messages || [])
    .map(toCacheRow)
    .filter(Boolean)
    .slice(-MAX_MSGS)
  try {
    if (!rows.length) {
      uni.removeStorageSync(storageKey(id))
      writeIndex(readIndex().filter((x) => x !== id))
      return
    }
    uni.setStorageSync(storageKey(id), rows)
    touchIndex(id)
  } catch (e) {
    // 存储满等失败时忽略，不影响主流程
  }
}

/** 合并多次 upsert，减少 IO */
export function scheduleCacheMessages(conversationId, messages) {
  const id = Number(conversationId)
  if (!id) return
  const prev = persistTimers.get(id)
  if (prev) clearTimeout(prev)
  persistTimers.set(
    id,
    setTimeout(() => {
      persistTimers.delete(id)
      setCachedMessages(id, messages)
    }, PERSIST_DEBOUNCE_MS)
  )
}

export function clearCachedMessages(conversationId) {
  const id = Number(conversationId)
  if (!id) return
  const prev = persistTimers.get(id)
  if (prev) {
    clearTimeout(prev)
    persistTimers.delete(id)
  }
  try {
    uni.removeStorageSync(storageKey(id))
  } catch (e) {}
  writeIndex(readIndex().filter((x) => x !== id))
}

export function clearAllMessageCaches() {
  for (const timer of persistTimers.values()) clearTimeout(timer)
  persistTimers.clear()
  const ids = readIndex()
  for (const id of ids) {
    try {
      uni.removeStorageSync(storageKey(id))
    } catch (e) {}
  }
  try {
    uni.removeStorageSync(INDEX_KEY)
  } catch (e) {}
}
