import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // @sprout/* 작업공간 패키지는 TS 원본이라 번들에 포함한다(나머지 의존성은 node_modules에서 그대로 불러옴).
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@sprout/schema'] })],
    // 패키지 앱은 실행할 때 환경 변수가 없다 → 빌드할 때 셸에 있던 구글 데스크톱 클라이언트 값을 넣는다(저장소에는 없음).
    // 구글 데스크톱(설치형) 클라이언트의 비밀값은 기밀로 보지 않고 PKCE가 보안을 맡는다(구글 문서). 실행 시 환경 변수가 있으면 그쪽이 먼저.
    define: {
      __BUILD_GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ''),
      __BUILD_GOOGLE_CLIENT_SECRET__: JSON.stringify(process.env.GOOGLE_CLIENT_SECRET ?? '')
    }
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    define: { __WEB_PREVIEW__: false }, // 미리보기용 sql.js를 앱 번들에서 뺀다
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } }
  }
})
