const PIN_KEY = 'pc_conv_pin'
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

export function isPinned(conversationId) {
  const map = readMap(PIN_KEY)
  return !!map[String(conversationId)]
}

export function setPinned(conversationId, pinned) {
  const map = readMap(PIN_KEY)
  const id = String(conversationId)
  if (pinned) map[id] = Date.now()
  else delete map[id]
  writeMap(PIN_KEY, map)
}

export function getPinnedIds() {
  const map = readMap(PIN_KEY)
  return Object.entries(map)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .map(([id]) => Number(id))
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

export function sortConversations(list) {
  const pinned = getPinnedIds()
  const pinRank = new Map(pinned.map((id, idx) => [id, idx]))
  return [...(list || [])].sort((a, b) => {
    const pa = pinRank.has(a.id) ? pinRank.get(a.id) : 9999
    const pb = pinRank.has(b.id) ? pinRank.get(b.id) : 9999
    if (pa !== pb) return pa - pb
    const ta = a.lastMsgAt ? new Date(a.lastMsgAt).getTime() : 0
    const tb = b.lastMsgAt ? new Date(b.lastMsgAt).getTime() : 0
    return tb - ta
  })
}
