/**
 * 客户端错误上报：统一记录原先被空 catch 吞掉的异常。
 * - 本地 console 始终输出，便于调试
 * - 可选上报后端 /api/client/errors（接口不存在或失败时静默忽略）
 * - 同 scope+message 短时去重，避免刷屏
 */
import { BASE_URL } from './config.js'

const REPORT_PATH = '/api/client/errors'
const DEDUPE_WINDOW_MS = 15000
const MAX_QUEUE = 20
const FLUSH_INTERVAL_MS = 4000

/** @type {Map<string, number>} */
const recentKeys = new Map()
/** @type {Array<object>} */
const queue = []
let flushTimer = null
let reporting = false
let handlersInstalled = false

function now() {
  return Date.now()
}

function pruneRecent(ts) {
  for (const [k, t] of recentKeys) {
    if (ts - t > DEDUPE_WINDOW_MS) recentKeys.delete(k)
  }
}

function normalizeError(err) {
  if (err == null) {
    return { name: 'Unknown', message: '', stack: '' }
  }
  if (typeof err === 'string') {
    return { name: 'Error', message: err, stack: '' }
  }
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: String(err.message || ''),
      stack: String(err.stack || '')
    }
  }
  if (typeof err === 'object') {
    const message = String(err.message || err.errMsg || err.msg || JSON.stringify(err)).slice(0, 500)
    return {
      name: String(err.name || err.errCode || 'Error'),
      message,
      stack: String(err.stack || '')
    }
  }
  return { name: 'Error', message: String(err), stack: '' }
}

function buildPayload(scope, err, extra) {
  const normalized = normalizeError(err)
  const system = (() => {
    try {
      return uni.getSystemInfoSync() || {}
    } catch (_) {
      return {}
    }
  })()
  return {
    scope: String(scope || 'unknown'),
    name: normalized.name,
    message: normalized.message.slice(0, 500),
    stack: normalized.stack.slice(0, 2000),
    extra: extra && typeof extra === 'object' ? extra : undefined,
    platform: system.uniPlatform || system.platform || '',
    osName: system.osName || system.system || '',
    appVersion: system.appVersion || system.appWgtVersion || '',
    ts: now()
  }
}

function dedupeKey(payload) {
  return `${payload.scope}|${payload.name}|${payload.message}`
}

function shouldSkip(payload) {
  const ts = now()
  pruneRecent(ts)
  const key = dedupeKey(payload)
  const last = recentKeys.get(key)
  if (last && ts - last < DEDUPE_WINDOW_MS) return true
  recentKeys.set(key, ts)
  return false
}

function readAccessToken() {
  try {
    return uni.getStorageSync('pc_token') || ''
  } catch (_) {
    return ''
  }
}

function enqueue(payload) {
  queue.push(payload)
  while (queue.length > MAX_QUEUE) queue.shift()
  scheduleFlush()
}

function scheduleFlush() {
  if (flushTimer || reporting) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushQueue()
  }, FLUSH_INTERVAL_MS)
}

function flushQueue() {
  if (reporting || !queue.length) return
  const batch = queue.splice(0, queue.length)
  reporting = true
  const token = readAccessToken()
  const header = {
    'Content-Type': 'application/json;charset=UTF-8',
    Accept: 'application/json'
  }
  if (token) header.Authorization = 'Bearer ' + token

  uni.request({
    url: BASE_URL + REPORT_PATH,
    method: 'POST',
    data: { events: batch },
    header,
    timeout: 8000,
    complete: () => {
      reporting = false
      if (queue.length) scheduleFlush()
    }
  })
}

/**
 * 上报已捕获异常（替代空 catch）。
 * @param {string} scope 业务位点，如 'ws.emit' / 'message-cache.write'
 * @param {any} err
 * @param {object} [extra]
 */
export function reportCaught(scope, err, extra) {
  const payload = buildPayload(scope, err, extra)
  if (shouldSkip(payload)) return

  try {
    console.warn('[error-report]', payload.scope, payload.message || payload.name, err)
  } catch (_) {}

  // debug 级仅本地日志，不上报（能力探测、预期失败等）
  if (extra && extra.level === 'debug') return

  try {
    enqueue(payload)
  } catch (_) {}
}

/** 主动上报非 catch 场景（断言失败、业务异常等） */
export function reportError(scope, err, extra) {
  reportCaught(scope, err, extra)
}

/**
 * 包装可能抛错的同步逻辑；失败时上报并返回 fallback。
 * @template T
 * @param {string} scope
 * @param {() => T} fn
 * @param {T} [fallback]
 * @returns {T}
 */
export function guardSync(scope, fn, fallback) {
  try {
    return fn()
  } catch (e) {
    reportCaught(scope, e)
    return fallback
  }
}

/** 注册 uni / App 全局未处理错误监听（幂等） */
export function installErrorReporting() {
  if (handlersInstalled) return
  handlersInstalled = true

  try {
    if (typeof uni !== 'undefined' && typeof uni.onError === 'function') {
      uni.onError((msg) => {
        reportCaught('uni.onError', msg)
      })
    }
  } catch (e) {
    reportCaught('error-report.install.onError', e, { level: 'debug' })
  }

  try {
    if (typeof uni !== 'undefined' && typeof uni.onUnhandledRejection === 'function') {
      uni.onUnhandledRejection((res) => {
        reportCaught('uni.onUnhandledRejection', (res && (res.reason || res)) || 'unhandledrejection')
      })
    }
  } catch (e) {
    reportCaught('error-report.install.onUnhandledRejection', e, { level: 'debug' })
  }

  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.globalEvent && typeof plus.globalEvent.addEventListener === 'function') {
      plus.globalEvent.addEventListener('plusError', (e) => {
        reportCaught('plus.plusError', e)
      })
    }
  } catch (e) {
    reportCaught('error-report.install.plusError', e, { level: 'debug' })
  }
  // #endif
}
