'use strict'

/**
 * UniPush 2.0 云函数：供 Java 后端 URL 化调用。
 *
 * 依赖扩展库 uni-cloud-push，且云数据库必须存在这 3 张表（正式版不会自动建）：
 *   opendb-tempdata、opendb-device、uni-id-device
 * 缺表时底层会抛 InternalBizError:mongo_cell_decision_not_found。
 *
 * 部署：
 * 1) 右键 database →「上传所有 DB Schema」
 * 2) 右键本云函数 →「上传并部署」
 * 3) 云函数详情开启「URL 化」，把 HTTPS 地址配到 pulsechat.push.cloud-url
 *
 * 注意：successed_offline / successed_online 只表示个推/DCloud 已受理，
 * 不等于通知栏一定展示。进程被杀且无厂商通道时，离线常「受理成功但无栏」。
 * App 后台 JS 常被挂起，不能依赖客户端 createPushMessage；须 force_notification=true。
 *
 * 厂商通道：须在 DCloud 开发者中心配置华为/小米/OPPO/vivo/荣耀等密钥，
 * 云打包勾选「离线推送」，并用对应品牌真机验证。仅业务代码无法保证杀进程出栏。
 */
const APP_ID = '__UNI__BC66A18'

const uniPush = uniCloud.getPushManager({
  appId: APP_ID
})

/** 默认聊天类分类：避免被当成营销消息限流/静默（仍依赖厂商通道已开通） */
const DEFAULT_CATEGORY = {
  huawei: 'IM',
  harmony: 'IM',
  vivo: 'IM'
}

/**
 * 厂商扩展：不硬编码需控制台申请的 channel_id（小米/OPPO 等），
 * 只带无需额外渠道 ID 的分类字段。若已申请 channel，可通过 body.options 覆盖。
 */
const DEFAULT_OPTIONS = {
  android: {
    HW: {
      '/message/android/category': 'IM',
      '/message/android/notification/importance': 'NORMAL'
    },
    VV: {
      // 1=系统消息（不受运营消息日限额）；须符合 vivo 业务定义
      '/classification': 1
    }
  }
}

function parseBody(event) {
  if (!event) return {}
  if (typeof event.body === 'string' && event.body) {
    try {
      return JSON.parse(event.body)
    } catch (e) {
      return event
    }
  }
  if (event.body && typeof event.body === 'object') {
    return event.body
  }
  return event
}

function normalizeCids(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean)
  }
  const s = String(raw).trim()
  if (!s) return []
  if (s.indexOf(',') >= 0) {
    return s.split(',').map((x) => x.trim()).filter(Boolean)
  }
  return [s]
}

function normalizePayload(raw) {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : { text: raw }
    } catch (e) {
      return { text: raw }
    }
  }
  if (typeof raw === 'object') return raw
  return {}
}

function isMissingPushDbError(err) {
  const msg = String(
    (err && (err.message || err.errMsg || err.msg)) || err || ''
  )
  return msg.indexOf('mongo_cell_decision_not_found') >= 0
}

/** 官方文档建议 title 长度小于 20、content 小于 50；超长可能导致厂商通道受理成功但不出栏 */
function clipTitle(s) {
  const t = String(s || '脉冲')
  return t.length <= 20 ? t : t.slice(0, 20)
}

function clipContent(s) {
  const t = String(s || '你有一条新消息')
  return t.length <= 50 ? t : t.slice(0, 50)
}

function mergeOptions(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_OPTIONS
  const android = Object.assign({}, DEFAULT_OPTIONS.android, raw.android || {})
  // 允许调用方用顶层 HW/VV（旧写法）覆盖
  if (raw.HW) android.HW = Object.assign({}, android.HW, raw.HW)
  if (raw.VV) android.VV = Object.assign({}, android.VV, raw.VV)
  if (raw.XM) android.XM = Object.assign({}, android.XM || {}, raw.XM)
  if (raw.OP) android.OP = Object.assign({}, android.OP || {}, raw.OP)
  return Object.assign({}, DEFAULT_OPTIONS, raw, { android })
}

exports.main = async (event) => {
  const body = parseBody(event)
  const cids = normalizeCids(body.push_clientid || body.cids || body.clientIds)
  if (!cids.length) {
    return { errCode: 'PARAM', errMsg: 'push_clientid required' }
  }

  // 官方：单次最多约 500；后端默认只推最新 1 个 CID
  const pushClientId = cids.length === 1 ? cids[0] : cids.slice(0, 500)
  const title = clipTitle(body.title)
  const content = clipContent(body.content)
  const payload = normalizePayload(body.payload)
  // 无论在线透传还是离线厂商通道，都要求出系统通知栏（App 后台 JS 可能已挂起）
  const forceNotification = body.force_notification !== false
  const category =
    body.category && typeof body.category === 'object'
      ? Object.assign({}, DEFAULT_CATEGORY, body.category)
      : DEFAULT_CATEGORY
  const options = mergeOptions(body.options)

  try {
    const res = await uniPush.sendMessage({
      push_clientid: pushClientId,
      title,
      content,
      payload,
      force_notification: forceNotification,
      sound: body.sound || 'system',
      request_id: body.request_id || undefined,
      // 离线保留 24h，避免短暂断网丢消息
      settings: body.settings || { ttl: 86400000 },
      // channel 已不推荐；用 category + options（HBuilderX 4.31+）
      category,
      options
    })
    return res
  } catch (e) {
    if (isMissingPushDbError(e)) {
      return {
        errCode: 'PUSH_DB_NOT_READY',
        errMsg:
          'uni-cloud-push 依赖表未创建。请在 uniCloud 云数据库创建（或上传 schema）：opendb-tempdata、opendb-device、uni-id-device',
        detail: String((e && (e.message || e.errMsg)) || e)
      }
    }
    return {
      errCode: (e && e.errCode) || 'PUSH_FAIL',
      errMsg: String((e && (e.message || e.errMsg)) || e)
    }
  }
}
