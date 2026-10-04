import { app } from 'electron'
import { join } from 'node:path'

// 시험용: SPROUT_PROFILE=이름이면 데이터 폴더를 따로 쓴다(여러 앱을 동시에 띄워 E2E 확인할 때 DB·로그인이 섞이지 않게).
// 다른 모듈(db.ts 등)이 userData를 읽기 전에 정해야 하므로 index.ts의 맨 첫 import다.
const profile = process.env.SPROUT_PROFILE
if (profile && /^[\w-]{1,40}$/.test(profile)) app.setPath('userData', join(app.getPath('appData'), `sprout-${profile}`))
