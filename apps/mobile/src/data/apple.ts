// 기기 애플 로그인(20 §4.3.1) — expo-apple-authentication(iOS 13+ 시스템 창).
// - 이 빌드에 애플 로그인 권한이 있을 때만(app.config.ts SPROUT_APPLE_SIGN_IN=1 → extra.appleSignIn) 켠다.
//   권한 없는 빌드에서 부르면 시스템이 오류를 내므로, 그때는 버튼을 "준비 중"으로 둔다.
// - nonce: 무작위 원래 값은 앱이 갖고, 애플에는 SHA-256(hex)만 보낸다 → ID 토큰의 nonce = sha256(원래 값).
//   서버(POST /auth/apple/native)는 원래 값을 받아 같은지 본다(웹 흐름과 같은 규칙, server/api/src/social.ts).
// - authorization_code도 서버로 보낸다: 서버가 .p8 키로 애플에 한 번 더 확인하고, 탈퇴 때 폐기할 refresh_token을 받는다(지침 5.1.1(v)).
// - 이메일 범위만 요청한다(이름은 저장하지 않는다 — 처리방침).
import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'

export type AppleFailCode = 'cancelled' | 'not_configured' | 'busy' | 'failed'
export class AppleSignInError extends Error {
  code: AppleFailCode
  constructor(code: AppleFailCode, message: string = code) {
    super(message)
    this.code = code
  }
}

/** 이 빌드에 애플 로그인 권한이 들어 있나(iOS + SPROUT_APPLE_SIGN_IN=1로 만든 빌드) */
export const appleConfigured = () => Platform.OS === 'ios' && (Constants.expoConfig?.extra as { appleSignIn?: boolean } | undefined)?.appleSignIn === true

type Lib = typeof import('expo-apple-authentication')
let lib: Promise<Lib> | undefined
async function load(): Promise<Lib> {
  lib ??= import('expo-apple-authentication')
  try {
    return await lib
  } catch (e) {
    lib = undefined
    console.warn('[apple] 네이티브 모듈을 불러오지 못했어요:', e)
    throw new AppleSignInError('not_configured')
  }
}

/** 버튼을 진짜로 보여 줄지: 설정 + 기기 지원(iOS 13+) */
export async function appleAvailable(): Promise<boolean> {
  if (!appleConfigured()) return false
  try {
    return await (await load()).isAvailableAsync()
  } catch {
    return false
  }
}

export type AppleCredential = { id_token: string; nonce: string; authorization_code?: string }

let running = false
/** 애플 시스템 창 → 서버에 보낼 {id_token, nonce(원래 값), authorization_code}. 취소는 AppleSignInError('cancelled') */
export async function appleCredential(): Promise<AppleCredential> {
  if (!appleConfigured()) throw new AppleSignInError('not_configured')
  if (running) throw new AppleSignInError('busy')
  running = true
  try {
    const m = await load()
    const raw = Crypto.randomUUID() + Crypto.randomUUID()
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, { encoding: Crypto.CryptoEncoding.HEX })
    try {
      const r = await m.signInAsync({ requestedScopes: [m.AppleAuthenticationScope.EMAIL], nonce: hashed })
      if (!r.identityToken) throw new AppleSignInError('failed', 'no identity token')
      return { id_token: r.identityToken, nonce: raw, ...(r.authorizationCode ? { authorization_code: r.authorizationCode } : {}) }
    } catch (e) {
      if (e instanceof AppleSignInError) throw e
      const code = (e as { code?: string })?.code
      if (code === 'ERR_REQUEST_CANCELED') throw new AppleSignInError('cancelled')
      // 권한(entitlement)이 없는 빌드·시뮬레이터 Apple ID 없음 등
      if (code === 'ERR_INVALID_OPERATION' || code === 'ERR_REQUEST_NOT_HANDLED') throw new AppleSignInError('not_configured', String((e as Error).message))
      console.warn('[apple] 로그인 실패:', e)
      throw new AppleSignInError('failed', e instanceof Error ? e.message : String(e))
    }
  } finally {
    running = false
  }
}
