import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// 기본 배포 타깃은 EC2/Firebase Hosting/Docker 환경이라 루트 경로 기준으로 빌드합니다.
// COOP/COEP 헤더 설명:
//   Firebase signInWithPopup 은 팝업 창이 닫혔는지 window.closed 폴링으로 확인하는데,
//   COOP 가 same-origin(또는 미설정 시 일부 브라우저 기본값) 이면 그 접근이 차단되어
//   "Cross-Origin-Opener-Policy policy would block the window.closed call" 경고가 콘솔에 흐릅니다.
//   same-origin-allow-popups 로 두면 같은 origin 격리는 유지하면서 본인이 연 팝업과는
//   통신할 수 있어 위 경고가 사라집니다. (프로덕션 헤더는 firebase.json 참고)
const popupAuthHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

export default defineConfig(({ mode }) => ({
  base: '/',
  server: {
    headers: popupAuthHeaders,
  },
  preview: {
    headers: popupAuthHeaders,
  },
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
