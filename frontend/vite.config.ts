import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  // sockjs-client expects the CommonJS `global` object. Substituting it at build
  // time removes the inline shim from index.html, which in turn lets the CSP drop
  // 'unsafe-inline' for scripts.
  define: {
    global: 'globalThis',
  },
  plugins: [basicSsl(), react()],
  server: {
    watch: {
      ignored: ['**/*.test.ts', '**/*.test.tsx'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
      '/ws-karaoke': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
