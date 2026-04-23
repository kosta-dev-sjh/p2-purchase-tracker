import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages가 `https://<user>.github.io/<repo>/` 서브패스로 서빙하기 때문에
// 빌드 결과물이 해당 서브패스를 알고 있어야 자산 경로가 깨지지 않습니다.
// 로컬 개발(dev)에서는 항상 '/'을 써야 하므로 command로 분기합니다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/spendtrack/' : '/',
  plugins: [react()],
}))
