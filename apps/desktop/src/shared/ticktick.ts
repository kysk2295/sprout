// 17 틱틱에서 가져오기: 틱틱 공식 Open API 응답(JSON) → sprout 행. 순수 함수만 둔다(메인·화면·시험이 같이 쓴다).
// 근거: docs/ticktick-research/21-ticktick-open-api.md, 매핑 표는 docs/screens/17-ticktick-import.md §6
import { minutesToDuration, parseRule, stringifyRule } from '@sprout/schema/time'
import { splitEmoji } from './emoji'

// ── 틱틱 응답 모양(공식 문서 정의 + 문서에 없지만 오면 쓰는 칸은 ?) ──
export interface TTChecklistItem { id: string; title?: string; status?: number; completedTime?: string | number; isAllDay?: boolean; sortOrder?: number; startDate?: string; timeZone?: string }
export interface TTTask {
  id: string
  projectId?: string
  title?: string
  content?: string
  desc?: string
  isAllDay?: boolean
  startDate?: string
  dueDate?: string
  timeZone?: string
  reminders?: string[]
  repeatFlag?: string
  repeatFrom?: string
  priority?: number
  status?: number
  completedTime?: string | number
  sortOrder?: number
  items?: TTChecklistItem[]
  tags?: string[]
  kind?: 'TEXT' | 'NOTE' | 'CHECKLIST' | string
  parentId?: string
  // 문서 정의에는 없다 — 실제 응답에 오면 쓴다
  columnId?: string
  createdTime?: string
  modifiedTime?: string
}
export interface TTProject { id: string; name?: string; color?: string; sortOrder?: number; closed?: boolean; groupId?: string; viewMode?: string; permission?: string; kind?: 'TASK' | 'NOTE' | string }
export interface TTColumn { id: string; projectId?: string; name?: string; sortOrder?: number }
export interface TTGroup { id: string; name?: string; sortOrder?: number; showAll?: boolean; viewMode?: string }
export interface TTTag { name: string; label?: string; sortOrder?: number; color?: string; parent?: string; type?: number }
export interface TTProjectData { project?: TTProject; tasks?: TTTask[]; columns?: TTColumn[] }

/** 메인 프로세스가 모아 화면으로 넘기는 묶음 */
export interface TTBundle {
  fetchedAt: string
  timeZone?: string
  projects: TTProject[]
  groups: TTGroup[]
  tags: TTTag[]
  data: Record<string, TTProjectData> // projectId → 데이터
  inbox?: TTProjectData
  completed: TTTask[]
  warnings: string[]
}

// ── 연결 상태(메인 ↔ 화면) ──
export type TTConnectInput = { kind: 'oauth' } | { kind: 'token'; token: string }
export interface TTStatus { connected: boolean; kind: 'oauth' | 'token' | null; oauthAvailable: boolean; redirectUri: string; waiting: boolean }
export type TTResult<T> = { ok: true; value: T } | { ok: false; error: string; reconnect?: boolean }
export interface TTProgress { step: 'projects' | 'data' | 'completed' | 'done'; done: number; total: number; label?: string }

// ── 요청 도우미(메인 프로세스가 쓴다. 순수해서 시험할 수 있게 여기 둔다) ──
//: 1분 80회 · 5분 250회 안으로(문서에 숫자 없음, 커뮤니티 보고 100/분·300/5분) ──
export function createLimiter(perMinute = 80, perFive = 250, clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }) {
  const sent: number[] = []
  return async () => {
    for (;;) {
      const t = clock.now()
      while (sent.length && t - sent[0] > 300_000) sent.shift()
      const lastMin = sent.filter((x) => t - x < 60_000)
      const wait = Math.max(sent.length >= perFive ? sent[0] + 300_000 - t : 0, lastMin.length >= perMinute ? lastMin[0] + 60_000 - t : 0)
      if (wait <= 0) { sent.push(t); return }
      await clock.sleep(wait + 50)
    }
  }
}

const fmt = (ms: number) => new Date(ms).toISOString().replace('Z', '+0000')
/** 완료한 할 일: 한 번에 200개까지라 꽉 차면 기간을 반으로 나눠 다시 묻는다 */
export async function fetchCompleted(get: (body: { projectIds?: string[]; startDate: string; endDate: string }) => Promise<TTTask[]>, projectIds: string[] | undefined, from: number, to: number, onCall?: () => void): Promise<TTTask[]> {
  const out = new Map<string, TTTask>()
  const stack: [number, number][] = [[from, to]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    onCall?.()
    const rows = (await get({ projectIds, startDate: fmt(a), endDate: fmt(b) })) ?? []
    if (rows.length >= 200 && b - a > 60_000) {
      const mid = Math.floor((a + b) / 2)
      stack.push([mid + 1, b], [a, mid])
      continue
    }
    for (const t of rows) if (t?.id) out.set(t.id, t)
  }
  return [...out.values()]
}

// ── 결과 ──
type Row = Record<string, unknown>
export interface ImportPlan {
  folders: Row[]
  lists: Row[]
  sections: Row[]
  tags: Row[]
  tasks: Row[]
  check_items: Row[]
  task_tags: Row[]
  reminders: Row[]
  notes: { id: string; content: string; created_at: string; modified_at: string; captured_at: string; fingerprint: string }[]
  stats: ImportStats
  warnings: string[]
}
export interface ImportStats { lists: number; folders: number; tasks: number; open: number; completed: number; wontDo: number; dated: number; repeating: number; reminders: number; subtasks: number; checkItems: number; tags: number; notes: number; droppedRepeat: number; droppedReminders: number }

export interface MapContext {
  /** id 앞붙이 범위 — 같은 틱틱 공유 리스트를 가져온 다른 sprout 사용자와 서버에서 id가 부딪치지 않게(사용자 id 해시) */
  scope: string
  /** sprout 기본함 id. 틱틱 받은함 할 일이 여기로 간다 */
  inboxId: string
  /** 이미 있는 sprout 태그(이름 소문자 → id). 같은 이름이면 새로 만들지 않고 붙인다 */
  tagIdsByName?: Record<string, string>
  /** 새 리스트·폴더·태그를 기존 것 뒤에 놓기 위한 시작 순서 */
  listSortBase?: number
  folderSortBase?: number
  tagSortBase?: number
  /** 가져온 시각(만든 시각이 없는 행의 고친 시각) */
  now: string
  /** 틱틱 응답에 만든 시각이 없을 때 쓰는 값 — 작업 지도 자동 분류 기준 시각보다 앞이어야 수천 개가 한꺼번에 AI로 가지 않는다 */
  createdFallback: string
  /** 할 일·사용자 시간대가 둘 다 없을 때(기기 시간대) */
  deviceTimeZone: string
}

// ── id ──
/** 짧고 결정적인 해시(cyrb53) — 태그 이름·사용자 id처럼 id에 그대로 넣기 곤란한 값 */
export function shortHash(text: string, len = 8): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(len, '0').slice(-len)
}
export const ttId = (scope: string, kind: 'list' | 'folder' | 'section' | 'tag' | 'task' | 'note' | 'item', ref: string) =>
  `tt-${scope}-${kind}-${ref}`
export const isInboxProject = (projectId: string | undefined) => !projectId || projectId === 'inbox' || /^inbox\d*$/.test(projectId)

// ── 시각 ──
/** 틱틱 시각 → Date. `2019-11-13T03:00:00+0000`, `…00.000+0000`, `…Z` 모두.
 *  실제 응답에서 체크 항목 completedTime은 숫자(밀리초)로 온다(문서와 다름, 2026-10-05 실데이터) → 숫자도 받는다 */
export function parseTT(s: string | number | undefined | null): Date | null {
  if (s === undefined || s === null || s === '') return null
  if (typeof s === 'number') { const d = new Date(s); return Number.isFinite(s) && !Number.isNaN(d.getTime()) ? d : null }
  if (typeof s !== 'string') return null
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) return null
  const zone = !m[4] || m[4] === 'Z' ? 'Z' : m[4].includes(':') ? m[4] : `${m[4].slice(0, 3)}:${m[4].slice(3)}`
  const d = new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}${m[3] ?? ''}${zone}`)
  return Number.isNaN(d.getTime()) ? null : d
}
const validZone = (tz: string | undefined): tz is string => {
  if (!tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}
const fmtCache = new Map<string, Intl.DateTimeFormat>()
/** Date → 그 시간대의 벽시계 'YYYY-MM-DDTHH:mm' */
export function wallClock(d: Date, timeZone: string): string {
  let f = fmtCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    fmtCache.set(timeZone, f)
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}
const addDay = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** 틱틱 날짜 → sprout start_at·due_at·is_all_day (03 §9 floating) */
export function mapDates(t: Pick<TTTask, 'startDate' | 'dueDate' | 'isAllDay' | 'timeZone'>, fallbackZone: string): { start_at: string | null; due_at: string | null; is_all_day: number } {
  const zone = validZone(t.timeZone) ? t.timeZone : fallbackZone
  const s = parseTT(t.startDate)
  const d = parseTT(t.dueDate)
  const allDay = !!t.isAllDay
  if (!s && !d) return { start_at: null, due_at: null, is_all_day: 1 }
  if (allDay) {
    const sd = s ? wallClock(s, zone).slice(0, 10) : null
    const dd = d ? wallClock(d, zone).slice(0, 10) : null
    if (sd && dd && dd > sd) {
      // 여러 날 종일: 틱틱 dueDate = 마지막 날 다음 자정(끝 미포함) [임시] → sprout는 끝 포함
      const last = addDay(dd, -1)
      return last > sd ? { start_at: sd, due_at: last, is_all_day: 1 } : { start_at: null, due_at: sd, is_all_day: 1 }
    }
    return { start_at: null, due_at: sd ?? dd, is_all_day: 1 }
  }
  const sw = s ? wallClock(s, zone) : null
  const dw = d ? wallClock(d, zone) : null
  if (sw && dw && dw > sw) return { start_at: sw, due_at: dw, is_all_day: 0 }
  return { start_at: null, due_at: dw ?? sw, is_all_day: 0 }
}

// ── 우선순위·상태 ──
export const mapPriority = (p: number | undefined) => (p === 5 ? 3 : p === 3 ? 2 : p === 1 ? 1 : 0)
/** 틱틱 0 보통 · 2 완료 · -1 포기 → sprout 0 미완료 · 1 완료 · 2 하지 않음 */
export const mapStatus = (s: number | undefined) => (s === 2 ? 1 : s === -1 ? 2 : 0)

// ── 반복 ──
const KNOWN_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
const UNSUPPORTED = /(^|;)(BYSETPOS|BYWEEKNO|BYYEARDAY|BYHOUR|BYMINUTE|BYSECOND)=/
/** 틱틱 repeatFlag → sprout repeat_rule(앞의 'RRULE:' 없음). 옮길 수 없으면 null */
export function mapRepeat(flag: string | undefined | null): string | null {
  if (!flag?.trim()) return null
  const raw = flag.trim()
  if (/^ERRULE:/i.test(raw) || /LUNAR/i.test(raw)) return null // 음력 반복
  const body = raw.replace(/^RRULE:/i, '')
  // 틱틱 전용 키(TT_SKIP=HOLIDAY 등)·WKST는 버린다. 의미가 바뀌는 키가 있으면 통째로 포기
  const parts = body.split(';').map((p) => p.trim()).filter((p) => p && !/^(TT_[A-Z_]+|WKST)=/i.test(p))
  const clean = parts.join(';').toUpperCase()
  if (UNSUPPORTED.test(clean)) return null
  const rule = parseRule(clean)
  if (!rule || !KNOWN_FREQ.has(rule.freq)) return null
  if (rule.byday?.some((d) => !/^(-?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.test(d))) return null
  if (rule.until && !/^\d{4}-\d{2}-\d{2}$/.test(rule.until)) return null
  return stringifyRule(rule)
}
export const mapRepeatFrom = (f: string | undefined, rule: string | null) => (!rule ? null : f === '1' ? 'completion' : 'due')

// ── 알림 ──
/** 'TRIGGER:-P1DT15H0M0S' → 분(부호 포함). 절대 시각·모르는 형식은 null */
export function triggerMinutes(trigger: string): number | null {
  const m = trigger.trim().replace(/^TRIGGER:/i, '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i)
  if (!m || /^[+-]?PT?$/i.test(m[0])) return null
  const [, sign, w, d, h, mi, s] = m
  const total = Number(w ?? 0) * 10080 + Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(mi ?? 0) + Math.round(Number(s ?? 0) / 60)
  return sign === '-' ? -total : total
}
/** 틱틱 알림 → sprout trigger(03 §9). 종일은 그날 0시 기준, 시각은 시작 기준. '정각에'는 '-PT0M' */
export function mapReminder(trigger: string, allDay: boolean): string | null {
  const min = triggerMinutes(trigger)
  if (min === null) return null
  if (!allDay && min === 0) return '-PT0M'
  if (!allDay && min > 0) return null // 시작 뒤 알림은 sprout에 없다
  return minutesToDuration(min)
}

// ── 리스트 이름 앞 이모지: 폴더 아이콘 표시와 같은 함수(shared/emoji) ──
export { splitEmoji }
const COLOR = /^#[0-9a-f]{6}$/i
const color = (c: string | undefined) => (c && COLOR.test(c) ? c.toUpperCase() : null)

/** 노트(수집함) 본문: 제목 + 빈 줄 + 내용 */
export function noteText(t: Pick<TTTask, 'title' | 'content' | 'desc'>): string {
  const title = (t.title ?? '').trim()
  const body = (t.content || t.desc || '').trim()
  return [title, body].filter(Boolean).join('\n\n')
}
const isNote = (t: TTTask, project: TTProject | undefined) => t.kind === 'NOTE' || project?.kind === 'NOTE'

// ── 전체 매핑 ──
export function planImport(bundle: TTBundle, ctx: MapContext): ImportPlan {
  const S = ctx.scope
  const warnings = [...bundle.warnings]
  const userZone = validZone(bundle.timeZone) ? bundle.timeZone : ctx.deviceTimeZone
  const projects = new Map(bundle.projects.map((p) => [p.id, p]))
  const stats: ImportStats = { lists: 0, folders: 0, tasks: 0, open: 0, completed: 0, wontDo: 0, dated: 0, repeating: 0, reminders: 0, subtasks: 0, checkItems: 0, tags: 0, notes: 0, droppedRepeat: 0, droppedReminders: 0 }
  const plan: ImportPlan = { folders: [], lists: [], sections: [], tags: [], tasks: [], check_items: [], task_tags: [], reminders: [], notes: [], stats, warnings }
  const stamp = (t: { createdTime?: string; modifiedTime?: string }) => {
    const c = parseTT(t.createdTime)
    const m = parseTT(t.modifiedTime)
    const created = c && c.toISOString() <= ctx.now ? c.toISOString() : ctx.createdFallback
    return { created_at: created, modified_at: m && iso(m)! >= created ? iso(m)! : created }
  }

  // 폴더(프로젝트 그룹) — 쓰이는 것만
  const usedGroups = new Set(bundle.projects.filter((p) => p.groupId && p.groupId !== 'NONE').map((p) => p.groupId!))
  const groups = [...bundle.groups].filter((g) => usedGroups.has(g.id)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const folderIds = new Map<string, string>()
  groups.forEach((g, i) => {
    const id = ttId(S, 'folder', g.id)
    folderIds.set(g.id, id)
    plan.folders.push({ id, name: (g.name ?? '').trim() || '폴더', sort_order: (ctx.folderSortBase ?? 0) + i + 1, created_at: ctx.createdFallback, modified_at: ctx.now })
  })

  // 리스트 — 노트 리스트는 수집함으로 가므로 리스트를 만들지 않는다
  const listIds = new Map<string, string>()
  const taskProjects = [...bundle.projects].filter((p) => p.kind !== 'NOTE').sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  taskProjects.forEach((p, i) => {
    const id = ttId(S, 'list', p.id)
    listIds.set(p.id, id)
    const { emoji, name } = splitEmoji(p.name ?? '')
    plan.lists.push({
      id, name: name || '리스트', emoji, color: color(p.color), folder_id: p.groupId ? folderIds.get(p.groupId) ?? null : null,
      kind: 'normal', sort_order: (ctx.listSortBase ?? 0) + i + 1, pinned: 0, archived_at: p.closed ? ctx.now : null, show_in_smart: 'all',
      created_at: ctx.createdFallback, modified_at: ctx.now
    })
  })
  stats.lists = plan.lists.length
  stats.folders = plan.folders.length

  // 섹션(칸반 열)
  const sectionIds = new Map<string, string>()
  const allData: [string | null, TTProjectData][] = [...Object.entries(bundle.data), ...(bundle.inbox ? [[null, bundle.inbox] as [null, TTProjectData]] : [])]
  for (const [pid, d] of allData) {
    const listId = pid && !isInboxProject(pid) ? listIds.get(pid) : ctx.inboxId
    if (!listId || (pid && projects.get(pid)?.kind === 'NOTE')) continue
    ;[...(d.columns ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).forEach((c, i) => {
      if (sectionIds.has(c.id)) return
      const id = ttId(S, 'section', c.id)
      sectionIds.set(c.id, id)
      plan.sections.push({ id, list_id: listId, name: (c.name ?? '').trim() || '섹션', sort_order: i, created_at: ctx.createdFallback, modified_at: ctx.now })
    })
  }

  // 태그 — 틱틱 tags[]는 name(소문자 키)을 쓴다. 표시 이름은 label
  const tagInfo = new Map(bundle.tags.map((t) => [t.name.toLowerCase(), t]))
  const tagIds = new Map<string, string>() // 틱틱 name 소문자 → sprout id
  const existing = ctx.tagIdsByName ?? {}
  let tagOrder = (ctx.tagSortBase ?? 0) + 1
  const ensureTag = (rawName: string, depth = 0): string | null => {
    const key = rawName.trim().toLowerCase()
    if (!key) return null
    const known = tagIds.get(key)
    if (known) return known
    const info = tagInfo.get(key)
    const label = (info?.label ?? info?.name ?? rawName).trim()
    const found = existing[label.toLowerCase()] ?? existing[key]
    if (found) { tagIds.set(key, found); return found }
    const id = ttId(S, 'tag', shortHash(key, 10))
    tagIds.set(key, id)
    // sprout 태그는 2단계까지(12 태그) — 부모의 부모가 있으면 부모 없이
    const parentInfo = info?.parent ? tagInfo.get(info.parent.toLowerCase()) : undefined
    const parentId = info?.parent && depth === 0 && !parentInfo?.parent ? ensureTag(info.parent, depth + 1) : null
    plan.tags.push({ id, name: label, color: color(info?.color), parent_id: parentId, sort_order: tagOrder++, pinned: 0, created_at: ctx.createdFallback, modified_at: ctx.now })
    return id
  }
  for (const t of [...bundle.tags].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) ensureTag(t.name)

  // 할 일 모으기(미완료 + 완료). 같은 id면 완료 쪽을 쓴다
  const tasks = new Map<string, TTTask>()
  for (const [, d] of allData) for (const t of d.tasks ?? []) if (t?.id) tasks.set(t.id, t)
  for (const t of bundle.completed) if (t?.id) tasks.set(t.id, { ...tasks.get(t.id), ...t })
  const taskRowIds = new Map<string, string>()
  for (const t of tasks.values()) if (!isNote(t, projects.get(t.projectId ?? ''))) taskRowIds.set(t.id, ttId(S, 'task', t.id))

  let unknownProject = 0
  for (const t of tasks.values()) {
    const project = t.projectId ? projects.get(t.projectId) : undefined
    const times = stamp(t)
    if (isNote(t, project)) {
      const content = noteText(t)
      if (!content) continue
      plan.notes.push({ id: ttId(S, 'note', t.id), content, created_at: times.created_at, modified_at: times.modified_at, captured_at: times.created_at, fingerprint: `ticktick:${t.id}` })
      continue
    }
    const id = taskRowIds.get(t.id)!
    let listId = isInboxProject(t.projectId) ? ctx.inboxId : listIds.get(t.projectId!)
    if (!listId) { listId = ctx.inboxId; unknownProject++ }
    const zone = validZone(t.timeZone) ? t.timeZone : userZone
    const dates = mapDates(t, zone)
    const status = mapStatus(t.status)
    const rule = dates.due_at ? mapRepeat(t.repeatFlag) : null
    if (t.repeatFlag && !rule) stats.droppedRepeat++
    const items = [...(t.items ?? [])].filter((i) => i?.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const checklist = t.kind === 'CHECKLIST' || items.length > 0
    const parent = t.parentId && taskRowIds.has(t.parentId) && t.parentId !== t.id ? taskRowIds.get(t.parentId)! : null
    const completed = status === 1 ? iso(parseTT(t.completedTime)) ?? times.modified_at : null
    plan.tasks.push({
      id, list_id: listId, parent_id: parent, section_id: t.columnId ? sectionIds.get(t.columnId) ?? null : null,
      title: (t.title ?? '').trim(), content: checklist ? (t.desc || t.content || '').trim() : (t.content || t.desc || '').trim(), content_mode: checklist ? 'checklist' : 'text',
      status, priority: mapPriority(t.priority), start_at: dates.start_at, due_at: dates.due_at, is_all_day: dates.is_all_day, time_zone: 'floating',
      repeat_rule: rule, repeat_from: mapRepeatFrom(t.repeatFrom, rule), repeat_origin_id: null,
      sort_order: typeof t.sortOrder === 'number' ? t.sortOrder : 0, pinned_at: null, completed_at: completed, deleted_at: null,
      created_at: times.created_at, modified_at: times.modified_at
    })
    stats.tasks++
    if (status === 0) stats.open++
    if (status === 1) stats.completed++
    if (status === 2) stats.wontDo++
    if (dates.due_at) stats.dated++
    if (rule) stats.repeating++
    if (parent) stats.subtasks++
    items.forEach((it, i) => {
      plan.check_items.push({ id: ttId(S, 'item', it.id), task_id: id, title: (it.title ?? '').trim(), done: it.status === 1 ? 1 : 0, sort_order: i, completed_at: it.status === 1 ? iso(parseTT(it.completedTime)) : null, created_at: times.created_at, modified_at: times.modified_at })
      stats.checkItems++
    })
    const seenTags = new Set<string>()
    for (const name of t.tags ?? []) {
      const tagId = ensureTag(name)
      if (!tagId || seenTags.has(tagId)) continue
      seenTags.add(tagId)
      plan.task_tags.push({ id: `${id}-tag-${shortHash(tagId, 8)}`, task_id: id, tag_id: tagId, created_at: times.created_at, modified_at: times.modified_at })
    }
    if (dates.due_at) {
      const seen = new Set<string>()
      for (const raw of t.reminders ?? []) {
        const trig = mapReminder(raw, dates.is_all_day === 1)
        if (!trig) { stats.droppedReminders++; continue }
        if (seen.has(trig)) continue
        seen.add(trig)
        plan.reminders.push({ id: `${id}-rem-${shortHash(trig, 6)}`, task_id: id, trigger: trig, created_at: times.created_at, modified_at: times.modified_at })
        stats.reminders++
      }
    } else if (t.reminders?.length) stats.droppedReminders += t.reminders.length
  }
  stats.tags = plan.tags.length
  stats.notes = plan.notes.length
  if (unknownProject) warnings.push(`리스트를 찾지 못한 할 일 ${unknownProject}개는 기본함에 넣어요.`)
  if (stats.droppedRepeat) warnings.push(`반복 규칙 ${stats.droppedRepeat}개는 sprout가 지원하지 않아(음력·공휴일 건너뛰기 등) 반복 없이 가져와요.`)
  if (stats.droppedReminders) warnings.push(`알림 ${stats.droppedReminders}개는 옮기지 못했어요(날짜 없는 할 일·위치·절대 시각 알림).`)
  return plan
}

/** 미리보기 숫자(17 §3.2) */
export function previewCounts(plan: ImportPlan, already: number) {
  const s = plan.stats
  return { lists: s.lists, tasks: s.tasks, completed: s.completed, dated: s.dated, repeating: s.repeating, notes: s.notes, already }
}
