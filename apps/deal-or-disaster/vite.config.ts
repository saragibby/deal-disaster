import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/deal-or-disaster/',
  server: {
    port: 5201,
    hmr: {
      // When accessed through the dashboard proxy (port 5200), HMR
      // still connects directly to this server's port.
      port: 5201,
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
