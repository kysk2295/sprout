import { useEffect, useRef, useState } from 'react'
import { authApi, authErrorText } from '../data/auth'
import './login-social.css'

type Provider = 'google' | 'apple'

// 08 §3~§5: 틱틱 웹 로그인·가입 화면 기준. §3.1 구글·애플로 계속하기(2026-10-06). 비밀번호 찾기는 [다음].
export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [social, setSocial] = useState<Provider | null>(null) // 브라우저에서 진행 중인 공급자
  const [error, setError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  useEffect(() => { emailRef.current?.focus() }, [])
  const locked = busy || !!social

  const submit = async () => {
    const api = authApi()
    if (!api || locked || !email || !password) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('이메일 주소를 확인하세요')
    if (mode === 'signup' && (password.length < 6 || password.length > 64)) return setError('비밀번호는 6-64자로 입력하세요')
    setBusy(true)
    setError('')
    const r = mode === 'login' ? await api.login(email.trim(), password) : await api.signup(email.trim(), password)
    setBusy(false)
    if (!r.ok) {
      setError(authErrorText(r.error))
      requestAnimationFrame(() => passwordRef.current?.select()) // 실패하면 비밀번호 칸으로
    }
  }

  // §3.1: 시스템 브라우저에서 로그인 → 끝나면 메인 프로세스가 로그인 상태를 알려 이 화면이 사라진다
  const continueWith = async (provider: Provider) => {
    const api = authApi()
    if (!api?.social || locked) return
    setSocial(provider)
    setError('')
    const r = await api.social(provider)
    setSocial(null)
    if (!r.ok && !('code' in r && r.code === 'cancelled')) setError('code' in r ? r.error : authErrorText(r.error))
  }
  const cancelSocial = () => { void authApi()?.socialCancel?.() }
  useEffect(() => {
    if (!social) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelSocial() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [social])

  const switchMode = () => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setPassword('') }

  return (
    <div className="login">
      <div className="login__drag" />
      <form className="login__card" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <h1 className="login__title">{mode === 'login' ? '로그인' : '등록하기'}</h1>
        <input
          ref={emailRef}
          className="login__input"
          type="email"
          spellCheck={false}
          autoComplete="email"
          placeholder="이메일"
          value={email}
          disabled={locked}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus() } }}
        />
        <input
          ref={passwordRef}
          className="login__input"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={mode === 'login' ? '비밀번호' : '비밀번호: 6-64자'}
          value={password}
          disabled={locked}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="login__error" role="alert">{error}</p>}
        <button className="login__submit" type="submit" disabled={locked || !email || !password}>
          {busy ? <span className="login__spinner" aria-label="처리 중" /> : mode === 'login' ? '로그인' : '등록하기'}
        </button>
        <div className="login__divider" role="separator" />
        <SocialButton provider="google" waiting={social === 'google'} disabled={locked} onClick={() => void continueWith('google')} />
        <SocialButton provider="apple" waiting={social === 'apple'} disabled={locked} onClick={() => void continueWith('apple')} />
        {social && (
          <p className="login__waiting">
            브라우저에서 로그인을 마쳐 주세요. <button type="button" onClick={cancelSocial}>취소</button>
          </p>
        )}
        {mode === 'signup' && (
          <p className="login__terms">가입함으로써 <span>이용 약관</span> 및 <span>개인정보 처리방침</span>에 동의하게 됩니다.</p>
        )}
      </form>
      <p className="login__switch">
        {mode === 'login' ? '계정이 없으세요?' : '이미 계정이 있으신가요?'}
        <button type="button" onClick={switchMode} disabled={locked}>{mode === 'login' ? '등록하기' : '로그인'}</button>
      </p>
    </div>
  )
}

// 공급자 표시는 각 회사의 로그인 버튼 지침을 따른다: 구글 = 4색 "G" 원본 모양(바꾸지 않음),
// 애플 = 애플 로고(글자색과 같은 단색), 문구는 "Google로 계속하기"·"Apple로 계속하기", 두 버튼은 같은 크기.
function SocialButton({ provider, waiting, disabled, onClick }: { provider: Provider; waiting: boolean; disabled: boolean; onClick: () => void }) {
  const label = provider === 'google' ? 'Google로 계속하기' : 'Apple로 계속하기'
  return (
    <button type="button" className={`login__social login__social--${provider}`} disabled={disabled} aria-busy={waiting} onClick={onClick}>
      {waiting ? <span className="login__spinner login__spinner--dark" aria-hidden /> : provider === 'google' ? <GoogleMark /> : <AppleMark />}
      <span>{waiting ? '브라우저에서 계속하는 중…' : label}</span>
    </button>
  )
}

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden>
      <path fill="#EA4335" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z" />
      <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#FBBC05" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z" />
    </svg>
  )
}

export function AppleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 814 1000" aria-hidden>
      <path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  )
}
