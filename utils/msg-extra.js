/** 解析消息 extraJson */
export function parseExtra(extraJson) {
  if (!extraJson) return {}
  if (typeof extraJson === 'object') return extraJson || {}
  try {
    const obj = JSON.parse(extraJson)
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) {
    return {}
  }
}

export function stringifyExtra(obj) {
  try {
    return JSON.stringify(obj || {})
  } catch (e) {
    return '{}'
  }
}

export function getReplyMeta(msg) {
  const extra = parseExtra(msg?.extraJson)
  return extra.reply || null
}

/** 图片消息配文（extraJson.caption） */
export function getCaption(msg) {
  const extra = parseExtra(msg?.extraJson)
  const cap = extra.caption
  if (cap == null) return ''
  const s = String(cap).trim()
  return s
}

/** 图片消息全部 URL：优先 extraJson.images，否则 content 单图 */
export function getImageUrls(msg) {
  const extra = parseExtra(msg?.extraJson)
  const list = Array.isArray(extra.images) ? extra.images : []
  const urls = []
  list.forEach((u) => {
    const s = u == null ? '' : String(u).trim()
    if (s && !urls.includes(s)) urls.push(s)
  })
  if (urls.length) return urls
  const single = msg?.content == null ? '' : String(msg.content).trim()
  return single ? [single] : []
}

export function getReactions(msg) {
  const extra = parseExtra(msg?.extraJson)
  const list = Array.isArray(extra.reactions) ? extra.reactions : []
  return list.filter(r => r && r.emoji)
}

/** 合并/切换表情回应（同一用户同一表情再点则取消） */
export function toggleReaction(msg, emoji, userId) {
  const extra = parseExtra(msg?.extraJson)
  const reactions = Array.isArray(extra.reactions) ? [...extra.reactions] : []
  const uid = userId != null ? Number(userId) : null
  const idx = reactions.findIndex(
    r => r.emoji === emoji && (uid == null || Number(r.userId) === uid)
  )
  let active = true
  if (idx >= 0) {
    reactions.splice(idx, 1)
    active = false
  } else {
    reactions.push({ emoji, userId: uid, at: Date.now() })
    active = true
  }
  return {
    extraJson: stringifyExtra({ ...extra, reactions }),
    active,
    reactions
  }
}

/** 按远端事件设置表情（active=true 添加，false 移除） */
export function setReaction(msg, emoji, userId, active) {
  const extra = parseExtra(msg?.extraJson)
  const reactions = Array.isArray(extra.reactions) ? [...extra.reactions] : []
  const uid = userId != null ? Number(userId) : null
  const idx = reactions.findIndex(
    r => r.emoji === emoji && (uid == null || Number(r.userId) === uid)
  )
  if (active) {
    if (idx < 0) reactions.push({ emoji, userId: uid, at: Date.now() })
  } else if (idx >= 0) {
    reactions.splice(idx, 1)
  }
  return stringifyExtra({ ...extra, reactions })
}

export function buildReplyExtra(target, senderName, baseExtra) {
  if (!target) return baseExtra ? stringifyExtra(baseExtra) : undefined
  const preview = msgPreviewText(target)
  const extra = { ...(baseExtra || {}) }
  extra.reply = {
    msgId: target.id,
    senderId: target.senderId,
    senderName: senderName || '用户',
    msgType: target.msgType,
    content: preview
  }
  return stringifyExtra(extra)
}

export function msgPreviewText(m, max = 48) {
  if (!m) return ''
  if (m.msgType === 2) {
    const n = getImageUrls(m).length
    const prefix = n > 1 ? `[图片×${n}]` : '[图片]'
    const cap = getCaption(m)
    const raw = cap ? `${prefix} ${cap.replace(/\s+/g, ' ').trim()}` : prefix
    return raw.length > max ? raw.slice(0, max) + '…' : raw
  }
  if (m.msgType === 3) return '[表情]'
  if (m.msgType === 6) return '[语音]'
  if (m.msgType === 4) return '已撤回的消息'
  if (m.msgType === 5) return String(m.content || '').slice(0, max) || '[AI]'
  const raw = String(m.content || '').replace(/\s+/g, ' ').trim()
  if (!raw) return '[消息]'
  return raw.length > max ? raw.slice(0, max) + '…' : raw
}

/** 聚合展示用：[{ emoji, count, mine }] */
export function groupReactions(reactions, myId) {
  const map = new Map()
  ;(reactions || []).forEach((r) => {
    if (!r?.emoji) return
    const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false }
    cur.count += 1
    if (myId != null && Number(r.userId) === Number(myId)) cur.mine = true
    map.set(r.emoji, cur)
  })
  return Array.from(map.values())
}
