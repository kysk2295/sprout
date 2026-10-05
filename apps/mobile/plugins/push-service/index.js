// 32 푸시(Android) config 플러그인 — `expo prebuild`가 android/를 새로 만들 때마다 붙인다(android/는 커밋하지 않음).
// 왜(0단계 실험, 32 §15.1): expo-notifications의 FCM 서비스는 앱이 배경·닫힘일 때 데이터 메시지에 `title`이 있으면
//   그 자리에서 기본 알림을 그려 버린다(id = FCM 메시지 id, 버튼·채널·중복 막기 없음) → JS 작업이 그리는 알림과 두 번 울린다.
// 하는 일: expo 서비스를 상속한 SproutMessagingService를 끼워, sprout 데이터 메시지(data.type이 아래 종류, notification 칸 없음)는
//   기본 표시 없이 expo 알림 작업(Notifications.registerTaskAsync — src/notifications/push.ts)으로만 넘긴다.
//   그 밖의 메시지·토큰 갱신은 expo 그대로. 새 라이브러리 없음(@react-native-firebase 안 씀 — N3).
const fs = require('fs')
const path = require('path')
const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins')

const TYPES = ['reminder', 'daily', 'growth', 'sync', 'test']
const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService'

const source = (pkg) => `package ${pkg}

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.notifications.RemoteMessageSerializer
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate

/** 32 §15.1 — plugins/push-service가 만든다. 손으로 고치지 말 것 */
class SproutMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val type = remoteMessage.data["type"]
    if (remoteMessage.notification == null && type != null && type in TYPES) {
      // 기본 표시(NotificationsService.receive)를 건너뛰고 JS 작업만 — 앱이 같은 id·버튼·채널로 직접 그린다
      FirebaseMessagingDelegate.runTaskManagerTasks(applicationContext, RemoteMessageSerializer.toBundle(remoteMessage))
      return
    }
    super.onMessageReceived(remoteMessage)
  }

  companion object {
    private val TYPES = setOf(${TYPES.map((t) => `"${t}"`).join(', ')})
  }
}
`

const withService = (config) =>
  withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools'
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults)
    app.service = (app.service ?? []).filter((s) => !['.SproutMessagingService', EXPO_SERVICE].includes(s.$['android:name']))
    app.service.push(
      { $: { 'android:name': EXPO_SERVICE, 'tools:node': 'remove' } },
      {
        $: { 'android:name': '.SproutMessagingService', 'android:exported': 'false' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }] }]
      }
    )
    return c
  })

/** expo-notifications가 쓰는 firebase-messaging 판을 그대로(그 모듈은 implementation이라 앱에서는 안 보인다) */
function messagingVersion() {
  try {
    const gradle = fs.readFileSync(path.join(path.dirname(require.resolve('expo-notifications/package.json')), 'android/build.gradle'), 'utf8')
    return gradle.match(/firebase-messaging:([\d.]+)/)?.[1] ?? '25.0.1'
  } catch { return '25.0.1' }
}
const DEP_MARK = '// sprout push-service'
const withDependency = (config) =>
  withAppBuildGradle(config, (c) => {
    const line = `    implementation 'com.google.firebase:firebase-messaging:${messagingVersion()}' ${DEP_MARK}`
    const src = c.modResults.contents.split('\n').filter((l) => !l.includes(DEP_MARK)).join('\n')
    c.modResults.contents = src.replace(/^dependencies\s*\{/m, (m) => `${m}\n${line}`)
    return c
  })

const withSource = (config) =>
  withDangerousMod(config, ['android', async (c) => {
    const pkg = c.android?.package
    if (!pkg) throw new Error('push-service: android.package가 필요합니다')
    const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SproutMessagingService.kt'), source(pkg))
    return c
  }])

module.exports = (config) => withSource(withDependency(withService(config)))
