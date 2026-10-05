import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// 시험용: SPROUT_PROFILE=이름이면 데이터 폴더를 따로 쓴다(여러 앱을 동시에 띄워 E2E 확인할 때 DB·로그인이 섞이지 않게).
// 다른 모듈(db.ts 등)이 userData를 읽기 전에 정해야 하므로 index.ts의 맨 첫 import다.
const profile = process.env.SPROUT_PROFILE
if (profile && /^[\w-]{1,40}$/.test(profile)) {
  const dir = join(app.getPath('appData'), `sprout-${profile}`)
  mkdirSync(dir, { recursive: true }) // 처음엔 폴더가 없어 PowerSync가 DB를 못 만든다
  app.setPath('userData', dir)
}
else {
  // 데이터 폴더를 내부 이름으로 고정한다 — 화면 이름(꿈틀)을 바꿔도 로그인·DB가 그대로 이어지게.
  // 패키지 앱: ~/Library/Application Support/sprout (electron-builder extraMetadata.productName) · 개발: @sprout/desktop(package.json name)
  app.setPath('userData', join(app.getPath('appData'), app.isPackaged ? 'sprout' : '@sprout/desktop'))
}
// 새로 설치한 기기는 userData 폴더가 아직 없어 PowerSync가 "dbLocation does not exist"로 첫 실행에 실패한다
mkdirSync(app.getPath('userData'), { recursive: true })
