import { SoftIcon } from './SoftIcon'
import type { SoftIconName } from '@sprout/tokens/softIcons'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart3, CalendarDays, Check, Cpu, History, List, MoreHorizontal, Plus, RefreshCw, RotateCcw, Square, Trash2 } from 'lucide-react'
import { answerFace, answerKindOf, COMPANION_SIZE, EGG_TAP_LINE, errorFace, pickLine, quickReplies, TAP_LINES, tapSpeaks } from '@sprout/schema/companion'
import { canGrantTaskXp } from '@sprout/schema/growth'
import { daysBetween, dayWord, ymdOf, type RecallHit, type RecallResult } from '@sprout/schema/recall'
import { useGrowth } from '../data/growth'
import { CompanionFace, CompanionSay, CompanionXp, StillFace, useCompanion } from './companion/CompanionFace'
import { localModels, type AssistantProgress } from '../../../shared/assistant'
import { agentFeatures, agentWrites, askAgent, askAssistant, assistantDiaryOn, undoAssistant, type AgentFeatures, type AssistantResult } from '../data/assistant'
import { AgentUnsupportedError, pendingCard, saveCard, undoCard, type TurnEvent } from '@sprout/schema/assistantAgent'
import { savedLine, type Card, type Chip, type ConfirmCard } from '@sprout/schema/assistantExec'
import { emptyMemory, type AgentMemory } from '@sprout/schema/assistantRouter'
import { BackSceneBand } from './ListSceneBand'
import { createTextStream } from '@sprout/schema/diaryTalk'
import { useMotionReduced } from '../data/growth'
import { StreamText } from './diary/Stream'
import { AgentCard, Bands, ConfirmView, editSentence, ToolChips, type AgentView } from './AssistantAgent'
import { useQuery } from '../data/useQuery'
import { dayKey, rowDateLabel } from '../lib/dates'
import { useTaskActions } from '../lib/taskActions'
import { Dialog } from './Dialog'
import { MenuItem, Popover, SubMenu } from './Popover'

/** request = 그 답을 받은 말(빠른 답 칩이면 합친 말), undone = 등록을 되돌림(40 §3.2 — 카드는 남기고 행이 삭제됨), agent = 47 B안 답(칩·카드·띠) */
type Message = { id: string; role: 'user' | 'assistant'; text: string; result?: AssistantResult; request?: string; undone?: boolean; agent?: AgentView }
/** 받는 중(47): 칩·카드는 턴 안에서 바로 보이고, 글은 저장소(createTextStream)로만 흘려 받는 말풍선만 다시 그린다 */
type LiveTurn = { chips: Chip[]; running: number[]; cards: Card[] }
/** 모델에게 보낼 최근 대화: 내 말 + 캐릭터 답 쌍(47 §10 — 6턴, 600자는 공용이 자른다) */
function pairsOf(messages: Message[]) {
  const out: { user: string; assistant: string }[] = []
  messages.forEach((m, i) => { const prev = messages[i - 1]; if (m.role === 'assistant' && prev?.role === 'user' && (m.agent?.line ?? m.text)) out.push({ user: prev.text, assistant: m.agent?.line ?? m.text }) })
  return out.slice(-6)
}
export function useAssistant(account: string) {
  const key = `sprout.assistant.history.${account}`
  const memKey = `sprout.assistant.memory.${account}`
  const [messages, setMessages] = useState<Message[]>(() => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } })
  const latestMessages = useRef(messages)
  latestMessages.current = messages
  const [memory, setMemory] = useState<AgentMemory>(() => { try { return JSON.parse(localStorage.getItem(memKey) || 'null') ?? emptyMemory() } catch { return emptyMemory() } })
  const [features, setFeatures] = useState<AgentFeatures>({ agent: false, daily: null })
  const [live, setLive] = useState<LiveTurn | null>(null)
  const stream = useRef(createTextStream()).current
  const me = useCompanion()
  const actions = useTaskActions()
  const writes = useMemo(() => agentWrites({ complete: (ids) => actions.complete(ids), uncomplete: (ids) => actions.reopen(ids) }), [actions])
  const [models, setModels] = useState<string[]>([]), [model, setModel] = useState(localStorage.getItem('sprout.assistant.model') || '')
  const [busy, setBusy] = useState(false), [connecting, setConnecting] = useState(false), [error, setError] = useState('')
  const [progress, setProgress] = useState<AssistantProgress>({ phase: 'connecting' }), [started, setStarted] = useState(0), [lastRequest, setLastRequest] = useState('')
  const [cooldown, setCooldown] = useState(0) // 상한(429)·혼잡(503) 뒤 다시 시도를 잠시 막는다(13 §6)
  useEffect(() => { if (cooldown <= Date.now()) return; const t = setTimeout(() => setCooldown(0), cooldown - Date.now()); return () => clearTimeout(t) }, [cooldown])
  const request = useRef<AbortController | null>(null)
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(messages.slice(-100))) } catch { setError('대화 기록을 보관할 공간이 부족해요.') } }, [messages, key])
  useEffect(() => { try { localStorage.setItem(memKey, JSON.stringify(memory)) } catch { /* 이번 실행만 */ } }, [memory, memKey])
  useEffect(() => { localStorage.setItem('sprout.assistant.model', model) }, [model])
  const refresh = async () => {
    setConnecting(true); setError('')
    try {
      const found = await (window.sprout?.assistant?.models() ?? localModels())
      setModels(found)
      setModel((old) => (found.includes(old) ? old : found.find((m) => m === 'qwen3.5:9b') || found[0] || ''))
      if (!found.length) setError('지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.')
      void agentFeatures().then(setFeatures)
    } catch (e) { setModels([]); setModel(''); setError(humanize(e)) } finally { setConnecting(false) }
  }
  useEffect(() => { void refresh(); return () => request.current?.abort() }, [])
  // 13 §6: 쓸 수 없으면 1분 뒤 저절로 다시 확인
  useEffect(() => { if (connecting || busy || models.length) return; const t = setTimeout(() => void refresh(), 60000); return () => clearTimeout(t) }, [connecting, busy, models.length])
  /** 확인 카드 바꾸기(그 답 안에서) + 캐릭터 한 줄 */
  const putCard = (msgId: string, card: ConfirmCard, line?: string) => setMessages((old) => old.map((m) => (m.id === msgId && m.agent ? { ...m, agent: { ...m.agent, cards: m.agent.cards.map((c) => (c.type === 'confirm' && c.key === card.key ? card : c)), ...(line !== undefined ? { line } : {}) } } : m)))
  const cardOf = (key: string) => { for (const m of latestMessages.current) for (const c of m.agent?.cards ?? []) if (c.type === 'confirm' && c.key === key) return { msgId: m.id, card: c }; return null }
  /** 넣기·완료·옮기기·지우기(§5.3) */
  const saveConfirm = async (msgId: string, card: ConfirmCard, picked?: string[]) => {
    try { const saved = await saveCard(card, writes, picked); putCard(msgId, saved, savedLine(saved, new Date())); return saved }
    catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요.'); return null }
  }
  const cancelConfirm = (msgId: string, card: ConfirmCard) => putCard(msgId, { ...card, state: 'cancelled' }, card.op === 'create' ? '알겠어, 안 넣을게.' : '알겠어, 그대로 둘게.')
  const undoConfirm = async (msgId: string, card: ConfirmCard) => {
    try { putCard(msgId, await undoCard(card, writes), '알겠어, 되돌렸어.') } catch (e) { setError(e instanceof Error ? e.message : '되돌리지 못했어요.') }
  }
  /** 47 B안 한 턴 */
  const sendAgent = async (prompt: string, signal: AbortSignal) => {
    stream.reset()
    setLive({ chips: [], running: [], cards: [] })
    const onEvent = (e: TurnEvent) => {
      if (e.type === 'chip') setLive((l) => l && { ...l, chips: Object.assign([...l.chips], { [e.index]: e.chip }), running: e.state === 'running' ? [...l.running, e.index] : l.running.filter((x) => x !== e.index) })
      else if (e.type === 'card') setLive((l) => l && { ...l, cards: [...l.cards, e.card] })
      else if (e.type === 'delta') { stream.set(stream.get().text + e.text); setProgress((p) => (p.phase === 'generating' ? p : { phase: 'generating' })) }
      else if (e.type === 'reset') stream.reset()
      else if (e.type === 'queue') setProgress({ phase: 'connecting', queue: e.position })
      else if (e.type === 'phase') setProgress({ phase: e.phase === 'tools' ? 'querying' : 'connecting' })
    }
    const msgs = latestMessages.current
    const r = await askAgent({ text: prompt, model, history: pairsOf(msgs), memory, pending: pendingCard(msgs.map((m) => m.agent?.cards ?? [])), diary: assistantDiaryOn(account), name: me.name, signal, onEvent })
    await stream.whenShown(600)
    setMemory(r.memory)
    let line: string | undefined
    if (r.confirm) {
      const found = cardOf(r.confirm.key)
      if (found && r.confirm.action === 'save') { const saved = await saveConfirm(found.msgId, found.card); line = saved ? savedLine(saved, new Date()) : undefined }
      else if (found) cancelConfirm(found.msgId, found.card)
    }
    const view: AgentView = { chips: r.chips, cards: r.cards, bands: r.bands, route: r.route, calls: r.calls, ms: r.ms, ...(r.hint ? { hint: r.hint } : {}), ...(r.action ? { action: r.action } : {}), ...(r.error ? { error: r.error } : {}), ...(r.busyFallback ? { busyFallback: true } : {}), ...(line ? { line } : {}) }
    setMessages((old) => [...old, { id: crypto.randomUUID(), role: 'assistant', text: r.text || (line ?? ''), request: prompt, agent: view }])
    void agentFeatures().then(setFeatures)
  }
  /** prompt: 빠른 답 칩(40 §3.3) — 말풍선은 칩 글(text), 모델에는 앞 요청과 합친 말(prompt) */
  const send = async (text: string, prompt = text) => {
    if (request.current || !text.trim() || !model) return false
    const abort = new AbortController(); request.current = abort; setBusy(true); setError(''); setLastRequest(prompt); setStarted(Date.now()); setProgress({ phase: 'connecting' }); const id = crypto.randomUUID()
    // 서버 대기열(최대 180초) + 생성(120초)을 기다린다 — 메인 프로세스 제한(320초)보다 조금 길게
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; abort.abort() }, 330000)
    // 다시 시도: 답을 못 받은 같은 말은 말풍선을 또 쌓지 않는다
    setMessages((old) => (old.at(-1)?.role === 'user' && old.at(-1)?.text === text ? old : [...old, { id: id + 'user', role: 'user', text }]))
    try {
      if (features.agent) {
        try { await sendAgent(prompt, abort.signal); return true }
        catch (e) { if (!(e instanceof AgentUnsupportedError)) throw e; setFeatures((f) => ({ ...f, agent: false })); setLive(null) } // 배포 전 서버 → 13 의도 경로
      }
      const result = await askAssistant(prompt, model, id, abort.signal, latestMessages.current.slice(-8).map((m) => ({ role: m.role, content: m.text })), setProgress); setMessages((old) => [...old, { id, role: 'assistant', text: result.text, result, request: prompt }]); return true
    }
    catch (e) { setError(timedOut ? 'AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.' : abort.signal.aborted ? '요청을 멈췄어요. 내용을 확인한 뒤 다시 보내 주세요.' : humanize(e)); if (isLimit(e)) setCooldown(Date.now() + 30000); return false }
    finally { clearTimeout(timer); request.current = null; setBusy(false); setLive(null) }
  }
  const undo = async (message: Message) => {
    if (!message.result?.created) return
    try { await undoAssistant(message.result.created); setMessages((old) => old.map((m) => (m.id === message.id ? { ...m, undone: true } : m))) } catch (e) { setError(e instanceof Error ? e.message : '되돌리지 못했어요.') }
  }
  const left = features.daily ? Math.max(0, features.daily.limit - features.daily.used) : null
  return {
    cooldown: cooldown > Date.now(), progress, started, lastRequest, messages, models, model, setModel, busy, connecting, error, refresh, send, undo, agent: features.agent, left, live, stream,
    saveConfirm, cancelConfirm, undoConfirm, setError,
    cancel: () => request.current?.abort(),
    // 새 대화면 이어 받을 것도 비운다(47 §10) — 저장 안 된 확인 카드도 같이 사라진다
    clear: () => { if (!request.current) { setMessages([]); setMemory(emptyMemory()); setError('') } }
  }
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
  if (/fetch|network|ENOTFOUND|ECONN|EAI_AGAIN|socket/i.test(raw)) return '꿈틀 AI에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'
  if (/ssh|timeout|Ollama|503|502|504/i.test(raw)) return OFFLINE
  return '요청을 처리하지 못했어요. 다시 시도해 주세요.'
}
const isLimit = (e: unknown) => /너무 잦아요|한도|처리 중인 AI 요청|쓰는 사람이 많아요|429/.test(messageOf(e))

/** 머리 상태 알약: 연결됨 · 연결 중 · 쓸 수 없음 (대기열은 서버 프록시 뒤) — 13 §2.1 */
export function AssistantStatus({ assistant: a, short }: { assistant: AssistantController; short?: boolean }) {
  const waiting = a.busy && (a.progress.queue ?? 0) > 0
  const state = a.connecting || waiting ? 'wait' : a.models.length ? 'ok' : 'off'
  const label = a.connecting ? '연결 중…' : waiting ? `대기 중 · 앞에 ${a.progress.queue}명` : a.models.length ? (short ? '연결됨' : '꿈틀 AI · 연결됨') : '지금은 쓸 수 없어요'
  return <button className={`assistant-status is-${state}`} title="다시 연결" disabled={a.connecting || a.busy} onClick={() => void a.refresh()}><i /><span>{label}</span></button>
}

/** 전용 화면 머리 오른쪽: 상태 · 새 대화 · ⋯(모델 · 다시 연결 · 기록 지우기) */
/** help = 37 머리 `?`(⋯ 왼쪽) */
export function AssistantHeaderActions({ assistant: a, help }: { assistant: AssistantController; help?: ReactNode }) {
  const [menu, setMenu] = useState(false), [confirm, setConfirm] = useState(false)
  const more = useRef<HTMLButtonElement>(null)
  return (
    <div className="pane-header__actions">
      <AssistantStatus assistant={a} />
      <button className="icon-btn" aria-label="새 대화" title="새 대화 (⌘N)" disabled={a.busy || !a.messages.length} onClick={a.clear}><Plus /></button>
      {help}
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

const SUGGESTIONS = ['내일 오후 3시에 기획 회의 한 시간 잡아줘', '이번 주 남은 할 일 보여줘', '이번 주에 완료한 거 몇 개야?']
/** 47 §5.4 B안 빈 대화 예시(바로 보냄) */
const AGENT_SUGGESTIONS = ['미용실 간 지 얼마나 지났지', '이번 주 뭐가 제일 급해?', '내일 3시에 교수님 면담 잡아줘']
const AGENT_ICONS: SoftIconName[] = ['done', 'week', 'calendar']
/** 44 §6.7 빈 대화 제안 = 말랑 아이콘 카드(제안 문장은 그대로) */
const SUGGESTION_ICONS: SoftIconName[] = ['calendar', 'week', 'done']
const STEPS: { key: AssistantProgress['phase'][]; label: string }[] = [{ key: ['connecting'], label: '연결' }, { key: ['generating'], label: '해석' }, { key: ['validating', 'saving', 'querying'], label: '확인' }]
/** 최근 쓴 리스트(빠른 답 칩 — 리스트가 빠졌을 때) */
const RECENT_LISTS_SQL = "SELECT l.name AS name FROM tasks t JOIN lists l ON l.id = t.list_id WHERE l.archived_at IS NULL AND COALESCE(l.kind, '') <> 'inbox' AND t.deleted_at IS NULL GROUP BY l.id ORDER BY MAX(t.modified_at) DESC LIMIT 3"

export function AssistantBody({ draft, onDraft, assistant: a, onOpen, variant = 'full' }: { draft: string; onDraft: (s: string) => void; assistant: AssistantController; onOpen: (id: string) => void; variant?: 'full' | 'quick' }) {
  const scroll = useRef<HTMLDivElement>(null), follow = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  const [showLatest, setShowLatest] = useState(false), [elapsed, setElapsed] = useState(0)
  // 40 §3: 답 옆 얼굴 = 내 캐릭터. 움직이는 캐릭터는 마지막 답 하나뿐, 지난 답은 그 얼굴로 멈춤
  const me = useCompanion()
  const { events } = useGrowth()
  const recentLists = useQuery<{ name: string }>(RECENT_LISTS_SQL)
  const reduced = useMotionReduced()
  const { complete } = useTaskActions()
  /** 결과 카드: 행 = 열기, 체크 = 완료 + XP(13 §4·21) + 캐릭터 깡충 */
  const cardH = (msgId: string) => ({ onOpen, species: me.species, stage: me.stage, onComplete: (id: string) => { setBump((b) => ({ id: msgId, move: 'hop', n: (b?.n ?? 0) + 1, xp: canXp })); void complete([id]) } })
  const seenIds = useRef<Set<string> | null>(null)
  if (!seenIds.current) seenIds.current = new Set(a.messages.map((m) => m.id)) // 열 때 이미 있던 답은 다시 깡충하지 않는다
  const [bump, setBump] = useState<{ id: string; move: 'hop' | 'tilt'; n: number; xp?: boolean } | null>(null)
  const [say, setSay] = useState<{ text: string; n: number } | null>(null)
  const lastLine = useRef(-1), taps = useRef<number[]>([])
  useEffect(() => { if (!say) return; const t = setTimeout(() => setSay(null), 2700); return () => clearTimeout(t) }, [say])
  useEffect(() => { if (!bump?.xp) return; const t = setTimeout(() => setBump((b) => (b?.n === bump.n ? { ...b, xp: false } : b)), 950); return () => clearTimeout(t) }, [bump])
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
  const submit = async (text = draft, prompt?: string) => { if (a.busy || !a.model || !text.trim()) return; if (text === draft) onDraft(''); latest(); await a.send(text, prompt ?? text) }
  const phaseIndex = STEPS.findIndex((s) => s.key.includes(a.progress.phase))
  const size = COMPANION_SIZE.chat
  // 빈 대화 캐릭터 누르기(40 §3.4): 깡충 + 말풍선(바로 전 문장 빼고), 10초에 다섯 번 넘게 누르면 깡충만
  const tapEmpty = () => {
    setBump((b) => ({ id: 'empty', move: 'hop', n: (b?.n ?? 0) + 1 }))
    if (!tapSpeaks(taps.current, Date.now())) return
    const pool = me.egg ? [EGG_TAP_LINE] : TAP_LINES
    const i = pickLine(pool, lastLine.current)
    lastLine.current = i
    setSay({ text: pool[i], n: Date.now() })
  }
  const today = dayKey()
  const canXp = canGrantTaskXp(events.filter((e) => e.day === today))
  // 마지막에 움직이는 자리: 받는 중 · 오류 줄이 있으면 그 줄, 아니면 마지막 답
  const tail = a.busy || (a.error && !a.busy)
  const lastAi = tail ? -1 : a.messages.map((m) => m.role).lastIndexOf('assistant')
  const lastMsg = a.messages.at(-1)
  const nameLine = variant === 'full' && <span className="assistant-name">{me.name}</span>
  const chips = !tail && lastMsg?.role === 'assistant' && !lastMsg.agent && answerKindOf(lastMsg.result) === 'reply' && !draft.trim()
    ? quickReplies({ request: lastMsg.request ?? a.messages.at(-2)?.text ?? '', question: lastMsg.text, lists: (recentLists ?? []).map((l) => l.name) })
    : []
  return (
    <div className={`assistant-body assistant-v2 is-${variant}`}>
      <div className="assistant-scroll-wrap">
        <div ref={scroll} className="assistant-messages" role="log" aria-label="AI 대화 기록" aria-live="polite" onScroll={() => { const el = scroll.current; if (el) { follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; setShowLatest(!follow.current) } }}>
          <div className="assistant-col">
            {!a.messages.length && (
              <div className={`assistant-empty${variant !== 'quick' && me.species ? ' has-band' : ''}`}>
                {/* 49 §6.1: 고른 배경 장면이 캐릭터 뒤에(전체 보기만 — 빠른 창은 좁아 그대로) */}
                {variant !== 'quick' && me.species ? <BackSceneBand height={300} /> : null}
                <CompanionFace species={me.species} stage={me.stage} size={variant === 'quick' ? COMPANION_SIZE.sheet : COMPANION_SIZE.l} mood="smile" loop={me.egg ? 'wiggle' : 'breathe'} play={bump?.id === 'empty' ? bump : null} onPress={tapEmpty} label={me.label}>
                  {say && <CompanionSay key={say.n} text={say.text} />}
                </CompanionFace>
                <strong className="assistant-empty__name">{me.name}</strong>
                <span className="assistant-empty__lv">{me.levelLine}</span>
                {a.agent ? <><p className="assistant-empty__one">뭐든 물어봐. 내 할 일도, 그냥 수다도.</p><p className="aa-empty__fact">할 일·일정은 찾아보고 답해요 · 인터넷은 못 봐요</p></> : <p className="assistant-empty__one">할 일을 말로 등록하거나, 내 일정과 완료 기록을 물어보세요.</p>}
                <div className="assistant-sugs">
                  {(a.agent ? AGENT_SUGGESTIONS : SUGGESTIONS).map((text, i) => <button key={text} className="assistant-sug" disabled={a.busy || !a.model} onClick={() => void submit(text)}><SoftIcon name={(a.agent ? AGENT_ICONS : SUGGESTION_ICONS)[i] ?? 'ai'} size={28} /><span>{text}</span></button>)}
                </div>
              </div>
            )}
            {a.messages.map((m, i) => {
              if (m.role === 'user') return <p key={m.id} className="assistant-me">{m.text}</p>
              if (m.agent) {
                const v = m.agent
                const face = agentFace(v, me.egg)
                const mine = bump?.id === m.id ? bump : null
                const live = i === lastAi || !!mine?.xp
                const play = mine ?? (!seenIds.current!.has(m.id) && face.move ? { move: face.move, n: 0 } : null)
                const mood = mine?.xp || mine?.move === 'hop' ? 'happy' : face.mood
                const text = v.line ?? m.text
                return (
                  <div key={m.id} className="assistant-ai">
                    {live
                      ? <CompanionFace species={me.species} stage={me.stage} size={size} mood={mood} dim={face.dim} play={play} className="assistant-face" onPress={() => setBump((b) => ({ id: m.id, move: 'hop', n: (b?.n ?? 0) + 1 }))} label={me.label}>{mine?.xp && <CompanionXp key={mine.n} />}</CompanionFace>
                      : <StillFace species={me.species} stage={me.stage} size={size} mood={face.mood} dim={face.dim} />}
                    <div className="assistant-ai__body">
                      {nameLine}
                      <ToolChips chips={v.chips} />
                      {text && <p className="assistant-text">{text}</p>}
                      {v.cards.map((c, k) => c.type === 'confirm'
                        ? <ConfirmView key={c.key} card={c} busy={a.busy} onOpen={onOpen}
                            onSave={(picked) => void a.saveConfirm(m.id, c, picked).then((saved) => { if (saved) setBump((b) => ({ id: m.id, move: 'hop', n: (b?.n ?? 0) + 1, xp: saved.op === 'complete' && canXp })) })}
                            onCancel={() => a.cancelConfirm(m.id, c)}
                            onEdit={() => { a.cancelConfirm(m.id, c); onDraft(editSentence(c)); input.current?.focus() }}
                            onUndo={() => void a.undoConfirm(m.id, c)} />
                        : <AgentCard key={k} card={c} h={cardH(m.id)} />)}
                      <Bands bands={v.bands} />
                      {v.hint && <p className="aa-hint">{v.hint}</p>}
                      {v.action && <div className="aa-actions"><button className="aa-btn" onClick={() => onOpen(v.action === 'diary' ? 'view:diary' : 'view:settings')}>{v.action === 'diary' ? '일기로 가기' : '설정 열기'}</button></div>}
                      {v.error && <div className="assistant-error" role="alert"><p>{v.error}</p></div>}
                    </div>
                  </div>
                )
              }
              const kind = answerKindOf(m.result)
              const face = answerFace({ kind, count: m.result?.total ?? m.result?.tasks?.length, first: m.result?.tasks?.[0], status: m.result?.status, request: m.request ?? a.messages[i - 1]?.text, text: m.text, undone: m.undone, egg: me.egg })
              const mine = bump?.id === m.id ? bump : null
              const live = i === lastAi || !!mine?.xp
              const fresh = !seenIds.current!.has(m.id)
              const play = mine ?? (fresh && face.move ? { move: face.move, n: 0 } : null)
              const mood = mine?.xp ? 'happy' : face.mood
              return (
                <div key={m.id} className="assistant-ai">
                  {live
                    ? <CompanionFace species={me.species} stage={me.stage} size={size} mood={mood} dim={face.dim} play={play} className="assistant-face" onPress={() => setBump((b) => ({ id: m.id, move: 'hop', n: (b?.n ?? 0) + 1 }))} label={me.label}>{mine?.xp && <CompanionXp key={mine.n} />}</CompanionFace>
                    : <StillFace species={me.species} stage={me.stage} size={size} mood={face.mood} dim={face.dim} />}
                  <div className="assistant-ai__body">
                    {nameLine}
                    <p className="assistant-text">{kind === 'create' || kind === 'query' || kind === 'stats' || kind === 'recall' || m.undone ? face.line : m.text}</p>
                    {m.result?.recall && <RecallCard recall={m.result.recall} onOpen={onOpen} />}
                    {m.result && !m.result.recall && <ResultCard result={m.result} onOpen={onOpen} onDone={() => setBump((b) => ({ id: m.id, move: 'hop', n: (b?.n ?? 0) + 1, xp: canXp }))} />}
                    {m.result?.created && !m.undone && <button className="assistant-undo" onClick={() => void a.undo(m)}><RotateCcw />되돌리기</button>}
                    {m === lastMsg && chips.length > 0 && (
                      <div className="assistant-chips" role="group" aria-label="빠른 답">
                        {chips.map((c) => <button key={c.label} className={`assistant-chip${c.ghost ? ' is-ghost' : ''}`} disabled={a.busy || !a.model} onClick={() => void submit(c.label, c.send)}>{c.label}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {a.busy && a.live && (
              <div className="assistant-ai">
                <AgentLiveFace me={me} size={size} stream={a.stream} running={a.live.running.length > 0} />
                <div className="assistant-ai__body">
                  {nameLine}
                  {(a.progress.queue ?? 0) > 0 && <p className="assistant-muted">순서를 기다리는 중… (앞에 {a.progress.queue}명)</p>}
                  <ToolChips chips={a.live.chips} running={new Set(a.live.running)} />
                  <AgentLiveText stream={a.stream} reduced={reduced} fallback={!a.live.chips.length && !(a.progress.queue ?? 0) ? '생각하는 중…' : ''} />
                  {a.live.cards.filter((c) => c.type !== 'confirm').map((c, k) => <AgentCard key={k} card={c} h={cardH('live')} />)}
                  <div className="assistant-steps" role="status"><span>{elapsed}초</span></div>
                </div>
              </div>
            )}
            {a.busy && !a.live && (
              <div className="assistant-ai">
                <CompanionFace species={me.species} stage={me.stage} size={size} mood="think" loop="think" className="assistant-face" />
                <div className="assistant-ai__body">
                  {nameLine}
                  {a.progress.preview ? <p className="assistant-text">{a.progress.preview}<span className="assistant-caret" /></p> : <p className="assistant-muted">{(a.progress.queue ?? 0) > 0 ? `순서를 기다리는 중… (앞에 ${a.progress.queue}명)` : a.progress.phase === 'connecting' ? '꿈틀 AI에 연결하는 중…' : '생각하는 중…'}</p>}
                  <div className="assistant-steps" role="status">
                    {STEPS.map((s, i) => <span key={s.label} className={i <= phaseIndex ? 'is-on' : ''}>{i > 0 && <em>›</em>}● {s.label}</span>)}
                    <span>· {elapsed}초</span>
                  </div>
                </div>
              </div>
            )}
            {a.error && !a.busy && (() => {
              const face = errorFace(a.error, me.egg)
              return (
                <div className="assistant-ai">
                  <CompanionFace key={a.error} species={me.species} stage={me.stage} size={size} mood={face.mood} dim={face.dim} play={face.move ? { move: face.move, n: 0 } : null} className="assistant-face" />
                  <div className="assistant-ai__body">
                    {nameLine}
                    {face.line && <p className="assistant-text">{face.line}</p>}
                    <div className="assistant-error" role="alert">
                      <p>{a.error}</p>
                      {!a.models.length && /^지금은 AI를 쓸 수 없어요/.test(a.error) && <small>1분 뒤 저절로 다시 확인해요</small>}
                      <div>
                        {a.lastRequest && <button disabled={a.busy || a.cooldown || !a.model} title={a.cooldown ? '잠시 뒤 다시 시도할 수 있어요' : undefined} onClick={() => void submit(a.lastRequest)}><RefreshCw />다시 시도</button>}
                        {a.lastRequest && <button onClick={() => { onDraft(a.lastRequest); input.current?.focus() }}>입력으로 가져오기</button>}
                        {!a.models.length && <button disabled={a.connecting} onClick={() => void a.refresh()}>다시 연결</button>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
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
          <span>{a.busy ? '답을 받는 중에는 보내지 않아요' : variant === 'quick' ? 'Enter 보내기' : 'Enter 보내기 · Shift+Enter 줄바꿈'}{a.agent && a.left !== null && a.left <= 10 && <em className="aa-left"> · 오늘 남은 이야기 {a.left}번</em>}</span>
          {a.busy
            ? <button className="assistant-send" aria-label="멈추기" title="멈추기" onClick={a.cancel}><Square fill="currentColor" /></button>
            : <button className="assistant-send" aria-label="보내기" title="보내기" disabled={!a.model || !draft.trim() || a.connecting} onClick={() => void submit()}><ArrowUp /></button>}
        </div>
      </div>
      {variant === 'full' && <p className="assistant-footnote">{a.agent ? '꿈틀 AI는 운영자의 Mac mini에서 돌아가요 · 인터넷은 볼 수 없어요 · 저장 전엔 늘 물어봐요' : '등록 결과는 카드에서 확인하고 되돌릴 수 있어요'}</p>}
    </div>
  )
}

/** 결과 카드: 머리줄 + 틱틱 행(체크박스 · 제목 · 날짜). 집계는 큰 숫자 + 근거 행 — 13 §3 */
function ResultCard({ result: r, onOpen, onDone }: { result: AssistantResult; onOpen: (id: string) => void; onDone?: () => void }) {
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
            <button className={`checkbox${done ? ' is-checked' : ''}`} aria-label={done ? '완료됨' : '완료'} disabled={!!gone || done} onClick={(e) => { e.stopPropagation(); onDone?.(); void complete([t.id]) }}>{done && <Check />}</button>
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

/** 13 §3.1 기록 카드: 마지막으로 한 것 1행(+ 다음 예정 1행), 횟수면 그 기간 기록 행(최대 5, 더 보기). 행 = 열기(할 일 상세 · 일정 팝오버 · 그날 캘린더) */
function RecallCard({ recall: r, onOpen }: { recall: RecallResult; onOpen: (id: string) => void }) {
  const [more, setMore] = useState(false)
  const now = new Date()
  const today = ymdOf(now)
  const rows: { hit: RecallHit; meta: string; tone: 'past' | 'future' }[] = []
  if (r.mode === 'last' && r.last) rows.push({ hit: r.last, meta: `${dayWord(r.last.date, now)}${r.last.date === today ? '' : ` · ${daysBetween(r.last.date, today)}일 전`}`, tone: 'past' })
  if (r.mode === 'count') for (const hit of r.hits ?? []) rows.push({ hit, meta: dayWord(hit.date, now), tone: 'past' })
  const limit = r.mode === 'count' && !more ? 5 : rows.length
  const shown = rows.slice(0, limit)
  if (r.next) shown.push({ hit: r.next, meta: `다음 예정 · ${dayWord(r.next.date, now)}`, tone: 'future' })
  if (!shown.length) return null
  const head = r.mode === 'last' ? '마지막 기록' : `${r.scope ?? '지금까지'} 기록`
  return (
    <div className="assistant-card">
      <div className="assistant-card__head">
        <History />
        <span>{head}</span>
        {r.mode === 'count' && <em>{r.count ?? 0}번</em>}
      </div>
      {shown.map(({ hit, meta, tone }) => (
        <div key={`${tone}:${hit.id}`} className={`assistant-row${tone === 'past' && hit.source === 'task' ? ' is-done' : ''}`} onClick={() => onOpen(hit.open)}>
          {hit.source === 'task'
            ? <span className={`checkbox${tone === 'past' ? ' is-checked' : ''}`} aria-hidden>{tone === 'past' && <Check />}</span>
            : <CalendarDays className="assistant-row__icon" aria-hidden />}
          <span className="assistant-row__title">{hit.title}</span>
          <span className={`assistant-row__meta${tone === 'future' ? ' is-future' : ''}`}>{meta}</span>
          <ArrowUpRight className="assistant-row__go" />
        </div>
      ))}
      {r.mode === 'count' && !more && rows.length > 5 && <button className="assistant-card__more" onClick={() => setMore(true)}>더 보기 {rows.length - 5}</button>}
    </div>
  )
}

/** 47 답 얼굴: 오류 = 40 errorFace, 넣기 성공 = happy 깡충, 확인 카드 = smile, 인터넷 없음·모름 = 기본 얼굴 */
function agentFace(v: AgentView, egg?: boolean): { mood: 'smile' | 'happy' | 'content' | 'think' | 'puzzled' | 'sleepy'; move: 'hop' | 'tilt' | null; dim?: boolean } {
  if (v.error) { const f = errorFace(v.error, egg); return { mood: f.mood, move: f.move, dim: f.dim } }
  if (v.cards.some((c) => c.type === 'confirm' && c.state === 'saved') || (v.line && /^넣어 뒀어|^완료로 바꿨어|옮겼어\.$/.test(v.line))) return { mood: 'happy', move: 'hop' }
  return { mood: 'smile', move: null }
}
/** 받는 중 얼굴: 글이 오기 전·도구 부르는 중 = think + 3° 흔들림 → 글이 흐르면 smile(말하는 얼굴) */
function AgentLiveFace({ me, size, stream, running }: { me: ReturnType<typeof useCompanion>; size: number; stream: ReturnType<typeof createTextStream>; running: boolean }) {
  const talking = useSyncExternalStore(stream.subscribe, () => stream.get().text.length > 0)
  return <CompanionFace species={me.species} stage={me.stage} size={size} mood={talking && !running ? 'smile' : 'think'} loop={talking && !running ? null : 'think'} className="assistant-face" />
}
/** 받는 글(마지막 답만 스트림, 47 §4): 프레임마다 드러내기(28 §8.11 revealNext) */
function AgentLiveText({ stream, reduced, fallback }: { stream: ReturnType<typeof createTextStream>; reduced: boolean; fallback: string }) {
  const has = useSyncExternalStore(stream.subscribe, () => stream.get().text.length > 0)
  if (!has) return fallback ? <p className="assistant-muted">{fallback}</p> : null
  return <p className="assistant-text"><StreamText stream={stream} reduced={reduced} /><span className="assistant-caret" /></p>
}
