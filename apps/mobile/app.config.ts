// app.json(정적 설정 전부)을 그대로 받고, 구글 로그인(20 §4.3.1)만 환경 변수로 더한다.
// - 값은 apps/mobile/.env.local(git 제외) — Expo CLI가 이 파일을 읽어 둔 뒤 이 설정을 계산한다.
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  웹 애플리케이션 클라이언트(토큰 aud — 서버 GOOGLE_CLIENT_IDS에 넣는다)
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  iOS 클라이언트(번들 app.sprout.mobile) → iOS URL 스킴(뒤집은 id)을 Info.plist에 넣는다
// - iOS id가 없으면 플러그인을 넣지 않는다(앱은 "구글 로그인 설정이 아직 없어요"만 보인다).
// - 값을 바꾸면 네이티브를 다시 만든다: npx expo prebuild --platform ios && npx expo run:ios
import type { ConfigContext, ExpoConfig } from 'expo/config'

/** 123-abc.apps.googleusercontent.com → com.googleusercontent.apps.123-abc */
const reversed = (id: string) => id.trim().split('.').reverse().join('.')

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim()
  const plugins = [...(config.plugins ?? [])]
  if (iosClientId && iosClientId.endsWith('.apps.googleusercontent.com')) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: reversed(iosClientId) }])
  }
  // 네이티브 모듈 자체는 자동 링크로 늘 들어간다. 플러그인은 iOS URL 스킴만 맡는다(Android는 설정 파일 없이 webClientId로 충분)
  return { ...(config as ExpoConfig), plugins }
}
