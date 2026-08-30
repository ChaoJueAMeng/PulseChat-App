import { fullUrl } from './url.js'
import { reportCaught } from './error-report.js'


const CACHE_KEY = 'pc_img_cache_v1'
const MAX_ENTRIES = 120

/** @type {Map<string, string>} remote -> local */
const memory = new Map()
/** @type {Map<string, Promise<string>>} */
const inflight = new Map()

/** 磁盘索引常驻内存，避免列表滚动时反复 getStorageSync */
let diskMap = null
let persistTimer = null
let diskDirty = false

function readMap() {
  try {
    return uni.getStorageSync(CACHE_KEY) || {}
  } catch (e) {
    return {}
  }
}

function writeMap(map) {
  try {
    uni.setStorageSync(CACHE_KEY, map || {})
  } catch (e) {
    reportCaught('image-cache.write', e)
  }
}

function getDiskMap() {
  if (!diskMap) diskMap = readMap()
  return diskMap
}

function schedulePersist() {
  diskDirty = true
  if (persistTimer) return
  // 合并写入，避免头像批量缓存时频繁 IO
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (!diskDirty || !diskMap) return
    diskDirty = false
    writeMap(trimCache(diskMap))
  }, 600)
}

/** 已是本地可直接展示的路径（无需再下载） */
export function isLocalMediaPath(path) {
  if (!path || typeof path !== 'string') return false
  const p = path.trim()
  if (!p) return false
  if (/^(file:|blob:|data:|wxfile:|content:|https?:\/\/tmp)/i.test(p)) return true
  if (p.startsWith('/static/')) return true
  if (/^(_www|_doc|_downloads|_documents)\//i.test(p)) return true
  // App 持久化路径常见形态
  if (p.includes('/uniapp_save/') || p.includes('uninotify') || p.includes('_doc/')) return true
  return false
}

function normalizeRemote(path) {
  if (!path) return ''
  if (isLocalMediaPath(path)) return path
  // 统一走 fullUrl：相对 /files/xxx、以及错误 host 的绝对地址都会归一到当前 BASE_URL
  return fullUrl(path)
}

function trimCache(map) {
  const entries = Object.entries(map)
  if (entries.length <= MAX_ENTRIES) return map
  entries.sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))
  const keep = entries.slice(entries.length - MAX_ENTRIES)
  const next = {}
  keep.forEach(([k, v]) => { next[k] = v })
  return next
}

function remember(remote, local) {
  if (!remote || !local) return
  memory.set(remote, local)
  const map = getDiskMap()
  map[remote] = { local, at: Date.now() }
  schedulePersist()
}

export function forgetCached(path) {
  const remote = normalizeRemote(path)
  if (!remote) return
  memory.delete(remote)
  const map = getDiskMap()
  if (map[remote]) {
    delete map[remote]
    schedulePersist()
  }
}

function fileExists(filePath) {
  return new Promise((resolve) => {
    if (!filePath) {
      resolve(false)
      return
    }
    try {
      if (typeof plus !== 'undefined' && plus.io && plus.io.resolveLocalFileSystemURL) {
        plus.io.resolveLocalFileSystemURL(
          filePath,
          () => resolve(true),
          () => resolve(false)
        )
        return
      }
    } catch (e) {
    reportCaught('image-cache.catch', e)
  }
    uni.getFileInfo({
      filePath,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

function saveTempFile(tempFilePath) {
  return new Promise((resolve, reject) => {
    uni.saveFile({
      tempFilePath,
      success: (res) => resolve(res.savedFilePath || tempFilePath),
      fail: (err) => reject(err || new Error('saveFile failed'))
    })
  })
}

function downloadToTemp(url) {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('download status ' + res.statusCode))
      },
      fail: reject
    })
  })
}

/**
 * 同步取展示地址：有本地缓存则返回本地，否则返回网络地址并后台预取
 */
export function getDisplayUrl(path) {
  if (!path) return ''
  if (isLocalMediaPath(path)) return path
  const remote = normalizeRemote(path)
  if (!remote) return ''
  if (isLocalMediaPath(remote)) return remote

  const mem = memory.get(remote)
  if (mem) {
    // 后台校验本地文件是否仍存在；失效时由 ensureCached / @error 回退网络地址
    ensureCached(remote).catch(() => {})
    return mem
  }

  const hit = getDiskMap()[remote]
  if (hit?.local) {
    memory.set(remote, hit.local)
    ensureCached(remote).catch(() => {})
    return hit.local
  }

  ensureCached(remote).catch(() => {})
  return remote
}

/**
 * 确保图片已落到本地，返回可展示路径（本地优先）
 */
export async function ensureCached(path) {
  if (!path) return ''
  if (isLocalMediaPath(path)) return path

  const remote = normalizeRemote(path)
  if (!remote) return ''
  if (isLocalMediaPath(remote)) return remote

  // H5：依赖浏览器 HTTP 缓存，不强制落盘
  try {
    if (typeof plus === 'undefined') {
      const sys = uni.getSystemInfoSync?.() || {}
      if (sys.uniPlatform === 'web' || sys.platform === 'devtools') {
        return remote
      }
    }
  } catch (e) {
    reportCaught('image-cache.catch', e)
  }

  const mem = memory.get(remote)
  if (mem && await fileExists(mem)) return mem
  if (mem) {
    memory.delete(remote)
  }

  const hit = getDiskMap()[remote]
  if (hit?.local && await fileExists(hit.local)) {
    memory.set(remote, hit.local)
    return hit.local
  }
  if (hit?.local) {
    delete getDiskMap()[remote]
    schedulePersist()
  }

  if (inflight.has(remote)) return inflight.get(remote)

  const task = (async () => {
    try {
      const temp = await downloadToTemp(remote)
      let local = temp
      try {
        local = await saveTempFile(temp)
      } catch (e) {
        // 部分端 saveFile 失败时仍可用临时路径（本次会话）
        local = temp
      }
      remember(remote, local)
      return local
    } finally {
      inflight.delete(remote)
    }
  })()

  inflight.set(remote, task)
  return task
}

/**
 * 将本地临时文件登记为某远程 URL 的缓存（上传成功后立刻可离线展示）
 */
export async function cacheLocalAs(remotePath, localTempPath) {
  if (!localTempPath) return ''
  const remote = normalizeRemote(remotePath)
  if (!remote) {
    // 无远程地址时，尽量持久化本地文件供后续使用
    try {
      const saved = await saveTempFile(localTempPath)
      return saved
    } catch (e) {
      return localTempPath
    }
  }
  if (isLocalMediaPath(remote)) return remote

  try {
    const saved = await saveTempFile(localTempPath)
    remember(remote, saved)
    return saved
  } catch (e) {
    remember(remote, localTempPath)
    return localTempPath
  }
}

/** 批量预热（聊天页图片消息等） */
export function prefetchAll(paths = []) {
  ;(paths || []).forEach((p) => {
    if (p) ensureCached(p).catch(() => {})
  })
}
