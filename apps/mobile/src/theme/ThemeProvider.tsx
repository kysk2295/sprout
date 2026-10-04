// 테마: 동기화되는 user_prefs.theme(데스크톱에서 고른 테마가 휴대폰에도) + 시스템 다크 따르기(20 M2)
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { usePrefsRow } from '../data/prefs'
import { effectiveTheme, parseTheme } from './themes'
import { paletteOf, type Palette } from './palette'

type ThemeState = { p: Palette; themeId: string; darkThemeId: string; followDark: boolean; stored: string | null }
const Ctx = createContext<ThemeState>({ p: paletteOf('default'), themeId: 'default', darkThemeId: 'dark', followDark: true, stored: null })

/** 로그아웃 상태에서는 로컬 DB가 비어 있어 시스템 다크만 따른다(다크면 다크, 아니면 기본값) */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const row = usePrefsRow()
  const systemDark = useColorScheme() === 'dark'
  const value = useMemo(() => {
    const stored = row?.theme ?? null
    // 행이 없으면(새 계정) 시스템 다크 따르기를 켠 것으로 본다(20 §3 "시스템 다크 따라가기 기본")
    const followDark = row ? !!row.follow_system_dark : true
    const { main, dark } = parseTheme(stored)
    return { p: paletteOf(effectiveTheme(stored, followDark, systemDark)), themeId: main, darkThemeId: dark, followDark, stored }
  }, [row, systemDark])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useTheme = () => useContext(Ctx)
export const usePalette = () => useContext(Ctx).p
