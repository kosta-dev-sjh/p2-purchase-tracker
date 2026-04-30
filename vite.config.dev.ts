import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const popupAuthHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

export default defineConfig({
  base: '/',
  cacheDir: '/tmp/vite-cache',
  server: {
    headers: popupAuthHeaders,
    host: true,
    port: 5173,
  },
  plugins: [react()],
})
