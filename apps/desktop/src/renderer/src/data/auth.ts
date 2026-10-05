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

// ── 08 §3.1.1 로그인 방법 연결(설정 › 계정, 틱틱 "Google · Apple — 연결") ──
export type LinkProvider = 'google' | 'apple'
export type LinkedIdentity = { provider: LinkProvider; email: string | null }
export const LINK_NAME: Record<LinkProvider, string> = { google: 'Google', apple: 'Apple' }
export const linkToast = (p: LinkProvider) =>
  p === 'google' ? "구글 계정을 연결했어요 — 다음부터 'Google로 계속하기'로 들어올 수 있어요" : "Apple 계정을 연결했어요 — 다음부터 'Apple로 계속하기'로 들어올 수 있어요"
export const unlinkToast = (p: LinkProvider) => `${LINK_NAME[p]} 연결을 해제했어요`

export type MethodRow = {
  provider: LinkProvider
  linked: boolean
  email: string | null      // 서버가 가린 이메일
  ready: boolean            // 앱·서버에 설정이 있어 연결할 수 있나(없으면 "준비 중")
  canUnlink: boolean        // 떼어도 로그인할 길이 남나(비밀번호 또는 다른 공급자)
}

/** 계정 탭 "로그인 방법" 줄(구글 → 애플). available: socialStatus(apple null = 서버에 묻지 못함 → 준비 중) */
export function loginMethodRows(i: { hasPassword: boolean; identities: LinkedIdentity[]; available: { google: boolean; apple: boolean | null } }): MethodRow[] {
  return (['google', 'apple'] as const).map((provider) => {
    const mine = i.identities.find((x) => x.provider === provider)
    return {
      provider,
      linked: !!mine,
      email: mine?.email ?? null,
      ready: !!i.available[provider],
      canUnlink: !!mine && (i.hasPassword || i.identities.some((x) => x.provider !== provider))
    }
  })
}

/** 연결·해제 실패 → 줄 아래 빨간 한 줄. 취소는 표시하지 않는다(null) */
export function linkErrorText(r: { error: string; code: string }): string | null {
  if (r.code === 'cancelled') return null
  return r.error || '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
}

// ── 01 §3.2.1 레일 ⟳ · ⌘S 결과 토스트 ──
export type SyncNowResult = { ok: true; pending: number; lastSyncedAt: string | null } | { ok: false; reason: 'signed-out' | 'offline' | 'timeout' } | { ok: false; reason: 'error'; message: string }
/** 누른 뒤 최소로 도는 시간(보낼 것이 없어 바로 끝나도 눌린 게 보이게) */
export const SYNC_MIN_SPIN_MS = 800
/** 결과 → 토스트 문구와 "다시 시도" 버튼 여부 */
export function syncResultToast(r: SyncNowResult): { text: string; retry: boolean } {
  if (r.ok) return { text: r.pending > 0 ? `동기화 완료 · 올릴 것 ${r.pending}건 남음` : '동기화 완료', retry: false }
  if (r.reason === 'offline') return { text: '오프라인이에요 — 연결되면 자동으로 올라가요', retry: true }
  if (r.reason === 'timeout') return { text: '동기화가 오래 걸려요 — 뒤에서 계속할게요', retry: false }
  if (r.reason === 'signed-out') return { text: '로그인하면 동기화돼요', retry: false }
  return { text: '동기화에 실패했어요', retry: true }
}
