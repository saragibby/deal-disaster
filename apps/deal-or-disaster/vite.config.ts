import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/deal-or-disaster/',
  server: {
    port: 5174,
  },
})
