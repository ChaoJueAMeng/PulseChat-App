import { BASE_URL } from './config.js'

/**
 * 将后端返回的相对路径转为可访问的完整 URL。
 * 历史消息若写成了错误 host（localhost / 内网 IP / 旧域名），只要 path 仍是 /files/... 就会重写到当前 BASE_URL。
 */
export function fullUrl(path) {
  if (!path) return ''
  const raw = String(path).trim()
  if (!raw) return ''

  // 已是本地协议，原样返回
  if (/^(file:|blob:|data:|wxfile:|content:)/i.test(raw)) {
    return raw
  }

  let pathname = ''
  if (/^https?:\/\//i.test(raw) || raw.includes('://')) {
    try {
      const u = new URL(raw)
      pathname = u.pathname || ''
      // 仅重写本服务的文件/接口路径；其它外链保持原样
      if (!pathname.startsWith('/files/') && !pathname.startsWith('/api/')) {
        return raw
      }
    } catch (e) {
      return raw
    }
  } else {
    pathname = raw.startsWith('/') ? raw : '/' + raw
  }

  const base = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL
  // 去掉重复的 /files 前缀异常，如 //files/a.png
  const rel = pathname.replace(/\/{2,}/g, '/')
  return base + rel
}
