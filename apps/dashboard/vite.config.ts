import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5200,
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
