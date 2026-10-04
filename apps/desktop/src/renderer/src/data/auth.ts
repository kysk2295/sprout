import { useEffect, useState } from 'react'

// 08 로그인·동기화 상태: 메인 프로세스(sync.ts)가 알려주는 상태를 화면에서 쓴다
export type AuthState = { user: { id: string; email: string } | null; newAccount?: boolean; sync: { connected: boolean; uploading: boolean; downloading: boolean; lastSyncedAt: string | null; error: string | null } }

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
  if (/too many/.test(error)) return '잠시 뒤 다시 시도하세요'
  return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
}
