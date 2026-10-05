// electron-builder afterPack 훅 — .app이 만들어진 직후, 서명 전에 실행된다.
// macOS 위젯(WidgetKit, docs/screens/25-mac-widget.md §8.10):
//  ① 위젯 확장(.appex)을 Contents/PlugIns/ 에 복사
//  ② 위젯 새로 고침 모듈(widget_bridge.node)을 Contents/Resources/ 에 복사(main/widget.ts가 process.resourcesPath에서 읽음)
// 둘 다 `npm run widget:build`(native/widget/build.sh)가 apps/desktop/build/widget/에 미리 만들어 둔다. 없으면 아무것도 하지 않는다.
//
// 찾는 순서: 환경 변수 SPROUT_WIDGET_APPEX(.appex 경로) → apps/desktop/build/widget/*.appex
// 서명: 위젯 확장은 샌드박스·App Group entitlements가 따로 필요해서 Electron 쪽 서명(entitlementsInherit)으로
//       덮이면 안 된다. 그래서 electron-builder.yml의 mac.signIgnore로 PlugIns/*.appex를 건너뛰게 한다.
//       build.sh가 이미 개발 인증서로 서명해 두므로 로컬 빌드는 그대로 쓰고, CSC_NAME(배포 서명 ID)이 있으면
//       여기서 그 ID로 다시 서명한다(entitlements: SPROUT_WIDGET_ENTITLEMENTS → build/widget/SproutWidget.entitlements).
//       그 뒤 electron-builder가 앱 전체를 서명하면서 확장을 봉인한다(안쪽 → 바깥 순서).
const { existsSync, readdirSync, cpSync, mkdirSync, copyFileSync, writeFileSync } = require('node:fs')
const { join, basename } = require('node:path')
const { execFileSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const widgetDir = join(__dirname, 'widget')
  const appName = `${context.packager.appInfo.productFilename}.app`
  const contents = join(context.appOutDir, appName, 'Contents')

  // Finder·Launchpad·Spotlight에 보이는 이름 = 꿈틀(파일 이름은 Kkumteul.app). Info.plist의 LSHasLocalizedDisplayName과 짝
  for (const lang of ['ko', 'en']) {
    const dir = join(contents, 'Resources', `${lang}.lproj`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'InfoPlist.strings'), '"CFBundleName" = "꿈틀";\n"CFBundleDisplayName" = "꿈틀";\n', 'utf8')
  }
  console.log('[afterPack] 보이는 이름: ko/en.lproj InfoPlist.strings = 꿈틀')

  const bridge = join(widgetDir, 'widget_bridge.node')
  if (existsSync(bridge)) {
    copyFileSync(bridge, join(contents, 'Resources', 'widget_bridge.node'))
    console.log('[afterPack] 위젯 새로 고침 모듈 복사: Contents/Resources/widget_bridge.node')
  }

  const fromEnv = process.env.SPROUT_WIDGET_APPEX
  const candidates = fromEnv
    ? [fromEnv]
    : existsSync(widgetDir) ? readdirSync(widgetDir).filter((f) => f.endsWith('.appex')).map((f) => join(widgetDir, f)) : []
  if (candidates.length === 0) { console.log('[afterPack] 위젯 확장 없음(npm run widget:build 안 함) — 위젯 없이 패키징'); return }
  const plugins = join(contents, 'PlugIns')
  mkdirSync(plugins, { recursive: true })
  for (const src of candidates) {
    if (!existsSync(src)) throw new Error(`[afterPack] 위젯 확장을 찾을 수 없음: ${src}`)
    const dest = join(plugins, basename(src))
    cpSync(src, dest, { recursive: true, verbatimSymlinks: true })
    console.log(`[afterPack] 위젯 확장 복사: ${dest}`)
    const identity = process.env.CSC_NAME
    const ent = process.env.SPROUT_WIDGET_ENTITLEMENTS ?? join(widgetDir, 'SproutWidget.entitlements')
    if (identity && existsSync(ent)) {
      execFileSync('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', ent, '--sign', identity, dest], { stdio: 'inherit' })
      console.log(`[afterPack] 위젯 확장 다시 서명: ${identity}`)
    } else {
      console.log('[afterPack] 위젯 확장은 build.sh가 한 서명 그대로 사용')
    }
  }
}
