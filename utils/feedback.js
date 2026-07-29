/**
 * PulseChat 主题化提示层
 * 通过 installFeedback() 劫持 uni.showToast / showModal / showActionSheet / showLoading
 */
import { reactive } from 'vue'

export const feedbackState = reactive({
  toast: {
    show: false,
    title: '',
    icon: 'none',
    duration: 2000,
    position: 'center' // center | bottom
  },
  loading: {
    show: false,
    title: '加载中…',
    mask: true
  },
  modal: {
    show: false,
    title: '',
    content: '',
    confirmText: '确定',
    cancelText: '取消',
    showCancel: true,
    confirmColor: '',
    editable: false,
    placeholderText: '',
    editableValue: ''
  },
  sheet: {
    show: false,
    title: '',
    itemList: [],
    itemColor: ''
  },
  preview: {
    show: false,
    urls: [],
    /** 与 urls 一一对应的原始地址（添加表情等接口用，避免本地缓存路径） */
    sourceUrls: [],
    /**
     * 与 urls 一一对应的消息元数据（转发等用）
     * [{ messageId, msgType, imageIndex, sourceUrl }]
     */
    items: [],
    current: 0,
    /** 会话中是否还有更早图片（未加载历史）可继续拉取 */
    hasMoreEarlier: false,
    /** 正在拉取更早历史中的图片 */
    loadingEarlier: false
  }
})

let toastTimer = null
let modalHandlers = null
let sheetHandlers = null
let patched = false
let feedbackHostSeq = 0
let activeFeedbackHost = 0
/** 滑到相册更早边界时由业务页注入（如 chat 拉历史） */
let previewReachEarlierHandler = null
/** 预览长按「转发」时由业务页注入 */
let previewForwardHandler = null

function normalizePreviewItems(items, len) {
  if (!Array.isArray(items) || items.length !== len) return []
  return items.map((it) => (it && typeof it === 'object' ? { ...it } : null))
}

/** 仅当前页 pc-feedback 渲染浮层，避免 App 端多层原生 input 互相遮挡 */
export function acquireFeedbackHost() {
  activeFeedbackHost = ++feedbackHostSeq
  return activeFeedbackHost
}

export function isActiveFeedbackHost(id) {
  return !!id && id === activeFeedbackHost
}

function clearToastTimer() {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
}

export function toast(options = {}) {
  const opts = typeof options === 'string' ? { title: options } : (options || {})
  clearToastTimer()
  const title = String(opts.title || '')
  const icon = opts.icon || 'none'
  const duration = typeof opts.duration === 'number' ? opts.duration : 2000
  const position = opts.position === 'bottom' || opts.position === 'top'
    ? opts.position
    : 'center'

  // 先关再开，确保页面内组件能感知到变更
  feedbackState.toast.show = false
  feedbackState.toast.title = title
  feedbackState.toast.icon = icon
  feedbackState.toast.duration = duration
  feedbackState.toast.position = position

  setTimeout(() => {
    feedbackState.toast.show = true
    clearToastTimer()
    toastTimer = setTimeout(() => {
      feedbackState.toast.show = false
      toastTimer = null
      typeof opts.complete === 'function' && opts.complete()
    }, duration)
  }, 30)

  typeof opts.success === 'function' && opts.success({ errMsg: 'showToast:ok' })
}

export function hideToast() {
  clearToastTimer()
  feedbackState.toast.show = false
}

export function showLoading(options = {}) {
  const opts = typeof options === 'string' ? { title: options } : (options || {})
  feedbackState.loading.title = String(opts.title || '加载中…')
  feedbackState.loading.mask = opts.mask !== false
  feedbackState.loading.show = true
  typeof opts.success === 'function' && opts.success({ errMsg: 'showLoading:ok' })
}

export function hideLoading(options = {}) {
  feedbackState.loading.show = false
  typeof options?.success === 'function' && options.success({ errMsg: 'hideLoading:ok' })
}

export function showModal(options = {}) {
  const opts = options || {}
  return new Promise((resolve) => {
    modalHandlers = {
      resolve,
      success: opts.success,
      fail: opts.fail,
      complete: opts.complete
    }
    feedbackState.modal.title = String(opts.title || '提示')
    feedbackState.modal.content = String(opts.content || '')
    feedbackState.modal.confirmText = String(opts.confirmText || '确定')
    feedbackState.modal.cancelText = String(opts.cancelText || '取消')
    feedbackState.modal.showCancel = opts.showCancel !== false
    feedbackState.modal.confirmColor = opts.confirmColor || ''
    feedbackState.modal.editable = !!opts.editable
    feedbackState.modal.placeholderText = String(opts.placeholderText || '')
    feedbackState.modal.editableValue = String(opts.editableValue || '')
    feedbackState.modal.show = true
  })
}

export function resolveModal(result) {
  feedbackState.modal.show = false
  const handlers = modalHandlers
  modalHandlers = null
  const res = {
    confirm: !!result.confirm,
    cancel: !!result.cancel,
    content: result.content || '',
    errMsg: 'showModal:ok'
  }
  if (handlers) {
    typeof handlers.success === 'function' && handlers.success(res)
    typeof handlers.complete === 'function' && handlers.complete(res)
    handlers.resolve(res)
  }
}

export function showActionSheet(options = {}) {
  const opts = options || {}
  return new Promise((resolve, reject) => {
    sheetHandlers = {
      resolve,
      reject,
      success: opts.success,
      fail: opts.fail,
      complete: opts.complete
    }
    feedbackState.sheet.title = String(opts.title || '')
    feedbackState.sheet.itemList = Array.isArray(opts.itemList) ? opts.itemList.slice() : []
    feedbackState.sheet.itemColor = opts.itemColor || ''
    feedbackState.sheet.show = true
  })
}

export function resolveActionSheet(tapIndex) {
  feedbackState.sheet.show = false
  const handlers = sheetHandlers
  sheetHandlers = null
  if (tapIndex == null || tapIndex < 0) {
    const err = { errMsg: 'showActionSheet:fail cancel' }
    if (handlers) {
      typeof handlers.fail === 'function' && handlers.fail(err)
      typeof handlers.complete === 'function' && handlers.complete(err)
      handlers.reject(err)
    }
    return
  }
  const res = { tapIndex, errMsg: 'showActionSheet:ok' }
  if (handlers) {
    typeof handlers.success === 'function' && handlers.success(res)
    typeof handlers.complete === 'function' && handlers.complete(res)
    handlers.resolve(res)
  }
}

function clampPreviewIndex(index, len) {
  if (!len) return 0
  return Math.min(Math.max(0, index), len - 1)
}

/** 主题化图片预览（替代原生 previewImage，避免系统白底菜单） */
export function previewImage(options = {}) {
  const opts = options || {}
  const urls = Array.isArray(opts.urls)
    ? opts.urls.map((u) => String(u || '')).filter(Boolean)
    : []
  if (!urls.length) {
    const err = { errMsg: 'previewImage:fail urls empty' }
    typeof opts.fail === 'function' && opts.fail(err)
    typeof opts.complete === 'function' && opts.complete(err)
    return
  }

  let current = 0
  if (typeof opts.current === 'number') {
    current = clampPreviewIndex(opts.current, urls.length)
  } else if (typeof opts.current === 'string' && opts.current) {
    const idx = urls.indexOf(opts.current)
    current = idx >= 0 ? idx : 0
  }

  let sourceUrls = Array.isArray(opts.sourceUrls)
    ? opts.sourceUrls.map((u) => String(u || ''))
    : []
  if (sourceUrls.length !== urls.length) {
    sourceUrls = urls.slice()
  }

  if (typeof opts.onReachEarlier === 'function') {
    previewReachEarlierHandler = opts.onReachEarlier
  } else {
    previewReachEarlierHandler = null
  }
  if (typeof opts.onForward === 'function') {
    previewForwardHandler = opts.onForward
  } else {
    previewForwardHandler = null
  }

  feedbackState.preview.urls = urls
  feedbackState.preview.sourceUrls = sourceUrls
  feedbackState.preview.items = normalizePreviewItems(opts.items, urls.length)
  feedbackState.preview.current = current
  feedbackState.preview.hasMoreEarlier = !!opts.hasMoreEarlier
  feedbackState.preview.loadingEarlier = false
  feedbackState.preview.show = true
  typeof opts.success === 'function' && opts.success({ errMsg: 'previewImage:ok' })
  typeof opts.complete === 'function' && opts.complete({ errMsg: 'previewImage:ok' })
}

/**
 * 预览打开后动态更新相册（如滑到更早边界后插入历史图片）。
 * 调用方负责校正 current，避免 swiper 跳动到错误页。
 * 注意：urls 与 current 应同一次调用传入，便于预览组件批量同步。
 */
export function updatePreviewAlbum(options = {}) {
  const opts = options || {}
  if (!feedbackState.preview.show) return

  if (Array.isArray(opts.urls)) {
    const urls = opts.urls.map((u) => String(u || '')).filter(Boolean)
    if (!urls.length) return
    let sourceUrls = Array.isArray(opts.sourceUrls)
      ? opts.sourceUrls.map((u) => String(u || ''))
      : []
    if (sourceUrls.length !== urls.length) {
      sourceUrls = urls.slice()
    }
    const nextCurrent = typeof opts.current === 'number'
      ? clampPreviewIndex(opts.current, urls.length)
      : clampPreviewIndex(feedbackState.preview.current, urls.length)
    // 同一同步回合内写完，减少 swiper 先吃到「新列表 + 旧 index」
    feedbackState.preview.urls = urls
    feedbackState.preview.sourceUrls = sourceUrls
    if (Array.isArray(opts.items)) {
      feedbackState.preview.items = normalizePreviewItems(opts.items, urls.length)
    } else if (feedbackState.preview.items.length !== urls.length) {
      feedbackState.preview.items = []
    }
    feedbackState.preview.current = nextCurrent
  } else if (typeof opts.current === 'number') {
    feedbackState.preview.current = clampPreviewIndex(
      opts.current,
      feedbackState.preview.urls.length
    )
  }

  if (typeof opts.hasMoreEarlier === 'boolean') {
    feedbackState.preview.hasMoreEarlier = opts.hasMoreEarlier
  }
  if (typeof opts.loadingEarlier === 'boolean') {
    feedbackState.preview.loadingEarlier = opts.loadingEarlier
  }
  if (typeof opts.onReachEarlier === 'function') {
    previewReachEarlierHandler = opts.onReachEarlier
  }
  if (typeof opts.onForward === 'function') {
    previewForwardHandler = opts.onForward
  }
}

export function setPreviewReachEarlierHandler(fn) {
  previewReachEarlierHandler = typeof fn === 'function' ? fn : null
}

/** 由预览组件在滑近相册头部时调用 */
export function requestPreviewReachEarlier() {
  const fn = previewReachEarlierHandler
  if (typeof fn !== 'function') return Promise.resolve()
  return Promise.resolve().then(() => fn())
}

export function hasPreviewForwardHandler() {
  return typeof previewForwardHandler === 'function'
}

/** 由预览组件长按「转发」时调用 */
export function requestPreviewForward() {
  const fn = previewForwardHandler
  if (typeof fn !== 'function') return Promise.resolve()
  const idx = feedbackState.preview.current
  const item = Array.isArray(feedbackState.preview.items)
    ? feedbackState.preview.items[idx]
    : null
  const sourceUrl = feedbackState.preview.sourceUrls?.[idx]
    || feedbackState.preview.urls?.[idx]
    || ''
  const payload = item && typeof item === 'object'
    ? { ...item, sourceUrl: item.sourceUrl || sourceUrl }
    : { sourceUrl, messageId: null, msgType: null, imageIndex: 0 }
  return Promise.resolve().then(() => fn(payload, idx))
}

export function closePreview() {
  feedbackState.preview.show = false
  feedbackState.preview.urls = []
  feedbackState.preview.sourceUrls = []
  feedbackState.preview.items = []
  feedbackState.preview.current = 0
  feedbackState.preview.hasMoreEarlier = false
  feedbackState.preview.loadingEarlier = false
  previewReachEarlierHandler = null
  previewForwardHandler = null
}

export function setPreviewCurrent(index) {
  const len = feedbackState.preview.urls.length
  if (!len) return
  feedbackState.preview.current = clampPreviewIndex(index, len)
}

/** 劫持原生 uni 提示 API，全应用自动走主题化 UI */
export function installFeedback() {
  if (patched) return
  patched = true

  const nativeChooseImage = typeof uni.chooseImage === 'function'
    ? uni.chooseImage.bind(uni)
    : null

  uni.showToast = (options) => toast(options)
  uni.hideToast = (options) => hideToast(options)
  uni.showLoading = (options) => showLoading(options)
  uni.hideLoading = (options) => hideLoading(options)
  uni.showModal = (options) => {
    showModal(options)
  }
  uni.showActionSheet = (options) => {
    showActionSheet(options)
  }
  uni.previewImage = (options) => {
    previewImage(options)
  }

  // 选图来源菜单（拍摄 / 相册）改为主题化 ActionSheet，再调原生选图
  if (nativeChooseImage) {
    uni.chooseImage = (options = {}) => {
      const opts = options || {}
      const sourceType = Array.isArray(opts.sourceType) && opts.sourceType.length
        ? opts.sourceType.slice()
        : ['album', 'camera']
      const hasAlbum = sourceType.includes('album')
      const hasCamera = sourceType.includes('camera')

      // 仅一种来源时直接调原生，无需二次菜单
      if (!(hasAlbum && hasCamera)) {
        return nativeChooseImage(opts)
      }

      showActionSheet({
        itemList: ['拍摄', '从相册选择'],
        success: (res) => {
          const picked = res.tapIndex === 0 ? ['camera'] : ['album']
          nativeChooseImage({
            ...opts,
            sourceType: picked
          })
        },
        fail: (err) => {
          typeof opts.fail === 'function' && opts.fail(err)
          typeof opts.complete === 'function' && opts.complete(err)
        }
      })
    }
  }
}
