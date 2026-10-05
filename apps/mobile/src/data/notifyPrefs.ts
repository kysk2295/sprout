// 32 §9.2 알림 설정 — 동기화되는 user_prefs.notify_json(데스크톱 설정 › 알림과 같은 값). 없거나 깨진 칸은 공용 기본값.
// 기기별 값(이 휴대폰의 OS 권한·push_reminders)은 여기 두지 않는다(서버 device_tokens).
import { useQuery } from '@powersync/react-native'
import { parseNotifyPrefs, type NotifyPrefs } from '@sprout/schema/notify'
import { useMemo } from 'react'
import { db, run } from './db'
import { insert, update } from './tasks'

const SQL = 'SELECT id, notify_json FROM user_prefs ORDER BY created_at LIMIT 1'
type Row = { id: string; notify_json: string | null }

export function useNotifyPrefs(): NotifyPrefs {
  const raw = useQuery<Row>(SQL).data[0]?.notify_json ?? null
  return useMemo(() => parseNotifyPrefs(raw), [raw])
}
export async function readNotifyPrefs(): Promise<NotifyPrefs> {
  const row = await db.getOptional<Row>(SQL).catch(() => null)
  return parseNotifyPrefs(row?.notify_json)
}
type Patch = Partial<Omit<NotifyPrefs, 'daily' | 'growth'>> & { daily?: Partial<NotifyPrefs['daily']>; growth?: Partial<NotifyPrefs['growth']> }
/** 지금 값에 덮어써 전체를 저장한다(모르는 칸이 생겨도 기본값으로 채워진 전체 모양) */
export async function saveNotifyPrefs(patch: Patch): Promise<NotifyPrefs> {
  const row = await db.getOptional<Row>(SQL)
  const cur = parseNotifyPrefs(row?.notify_json)
  const next: NotifyPrefs = { ...cur, ...patch, daily: { ...cur.daily, ...patch.daily }, growth: { ...cur.growth, ...patch.growth } }
  const notify_json = JSON.stringify(next)
  // id는 uuid: 고정 id면 서버에서 다른 사용자와 겹친다(prefs.ts savePrefs와 같음)
  await run([row ? update('user_prefs', row.id, { notify_json }) : insert('user_prefs', { id: crypto.randomUUID(), notify_json })])
  return next
}
