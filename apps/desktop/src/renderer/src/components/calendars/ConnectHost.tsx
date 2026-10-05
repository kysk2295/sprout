import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ASK_EVENT, calendarsApi, CONNECT_EVENT, NOTICE_EVENT, providerName, type AskReq, type Provider } from '../../data/calendars'
import type { ConnectProgress } from '../../../../shared/calendars'
import { Dialog } from '../Dialog'
import { useToast } from '../Toast'
import './calendars.css'

// 16 §3.4 연결 진행 모달 + §12 확인 대화(쓰기 권한·반복 범위·참석자 메일). 앱·설정 창에 하나씩 붙여 두면 connectCalendar(provider)·askGrant 등으로 열린다(같은 창에 둘이면 먼저 붙은 것만 받는다)
let owner: symbol | undefined
type Req = { provider: Provider; resolve: (r: { ok: boolean; message: string }) => void }

export function CalendarConnectHost() {
  const id = useRef(Symbol('host'))
  const [req, setReq] = useState<Req>()
  const [ask, setAsk] = useState<AskReq>()
  useEffect(() => {
    if (!owner) owner = id.current
    const on = (e: Event) => {
      if (owner !== id.current) return
      const d = (e as CustomEvent<Req>).detail
      setReq((cur) => cur ?? d)
    }
    const onAsk = (e: Event) => {
      if (owner !== id.current) return
      const d = (e as CustomEvent<AskReq>).detail
      setAsk((cur) => { if (cur) { (d.resolve as (v: null | false) => void)(d.kind === 'grant' ? false : null); return cur } return d })
    }
    window.addEventListener(CONNECT_EVENT, on)
    window.addEventListener(ASK_EVENT, onAsk)
    return () => { window.removeEventListener(CONNECT_EVENT, on); window.removeEventListener(ASK_EVENT, onAsk); if (owner === id.current) owner = undefined }
  }, [])
  return (
    <>
      {req && <ConnectDialog key={req.provider} req={req} onClose={() => setReq(undefined)} />}
      {ask?.kind === 'grant' && <GrantDialog req={ask} onClose={() => setAsk(undefined)} />}
      {ask?.kind === 'scope' && <ScopeDialog req={ask} onClose={() => setAsk(undefined)} />}
      {ask?.kind === 'notify' && <NotifyDialog req={ask} onClose={() => setAsk(undefined)} />}
    </>
  )
}

/** 16 §12.3.2 v1으로 연결한 구글 계정: 처음 고칠 때 쓰기 권한(증분 동의) */
function GrantDialog({ req, onClose }: { req: Extract<AskReq, { kind: 'grant' }>; onClose: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const done = useRef(false)
  const finish = (ok: boolean) => { if (done.current) return; done.current = true; req.resolve(ok); onClose() }
  const grant = async () => {
    const api = calendarsApi()
    if (!api) return finish(false)
    setBusy(true); setError(undefined)
    const r = await api.grantWrite(req.accountId)
    setBusy(false)
    if (r.ok) { toast.show('구글 캘린더에 쓰기 권한을 허용했어요'); finish(true) }
    else if (r.code === 'cancelled') finish(false)
    else setError(r.error)
  }
  const later = () => { if (busy) void calendarsApi()?.cancel(); else { toast.show('쓰기 권한을 받지 못해서 바꾸지 않았어요'); finish(false) } }
  return (
    <Dialog label="구글 캘린더 쓰기 권한" className="cal-connect cal-ask" onClose={later}>
      <h2>구글 캘린더에 쓰기 권한이 필요해요</h2>
      {busy ? (
        <>
          <p>브라우저에서 구글 허용을 마쳐 주세요.</p>
          <Loader2 className="cal-spin cal-connect__spin" aria-label="기다리는 중" />
        </>
      ) : <p>{req.label}의 일정을 꿈틀에서 만들고 고치려면 구글에서 한 번 더 허용해 주세요. 바꾼 내용은 바로 구글 캘린더에도 저장돼요.</p>}
      {error && <p className="cal-connect__error" role="alert">{error}</p>}
      <footer>
        {busy && <button className="cal-connect__link" onClick={() => void calendarsApi()?.reopen()}>링크 다시 열기</button>}
        <span className="cal-connect__gap" />
        <button onClick={later}>{busy ? '취소' : '나중에'}</button>
        {!busy && <button className="entry-primary" data-autofocus onClick={() => void grant()}>{error ? '다시 시도' : '허용하기'}</button>}
      </footer>
    </Dialog>
  )
}

/** 16 §12.8 반복 범위 — 틱틱 할 일 대화(Only This Recurrence · All Future Recurrences · All Unfinished Recurrences)의 말을 일정에 맞춤 */
function ScopeDialog({ req, onClose }: { req: Extract<AskReq, { kind: 'scope' }>; onClose: () => void }) {
  const pick = (s: 'this' | 'following' | 'all' | null) => { req.resolve(s); onClose() }
  const del = req.action === 'delete'
  return (
    <Dialog label={del ? '반복 일정 삭제' : '반복 일정 편집'} className="cal-ask cal-scope" onClose={() => pick(null)}>
      <h2>{del ? '반복 일정 삭제' : '반복 일정 편집'}</h2>
      <p>{del ? '반복 일정을 지우고 있어요. 지울 범위를 골라 주세요.' : '반복 일정을 바꾸고 있어요. 바꿀 범위를 골라 주세요.'}</p>
      <div className="cal-scope__choices">
        <button data-autofocus onClick={() => pick('this')}>이번 회차만</button>
        <button onClick={() => pick('following')}>이후 모든 회차</button>
        <button onClick={() => pick('all')}>모든 회차</button>
      </div>
      <footer><span className="cal-connect__gap" /><button onClick={() => pick(null)}>취소</button></footer>
    </Dialog>
  )
}

/** 16 §12.8 참석자 메일(내가 주최자 + 다른 참석자) — 매번 묻는다 */
function NotifyDialog({ req, onClose }: { req: Extract<AskReq, { kind: 'notify' }>; onClose: () => void }) {
  const pick = (v: boolean | null) => { req.resolve(v); onClose() }
  return (
    <Dialog label="참석자에게 알리기" className="cal-ask" onClose={() => pick(null)}>
      <h2>참석자에게 변경 내용을 이메일로 알릴까요?</h2>
      <footer>
        <span className="cal-connect__gap" />
        <button onClick={() => pick(false)}>보내지 않기</button>
        <button className="entry-primary" data-autofocus onClick={() => pick(true)}>보내기</button>
      </footer>
    </Dialog>
  )
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
