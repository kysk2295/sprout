import { useEffect, useState } from 'react'
import { getDb } from './db'
import { insert, run, update, uuid } from './mutations'
import { useQuery } from './useQuery'
export type Visibility = 'show' | 'hide' | 'auto'
export interface Preferences { id: string; theme: string | null; follow_system_dark: number | null; smart_list_visibility: string | null }
export function usePreferences() {
  // 로컬 DB에는 한 사용자의 데이터만 있다(로그인 뒤 owner_id가 바뀌어도 그대로 찾는다)
  const rows = useQuery<Preferences>('SELECT id, theme, follow_system_dark, smart_list_visibility FROM user_prefs ORDER BY created_at LIMIT 1')
  const row = rows?.[0]
  let visibility: Record<string, Visibility> = {}
  try { visibility = JSON.parse(row?.smart_list_visibility ?? '{}') } catch { /* first run */ }
  return { row, ready: !!rows, theme: row?.theme ?? 'default', followDark: !!row?.follow_system_dark, visibility }
}
export async function savePreferences(patch: Partial<Omit<Preferences, 'id'>>) {
  const db = await getDb()
  const row = await db.get<{ id: string }>('SELECT id FROM user_prefs ORDER BY created_at LIMIT 1')
  // id는 uuid: 고정 id면 서버에서 다른 사용자와 겹친다
  await run(row ? update('user_prefs', row.id, patch) : insert('user_prefs', { id: uuid(), ...patch }))
}
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => { try { const raw = localStorage.getItem(key); return raw === null ? initial : JSON.parse(raw) as T } catch { return initial } })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }, [key, value])
  return [value, setValue] as const
}
