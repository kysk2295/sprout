// 수집함 안 신호: 위키 페이지 출처 꼬리표 → 수집 탭으로 바뀌며 그 항목 상세 시트(26 §4)
type Handler = (id: string) => void
const hs = new Set<Handler>()
export const openItem = { emit: (id: string) => hs.forEach((h) => h(id)), on: (h: Handler) => { hs.add(h); return () => { hs.delete(h) } } }
