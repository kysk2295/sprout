// 31 §12.9 프로젝트 편집·관계도 — 화면과 떼어 놓은 순수 계산(tests/project-edit.test.ts).
//  · 타임라인 끌기: 하루 칸 붙이기, 날짜 바꾸기(캘린더 월 끌기 monthMoveChanges와 같은 규칙), 놓을 줄
//  · 순서 선 검사(고리 = data/map wouldCycle)
//  · 할 일 넣기 검색(퍼지)
//  · 관계도: 노드·선 만들기 + 프로젝트를 가운데 둔 결정적 방사형 자리
import { addDays } from '@sprout/schema/time'
import { categoryOf as categoryOfName, projectTitle as projectTitleOf, WORK_KINDS, type WorkKind } from '@sprout/schema/projects'
import type { ProjectView, PTaskRow } from '@sprout/schema/planView'
import { wouldCycle } from '../data/map'
import type { CalItem } from './calendar'
import { monthMoveChanges, type DragChange } from './calendarDrag'

// ── 타임라인 끌기 ──
/** 끈 거리(px) → 옮긴 날 수(하루 칸에 붙음) */
export const dragDays = (dx: number, px: number) => (px > 0 ? Math.round(dx / px) : 0)
/** 칩 끌기 → 바뀌는 날짜. delta일 옮김(시각·기간 유지 — 캘린더 월 끌기와 같은 규칙).
 * 날짜 없던 일(언젠가)을 줄에 놓으면 그날 종일 마감, `to: null`(언젠가 칸에 놓음)이면 날짜를 지운다. 바뀌는 게 없으면 null */
export function dateDrag(t: Pick<PTaskRow, 'id' | 'start_at' | 'due_at'>, move: { delta: number } | { day: string | null }): DragChange | null {
  const has = !!(t.due_at || t.start_at)
  if ('day' in move) {
    if (move.day === null) return has ? { id: t.id, start_at: null, due_at: null } : null
    if (!has) return { id: t.id, start_at: null, due_at: move.day }
    const cur = (t.due_at ?? t.start_at)!.slice(0, 10)
    return dateDrag(t, { delta: Math.round((Date.parse(`${move.day}T00:00:00Z`) - Date.parse(`${cur}T00:00:00Z`)) / 86_400_000) })
  }
  if (!move.delta || !has) return null
  // 시작만 있는 일: 시작을 마감으로 본다(한 점)
  if (!t.due_at) return { id: t.id, start_at: null, due_at: shiftKeep(t.start_at!, move.delta) }
  const item = { key: t.id, task: { id: t.id, start_at: t.start_at, due_at: t.due_at }, start: t.start_at ?? t.due_at, end: t.due_at, allDay: !t.due_at.includes('T'), virtual: false } as unknown as CalItem
  return monthMoveChanges([item], move.delta)[0]
}
const shiftKeep = (f: string, d: number) => (f.includes('T') ? `${addDays(f.slice(0, 10), d)}${f.slice(10)}` : addDays(f, d))

/** 포인터 y(줄 영역 기준) → 놓을 줄. 줄 밖(위·아래)이면 가장 가까운 줄 */
export function laneAt(y: number, lanes: { kind: WorkKind; top: number; height: number }[]): WorkKind | null {
  if (!lanes.length) return null
  for (const l of lanes) if (y >= l.top && y < l.top + l.height) return l.kind
  return y < lanes[0].top ? lanes[0].kind : lanes[lanes.length - 1].kind
}
/** 끄는 동안 보여 줄 줄 목록: 지금 보이는 줄 + (모든 종류를 놓을 수 있게) 빈 종류도 맨 아래에 얇게 */
export const allKinds = (shown: WorkKind[]) => [...shown, ...WORK_KINDS.filter((k) => !shown.includes(k))]

/** 순서 선 잇기 검사 */
export function orderCheck(links: { kind: string; from_id: string; to_id: string; state: string }[], from: string, to: string): 'ok' | 'self' | 'exists' | 'cycle' {
  if (from === to) return 'self'
  if (links.some((l) => l.kind === 'sequence' && l.state === 'accepted' && l.from_id === from && l.to_id === to)) return 'exists'
  return wouldCycle(links.filter((l) => l.state === 'accepted') as never, from, to) ? 'cycle' : 'ok'
}

// ── 할 일 넣기 검색 ──
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
/** 퍼지 점수(높을수록 먼저, 0 = 안 맞음): 띄어쓰기 무시, 낱말 순서 무관, 모든 낱말이 들어 있어야 함, 앞에서 맞으면 더 높게. 한 낱말은 글자 순서대로 흩어져도 맞음 */
export function fuzzyScore(query: string, title: string): number {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  const t = norm(title)
  let score = 0
  for (const w of words) {
    const i = t.indexOf(w)
    if (i >= 0) { score += 10 + (i === 0 ? 5 : 0) + w.length; continue }
    // 흩어진 글자(예: "공전" → "공모전")
    let k = 0
    for (const ch of t) if (ch === w[k]) k++
    if (k < w.length) return 0
    score += 2
  }
  return score
}
export function searchTasks<T extends { id: string; title: string; status: number }>(tasks: T[], query: string, exclude: Set<string>, n = 40): T[] {
  return tasks
    .filter((t) => !exclude.has(t.id))
    .map((t) => ({ t, s: fuzzyScore(query, t.title) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => Number(a.t.status !== 0) - Number(b.t.status !== 0) || b.s - a.s)
    .slice(0, n)
    .map((x) => x.t)
}

// ── 관계도 ──
export type RelNodeKind = 'project' | 'task' | 'person' | 'note' | 'list' | 'other'
export type RelNode = { id: string; kind: RelNodeKind; ref: string; label: string; sub?: string; task?: PTaskRow; auto?: boolean; count?: number }
export type RelEdgeKind = 'member' | 'order' | 'related' | 'person' | 'note' | 'list' | 'other'
export type RelEdge = { id: string; kind: RelEdgeKind; source: string; target: string; ref?: string; label?: string }
export type RelInput = {
  p: ProjectView
  /** 구성원에 붙은 사람 태그(accepted) */
  personLinks: { task_id: string; tag_id: string; name: string }[]
  /** 프로젝트에 바로 이은 사람(relations tag→tag field project) */
  projectPeople: { tag_id: string; name: string }[]
  /** 메모 관계: note → 프로젝트 태그 또는 구성원 할 일 */
  notes: { id: string; title: string; to_type: 'tag' | 'task'; to_id: string; rel_id?: string }[]
  /** 위키 주제(프로젝트 옆 칸 메모 topic) */
  topics?: { id: string; title: string }[]
  /** 관련 선(task ↔ task) */
  related: { id: string; from_id: string; to_id: string }[]
  /** 구성원이 겹치는 다른 프로젝트 */
  others: { id: string; title: string; emoji: string; shared: number }[]
}
export const NID = { project: (id: string) => `p:${id}`, task: (id: string) => `t:${id}`, person: (id: string) => `u:${id}`, note: (id: string) => `n:${id}`, topic: (id: string) => `w:${id}`, list: (id: string) => `l:${id}`, other: (id: string) => `x:${id}` }
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

export function buildRelationGraph(i: RelInput): { nodes: RelNode[]; edges: RelEdge[] } {
  const { p } = i
  const center = NID.project(p.tag.id)
  const nodes: RelNode[] = [{ id: center, kind: 'project', ref: p.tag.id, label: p.tag.name.trim(), sub: `${p.members.length}개 · 남음 ${p.open}` }]
  const edges: RelEdge[] = []
  const member = new Set(p.members.map((m) => m.id))
  for (const t of p.members) {
    const day = t.due_at ?? t.start_at ?? (t.status !== 0 ? t.completed_at : null)
    nodes.push({ id: NID.task(t.id), kind: 'task', ref: t.id, label: t.title, sub: day ? md(day.slice(0, 10)) : undefined, task: t, auto: p.via.get(t.id) === 'auto' })
    edges.push({ id: `m:${t.id}`, kind: 'member', source: center, target: NID.task(t.id), ref: t.id })
  }
  for (const l of p.seq) if (member.has(l.from_id) && member.has(l.to_id)) edges.push({ id: `o:${l.id}`, kind: 'order', source: NID.task(l.from_id), target: NID.task(l.to_id), ref: l.id })
  for (const r of i.related) if (member.has(r.from_id) && member.has(r.to_id)) edges.push({ id: `r:${r.id}`, kind: 'related', source: NID.task(r.from_id), target: NID.task(r.to_id), ref: r.id })
  // 사람: 할 일에 붙은 것 + 프로젝트에 바로 이은 것
  const people = new Map<string, string>()
  for (const l of i.personLinks) if (member.has(l.task_id)) { people.set(l.tag_id, l.name); edges.push({ id: `u:${l.tag_id}:${l.task_id}`, kind: 'person', source: NID.task(l.task_id), target: NID.person(l.tag_id), ref: l.task_id }) }
  for (const pp of i.projectPeople) { people.set(pp.tag_id, pp.name); edges.push({ id: `u:${pp.tag_id}:p`, kind: 'person', source: center, target: NID.person(pp.tag_id), ref: p.tag.id }) }
  for (const [id, name] of people) {
    const n = i.personLinks.filter((l) => l.tag_id === id && member.has(l.task_id)).length
    nodes.push({ id: NID.person(id), kind: 'person', ref: id, label: `👤 ${name}`, sub: n ? `할 일 ${n}` : '프로젝트', count: n })
  }
  // 메모
  const noteIds = new Set<string>()
  for (const n of i.notes) {
    const target = n.to_type === 'tag' ? (n.to_id === p.tag.id ? center : null) : member.has(n.to_id) ? NID.task(n.to_id) : null
    if (!target) continue
    if (!noteIds.has(n.id)) { noteIds.add(n.id); nodes.push({ id: NID.note(n.id), kind: 'note', ref: n.id, label: `📄 ${n.title}`, sub: '수집함' }) }
    edges.push({ id: `n:${n.id}:${n.to_id}`, kind: 'note', source: NID.note(n.id), target, ref: n.to_id })
  }
  for (const tp of i.topics ?? []) {
    nodes.push({ id: NID.topic(tp.id), kind: 'note', ref: tp.id, label: `📄 ${tp.title}`, sub: '수집함 위키' })
    edges.push({ id: `w:${tp.id}`, kind: 'note', source: NID.topic(tp.id), target: center, ref: p.tag.id })
  }
  // 리스트(구성원이 있는 곳) · 관련 프로젝트
  for (const l of p.lists) {
    nodes.push({ id: NID.list(l.id), kind: 'list', ref: l.id, label: `${l.emoji ?? '📋'} ${l.name}`, sub: `${l.count}개`, count: l.count })
    edges.push({ id: `l:${l.id}`, kind: 'list', source: NID.list(l.id), target: center, label: String(l.count) })
  }
  for (const o of i.others) {
    nodes.push({ id: NID.other(o.id), kind: 'other', ref: o.id, label: `${o.emoji} ${o.title}`, sub: `겹친 일 ${o.shared}`, count: o.shared })
    edges.push({ id: `x:${o.id}`, kind: 'other', source: center, target: NID.other(o.id), label: String(o.shared) })
  }
  return { nodes, edges }
}

/** 구성원이 겹치는 다른 프로젝트 */
export function overlapping(p: ProjectView, all: ProjectView[]): RelInput['others'] {
  const mine = new Set(p.members.map((m) => m.id))
  return all.filter((o) => o.tag.id !== p.tag.id).map((o) => ({ id: o.tag.id, title: o.title, emoji: o.emoji, shared: o.members.filter((m) => mine.has(m.id)).length })).filter((o) => o.shared > 0)
}

/** 방사형 자리(가운데 = 0,0, 노드 가운데 좌표): 할 일은 첫 고리에 날짜 순 시계 방향(12시부터), 바깥 노드는 이어진 할 일 각도의 평균 쪽 둘째 고리.
 * 바깥 노드끼리는 최소 각도 간격으로 민다. 결정적(같은 입력 = 같은 자리) */
export function radialLayout(g: { nodes: RelNode[]; edges: RelEdge[] }): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  const center = g.nodes.find((n) => n.kind === 'project')
  if (center) pos.set(center.id, { x: 0, y: 0 })
  const tasks = g.nodes.filter((n) => n.kind === 'task').sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || a.label.localeCompare(b.label))
  const r1 = Math.max(240, (tasks.length * 190) / (2 * Math.PI))
  const angle = new Map<string, number>()
  tasks.forEach((n, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, tasks.length)
    angle.set(n.id, a)
    pos.set(n.id, { x: Math.round(r1 * Math.cos(a)), y: Math.round(r1 * Math.sin(a)) })
  })
  const outer = g.nodes.filter((n) => n.kind !== 'task' && n.kind !== 'project')
  const want = outer.map((n, k) => {
    const near = g.edges.filter((e) => (e.source === n.id || e.target === n.id)).map((e) => (e.source === n.id ? e.target : e.source)).filter((id) => angle.has(id)).map((id) => angle.get(id)!)
    let a: number
    if (near.length) { const sx = near.reduce((s, x) => s + Math.cos(x), 0), sy = near.reduce((s, x) => s + Math.sin(x), 0); a = Math.atan2(sy, sx) }
    else a = Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, outer.length) // 이어진 할 일이 없으면 아래쪽부터 고르게
    return { n, a: norm2pi(a) }
  }).sort((x, y) => x.a - y.a || x.n.id.localeCompare(y.n.id))
  const r2 = r1 + 210
  const gap = Math.min((2 * Math.PI) / Math.max(1, want.length), 230 / r2)
  for (let k = 1; k < want.length; k++) if (want[k].a - want[k - 1].a < gap) want[k].a = want[k - 1].a + gap
  for (const w of want) pos.set(w.n.id, { x: Math.round(r2 * Math.cos(w.a)), y: Math.round(r2 * Math.sin(w.a)) })
  return pos
}
const dayOf = (n: RelNode) => (n.task ? (n.task.due_at ?? n.task.start_at ?? n.task.completed_at ?? '9999') : '9999')
const norm2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

/** 핸들로 이은 두 노드 → 할 일. 순서는 보낸 쪽 → 받은 쪽 */
export type ConnectPlan =
  | { kind: 'order'; from: string; to: string }
  | { kind: 'person'; task: string; person: string }
  | { kind: 'projectPerson'; person: string }
  | { kind: 'note'; note: string; to: { type: 'task' | 'tag'; id: string } }
  | { kind: 'none' }
export function connectPlan(a: RelNode | undefined, b: RelNode | undefined): ConnectPlan {
  if (!a || !b || a.id === b.id) return { kind: 'none' }
  const pair = (x: RelNodeKind, y: RelNodeKind) => (a.kind === x && b.kind === y) || (a.kind === y && b.kind === x)
  const pick = (k: RelNodeKind) => (a.kind === k ? a : b)
  if (a.kind === 'task' && b.kind === 'task') return { kind: 'order', from: a.ref, to: b.ref }
  if (pair('task', 'person')) return { kind: 'person', task: pick('task').ref, person: pick('person').ref }
  if (pair('project', 'person')) return { kind: 'projectPerson', person: pick('person').ref }
  if (pair('task', 'note') && pick('note').id.startsWith('n:')) return { kind: 'note', note: pick('note').ref, to: { type: 'task', id: pick('task').ref } }
  if (pair('project', 'note') && pick('note').id.startsWith('n:')) return { kind: 'note', note: pick('note').ref, to: { type: 'tag', id: pick('project').ref } }
  return { kind: 'none' }
}

// ── 31 §12.10.4 빠른 추가 프로젝트 알약 ──
export type ChipProject = { id: string; name: string; aliases: string | null; category: string | null; last: string | null }
/** 제목 → 알약(최대 n): 이름·별칭이 든 특정 프로젝트 먼저, 그다음 같은 분류 프로젝트(마지막 날짜가 오늘에 가까운 순). 제목에 분류·프로젝트 말이 없으면 [] */
export function rankProjectChips(title: string, projects: ChipProject[], today: string, n = 4): ChipProject[] {
  const t = tagKeyCompact(title)
  if (!t) return []
  const names = (p: ChipProject) => [p.name, ...parseAliasList(p.aliases)].map(tagKeyCompact).filter((x) => [...x].length >= 2)
  const hit = projects.filter((p) => names(p).some((k) => t.includes(k)))
  const cat = categoryOfName(title)
  const near = (p: ChipProject) => (p.last ? Math.abs(Date.parse(`${p.last.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) : Infinity)
  const sibs = cat ? projects.filter((p) => p.category === cat && !hit.includes(p)).sort((a, b) => near(a) - near(b) || a.name.localeCompare(b.name)) : []
  const cats = new Set(hit.map((p) => p.category).filter(Boolean))
  const more = !cat && cats.size ? projects.filter((p) => !hit.includes(p) && p.category && cats.has(p.category)).sort((a, b) => near(a) - near(b)) : []
  return [...hit, ...sibs, ...more].slice(0, n)
}
const tagKeyCompact = (s: string) => projectTitleOf(s).toLowerCase().replace(/[\s\-_·.,/()[\]{}'"`#]+/g, '')
const parseAliasList = (raw: string | null) => { try { const a = JSON.parse(raw ?? '[]'); return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [] } catch { return [] } }

// ── 31 §12.11 단계 보드 ──
/**
 * 프로젝트의 **주 단계 줄**: 구성원끼리 이은 순서 선(map_links sequence)으로 이어진 덩어리 중 할 일이 가장 많은 것(같으면 열린 일 많은 것 → 늦은 마감).
 * 순서 = 위상 정렬(앞 일 먼저, 같은 차례면 날짜 → 제목). 목표(🎯) = 단계들이 모두 같은 부모를 가지면 그 부모(구성원일 때), 아니면 null.
 * 현재 단계 = 순서대로 첫 열린 단계. 단계가 아닌 구성원은 rest(타임라인·관계도에 그대로, 단계 보드로 끌어 넣을 수 있음).
 */
export function mainSteps(p: Pick<ProjectView, 'members' | 'seq'>): { steps: PTaskRow[]; goal: PTaskRow | null; current: string | null; links: { id: string; from_id: string; to_id: string }[]; rest: PTaskRow[] } {
  const byId = new Map(p.members.map((m) => [m.id, m]))
  const edges = p.seq.filter((l) => l.from_id !== l.to_id && byId.has(l.from_id) && byId.has(l.to_id))
  // 덩어리(방향 무시)
  const parent = new Map<string, string>()
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r }
  for (const e of edges) for (const x of [e.from_id, e.to_id]) if (!parent.has(x)) parent.set(x, x)
  for (const e of edges) { const a = find(e.from_id), b = find(e.to_id); if (a !== b) parent.set(a, b) }
  const comps = new Map<string, string[]>()
  for (const x of parent.keys()) (comps.get(find(x)) ?? comps.set(find(x), []).get(find(x))!).push(x)
  const score = (ids: string[]) => [ids.length, ids.filter((id) => byId.get(id)!.status === 0).length, ids.map((id) => byId.get(id)!.due_at ?? '').sort().pop() ?? ''] as const
  const best = [...comps.values()].sort((a, b) => { const x = score(a), y = score(b); return y[0] - x[0] || y[1] - x[1] || y[2].localeCompare(x[2]) })[0] ?? []
  const inC = new Set(best)
  const cl = edges.filter((e) => inC.has(e.from_id) && inC.has(e.to_id))
  // 위상 정렬(고리가 있어도 끝나게 — 남은 것은 날짜 순으로 붙임)
  const indeg = new Map(best.map((id) => [id, 0]))
  for (const e of cl) indeg.set(e.to_id, (indeg.get(e.to_id) ?? 0) + 1)
  const key = (id: string) => { const t = byId.get(id)!; return `${t.due_at ?? t.start_at ?? '9999'}|${t.title}` }
  const ready = best.filter((id) => !indeg.get(id)).sort((a, b) => key(a).localeCompare(key(b)))
  const order: string[] = []
  while (ready.length) {
    const id = ready.shift()!
    order.push(id)
    for (const e of cl.filter((x) => x.from_id === id)) { indeg.set(e.to_id, indeg.get(e.to_id)! - 1); if (!indeg.get(e.to_id)) { ready.push(e.to_id); ready.sort((a, b) => key(a).localeCompare(key(b))) } }
  }
  for (const id of best.sort((a, b) => key(a).localeCompare(key(b)))) if (!order.includes(id)) order.push(id)
  const steps = order.map((id) => byId.get(id)!)
  const parents = new Set(steps.map((s) => s.parent_id ?? ''))
  const gid = parents.size === 1 ? [...parents][0] : ''
  const goal = gid && byId.has(gid) ? byId.get(gid)! : null
  return { steps, goal, current: steps.find((s) => s.status === 0)?.id ?? null, links: cl.map((l) => ({ id: (l as { id?: string }).id ?? '', from_id: l.from_id, to_id: l.to_id })), rest: p.members.filter((m) => !inC.has(m.id) && m.id !== goal?.id) }
}
/** 단계 순서를 바꾸면 새로 둘 순서 선(앞 → 뒤 이웃끼리) */
export const chainPairs = (ids: string[]) => ids.slice(1).map((id, i) => [ids[i], id] as [string, string])
/** 끌어서 옮기기: from 자리의 단계를 to 자리로 */
export function moveStep(ids: string[], from: number, to: number): string[] {
  const out = [...ids]
  const [x] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x)
  return out
}
