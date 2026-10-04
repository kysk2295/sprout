// 32 §9.2 알림 설정(user_prefs.notify_json) — 사용자 단위라 데스크톱에서 바꾸면 동기화로 휴대폰(서버 푸시)에 간다.
// 읽기·기본값은 공용 parseNotifyPrefs(휴대폰·서버와 같은 규칙), 쓰기는 일반 동기화 쓰기(update/insert → /sync/upload).
import { formatTimeKo } from '@sprout/schema/time'
import { DEFAULT_NOTIFY, parseNotifyPrefs, type NotifyPrefs } from '@sprout/schema/notify'
import { getDb } from './db'
import { insert, run, update, uuid } from './mutations'
import { useQuery } from './useQuery'

export { DEFAULT_NOTIFY, type NotifyPrefs }
export type NotifyPatch = Partial<Pick<NotifyPrefs, 'reminders' | 'hideTitles'>> & { daily?: Partial<NotifyPrefs['daily']>; growth?: Partial<NotifyPrefs['growth']> }

/** 바꾼 칸만 덮는다(daily·growth는 안쪽까지). 결과는 다시 parse해서 깨진 값(시각 형식 등)은 기본값으로 */
export function mergeNotify(cur: NotifyPrefs, patch: NotifyPatch): NotifyPrefs {
  const next = { ...cur, ...patch, daily: { ...cur.daily, ...patch.daily }, growth: { ...cur.growth, ...patch.growth } }
  return parseNotifyPrefs(JSON.stringify(next))
}

export function useNotifyPrefs(): { prefs: NotifyPrefs; ready: boolean } {
  const rows = useQuery<{ notify_json: string | null }>('SELECT notify_json FROM user_prefs ORDER BY created_at LIMIT 1')
  return { prefs: parseNotifyPrefs(rows?.[0]?.notify_json), ready: !!rows }
}

/** 지금 DB 값을 다시 읽어 합친다(다른 기기·창이 방금 바꾼 칸을 덮지 않게). 전체 JSON을 쓴다 — 서버·휴대폰은 칸 하나만 읽지 않는다 */
export async function saveNotifyPrefs(patch: NotifyPatch): Promise<NotifyPrefs> {
  const db = await getDb()
  const row = await db.get<{ id: string; notify_json: string | null }>('SELECT id, notify_json FROM user_prefs ORDER BY created_at LIMIT 1')
  const next = mergeNotify(parseNotifyPrefs(row?.notify_json), patch)
  const notify_json = JSON.stringify(next)
  // id는 uuid: 고정 id면 서버에서 다른 사용자와 겹친다(preferences.ts와 같음)
  await run(row ? update('user_prefs', row.id, { notify_json }) : insert('user_prefs', { id: uuid(), notify_json }))
  return next
}

/** 하루 요약 시각 고르기: 30분 간격 48개 + 지금 값이 그 사이면 끼워 넣는다(휴대폰 휠에서 08:15를 골랐을 때) */
export function dailyTimeOptions(current: string): { value: string; label: string }[] {
  const grid = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
  const all = grid.includes(current) ? grid : [...grid, current].sort()
  return all.map((value) => ({ value, label: formatTimeKo(value) }))
}
