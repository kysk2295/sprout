// user_prefs(동기화) — 테마는 데스크톱과 같은 행·같은 저장 형식(themes.ts). 로컬 DB에는 한 사용자의 데이터만 있다.
import { useQuery } from '@powersync/react-native'
import { db, run } from './db'
import { insert, update } from './tasks'

export interface PrefsRow { id: string; theme: string | null; follow_system_dark: number | null }
const SQL = 'SELECT id, theme, follow_system_dark FROM user_prefs ORDER BY created_at LIMIT 1'

export function usePrefsRow(): PrefsRow | undefined {
  const { data } = useQuery<PrefsRow>(SQL)
  return data[0]
}
export async function savePrefs(patch: Partial<Omit<PrefsRow, 'id'>>) {
  const row = await db.getOptional<{ id: string }>(SQL)
  // id는 uuid: 고정 id면 서버에서 다른 사용자와 겹친다(데스크톱 savePreferences와 같음)
  await run([row ? update('user_prefs', row.id, patch) : insert('user_prefs', { id: crypto.randomUUID(), ...patch })])
}
