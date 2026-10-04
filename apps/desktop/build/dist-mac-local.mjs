// npm run dist:mac — 이 Mac 확인용 빌드(공증 안 함, 하드닝 런타임 끔).
// 키체인에 개발용 "Apple Development" 인증서가 있으면 그것으로 서명한다: 맥 위젯(25)의 App Group(팀 ID 이름)은
// 같은 팀으로 서명돼야 확인 창 없이 쓸 수 있어서다. 없으면 예전처럼 ad-hoc(위젯 데이터 공유는 안 됨).
// SPROUT_ADHOC=1이면 인증서가 있어도 ad-hoc. 설명: docs/release/packaging.md §1·§4
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
let identity = '-'
if (process.env.SPROUT_ADHOC !== '1') {
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
    const m = /"(Apple Development: [^"]+)"/.exec(out)
    if (m) identity = m[1]
  } catch {}
}
console.log(`[dist:mac] 서명: ${identity === '-' ? 'ad-hoc(위젯 데이터 공유 안 됨)' : identity}`)
const args = ['electron-builder', '--mac', '--publish', 'never', `-c.mac.identity=${identity}`, '-c.mac.hardenedRuntime=false', '-c.mac.notarize=false']
const r = spawnSync('npx', args, { cwd: appDir, env: process.env, stdio: 'inherit' })
process.exit(r.status ?? 1)
