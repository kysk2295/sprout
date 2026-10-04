// 빠른 입력 글루(22 §3) — 공용 recognize() 결과를 하이라이트 구간·제안 줄·저장 값으로 바꾼다.
// 인식 자체는 데스크톱과 같은 @sprout/schema/recognition(모바일에서 따로 파싱하지 않는다 — 22 §3.1).
// 순수 모듈(시험: quickAddModel.test.ts).
import { recognize, type Recognition } from '@sprout/schema/recognition'
import { datePart, hasTime } from '@sprout/schema/time'
import { monthDay } from '../lib/dates.ts'
import { ON_TIME, type Schedule } from './dateSheetModel.ts'

/** 인식 취소한 글자를 정규식이 못 잡게 끼워 넣는 보이지 않는 글자(제목에서는 지운다) */
const BLOCK = '⁠'
type Named = { id: string; name: string }

export type Range = { start: number; end: number; text: string }
export interface Recognized extends Recognition {
  ranges: Range[]
}

/** 원문에서 인식된 글자들의 위치(겹치지 않게 앞에서부터) */
export function tokenRanges(raw: string, tokens: string[]): Range[] {
  const out: Range[] = []
  for (const tok of tokens) {
    if (!tok) continue
    let from = 0
    for (;;) {
      const i = raw.indexOf(tok, from)
      if (i < 0) break
      const r = { start: i, end: i + tok.length, text: tok }
      if (!out.some((o) => o.start < r.end && r.start < o.end)) { out.push(r); break }
      from = i + 1
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** 인식 + 취소(22 §3.2: 하이라이트를 누르면 그 부분은 그냥 글자) */
export function recognizeWith(raw: string, lists: Named[], tags: Named[], ignored: string[] = [], now = new Date()): Recognized {
  let masked = raw
  for (const ig of ignored) if (ig.length > 1) masked = masked.split(ig).join(ig[0] + BLOCK + ig.slice(1))
  const r = recognize(masked, lists, tags, now)
  const tokens = r.recognized.map((t) => t.split(BLOCK).join(''))
  return { ...r, title: r.title.split(BLOCK).join(''), recognized: tokens, ranges: tokenRanges(raw, tokens) }
}

/** 하이라이트 그리기용 조각 */
export function segments(raw: string, ranges: Range[]): { text: string; hl: boolean }[] {
  const out: { text: string; hl: boolean }[] = []
  let at = 0
  for (const r of ranges) {
    if (r.start > at) out.push({ text: raw.slice(at, r.start), hl: false })
    out.push({ text: raw.slice(r.start, r.end), hl: true })
    at = r.end
  }
  if (at < raw.length) out.push({ text: raw.slice(at), hl: false })
  return out
}
/** 커서가 하이라이트 안쪽(양 끝 제외)에 놓였으면 그 구간 — 눌러서 인식 취소 */
export const rangeAt = (ranges: Range[], pos: number) => ranges.find((r) => pos > r.start && pos < r.end) ?? null

// ── # ~ ! 제안 줄(22 §2) ──
export type Trigger = { kind: '#' | '~' | '!'; query: string; start: number; end: number }
/** 커서 바로 앞 낱말이 # ~ ! 로 시작하면 제안 줄을 띄운다 */
export function activeTrigger(raw: string, cursor = raw.length): Trigger | null {
  const before = raw.slice(0, cursor)
  const m = before.match(/(?:^|\s)([#~!])([^\s#~!]*)$/)
  if (!m) return null
  const start = cursor - m[2].length - 1
  return { kind: m[1] as Trigger['kind'], query: m[2], start, end: cursor }
}
export type Suggestion = { key: string; label: string; insert: string; create?: boolean; priority?: number }
const PRIORITIES: [string, number][] = [['높음', 3], ['중간', 2], ['낮음', 1], ['없음', 0]]
/** 맞는 것 먼저(앞부분 일치 → 포함), 끝에 `새 태그 "<글자>"` */
export function suggestions(t: Trigger, tags: Named[], lists: Named[]): Suggestion[] {
  const q = t.query.toLowerCase()
  const rank = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : name.toLowerCase().includes(q) ? 1 : 2)
  const pick = (items: Named[]) => items.filter((x) => rank(x.name) < 2).sort((a, b) => rank(a.name) - rank(b.name))
  if (t.kind === '!') return PRIORITIES.filter(([n]) => rank(n) < 2).map(([n, v]) => ({ key: `p${v}`, label: n, insert: `!${n}`, priority: v }))
  if (t.kind === '~') return pick(lists).map((l) => ({ key: l.id, label: l.name, insert: `~${l.name}` }))
  const out: Suggestion[] = pick(tags).map((x) => ({ key: x.id, label: x.name, insert: `#${x.name}` }))
  if (q && !tags.some((x) => x.name === t.query)) out.push({ key: 'new', label: `새 태그 "${t.query}"`, insert: `#${t.query}`, create: true })
  return out
}
/** 제안을 고르면 그 낱말을 바꾸고 뒤에 빈칸 하나(이어 쓰기) */
export function applySuggestion(raw: string, t: Trigger, insert: string): { text: string; cursor: number } {
  const after = raw.slice(t.end).replace(/^\S*/, '')
  const head = raw.slice(0, t.start) + insert + ' '
  return { text: head + after.replace(/^\s+/, ''), cursor: head.length }
}

// ── 저장 값(22 §5) ──
export interface QuickAddInput {
  title: string
  content: string
  list_id: string
  priority: number
  tag_ids: string[]
  start_at: string | null
  due_at: string | null
  is_all_day: number
  repeat_rule: string | null
  repeat_from: string | null
  reminders: string[]
}
/**
 * 인식 결과 + 도구 막대에서 고른 값 → createTask 입력.
 * 우선순위: 날짜 시트에서 고른 값(manual) > 인식된 날짜 > 보기 기본값(오늘 탭이면 오늘 종일).
 * 인식된 시각이 있으면 알림 "정각에"(03 §9, 데스크톱 추가 바와 같음).
 */
export function buildInput(o: {
  r: Recognition
  description: string
  defaults: { list_id: string; due_at: string | null }
  manual?: Schedule | null
  priority?: number | null
  listId?: string | null
}): QuickAddInput {
  const sched: Schedule = o.manual ?? {
    start_at: null,
    due_at: o.r.due_at ?? o.defaults.due_at,
    is_all_day: hasTime(o.r.due_at) ? 0 : 1,
    repeat_rule: o.r.repeat_rule,
    repeat_from: o.r.repeat_rule ? 'due' : null,
    reminders: hasTime(o.r.due_at) ? [ON_TIME] : []
  }
  return {
    title: o.r.title,
    content: o.description.trim(),
    list_id: o.listId ?? o.r.list_id ?? o.defaults.list_id,
    priority: o.priority ?? o.r.priority ?? 0,
    tag_ids: o.r.tag_ids,
    start_at: sched.start_at,
    due_at: sched.due_at,
    is_all_day: hasTime(sched.due_at) ? 0 : 1,
    repeat_rule: sched.repeat_rule,
    repeat_from: sched.repeat_rule ? (sched.repeat_from ?? 'due') : null,
    reminders: sched.due_at ? sched.reminders : []
  }
}
/** 보낸 할 일이 지금 보기(오늘)에 안 보일 때 토스트(22 §3.4). 보이면 null */
export function addedToast(view: string, due: string | null, start: string | null, today: string, listName?: string): string | null {
  if (view !== 'smart:today') return null
  const s = start ?? due
  if (s && datePart(s) <= today) return null
  if (!s) return `${listName ?? '기본함'}에 추가했어요`
  const d = Math.round((new Date(`${datePart(s)}T00:00`).getTime() - new Date(`${today}T00:00`).getTime()) / 86400000)
  return `${d === 1 ? '내일' : d === 2 ? '모레' : monthDay(datePart(s), today)}에 추가했어요`
}
