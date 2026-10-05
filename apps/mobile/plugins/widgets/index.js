// 36 모바일 위젯 config 플러그인(iOS) — `expo prebuild`가 ios/를 새로 만들 때마다 위젯 확장 타깃을 다시 붙인다(ios/는 커밋하지 않음).
// 공유 확장 플러그인(plugins/share-extension)과 같은 방식. Android 위젯은 플러그인 없이 modules/sprout-widgets/android(라이브러리 매니페스트)에 있다.
// 하는 일:
//  1) 본 앱 entitlements: App Group(위젯 저장 칸 — 공유 확장과 같은 칸)
//  2) ios/SproutWidget/에 Swift 소스·Info.plist·entitlements 복사
//  3) Xcode 프로젝트에 앱 확장 타깃 SproutWidget(com.apple.widgetkit-extension, iOS 17+) 추가(본 앱에 포함·의존)
//  4) extra.widgets = { appGroup } → 본 앱 JS(src/widgets/native.ts)가 같은 이름을 쓴다
// 옵션(app.json): ["./plugins/widgets", { "teamId": "BU697KN34B", "appGroup": "group.app.sprout.mobile" }]
// 서명: 시뮬레이터는 팀 없이도 된다. 실기기·배포는 App ID(app.sprout.mobile.widget)에 같은 App Group을 켠 프로파일이 필요 — docs/release/HANDOVER.md "위젯".
const fs = require('fs')
const path = require('path')
const { withDangerousMod, withEntitlementsPlist, withXcodeProject } = require('expo/config-plugins')

const TARGET = 'SproutWidget'
const SOURCES = ['SproutWidgetBundle.swift', 'Snapshot.swift', 'Provider.swift', 'Views.swift', 'MonthView.swift']
const DEPLOYMENT = '17.0' // 대화형 위젯(Button(intent:))·containerBackground — 36 W7

function names(config, props) {
  const appId = config.ios?.bundleIdentifier
  if (!appId) throw new Error('widgets: ios.bundleIdentifier가 필요합니다')
  return { appId, teamId: props.teamId ?? 'BU697KN34B', extId: `${appId}.widget`, appGroup: props.appGroup ?? `group.${appId}` }
}

const plist = (obj) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${Object.entries(obj).map(([k, v]) => `  <key>${k}</key>\n  <array>${v.map((s) => `<string>${s}</string>`).join('')}</array>`).join('\n')}
</dict>
</plist>
`

const withWidgetEntitlements = (config, n) =>
  withEntitlementsPlist(config, (c) => {
    const groups = new Set([...(c.modResults['com.apple.security.application-groups'] ?? []), n.appGroup])
    c.modResults['com.apple.security.application-groups'] = [...groups]
    return c
  })

const withWidgetFiles = (config, n) =>
  withDangerousMod(config, ['ios', async (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, TARGET)
    fs.mkdirSync(dir, { recursive: true })
    const src = path.join(__dirname, 'ios')
    for (const f of SOURCES) fs.copyFileSync(path.join(src, f), path.join(dir, f))
    fs.writeFileSync(path.join(dir, 'Info.plist'), fs.readFileSync(path.join(src, 'Info.plist'), 'utf8').replace('__APP_GROUP__', n.appGroup))
    // 위젯 확장은 저장 칸만 쓴다(네트워크·키체인 없음 — 25 §8.8)
    fs.writeFileSync(path.join(dir, `${TARGET}.entitlements`), plist({ 'com.apple.security.application-groups': [n.appGroup] }))
    return c
  }])

const withWidgetTarget = (config, n) =>
  withXcodeProject(config, (c) => {
    const proj = c.modResults
    const objects = proj.hash.project.objects
    if (proj.pbxTargetByName(TARGET)) return c
    objects.PBXTargetDependency ??= {}
    objects.PBXContainerItemProxy ??= {}

    const target = proj.addTarget(TARGET, 'app_extension', TARGET, n.extId)
    const group = proj.addPbxGroup([...SOURCES, 'Info.plist', `${TARGET}.entitlements`], TARGET, TARGET)
    proj.addToPbxGroup(group.uuid, proj.getFirstProject().firstProject.mainGroup)
    proj.addBuildPhase(SOURCES, 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)

    for (const ref of Object.values(objects.PBXFileReference)) {
      if (ref && typeof ref === 'object') for (const k of Object.keys(ref)) if (ref[k] === undefined || ref[k] === 'undefined') delete ref[k]
    }

    const configs = proj.pbxXCBuildConfigurationSection()
    const isApp = (s) => s?.PRODUCT_BUNDLE_IDENTIFIER === n.appId || s?.PRODUCT_BUNDLE_IDENTIFIER === `"${n.appId}"`
    const appSettings = Object.values(configs).find((b) => isApp(b?.buildSettings))?.buildSettings ?? {}
    for (const b of Object.values(configs)) {
      const s = b?.buildSettings
      if (!s) continue
      if (s.PRODUCT_NAME === `"${TARGET}"` || s.PRODUCT_NAME === TARGET) {
        Object.assign(s, {
          INFOPLIST_FILE: `${TARGET}/Info.plist`,
          CODE_SIGN_ENTITLEMENTS: `${TARGET}/${TARGET}.entitlements`,
          CODE_SIGN_STYLE: 'Automatic',
          DEVELOPMENT_TEAM: n.teamId,
          PRODUCT_BUNDLE_IDENTIFIER: n.extId,
          SWIFT_VERSION: '5.0',
          IPHONEOS_DEPLOYMENT_TARGET: DEPLOYMENT,
          TARGETED_DEVICE_FAMILY: '"1,2"',
          MARKETING_VERSION: config.version ?? appSettings.MARKETING_VERSION ?? '1.0', // 앱 Info.plist 버전(app.json version)과 같아야 한다
          CURRENT_PROJECT_VERSION: config.ios?.buildNumber ?? appSettings.CURRENT_PROJECT_VERSION ?? '1',
          GENERATE_INFOPLIST_FILE: 'NO',
          APPLICATION_EXTENSION_API_ONLY: 'YES',
          CLANG_ENABLE_MODULES: 'YES',
          SKIP_INSTALL: 'YES',
          LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
          SWIFT_OPTIMIZATION_LEVEL: s.GCC_PREPROCESSOR_DEFINITIONS ? '"-Onone"' : '"-O"'
        })
      } else if (isApp(s)) {
        s.DEVELOPMENT_TEAM ??= n.teamId
      }
    }
    return c
  })

module.exports = function withWidgets(config, props = {}) {
  const n = names(config, props)
  config.extra = { ...config.extra, widgets: { appGroup: n.appGroup } }
  config = withWidgetEntitlements(config, n)
  config = withWidgetFiles(config, n)
  config = withWidgetTarget(config, n)
  return config
}
