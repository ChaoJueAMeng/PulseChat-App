const BG_KEY = 'pc_conv_bg'



function readMap(key) {

  try {

    return uni.getStorageSync(key) || {}

  } catch (e) {

    return {}

  }

}



function writeMap(key, map) {

  try {

    uni.setStorageSync(key, map || {})

  } catch (e) {}

}



export function isPinned(conversation) {

  if (conversation == null) return false

  if (typeof conversation === 'object') {

    return !!(Number(conversation.pinned) || Number(conversation.pin))

  }

  return false

}



export function draftText(conversation) {

  const raw = typeof conversation?.draftText === 'string' ? conversation.draftText : ''

  return raw.trim()

}



export function hasDraft(conversation) {

  return !!draftText(conversation)

}



export function conversationPreview(conversation) {

  const draft = draftText(conversation)

  if (draft) return '草稿：' + draft

  return conversation?.lastMsgPreview || '开始一段脉冲对话吧'

}



export function getBackground(conversationId) {

  const map = readMap(BG_KEY)

  return map[String(conversationId)] || ''

}



export function setBackground(conversationId, url) {

  const map = readMap(BG_KEY)

  const id = String(conversationId)

  if (url) map[id] = url

  else delete map[id]

  writeMap(BG_KEY, map)

}



/**

 * 以云端会话详情为准刷新本地背景缓存。

 * - detail.background 有值：写入本地

 * - detail 明确带 background 且为空：清除本地

 * - 字段缺失：保留本地缓存

 */

export function syncBackgroundFromDetail(conversationId, detail) {

  if (conversationId == null || detail == null || typeof detail !== 'object') {

    return getBackground(conversationId)

  }

  if (!Object.prototype.hasOwnProperty.call(detail, 'background')) {

    return getBackground(conversationId)

  }

  const url = typeof detail.background === 'string' ? detail.background.trim() : ''

  setBackground(conversationId, url)

  return url

}



/** 最近活动时间：草稿更新与最后消息同等权重，取较新者。 */

function activityAt(conversation) {

  const msgAt = conversation?.lastMsgAt ? new Date(conversation.lastMsgAt).getTime() : 0

  const draftAt = hasDraft(conversation) ? (Number(conversation?.draftUpdatedAt) || 0) : 0

  const msg = Number.isFinite(msgAt) ? msgAt : 0

  return Math.max(msg, draftAt)

}



export function sortConversations(list) {

  return [...(list || [])].sort((a, b) => {

    const pa = Number(a?.pinnedAt) || 0

    const pb = Number(b?.pinnedAt) || 0

    if (pa !== pb) return pb - pa

    const ta = activityAt(a)

    const tb = activityAt(b)

    if (ta !== tb) return tb - ta

    return (Number(b?.id) || 0) - (Number(a?.id) || 0)

  })

}


