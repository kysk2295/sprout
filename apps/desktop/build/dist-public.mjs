// npm run dist:public -- mac | win — 사이트 내려받기용 설치 파일(서명 없음). 설명: docs/release/desktop-download.md
// - mac: arm64·x64 dmg 두 개. ad-hoc 서명·하드닝 런타임 끔·공증 안 함 → 다른 Mac에서 처음 열 때 "확인할 수 없음" 경고가 뜨고
//   시스템 설정 › 개인정보 보호 및 보안 › 그래도 열기로 연다. 위젯은 넣지 않는다(SPROUT_SKIP_WIDGET — ad-hoc은 App Group 검증이 안 됨).
//   Apple Development 서명은 쓰지 않는다: 개발 인증서는 배포용이 아니고, 무료 팀 인증서가 바뀌면 같은 앱으로 안 보인다.
// - win: x64 NSIS 설치 파일. 서명 없음 → SmartScreen "추가 정보 › 실행". 이 Mac에서는 만들지 않는다(CI windows-latest).
// 파일 이름은 버전 없이 고정(사이트가 releases/latest/download/<이름>으로 건다):
//   Kkumteul-mac-arm64.dmg, Kkumteul-mac-x64.dmg, Kkumteul-windows-x64-setup.exe
// 먼저: electron-vite build(+ 맥은 npm run calendar:build). CI: .github/workflows/desktop-release.yml
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
let args
if (target === 'mac') {
  env.SPROUT_SKIP_WIDGET = '1'
  const name = 'Kkumteul-mac-${arch}.${ext}'
  args = ['--mac', 'dmg', '--arm64', '--x64', '-c.mac.identity=-', '-c.mac.hardenedRuntime=false', '-c.mac.notarize=false',
    `-c.artifactName=${name}`, `-c.dmg.artifactName=${name}`]
} else if (target === 'win') {
  const name = 'Kkumteul-windows-${arch}-setup.${ext}'
  args = ['--win', 'nsis', '--x64', `-c.artifactName=${name}`, `-c.nsis.artifactName=${name}`]
} else {
  console.error('사용법: node build/dist-public.mjs mac|win')
  process.exit(2)
}
const r = spawnSync('npx', ['electron-builder', ...args, '--publish', 'never'], { cwd: appDir, env, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
