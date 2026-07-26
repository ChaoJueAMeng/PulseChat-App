/** 语音消息类型，与后端 ChatConstants.MSG_VOICE 一致 */
export const MSG_VOICE = 6

export function parseVoiceExtra(extraJson) {
  try {
    const o = JSON.parse(extraJson || '{}')
    const duration = Number(o.duration)
    return { duration: duration > 0 ? Math.round(duration) : 1 }
  } catch {
    return { duration: 1 }
  }
}

export function formatVoiceDuration(sec) {
  return Math.max(1, Math.round(sec)) + "''"
}
