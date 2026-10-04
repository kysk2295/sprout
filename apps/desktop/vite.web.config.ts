// 렌더러만 브라우저에서 띄워 화면을 확인할 때 쓴다(틱틱 캡처와 나란히 비교용). 실제 앱은 electron-vite로 실행한다.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  define: { __WEB_PREVIEW__: true },
  server: { port: 5173, strictPort: true }
})
