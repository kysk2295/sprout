import { useEffect, useRef, useState } from 'react'
import { authApi, authErrorText } from '../data/auth'

// 08 §3~§5: 틱틱 웹 로그인·가입 화면 기준. 구글·애플·비밀번호 찾기는 [다음]이라 아직 보이지 않는다.
export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  useEffect(() => { emailRef.current?.focus() }, [])

  const submit = async () => {
    const api = authApi()
    if (!api || busy || !email || !password) return
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
          disabled={busy}
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
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="login__error" role="alert">{error}</p>}
        <button className="login__submit" type="submit" disabled={busy || !email || !password}>
          {busy ? <span className="login__spinner" aria-label="처리 중" /> : mode === 'login' ? '로그인' : '등록하기'}
        </button>
        {mode === 'signup' && (
          <p className="login__terms">가입함으로써 <span>이용 약관</span> 및 <span>개인정보 처리방침</span>에 동의하게 됩니다.</p>
        )}
      </form>
      <p className="login__switch">
        {mode === 'login' ? '계정이 없으세요?' : '이미 계정이 있으신가요?'}
        <button type="button" onClick={switchMode}>{mode === 'login' ? '등록하기' : '로그인'}</button>
      </p>
    </div>
  )
}
