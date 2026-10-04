import type { ListRow } from '../../data/types'

// 14 작업 지도 v1.2 — 자리만 잡아 둠(작업 지도 담당이 채운다)
export function WorkMapView(_: { lists: ListRow[]; onOpen: (taskId: string) => void }) {
  return <main className="workspace" />
}
