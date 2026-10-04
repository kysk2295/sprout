import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // @sprout/* 작업공간 패키지는 TS 원본이라 번들에 포함한다(나머지 의존성은 node_modules에서 그대로 불러옴).
  main: { plugins: [externalizeDepsPlugin({ exclude: ['@sprout/schema'] })] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    define: { __WEB_PREVIEW__: false }, // 미리보기용 sql.js를 앱 번들에서 뺀다
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } }
  }
})
