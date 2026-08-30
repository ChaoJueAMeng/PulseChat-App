/**
 * 轻量冒烟：不依赖 uni-app 构建，验证 error-report 去重与 guard 行为。
 */
import { createRequire } from 'module'
import fs from 'fs'
import vm from 'vm'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const requests = []
const logs = []

const sandbox = {
  console: {
    log: (...a) => logs.push(['log', ...a]),
    warn: (...a) => logs.push(['warn', ...a]),
    error: (...a) => logs.push(['error', ...a])
  },
  Date,
  Map,
  setTimeout,
  clearTimeout,
  uni: {
    getSystemInfoSync: () => ({ platform: 'devtools', uniPlatform: 'web', osName: 'ios' }),
    getStorageSync: () => '',
    request: (opts) => {
      requests.push(opts)
      if (typeof opts.complete === 'function') opts.complete({ statusCode: 404 })
    },
    onError: (fn) => { sandbox.__onError = fn },
    onUnhandledRejection: (fn) => { sandbox.__onUnhandled = fn }
  },
  module: { exports: {} },
  exports: {},
  require: createRequire(path.join(root, 'utils/error-report.js'))
}
sandbox.global = sandbox
sandbox.globalThis = sandbox

let src = fs.readFileSync(path.join(root, 'utils/error-report.js'), 'utf8')
src = src.replace(
  /import\s*\{\s*BASE_URL\s*\}\s*from\s*['"]\.\/config\.js['"]\s*;?/,
  "const BASE_URL = 'http://example.test';"
)
src = src.replace(/export\s+function/g, 'function')
src += '\nmodule.exports = { reportCaught, reportError, guardSync, installErrorReporting };\n'

vm.runInNewContext(src, sandbox, { filename: 'error-report.js' })
const { reportCaught, guardSync, installErrorReporting } = sandbox.module.exports

reportCaught('smoke.scope', new Error('boom'), { foo: 1 })
reportCaught('smoke.scope', new Error('boom')) // 应被去重
const fallback = guardSync('smoke.guard', () => { throw new Error('x') }, 42)
installErrorReporting()
sandbox.__onError && sandbox.__onError('raw-uni-error')

const warnLines = logs
  .filter((x) => x[0] === 'warn')
  .map((x) => x.slice(1).map(String).join(' '))

const scopeWarns = warnLines.filter((s) => s.includes('smoke.scope'))
const ok = {
  hasWarn: warnLines.some((s) => s.includes('[error-report]')),
  deduped: scopeWarns.length === 1,
  guardFallback: fallback === 42,
  handlersInstalled: !!(sandbox.__onError && sandbox.__onUnhandled)
}

if (!ok.hasWarn || !ok.deduped || !ok.guardFallback || !ok.handlersInstalled) {
  console.error('SMOKE FAIL', ok, { warnLines, requests: requests.length })
  process.exit(1)
}

console.log('SMOKE OK', ok)
console.log('WARN_SAMPLE', scopeWarns[0])
