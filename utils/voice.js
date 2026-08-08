/** 语音消息类型，与后端 ChatConstants.MSG_VOICE 一致 */
export const MSG_VOICE = 6

const TRANSCRIPT_PLACEHOLDERS = new Set([
  '空字符串',
  '空',
  '（空）',
  '(空)',
  '无',
  '无内容',
  '没有人声',
  '听不清',
  '无法识别',
  '无法转写',
  'no_speech',
  '[no_speech]',
  'null',
  'undefined',
  'empty',
  'emptystring',
  '(empty)',
  '(emptystring)',
  '""',
  "''"
])

function unwrapDecorations(text) {
  let t = String(text || '').trim()
  for (let i = 0; i < 3 && t.length >= 2; i++) {
    const a = t[0]
    const b = t[t.length - 1]
    const pair =
      (a === '"' && b === '"') ||
      (a === "'" && b === "'") ||
      (a === '「' && b === '」') ||
      (a === '『' && b === '』') ||
      (a === '(' && b === ')') ||
      (a === '（' && b === '）') ||
      (a === '[' && b === ']') ||
      (a === '【' && b === '】')
    if (!pair) break
    t = t.slice(1, -1).trim()
  }
  return t
}

/** 过滤 ASR 失败占位，避免气泡展示「(空字符串)」之类。 */
export function cleanVoiceTranscript(text) {
  if (text == null) return ''
  let t = unwrapDecorations(String(text).trim())
  if (!t) return ''
  const compact = t.replace(/\s+/g, '')
  const lower = compact.toLowerCase()
  if (TRANSCRIPT_PLACEHOLDERS.has(compact) || TRANSCRIPT_PLACEHOLDERS.has(lower)) return ''
  return t
}

export function parseVoiceExtra(extraJson) {
  try {
    let o = extraJson
    if (o == null || o === '') o = {}
    else if (typeof o === 'string') o = JSON.parse(o || '{}')
    else if (typeof o !== 'object') o = {}
    const duration = Number(o.duration)
    const transcript = cleanVoiceTranscript(o.transcript)
    return {
      duration: duration > 0 ? Math.round(duration) : 1,
      transcript
    }
  } catch {
    return { duration: 1, transcript: '' }
  }
}

export function formatVoiceDuration(sec) {
  return Math.max(1, Math.round(sec)) + "''"
}

export function voiceTranscriptText(extraJson) {
  return parseVoiceExtra(extraJson).transcript || ''
}
