import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { calendarsApi, CONNECT_EVENT, NOTICE_EVENT, providerName, type Provider } from '../../data/calendars'
import type { ConnectProgress } from '../../../../shared/calendars'
import { Dialog } from '../Dialog'
import { useToast } from '../Toast'
import './calendars.css'

// 16 §3.4 연결 진행 모달. 앱·설정 창에 하나씩 붙여 두면 connectCalendar(provider)로 열린다(같은 창에 둘이면 먼저 붙은 것만 받는다)
let owner: symbol | undefined
type Req = { provider: Provider; resolve: (r: { ok: boolean; message: string }) => void }

export function CalendarConnectHost() {
  const id = useRef(Symbol('host'))
  const [req, setReq] = useState<Req>()
  useEffect(() => {
    if (!owner) owner = id.current
    const on = (e: Event) => {
      if (owner !== id.current) return
      const d = (e as CustomEvent<Req>).detail
      setReq((cur) => cur ?? d)
    }
    window.addEventListener(CONNECT_EVENT, on)
    return () => { window.removeEventListener(CONNECT_EVENT, on); if (owner === id.current) owner = undefined }
  }, [])
  if (!req) return null
  return <ConnectDialog key={req.provider} req={req} onClose={() => setReq(undefined)} />
}

function ConnectDialog({ req, onClose }: { req: Req; onClose: () => void }) {
  const toast = useToast()
  const [error, setError] = useState<string>()
  const [step, setStep] = useState<ConnectProgress['step']>()
  const [attempt, setAttempt] = useState(0)
  const done = useRef(false)
  const calls = useRef<Record<number, ReturnType<NonNullable<ReturnType<typeof calendarsApi>>['connect']>>>({})
  const finish = (r: { ok: boolean; message: string }) => {
    if (done.current) return
    done.current = true
    req.resolve(r)
    onClose()
  }
  useEffect(() => calendarsApi()?.onProgress((p) => { if (p.provider === req.provider) setStep(p.step) }), [req.provider])
  useEffect(() => {
    const api = calendarsApi()
    if (!api) { setError('데스크톱 앱에서만 연결할 수 있어요.'); return }
    let live = true
    setError(undefined)
    // 개발 모드(StrictMode)는 효과를 두 번 돌린다 — 같은 시도는 한 번만 연결하고 결과를 함께 기다린다
    const run = (calls.current[attempt] ??= api.connect(req.provider))
    void run.then((r) => {
      if (!live) return
      if (r.ok) {
        const message = r.message ?? `${providerName(req.provider)}를 연결했어요`
        toast.show(message)
        window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: message }))
        finish({ ok: true, message })
      } else if (r.code === 'cancelled') finish({ ok: false, message: r.error })
      else setError(r.error)
    })
    return () => { live = false }
  }, [attempt]) // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = () => { void calendarsApi()?.cancel(); finish({ ok: false, message: '연결을 취소했어요.' }) }
  const google = req.provider === 'google'
  return (
    <Dialog label={`${providerName(req.provider)} 연결`} className="cal-connect" onClose={cancel}>
      <h2>{providerName(req.provider)} 연결</h2>
      {error ? (
        <p className="cal-connect__error" role="alert">{error}</p>
      ) : (
        <>
          <p>{google ? (step === 'sync' || step === 'token' ? '일정을 가져오는 중…' : '브라우저에서 구글 로그인과 권한 허용을 마쳐 주세요.') : 'macOS 권한 창에서 "허용"을 눌러 주세요.'}</p>
          <Loader2 className="cal-spin cal-connect__spin" aria-label="기다리는 중" />
          {google && <p className="cal-connect__hint">구글에서 "액세스 차단됨"이 보이면 아직 테스트 사용자로 등록되지 않은 계정이에요. 운영자에게 등록을 요청해 주세요.</p>}
        </>
      )}
      <footer>
        {google && !error && <button className="cal-connect__link" onClick={() => void calendarsApi()?.reopen()}>링크 다시 열기</button>}
        <span className="cal-connect__gap" />
        {error && <button onClick={() => setAttempt((a) => a + 1)}>다시 시도</button>}
        <button onClick={error ? () => finish({ ok: false, message: error }) : cancel}>{error ? '닫기' : '취소'}</button>
      </footer>
    </Dialog>
  )
}
