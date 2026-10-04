// electron-builder afterPack 훅 — .app이 만들어진 직후, 서명 전에 실행된다.
// [예정] macOS 위젯(WidgetKit, docs/screens/25-mac-widget.md): Xcode로 미리 빌드한 위젯 확장(.appex)을
// Contents/PlugIns/ 에 복사한다. 확장이 없으면 아무것도 하지 않는다(지금 상태).
//
// 찾는 순서: 환경 변수 SPROUT_WIDGET_APPEX(.appex 경로) → apps/desktop/build/widget/*.appex
// 서명: 위젯 확장은 샌드박스·App Group entitlements가 따로 필요해서 Electron 쪽 서명(entitlementsInherit)으로
//       덮이면 안 된다. 그래서 electron-builder.yml의 mac.signIgnore로 PlugIns/*.appex를 건너뛰게 하고,
//       여기서 SPROUT_WIDGET_ENTITLEMENTS(위젯 entitlements plist)와 CSC_NAME(서명 ID)이 있으면 먼저 서명한다.
//       이후 electron-builder가 앱 전체를 서명하면서 확장을 봉인한다.
const { existsSync, readdirSync, cpSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const fromEnv = process.env.SPROUT_WIDGET_APPEX
  const widgetDir = join(__dirname, 'widget')
  const candidates = fromEnv
    ? [fromEnv]
    : existsSync(widgetDir) ? readdirSync(widgetDir).filter((f) => f.endsWith('.appex')).map((f) => join(widgetDir, f)) : []
  if (candidates.length === 0) return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const plugins = join(context.appOutDir, appName, 'Contents', 'PlugIns')
  mkdirSync(plugins, { recursive: true })
  for (const src of candidates) {
    if (!existsSync(src)) throw new Error(`[afterPack] 위젯 확장을 찾을 수 없음: ${src}`)
    const dest = join(plugins, require('node:path').basename(src))
    cpSync(src, dest, { recursive: true, verbatimSymlinks: true })
    console.log(`[afterPack] 위젯 확장 복사: ${dest}`)
    const identity = process.env.CSC_NAME
    const ent = process.env.SPROUT_WIDGET_ENTITLEMENTS
    if (identity && ent) {
      execFileSync('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', ent, '--sign', identity, dest], { stdio: 'inherit' })
      console.log('[afterPack] 위젯 확장 서명 완료')
    } else {
      console.warn('[afterPack] CSC_NAME·SPROUT_WIDGET_ENTITLEMENTS가 없어 위젯 확장을 서명하지 않음(로컬 확인용)')
    }
  }
}
