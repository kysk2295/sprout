// 19 밀린 일 정리 — 나이별 묶음 · 같은 일 묶기 · 반복 제안 · 되돌리기 스냅숏 · 오늘 화면 접기 · AI 꼬리표.
// 위쪽은 화면·DB에 기대지 않는 순수 함수(시험: tests/overdue.test.ts), 아래쪽은 로컬 DB에 쓰는 정리 동작.
import { addDays, datePart, daysBetween, hasTime, parseRule, ruleSummary, RR_DAY_CODES } from '@sprout/schema/time'
import { descendantsOf, moveSpanToDate, nextOccurrenceOnOrAfter, planCompleteNoXp } from '@sprout/schema/taskCore'
import { getDb, type Stmt } from './db'
import { now, run, update } from './mutations'

// ── 숫자 [임시] (19 §3·§4) ──
export const OVERDUE = {
  /** 만료가 이보다 많으면 만료됨 묶음 위에 정리 카드 */
  cardMin: 20,
  /** 카드 "나중에" = 7일 숨김 */
  cardSnoozeDays: 7,
  /** 3달 넘음 */
  oldDays: 90,
  /** 1달 이내 = 하나씩 */
  recentDays: 30,
  /** 같은 제목이 이 횟수 이상 만료면 같은 일 묶기 */
  dupMin: 3,
  /** 오늘 화면: 이보다 오래된 만료는 접는다 */
  foldDays: 7,
  /** 자동 규칙: 만료 후 이 일수가 지나면 날짜 빼기 */
  autoDays: 30,
  /** 모두 되돌리기 유효 시간 */
  undoHours: 24
}

/** 정리에 쓰는 할 일 모양(목록 조회의 일부 열) */
export interface OTask {
  id: string
  title: string
  parent_id?: string | null
  list_id?: string | null
  list_name?: string | null
  start_at?: string | null
  due_at: string | null
  is_all_day?: number | null
  repeat_rule?: string | null
  priority?: number | null
}

/** 만료됨(03 §4·lib/dates timeGroup과 같은 규칙): 끝 날짜 < 오늘. 시각은 보지 않는다(floating 저장, 03 §9) */
export const isOverdue = (t: Pick<OTask, 'due_at'>, today: string) => !!t.due_at && datePart(t.due_at) < today
/** 만료된 지 며칠(어제 = 1) */
export const overdueDays = (t: Pick<OTask, 'due_at'>, today: string) => (t.due_at ? daysBetween(datePart(t.due_at), today) : 0)
/** 지난 일정 = 시각이 있는 만료(미팅·병원). 종일·날짜만 있는 할 일은 아니다 */
export const isPastEvent = (t: Pick<OTask, 'due_at' | 'start_at' | 'is_all_day'>, today: string) =>
  isOverdue(t, today) && hasTime(t.start_at ?? t.due_at) && t.is_all_day !== 1

/**
 * 같은 일 판정용 제목: 전각→반각, 소문자, 공백·문장부호·기호를 뺀다.
 * 숫자는 남긴다 — "과제 3"과 "과제 4"는 차례가 있는 서로 다른 일일 때가 많다(번호를 떼면 오래된 일이 같은 일로 잘못 묶였다).
 */
export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

export type BucketId = 'old' | 'mid' | 'events'
export type BucketAction = 'wontdo' | 'nodate' | 'done' | 'trash' | 'one' | 'leave'
export const BUCKET_DEFAULT: Record<BucketId, BucketAction> = { old: 'wontdo', mid: 'nodate', events: 'done' }
export const BUCKET_CHOICES: Record<BucketId, BucketAction[]> = {
  old: ['wontdo', 'nodate', 'trash', 'one'],
  mid: ['nodate', 'wontdo', 'one'],
  events: ['done', 'wontdo', 'one']
}
export interface DupGroup { key: string; title: string; tasks: OTask[] }
export interface OverduePlan {
  total: number
  buckets: Record<BucketId, OTask[]>
  dups: DupGroup[]
  /** 1달 이내(묶음·같은 일에 안 든 것) — ③ 하나씩 */
  recent: OTask[]
}

/**
 * 만료 할 일을 단계별로 나눈다(19 §3.2). 우선순위: 같은 일(②) > 지난 일정 > 나이.
 * 같은 일은 반복으로 바꿀 수 있어야 하므로 ①에서 빼 ②로 보낸다.
 * 부모가 같이 만료면 하위는 부모와 함께 처리되므로 따로 세지 않는다.
 */
export function planOverdue(tasks: OTask[], today: string): OverduePlan {
  const over = tasks.filter((t) => isOverdue(t, today))
  const ids = new Set(over.map((t) => t.id))
  const top = over.filter((t) => !t.parent_id || !ids.has(t.parent_id))
  const byKey = new Map<string, OTask[]>()
  for (const t of top) {
    const k = normalizeTitle(t.title)
    if (!k) continue
    byKey.set(k, [...(byKey.get(k) ?? []), t])
  }
  const dups: DupGroup[] = [...byKey.entries()]
    .filter(([, ts]) => ts.length >= OVERDUE.dupMin)
    .map(([key, ts]) => {
      const sorted = [...ts].sort((a, b) => (a.due_at! < b.due_at! ? 1 : -1)) // 최근 것 먼저
      return { key, title: sorted[0].title, tasks: sorted }
    })
    .sort((a, b) => b.tasks.length - a.tasks.length || a.title.localeCompare(b.title))
  const inDup = new Set(dups.flatMap((g) => g.tasks.map((t) => t.id)))
  const buckets: Record<BucketId, OTask[]> = { old: [], mid: [], events: [] }
  const recent: OTask[] = []
  const byOldest = [...top].sort((a, b) => (a.due_at! < b.due_at! ? -1 : 1))
  for (const t of byOldest) {
    if (inDup.has(t.id)) continue
    const age = overdueDays(t, today)
    if (isPastEvent(t, today)) buckets.events.push(t)
    else if (age > OVERDUE.oldDays) buckets.old.push(t)
    else if (age > OVERDUE.recentDays) buckets.mid.push(t)
    else recent.push(t)
  }
  recent.reverse() // 하나씩은 최근 것부터
  return { total: top.length, buckets, dups, recent }
}

/** 오늘 화면 만료 접기(19 §4): 7일보다 오래된 만료는 접는다 */
export const isFolded = (t: Pick<OTask, 'due_at'>, today: string) => isOverdue(t, today) && overdueDays(t, today) > OVERDUE.foldDays

/** 이번 주 금요일(월요일 시작 주). 오늘이 토·일이면 다음 주 금요일 */
export function thisFriday(today: string): string {
  const wd = new Date(`${today}T00:00`).getDay() // 0 일 … 5 금 6 토
  const delta = wd <= 5 ? 5 - wd : 6
  return addDays(today, wd === 0 ? 5 : delta)
}

// ── 반복 제안(② 같은 일 → 반복으로 바꾸기) ──
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
export interface RepeatSuggestion { rule: string; label: string }
/**
 * 만료 날짜들에서 반복 규칙을 추정한다. 같은 요일·7일 배수 간격 → 매주(n주마다) 그 요일,
 * 평일 여러 요일 → 매주 그 요일들, 같은 날짜(일) → 매월, 일정 간격 → n일마다, 그 밖에는 가장 흔한 요일로 매주.
 */
export function suggestRepeat(dates: string[]): RepeatSuggestion | null {
  const ds = [...new Set(dates.map(datePart))].sort()
  if (ds.length < 2) return null
  const wd = (d: string) => new Date(`${d}T00:00`).getDay()
  const code = (w: number) => RR_DAY_CODES[(w + 6) % 7]
  const gaps = ds.slice(1).map((d, i) => daysBetween(ds[i], d))
  const g = gaps.reduce(gcd)
  const anchor = ds[ds.length - 1]
  const make = (rule: string) => ({ rule, label: ruleSummary(parseRule(rule), anchor) })
  const days = new Set(ds.map(wd))
  if (days.size === 1 && g % 7 === 0) {
    const n = Math.min(4, Math.max(1, g / 7))
    return make(`FREQ=WEEKLY${n > 1 ? `;INTERVAL=${n}` : ''};BYDAY=${code(wd(anchor))}`)
  }
  const mdays = new Set(ds.map((d) => Number(d.slice(8, 10))))
  if (mdays.size === 1 && gaps.every((x) => x >= 28)) return make(`FREQ=MONTHLY;BYMONTHDAY=${Number(anchor.slice(8, 10))}`)
  if (gaps.every((x) => x === gaps[0]) && gaps[0] < 7) return make(gaps[0] === 1 ? 'FREQ=DAILY' : `FREQ=DAILY;INTERVAL=${gaps[0]}`)
  if (days.size <= 5 && Math.max(...gaps) <= 7) {
    const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(code)
    return make(`FREQ=WEEKLY;BYDAY=${sorted.join(',')}`)
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (avg >= 25) return make(`FREQ=MONTHLY;BYMONTHDAY=${Number(anchor.slice(8, 10))}`)
  const counts = new Map<number, number>()
  ds.forEach((d) => counts.set(wd(d), (counts.get(wd(d)) ?? 0) + 1))
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
  return make(`FREQ=WEEKLY;BYDAY=${code(top)}`)
}

// ── 되돌리기 스냅숏(19 §3.3: 기기에, 마지막 정리 1회, 24시간) ──
export const SNAP_FIELDS = ['status', 'due_at', 'start_at', 'is_all_day', 'repeat_rule', 'repeat_from', 'completed_at', 'deleted_at'] as const
export type SnapRow = { id: string } & Partial<Record<(typeof SNAP_FIELDS)[number], unknown>>
export interface Snapshot { at: string; rows: SnapRow[]; session?: string }
/** 같은 정리 안에서 여러 번 건드린 행은 처음 값만 남긴다 */
export function mergeSnapshot(prev: Snapshot | null, rows: SnapRow[], at: string): Snapshot {
  const base = prev ?? { at, rows: [] }
  const seen = new Set(base.rows.map((r) => r.id))
  return { ...base, rows: [...base.rows, ...rows.filter((r) => !seen.has(r.id))] }
}
export const snapshotValid = (s: Snapshot | null, nowIso: string) =>
  !!s && s.rows.length > 0 && new Date(nowIso).getTime() - new Date(s.at).getTime() < OVERDUE.undoHours * 3600_000
/** 스냅숏을 되돌리는 패치 목록 */
export const restorePatches = (s: Snapshot) => s.rows.map(({ id, ...rest }) => ({ id, patch: rest }))

// ── 정리 결과 집계(끝 화면 요약) ──
export type Outcome = 'today' | 'week' | 'date' | 'nodate' | 'wontdo' | 'done' | 'trash' | 'repeat' | 'kept'
export type Tally = Partial<Record<Outcome, number>>
export const addTally = (t: Tally, o: Outcome, n = 1): Tally => ({ ...t, [o]: (t[o] ?? 0) + n })
export const OUTCOME_LABEL: Record<Outcome, string> = {
  today: '오늘', week: '이번 주', date: '다른 날', nodate: '날짜 없음', wontdo: '보관(하지 않음)', done: '완료', trash: '휴지통', repeat: '반복으로', kept: '그대로'
}
export const tallyTotal = (t: Tally) => Object.values(t).reduce((a, b) => a + (b ?? 0), 0)

/** 끝 화면 캐릭터 한마디(19 §6) — 벌하지 않는 말투 */
export function characterLine(t: Tally, left: number): string {
  const moved = tallyTotal(t) - (t.kept ?? 0)
  if (moved === 0) return '괜찮아, 다음에 같이 정리하자.'
  if (left === 0) return '방이 훨씬 넓어졌다! 이제 오늘 할 일만 보여.'
  if (moved >= 50) return '와, 한꺼번에 이만큼이나! 숨쉬기 편해졌어.'
  return '조금씩 정리하니까 좋다. 남은 건 천천히 하자.'
}

// ── AI 꼬리표(19 §5): 서버 프록시 /ai/classify, 엄격한 JSON. 실패하면 꼬리표 없이 ──
export type AiTag = 'event' | 'repeat' | 'week'
export const AI_TAG_LABEL: Record<AiTag, string> = { event: '지난 일정 같아요', repeat: '반복으로 바꿀까요?', week: '이번 주에 할 만해요' }
export function aiTagSchema(n: number) {
  return {
    type: 'object',
    properties: { items: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer', minimum: 0, maximum: Math.max(0, n - 1) }, tag: { type: 'string', enum: ['event', 'repeat', 'week', 'none'] } }, required: ['i', 'tag'], additionalProperties: false } } },
    required: ['items'], additionalProperties: false
  }
}
export function aiTagPrompt(items: OTask[], today: string): string {
  const lines = items.map((t, i) => `${i}\t${t.title.replace(/\s+/g, ' ').slice(0, 80)}\t${t.list_name ?? '기본함'}\t${t.due_at ? datePart(t.due_at) : ''}`)
  return [
    `오늘은 ${today}. 아래는 마감이 지난 할 일 목록이다(번호\t제목\t리스트\t마감일).`,
    '각 줄에 꼬리표 하나를 고른다: event = 정해진 날·시각의 약속(미팅, 병원, 수업, 면접처럼 날이 지나면 다시 할 수 없는 것 — 혼자 하는 일반 할 일은 event가 아니다), repeat = 주기적으로 반복하는 습관·루틴(운동, 공부, 청소), week = 이번 주 안에 하기 좋은 작은 일, none = 해당 없음.',
    '확실하지 않으면 none. 설명 없이 JSON만: {"items":[{"i":0,"tag":"none"}]}',
    '',
    ...lines
  ].join('\n')
}
/** 모양이 틀리면 빈 결과(꼬리표 없음) */
export function parseAiTags(raw: string, items: OTask[]): Record<string, AiTag> {
  const out: Record<string, AiTag> = {}
  try {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
    const data = JSON.parse(a >= 0 && b > a ? raw.slice(a, b + 1) : raw) as { items?: { i?: unknown; tag?: unknown }[] }
    for (const x of Array.isArray(data.items) ? data.items : []) {
      const i = typeof x.i === 'number' ? x.i : NaN
      if (!Number.isInteger(i) || !items[i]) continue
      if (x.tag === 'event' || x.tag === 'repeat' || x.tag === 'week') out[items[i].id] = x.tag
    }
  } catch { /* 꼬리표 없이 */ }
  return out
}

// ── 기기 저장(localStorage) ──
export const KEYS = {
  fold: 'sprout.overdue.foldToday', // '0'이면 끔(기본 켬)
  auto: 'sprout.overdue.autoNoDate', // '1'이면 켬(기본 꺼짐)
  autoRan: 'sprout.overdue.autoRanDay',
  cardHidden: 'sprout.overdue.cardHiddenUntil',
  band: 'sprout.overdue.yesterdayBandDay',
  snapshot: 'sprout.overdue.snapshot',
  open: 'sprout.overdue.open', // 설정 창 → 메인 창 "정리 열기" 신호
  session: 'sprout.overdue.session'
}
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* 저장 못 해도 동작 */ } }
}
export const readFlag = (k: string, def: boolean) => { const v = ls.get(k); return v === null ? def : v === '1' }
export const writeFlag = (k: string, on: boolean) => ls.set(k, on ? '1' : '0')
export const readSnapshot = (): Snapshot | null => { try { return JSON.parse(ls.get(KEYS.snapshot) ?? 'null') as Snapshot | null } catch { return null } }
const writeSnapshot = (s: Snapshot | null) => ls.set(KEYS.snapshot, s ? JSON.stringify(s) : null)
export const cardHidden = (today: string) => (ls.get(KEYS.cardHidden) ?? '') > today
export const hideCard = (today: string) => ls.set(KEYS.cardHidden, addDays(today, OVERDUE.cardSnoozeDays))
export const bandDismissed = (today: string) => ls.get(KEYS.band) === today
export const dismissBand = (today: string) => ls.set(KEYS.band, today)
export { ls as overdueStorage }

// ── DB 동작 ──
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
/** 열려 있는(미완료·휴지통 아님·보관 리스트 아님) 만료 할 일 전부 */
export async function loadOverdue(today: string): Promise<OTask[]> {
  const db = await getDb()
  return db.getAll<OTask>(
    `SELECT t.id, t.title, t.parent_id, t.list_id, CASE WHEN l.kind = 'inbox' THEN '기본함' ELSE l.name END AS list_name,
            t.start_at, t.due_at, t.is_all_day, t.repeat_rule, t.priority
       FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
      WHERE t.status = 0 AND t.deleted_at IS NULL AND l.archived_at IS NULL
        AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) < ?
      ORDER BY t.due_at`, [today])
}

export type CleanupOp =
  | { kind: 'wontdo' | 'nodate' | 'done' | 'trash' }
  | { kind: 'date'; date: string }
  | { kind: 'repeat'; rule: string }

/** 이번 정리의 되돌리기 스냅숏에 (처음 건드리는) 행을 더한다 */
async function remember(ids: string[]) {
  if (!ids.length) return
  const db = await getDb()
  const rows = await db.getAll<SnapRow>(`SELECT id, ${SNAP_FIELDS.join(', ')} FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
  const prev = readSnapshot()
  const at = now()
  // 24시간 지난 스냅숏은 버리고 새로 시작
  const session = ls.get(KEYS.session) ?? ''
  const same = snapshotValid(prev, at) && prev!.session === session
  writeSnapshot({ ...mergeSnapshot(same ? prev : null, rows, at), session })
}
/** 정리 대화 상자를 열 때 새 정리를 시작한다 — 이 정리에서 처음 무언가 바꿀 때 지난 스냅숏을 버린다(마지막 1회분만) */
// 세션 id는 기기에 둔다(화면이 다시 그려지거나 모듈이 다시 읽혀도 같은 정리로 이어지게)
export function beginCleanupSession(id = `${now()}-${Math.random().toString(36).slice(2, 8)}`) { ls.set(KEYS.session, id) }

/**
 * 정리 동작 하나를 여러 할 일에 적용한다. XP·성장 반응 없음(19 §3.3). 먼저 스냅숏에 남긴다.
 * today는 'YYYY-MM-DD'(로컬).
 */
export async function applyCleanup(ids: string[], op: CleanupOp, today: string): Promise<void> {
  if (!ids.length) return
  const db = await getDb()
  const at = now()
  const touched = op.kind === 'done' || op.kind === 'trash' ? await descendantsOf(db, ids) : ids
  await remember(touched)
  let stmts: Stmt[] = []
  if (op.kind === 'wontdo') stmts = ids.map((id) => update('tasks', id, { status: 2, completed_at: at }))
  else if (op.kind === 'nodate') stmts = ids.map((id) => update('tasks', id, { start_at: null, due_at: null, is_all_day: 1, repeat_rule: null, repeat_from: null }))
  else if (op.kind === 'trash') stmts = touched.map((id) => update('tasks', id, { deleted_at: at }))
  else if (op.kind === 'done') stmts = (await planCompleteNoXp(db, ids, { today, now: () => at })).stmts
  else {
    const rows = await db.getAll<{ id: string; start_at: string | null; due_at: string | null; repeat_rule: string | null }>(`SELECT id, start_at, due_at, repeat_rule FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
    for (const r of rows) {
      if (op.kind === 'date') stmts.push(update('tasks', r.id, moveSpanToDate(r, op.date)))
      else if (op.kind === 'repeat') {
        // 반복으로 바꾸기: 마지막 날짜에서 규칙대로, 오늘 이후 첫 회차로(시각 유지)
        const from = r.due_at ? datePart(r.start_at ?? r.due_at) : today
        const next = nextOccurrenceOnOrAfter(op.rule, from, today) ?? today
        stmts.push(update('tasks', r.id, { ...moveSpanToDate(r, next), repeat_rule: op.rule, repeat_from: 'due' }))
      }
    }
  }
  await run(...stmts)
}

/** 이번 정리에서 이 행들만 정리 전 값으로(③에서 ←로 돌아가 다시 정할 때). 스냅숏은 그대로 둔다 */
export async function resetToSnapshot(ids: string[]): Promise<void> {
  const s = readSnapshot()
  if (!s) return
  const want = new Set(ids)
  await run(...restorePatches(s).filter((p) => want.has(p.id)).map(({ id, patch }) => update('tasks', id, patch)))
}

/** 이번 정리 전체를 한 번에 되돌린다. 되돌린 행 수(없으면 0) */
export async function undoCleanup(): Promise<number> {
  const s = readSnapshot()
  if (!snapshotValid(s, now())) return 0
  await run(...restorePatches(s!).map(({ id, patch }) => update('tasks', id, patch)))
  writeSnapshot(null)
  return s!.rows.length
}

/** 자동 규칙(19 §4, 기본 꺼짐): 만료 30일이 지난 할 일의 날짜를 뺀다. 하루 한 번. 뺀 개수 */
export async function runAutoNoDate(today: string): Promise<{ ids: string[]; snapshot: SnapRow[] }> {
  if (!readFlag(KEYS.auto, false) || ls.get(KEYS.autoRan) === today) return { ids: [], snapshot: [] }
  ls.set(KEYS.autoRan, today)
  const all = await loadOverdue(today)
  const ids = all.filter((t) => overdueDays(t, today) > OVERDUE.autoDays).map((t) => t.id)
  if (!ids.length) return { ids, snapshot: [] }
  const db = await getDb()
  const snapshot = await db.getAll<SnapRow>(`SELECT id, ${SNAP_FIELDS.join(', ')} FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
  // 토스트가 사라진 뒤에도 설정 › 할 일 › "마지막 정리 되돌리기"로 되돌릴 수 있게 정리 1회분으로 남긴다
  beginCleanupSession()
  await remember(ids)
  await run(...ids.map((id) => update('tasks', id, { start_at: null, due_at: null, is_all_day: 1, repeat_rule: null, repeat_from: null })))
  return { ids, snapshot }
}
export const restoreRows = (rows: SnapRow[]) => run(...rows.map(({ id, ...patch }) => update('tasks', id, patch)))
