// 기기 구글 로그인(20 §4.3.1) — @react-native-google-signin/google-signin 무료 "Original" API.
// - 두 플랫폼 모두 webClientId(웹 애플리케이션 클라이언트)를 넘긴다 → ID 토큰 aud = 웹 클라이언트 id, azp = iOS·Android 클라이언트.
//   서버는 nonce 없는 토큰을 이 모양(azp ≠ aud)·10분 안·한 번만으로 받는다(server/api/src/social.ts).
// - 매번 기기 구글 세션을 먼저 지운다 → 항상 계정 고르기 창 + 새 토큰(데스크톱 prompt=select_account와 같음).
// - 네이티브 모듈은 처음 쓸 때 불러온다: 모듈이 없는 옛 개발 빌드에서도 앱이 죽지 않고 "설정이 아직 없어요"로 끝난다.
import Constants from 'expo-constants'
import { Platform } from 'react-native'

export type GoogleFailCode = 'cancelled' | 'not_configured' | 'play_services' | 'busy' | 'failed'
export class GoogleSignInError extends Error {
  code: GoogleFailCode
  constructor(code: GoogleFailCode, message: string = code) {
    super(message)
    this.code = code
  }
}

// 빌드 때 env(.env.local) → 없으면 app.config.ts가 extra에 넣은 기본값(공개 id)
const extra = (Constants.expoConfig?.extra ?? {}) as { googleWebClientId?: string; googleIosClientId?: string }
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || extra.googleWebClientId?.trim() || ''
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || extra.googleIosClientId?.trim() || ''
const isClientId = (v: string) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(v)

/** 이 빌드에 구글 로그인 설정(id)이 들어 있나. iOS는 iOS 클라이언트 id(URL 스킴)도 있어야 한다 */
export const googleConfigured = () => isClientId(WEB_CLIENT_ID) && (Platform.OS !== 'ios' || isClientId(IOS_CLIENT_ID))

type Lib = typeof import('@react-native-google-signin/google-signin')
let lib: Promise<Lib> | undefined
let configured = false
async function load(): Promise<Lib> {
  lib ??= import('@react-native-google-signin/google-signin')
  try {
    const m = await lib
    if (!configured) {
      m.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, ...(Platform.OS === 'ios' ? { iosClientId: IOS_CLIENT_ID } : {}), scopes: ['email', 'profile'] })
      configured = true
    }
    return m
  } catch (e) {
    lib = undefined
    console.warn('[google] 네이티브 모듈을 불러오지 못했어요:', e)
    throw new GoogleSignInError('not_configured')
  }
}

let running = false
/** 계정 고르기 → ID 토큰. 실패는 GoogleSignInError(cancelled면 화면에 아무것도 안 띄운다) */
export async function googleIdToken(): Promise<string> {
  if (!googleConfigured()) throw new GoogleSignInError('not_configured')
  if (running) throw new GoogleSignInError('busy')
  running = true
  try {
    const m = await load()
    const { GoogleSignin, isErrorWithCode, statusCodes } = m
    try {
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      await GoogleSignin.signOut().catch(() => {}) // 지난 선택을 잊어 매번 계정 고르기
      const r = await GoogleSignin.signIn()
      if (r.type === 'cancelled') throw new GoogleSignInError('cancelled')
      const token = r.data.idToken
      if (!token) throw new GoogleSignInError('not_configured') // webClientId가 잘못되면 토큰이 비어 온다
      return token
    } catch (e) {
      if (e instanceof GoogleSignInError) throw e
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleSignInError('cancelled')
        if (e.code === statusCodes.IN_PROGRESS) throw new GoogleSignInError('busy')
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new GoogleSignInError('play_services')
        // Android DEVELOPER_ERROR(10) = SHA-1·패키지·클라이언트가 맞지 않음 → 설정 문제
        if (String(e.code) === '10' || /DEVELOPER_ERROR/.test(e.message)) throw new GoogleSignInError('not_configured', e.message)
      }
      console.warn('[google] 로그인 실패:', e)
      throw new GoogleSignInError('failed', e instanceof Error ? e.message : String(e))
    }
  } finally {
    running = false
  }
}
