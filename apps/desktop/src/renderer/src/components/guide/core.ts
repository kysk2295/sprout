// 37 탭 사용법 공통 — DOM·React 없이 시험할 수 있는 순수 규칙.
// 언제 뜨나 · 한 번에 하나 · 기기 기억 · 가리킬 곳 찾기(없으면 가운데) · 카드 자리.
// 34 작업 지도 사용법에서 나왔다(2026-10-05 버그: 대상이 없으면 카드가 -9999px에 놓이고 막만 남아 화면이 막혔다).

export type GuideTab = 'tasks' | 'calendar' | 'growth' | 'assistant' | 'collect' | 'diary' | 'map'
export const GUIDE_TABS: GuideTab[] = ['tasks', 'calendar', 'growth', 'assistant', 'collect', 'diary', 'map']

/** 레일 보기 → 사용법 탭. 수집함 세 칸(수집·볼 것·위키)은 한 사용법. 그 밖(설정 등)은 없음 */
export function guideTabOf(view: string): GuideTab | null {
  if (view === 'notes' || view === 'watch' || view === 'wiki') return 'collect'
  return (GUIDE_TABS as string[]).includes(view) ? (view as GuideTab) : null
}

// ── 기기 기억(동기화 안 함 — 18 §0-3과 같은 이유) ──
export type Seen = { tour: 'new' | 'done' }
type Store = Pick<Storage, 'getItem' | 'setItem'>
/** 작업 지도는 34 때 쓰던 키를 그대로(이미 끝낸 사람에게 다시 뜨지 않게) */
export const seenKey = (tab: GuideTab) => (tab === 'map' ? 'sprout.map.guide' : `sprout.guide.${tab}`)
const store = (): Store | null => { try { return globalThis.localStorage ?? null } catch { return null } }

export function loadSeen(tab: GuideTab, s: Store | null = store()): Seen {
  try {
    const raw = s?.getItem(seenKey(tab))
    const v = raw ? JSON.parse(raw) : null
    return { tour: v?.tour === 'done' ? 'done' : 'new' }
  } catch { return { tour: 'new' } }
}
/** 다른 필드(작업 지도 옛 hints 등)는 그대로 둔다 */
export function saveSeen(tab: GuideTab, seen: Seen, s: Store | null = store()) {
  try {
    let prev: object = {}
    try { prev = JSON.parse(s?.getItem(seenKey(tab)) ?? '{}') ?? {} } catch { /* 깨진 값은 덮는다 */ }
    s?.setItem(seenKey(tab), JSON.stringify({ ...prev, ...seen }))
  } catch { /* 기억만 못 한다 */ }
}

// ── 이번 실행 동안만 닫기(✕ · Esc · 막 누르기 — 18 §4와 같은 규칙) ──
const closedRun = new Set<GuideTab>()
export const markClosed = (tab: GuideTab) => { closedRun.add(tab) }
export const wasClosed = (tab: GuideTab) => closedRun.has(tab)

// ── 한 번에 둘러보기 하나 ──
let active: GuideTab | null = null
export const activeTour = () => active
/** 이미 다른 탭 둘러보기가 떠 있으면 false */
export function claimTour(tab: GuideTab): boolean {
  if (active && active !== tab) return false
  active = tab
  return true
}
export function releaseTour(tab: GuideTab) { if (active === tab) active = null }
/** 시험용 — 실행 상태 초기화 */
export function resetGuideRun() { closedRun.clear(); active = null }

/** 저절로 뜨는 조건. ready = 그 탭 자료가 다 읽힘, allowed = 탭별 추가 조건(작업 지도 = 계획 화면일 때만) */
export function shouldAutoTour(o: { ready: boolean; done: boolean; closedThisRun: boolean; open: boolean; allowed?: boolean }): boolean {
  return o.ready && !o.done && !o.closedThisRun && !o.open && o.allowed !== false
}

/** 둘러보기를 시작하지 않고 기다리는 것: 팝오버 · 다른 창 · 첫 실행 안내 · 옵션 보기 같은 막 · 다른 둘러보기 */
export const BLOCKERS = '.popover, [aria-modal="true"], .onb-scrim, .modal-scrim, .mg-tour'
/** 둘러보기 중에 이것이 새로 뜨면 둘러보기를 조용히 접는다(이번 실행 닫기 아님 — 닫히면 다시) */
export const INTERRUPTERS = '.onb-scrim, .modal-scrim, .desktop-dialog'

// ── 가리킬 곳 ──
export type TourBox = { left: number; top: number; width: number; height: number }
/** 선택자 하나에 맞는 모든 요소의 상자(문서 순) — 화면에서는 querySelectorAll, 시험에서는 가짜 */
export type BoxQuery = (selector: string) => TourBox[]

export function boxVisible(b: TourBox, view: { W: number; H: number }): boolean {
  return b.width > 2 && b.height > 2 && b.top + b.height > 0 && b.left + b.width > 0 && b.top < view.H && b.left < view.W
}
function union(bs: TourBox[]): TourBox {
  const l = Math.min(...bs.map((b) => b.left)), t = Math.min(...bs.map((b) => b.top))
  const r = Math.max(...bs.map((b) => b.left + b.width)), btm = Math.max(...bs.map((b) => b.top + b.height))
  return { left: l, top: t, width: r - l, height: btm - t }
}
/**
 * 후보를 차례로 보고 처음 보이는 것. `@all:선택자` = 맞는 것 모두를 감싼 상자(예: 스마트 목록 다섯 줄).
 * 아무것도 없으면 null → 카드는 화면 가운데(막만 남는 일 없음).
 */
export function pickTarget(targets: string[], query: BoxQuery, view: { W: number; H: number }): TourBox | null {
  for (const t of targets) {
    const all = t.startsWith('@all:')
    const boxes = query(all ? t.slice(5) : t).filter((b) => boxVisible(b, view))
    if (!boxes.length) continue
    return all ? union(boxes) : boxes[0]
  }
  return null
}

/** 카드 자리 — 대상 아래(자리 없으면 위, 그것도 없으면 안쪽 아래), 대상이 없으면 화면 가운데. 언제나 화면 안 */
export function placeTourCard(box: TourBox | null, card: { w: number; h: number }, view: { W: number; H: number }, gap = 14): { left: number; top: number } {
  const { w, h } = card, { W, H } = view
  let left: number, top: number
  if (!box) { left = (W - w) / 2; top = (H - h) / 2 }
  else {
    left = box.left + box.width / 2 - w / 2
    if (box.top + box.height + gap + h < H - 8) top = box.top + box.height + gap
    else if (box.top - gap - h > 8) top = box.top - gap - h
    else top = box.top + box.height - h - 28 // 큰 영역(본문)은 안쪽 아래
  }
  return { left: Math.max(8, Math.min(left, W - w - 8)), top: Math.max(8, Math.min(top, H - h - 8)) }
}

// ── 레일 도움말 → 지금 탭 사용법 ──
export const OPEN_GUIDE = 'sprout:open-guide'
export type OpenGuideDetail = { tab: GuideTab; handled: boolean }
/** 지금 화면에 그 탭의 `?` 버튼이 있으면 사용법 창을 연다. 없으면 false(→ 단축키 시트) */
export function requestGuide(tab: GuideTab | null): boolean {
  if (!tab || typeof window === 'undefined') return false
  const detail: OpenGuideDetail = { tab, handled: false }
  window.dispatchEvent(new CustomEvent(OPEN_GUIDE, { detail }))
  return detail.handled
}
/** 사용법 창 아래 `단축키 모음`·레시피 `빠른 추가 열기`가 App에 부탁하는 이벤트 */
export const OPEN_SHORTCUTS = 'sprout:open-shortcuts'
export const OPEN_QUICK_ADD = 'sprout:open-quick-add'
