// 31 §10 작업 지도 쓰는 순간·모드 — 모드 묶음(프리셋), 네 순간 감지(큰 일 · ⚡ 줄 · 주간 점검 · 정리), 기기 기억, 지도 열기 요청.
// 감지는 순수 함수(tests/map-moments.test.ts). 기기 기억은 localStorage `sprout.map.moments`(동기화 안 함, 34 §6과 같은 이유).
import { addDays } from '@sprout/schema/time'
import { weekStart } from '../lib/calendar'

// ── 모드 ──
export type MapMode = 'plan' | 'review' | 'tidy'
export const MAP_MODES: MapMode[] = ['plan', 'review', 'tidy']
export const MODE_LABEL: Record<MapMode, string> = { plan: '계획', review: '점검', tidy: '정리' }
export const isMapMode = (v: unknown): v is MapMode => typeof v === 'string' && (MAP_MODES as string[]).includes(v)

/**
 * 모드가 보기를 정한다(§10.2, 2026-10-05 정리): 계획 = 그래프(⇄ 보드 아이콘), 점검 = 타임라인, 정리 = 구조 그래프.
 * 묶기·기간도 모드가 정한다 — 점검 = 목표로 묶기(이번 주 목표가 없으면 리스트), 나머지 = 리스트 · 기간은 늘 전체.
 */
export type MapView = 'graph' | 'board' | 'timeline'
export function modeView(mode: MapMode, planView: MapView): MapView {
  if (mode === 'review') return 'timeline'
  return mode === 'plan' && planView === 'board' ? 'board' : 'graph'
}
export const modeGroupBy = (mode: MapMode, goalCount: number): 'list' | 'goal' => (mode === 'review' && goalCount > 0 ? 'goal' : 'list')
/** 모드를 고를 때 한 번 덮어쓰는 것: 완료 보이기 · 타임라인 배율(오늘로 이동) */
export const MODE_PRESET: Record<MapMode, { showDone: boolean; timeline?: { scale: 'week' } }> = {
  plan: { showDone: false },
  review: { showDone: true, timeline: { scale: 'week' } },
  tidy: { showDone: false }
}

// ── ① 큰 일 ──
/** 덩어리 낱말 [임시] — 한 줄짜리로는 시작이 안 되는 일 */
export const CHUNKY_WORDS = ['작성', '준비', '기획', '프로젝트', '계획', '설계', '보고서', '발표', '논문', '지원서', '포트폴리오', '제안서', '사업계획', '리서치', '조사', '이사', '여행', '개발', '구축', '정리하기']
const CHUNKY_EN = /\b(plan|project|report|proposal|draft|prepare)\b/i
export const BIG = { farDays: 7, manyChildren: 3 }

export type BigTaskInput = { id: string; title: string; status: number; parent_id: string | null; due_at: string | null; deleted_at?: string | null }
export type BigKind = 'split' | 'order'
/**
 * 큰 일 규칙(§10.3): 열림·최상위·제목 있음·휴지통 아님, 그리고
 * (a) 열린 하위 0 + 덩어리 낱말 (b) 열린 하위 0 + 마감 ≥ 오늘+7일 → 'split'(쪼개기) · (c) 열린 하위 ≥ 3 → 'order'(순서 잡기)
 */
export function bigTaskKind(t: BigTaskInput, openChildren: number, today: string): BigKind | null {
  return bigTaskSignal(t, openChildren, today)?.kind ?? null
}
/** 신호 세기: 덩어리 낱말 + 먼 마감이 둘 다면 2 — 한 목록에서 가장 센 것 하나에 칩을 단다 */
export function bigTaskSignal(t: BigTaskInput, openChildren: number, today: string): { kind: BigKind; score: number } | null {
  if (t.status !== 0 || t.parent_id || t.deleted_at || !t.title.trim()) return null
  if (openChildren >= BIG.manyChildren) return { kind: 'order', score: 1 }
  if (openChildren > 0) return null
  const chunky = CHUNKY_WORDS.some((w) => t.title.includes(w)) || CHUNKY_EN.test(t.title)
  const due = t.due_at?.slice(0, 10)
  const far = !!due && due >= addDays(today, BIG.farDays)
  const score = (chunky ? 1 : 0) + (far ? 1 : 0)
  return score ? { kind: 'split', score } : null
}

/** 한 목록에 칩 하나만: 신호가 가장 센 큰 일(같으면 보이는 순서로 위), 본/닫은 것 빼고 */
export function pickBigTask(rows: BigTaskInput[], today: string, seen: ReadonlySet<string>, childCounts?: ReadonlyMap<string, number>): { id: string; kind: BigKind } | null {
  // 열린 하위 수: 목록에 안 보이는 하위도 있을 수 있어(오늘 목록 등) 화면이 따로 센 값을 우선
  const open = new Map<string, number>(childCounts ?? [])
  if (!childCounts) for (const r of rows) if (r.parent_id && r.status === 0 && !r.deleted_at) open.set(r.parent_id, (open.get(r.parent_id) ?? 0) + 1)
  let best: { id: string; kind: BigKind; score: number } | null = null
  for (const r of rows) {
    if (seen.has(r.id)) continue
    const s = bigTaskSignal(r, open.get(r.id) ?? 0, today)
    if (s && (!best || s.score > best.score)) best = { id: r.id, ...s }
  }
  return best && { id: best.id, kind: best.kind }
}

// ── ② ⚡ 줄 ──
export const NOW_LINE = { many: 10, overdue: 5, firstOpenMin: 3, show: 3 }
/** 오늘 목록 ⚡ 줄을 보일까(§10.3 ②): 닫은 날이면 안 보임. 열린 ≥10 · 기한 지남 ≥5 · 오늘 처음 연 때(열린 ≥3) */
export function nowLineDue(s: { open: number; overdue: number; today: string; dismissedDay?: string | null; firstOpenDay?: string | null }): boolean {
  if (s.dismissedDay === s.today) return false
  if (s.open >= NOW_LINE.many || s.overdue >= NOW_LINE.overdue) return true
  return s.open >= NOW_LINE.firstOpenMin && s.firstOpenDay !== s.today
}

// ── ③ 주간 점검 ──
export const REVIEW_WINDOW = { sundayFrom: 20, mondayUntil: 12 }
/** 점검 카드를 띄울 주(시작 월요일) — 일요일 20:00 이후면 이번 주, 월요일 12:00 전이면 지난주, 그 밖 null */
export function reviewWeek(now: Date): string | null {
  const day = now.getDay()
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = key(now)
  if (day === 0 && now.getHours() >= REVIEW_WINDOW.sundayFrom) return weekStart(today)
  if (day === 1 && now.getHours() < REVIEW_WINDOW.mondayUntil) return addDays(weekStart(today), -7)
  return null
}
export function reviewDue(now: Date, doneWeek?: string | null): string | null {
  const w = reviewWeek(now)
  return w && w !== doneWeek ? w : null
}

/** 점검 띠 7칸(§10.2.1): 월~일 날마다 그 날 마감 할 일, 막대 모양 = 끝냄·밀림·남음 */
export type WeekBar = { id: string; title: string; tone: 'done' | 'miss' | 'open' }
export function weekColumns(tasks: { id: string; title: string; status: number; due_at: string | null; parent_id?: string | null }[], week: string, today: string): { day: string; bars: WeekBar[] }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(week, i)
    const bars = tasks.filter((t) => t.due_at?.slice(0, 10) === day && t.status !== 2).map((t) => ({
      id: t.id, title: t.title, tone: t.status === 1 ? 'done' as const : day < today ? 'miss' as const : 'open' as const
    }))
    bars.sort((a, b) => ({ miss: 0, open: 1, done: 2 })[a.tone] - ({ miss: 0, open: 1, done: 2 })[b.tone])
    return { day, bars }
  })
}
/** 밀린 일 = 열린 최상위 할 일 중 마감이 오늘 전 · 옮길 날 = 다음 주 월요일 */
export const overdueOf = <T extends { status: number; due_at: string | null; parent_id?: string | null }>(tasks: T[], today: string) =>
  tasks.filter((t) => t.status === 0 && !t.parent_id && t.due_at && t.due_at.slice(0, 10) < today)
export const nextMonday = (today: string) => addDays(weekStart(today), 7)

// ── 기기 기억 ──
export type MomentState = { big: string[]; nowLine?: string | null; firstOpen?: string | null; review?: string | null }
const KEY = 'sprout.map.moments'
const MAX_BIG = 300
type Store = Pick<Storage, 'getItem' | 'setItem'>
const storage = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
export function loadMoments(s: Store | null = storage()): MomentState {
  try { const v = s?.getItem(KEY); const o = v ? JSON.parse(v) as Partial<MomentState> : {}; return { ...o, big: Array.isArray(o.big) ? o.big : [] } } catch { return { big: [] } }
}
const subs = new Set<() => void>()
export function saveMoments(patch: Partial<MomentState>, s: Store | null = storage()): MomentState {
  const next = { ...loadMoments(s), ...patch }
  if (next.big.length > MAX_BIG) next.big = next.big.slice(-MAX_BIG)
  try { s?.setItem(KEY, JSON.stringify(next)) } catch { /* 기억만 못 한다 */ }
  subs.forEach((f) => f())
  return next
}
export const markBigSeen = (id: string, s?: Store | null) => saveMoments({ big: [...loadMoments(s ?? storage()).big.filter((x) => x !== id), id] }, s ?? storage())
export const subscribeMoments = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

// ── 지도 열기 요청(§10.4) — 순간·딥 링크가 부른다. 지도가 아직 안 떴으면 들고 있다가 뜰 때 적용 ──
// 사용자 결정 2026-10-05 "작업 지도 = 프로젝트 한 화면": 모드 탭이 없어졌다. 점검은 성장 탭 › 주간 점검, 정리는 따로 여는 정리 화면.
// 예전 요청(mode 'review'·'tidy', sprout://map?mode=…)은 여기서 그 화면으로 돌려 보낸다.
export type MapIntent = { mode?: MapMode; task?: string; breakdown?: boolean; now?: boolean; /** 같이 계획 짜기 대화 열기(task 있으면 그 일부터) */ plan?: boolean }
export const OPEN_MAP = 'sprout:open-map'
let pending: MapIntent | null = null
export function openMap(intent: MapIntent) {
  if (intent.mode === 'review') { openScreen('review'); return }
  if (intent.mode === 'tidy') { openScreen('tidy'); return }
  pending = intent
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_MAP, { detail: intent }))
}
/** 지도 밖 화면: review = 성장 › 주간 점검, tidy = 정리 화면(분류 책상). App이 탭을 옮기고, 그 화면이 takeScreen으로 받는다 */
export type SideScreen = 'review' | 'tidy'
export const OPEN_SCREEN = 'sprout:open-screen'
let pendingScreen: SideScreen | null = null
export function openScreen(s: SideScreen) {
  pendingScreen = s
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_SCREEN, { detail: s }))
}
export const openReview = () => openScreen('review')
export const openTidy = () => openScreen('tidy')
/** 그 화면 요청이 남아 있으면 가져간다(한 번) */
export const takeScreen = (s: SideScreen): boolean => { if (pendingScreen !== s) return false; pendingScreen = null; return true }
export const takeMapIntent = (): MapIntent | null => { const p = pending; pending = null; return p }

