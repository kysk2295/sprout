// 48 만료 2주 지난 할 일 자동 정리 — 고르는 규칙·설정·묶음 행 모양·문구. 서버 작업(server/api/src/autoTrash.ts)과
// 데스크톱·휴대폰 알림·설정이 같이 쓰는 순수 모듈(DB·화면에 기대지 않음). 시험: autoTrash.test.ts
import { addDays, datePart, dayKeyIn, isTimeZone } from './time.ts'

export const AUTO_TRASH = {
  /** 만료된 지 이 일수를 넘으면(= 마감 < 오늘 − 14) 휴지통으로 */
  days: 14,
  /** 설정 행 view_key */
  viewKey: 'autoTrash',
  /** 묶음 행 view_key */
  batchKey: 'autoTrash:batch',
  /** 저장된 시간대·기기 시간대가 없을 때 */
  defaultTz: 'Asia/Seoul',
  /** 묶음 행 보관(되돌리기 가능) 일수 [임시] */
  keepBatchDays: 30
}

/** 설정 행 id — 사용자마다 하나(기기 두 대가 오프라인에서 따로 만들어도 한 행, 남과 겹치지 않게 사용자 id를 넣는다) */
export const autoTrashSettingsId = (userId: string) => `autotrash-${userId}`

export type AutoTrashSettings = { on: boolean; tz: string | null }
/** 설정 options_json 읽기. 행이 없거나 이상하면 켬(사용자 요청 2026-10-09: 기본 켬) */
export function parseAutoTrashSettings(json: string | null | undefined): AutoTrashSettings {
  let o: unknown = null
  try { o = json ? JSON.parse(json) : null } catch { o = null }
  const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
  return { on: r.on !== false, tz: isTimeZone(r.tz) ? (r.tz as string) : null }
}
export const autoTrashSettingsJson = (s: AutoTrashSettings) => JSON.stringify({ on: s.on, ...(s.tz ? { tz: s.tz } : {}) })

/** 쓸 시간대: 설정에 저장된 것 → 기기(푸시 등록) 시간대 → Asia/Seoul */
export function pickTimeZone(...cands: (string | null | undefined)[]): string {
  for (const c of cands) if (isTimeZone(c)) return c
  return AUTO_TRASH.defaultTz
}
/** 그 시간대의 오늘 */
export const todayIn = (ms: number, tz: string) => dayKeyIn(ms, tz)
/** 마감 날짜가 이 날보다 앞이면 대상(오늘 − 14일) */
export const cutoffDay = (today: string) => addDays(today, -AUTO_TRASH.days)
/** 만료된 지 14일이 넘었나(날짜만 — due_at은 떠 있는 시각) */
export const isStale = (due: string | null | undefined, today: string) => !!due && datePart(due) < cutoffDay(today)

// ── 고르기 ──
export type AtTask = {
  id: string
  parent_id: string | null
  status: number | null
  deleted_at: string | null
  due_at: string | null
  repeat_rule: string | null
  pinned_at: string | null
  list_id: string | null
}
export type AtInput = {
  /** 이 사용자의 할 일(열린 것은 전부 — 하위·프로젝트 마감을 보려면 필요. 완료·휴지통 행이 섞여도 된다) */
  tasks: AtTask[]
  /** 보관한 리스트 id */
  archivedLists: string[]
  /** 프로젝트 태그(tags.kind = 'project') id */
  projectTags: string[]
  /** 할 일 ↔ 태그(받아들인 것만 넘기거나 state를 같이) */
  taskTags: { task_id: string; tag_id: string; state?: string | null }[]
  /** ⚑ 핵심 날짜: relations from tag → task field deadline */
  deadlines: { tag_id: string; task_id: string }[]
  /** 이미 자동 정리했던 (할 일, 그때 마감) — 같은 마감인 동안 다시 옮기지 않는다 */
  done: { task_id: string; due_at: string | null }[]
}
export type AtPick = {
  /** 휴지통으로 옮길 할 일 id(부모 + 열린 하위) */
  ids: string[]
  /** 그중 스스로 대상이었던 것(하위로 따라간 것 말고) */
  roots: string[]
}

const accepted = (s: string | null | undefined) => (s ?? 'accepted') === 'accepted'
const isOpen = (t: AtTask) => (t.status ?? 0) === 0 && !t.deleted_at

/** 진행 중인 프로젝트(마감이 오늘 이후)에 든 할 일 id */
export function activeProjectTasks(i: Pick<AtInput, 'tasks' | 'projectTags' | 'taskTags' | 'deadlines'>, today: string): Set<string> {
  const byId = new Map(i.tasks.map((t) => [t.id, t]))
  const projects = new Set(i.projectTags)
  const members = new Map<string, string[]>()
  for (const l of i.taskTags) {
    if (!projects.has(l.tag_id) || !accepted(l.state)) continue
    const m = members.get(l.tag_id) ?? []
    m.push(l.task_id)
    members.set(l.tag_id, m)
  }
  const key = new Map(i.deadlines.map((d) => [d.tag_id, d.task_id]))
  const out = new Set<string>()
  for (const [tag, ids] of members) {
    const keyTask = byId.get(key.get(tag) ?? '')
    let end: string | null = keyTask && !keyTask.deleted_at && keyTask.due_at ? datePart(keyTask.due_at) : null
    if (!end) for (const id of ids) { const t = byId.get(id); if (t && !t.deleted_at && t.due_at && (!end || datePart(t.due_at) > end)) end = datePart(t.due_at) }
    if (end && end >= today) ids.forEach((id) => out.add(id))
  }
  return out
}

/**
 * 48 §1: 휴지통으로 옮길 할 일을 고른다.
 * 대상 = 열림 · 마감 < 오늘−14 · 반복 아님 · 고정 아님 · 보관 리스트 아님 · 진행 중 프로젝트 아님 · 같은 마감으로 자동 정리한 적 없음.
 * 하위: 열린 하위와 함께. 열린 하위 중 지켜야 하는 것(반복·고정·진행 중 프로젝트·마감이 아직 2주 안 지남)이 있으면 부모도 건너뜀.
 */
export function pickAutoTrash(i: AtInput, today: string): AtPick {
  const archived = new Set(i.archivedLists)
  const inProject = activeProjectTasks(i, today)
  const doneKey = new Set(i.done.map((d) => `${d.task_id}\u0000${d.due_at ?? ''}`))
  const kids = new Map<string, AtTask[]>()
  for (const t of i.tasks) if (t.parent_id) { const k = kids.get(t.parent_id) ?? []; k.push(t); kids.set(t.parent_id, k) }

  /** 이 할 일이 있으면 위쪽 부모를 지운다면 안 되는가(열린 하위 기준) */
  const guards = (t: AtTask) =>
    !!t.repeat_rule || !!t.pinned_at || inProject.has(t.id) || (!!t.due_at && !isStale(t.due_at, today))
  const eligible = (t: AtTask) =>
    isOpen(t) && isStale(t.due_at, today) && !t.repeat_rule && !t.pinned_at &&
    !(t.list_id && archived.has(t.list_id)) && !inProject.has(t.id) && !doneKey.has(`${t.id}\u0000${t.due_at ?? ''}`)

  /** 열린 하위 전부(깊이 우선, 순환 막음). 하나라도 지켜야 하면 null */
  const openSubtree = (root: AtTask): string[] | null => {
    const out: string[] = []
    const seen = new Set<string>([root.id])
    const stack = [...(kids.get(root.id) ?? [])]
    while (stack.length) {
      const c = stack.pop()!
      if (seen.has(c.id)) continue
      seen.add(c.id)
      if (!isOpen(c)) continue // 완료·하지 않음·이미 휴지통인 하위는 그대로(그 아래도 건드리지 않음)
      if (guards(c)) return null
      out.push(c.id)
      stack.push(...(kids.get(c.id) ?? []))
    }
    return out
  }

  const ids = new Set<string>()
  const roots: string[] = []
  // 위쪽 부모부터(부모가 옮겨지면 하위는 따라가고 따로 세지 않는다)
  const parentOf = new Map(i.tasks.map((t) => [t.id, t.parent_id]))
  const depth = (id: string) => { let d = 0; const seen = new Set([id]); let p = parentOf.get(id); while (p && parentOf.has(p) && !seen.has(p)) { seen.add(p); d++; p = parentOf.get(p) } return d }
  const depths = new Map(i.tasks.map((t) => [t.id, depth(t.id)]))
  const sorted = [...i.tasks].sort((a, b) => depths.get(a.id)! - depths.get(b.id)! || (a.due_at ?? '').localeCompare(b.due_at ?? '') || a.id.localeCompare(b.id))
  for (const t of sorted) {
    if (ids.has(t.id) || !eligible(t)) continue
    const sub = openSubtree(t)
    if (!sub) continue
    roots.push(t.id)
    ids.add(t.id)
    sub.forEach((id) => ids.add(id))
  }
  return { ids: [...ids], roots }
}

// ── 묶음 행(view_settings view_key 'autoTrash:batch') ──
export type AutoTrashBatch = { at: string; day: string; ids: string[]; count: number; seen: boolean; undone: boolean }
export function parseBatch(json: string | null | undefined): AutoTrashBatch | null {
  try {
    const o = json ? JSON.parse(json) : null
    if (!o || typeof o.at !== 'string' || !Array.isArray(o.ids)) return null
    const ids = o.ids.filter((x: unknown): x is string => typeof x === 'string')
    return { at: o.at, day: typeof o.day === 'string' ? o.day : o.at.slice(0, 10), ids, count: typeof o.count === 'number' ? o.count : ids.length, seen: o.seen === true, undone: o.undone === true }
  } catch {
    return null
  }
}
export const batchJson = (b: AutoTrashBatch) => JSON.stringify(b)

/** 앱이 띄울 알림: 아직 안 본·되돌리지 않은 묶음을 합친다. 없으면 null */
export function pendingNotice(rows: { id: string; options_json: string | null }[]): { batchIds: string[]; count: number } | null {
  const ps = rows.map((r) => ({ id: r.id, b: parseBatch(r.options_json) })).filter((x) => x.b && !x.b.seen && !x.b.undone && x.b.count > 0)
  if (!ps.length) return null
  return { batchIds: ps.map((x) => x.id), count: ps.reduce((n, x) => n + x.b!.count, 0) }
}
/** 설정 화면 "마지막 자동 정리": 되돌리지 않은 가장 최근 묶음 */
export function lastBatch(rows: { id: string; options_json: string | null }[]): ({ id: string } & AutoTrashBatch) | null {
  let best: ({ id: string } & AutoTrashBatch) | null = null
  for (const r of rows) {
    const b = parseBatch(r.options_json)
    if (b && !b.undone && b.count > 0 && (!best || b.at > best.at)) best = { id: r.id, ...b }
  }
  return best
}

export const noticeText = (n: number) => `만료된 지 2주 지난 할 일 ${n}개를 휴지통으로 옮겼어요`
export const SETTING_LABEL = '만료 2주 지난 할 일 자동 정리'
export const SETTING_HINT = '매일 한 번, 만료된 지 14일이 지난 할 일을 휴지통으로 옮겨요. 반복·고정·진행 중인 프로젝트는 빼요.'
export const undoneText = (n: number) => `${n}개를 되돌렸어요`
