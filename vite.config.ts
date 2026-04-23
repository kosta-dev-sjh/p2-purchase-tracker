import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// 기본 배포 타깃은 EC2/Firebase Hosting/Docker 환경이라 루트 경로 기준으로 빌드합니다.
export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [
    react(),
    mode === 'analyze'
      ? visualizer({
          filename: 'dist/bundle-stats.html',
          gzipSize: true,
          brotliSize: true,
          open: false,
        })
      : null,
  ],
}))
