// 47 §3 도구 실행 — 기기 안 SQLite(PowerSync 표)를 앱이 만든 SQL로 읽고, 모델에게 줄 짧은 JSON(§3.3)·칩 글(§5.1)·카드(§5.2·§5.3)·근거 사실(§8.2)을 만든다.
// 데스크톱·휴대폰 같은 코드(db = getAll만 있는 얇은 껍데기). 쓰기 도구는 저장하지 않는다 — 확인 카드만(§5.3·§6). 외부 캘린더(구글·iCloud·휴대폰)는
// 읽지 않는다(처리방침 제7조 2항 — §8.5). 일기는 ctx.diary(설정 + 일기 AI 동의)일 때만, 나만 보기 날은 빼고(§8.4). 시험: assistantAgent.test.ts.
import { dateLabel, dayGap, isToolName, isYmd, mdw, mondayOf, plusDays, TOOL_RESULT_HEAD, weekdayOf, whenLine, ymd, type ToolName } from './assistantTools.ts'
import { occurrences } from './events.ts'
import { progressFromEvents, STAGES } from './growth.ts'
import { buildPlanView, type PTaskRow } from './planView.ts'
import { recallMatches, occurrenceOf, type RecallAsk, type RecallRow } from './recall.ts'

export type AssistantDb = { getAll<T = any>(sql: string, args?: unknown[]): Promise<T[]> }
export type ListLite = { id: string; name: string; kind: string | null }

// ── 카드(앱이 도구 결과로 그림 — §5.2) ─────────────────────────
export type TaskItem = { id: string; title: string; list: string | null; priority: number; status: number; start_at: string | null; due_at: string | null; completed_at?: string | null }
export type EventItem = { id: string; title: string; start: string; end: string | null; kind: 'event' | 'task' }
export type SinceHit = { id: string; title: string; date: string; source: 'task' | 'event'; open: string }
export type Card =
  | { type: 'tasks'; head: string; total: number; tasks: TaskItem[]; note?: string; empty?: string }
  | { type: 'events'; head: string; total: number; events: EventItem[]; empty?: string }
  | { type: 'since'; phrase: string; last?: SinceHit; days?: number; count: number; countFrom: string; dates: string[]; avgGap?: number; next?: SinceHit; note: string; first?: string | null }
  | { type: 'notes'; head: string; total: number; notes: { id: string; title: string; modified: string | null }[] }
  | { type: 'diary'; head: string; total: number; days: { date: string; mood: number | null; snippet: string }[] }
  | { type: 'project'; projects: { id: string; name: string; total: number; done: number; deadline: string | null; next: { id: string; title: string; due_at: string | null }[] }[] }
  | { type: 'growth'; name: string; level: number; stageName: string; into: number; toNext: number; weekDone: number }
  | ConfirmCard

/** 확인 카드(§5.3). 저장 전엔 아무것도 바뀌지 않는다 */
export type ConfirmOp = 'create' | 'complete' | 'move' | 'delete'
export type ConfirmTarget = { id: string; title: string; start_at: string | null; due_at: string | null; picked: boolean }
export type ConfirmCard = {
  type: 'confirm'
  key: string
  op: ConfirmOp
  /** create: 제목·시작·끝/마감·리스트·반복 */
  title: string
  start: string
  due: string
  listId: string
  listName: string
  repeat: string
  /** 사용자 원말('내일') — 언제 줄 옆에 3차로 */
  said?: string
  /** '시각만 (길이 말 안 해서 안 붙였어요)' · '1시간' */
  length?: string
  /** '오전/오후 없는 3시를 오후로 읽었어요' */
  assumed?: string
  /** 이어 받은 말(§10) */
  basis?: string
  /** complete·move·delete 대상(여럿이면 고르기, 최대 5) */
  targets?: ConfirmTarget[]
  /** move: 새 날짜(YYYY-MM-DD) */
  moveTo?: string
  state: 'pending' | 'saved' | 'cancelled' | 'undone'
  /** 저장 뒤: 되돌리기 근거(13 규칙 — 그 뒤 바뀌면 못 되돌림) */
  saved?: { ids: string[]; stamp: string; prev?: { id: string; start_at: string | null; due_at: string | null }[] }
}
export const isConfirm = (c: Card | undefined): c is ConfirmCard => c?.type === 'confirm'

export type Chip = { tool: ToolName; running: string; done: string; detail: string; failed?: boolean }
/** 근거 검사 재료(§8.2): 결과에 나온 날짜(YYYY-MM-DD)·제목·숫자 */
export type Facts = { dates: string[]; titles: string[]; numbers: number[] }
export type ToolRun = { name: ToolName; args: Record<string, unknown>; ok: boolean; chip: Chip; card?: Card; forModel: string; facts: Facts }

/** 별칭 id(§3.3): 모델에겐 t1·e1·n1·p1만 보낸다 → 앱이 진짜 id로 되돌림. 대화 안에서 이어 쓴다(이어 받을 것) */
export type AliasEntry = { id: string; title: string; kind: 'task' | 'event' | 'note' | 'project'; date?: string | null }
export type AliasMap = Record<string, AliasEntry>
export function aliasFor(map: AliasMap, e: AliasEntry): string {
  for (const [k, v] of Object.entries(map)) if (v.id === e.id && v.kind === e.kind) return k
  const p = { task: 't', event: 'e', note: 'n', project: 'p' }[e.kind]
  let n = 1
  while (map[`${p}${n}`]) n++
  map[`${p}${n}`] = e
  return `${p}${n}`
}

export type ExecCtx = {
  db: AssistantDb
  now: Date
  aliases: AliasMap
  /** §8.4 일기 보기(설정 + 일기 AI 동의) */
  diary: boolean
  /** 확인 카드 key */
  newKey?: () => string
}

// ── 인자 다듬기 ───────────────────────────────────────────
const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
/** 모델이 'MM-DD'·'10/14'·'10월 14일'로 줘도 올해 날짜로. 틀리면 '' */
export function normDate(v: unknown, now: Date): string {
  const s = str(v, 40)
  if (!s) return ''
  if (isYmd(s.slice(0, 10))) return s.slice(0, 10)
  const m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s) ?? /^(\d{1,2})월\s*(\d{1,2})일/.exec(s)
  if (m) { const d = `${now.getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; return isYmd(d) ? d : '' }
  return ''
}
/** 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm'만 */
export function normAt(v: unknown, now: Date): string {
  const s = str(v, 40)
  const t = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(s)
  if (t && isYmd(t[1]) && Number(t[2]) < 24 && Number(t[3]) < 60) return `${t[1]}T${t[2]}:${t[3]}`
  return normDate(s, now)
}
const JOSA = /(에서|에게|한테|이랑|하고|까지|부터|으로|을|를|은|는|이|가|에|랑|도|의|로|만)$/
const STOP = new Set(['할일', '할', '일', '일정', '메모', '기록', '내', '나', '좀', '거', '것', '관련', '전부', '다', '모든', '목록'])
/** 키워드 → 찾을 낱말(조사 뗌, 두 글자 이상 우선) */
export function words(q: string): string[] {
  return [...new Set(q.replace(/[?!.,'"‘’“”]/g, ' ').split(/\s+/).map((w) => { const s = w.replace(JOSA, ''); return s.length >= 1 ? s : w }).filter((w) => w && !STOP.has(w)))].slice(0, 5)
}
const anyWord = (cols: string[], ws: string[]) => ({ sql: ws.length ? `(${ws.map(() => cols.map((c) => `instr(lower(${c}), lower(?)) > 0`).join(' OR ')).join(' OR ')})` : '1', args: ws.flatMap((w) => cols.map(() => w)) })
const clip = (s: string | null | undefined, n: number) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const PRI: Record<number, string> = { 3: 'high', 2: 'mid', 1: 'low' }
/** 완료 시각(UTC ISO)을 기기 날짜로 */
const localDayOf = (iso: string | null | undefined) => { if (!iso) return null; if (!iso.includes('T') || !/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) return iso.slice(0, 10); const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : ymd(d) }
const dayStartIso = (day: string) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))).toISOString()

/** 기간 이름: '오늘' · '내일' · '이번 주' · '다음 주' · '지난 주' · '10월 5일~11일' */
export function scopeName(from: string, to: string, now: Date): string {
  if (!from && !to) return ''
  const today = ymd(now), mon = mondayOf(now)
  if (from === to) { const g = dayGap(today, from); return g === 0 ? '오늘' : g === 1 ? '내일' : g === 2 ? '모레' : g === -1 ? '어제' : mdw(from, now) }
  if (from === mon && to === plusDays(mon, 6)) return '이번 주'
  if (from === plusDays(mon, 7) && to === plusDays(mon, 13)) return '다음 주'
  if (from === plusDays(mon, -7) && to === plusDays(mon, -1)) return '지난 주'
  if (from.slice(5) === '01-01' && to === `${from.slice(0, 4)}-12-31`) return from.slice(0, 4) === today.slice(0, 4) ? '올해' : `${from.slice(0, 4)}년`
  if (from.slice(8) === '01' && to.slice(0, 7) === from.slice(0, 7) && plusDays(to, 1).slice(8) === '01') return from.slice(0, 7) === today.slice(0, 7) ? '이번 달' : `${from.slice(0, 4) === today.slice(0, 4) ? '' : `${from.slice(0, 4)}년 `}${Number(from.slice(5, 7))}월`
  const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`
  if (from && to) return from.slice(0, 7) === to.slice(0, 7) ? `${md(from)}~${Number(to.slice(8, 10))}일` : `${md(from)}~${md(to)}`
  return from ? `${md(from)}부터` : `${md(to)}까지`
}
const rangeDetail = (from: string, to: string, now: Date) => {
  const name = scopeName(from, to, now)
  if (!name) return ''
  const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`
  return /[월일]/.test(name) || from === to ? name : `${name}(${md(from)}~${md(to)})`
}

// ── 근거 사실 모으기 ─────────────────────────────────────
let factYear = new Date().getFullYear()
function factsOf(model: unknown, extraTitles: string[] = []): Facts {
  const dates = new Set<string>(), numbers = new Set<number>(), titles = new Set(extraTitles.filter(Boolean))
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'number') numbers.add(v)
    else if (typeof v === 'string') {
      for (const m of v.matchAll(/\d{4}-\d{2}-\d{2}/g)) dates.add(m[0])
      // 사용자 글 속 날짜('10/12' · '10월 12일')도 근거(메모 본문 등)
      for (const m of v.matchAll(/(\d{1,2})(?:\/|월\s*)(\d{1,2})/g)) { const d = `${factYear}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; if (isYmd(d)) dates.add(d) }
      if (/(^|_)(title|matched_title|name)$/.test(key)) titles.add(v)
      if (/label$/.test(key)) for (const m of v.matchAll(/(\d+)/g)) numbers.add(Number(m[1]))
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(model)
  return { dates: [...dates], titles: [...titles], numbers: [...numbers] }
}
const out = (o: unknown) => TOOL_RESULT_HEAD + JSON.stringify(o)
/** 모델에게 갈 날짜 칸: YYYY-MM-DD + 앱이 계산한 label */
const withLabel = (key: string, at: string | null | undefined, now: Date): Record<string, string> => (at ? { [key]: at.slice(0, at.includes('T') ? 16 : 10), [`${key}_label`]: dateLabel(at, now) } : {})

// ── 도구 하나 실행 ───────────────────────────────────────
const RUNNING: Record<ToolName, string> = {
  find_tasks: '할 일 찾는 중…', find_events: '일정 찾는 중…', when_last: '기록 찾는 중…', find_notes: '메모 찾는 중…', find_diary: '일기 찾는 중…',
  project_info: '프로젝트 보는 중…', growth_stats: '성장 기록 보는 중…', date_calc: '날짜 계산 중…', propose_create: '만들 준비 중…', propose_update: '바꿀 준비 중…'
}
/** 부르는 중 칩 글(§3.1). 인자를 알면 더 구체적으로 */
export function runningChip(name: ToolName, args: Record<string, unknown> = {}): string {
  if (name === 'when_last' && str(args.query)) return `‘${str(args.query, 20)}’ 기록 찾는 중…`
  if (name === 'propose_create') return str(args.start) || /T/.test(str(args.due)) ? '일정 만들 준비 중…' : '할 일 만들 준비 중…'
  return RUNNING[name]
}
const FAILED: Record<ToolName, string> = {
  find_tasks: '할 일을 못 읽었어', find_events: '일정을 못 읽었어', when_last: '기록을 못 읽었어', find_notes: '메모를 못 읽었어', find_diary: '일기를 못 읽었어',
  project_info: '프로젝트를 못 읽었어', growth_stats: '성장 기록을 못 읽었어', date_calc: '날짜를 못 셌어', propose_create: '준비하지 못했어', propose_update: '준비하지 못했어'
}
export const failedRun = (name: ToolName, args: Record<string, unknown>, why = 'failed'): ToolRun => ({
  name, args, ok: false, chip: { tool: name, running: runningChip(name, args), done: FAILED[name], detail: '', failed: true }, forModel: out({ error: why }), facts: { dates: [], titles: [], numbers: [] }
})

export async function runTool(name: string, rawArgs: unknown, ctx: ExecCtx): Promise<ToolRun> {
  factYear = ctx.now.getFullYear()
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {}
  if (!isToolName(name)) return failedRun('find_tasks', args, 'unknown tool')
  if (name === 'find_diary' && !ctx.diary) return failedRun(name, args, 'diary tool is off')
  try {
    switch (name) {
      case 'find_tasks': return await findTasks(args, ctx)
      case 'find_events': return await findEvents(args, ctx)
      case 'when_last': return await whenLast(args, ctx)
      case 'find_notes': return await findNotes(args, ctx)
      case 'find_diary': return await findDiary(args, ctx)
      case 'project_info': return await projectInfo(args, ctx)
      case 'growth_stats': return await growthStats(ctx)
      case 'date_calc': return dateCalc(args, ctx)
      case 'propose_create': return await proposeCreate(args, ctx)
      case 'propose_update': return await proposeUpdate(args, ctx)
    }
  } catch {
    return failedRun(name, args)
  }
}

// find_tasks ─────────────────────────────────────────────
type TaskRowDb = { id: string; title: string; list_name: string | null; list_kind: string | null; priority: number | null; status: number; start_at: string | null; due_at: string | null; completed_at: string | null; created_at?: string | null }
async function findTasks(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const now = ctx.now, today = ymd(now)
  const status = a.status === 'completed' || a.status === 'all' ? a.status : 'open'
  let from = normDate(a.from, now), to = normDate(a.to, now)
  if (from && to && from > to) [from, to] = [to, from]
  const sort = a.sort === 'urgent' || a.sort === 'due' || a.sort === 'recent' ? a.sort : status === 'completed' ? 'recent' : 'due'
  const ws = words(str(a.query))
  const where = ['t.deleted_at IS NULL', 't.status <> 2']
  const args: unknown[] = []
  if (status === 'open') where.push('t.status = 0')
  if (status === 'completed') where.push('t.status = 1')
  const plan = "substr(COALESCE(t.due_at, t.start_at), 1, 10)"
  if (status === 'completed') {
    if (from) { where.push('t.completed_at >= ?'); args.push(dayStartIso(from)) }
    if (to) { where.push('t.completed_at < ?'); args.push(dayStartIso(plusDays(to, 1))) }
  } else {
    // 급한 순은 지난 마감도 같이(가장 급하다) — 47 ⓑ
    if (from && !(sort === 'urgent' && status === 'open')) { where.push(`${plan} >= ?`); args.push(from) }
    if (to) { where.push(`${plan} <= ?`); args.push(to) }
  }
  const listName = str(a.list, 40)
  if (listName) { where.push("(instr(lower(COALESCE(l.name, '')), lower(?)) > 0 OR (l.kind = 'inbox' AND ? IN ('기본함', 'inbox', '수집함')))"); args.push(listName, listName) }
  const k = anyWord(['t.title', "COALESCE(l.name, '')"], ws)
  where.push(k.sql); args.push(...k.args)
  const order = sort === 'recent' ? 't.completed_at DESC, t.modified_at DESC'
    : sort === 'urgent' ? `CASE WHEN ${plan} IS NULL THEN 1 ELSE 0 END, ${plan}, COALESCE(t.priority, 0) DESC, COALESCE(t.due_at, t.start_at), t.title`
      : `CASE WHEN ${plan} IS NULL THEN 1 ELSE 0 END, COALESCE(t.due_at, t.start_at), COALESCE(t.priority, 0) DESC, t.title`
  const rows = await ctx.db.getAll<TaskRowDb>(`SELECT t.id, t.title, l.name AS list_name, l.kind AS list_kind, t.priority, t.status, t.start_at, t.due_at, t.completed_at FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`, args)
  const items: TaskItem[] = rows.map((r) => ({ id: r.id, title: r.title ?? '', list: r.list_kind === 'inbox' ? '기본함' : r.list_name, priority: Number(r.priority) || 0, status: Number(r.status), start_at: r.start_at, due_at: r.due_at, completed_at: r.completed_at }))
  const scope = scopeName(from, to, now)
  const statusWord = status === 'open' ? '남은 ' : status === 'completed' ? '끝낸 ' : ''
  const what = ws.length ? `‘${ws.join(' ')}’ ` : ''
  const head = `${scope ? scope + ' ' : ''}${what}${statusWord}할 일${sort === 'urgent' ? ' · 급한 순' : ''}`.trim()
  const model: Record<string, unknown> = { ...(scope ? { range_label: scope === '이번 주' || scope === '다음 주' || scope === '지난 주' ? `${scope} ${mdw(from, now)}~${mdw(to, now)}` : scope } : {}), total: items.length }
  if (items.length > 20) model.truncated = true
  model.tasks = items.slice(0, 20).map((t) => {
    const due = t.due_at || t.start_at
    const done = localDayOf(t.completed_at)
    return {
      id: aliasFor(ctx.aliases, { id: t.id, title: t.title, kind: 'task', date: due?.slice(0, 10) ?? null }),
      title: clip(t.title, 60), ...(t.list ? { list: t.list } : {}), ...(PRI[t.priority] ? { priority: PRI[t.priority] } : {}),
      ...withLabel('due', due, now), ...(t.status === 0 && due && due.slice(0, 10) < today ? { overdue: true } : {}),
      ...(t.status === 1 && done ? { done: done, done_label: dateLabel(done, now) } : {})
    }
  })
  if (!items.length) {
    const first = await ctx.db.getAll<{ d: string | null }>('SELECT MIN(created_at) AS d FROM tasks WHERE deleted_at IS NULL').catch(() => [])
    const d = localDayOf(first[0]?.d)
    if (d) model.earliest_record_label = mdw(d, now)
  }
  const n = items.length
  const detail = [rangeDetail(from, to, now), ws.length ? `‘${ws.join(' ')}’` : '', status === 'open' ? '남은 할 일' : status === 'completed' ? '끝낸 할 일' : '모든 할 일', listName ? `리스트 ${listName}` : '', sort === 'urgent' ? '급한 순' : ''].filter(Boolean).join(' · ')
  return {
    name: 'find_tasks', args: a, ok: true,
    chip: { tool: 'find_tasks', running: RUNNING.find_tasks, done: `${scope ? scope + ' ' : ''}${statusWord}할 일 ${n}개 봤어`, detail: `찾은 조건: ${detail}\n결과 ${n}개` },
    card: { type: 'tasks', head, total: n, tasks: items.slice(0, 50), ...(sort === 'urgent' ? { note: '급한 순 = 마감이 빠른 순, 같은 날이면 우선순위 높은 순' } : {}), ...(n ? {} : { empty: model.earliest_record_label ? `꿈틀의 첫 기록 · ${model.earliest_record_label}` : '찾은 할 일이 없어요' }) },
    forModel: out(model), facts: factsOf(model, items.slice(0, 50).map((t) => t.title))
  }
}

// find_events ────────────────────────────────────────────
async function findEvents(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const now = ctx.now
  let from = normDate(a.from, now) || ymd(now), to = normDate(a.to, now) || from
  if (from > to) [from, to] = [to, from]
  if (dayGap(from, to) > 366) to = plusDays(from, 366)
  const ws = words(str(a.query))
  const k = anyWord(['title', "COALESCE(notes, '')", "COALESCE(location, '')"], ws)
  // 꿈틀에서 만든 일정(events)만 — 연결된 구글·iCloud·휴대폰 캘린더 캐시는 읽지 않는다(§8.5)
  const evs = await ctx.db.getAll<{ id: string; title: string; start_at: string; end_at: string; repeat_rule: string | null; is_all_day: number | null }>(
    `SELECT id, title, start_at, end_at, repeat_rule, is_all_day FROM events WHERE deleted_at IS NULL AND start_at IS NOT NULL AND (repeat_rule IS NOT NULL OR (substr(start_at, 1, 10) <= ? AND substr(COALESCE(end_at, start_at), 1, 10) >= ?)) AND ${k.sql} LIMIT 300`, [to, from, ...k.args])
  const items: EventItem[] = []
  for (const e of evs) for (const o of occurrences({ start_at: e.start_at, end_at: e.end_at || e.start_at, repeat_rule: e.repeat_rule }, from, to, 60)) items.push({ id: e.id, title: e.title ?? '', start: o.start, end: o.end, kind: 'event' })
  const kt = anyWord(['title'], ws)
  const timed = await ctx.db.getAll<{ id: string; title: string; start_at: string | null; due_at: string }>(
    `SELECT id, title, start_at, due_at FROM tasks WHERE deleted_at IS NULL AND status = 0 AND due_at LIKE '%T%' AND substr(COALESCE(start_at, due_at), 1, 10) <= ? AND substr(due_at, 1, 10) >= ? AND ${kt.sql} LIMIT 100`, [to, from, ...kt.args])
  for (const t of timed) items.push({ id: t.id, title: t.title ?? '', start: t.start_at || t.due_at, end: t.start_at ? t.due_at : null, kind: 'task' })
  items.sort((x, y) => x.start.localeCompare(y.start))
  const scope = scopeName(from, to, now)
  const model = {
    range_label: from === to ? dateLabel(from, now) : `${mdw(from, now)}~${mdw(to, now)}`, total: items.length,
    events: items.slice(0, 20).map((e) => ({ id: aliasFor(ctx.aliases, { id: e.id, title: e.title, kind: e.kind === 'task' ? 'task' : 'event', date: e.start.slice(0, 10) }), title: clip(e.title, 60), ...withLabel('start', e.start, now), ...(e.end && e.end.includes('T') && e.end !== e.start ? { end_label: `${Number(e.end.slice(11, 13)) < 12 ? '오전' : '오후'} ${Number(e.end.slice(11, 13)) % 12 || 12}:${e.end.slice(14, 16)}` } : {}) }))
  }
  const n = items.length
  return {
    name: 'find_events', args: a, ok: true,
    chip: { tool: 'find_events', running: RUNNING.find_events, done: `${scope} 일정 ${n}개 봤어`, detail: `찾은 조건: ${rangeDetail(from, to, now)}${ws.length ? ` · ‘${ws.join(' ')}’` : ''} · 꿈틀 일정·시각 있는 할 일\n결과 ${n}개` },
    card: { type: 'events', head: `${scope} 일정`, total: n, events: items.slice(0, 30), ...(n ? {} : { empty: '꿈틀에 만든 일정이 없어요 · 다른 앱 캘린더(구글·iCloud)는 AI가 보지 않아요' }) },
    forModel: out(model), facts: factsOf(model, items.slice(0, 30).map((e) => e.title))
  }
}

// when_last ──────────────────────────────────────────────
async function whenLast(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const now = ctx.now, today = ymd(now)
  const q = str(a.query, 30)
  const ws = words(q).slice(0, 3)
  if (!ws.length) return failedRun('when_last', a, 'empty query')
  const ask: RecallAsk = { mode: 'last', words: ws, phrase: ws.join(' '), verb: false, past: '했어' }
  const cond = ws.map(() => 'instr(lower(title), lower(?)) > 0').join(' OR ')
  // 할 일 + 꿈틀 일정만(외부 캘린더 없음 — recall.ts의 연결 캘린더 읽기는 쓰지 않는다)
  const tasks = await ctx.db.getAll<{ id: string; title: string; status: number; completed_at: string | null; start_at: string | null; due_at: string | null }>(`SELECT id, title, status, completed_at, start_at, due_at FROM tasks WHERE deleted_at IS NULL AND status <> 2 AND (${cond}) LIMIT 500`, ws)
  const events = await ctx.db.getAll<{ id: string; title: string; start_at: string | null }>(`SELECT id, title, start_at FROM events WHERE deleted_at IS NULL AND start_at IS NOT NULL AND (${cond}) LIMIT 500`, ws).catch(() => [])
  const rows: RecallRow[] = [...tasks.map((t) => ({ ...t, source: 'task' as const })), ...events.map((e) => ({ id: e.id, title: e.title, start_at: e.start_at, source: 'event' as const, open: `ev:${e.id}` }))]
  const found = recallMatches(ask, rows).map((r) => ({ r, o: occurrenceOf(r, now) })).filter((x): x is { r: RecallRow; o: { when: 'past' | 'future'; date: string } } => !!x.o)
  const past = found.filter((x) => x.o.when === 'past').sort((x, y) => (x.o.date < y.o.date ? 1 : x.o.date > y.o.date ? -1 : 0))
  const future = found.filter((x) => x.o.when === 'future').sort((x, y) => (x.o.date < y.o.date ? -1 : x.o.date > y.o.date ? 1 : 0))
  const hit = (x: { r: RecallRow; o: { date: string } }): SinceHit => ({ id: x.r.id, title: x.r.title, date: x.o.date, source: x.r.source === 'event' ? 'event' : 'task', open: x.r.open ?? x.r.id })
  const countFrom = normDate(a.from, now) || `${today.slice(0, 4)}-01-01`
  const countTo = normDate(a.to, now) && normDate(a.to, now) < today ? normDate(a.to, now) : today
  const inRange = past.filter((x) => x.o.date >= countFrom && x.o.date <= countTo)
  const dates = [...new Set(past.map((x) => x.o.date))]
  const gaps = dates.slice(0, -1).map((d, i) => dayGap(dates[i + 1], d))
  const avgGap = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : undefined
  const last = past[0] ? hit(past[0]) : undefined
  const next = future[0] ? hit(future[0]) : undefined
  const days = last ? dayGap(last.date, today) : undefined
  const model: Record<string, unknown> = { query: ws.join(' '), found: !!last, total_records: past.length }
  let first: string | null = null
  if (last) Object.assign(model, { matched_title: clip(last.title, 60), last: last.date, last_label: dateLabel(last.date, now), days_since: days, count: inRange.length, count_label: `${countTo === today ? (countFrom.slice(5) === '01-01' && countFrom.slice(0, 4) === today.slice(0, 4) ? '올해' : `${mdw(countFrom, now)}부터`) : scopeName(countFrom, countTo, now)} ${inRange.length}번`, recent_labels: dates.slice(0, 4).map((d) => mdw(d, now)), ...(avgGap !== undefined ? { avg_gap_days: avgGap } : {}) })
  else {
    const f = await ctx.db.getAll<{ d: string | null }>('SELECT MIN(created_at) AS d FROM tasks WHERE deleted_at IS NULL').catch(() => [])
    first = localDayOf(f[0]?.d)
    if (first) model.earliest_record_label = mdw(first, now)
  }
  if (next) Object.assign(model, { next_title: clip(next.title, 60), next_label: dateLabel(next.date, now) })
  const phrase = ws.join(' ')
  return {
    name: 'when_last', args: a, ok: true,
    chip: { tool: 'when_last', running: `‘${phrase}’ 기록 찾는 중…`, done: `‘${phrase}’ 기록 ${past.length}개 봤어`, detail: `찾은 조건: 제목에 ‘${phrase}’ · 완료한 할 일·지난 꿈틀 일정${a.from ? ` · ${mdw(countFrom, now)}부터 횟수` : ''}\n결과 ${past.length}개` },
    card: { type: 'since', phrase, ...(last ? { last, days } : {}), count: inRange.length, countFrom, dates: dates.slice(0, 4), ...(avgGap !== undefined ? { avgGap } : {}), ...(next ? { next } : {}), first, note: `완료한 할 일·지난 일정 제목에 ‘${phrase}’이 들어간 기록으로 셌어요${avgGap !== undefined ? ` · 간격 평균 ${avgGap}일` : ''}` },
    forModel: out(model), facts: factsOf(model, [...past.slice(0, 10).map((x) => x.r.title), ...(next ? [next.title] : [])])
  }
}

// find_notes ─────────────────────────────────────────────
async function findNotes(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const ws = words(str(a.query))
  const k = anyWord(["COALESCE(content, '')", "COALESCE(link_title, '')"], ws)
  const rows = await ctx.db.getAll<{ id: string; content: string | null; link_title: string | null; modified_at: string | null }>(`SELECT id, content, link_title, modified_at FROM notes WHERE ${k.sql} ORDER BY modified_at DESC LIMIT 50`, k.args)
  const items = rows.map((r) => { const lines = (r.content ?? '').split('\n'); const title = clip(r.link_title || lines[0] || '메모', 60); return { id: r.id, title, body: clip(r.link_title ? r.content : lines.slice(1).join(' '), 200), modified: localDayOf(r.modified_at) } })
  const model = { total: items.length, notes: items.slice(0, 10).map((n) => ({ id: aliasFor(ctx.aliases, { id: n.id, title: n.title, kind: 'note', date: n.modified }), title: n.title, ...(n.body ? { text: n.body } : {}), ...withLabel('updated', n.modified, ctx.now) })) }
  return {
    name: 'find_notes', args: a, ok: true,
    chip: { tool: 'find_notes', running: RUNNING.find_notes, done: `메모 ${items.length}개 봤어`, detail: `찾은 조건: ${ws.length ? `‘${ws.join(' ')}’` : '모든 메모'}\n결과 ${items.length}개` },
    card: { type: 'notes', head: ws.length ? `‘${ws.join(' ')}’ 메모` : '메모', total: items.length, notes: items.slice(0, 10).map(({ id, title, modified }) => ({ id, title, modified })) },
    forModel: out(model), facts: factsOf(model, items.map((n) => n.title))
  }
}

// find_diary (§8.4) ──────────────────────────────────────
/** 일기 행 조건 — 나만 보기 날은 늘 뺀다(일기 대화 MEMORY_SQL과 같은 조건). 일기 대화 원문(diary_messages)은 읽지 않는다 */
export const DIARY_WHERE = "COALESCE(private, 0) = 0 AND content IS NOT NULL AND trim(content) <> ''"
async function findDiary(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const now = ctx.now
  let from = normDate(a.from, now), to = normDate(a.to, now)
  if (from && to && from > to) [from, to] = [to, from]
  const ws = words(str(a.query))
  const where = [DIARY_WHERE], args: unknown[] = []
  if (from) { where.push('date >= ?'); args.push(from) }
  if (to) { where.push('date <= ?'); args.push(to) }
  const k = anyWord(['content'], ws)
  where.push(k.sql); args.push(...k.args)
  const rows = await ctx.db.getAll<{ date: string; mood: number | null; content: string }>(`SELECT date, mood, content FROM diary_entries WHERE ${where.join(' AND ')} ORDER BY date DESC LIMIT 20`, args)
  const model = { total: rows.length, days: rows.slice(0, 7).map((r) => ({ ...withLabel('date', r.date, now), text: clip(r.content, 200) })) }
  return {
    name: 'find_diary', args: a, ok: true,
    chip: { tool: 'find_diary', running: RUNNING.find_diary, done: `일기 ${rows.length}일 봤어`, detail: `찾은 조건: ${[rangeDetail(from, to, now), ws.length ? `‘${ws.join(' ')}’` : ''].filter(Boolean).join(' · ') || '최근 일기'} · 나만 보기 날 빼고\n결과 ${rows.length}일` },
    card: { type: 'diary', head: '일기', total: rows.length, days: rows.slice(0, 7).map((r) => ({ date: r.date, mood: r.mood, snippet: clip(r.content, 80) })) },
    forModel: out(model), facts: factsOf(model)
  }
}

// project_info ───────────────────────────────────────────
async function projectInfo(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const today = ymd(ctx.now)
  const [tasks, tags, links, lists, folders, deadlines] = await Promise.all([
    ctx.db.getAll<PTaskRow>('SELECT id, title, list_id, parent_id, status, priority, due_at, start_at, completed_at, created_at FROM tasks WHERE deleted_at IS NULL'),
    ctx.db.getAll('SELECT id, name, kind, aliases, source, home_type, home_id, topic_id FROM tags WHERE kind = \'project\''),
    ctx.db.getAll('SELECT id, task_id, tag_id, source, state FROM task_tags'),
    ctx.db.getAll('SELECT id, name, emoji, folder_id, kind FROM lists WHERE archived_at IS NULL'),
    ctx.db.getAll('SELECT id, name FROM folders'),
    ctx.db.getAll<{ tag_id: string; task_id: string }>("SELECT from_id AS tag_id, to_id AS task_id FROM relations WHERE field = 'deadline' AND from_type = 'tag'")
  ])
  const plan = buildPlanView({ tasks, tags: tags as never, links: links as never, lists: lists as never, folders, seq: [], pstore: { dismissed: [], confirmed: {} }, today, deadlines })
  const name = str(a.name, 40)
  const ws = words(name)
  let projects = plan.projects.filter((p) => !p.finished && !p.archived)
  if (ws.length) {
    const hit = plan.projects.filter((p) => ws.some((w) => p.title.toLowerCase().includes(w.toLowerCase()) || p.short.toLowerCase().includes(w.toLowerCase())))
    projects = hit.length ? hit : []
  }
  const list = projects.slice(0, 5).map((p) => ({ id: p.tag.id, name: p.title, total: p.members.length, done: p.done, deadline: p.deadline?.day ?? null, next: p.next.slice(0, 3).map((t) => ({ id: t.id, title: t.title, due_at: t.due_at ?? null })) }))
  const model = {
    total: projects.length,
    projects: list.map((p) => ({ id: aliasFor(ctx.aliases, { id: p.id, title: p.name, kind: 'project' }), name: p.name, tasks_total: p.total, tasks_done: p.done, ...withLabel('deadline', p.deadline, ctx.now), next: p.next.map((t) => ({ id: aliasFor(ctx.aliases, { id: t.id, title: t.title, kind: 'task', date: t.due_at?.slice(0, 10) }), title: clip(t.title, 60), ...withLabel('due', t.due_at, ctx.now) })) }))
  }
  return {
    name: 'project_info', args: a, ok: true,
    chip: { tool: 'project_info', running: RUNNING.project_info, done: list.length === 1 ? `‘${list[0].name}’ 봤어` : `프로젝트 ${list.length}개 봤어`, detail: `찾은 조건: ${ws.length ? `이름에 ‘${ws.join(' ')}’` : '진행 중 프로젝트'}\n결과 ${list.length}개` },
    card: { type: 'project', projects: list },
    forModel: out(model), facts: factsOf(model, list.flatMap((p) => [p.name, ...p.next.map((t) => t.title)]))
  }
}

// growth_stats ───────────────────────────────────────────
async function growthStats(ctx: ExecCtx): Promise<ToolRun> {
  const [chars, xp, week] = await Promise.all([
    ctx.db.getAll<{ name: string | null }>('SELECT name FROM characters ORDER BY created_at LIMIT 1'),
    ctx.db.getAll<{ amount: number; created_at: string }>('SELECT amount, created_at FROM xp_events'),
    ctx.db.getAll<{ n: number }>('SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND status = 1 AND completed_at >= ?', [dayStartIso(mondayOf(ctx.now))])
  ])
  const p = progressFromEvents(xp.map((x) => ({ amount: Number(x.amount) || 0, created_at: x.created_at ?? '' })))
  const stageName = STAGES.find((s) => s.stage === p.stage)?.name ?? ''
  const model = { name: chars[0]?.name ?? '', level: p.level, stage: stageName, xp_into_level: p.into, xp_to_next_level: Math.max(0, p.toNext - p.into), done_this_week: Number(week[0]?.n) || 0 }
  return {
    name: 'growth_stats', args: {}, ok: true,
    chip: { tool: 'growth_stats', running: RUNNING.growth_stats, done: '성장 기록 봤어', detail: `레벨·XP·이번 주 완료 수` },
    card: { type: 'growth', name: model.name, level: p.level, stageName, into: p.into, toNext: p.toNext, weekDone: model.done_this_week },
    forModel: out(model), facts: factsOf(model)
  }
}

// date_calc ──────────────────────────────────────────────
function dateCalc(a: Record<string, unknown>, ctx: ExecCtx): ToolRun {
  const now = ctx.now
  const A = normDate(a.a, now) || ymd(now)
  let model: Record<string, unknown>, done: string
  if (a.op === 'days_between') {
    const B = normDate(a.b, now) || ymd(now)
    const days = dayGap(A, B)
    model = { a_label: mdw(A, now), b_label: mdw(B, now), days }
    done = `${mdw(A, now)}→${mdw(B, now)} = ${days}일`
  } else if (a.op === 'add_days') {
    const n = Math.max(-3650, Math.min(3650, Math.trunc(Number(a.n) || 0)))
    const d = plusDays(A, n)
    model = { date: d, date_label: dateLabel(d, now) }
    done = `${mdw(A, now)} ${n >= 0 ? '+' : ''}${n}일 = ${mdw(d, now)}`
  } else {
    model = { date: A, date_label: dateLabel(A, now), weekday: weekdayOf(A) }
    done = dateLabel(A, now)
  }
  return { name: 'date_calc', args: a, ok: true, chip: { tool: 'date_calc', running: RUNNING.date_calc, done, detail: '' }, forModel: out(model), facts: factsOf(model) }
}

// propose_* (확인 카드만, §6) ─────────────────────────────
const RRULE = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=[1-9]\d?)?(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?$/
let keySeq = 0
const nextKey = (ctx: ExecCtx) => ctx.newKey?.() ?? `c${Date.now().toString(36)}${(keySeq++).toString(36)}`
export async function listsOf(db: AssistantDb): Promise<ListLite[]> {
  return db.getAll<ListLite>("SELECT id, name, kind FROM lists WHERE archived_at IS NULL ORDER BY CASE WHEN kind = 'inbox' THEN 0 ELSE 1 END, sort_order, created_at")
}
/** 리스트 이름 → 리스트(없으면 기본함). 기본함이 없으면 id '' — 넣을 때 앱이 만든다(02 §14.1) */
export function pickList(lists: ListLite[], name: string): { id: string; name: string } {
  const n = name.trim().toLowerCase()
  const hit = n ? lists.find((l) => l.kind !== 'inbox' && l.name.toLowerCase() === n) ?? lists.find((l) => l.kind !== 'inbox' && l.name.toLowerCase().includes(n)) : undefined
  if (hit) return { id: hit.id, name: hit.name }
  const inbox = lists.find((l) => l.kind === 'inbox')
  return { id: inbox?.id ?? '', name: '기본함' }
}
/** 확인 카드(만들기) — 앱 길잡이와 propose_create가 같이 쓴다. 값이 틀리면 null(되묻기) */
export function createCard(o: { title: string; start?: string; due?: string; list?: { id: string; name: string }; repeat?: string; said?: string; durationMin?: number; assumedPm?: boolean; basis?: string; key: string }): ConfirmCard | null {
  const title = o.title.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!title) return null
  let start = o.start ?? '', due = o.due ?? ''
  if (start && !due) { due = start; start = '' }
  if (start && (start.length !== due.length || start >= due)) start = ''
  const repeat = o.repeat && RRULE.test(o.repeat) && due ? o.repeat : ''
  const length = due.includes('T') ? (start ? durationText(start, due) : '시각만 (길이 말 안 해서 안 붙였어요)') : undefined
  return {
    type: 'confirm', key: o.key, op: 'create', title, start, due, listId: o.list?.id ?? '', listName: o.list?.name ?? '기본함', repeat,
    ...(o.said ? { said: o.said } : {}), ...(length ? { length } : {}), ...(o.assumedPm ? { assumed: '오전·오후를 안 말해서 오후로 읽었어요' } : {}), ...(o.basis ? { basis: o.basis } : {}),
    state: 'pending'
  }
}
function durationText(start: string, end: string) {
  const min = Math.round((new Date(`${end}:00`).getTime() - new Date(`${start}:00`).getTime()) / 60000)
  const h = Math.floor(min / 60), m = min % 60
  return `${h ? `${h}시간` : ''}${h && m ? ' ' : ''}${m ? `${m}분` : ''}`
}
async function proposeCreate(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const now = ctx.now
  const lists = await listsOf(ctx.db)
  const due = normAt(a.due, now), start = normAt(a.start, now)
  const card = createCard({ title: str(a.title, 200), start: start.includes('T') ? start : '', due: due || start, list: pickList(lists, str(a.list, 40)), repeat: str(a.repeat, 80), key: nextKey(ctx) })
  if (!card) return failedRun('propose_create', a, 'title required')
  const model = { pending: true, note: '확인 카드를 띄웠어. 사용자가 넣기를 눌러야 저장돼', title: card.title, ...withLabel('when', card.start || card.due, now), list: card.listName }
  return { name: 'propose_create', args: a, ok: true, chip: { tool: 'propose_create', running: runningChip('propose_create', a), done: card.due.includes('T') ? '일정 하나 준비했어' : '할 일 하나 준비했어', detail: '' }, card, forModel: out(model), facts: factsOf(model, [card.title]) }
}
/** 확인 카드(완료·옮기기·지우기) — 길잡이와 propose_update가 같이 쓴다 */
export function updateCard(op: Exclude<ConfirmOp, 'create'>, targets: { id: string; title: string; start_at: string | null; due_at: string | null }[], key: string, moveTo?: string, said?: string): ConfirmCard | null {
  if (!targets.length || (op === 'move' && !moveTo)) return null
  const first = targets[0]
  return { type: 'confirm', key, op, title: first.title, start: first.start_at ?? '', due: first.due_at ?? '', listId: '', listName: '', repeat: '', targets: targets.slice(0, 5).map((t, i) => ({ ...t, picked: targets.length === 1 || i === 0 })), ...(moveTo ? { moveTo } : {}), ...(said ? { said } : {}), state: 'pending' }
}
async function proposeUpdate(a: Record<string, unknown>, ctx: ExecCtx): Promise<ToolRun> {
  const alias = str(a.id, 60)
  const id = ctx.aliases[alias]?.id ?? alias
  const op = a.action === 'complete' || a.action === 'move' || a.action === 'delete' ? a.action : null
  const row = (await ctx.db.getAll<{ id: string; title: string; start_at: string | null; due_at: string | null }>('SELECT id, title, start_at, due_at FROM tasks WHERE id = ? AND deleted_at IS NULL AND status = 0', [id]))[0]
  const moveTo = op === 'move' ? normDate(a.due, ctx.now) : undefined
  const card = op && row ? updateCard(op, [row], nextKey(ctx), moveTo) : null
  if (!card) return failedRun('propose_update', a, row ? 'bad action or date' : 'task not found')
  const model = { pending: true, note: '확인 카드를 띄웠어. 사용자가 눌러야 바뀌어', title: row!.title, action: op, ...(moveTo ? withLabel('to', moveTo, ctx.now) : {}) }
  return { name: 'propose_update', args: a, ok: true, chip: { tool: 'propose_update', running: RUNNING.propose_update, done: '하나 바꿀 준비했어', detail: '' }, card, forModel: out(model), facts: factsOf(model, [row!.title]) }
}

// ── 쓰기(확인 카드 넣기 뒤) — 공용 SQL. 완료는 각 앱의 완료(21, XP 포함)를 쓴다 ──
export type Stmt = { sql: string; params: unknown[] }
/** 옮기기: 길이 유지(시작이 있으면 같이 민다), 시각은 그대로 — 02 날짜 바꾸기와 같은 쓰기 */
export function moveStmts(rows: { id: string; start_at: string | null; due_at: string | null }[], to: string, stamp: string): Stmt[] {
  return rows.map((r) => {
    const base = (r.due_at || r.start_at || to).slice(0, 10)
    const shift = dayGap(base, to)
    const mv = (at: string | null) => (at ? plusDays(at.slice(0, 10), shift) + at.slice(10) : null)
    return { sql: 'UPDATE tasks SET start_at = ?, due_at = ?, modified_at = ? WHERE id = ? AND deleted_at IS NULL', params: [mv(r.start_at), r.due_at ? mv(r.due_at) : to, stamp, r.id] }
  })
}
export const deleteStmts = (ids: string[], stamp: string): Stmt[] => ids.map((id) => ({ sql: 'UPDATE tasks SET deleted_at = ?, modified_at = ? WHERE id = ? AND deleted_at IS NULL', params: [stamp, stamp, id] }))
/** 되돌리기(13 규칙): 넣은/바꾼 직후와 modified_at이 같을 때만. 다르면 null(= '등록 뒤에 바뀐 항목은 되돌릴 수 없어요') */
export function undoStmts(card: ConfirmCard, current: { id: string; modified_at: string | null; status: number; deleted_at: string | null }[], stamp: string): Stmt[] | null {
  const s = card.saved
  if (!s) return null
  const cur = new Map(current.map((c) => [c.id, c]))
  if (s.ids.some((id) => cur.get(id)?.modified_at !== s.stamp)) return null
  if (card.op === 'create') return s.ids.some((id) => cur.get(id)!.status !== 0 || cur.get(id)!.deleted_at) ? null : s.ids.map((id) => ({ sql: 'UPDATE tasks SET deleted_at = ?, modified_at = ? WHERE id = ? AND modified_at = ? AND status = 0', params: [stamp, stamp, id, s.stamp] }))
  if (card.op === 'delete') return s.ids.map((id) => ({ sql: 'UPDATE tasks SET deleted_at = NULL, modified_at = ? WHERE id = ? AND modified_at = ?', params: [stamp, id, s.stamp] }))
  if (card.op === 'move') return (s.prev ?? []).map((p) => ({ sql: 'UPDATE tasks SET start_at = ?, due_at = ?, modified_at = ? WHERE id = ? AND modified_at = ?', params: [p.start_at, p.due_at, stamp, p.id, s.stamp] }))
  return null // 완료 되돌리기는 각 앱의 완료 취소(XP 되돌림)로
}
/** 넣은 뒤 캐릭터 한 줄(§5.3 — 앱이 붙임): '넣어 뒀어. 토요일 오후 3:00이야.' */
export function savedLine(card: ConfirmCard, now: Date): string {
  if (card.op === 'complete') return '완료로 바꿨어. 수고했어!'
  if (card.op === 'delete') return '지웠어. 되돌리기도 돼.'
  if (card.op === 'move') return `${card.moveTo ? `${whenLine(card.moveTo, now)}로 옮겼어.` : '옮겼어.'}`
  const at = card.start || card.due
  if (!at) return '넣어 뒀어.'
  const gap = dayGap(ymd(now), at.slice(0, 10))
  const day = gap === 0 ? '오늘' : gap === 1 ? '내일' : gap === 2 ? '모레' : gap > 2 && gap < 7 ? `${weekdayOf(at)}요일` : `${Number(at.slice(5, 7))}월 ${Number(at.slice(8, 10))}일`
  const time = at.includes('T') ? ` ${Number(at.slice(11, 13)) < 12 ? '오전' : '오후'} ${Number(at.slice(11, 13)) % 12 || 12}:${at.slice(14, 16)}` : ''
  const w = `${day}${time}`
  return `넣어 뒀어. ${w}${/[0-9]$/.test(w) ? '이야' : /[가-힣]$/.test(w) && ((w.charCodeAt(w.length - 1) - 0xac00) % 28) ? '이야' : '야'}.`
}
