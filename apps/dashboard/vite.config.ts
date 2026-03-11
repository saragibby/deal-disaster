import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5200,
    proxy: {
      // Proxy sub-apps through the dashboard so all apps share the same
      // origin (localhost:5200) in dev, mirroring the production setup.
      // This keeps localStorage (and thus auth state) unified.
      '/deal-or-disaster': {
        target: 'http://localhost:5201',
        changeOrigin: true,
      },
      '/property-analyzer': {
        target: 'http://localhost:5202',
        changeOrigin: true,
      },
    },
    watch: {
      // Watch shared packages for HMR
      ignored: ['!**/node_modules/@deal-platform/**'],
    },
  },
  resolve: {
    alias: {
      '@deal-platform/shared-ui': path.resolve(__dirname, '../../packages/shared-ui/src'),
      '@deal-platform/shared-auth': path.resolve(__dirname, '../../packages/shared-auth/src'),
    },
  },
})
