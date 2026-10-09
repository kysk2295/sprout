// 47 §2·§4 한 턴: 길잡이(§2.2) → (모델 ↔ 도구) 최대 4번 → 근거 검사(§8.2). 데스크톱·휴대폰 같은 코드 — 모델 호출(chat)·DB·저장만 앱이 넣는다.
// 루프: 모델 호출 최대 4번(도구 라운드 3 + 답 1), 한 번에 도구 3개, 도구 2초, 턴 150초. 데이터 질문인데 도구를 안 부르면 한 번만 재촉(research 39 v3),
// 그래도 안 부르면 앱이 find_tasks를 직접 부르고 '찾아본 건 카드에 있어.'. 마지막 답만 글자 스트림(도구 라운드는 칩만). 대기열 503이면 길잡이로 찾은 카드만.
import { agentContext, NUDGE, PROPOSE_TOOLS, toolsFor, type ToolName } from './assistantTools.ts'
import { createCard, failedRun, isConfirm, listsOf, pickList, runTool, runningChip, updateCard, undoStmts, moveStmts, deleteStmts, words, type AssistantDb, type Card, type Chip, type ConfirmCard, type Facts, type Stmt, type ToolRun } from './assistantExec.ts'
import { claimsSearched, ground, offersToSearch } from './assistantGround.ts'
import { memoryBlock, route, userContent, type AgentMemory, type Band, type Route } from './assistantRouter.ts'

export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] }
  | { role: 'tool'; tool_name: string; content: string }
export type ChatReply = { content: string; tool_calls: { name: string; args: Record<string, unknown> }[]; prompt_tokens?: number }
/** 모델 한 번(서버 /ai/assistant mode agent, 같은 턴 id). tools 빈 배열 = 답만 */
export type ChatFn = (req: { messages: AgentMessage[]; tools: ToolName[]; turn: string; call: number }, h: { signal: AbortSignal; onDelta: (s: string) => void; onQueue: (position: number) => void }) => Promise<ChatReply>

export type TurnEvent =
  | { type: 'phase'; phase: 'tools' | 'model' | 'answer' }
  | { type: 'queue'; position: number }
  | { type: 'chip'; index: number; chip: Chip; state: 'running' | 'done' | 'failed' }
  | { type: 'card'; card: Card }
  | { type: 'delta'; text: string }
  | { type: 'reset' }

export type TurnLimits = { maxCalls: number; toolsPerCall: number; toolMs: number; turnMs: number }
export const LIMITS: TurnLimits = { maxCalls: 4, toolsPerCall: 3, toolMs: 2000, turnMs: 150_000 }
export const HISTORY_TURNS = 6
export const HISTORY_CHARS = 600

export type TurnInput = {
  text: string
  now?: Date
  /** 최근 대화(내 말 + 캐릭터 답) — 앱이 6턴·600자로 자른다 */
  history: { user: string; assistant: string }[]
  memory: AgentMemory
  /** 떠 있는 확인 카드(하나일 때만 말로 확인) */
  pending?: ConfirmCard | null
  diary: boolean
  name: string
  timeZone?: string
  db: AssistantDb
  chat: ChatFn
  turn: string
  signal?: AbortSignal
  onEvent?: (e: TurnEvent) => void
  limits?: Partial<TurnLimits>
  newKey?: () => string
}
export type TurnResult = {
  text: string
  chips: Chip[]
  cards: Card[]
  bands: Band[]
  /** 길잡이 갈래(기록·측정용) */
  route: Route['kind']
  /** 모델 호출 수(0 = 길잡이만) */
  calls: number
  nudged: boolean
  grounding: { hits: number; reasons: string[] }
  /** 확인 카드에 말로 답함 → 앱이 그 카드의 넣기/취소를 누른 것과 같이 처리 */
  confirm?: { key: string; action: 'save' | 'cancel' }
  /** 3차 안내 한 줄(일기 꺼짐 등) */
  hint?: string
  action?: 'diary' | 'settings'
  memory: AgentMemory
  /** 대기열 503 등으로 모델 없이 찾은 것만 보여 줌 */
  busyFallback?: boolean
  /** 끝까지 못 감(멈춤·오래 걸림·연결) — 나온 칩·카드는 남긴다 */
  error?: string
  stopped?: boolean
  /** 근거 검사 전 모델 글(실측·시험용 — 화면엔 쓰지 않는다) */
  raw?: string
  ms: number
}

/** 서버가 agent를 모름(배포 전) — 앱은 13 의도 경로로 */
export class AgentUnsupportedError extends Error { constructor() { super('agent mode unsupported'); this.name = 'AgentUnsupportedError' } }
export const STOPPED_TEXT = '요청을 멈췄어요. 내용을 확인한 뒤 다시 보내 주세요.'
export const TOO_LONG_TEXT = 'AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.'
export const BUSY_LINE = '지금 AI가 바빠서 찾은 것만 보여 줄게.'
export const MORE_LINE = '여기까지 찾았어. 더 좁혀서 물어봐 줄래?'
export const CARD_LINE = '찾아본 건 카드에 있어.'
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e ?? ''))
/** 서버가 바쁨(대기열 503) 또는 꺼짐 — 길잡이로 찾은 카드만 보여 줄 수 있는 경우 */
export const isBusy = (e: unknown) => (e as { status?: number })?.status === 503 || /쓰는 사람이 많아요|바빠서|지금은 AI를 쓸 수 없어요/.test(msgOf(e))

/** 확인 카드를 띄울 때 캐릭터 말(앱이 고름 — 길잡이 쓰기는 모델을 부르지 않는다) */
export function confirmLine(c: ConfirmCard): string {
  if (c.op === 'complete') return (c.targets?.length ?? 0) > 1 ? '어떤 걸 완료로 바꿀까?' : '이거 완료로 바꿀까?'
  if (c.op === 'move') return (c.targets?.length ?? 0) > 1 ? '어떤 걸 옮길까?' : '이렇게 옮길까?'
  if (c.op === 'delete') return (c.targets?.length ?? 0) > 1 ? '어떤 걸 지울까?' : '이거 지울까? 지우기는 단추로만 할 수 있어.'
  return '이렇게 넣을까?'
}

/** AbortSignal.any가 없는 런타임(React Native Hermes)도 있어 직접 묶는다 */
export function anySignal(a: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!b) return a
  const c = new AbortController()
  const on = (s: AbortSignal) => () => c.abort(s.reason)
  if (a.aborted) c.abort(a.reason)
  else if (b.aborted) c.abort(b.reason)
  else { a.addEventListener('abort', on(a), { once: true }); b.addEventListener('abort', on(b), { once: true }) }
  return c.signal
}
function emptyFacts(): Facts { return { dates: [], titles: [], numbers: [] } }
function mergeFacts(a: Facts, b: Facts): Facts { return { dates: [...a.dates, ...b.dates], titles: [...a.titles, ...b.titles], numbers: [...a.numbers, ...b.numbers] } }

export async function runTurn(i: TurnInput): Promise<TurnResult> {
  const t0 = Date.now()
  const now = i.now ?? new Date()
  const L = { ...LIMITS, ...i.limits }
  const emit = (e: TurnEvent) => { try { i.onEvent?.(e) } catch { /* 화면 오류는 턴을 멈추지 않는다 */ } }
  const memory: AgentMemory = { aliases: { ...i.memory.aliases }, recent: [...i.memory.recent], subject: i.memory.subject, lastTools: i.memory.lastTools }
  const lists = await listsOf(i.db).catch(() => [])
  const routed = route(i.text, { now, pending: i.pending, diary: i.diary, memory, lists })
  const chips: Chip[] = [], cards: Card[] = []
  let facts = mergeFacts(emptyFacts(), i.memory.facts ?? emptyFacts())
  const ctx = { db: i.db, now, aliases: memory.aliases, diary: i.diary, newKey: i.newKey }
  const result = (text: string, extra: Partial<TurnResult> = {}): TurnResult => ({
    text, chips, cards, bands: routed.bands, route: routed.route.kind, calls: 0, nudged: false, grounding: { hits: 0, reasons: [] }, memory: remember(memory, cards, chips, facts), ms: Date.now() - t0, ...extra
  })
  const addCard = (c: Card | undefined) => { if (!c) return; if (cards.length < 2 || isConfirm(c)) { cards.push(c); emit({ type: 'card', card: c }) } }
  /** 도구 실행(제한 시간 2초, 실패해도 턴은 이어 감) */
  const exec = async (name: string, args: Record<string, unknown>): Promise<ToolRun> => {
    const index = chips.length
    const chip: Chip = { tool: (name as ToolName), running: runningChip(name as ToolName, args), done: '', detail: '' }
    chips.push(chip)
    emit({ type: 'chip', index, chip, state: 'running' })
    const run = await Promise.race([
      runTool(name, args, ctx),
      new Promise<ToolRun>((res) => setTimeout(() => res(failedRun(name as ToolName, args, 'timeout')), L.toolMs))
    ])
    chips[index] = run.chip
    emit({ type: 'chip', index, chip: run.chip, state: run.ok ? 'done' : 'failed' })
    if (run.ok) { addCard(run.card); facts = mergeFacts(facts, run.facts) }
    return run
  }

  // ── 길잡이: 모델 없이 끝나는 갈래 ──
  const rt = routed.route
  if (rt.kind === 'confirm') return result('', { confirm: { key: rt.key, action: 'save' } })
  if (rt.kind === 'cancel') return result('알겠어, 안 넣을게.', { confirm: { key: rt.key, action: 'cancel' } })
  if (rt.kind === 'fixed') return result(rt.text, { ...(rt.hint ? { hint: rt.hint } : {}), ...(rt.action ? { action: rt.action } : {}) })
  if (rt.kind === 'create') {
    const card = createCard({ title: rt.title, start: rt.start, due: rt.due, list: pickList(lists, rt.list ?? ''), repeat: rt.repeat, said: rt.said, durationMin: rt.durationMin, assumedPm: rt.assumedPm, basis: rt.basis, key: i.newKey?.() ?? `c${t0.toString(36)}` })
    if (card) {
      chips.push({ tool: 'propose_create', running: runningChip('propose_create', { due: card.due }), done: card.due.includes('T') ? '일정 하나 준비했어' : '할 일 하나 준비했어', detail: '' })
      addCard(card)
      memory.subject = card.title
      return result(confirmLine(card))
    }
  }
  if (rt.kind === 'update') {
    // 후보 찾기(칩만 — 찾은 목록 카드 대신 확인 카드를 그린다)
    const run = await runTool('find_tasks', { query: rt.query, status: 'open', sort: 'due' }, ctx)
    chips.push(run.chip)
    if (run.ok) facts = mergeFacts(facts, run.facts)
    const found = run.card?.type === 'tasks' ? run.card.tasks : []
    // 낱말이 가장 많이 맞는 후보 먼저
    const ws = words(rt.query).map((w) => w.toLowerCase())
    const ranked = [...found].sort((a, b) => ws.filter((w) => b.title.toLowerCase().includes(w)).length - ws.filter((w) => a.title.toLowerCase().includes(w)).length)
    const exact = ranked.filter((tk) => tk.title.replace(/\s+/g, '') === rt.query.replace(/\s+/g, ''))
    const card = updateCard(rt.op, (exact.length ? exact : ranked).slice(0, 5), i.newKey?.() ?? `c${t0.toString(36)}`, rt.moveTo, rt.said)
    if (card) { addCard(card); return result(confirmLine(card)) }
    return result(`‘${rt.query}’ 할 일을 못 찾았어. 제목을 조금만 더 알려 줄래?`)
  }

  // ── 모델(+ 도구) ──
  const turnAbort = new AbortController()
  const timer = setTimeout(() => turnAbort.abort(new Error('turn-timeout')), L.turnMs)
  const signal = anySignal(turnAbort.signal, i.signal)
  const tools = toolsFor({ diary: i.diary }).map((t) => t.function.name)
  // 이어 받을 것은 앞 말을 가리킬 때만(그거·아까·그럼…) — 일반 질문에 앞 턴 항목이 새지 않게(실측: 공부법 답에 '안약 넣기')
  const mem = /(그거|그것|그걸|그건|거기|아까|그럼|그러면|그때|그\s|이거|저거|방금|다시|그날|걔|그 일)/.test(i.text) ? memoryBlock(i.memory, now) : ''
  const messages: AgentMessage[] = [
    { role: 'system', content: agentContext(now, { name: i.name, timeZone: i.timeZone, diary: i.diary }) + (mem ? `\n${mem}` : '') },
    ...i.history.slice(-HISTORY_TURNS).flatMap((h) => [{ role: 'user' as const, content: h.user.slice(0, HISTORY_CHARS) }, { role: 'assistant' as const, content: h.assistant.slice(0, HISTORY_CHARS) }]),
    { role: 'user', content: userContent(i.text, routed.notes) }
  ]
  let calls = 0, nudged = false, usedTools = false
  let answer = ''
  const callModel = async (offer: ToolName[]) => {
    calls++
    emit({ type: 'phase', phase: offer.length ? 'model' : 'answer' })
    let streamed = false
    const reply = await i.chat({ messages, tools: offer, turn: i.turn, call: calls }, {
      signal,
      onDelta: (s) => { streamed = true; emit({ type: 'delta', text: s }) },
      onQueue: (position) => emit({ type: 'queue', position })
    })
    if (reply.tool_calls.length && streamed) emit({ type: 'reset' })
    return reply
  }
  const runCalls = async (list: { name: string; args: Record<string, unknown> }[]) => {
    const take = list.slice(0, L.toolsPerCall)
    messages.push({ role: 'assistant', content: '', tool_calls: take.map((c) => ({ function: { name: c.name, arguments: c.args } })) })
    emit({ type: 'phase', phase: 'tools' })
    const runs = await Promise.all(take.map((c) => exec(c.name, c.args)))
    usedTools = true
    runs.forEach((r, k) => messages.push({ role: 'tool', tool_name: take[k].name, content: r.forModel }))
    return runs
  }
  try {
    if (rt.kind === 'prefetch') {
      // 길잡이가 도구를 먼저 → 모델은 답만(도구 없이 한 번)
      await runCalls(rt.calls)
      try {
        answer = (await callModel([])).content
      } catch (e) {
        if (signal.aborted || !isBusy(e) || !cards.length) throw e
        clearTimeout(timer)
        return result(BUSY_LINE, { busyFallback: true, calls })
      }
    } else {
      for (;;) {
        const last = calls + 1 >= L.maxCalls
        const reply = await callModel(last ? [] : tools)
        if (reply.tool_calls.length && !last) { await runCalls(reply.tool_calls); continue }
        if (reply.tool_calls.length) { answer = MORE_LINE; break }
        // 데이터 질문(또는 '찾아볼까?'·내 일을 묻는데 '찾아봤는데 없어')인데 도구 없이 답함 → 한 번만 재촉. 일반 질문에 붙은 '기록에 없네'는 근거 검사가 뺀다
        if (!usedTools && !nudged && (routed.dataQuestion || offersToSearch(reply.content) || (claimsSearched(reply.content) && /(내가|내\s|나\s|나의|했|있)/.test(i.text))) && calls + 1 < L.maxCalls) {
          nudged = true
          emit({ type: 'reset' })
          messages.push({ role: 'assistant', content: reply.content }, { role: 'user', content: NUDGE })
          continue
        }
        if (!usedTools && nudged) {
          // 재촉해도 도구가 없으면 앱이 직접 찾고 카드로 답한다(§8.1-2)
          emit({ type: 'reset' })
          const q = words(i.text).filter((w) => w.length >= 2).slice(0, 2).join(' ')
          await exec('find_tasks', { query: q, status: 'all' })
          answer = CARD_LINE
          break
        }
        answer = reply.content
        break
      }
    }
  } catch (e) {
    clearTimeout(timer)
    const stopped = !!i.signal?.aborted
    const timedOut = turnAbort.signal.aborted && !stopped
    if (e instanceof AgentUnsupportedError) throw e
    if (!chips.length && !cards.length) throw stopped ? Object.assign(new Error(STOPPED_TEXT), { name: 'AbortError' }) : timedOut ? new Error(TOO_LONG_TEXT) : e
    return result('', { calls, nudged, error: stopped ? STOPPED_TEXT : timedOut ? TOO_LONG_TEXT : msgOf(e), stopped })
  }
  clearTimeout(timer)
  const g = ground({ text: answer, facts, user: i.text + ' ' + routed.notes.join(' '), now, aliases: memory.aliases, usedTools, hasCards: cards.length > 0 })
  const bands = [...routed.bands]
  if ((g.priceBlocked || /인터넷/.test(answer)) && !bands.includes('noweb')) bands.push('noweb')
  return { ...result(g.text, { calls, nudged, grounding: { hits: g.hits, reasons: g.reasons }, raw: answer }), bands }
}

/** 이어 받을 것 갱신(§10): 카드의 항목 최대 5 · 주제(최근 찾은 말) · 도구 요약 한 줄 · 근거 사실 */
function remember(m: AgentMemory, cards: Card[], chips: Chip[], facts: Facts): AgentMemory {
  const recent: AgentMemory['recent'] = []
  const alias = (id: string) => Object.entries(m.aliases).find(([, v]) => v.id === id)?.[0]
  let subject = m.subject
  for (const c of cards) {
    if (c.type === 'tasks') for (const t of c.tasks.slice(0, 5)) { const a = alias(t.id); if (a) recent.push({ alias: a, title: t.title, date: t.due_at ?? t.start_at }) }
    if (c.type === 'since') { subject = c.phrase; if (c.last) { const a = alias(c.last.id); if (a) recent.push({ alias: a, title: c.last.title, date: c.last.date }) } }
    if (c.type === 'confirm') subject = c.title
  }
  const tools = chips.filter((c) => !c.failed && c.done).map((c) => c.done).join(', ')
  // 별칭은 최근 40개만(오래된 것부터 버림)
  const entries = Object.entries(m.aliases)
  const aliases = Object.fromEntries(entries.slice(-40))
  return { aliases, recent: (recent.length ? recent : m.recent).slice(0, 5), ...(subject ? { subject } : {}), ...(tools ? { lastTools: tools.slice(0, 160) } : m.lastTools ? { lastTools: m.lastTools } : {}), facts: { dates: facts.dates.slice(-60), titles: facts.titles.slice(-40), numbers: facts.numbers.slice(-60) } }
}

// ── 확인 카드 넣기·되돌리기(§5.3·§6) — 앱이 실제 쓰기를 넣는다 ──
export interface AgentWrites {
  /** 새 할 일 id */
  newId(): string
  /** 지금 시각(modified_at 도장) */
  stamp(): string
  /** 만들기 = 13 executeIntent create 경로(tasks status 0, 기본함 없으면 만든다). 쓴 modified_at을 돌려준다 */
  create(card: ConfirmCard, id: string, stamp: string): Promise<void>
  /** 21 완료(XP 포함) */
  complete(ids: string[]): Promise<void>
  /** 완료 되돌리기(XP 되돌림) — 없으면 완료 되돌리기 단추를 숨긴다 */
  uncomplete?(ids: string[]): Promise<void>
  run(stmts: Stmt[]): Promise<void>
  read(ids: string[]): Promise<{ id: string; modified_at: string | null; status: number; deleted_at: string | null; start_at: string | null; due_at: string | null }[]>
}
export const UNDO_BLOCKED = '등록 뒤에 바뀐 항목은 되돌릴 수 없어요'
/** 넣기(또는 완료·옮기기·지우기). picked = 여럿 중 고른 대상 id */
export async function saveCard(card: ConfirmCard, w: AgentWrites, picked?: string[]): Promise<ConfirmCard> {
  if (card.state !== 'pending') return card
  const stamp = w.stamp()
  if (card.op === 'create') {
    const id = w.newId()
    await w.create(card, id, stamp)
    return { ...card, state: 'saved', saved: { ids: [id], stamp } }
  }
  const ids = (picked ?? card.targets?.filter((t) => t.picked).map((t) => t.id) ?? []).slice(0, 5)
  if (!ids.length) throw new Error('고른 할 일이 없어요.')
  const before = await w.read(ids)
  if (card.op === 'complete') {
    await w.complete(ids)
    const after = await w.read(ids)
    return { ...card, state: 'saved', saved: { ids, stamp: after[0]?.modified_at ?? stamp } }
  }
  if (card.op === 'move') {
    await w.run(moveStmts(before, card.moveTo!, stamp))
    return { ...card, state: 'saved', saved: { ids, stamp, prev: before.map((b) => ({ id: b.id, start_at: b.start_at, due_at: b.due_at })) } }
  }
  await w.run(deleteStmts(ids, stamp))
  return { ...card, state: 'saved', saved: { ids, stamp } }
}
/** 되돌리기(13 규칙: 넣은/바꾼 직후와 같을 때만) */
export async function undoCard(card: ConfirmCard, w: AgentWrites): Promise<ConfirmCard> {
  if (card.state !== 'saved' || !card.saved) return card
  const cur = await w.read(card.saved.ids)
  if (card.op === 'complete') {
    if (!w.uncomplete || cur.some((c) => c.modified_at !== card.saved!.stamp || c.status !== 1)) throw new Error(UNDO_BLOCKED)
    await w.uncomplete(card.saved.ids)
    return { ...card, state: 'undone' }
  }
  const stmts = undoStmts(card, cur, w.stamp())
  if (!stmts) throw new Error(UNDO_BLOCKED)
  await w.run(stmts)
  return { ...card, state: 'undone' }
}
/** 같은 턴의 카드 중 아직 저장 전인 확인 카드(말로 확인할 대상 — 하나일 때만) */
export function pendingCard(cardLists: Card[][]): ConfirmCard | null {
  const pend = cardLists.flat().filter((c): c is ConfirmCard => isConfirm(c) && c.state === 'pending')
  return pend.length === 1 ? pend[0] : null
}
export { PROPOSE_TOOLS }
