// npm run dist:mac:release — 배포용 macOS 빌드(Developer ID 서명 + 공증).
// - 서명 ID: CSC_NAME(예: "Developer ID Application: 이름 (TEAMID)") 또는 CSC_LINK(.p12) 또는 키체인의 Developer ID 자동 탐색.
//   셋 다 없으면 경고하고 ad-hoc 서명으로 만든다(다른 Mac에서는 Gatekeeper가 막음 — 배포 금지).
// - 공증: APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, 또는 APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID,
//   또는 APPLE_KEYCHAIN_PROFILE이 있으면 electron-builder가 자동으로 공증·스테이플한다. 없으면 건너뛴다.
// 자세한 절차: docs/release/packaging.md
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env }
let hasDevId = false
try {
  hasDevId = /Developer ID Application/.test(execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }))
} catch {}
const signed = Boolean(env.CSC_NAME || env.CSC_LINK || hasDevId)
const notarize = Boolean(
  (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
  (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) ||
  env.APPLE_KEYCHAIN_PROFILE
)
const args = ['electron-builder', '--mac', '--publish', 'never']
if (signed) {
  // 배포용은 Developer ID만 쓴다(자동 탐색이 Apple Development 인증서로 떨어지지 않게).
  if (!env.CSC_NAME && !env.CSC_LINK) args.push('-c.mac.identity=Developer ID Application')
  console.log(`[release] 서명: ${env.CSC_NAME ?? (env.CSC_LINK ? 'CSC_LINK 인증서' : '키체인의 Developer ID')}`)
  console.log(notarize ? '[release] 공증: 환경 변수 있음 → 공증·스테이플' : '[release] 공증: 환경 변수 없음 → 건너뜀(다른 Mac에서 경고가 뜸)')
} else {
  console.warn('[release] ⚠ Developer ID 인증서가 없음 → ad-hoc 서명으로 만듭니다. 배포하지 마세요.')
  args.push('-c.mac.identity=-', '-c.mac.hardenedRuntime=false', '-c.mac.notarize=false')
}
const r = spawnSync('npx', args, { cwd: appDir, env, stdio: 'inherit' })
process.exit(r.status ?? 1)
