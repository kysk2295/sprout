// 24 §5 3번: 공유 대기열 비우기 — 본 앱이 앞으로 올 때. 입출력은 밖에서 넣어 준다(시험 가능).
// 규칙: 같은 id가 로컬에 이미 있으면 넣지 않는다(확장이 직접 올려 동기화로 내려왔거나, 지난번에 넣고 파일만 남은 경우).
// 망가진 파일·다른 계정 항목은 지운다. 넣기에 실패하면 파일을 남겨 다음에 다시.
import { parseItem, shareRow } from './row.ts'

export interface QueueIO {
  list(): Promise<string[]> // 파일 이름들
  read(name: string): Promise<string>
  remove(name: string): Promise<void>
  exists(id: string): Promise<boolean>
  insert(id: string, row: ReturnType<typeof shareRow>): Promise<void>
}
export interface DrainResult { inserted: number; skipped: number; dropped: number; failed: number }

export async function drainQueue(io: QueueIO, userId: string): Promise<DrainResult> {
  const r: DrainResult = { inserted: 0, skipped: 0, dropped: 0, failed: 0 }
  const names = (await io.list()).filter((n) => n.endsWith('.json')).sort()
  for (const name of names) {
    try {
      const item = parseItem(await io.read(name))
      if (!item || (item.user_id && item.user_id !== userId)) {
        await io.remove(name)
        r.dropped++
        continue
      }
      if (await io.exists(item.id)) r.skipped++
      else {
        await io.insert(item.id, shareRow(item.content, item.captured_at))
        r.inserted++
      }
      await io.remove(name)
    } catch (e) {
      console.warn('[share] drain failed:', name, e)
      r.failed++
    }
  }
  return r
}
