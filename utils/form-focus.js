import { ref } from 'vue'

/**
 * 表单输入聚焦辅助：
 * - fieldClass(name)：给当前聚焦的输入框叠加 .is-focus 高亮
 * - focusNext(name)：键盘「下一项」时把焦点程序化移到下一输入框（配合 :focus="focusTarget === name"）
 */
export function useFormFocus() {
  const focusField = ref('')
  /** 程序化聚焦目标；先清空再赋值，确保 :focus 能从 false → true 触发 */
  const focusTarget = ref('')
  let nextTimer = null

  function onFocus(name) {
    focusField.value = name
  }

  function onBlur() {
    focusField.value = ''
    // 任一输入框失焦后，之前的程序化聚焦请求即已完成，清掉以便下次可再次触发
    focusTarget.value = ''
  }

  function fieldClass(name) {
    return { 'is-focus': focusField.value === name }
  }

  function focusNext(name) {
    if (nextTimer) {
      clearTimeout(nextTimer)
      nextTimer = null
    }
    focusTarget.value = ''
    nextTimer = setTimeout(() => {
      nextTimer = null
      focusTarget.value = name
    }, 60)
  }

  return { focusField, focusTarget, onFocus, onBlur, fieldClass, focusNext }
}
