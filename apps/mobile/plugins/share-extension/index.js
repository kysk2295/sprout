// 24 공유 확장 config 플러그인 — `expo prebuild`가 ios/를 새로 만들 때마다 공유 확장 타깃을 다시 붙인다(ios/는 커밋하지 않음).
// 하는 일:
//  1) 본 앱 entitlements: App Group(대기열 폴더) + 키체인 공유 그룹(확장이 읽을 접근 토큰)
//  2) ios/SproutShare/에 Swift 소스·Info.plist·entitlements 복사
//  3) Xcode 프로젝트에 앱 확장 타깃 SproutShare 추가(본 앱에 포함·의존)
//  4) extra.share = { appGroup, keychainGroup } → 본 앱 JS(src/share/native.ts)가 같은 이름을 쓴다
// 옵션(app.json): ["./plugins/share-extension", { "teamId": "BU697KN34B", "appGroup": "group.app.sprout.mobile" }]
const fs = require('fs')
const path = require('path')
const { withDangerousMod, withEntitlementsPlist, withXcodeProject } = require('expo/config-plugins')

const TARGET = 'SproutShare'
const SOURCES = ['ShareViewController.swift', 'ShareView.swift', 'ShareCore.swift']
// 확장 번들에 들어갈 리소스 — 개인정보 매니페스트(App Group UserDefaults 사유 1C8F.1)
const RESOURCES = ['PrivacyInfo.xcprivacy']

function names(config, props) {
  const appId = config.ios?.bundleIdentifier
  if (!appId) throw new Error('share-extension: ios.bundleIdentifier가 필요합니다')
  const teamId = props.teamId ?? 'BU697KN34B'
  return {
    appId,
    teamId,
    extId: `${appId}.share`,
    appGroup: props.appGroup ?? `group.${appId}`,
    // 접두사를 글자로 박는다: $(AppIdentifierPrefix)는 시뮬레이터·팀 없는 빌드에서 비어 JS 쪽 이름과 어긋난다
    keychainGroup: props.keychainGroup ?? `${teamId}.${appId}.shared`
  }
}

const entitlements = (n, ownGroup) => ({
  'com.apple.security.application-groups': [n.appGroup],
  // 첫 항목 = 기본 그룹(본 앱 세션·리프레시 토큰은 여기 그대로). 공유 그룹에는 접근 토큰 하나만 둔다
  'keychain-access-groups': [ownGroup, n.keychainGroup]
})

function plist(obj) {
  const val = (v) => Array.isArray(v) ? `<array>${v.map((s) => `<string>${s}</string>`).join('')}</array>` : `<string>${v}</string>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${Object.entries(obj).map(([k, v]) => `  <key>${k}</key>\n  ${val(v)}`).join('\n')}
</dict>
</plist>
`
}

const withShareEntitlements = (config, n) =>
  withEntitlementsPlist(config, (c) => {
    const e = entitlements(n, `${n.teamId}.${n.appId}`)
    const groups = new Set([...(c.modResults['com.apple.security.application-groups'] ?? []), ...e['com.apple.security.application-groups']])
    c.modResults['com.apple.security.application-groups'] = [...groups]
    const kc = c.modResults['keychain-access-groups'] ?? []
    c.modResults['keychain-access-groups'] = [...new Set([...e['keychain-access-groups'], ...kc])]
    return c
  })

const withShareFiles = (config, n) =>
  withDangerousMod(config, ['ios', async (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, TARGET)
    fs.mkdirSync(dir, { recursive: true })
    const src = path.join(__dirname, 'ios')
    for (const f of [...SOURCES, ...RESOURCES]) fs.copyFileSync(path.join(src, f), path.join(dir, f))
    const info = fs.readFileSync(path.join(src, 'Info.plist'), 'utf8').replace('__APP_GROUP__', n.appGroup).replace('__KEYCHAIN_GROUP__', n.keychainGroup)
    fs.writeFileSync(path.join(dir, 'Info.plist'), info)
    fs.writeFileSync(path.join(dir, `${TARGET}.entitlements`), plist(entitlements(n, `${n.teamId}.${n.extId}`)))
    return c
  }])

const withShareTarget = (config, n) =>
  withXcodeProject(config, (c) => {
    const proj = c.modResults
    const objects = proj.hash.project.objects
    if (proj.pbxTargetByName(TARGET)) return c // 이미 있음(prebuild를 --clean 없이 다시 돌린 경우)
    objects.PBXTargetDependency ??= {}
    objects.PBXContainerItemProxy ??= {}

    const target = proj.addTarget(TARGET, 'app_extension', TARGET, n.extId)
    const group = proj.addPbxGroup([...SOURCES, ...RESOURCES, 'Info.plist', `${TARGET}.entitlements`], TARGET, TARGET)
    const main = proj.getFirstProject().firstProject.mainGroup
    proj.addToPbxGroup(group.uuid, main)
    proj.addBuildPhase(SOURCES, 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    proj.addBuildPhase(RESOURCES, 'PBXResourcesBuildPhase', 'Resources', target.uuid)
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)

    // xcode 라이브러리가 남기는 `explicitFileType = undefined` 같은 칸을 지운다(남기면 Xcode가 파일 종류를 모른다)
    for (const ref of Object.values(objects.PBXFileReference)) {
      if (ref && typeof ref === 'object') for (const k of Object.keys(ref)) if (ref[k] === undefined || ref[k] === 'undefined') delete ref[k]
    }

    // 본 앱 설정에서 버전·배포 대상을 가져와 맞춘다
    const configs = proj.pbxXCBuildConfigurationSection()
    const appSettings = Object.values(configs).find((b) => b?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER === n.appId || b?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER === `"${n.appId}"`)?.buildSettings ?? {}
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
          IPHONEOS_DEPLOYMENT_TARGET: appSettings.IPHONEOS_DEPLOYMENT_TARGET ?? '16.4',
          TARGETED_DEVICE_FAMILY: '"1,2"',
          MARKETING_VERSION: config.version ?? appSettings.MARKETING_VERSION ?? '1.0', // 본 앱 CFBundleShortVersionString(app.json version)과 같아야 한다(App Store 검증)
          CURRENT_PROJECT_VERSION: config.ios?.buildNumber ?? appSettings.CURRENT_PROJECT_VERSION ?? '1',
          GENERATE_INFOPLIST_FILE: 'NO',
          APPLICATION_EXTENSION_API_ONLY: 'YES',
          CLANG_ENABLE_MODULES: 'YES',
          SKIP_INSTALL: 'YES',
          SWIFT_OPTIMIZATION_LEVEL: s.GCC_PREPROCESSOR_DEFINITIONS ? '"-Onone"' : '"-O"'
        })
      } else if (s.PRODUCT_BUNDLE_IDENTIFIER === n.appId || s.PRODUCT_BUNDLE_IDENTIFIER === `"${n.appId}"`) {
        s.DEVELOPMENT_TEAM ??= n.teamId // 본 앱과 확장은 같은 팀이어야 App Group·키체인 그룹을 나눈다
      }
    }
    return c
  })

module.exports = function withShareExtension(config, props = {}) {
  const n = names(config, props)
  config.extra = { ...config.extra, share: { appGroup: n.appGroup, keychainGroup: n.keychainGroup } }
  config = withShareEntitlements(config, n)
  config = withShareFiles(config, n)
  config = withShareTarget(config, n)
  return config
}
