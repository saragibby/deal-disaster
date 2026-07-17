import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '/investor-lab/';
  const normalized = value.replace(/^\/+|\/+$/g, '');
  return `/${normalized}/`;
}

export default defineConfig({
  plugins: [react()],
  base: normalizeBasePath(process.env.VITE_INVESTOR_LAB_BASE_PATH ?? '/investor-lab/'),
  server: {
    port: 5203,
    strictPort: true,
    watch: {
      ignored: ['!**/node_modules/@deal-platform/**'],
    },
  },
});
