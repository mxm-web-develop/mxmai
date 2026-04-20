import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['styled-components'],
  },
  optimizeDeps: {
    include: ['styled-components'],
  },
  server: {
    port: 5173,
    /** 默认 false：5173 被占用时自动尝试 5174、5175…，勿写死备用端口 */
    strictPort: false,
    proxy: {
      // 开发时可将 Base URL 留空，请求走当前域名，由 Vite 代理到 Gateway，避免 CORS
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false, // 禁用错误覆盖层
    },
  },
})
