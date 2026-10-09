// 수집함 안 신호: 위키 페이지 출처 꼬리표 → 수집 탭으로 바뀌며 그 항목 상세 시트(26 §4)
type Handler = (id: string) => void
const hs = new Set<Handler>()
export const openItem = { emit: (id: string) => hs.forEach((h) => h(id)), on: (h: Handler) => { hs.add(h); return () => { hs.delete(h) } } }
// 47 §19.1 AI 비서 메모 카드 → 그 항목 상세: 수집함 탭이 아직 안 그려졌으면 그려질 때 연다(takeItem)
let pending: string | null = null
export function requestItem(id: string) { if (hs.size) openItem.emit(id); else pending = id }
export function takeItem(): string | null { const id = pending; pending = null; return id }
