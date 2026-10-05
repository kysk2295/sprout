// app.json(정적 설정 전부)을 그대로 받고, 구글 로그인(20 §4.3.1)·푸시(32 §3.3)만 환경에 따라 더한다.
// - 값은 apps/mobile/.env.local(git 제외) — Expo CLI가 이 파일을 읽어 둔 뒤 이 설정을 계산한다.
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  웹 애플리케이션 클라이언트(토큰 aud — 서버 GOOGLE_CLIENT_IDS에 넣는다)
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  iOS 클라이언트(번들 app.sprout.mobile) → iOS URL 스킴(뒤집은 id)을 Info.plist에 넣는다
//   SPROUT_GOOGLE_SERVICES_FILE       Android Firebase 설정(google-services.json) 경로. 없으면 ~/.config/sprout/google-services.json
//                                     둘 다 없으면 푸시 없이 빌드된다(앱은 로컬 알림만 — 32 §10 I3, 파일은 git에 넣지 않음)
//   SPROUT_APPLE_TEAM_ID              iOS를 서명할 Apple 팀 ID(기본 app.json의 BU697KN34B). 공유 확장 키체인 그룹·DEVELOPMENT_TEAM이 따라 바뀐다
//   SPROUT_APPLE_SIGN_IN=1            애플 로그인(20 §4.3.1) 켜기 — App ID에 "Sign in with Apple" 기능을 켠 팀에서만.
//                                     켜면 expo-apple-authentication 플러그인(권한 com.apple.developer.applesignin)이 들어가고 버튼이 진짜가 된다.
//                                     끄면(기본) 권한 없이 빌드되고 버튼은 "준비 중" — 기능 없는 팀(무료 개인 팀 등)에서도 빌드가 깨지지 않는다
// - iOS id가 없으면 플러그인을 넣지 않는다(앱은 "구글 로그인 설정이 아직 없어요"만 보인다).
// - 값을 바꾸면 네이티브를 다시 만든다: npx expo prebuild --platform <ios|android> && npx expo run:<ios|android>
import { existsSync } from 'node:fs'
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

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim()
  const plugins = [...(config.plugins ?? [])]
  if (iosClientId && iosClientId.endsWith('.apps.googleusercontent.com')) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: reversed(iosClientId) }])
  }
  // 네이티브 모듈 자체는 자동 링크로 늘 들어간다. 플러그인은 iOS URL 스킴만 맡는다(Android는 설정 파일 없이 webClientId로 충분)
  const gsf = googleServicesFile()
  // 32 §3.3·N3: FCM 데이터 메시지를 배경에서 expo 기본 표시 없이 JS 작업으로만 넘기는 서비스(플러그인 설명 참고)
  // SPROUT_PUSH_PLAIN=1 = 플러그인 없이(0단계 실험 재현용)
  if (gsf && process.env.SPROUT_PUSH_PLAIN !== '1') plugins.push('./plugins/push-service')
  // 서명 팀: 공유 확장 플러그인 옵션의 teamId를 바꾼다(App Group·키체인 그룹은 팀마다 따로)
  const teamId = process.env.SPROUT_APPLE_TEAM_ID?.trim()
  if (teamId && /^[A-Z0-9]{10}$/.test(teamId)) {
    for (let i = 0; i < plugins.length; i++) {
      const pl = plugins[i]
      if (Array.isArray(pl) && pl[0] === './plugins/share-extension') plugins[i] = [pl[0], { ...(pl[1] ?? {}), teamId }]
    }
  }
  const appleSignIn = process.env.SPROUT_APPLE_SIGN_IN === '1'
  if (appleSignIn) plugins.push('expo-apple-authentication')
  const extra = { ...(config.extra ?? {}), pushAndroid: !!gsf, pushIos: false, appleSignIn }
  return {
    ...(config as ExpoConfig),
    plugins,
    extra,
    ios: { ...(config.ios ?? {}), ...(teamId ? { appleTeamId: teamId } : {}), ...(appleSignIn ? { usesAppleSignIn: true } : {}) },
    android: { ...(config.android ?? {}), ...(gsf ? { googleServicesFile: gsf } : {}) }
  }
}
