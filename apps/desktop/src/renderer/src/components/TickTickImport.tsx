// 17 틱틱에서 가져오기 대화상자: 연결 → 미리보기 → 가져오기(진행) → 결과 + 다음 단계
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Dialog } from './Dialog'
import type { TTBundle, TTConnectInput, TTProgress, TTResult, TTStatus } from '../../../shared/ticktick'
import { applyImport, importedOpenTaskIds, organizeImported, previewImport, type ImportResult, type Preview } from '../data/ticktickImport'
import './TickTickImport.css'
import { OverdueImportButton } from './overdue/OverdueBits' // 19 §3.1 가져온 만료가 많으면 정리

/** preload가 window.sprout.ticktick으로 내놓는 것(17 §7) */
export interface SproutTickTickApi {
  status: () => Promise<TTStatus>
  connect: (input: TTConnectInput) => Promise<TTResult<TTStatus>>
  cancel: () => Promise<TTStatus>
  fetch: () => Promise<TTResult<TTBundle>>
  disconnect: () => Promise<TTStatus>
  onProgress: (cb: (p: TTProgress) => void) => () => void
}
const api = () => (window as unknown as { sprout?: { ticktick?: SproutTickTickApi } }).sprout?.ticktick

// ── 어디서든 열기(⌘K 명령·설정) ──
const OPEN_EVENT = 'sprout:ticktick-import'
export const openTickTickImport = () => window.dispatchEvent(new Event(OPEN_EVENT))
/** App에 한 번 붙여 두면 openTickTickImport()로 열린다 */
export function TickTickImportHost(props: Omit<Props, 'onClose'>) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])
  return open ? <TickTickImport {...props} onClose={() => setOpen(false)} /> : null
}

type Step =
  | { s: 'loading' }
  | { s: 'connect'; error?: string }
  | { s: 'waiting' }
  | { s: 'fetching'; progress?: TTProgress }
  | { s: 'preview'; preview: Preview }
  | { s: 'importing'; done: number; total: number }
  | { s: 'done'; result: ImportResult; preview: Preview }
  | { s: 'organizing'; done: number; total: number; result: ImportResult; preview: Preview }
  | { s: 'organized'; count: number; total: number; result: ImportResult; preview: Preview; stopped: boolean }
  | { s: 'error'; error: string; reconnect?: boolean }

export interface Props {
  onClose: () => void
  /** 작업 지도 탭으로 이동(정리 결과 보기) */
  onOpenMap?: () => void
  /** 캘린더 탭으로 이동 */
  onOpenCalendar?: () => void
}

const n = (v: number) => v.toLocaleString('ko-KR')
const fetchLabel = (p?: TTProgress) =>
  !p ? '틱틱에 연결하고 있어요…' : p.step === 'projects' ? '리스트 목록을 읽고 있어요…' : p.step === 'data' ? `리스트를 읽고 있어요 (${p.done}/${p.total})${p.label ? ` · ${p.label}` : ''}` : p.step === 'completed' ? `완료한 할 일 기록을 읽고 있어요 (요청 ${p.done}번째)` : '정리하고 있어요…'

export function TickTickImport({ onClose, onOpenMap, onOpenCalendar }: Props) {
  const [step, setStep] = useState<Step>({ s: 'loading' })
  const [status, setStatus] = useState<TTStatus>()
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const abort = useRef<AbortController>(undefined)
  const busy = ['waiting', 'fetching', 'importing', 'organizing'].includes(step.s)
  const tt = api()

  const load = async () => {
    if (!tt) { setStep({ s: 'error', error: '데스크톱 앱에서만 쓸 수 있어요.' }); return }
    const st = await tt.status()
    setStatus(st)
    if (st.connected) await fetchData()
    else setStep({ s: 'connect' })
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => tt?.onProgress((p) => setStep((cur) => (cur.s === 'fetching' ? { s: 'fetching', progress: p } : cur))), [tt])

  async function fetchData() {
    if (!tt) return
    setStep({ s: 'fetching' })
    const r = await tt.fetch()
    if (!r.ok) {
      setStatus(await tt.status())
      setStep(r.reconnect ? { s: 'connect', error: r.error } : { s: 'error', error: r.error })
      return
    }
    try { setStep({ s: 'preview', preview: await previewImport(r.value) }) } catch (e) { setStep({ s: 'error', error: e instanceof Error ? e.message : String(e) }) }
  }
  async function connect(input: TTConnectInput) {
    if (!tt) return
    setStep(input.kind === 'oauth' ? { s: 'waiting' } : { s: 'fetching' })
    const r = await tt.connect(input)
    if (!r.ok) { setStep({ s: 'connect', error: r.error }); return }
    setStatus(r.value)
    setToken('')
    await fetchData()
  }
  async function disconnect() {
    if (!tt) return
    setStatus(await tt.disconnect())
    setStep({ s: 'connect' })
  }
  async function runImport(preview: Preview) {
    setStep({ s: 'importing', done: 0, total: 1 })
    try {
      const result = await applyImport(preview.plan, (done, total) => setStep({ s: 'importing', done, total }))
      setStep({ s: 'done', result, preview })
    } catch (e) { setStep({ s: 'error', error: `가져오다 멈췄어요. 다시 가져오면 이어서 넣어요. (${e instanceof Error ? e.message : String(e)})` }) }
  }
  async function organize(result: ImportResult, preview: Preview) {
    const ctrl = new AbortController()
    abort.current = ctrl
    // 이번에 새로 넣은 것이 없으면(다시 가져오기) 전에 가져온 미완료 할 일 전체를 정리한다
    const ids = result.openTaskIds.length ? result.openTaskIds : await importedOpenTaskIds()
    setStep({ s: 'organizing', done: 0, total: ids.length, result, preview })
    try {
      const r = await organizeImported(ids, { signal: ctrl.signal, onProgress: (done, total) => setStep({ s: 'organizing', done, total, result, preview }) })
      setStep({ s: 'organized', count: r.count, total: r.total, result, preview, stopped: ctrl.signal.aborted })
    } catch (e) {
      if (ctrl.signal.aborted) setStep({ s: 'organized', count: 0, total: ids.length, result, preview, stopped: true })
      else setStep({ s: 'error', error: `AI 정리를 못 했어요 — 지금은 AI를 쓸 수 없어요. 가져온 할 일은 그대로 있고, 기본함 정리로 나중에 할 수 있어요. (${e instanceof Error ? e.message : String(e)})` })
    } finally { abort.current = undefined }
  }
  const cancel = () => {
    if (step.s === 'waiting' || step.s === 'fetching') { void tt?.cancel(); setStep({ s: 'connect' }) }
    else if (step.s === 'organizing') abort.current?.abort()
  }
  const close = () => { if (step.s === 'importing') return; if (busy) cancel(); onClose() }

  return (
    <Dialog label="틱틱에서 가져오기" className="tt-import" onClose={close}>
      <header className="tt-import__head">
        <h2>틱틱에서 가져오기</h2>
        <button className="icon-btn" aria-label="닫기" onClick={close} disabled={step.s === 'importing'}><X /></button>
      </header>
      <div className="tt-import__body" aria-live="polite">
        {step.s === 'loading' && <p className="tt-import__muted">확인하고 있어요…</p>}

        {step.s === 'connect' && <>
          <p>틱틱의 리스트·할 일·완료 기록·태그·노트를 sprout로 옮겨요. 틱틱 데이터는 바뀌지 않아요(읽기만 해요).</p>
          {step.error && <p className="form-error" role="alert">{step.error}</p>}
          <div className="tt-import__actions">
            <button className="entry-primary" data-autofocus disabled={!status?.oauthAvailable} onClick={() => void connect({ kind: 'oauth' })}>틱틱 계정으로 연결</button>
            {!status?.oauthAvailable && <p className="tt-import__caption">이 버전에는 틱틱 앱 정보가 없어요. 아래 API 토큰으로 연결해 주세요.</p>}
          </div>
          <button type="button" className="tt-import__link" aria-expanded={showToken} onClick={() => setShowToken((v) => !v)}>{showToken ? '▾' : '▸'} API 토큰으로 연결</button>
          {showToken && <form className="tt-import__token" onSubmit={(e) => { e.preventDefault(); if (token.trim()) void connect({ kind: 'token', token }) }}>
            <p className="tt-import__caption">틱틱 웹 › 설정 › 계정 › API Token에서 만든 토큰을 붙여 넣어요. 토큰은 이 기기의 키체인에만 암호화해 저장해요. 비밀번호는 묻지 않아요.</p>
            <div className="tt-import__row">
              <input type="password" autoComplete="off" spellCheck={false} aria-label="틱틱 API 토큰" placeholder="API 토큰" value={token} onChange={(e) => setToken(e.target.value)} />
              <button className="entry-primary" disabled={!token.trim()}>연결</button>
            </div>
          </form>}
        </>}

        {step.s === 'waiting' && <>
          <p>브라우저에서 틱틱에 로그인하고 <b>허용</b>을 눌러 주세요.</p>
          <p className="tt-import__caption">끝나면 자동으로 이어져요. (5분 안에)</p>
        </>}

        {step.s === 'fetching' && <Progress label={fetchLabel(step.progress)} value={step.progress?.step === 'data' ? step.progress.done / Math.max(1, step.progress.total) : undefined} />}

        {(step.s === 'preview') && <PreviewBody preview={step.preview} kind={status?.kind ?? null} />}

        {step.s === 'importing' && <Progress label={`가져오고 있어요 (${n(step.done)}/${n(step.total)}줄)`} value={step.done / Math.max(1, step.total)} />}

        {(step.s === 'done' || step.s === 'organizing' || step.s === 'organized') && <ResultBody result={step.result} preview={step.preview} />}
        {step.s === 'organizing' && <Progress label={`기본함 할 일에 리스트 제안을 붙이는 중 (${n(step.done)}/${n(step.total)})`} value={step.done / Math.max(1, step.total)} />}
        {step.s === 'organized' && <p className="tt-import__note">{step.stopped ? '멈췄어요. ' : ''}기본함 할 일 {n(step.count)}개에 리스트 제안을 붙였어요. 아무것도 옮기지 않았어요 — 기본함이나 작업 지도에서 확인하고 옮기세요.</p>}

        {step.s === 'error' && <p className="form-error" role="alert">{step.error}</p>}
      </div>
      <footer className="tt-import__foot">
        {step.s === 'preview' && <>
          <button type="button" className="tt-import__link" onClick={() => void disconnect()}>연결 끊기</button>
          <span className="tt-import__spacer" />
          <button type="button" onClick={close}>취소</button>
          <button className="entry-primary" data-autofocus disabled={!step.preview.plan.tasks.length && !step.preview.plan.notes.length && !step.preview.plan.lists.length} onClick={() => void runImport(step.preview)}>
            {step.preview.already ? '새 항목만 가져오기' : '가져오기'}
          </button>
        </>}
        {(step.s === 'waiting' || step.s === 'fetching' || step.s === 'organizing') && <><span className="tt-import__spacer" /><button type="button" onClick={cancel}>{step.s === 'organizing' ? '멈추기' : '취소'}</button></>}
        {(step.s === 'done' || step.s === 'organized') && <>
          {step.s === 'done' && <button type="button" className="entry-primary" data-autofocus disabled={!step.result.openTaskIds.length && !step.result.skipped} onClick={() => void organize(step.result, step.preview)}>기본함 할 일에 AI 리스트 제안 받기</button>}
          {step.s === 'organized' && onOpenMap && <button type="button" className="entry-primary" data-autofocus onClick={() => { onOpenMap(); onClose() }}>작업 지도 보기</button>}
          {onOpenCalendar && <button type="button" onClick={() => { onOpenCalendar(); onClose() }}>캘린더에서 보기</button>}
          <OverdueImportButton onOpen={onClose} />
          <span className="tt-import__spacer" />
          <button type="button" onClick={onClose}>닫기</button>
        </>}
        {step.s === 'error' && <><span className="tt-import__spacer" /><button type="button" onClick={onClose}>닫기</button><button className="entry-primary" onClick={() => void load()}>다시 시도</button></>}
      </footer>
    </Dialog>
  )
}

function Progress({ label, value }: { label: string; value?: number }) {
  return <div className="tt-import__progress">
    <p>{label}</p>
    <div className={`tt-import__bar${value === undefined ? ' is-indeterminate' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === undefined ? undefined : Math.round(value * 100)}>
      <span style={value === undefined ? undefined : { width: `${Math.round(value * 100)}%` }} />
    </div>
  </div>
}

function PreviewBody({ preview, kind }: { preview: Preview; kind: 'oauth' | 'token' | null }) {
  const c = preview.counts
  const items: [string, number][] = [['리스트', c.lists], ['할 일', c.tasks], ['그중 완료', c.completed], ['날짜 있는 것', c.dated], ['반복', c.repeating], ['노트 → 수집함', c.notes]]
  const empty = !c.lists && !c.tasks && !c.notes
  return <>
    <p className="tt-import__muted">{kind === 'token' ? 'API 토큰으로 연결됨' : '틱틱 계정과 연결됨'}</p>
    {empty ? <p>가져올 항목이 없어요.</p> : <dl className="tt-import__counts">
      {items.map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{n(v)}</dd></div>)}
      {c.already > 0 && <div className="is-already"><dt>이미 가져온 것</dt><dd>{n(c.already)}</dd></div>}
    </dl>}
    {c.already > 0 && <p className="tt-import__caption">이미 가져온 항목은 건너뛰어요. sprout에서 고친 내용은 덮어쓰지 않아요.</p>}
    {preview.plan.warnings.length > 0 && <ul className="tt-import__warn">{preview.plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    <p className="tt-import__caption">틱틱 받은함 → sprout 기본함, 폴더·태그·하위 태스크·체크 항목·알림은 그대로, 노트는 수집함으로 가요.</p>
  </>
}

function ResultBody({ result, preview }: { result: ImportResult; preview: Preview }) {
  const i = result.inserted
  const nothing = !i.tasks && !i.notes && !i.lists
  return <>
    <p className="tt-import__done">{nothing ? '새로 가져온 항목이 없어요 — 전부 이미 있어요.' : '가져왔어요.'}</p>
    <dl className="tt-import__counts">
      <div><dt>리스트</dt><dd>{n(i.lists)}</dd></div>
      <div><dt>할 일</dt><dd>{n(i.tasks)}</dd></div>
      <div><dt>노트 → 수집함</dt><dd>{n(i.notes)}</dd></div>
      {result.skipped > 0 && <div className="is-already"><dt>건너뜀(이미 있음)</dt><dd>{n(result.skipped)}</dd></div>}
    </dl>
    {result.notesPending > 0 && <p className="tt-import__caption">수집함 노트 {n(result.notesPending)}개는 AI가 차례로 메모·할 일·볼 것으로 나눠요.</p>}
    {result.datedNew > 0 && <p className="tt-import__caption">날짜 있는 할 일 {n(result.datedNew)}개가 캘린더에 보여요.</p>}
    {preview.plan.stats.open > 0 && <p className="tt-import__caption">AI 리스트 제안은 직접 눌러야 시작하고, 제안만 해요(승인해야 옮겨요).</p>}
  </>
}
