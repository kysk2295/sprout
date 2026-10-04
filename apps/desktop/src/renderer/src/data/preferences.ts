import { useEffect, useState } from 'react'
import { getDb } from './db'
import { insert, run, update, uuid } from './mutations'
import { useQuery } from './useQuery'
import { effectiveTheme, parseTheme, themeAttrs } from './theme'
export type Visibility = 'show' | 'hide' | 'auto'
export interface Preferences { id: string; theme: string | null; follow_system_dark: number | null; smart_list_visibility: string | null }
export function usePreferences() {
  // 로컬 DB에는 한 사용자의 데이터만 있다(로그인 뒤 owner_id가 바뀌어도 그대로 찾는다)
  const rows = useQuery<Preferences>('SELECT id, theme, follow_system_dark, smart_list_visibility FROM user_prefs ORDER BY created_at LIMIT 1')
  const row = rows?.[0]
  let visibility: Record<string, Visibility> = {}
  try { visibility = JSON.parse(row?.smart_list_visibility ?? '{}') } catch { /* first run */ }
  // 00 §5.3: theme은 문서의 data-theme 값(다크 계열은 모두 'dark'), 고른 id는 themeId·darkThemeId
  const { main, dark } = parseTheme(row?.theme)
  const followDark = !!row?.follow_system_dark
  const systemDark = useSystemDark()
  const variant = themeAttrs(effectiveTheme(row?.theme, followDark, systemDark)).variant
  // 다크 변형(트루 블랙 등)은 data-theme-variant로 — 테마를 적용하는 모든 창(메인·설정·미니·로그인)이 이 훅을 쓴다
  useEffect(() => {
    if (new URLSearchParams(location.search).get('theme')) return // ?theme= 미리보기는 그 값만
    if (variant) document.documentElement.dataset.themeVariant = variant
    else delete document.documentElement.dataset.themeVariant
  }, [variant])
  return { row, ready: !!rows, theme: themeAttrs(main).theme, themeId: main, darkThemeId: dark, followDark, visibility }
}
/** OS가 다크 모드인지(바뀌면 따라간다) */
export function useSystemDark() {
  const [dark, setDark] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia('(prefers-color-scheme: dark)')
    const change = () => setDark(m.matches)
    m.addEventListener('change', change)
    return () => m.removeEventListener('change', change)
  }, [])
  return dark
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
