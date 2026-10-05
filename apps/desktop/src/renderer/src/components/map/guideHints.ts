// 34 §4 빈 상태 한 줄 안내 — 조건(순수 함수, 시험 tests/map-guide.test.ts)
export type HintId = 'nogoal' | 'noseq' | 'nodate'
export const HINTS: Record<HintId, { text: string; cta: string }> = {
  nogoal: { text: '이번 주 목표가 아직 없어요. 목표를 정하면 할 일을 목표별로 묶어 진행을 볼 수 있어요.', cta: '목표 정하기' },
  noseq: { text: '순서가 있는 일은 할 일 아래 점을 끌어 이어 보세요. 지금 할 수 있는 일을 더 잘 골라 드려요.', cta: '방법 보기' },
  nodate: { text: '날짜가 있는 할 일이 없어 막대가 비어 있어요. 할일 정렬 칸에서 끌어다 놓으면 날짜가 잡혀요.', cta: '할일 정렬 칸 열기' }
}
/** 조건에 맞는 첫 안내 하나(34 §4). 닫은 것·둘러보기 중이면 없음 */
export function pickHint(c: { view: 'graph' | 'board' | 'timeline'; groupBy: 'list' | 'goal'; goals: number; openTasks: number; seqLinks: number; datedOpen: number; panelOpen: boolean }, dismissed: string[]): HintId | null {
  const cands: [HintId, boolean][] = [
    ['nogoal', c.view !== 'timeline' && c.groupBy === 'goal' && c.goals === 0],
    ['noseq', c.view === 'graph' && c.groupBy !== 'goal' && c.openTasks >= 2 && c.seqLinks === 0],
    ['nodate', c.view === 'timeline' && c.datedOpen === 0 && !c.panelOpen]
  ]
  return cands.find(([id, on]) => on && !dismissed.includes(id))?.[0] ?? null
}
