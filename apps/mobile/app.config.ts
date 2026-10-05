// app.json(정적 설정 전부)을 그대로 받고, 구글 로그인(20 §4.3.1)·푸시(32 §3.3)만 환경에 따라 더한다.
// - 값은 apps/mobile/.env.local(git 제외, 없어도 된다 — 구글 id는 아래 기본값) — Expo CLI가 이 파일을 읽어 둔 뒤 이 설정을 계산한다.
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  웹 애플리케이션 클라이언트(토큰 aud — 서버 GOOGLE_CLIENT_IDS에 넣는다)
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  iOS 클라이언트(번들 app.sprout.mobile) → iOS URL 스킴(뒤집은 id)을 Info.plist에 넣는다
//   SPROUT_GOOGLE_SERVICES_FILE       Android Firebase 설정(google-services.json) 경로. 없으면 ~/.config/sprout/google-services.json
//                                     둘 다 없으면 푸시 없이 빌드된다(앱은 로컬 알림만 — 32 §10 I3, 파일은 git에 넣지 않음)
//   SPROUT_APPLE_TEAM_ID              iOS를 서명할 Apple 팀 ID(기본 app.json의 BU697KN34B). 공유 확장 키체인 그룹·DEVELOPMENT_TEAM이 따라 바뀐다
//   SPROUT_APPLE_SIGN_IN=1            애플 로그인(20 §4.3.1) 켜기(prebuild 때 한 번 주면 그 뒤 Xcode 빌드는 ios/ 권한 파일을 보고 따라간다) — App ID에 "Sign in with Apple" 기능을 켠 팀에서만.
//                                     켜면 expo-apple-authentication 플러그인(권한 com.apple.developer.applesignin)이 들어가고 버튼이 진짜가 된다.
//                                     끄면(기본) 권한 없이 빌드되고 버튼은 "준비 중" — 기능 없는 팀(무료 개인 팀 등)에서도 빌드가 깨지지 않는다
// - iOS id가 없으면 플러그인을 넣지 않는다(앱은 "구글 로그인 설정이 아직 없어요"만 보인다).
// - 값을 바꾸면 네이티브를 다시 만든다: npx expo prebuild --platform <ios|android> && npx expo run:<ios|android>
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ConfigContext, ExpoConfig } from 'expo/config'

/** 123-abc.apps.googleusercontent.com → com.googleusercontent.apps.123-abc */
const reversed = (id: string) => id.trim().split('.').reverse().join('.')

/** 32 §10 I3: 환경 변수 → ~/.config/sprout 순서로 찾는다. 없으면 undefined(푸시 없이 빌드) */
function googleServicesFile(): string | undefined {
  const fromEnv = process.env.SPROUT_GOOGLE_SERVICES_FILE?.trim()
  const candidates = [fromEnv && resolve(fromEnv), join(homedir(), '.config', 'sprout', 'google-services.json')].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(p))
}

// 구글 OAuth 클라이언트 id는 공개 값(앱 바이너리·URL 스킴에 그대로 드러난다)이라 기본값을 저장소에 둔다.
// → .env.local 없이 빌드해도(출시 빌드를 다른 맥에서 만들 때) 구글 로그인이 켜진다. 환경 변수가 있으면 그쪽이 우선.
const GOOGLE_WEB_CLIENT_ID = '795271381893-eucs0durj516igh0uemj0pr7d8slprud.apps.googleusercontent.com'
const GOOGLE_IOS_CLIENT_ID = '795271381893-fkjrqamlm8sm4cqat5kuoerlbh9goq4j.apps.googleusercontent.com'

/** ios/<앱>/<앱>.entitlements에 com.apple.developer.applesignin이 있나(이전 prebuild를 SPROUT_APPLE_SIGN_IN=1로 했나) */
function iosHasAppleSignInEntitlement(): boolean {
  const ios = join(__dirname, 'ios')
  if (!existsSync(ios)) return false
  try {
    for (const d of readdirSync(ios, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      for (const f of readdirSync(join(ios, d.name))) {
        if (f.endsWith('.entitlements') && readFileSync(join(ios, d.name, f), 'utf8').includes('com.apple.developer.applesignin')) return d.name !== 'SproutShare' && d.name !== 'SproutWidget'
      }
    }
  } catch {}
  return false
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || GOOGLE_IOS_CLIENT_ID
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || GOOGLE_WEB_CLIENT_ID
  const plugins = [...(config.plugins ?? [])]
  if (iosClientId && iosClientId.endsWith('.apps.googleusercontent.com')) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: reversed(iosClientId) }])
  }
  // 네이티브 모듈 자체는 자동 링크로 늘 들어간다. 플러그인은 iOS URL 스킴만 맡는다(Android는 설정 파일 없이 webClientId로 충분)
  const gsf = googleServicesFile()
  // 32 §3.3·N3: FCM 데이터 메시지를 배경에서 expo 기본 표시 없이 JS 작업으로만 넘기는 서비스(플러그인 설명 참고)
  // SPROUT_PUSH_PLAIN=1 = 플러그인 없이(0단계 실험 재현용)
  if (gsf && process.env.SPROUT_PUSH_PLAIN !== '1') plugins.push('./plugins/push-service')
  // 서명 팀: 공유 확장·위젯(36) 플러그인 옵션의 teamId를 바꾼다(App Group·키체인 그룹은 팀마다 따로)
  const teamId = process.env.SPROUT_APPLE_TEAM_ID?.trim()
  if (teamId && /^[A-Z0-9]{10}$/.test(teamId)) {
    for (let i = 0; i < plugins.length; i++) {
      const pl = plugins[i]
      if (Array.isArray(pl) && (pl[0] === './plugins/share-extension' || pl[0] === './plugins/widgets')) plugins[i] = [pl[0], { ...(pl[1] ?? {}), teamId }]
    }
  }
  // 주의: Xcode 빌드(아카이브) 때 expo-constants가 이 설정을 다시 계산해 앱에 넣는다 — 그때는 보통 환경 변수가 없다.
  // 그래서 변수가 없으면 prebuild가 만든 ios/ 권한 파일에 애플 로그인 권한이 있는지로 정한다(prebuild ↔ 빌드 값이 어긋나 버튼이 "준비 중"이 되는 것 방지).
  // SPROUT_APPLE_SIGN_IN=0 = 강제로 끔
  const appleEnv = process.env.SPROUT_APPLE_SIGN_IN?.trim()
  const appleSignIn = appleEnv === '1' || (appleEnv !== '0' && iosHasAppleSignInEntitlement())
  if (appleSignIn) plugins.push('expo-apple-authentication')
  const extra = { ...(config.extra ?? {}), pushAndroid: !!gsf, pushIos: false, appleSignIn, googleWebClientId: webClientId, googleIosClientId: iosClientId }
  return {
    ...(config as ExpoConfig),
    plugins,
    extra,
    ios: { ...(config.ios ?? {}), ...(teamId ? { appleTeamId: teamId } : {}), ...(appleSignIn ? { usesAppleSignIn: true } : {}) },
    android: { ...(config.android ?? {}), ...(gsf ? { googleServicesFile: gsf } : {}) }
  }
}
