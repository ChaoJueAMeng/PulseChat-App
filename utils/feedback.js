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
    current: 0
  }
})

let toastTimer = null
let modalHandlers = null
let sheetHandlers = null
let patched = false
let feedbackHostSeq = 0
let activeFeedbackHost = 0

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
    current = Math.min(Math.max(0, opts.current), urls.length - 1)
  } else if (typeof opts.current === 'string' && opts.current) {
    const idx = urls.indexOf(opts.current)
    current = idx >= 0 ? idx : 0
  }

  feedbackState.preview.urls = urls
  feedbackState.preview.current = current
  feedbackState.preview.show = true
  typeof opts.success === 'function' && opts.success({ errMsg: 'previewImage:ok' })
  typeof opts.complete === 'function' && opts.complete({ errMsg: 'previewImage:ok' })
}

export function closePreview() {
  feedbackState.preview.show = false
  feedbackState.preview.urls = []
  feedbackState.preview.current = 0
}

export function setPreviewCurrent(index) {
  const len = feedbackState.preview.urls.length
  if (!len) return
  feedbackState.preview.current = Math.min(Math.max(0, index), len - 1)
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
