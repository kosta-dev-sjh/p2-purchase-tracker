import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 기본 배포 타깃은 EC2/Firebase Hosting/Docker 환경이라 루트 경로 기준으로 빌드합니다.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
