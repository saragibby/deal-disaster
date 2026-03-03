import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/property-analyzer/',
  server: {
    port: 5202,
    strictPort: true,
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
