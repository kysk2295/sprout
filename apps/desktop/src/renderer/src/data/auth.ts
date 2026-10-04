import { useEffect, useState } from 'react'

// 08 로그인·동기화 상태: 메인 프로세스(sync.ts)가 알려주는 상태를 화면에서 쓴다
export type AuthState = { user: { id: string; email: string } | null; newAccount?: boolean; notice?: 'account-deleted'; sync: { connected: boolean; uploading: boolean; downloading: boolean; lastSyncedAt: string | null; error: string | null } }

/** 서버 연결이 있는 데스크톱에서만 로그인한다(웹 미리보기는 null = 로그인 화면 없음) */
export const authApi = () => window.sprout?.auth ?? null

export function useAuth(): { state: AuthState | undefined; enabled: boolean } {
  const api = authApi()
  const [state, setState] = useState<AuthState>()
  useEffect(() => {
    if (!api) return
    let alive = true
    void api.state().then((s) => alive && setState(s))
    const off = api.onState((s) => setState(s))
    return () => { alive = false; off() }
  }, [api])
  return { state, enabled: !!api }
}

/** 08 §4 오류 문구: 서버 오류 코드 → 한국어 */
export function authErrorText(error: string): string {
  if (/social account/.test(error)) { // 08 §3.1 구글·애플로만 가입한 계정
    const p = error.split(':')[1] ?? ''
    return `${p.includes('google') && p.includes('apple') ? 'Google 또는 Apple' : p.includes('apple') ? 'Apple' : 'Google'}로 가입한 계정이에요. 아래 버튼으로 계속하세요`
  }
  if (/invalid email/.test(error)) return '이메일 주소를 확인하세요'
  if (/invalid credentials|unauthorized/.test(error)) return '이메일 또는 비밀번호가 맞지 않아요'
  if (/already registered/.test(error)) return '이미 가입된 이메일이에요'
  if (/password must/.test(error)) return '비밀번호는 6-64자로 입력하세요'
  if (/시도가 너무 많아요/.test(error)) return error // 서버가 준 한국어 그대로(몇 분 뒤인지 들어 있다)
  if (/too many/.test(error)) return '잠시 뒤 다시 시도하세요'
  return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
}

// ── 08 §7.1 계정 삭제 ──
export const DELETE_WORD = '삭제'
/** 다시 확인 방법: 비밀번호가 있으면 비밀번호, 구글·애플로만 가입했으면 "방금 다시 로그인" */
export type DeleteMode = 'password' | 'social'
export const deleteMode = (hasPassword: boolean): DeleteMode => (hasPassword ? 'password' : 'social')
export const providerLabel = (providers: string[]) =>
  providers.includes('google') && providers.includes('apple') ? 'Google 또는 Apple' : providers.includes('apple') ? 'Apple' : 'Google'

/** [계정 삭제] 버튼을 눌러도 되나: "삭제"를 정확히 입력 + (비밀번호 입력 | 방금 다시 로그인) */
export function deleteReady(i: { mode: DeleteMode; confirmText: string; password: string; reauthed: boolean; busy: boolean }): boolean {
  if (i.busy || i.confirmText.trim() !== DELETE_WORD) return false
  return i.mode === 'password' ? i.password.length > 0 : i.reauthed
}

/** 삭제 실패 → 카드 안 빨간 한 줄 */
export function deleteErrorText(error: string, status: number, providers: string[] = []): string {
  if (/invalid password/.test(error)) return '비밀번호가 맞지 않아요'
  if (/reauth required/.test(error)) return `보안을 위해 ${providerLabel(providers)}로 다시 로그인한 뒤 10분 안에 삭제해 주세요`
  if (status === 429 || /시도가 너무 많아요/.test(error)) return /분 뒤/.test(error) ? error : '잠시 뒤 다시 시도하세요'
  if (status === 401 || /unauthorized/.test(error)) return '로그인이 만료됐어요. 다시 로그인한 뒤 시도하세요'
  return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
}
