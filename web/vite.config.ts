import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * macOS 26 + Node 24：系统 FSEvents/`fs.watch` 经常完全不触发（实测连 os.tmpdir 也无事件），
 * Vite 模块图无法失效 → 改代码无 HMR、甚至硬刷新仍是旧缓存，只能重启 dev server。
 * 默认对 darwin 开 polling；其它平台保持原生 watch。可用 VITE_USE_POLLING=0/1 覆盖。
 */
function resolveUsePolling(): boolean {
  const raw = process.env.VITE_USE_POLLING
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return process.platform === 'darwin'
}

const apiProxyTimeout = Number(process.env.VITE_DEV_API_PROXY_TIMEOUT_MS ?? 600_000)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['styled-components'],
    // 优先 .ts：避免 mxm-editor-core/src 下误生成的 CJS .js 抢在 .ts 之前被解析
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
    alias: {
      '@mxmai/mxm-editor-core': path.resolve(__dirname, '../mxm-editor-core/src'),
    },
  },
  optimizeDeps: {
    include: ['styled-components'],
  },
  build: {
    target: 'es2020',
    // 不做 manualChunks：@antv/charts 与 lodash 等共享依赖拆包后会触发运行时 Zt is not a constructor
    chunkSizeWarningLimit: 2000,
  },
  server: {
    /** 固定 5200，避免与常见 Vite 默认 5173 上其他项目冲突 */
    port: Number(process.env.WEB_DEV_PORT ?? 5200),
    strictPort: true,
    watch: {
      usePolling: resolveUsePolling(),
      interval: Number(process.env.VITE_POLL_INTERVAL_MS ?? 300),
    },
    proxy: {
      // 开发时可将 Base URL 留空，请求走当前域名，由 Vite 代理到 Gateway，避免 CORS
      // WS 单独挂路径：失败的通知 WS 不应抢 HMR 的 upgrade
      '/api/v1/ws': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        timeout: apiProxyTimeout,
        proxyTimeout: apiProxyTimeout,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // 同步 LLM（如 scope=text + 思考模型）可能数分钟；默认过短会 socket hang up
        timeout: apiProxyTimeout,
        proxyTimeout: apiProxyTimeout,
      },
    },
    hmr: {
      overlay: false, // 禁用错误覆盖层
    },
  },
})
