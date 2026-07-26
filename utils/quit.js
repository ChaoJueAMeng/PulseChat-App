/**
 * 返回键：优先关闭主题浮层；Tab 根页双击退出用主题 Toast
 * （替代系统白底「再按一次退出应用」）
 */
import {
  toast,
  feedbackState,
  closePreview,
  resolveActionSheet,
  resolveModal,
  hideLoading
} from './feedback.js'

let lastBackAt = 0
const INTERVAL = 2000

/** 优先关掉主题浮层，避免直接退出 / 返回上一页 */
function consumeOverlayBack() {
  if (feedbackState.sheet.show) {
    resolveActionSheet(-1)
    return true
  }
  if (feedbackState.modal.show) {
    resolveModal({ confirm: false, cancel: true, content: '' })
    return true
  }
  if (feedbackState.loading.show) {
    hideLoading()
    return true
  }
  if (feedbackState.preview.show) {
    closePreview()
    return true
  }
  return false
}

/**
 * @param {{ quitOnRoot?: boolean }} [options]
 * @returns {boolean} true = 拦截系统默认返回
 */
export function handlePageBackPress(options = {}) {
  if (consumeOverlayBack()) return true
  if (!options.quitOnRoot) return false

  const now = Date.now()
  if (lastBackAt && now - lastBackAt < INTERVAL) {
    lastBackAt = 0
    // #ifdef APP-PLUS
    // 退到后台而非杀进程，以便继续接收消息并弹出系统通知
    try {
      if (typeof plus !== 'undefined' && plus.os.name === 'Android') {
        const main = plus.android.runtimeMainActivity()
        main.moveTaskToBack(true)
      } else {
        plus.runtime.quit()
      }
    } catch (e) {
      try { plus.runtime.quit() } catch (e2) {}
    }
    // #endif
    return true
  }

  lastBackAt = now
  toast({
    title: '再按一次关闭应用',
    icon: 'none',
    duration: INTERVAL,
    position: 'bottom'
  })
  return true
}

/** Tab 根页：双击退出 */
export function handleRootBackPress() {
  return handlePageBackPress({ quitOnRoot: true })
}
