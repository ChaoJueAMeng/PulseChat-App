/**
 * PulseChat 直连服务器 8081（8080 留给苍穹）。
 * 仅把主机从公网 IP 换成域名即可。
 * 本地调试可临时改回局域网 IP，例如 192.168.3.15。
 */
const HOST = 'cjameng.top'
const PORT = 8081

export const BASE_URL = `http://${HOST}:${PORT}`
export const WS_URL = `ws://${HOST}:${PORT}/ws`
