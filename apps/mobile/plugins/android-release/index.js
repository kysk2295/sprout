// Android 출시(Google Play) config 플러그인 — `expo prebuild`가 android/를 새로 만들 때마다 붙인다(android/는 커밋하지 않음).
// 하는 일:
//  1) 업로드 키 서명: release 빌드를 저장소 밖 업로드 키로 서명한다. 키 정보 찾는 순서
//       (가) 환경 변수 SPROUT_UPLOAD_STORE_FILE·SPROUT_UPLOAD_STORE_PASSWORD·SPROUT_UPLOAD_KEY_ALIAS·SPROUT_UPLOAD_KEY_PASSWORD (CI용)
//       (나) SPROUT_ANDROID_SIGNING_PROPERTIES가 가리키는 .properties 파일
//       (다) ~/.config/sprout/android-upload.properties (storeFile·storePassword·keyAlias·keyPassword)
//     셋 다 없으면 bundleRelease·assembleRelease는 바로 실패한다(디버그 키로 서명한 출시 빌드가 나오지 않게). debug 빌드는 그대로.
//  2) SDK 고정: compileSdk·targetSdk 36(Play 2026 요건 이상), minSdk 24(Android 7.0)
//  3) 권한 정리: 쓰지 않는 SYSTEM_ALERT_WINDOW·저장소·FOREGROUND_SERVICE·생체 인증 권한 제거(아래 REMOVE),
//     정확한 알림 시각용 SCHEDULE_EXACT_ALARM 추가(사용자가 허용 안 하면 expo-notifications가 부정확 알람으로 대체)
// 상세: docs/release/RELEASE-CHECKLIST.md §5·§5-1
const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withGradleProperties } = require('expo/config-plugins')

const SDK = { compileSdkVersion: '36', targetSdkVersion: '36', minSdkVersion: '24' }
const REMOVE = [
  'android.permission.SYSTEM_ALERT_WINDOW', // RN 개발 오버레이 잔여물
  'android.permission.READ_EXTERNAL_STORAGE', // expo-file-system — 앱 전용 폴더(Paths.document)만 쓴다
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.FOREGROUND_SERVICE', // WorkManager 기본 선언 — 포그라운드 작업 없음(expo-background-task는 일반 작업)
  'android.permission.USE_BIOMETRIC', // expo-secure-store — requireAuthentication(생체 인증) 안 씀
  'android.permission.USE_FINGERPRINT'
]
const ADD = ['android.permission.SCHEDULE_EXACT_ALARM']
const MARK = '// @sprout/android-release'

const withSdk = (config) =>
  withGradleProperties(config, (c) => {
    for (const [k, v] of Object.entries(SDK)) {
      const key = `android.${k}`
      c.modResults = c.modResults.filter((p) => !(p.type === 'property' && p.key === key))
      c.modResults.push({ type: 'property', key, value: v })
    }
    return c
  })

const withPermissions = (config) =>
  withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools'
    const perms = (manifest['uses-permission'] ?? []).filter((p) => ![...REMOVE, ...ADD].includes(p.$['android:name']))
    // tools:node="remove" → 라이브러리 매니페스트(expo-file-system 등)에서 합쳐 들어오는 것까지 뺀다
    for (const name of REMOVE) perms.push({ $: { 'android:name': name, 'tools:node': 'remove' } })
    for (const name of ADD) perms.push({ $: { 'android:name': name } })
    manifest['uses-permission'] = perms
    return c
  })

const SIGNING_HEAD = `${MARK} — 업로드 키(저장소 밖). plugins/android-release 참고
def sproutUpload = { ->
  def env = System.getenv()
  if (env.SPROUT_UPLOAD_STORE_FILE) {
    return [storeFile: env.SPROUT_UPLOAD_STORE_FILE, storePassword: env.SPROUT_UPLOAD_STORE_PASSWORD, keyAlias: env.SPROUT_UPLOAD_KEY_ALIAS ?: 'upload', keyPassword: env.SPROUT_UPLOAD_KEY_PASSWORD ?: env.SPROUT_UPLOAD_STORE_PASSWORD]
  }
  def path = env.SPROUT_ANDROID_SIGNING_PROPERTIES ?: "\${System.getProperty('user.home')}/.config/sprout/android-upload.properties"
  def f = new File(path)
  if (!f.exists()) return null
  def p = new Properties()
  f.withInputStream { p.load(it) }
  if (!p.storeFile || !new File(p.storeFile).exists()) throw new GradleException("android-release: \${path}의 storeFile(\${p.storeFile})이 없습니다")
  return [storeFile: p.storeFile, storePassword: p.storePassword, keyAlias: p.keyAlias ?: 'upload', keyPassword: p.keyPassword ?: p.storePassword]
}()
gradle.taskGraph.whenReady { graph ->
  def wantsRelease = graph.allTasks.any { t -> t.project == project && t.name ==~ /(bundle|assemble|package|sign)\\w*Release\\w*/ }
  if (wantsRelease && sproutUpload == null) {
    throw new GradleException("android-release: 업로드 키가 없습니다. ~/.config/sprout/android-upload.properties 또는 SPROUT_UPLOAD_* 환경 변수를 준비하세요(디버그 키로는 출시 빌드를 서명하지 않습니다)")
  }
}
`

const withSigning = (config) =>
  withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents
    if (g.includes(MARK)) return c
    g = g.replace(/\nandroid \{/, `\n${SIGNING_HEAD}\nandroid {`)
    g = g.replace(
      /(signingConfigs \{\s*\n\s*debug \{[^}]*\})/,
      `$1\n        release {\n            if (sproutUpload) {\n                storeFile file(sproutUpload.storeFile)\n                storePassword sproutUpload.storePassword\n                keyAlias sproutUpload.keyAlias\n                keyPassword sproutUpload.keyPassword\n            }\n        }`
    )
    const before = g
    g = g.replace(/(release \{\s*\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/, '$1signingConfig sproutUpload ? signingConfigs.release : null')
    if (g === before) throw new Error('android-release: app/build.gradle의 release signingConfig를 찾지 못했습니다(템플릿이 바뀜)')
    c.modResults.contents = g
    return c
  })

module.exports = (config) => withSigning(withPermissions(withSdk(config)))
