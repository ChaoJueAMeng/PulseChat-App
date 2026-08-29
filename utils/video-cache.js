import { fullUrl } from './url.js'

const CACHE_KEY = 'pc_video_cache_v1'
/** 视频体积大，条目数低于图片缓存 */
const MAX_ENTRIES = 40

/** @type {Map<string, string>} remote -> local */
const memory = new Map()
/** @type {Map<string, Promise<string>>} */
const inflight = new Map()
/** @type {Map<string, any>} remote -> DownloadTask */
const inflightTasks = new Map()

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
  } catch (e) {}
}

function getDiskMap() {
  if (!diskMap) diskMap = readMap()
  return diskMap
}

function schedulePersist() {
  diskDirty = true
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (!diskDirty || !diskMap) return
    diskDirty = false
    writeMap(trimCache(diskMap))
  }, 800)
}

function isLocalMediaPath(path) {
  if (!path || typeof path !== 'string') return false
  const p = path.trim()
  if (!p) return false
  if (/^(file:|blob:|data:|wxfile:|content:|https?:\/\/tmp)/i.test(p)) return true
  if (p.startsWith('/static/')) return true
  if (/^(_www|_doc|_downloads|_documents)\//i.test(p)) return true
  if (p.includes('/uniapp_save/') || p.includes('_doc/')) return true
  return false
}

function normalizeRemote(path) {
  if (!path) return ''
  if (isLocalMediaPath(path)) return path
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

export function forgetVideoCached(path) {
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
    } catch (e) {}
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
    const task = uni.downloadFile({
      url,
      success: (res) => {
        inflightTasks.delete(url)
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('download status ' + res.statusCode))
      },
      fail: (err) => {
        inflightTasks.delete(url)
        reject(err)
      }
    })
    if (task) inflightTasks.set(url, task)
  })
}

/**
 * 同步窥探本地缓存，不触发下载。已缓存则返回本地路径，否则返回空串。
 */
export function peekVideoCached(path) {
  if (!path) return ''
  if (isLocalMediaPath(path)) return path
  const remote = normalizeRemote(path)
  if (!remote) return ''
  if (isLocalMediaPath(remote)) return remote
  const mem = memory.get(remote)
  if (mem) return mem
  const hit = getDiskMap()[remote]
  if (hit?.local) {
    memory.set(remote, hit.local)
    return hit.local
  }
  return ''
}

/** 中止该地址的后台下载，避免与播放器抢带宽 */
export function abortVideoDownload(path) {
  const remote = normalizeRemote(path)
  if (!remote) return
  const task = inflightTasks.get(remote)
  if (task && typeof task.abort === 'function') {
    try { task.abort() } catch (e) {}
  }
}

function isWebLike() {
  try {
    if (typeof plus === 'undefined') {
      const sys = uni.getSystemInfoSync?.() || {}
      return sys.uniPlatform === 'web' || sys.platform === 'devtools'
    }
  } catch (e) {}
  return false
}

/**
 * 同步取展示地址：有本地缓存则返回本地，否则返回网络地址并后台预取
 */
export function getVideoDisplayUrl(path) {
  if (!path) return ''
  if (isLocalMediaPath(path)) return path
  const remote = normalizeRemote(path)
  if (!remote) return ''
  if (isLocalMediaPath(remote)) return remote

  const mem = memory.get(remote)
  if (mem) {
    ensureVideoCached(remote).catch(() => {})
    return mem
  }

  const hit = getDiskMap()[remote]
  if (hit?.local) {
    memory.set(remote, hit.local)
    ensureVideoCached(remote).catch(() => {})
    return hit.local
  }

  ensureVideoCached(remote).catch(() => {})
  return remote
}

/**
 * 确保视频已落到本地，返回可播放路径（本地优先）
 */
export async function ensureVideoCached(path) {
  if (!path) return ''
  if (isLocalMediaPath(path)) return path

  const remote = normalizeRemote(path)
  if (!remote) return ''
  if (isLocalMediaPath(remote)) return remote

  // H5：依赖浏览器 HTTP 缓存
  if (isWebLike()) return remote

  const mem = memory.get(remote)
  if (mem && await fileExists(mem)) return mem
  if (mem) memory.delete(remote)

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
 * 上传成功后立刻把本地临时视频登记为远程 URL 的缓存
 */
export async function cacheVideoLocalAs(remotePath, localTempPath) {
  if (!localTempPath) return ''
  const remote = normalizeRemote(remotePath)
  if (!remote) {
    try {
      return await saveTempFile(localTempPath)
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

/** 批量预热聊天页视频消息 */
export function prefetchVideos(paths = []) {
  ;(paths || []).forEach((p) => {
    if (p) ensureVideoCached(p).catch(() => {})
  })
}
