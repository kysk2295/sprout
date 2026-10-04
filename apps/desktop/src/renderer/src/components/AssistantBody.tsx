import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart3, CalendarDays, Check, Cpu, List, MoreHorizontal, Plus, RefreshCw, RotateCcw, Sparkles, Square, Trash2 } from 'lucide-react'
import { localModels, type AssistantProgress } from '../../../shared/assistant'
import { askAssistant, undoAssistant, type AssistantResult } from '../data/assistant'
import { useQuery } from '../data/useQuery'
import { dayKey, rowDateLabel } from '../lib/dates'
import { useTaskActions } from '../lib/taskActions'
import { Dialog } from './Dialog'
import { MenuItem, Popover, SubMenu } from './Popover'

type Message = { id: string; role: 'user' | 'assistant'; text: string; result?: AssistantResult }
export function useAssistant(account: string) {
  const key = `sprout.assistant.history.${account}`
  const [messages, setMessages] = useState<Message[]>(() => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } })
  const [models, setModels] = useState<string[]>([]), [model, setModel] = useState(localStorage.getItem('sprout.assistant.model') || '')
  const [busy, setBusy] = useState(false), [connecting, setConnecting] = useState(false), [error, setError] = useState('')
  const [progress, setProgress] = useState<AssistantProgress>({ phase: 'connecting' }), [started, setStarted] = useState(0), [lastRequest, setLastRequest] = useState('')
  const [cooldown, setCooldown] = useState(0) // 상한(429)·혼잡(503) 뒤 다시 시도를 잠시 막는다(13 §6)
  useEffect(() => { if (cooldown <= Date.now()) return; const t = setTimeout(() => setCooldown(0), cooldown - Date.now()); return () => clearTimeout(t) }, [cooldown])
  const request = useRef<AbortController | null>(null)
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(messages.slice(-100))) } catch { setError('대화 기록을 보관할 공간이 부족해요.') } }, [messages, key])
  useEffect(() => { localStorage.setItem('sprout.assistant.model', model) }, [model])
  const refresh = async () => {
    setConnecting(true); setError('')
    try {
      const found = await (window.sprout?.assistant?.models() ?? localModels())
      setModels(found)
      setModel((old) => (found.includes(old) ? old : found.find((m) => m === 'qwen3.5:9b') || found[0] || ''))
      if (!found.length) setError('지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.')
    } catch (e) { setModels([]); setModel(''); setError(humanize(e)) } finally { setConnecting(false) }
  }
  useEffect(() => { void refresh(); return () => request.current?.abort() }, [])
  // 13 §6: 쓸 수 없으면 1분 뒤 저절로 다시 확인
  useEffect(() => { if (connecting || busy || models.length) return; const t = setTimeout(() => void refresh(), 60000); return () => clearTimeout(t) }, [connecting, busy, models.length])
  const send = async (text: string) => {
    if (request.current || !text.trim() || !model) return false
    const abort = new AbortController(); request.current = abort; setBusy(true); setError(''); setLastRequest(text); setStarted(Date.now()); setProgress({ phase: 'connecting' }); const id = crypto.randomUUID()
    // 서버 대기열(최대 180초) + 생성(120초)을 기다린다 — 메인 프로세스 제한(320초)보다 조금 길게
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; abort.abort() }, 330000)
    // 다시 시도: 답을 못 받은 같은 말은 말풍선을 또 쌓지 않는다
    setMessages((old) => (old.at(-1)?.role === 'user' && old.at(-1)?.text === text ? old : [...old, { id: id + 'user', role: 'user', text }]))
    try { const result = await askAssistant(text, model, id, abort.signal, messages.slice(-8).map((m) => ({ role: m.role, content: m.text })), setProgress); setMessages((old) => [...old, { id, role: 'assistant', text: result.text, result }]); return true }
    catch (e) { setError(timedOut ? 'AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.' : abort.signal.aborted ? '요청을 멈췄어요. 내용을 확인한 뒤 다시 보내 주세요.' : humanize(e)); if (isLimit(e)) setCooldown(Date.now() + 30000); return false }
    finally { clearTimeout(timer); request.current = null; setBusy(false) }
  }
  const undo = async (message: Message) => {
    if (!message.result?.created) return
    try { await undoAssistant(message.result.created); setMessages((old) => old.map((m) => (m.id === message.id ? { ...m, text: '등록을 되돌렸어요.', result: undefined } : m))) } catch (e) { setError(e instanceof Error ? e.message : '되돌리지 못했어요.') }
  }
  return { cooldown: cooldown > Date.now(), progress, started, lastRequest, messages, models, model, setModel, busy, connecting, error, refresh, send, undo, cancel: () => request.current?.abort(), clear: () => { if (!request.current) { setMessages([]); setError('') } } }
}
export type AssistantController = ReturnType<typeof useAssistant>

/** 13 §6: 원문 오류(영문·JSON·네트워크)는 사람 말로 바꾼다. 앱·서버가 만든 한국어 문구는 그대로 */
const OFFLINE = '지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.'
// IPC를 거친 오류는 "Error invoking remote method 'assistant:chat': Error: …"로 감싸여 온다
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e ?? '')).replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^(\w*Error):\s*/, '')
export function humanize(e: unknown) {
  const raw = messageOf(e)
  if (/^지금은 AI를 쓸 수 없어요/.test(raw)) return OFFLINE
  if (/[가-힣]/.test(raw) && !/[{}<>]|Error|https?:/.test(raw)) return raw
  if (/429|rate.?limit|too many/i.test(raw)) return '잠시 뒤 다시 시도해 주세요.'
  if (/fetch|network|ENOTFOUND|ECONN|EAI_AGAIN|socket/i.test(raw)) return 'sprout AI에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'
  if (/ssh|timeout|Ollama|503|502|504/i.test(raw)) return OFFLINE
  return '요청을 처리하지 못했어요. 다시 시도해 주세요.'
}
const isLimit = (e: unknown) => /너무 잦아요|한도|처리 중인 AI 요청|쓰는 사람이 많아요|429/.test(messageOf(e))

/** 머리 상태 알약: 연결됨 · 연결 중 · 쓸 수 없음 (대기열은 서버 프록시 뒤) — 13 §2.1 */
export function AssistantStatus({ assistant: a, short }: { assistant: AssistantController; short?: boolean }) {
  const waiting = a.busy && (a.progress.queue ?? 0) > 0
  const state = a.connecting || waiting ? 'wait' : a.models.length ? 'ok' : 'off'
  const label = a.connecting ? '연결 중…' : waiting ? `대기 중 · 앞에 ${a.progress.queue}명` : a.models.length ? (short ? '연결됨' : 'sprout AI · 연결됨') : '지금은 쓸 수 없어요'
  return <button className={`assistant-status is-${state}`} title="다시 연결" disabled={a.connecting || a.busy} onClick={() => void a.refresh()}><i /><span>{label}</span></button>
}

/** 전용 화면 머리 오른쪽: 상태 · 새 대화 · ⋯(모델 · 다시 연결 · 기록 지우기) */
export function AssistantHeaderActions({ assistant: a }: { assistant: AssistantController }) {
  const [menu, setMenu] = useState(false), [confirm, setConfirm] = useState(false)
  const more = useRef<HTMLButtonElement>(null)
  return (
    <div className="pane-header__actions">
      <AssistantStatus assistant={a} />
      <button className="icon-btn" aria-label="새 대화" title="새 대화 (⌘N)" disabled={a.busy || !a.messages.length} onClick={a.clear}><Plus /></button>
      <button ref={more} className="icon-btn" aria-label="AI 비서 메뉴" onClick={() => setMenu(!menu)}><MoreHorizontal /></button>
      {menu && (
        <Popover anchor={more.current} align="end" width={210} onClose={() => setMenu(false)} className="menu">
          <MenuItem icon={<Plus />} label="새 대화" trail={<span className="menu__key">⌘N</span>} disabled={a.busy || !a.messages.length} onClick={() => { setMenu(false); a.clear() }} />
          <SubMenu icon={<Cpu />} label="모델" trail={a.model || '없음'} disabled={a.busy || !a.models.length} width={200}>
            {a.models.map((m) => <MenuItem key={m} label={m} active={m === a.model} trail={m === a.model ? <Check className="menu__check" /> : undefined} onClick={() => { a.setModel(m); setMenu(false) }} />)}
          </SubMenu>
          <MenuItem icon={<RefreshCw />} label="다시 연결" disabled={a.connecting || a.busy} onClick={() => { setMenu(false); void a.refresh() }} />
          <div className="menu__divider" />
          <MenuItem icon={<Trash2 />} label="이 기기 대화 기록 지우기" danger disabled={a.busy || !a.messages.length} onClick={() => { setMenu(false); setConfirm(true) }} />
        </Popover>
      )}
      {confirm && (
        <Dialog label="대화 기록 지우기" className="assistant-confirm" onClose={() => setConfirm(false)}>
          <h2>대화 기록을 지울까요?</h2>
          <p>이 기기에 보관된 AI 비서 대화만 지워요. 등록한 할 일은 그대로 남아요.</p>
          <div className="assistant-confirm__actions"><button onClick={() => setConfirm(false)}>취소</button><button className="is-danger" data-autofocus onClick={() => { a.clear(); setConfirm(false) }}>지우기</button></div>
        </Dialog>
      )}
    </div>
  )
}

const SUGGESTIONS: [typeof CalendarDays, string][] = [[CalendarDays, '내일 오후 3시에 기획 회의 한 시간 잡아줘'], [List, '이번 주 남은 할 일 보여줘'], [BarChart3, '이번 주에 완료한 거 몇 개야?']]
const STEPS: { key: AssistantProgress['phase'][]; label: string }[] = [{ key: ['connecting'], label: '연결' }, { key: ['generating'], label: '해석' }, { key: ['validating', 'saving', 'querying'], label: '확인' }]

export function AssistantBody({ draft, onDraft, assistant: a, onOpen, variant = 'full' }: { draft: string; onDraft: (s: string) => void; assistant: AssistantController; onOpen: (id: string) => void; variant?: 'full' | 'quick' }) {
  const scroll = useRef<HTMLDivElement>(null), follow = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  const [showLatest, setShowLatest] = useState(false), [elapsed, setElapsed] = useState(0)
  useEffect(() => { if (!a.busy) return; const tick = () => setElapsed(Math.floor((Date.now() - a.started) / 1000)); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer) }, [a.busy, a.started])
  useEffect(() => { const box = scroll.current; if (box && follow.current) box.scrollTop = box.scrollHeight }, [a.messages, a.busy, a.progress, a.error])
  useEffect(() => { const el = input.current; if (!el) return; el.style.height = '20px'; if (draft) el.style.height = `${Math.min(el.scrollHeight, 6 * 20)}px` }, [draft])
  // 13 §4: 전용 화면에서 ⌘N/Ctrl+N = 새 대화(새 대화 버튼과 같음). 캡처 단계에서 받아 앱 전체 ⌘N(할 일 빠른 추가)보다 먼저 막는다.
  // 빠른 창(FAB)은 다른 화면 위에 뜨므로 ⌘N은 그대로 할 일 빠른 추가. 한글 조합 중·대화상자/팝오버가 열려 있으면 건드리지 않는다.
  const clearRef = useRef(a.clear)
  clearRef.current = () => { if (a.busy || !a.messages.length) return; a.clear(); latest(); input.current?.focus() }
  useEffect(() => {
    if (variant !== 'full') return
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || (e.key.toLowerCase() !== 'n' && e.code !== 'KeyN')) return  // 한글 자판(ㅜ)도 KeyN으로 받는다
      if (document.querySelector('[role=dialog], .popover')) return
      e.preventDefault(); e.stopPropagation()
      clearRef.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [variant])
  const latest = () => { follow.current = true; setShowLatest(false); const box = scroll.current; if (box) box.scrollTop = box.scrollHeight }
  const submit = async (text = draft) => { if (a.busy || !a.model || !text.trim()) return; if (text === draft) onDraft(''); latest(); await a.send(text) }
  const phaseIndex = STEPS.findIndex((s) => s.key.includes(a.progress.phase))
  return (
    <div className={`assistant-body assistant-v2 is-${variant}`}>
      <div className="assistant-scroll-wrap">
        <div ref={scroll} className="assistant-messages" role="log" aria-label="AI 대화 기록" aria-live="polite" onScroll={() => { const el = scroll.current; if (el) { follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; setShowLatest(!follow.current) } }}>
          <div className="assistant-col">
            {!a.messages.length && (
              <div className="assistant-ai">
                <span className="assistant-avatar"><Sparkles /></span>
                <div className="assistant-ai__body">
                  <p className="assistant-muted">할 일을 말로 등록하거나, 내 일정과 완료 기록을 물어보세요.</p>
                  <div className="assistant-suggest">
                    {SUGGESTIONS.map(([Icon, text]) => <button key={text} disabled={a.busy || !a.model} onClick={() => void submit(text)}><Icon />{text}</button>)}
                  </div>
                </div>
              </div>
            )}
            {a.messages.map((m) => m.role === 'user'
              ? <p key={m.id} className="assistant-me">{m.text}</p>
              : (
                <div key={m.id} className="assistant-ai">
                  <span className="assistant-avatar"><Sparkles /></span>
                  <div className="assistant-ai__body">
                    <p className="assistant-text">{m.result?.stats ? `완료한 항목은 ${m.result.stats.count}개, 일정 길이 합계는 ${m.result.stats.hours}시간이에요.` : m.text}</p>
                    {m.result && <ResultCard result={m.result} onOpen={onOpen} />}
                    {m.result?.created && <button className="assistant-undo" onClick={() => void a.undo(m)}><RotateCcw />되돌리기</button>}
                  </div>
                </div>
              ))}
            {a.busy && (
              <div className="assistant-ai">
                <span className="assistant-avatar"><Sparkles /></span>
                <div className="assistant-ai__body">
                  {a.progress.preview ? <p className="assistant-text">{a.progress.preview}<span className="assistant-caret" /></p> : <p className="assistant-muted">{(a.progress.queue ?? 0) > 0 ? `순서를 기다리는 중… (앞에 ${a.progress.queue}명)` : a.progress.phase === 'connecting' ? 'sprout AI에 연결하는 중…' : '생각하는 중…'}</p>}
                  <div className="assistant-steps" role="status">
                    {STEPS.map((s, i) => <span key={s.label} className={i <= phaseIndex ? 'is-on' : ''}>{i > 0 && <em>›</em>}● {s.label}</span>)}
                    <span>· {elapsed}초</span>
                  </div>
                </div>
              </div>
            )}
            {a.error && !a.busy && (
              <div className="assistant-error" role="alert">
                <p>{a.error}</p>
                <div>
                  {a.lastRequest && <button disabled={a.busy || a.cooldown || !a.model} title={a.cooldown ? '잠시 뒤 다시 시도할 수 있어요' : undefined} onClick={() => void submit(a.lastRequest)}><RefreshCw />다시 시도</button>}
                  {a.lastRequest && <button onClick={() => { onDraft(a.lastRequest); input.current?.focus() }}>입력으로 가져오기</button>}
                  {!a.models.length && <button disabled={a.connecting} onClick={() => void a.refresh()}>다시 연결</button>}
                </div>
              </div>
            )}
          </div>
        </div>
        {showLatest && <button className="assistant-latest" onClick={latest}><ArrowDown />최신으로</button>}
      </div>
      <div className="assistant-composer">
        <textarea
          ref={input}
          rows={1}
          aria-label="AI에게 보낼 내용"
          placeholder={a.busy ? '다음에 물어볼 내용을 적어 두세요' : '무엇이든 물어보세요'}
          value={draft}
          maxLength={4000}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!a.busy) void submit() } }}
        />
        <div className="assistant-composer__bar">
          <span>{a.busy ? '답을 받는 중에는 보내지 않아요' : variant === 'quick' ? 'Enter 보내기' : 'Enter 보내기 · Shift+Enter 줄바꿈'}</span>
          {a.busy
            ? <button className="assistant-send" aria-label="멈추기" title="멈추기" onClick={a.cancel}><Square fill="currentColor" /></button>
            : <button className="assistant-send" aria-label="보내기" title="보내기" disabled={!a.model || !draft.trim() || a.connecting} onClick={() => void submit()}><ArrowUp /></button>}
        </div>
      </div>
      {variant === 'full' && <p className="assistant-footnote">sprout AI는 운영자의 Mac mini에서 돌아가요 · 등록 결과는 카드에서 확인하고 되돌릴 수 있어요</p>}
    </div>
  )
}

/** 결과 카드: 머리줄 + 틱틱 행(체크박스 · 제목 · 날짜). 집계는 큰 숫자 + 근거 행 — 13 §3 */
function ResultCard({ result: r, onOpen }: { result: AssistantResult; onOpen: (id: string) => void }) {
  const tasks = r.tasks ?? []
  const [more, setMore] = useState(false)
  const { complete } = useTaskActions()
  const ids = tasks.map((t) => t.id)
  const live = useQuery<{ id: string; status: number; deleted_at: string | null; title: string; start_at: string | null; due_at: string | null }>(
    ids.length ? `SELECT id, status, deleted_at, title, start_at, due_at FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})` : 'SELECT NULL AS id WHERE 0', ids
  )
  if (!tasks.length && !r.stats) return null
  const byId = new Map((live ?? []).map((t) => [t.id, t]))
  const limit = r.created ? tasks.length : 5
  const shown = more ? tasks : tasks.slice(0, limit)
  const today = dayKey()
  const head = r.created ? (tasks.some((t) => t.due_at?.includes('T')) ? '등록한 일정' : '등록한 할 일') : r.stats ? `완료 기록${r.stats.range ? ` · ${r.stats.range}` : ''}` : '찾은 항목'
  return (
    <div className="assistant-card">
      <div className="assistant-card__head">
        {r.created ? <Check /> : r.stats ? <BarChart3 /> : <List />}
        <span>{head}</span>
        <em>{r.stats ? '완료 시각 기준' : r.total ?? tasks.length}</em>
      </div>
      {r.stats && (
        <div className="assistant-card__stats">
          <div><strong>{r.stats.hours}시간</strong><span>일정 길이 합계 · 겹친 시간 포함, 실제 측정 아님</span></div>
          <div><strong>{r.stats.untimed}개</strong><span>시간 없는 완료 항목</span></div>
        </div>
      )}
      {shown.map((t) => {
        const cur = byId.get(t.id)
        const gone = live && (!cur || !!cur.deleted_at)
        const done = cur?.status === 1
        const span = { start_at: cur?.start_at ?? t.start_at, due_at: cur?.due_at ?? t.due_at }
        const date = rowDateLabel(span, today)
        return (
          <div key={t.id} className={`assistant-row${done ? ' is-done' : ''}${gone ? ' is-gone' : ''}`} onClick={() => !gone && onOpen(t.id)}>
            <button className={`checkbox${done ? ' is-checked' : ''}`} aria-label={done ? '완료됨' : '완료'} disabled={!!gone || done} onClick={(e) => { e.stopPropagation(); void complete([t.id]) }}>{done && <Check />}</button>
            <span className="assistant-row__title">{cur?.title ?? t.title}</span>
            {gone ? <span className="assistant-row__meta">삭제됨</span> : date && <span className={`assistant-row__meta is-${date.tone}`}>{date.label}</span>}
            {!gone && <ArrowUpRight className="assistant-row__go" />}
          </div>
        )
      })}
      {!more && tasks.length > limit && <button className="assistant-card__more" onClick={() => setMore(true)}>더 보기 {tasks.length - limit}</button>}
    </div>
  )
}
