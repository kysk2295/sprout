// 37 탭 사용법 공통 — DOM·React 없이 시험할 수 있는 순수 규칙.
// 언제 뜨나(처음 한 번만) · 한 번에 하나 · 본 기억(기기 + 동기화) · 가리킬 곳 찾기(없으면 가운데) · 카드 자리.
// 34 작업 지도 사용법에서 나왔다(2026-10-05 버그: 대상이 없으면 카드가 -9999px에 놓이고 막만 남아 화면이 막혔다).

export type GuideTab = 'tasks' | 'calendar' | 'growth' | 'assistant' | 'collect' | 'diary' | 'map'
export const GUIDE_TABS: GuideTab[] = ['tasks', 'calendar', 'growth', 'assistant', 'collect', 'diary', 'map']

/** 레일 보기 → 사용법 탭. 수집함 세 칸(수집·볼 것·위키)은 한 사용법. 그 밖(설정 등)은 없음 */
export function guideTabOf(view: string): GuideTab | null {
  if (view === 'notes' || view === 'watch' || view === 'wiki') return 'collect'
  return (GUIDE_TABS as string[]).includes(view) ? (view as GuideTab) : null
}

// ── 본 기억 ──
// 2026-10-08 사용자: "처음에만 나오고 나중에는 아예 안 나오게". 둘러보기는 한 번 떴다가 닫히면(✕ · Esc · 막 누르기 · 마지막 `시작하기`)
// 다시는 저절로 뜨지 않는다. `다시 보지 않기`는 없앴다. 다시 보려면 머리 `?` → `둘러보기 다시 하기`.
// 기억은 계정 단위(view_settings view_key `guides` options_json {"seen":[탭…]}) — 다른 기기에서 본 것도 안 뜬다.
// 이 기기 localStorage에도 같이 적는다(동기화 행을 읽기 전 · 오프라인). 예전 기기 기억(done)은 동기화 행으로 옮긴다(guide/seen.ts).
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
/** 이 기기에 `done`으로 남은 탭들(예전 `다시 보지 않기`·`시작하기` 포함) */
export const localSeenTabs = (s: Store | null = store()): GuideTab[] => GUIDE_TABS.filter((t) => loadSeen(t, s).tour === 'done')

// ── 동기화 행(view_settings `guides`) — 본 탭은 늘기만 한다(합집합) ──
export const GUIDES_VIEW_KEY = 'guides'
/** 기기마다 따로 만든 행이 있을 수 있어 모두 합친다. 모르는 탭 이름·깨진 값은 버린다 */
export function mergeGuidesSeen(rows: { options_json: string | null }[]): GuideTab[] {
  const out = new Set<GuideTab>()
  for (const r of rows) {
    try {
      const v = JSON.parse(r.options_json ?? 'null')
      for (const t of Array.isArray(v?.seen) ? v.seen : []) if ((GUIDE_TABS as unknown[]).includes(t)) out.add(t as GuideTab)
    } catch { /* 깨진 행은 건너뜀 */ }
  }
  return GUIDE_TABS.filter((t) => out.has(t))
}
export const encodeGuidesSeen = (tabs: Iterable<GuideTab>): string => {
  const set = new Set(tabs)
  return JSON.stringify({ seen: GUIDE_TABS.filter((t) => set.has(t)) })
}

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
export function resetGuideRun() { active = null }

/**
 * 저절로 뜨는 조건 — 평생 한 번. ready = 그 탭 자료가 다 읽힘(본 기억도 읽힘), done = 이 계정에서 이미 봄(어떻게 닫았든),
 * allowed = 탭별 추가 조건(작업 지도 = 계획 화면일 때만)
 */
export function shouldAutoTour(o: { ready: boolean; done: boolean; open: boolean; allowed?: boolean }): boolean {
  return o.ready && !o.done && !o.open && o.allowed !== false
}

/** 둘러보기를 시작하지 않고 기다리는 것: 팝오버 · 다른 창 · 첫 실행 안내 · 옵션 보기 같은 막 · 다른 둘러보기 */
export const BLOCKERS = '.popover, [aria-modal="true"], .onb-scrim, .modal-scrim, .mg-tour'
/** 둘러보기 중에 이것이 새로 뜨면 둘러보기를 조용히 접는다(본 것으로 치지 않음 — 그 창이 닫히면 다시) */
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
