import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/investor-lab/',
  server: {
    port: 5203,
    strictPort: true,
    watch: {
      ignored: ['!**/node_modules/@deal-platform/**'],
    },
  },
});
