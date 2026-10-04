// 00 §5 테마 목록과 user_prefs.theme 저장 형식 — 화면·DB에 기대지 않는 순수 함수(시험: tests/theme.test.ts)
//
// 저장 형식(스키마 변경 없음): user_prefs.theme = "<고른 테마>" 또는 "<고른 테마>|<시스템 다크일 때 테마>"
//   예) "default", "sky", "dark"(예전 값 그대로), "teal|black"
//   두 번째 칸이 없거나 다크 계열이 아니면 시스템 다크일 때 "dark"를 쓴다.
// 문서에 붙는 속성: 다크 계열은 모두 data-theme="dark" + data-theme-variant="<변형>"(dark 자신은 변형 없음).
//   화면 CSS의 [data-theme="dark"] 규칙을 다크 변형들이 그대로 받게 하려는 것.
export type ThemeFamily = 'light' | 'dark'
export type ThemeGroup = 'color' | 'dark'
export interface ThemeDef {
  id: string
  name: string
  family: ThemeFamily
  group: ThemeGroup
  /** 틱틱에 있는 테마인지, sprout가 더한 것인지 */
  source: 'ticktick' | 'sprout'
}

export const THEMES: readonly ThemeDef[] = [
  { id: 'default', name: '기본값', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'sky', name: '하늘', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'turquoise', name: '터쿼이즈', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'teal', name: '틸', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'matcha', name: '말차', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'sunshine', name: '햇살', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'peach', name: '복숭아', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'lilac', name: '라일락', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'ebony', name: '에보니', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'navy', name: '네이비', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'gray', name: '그레이', family: 'light', group: 'color', source: 'ticktick' },
  { id: 'dark', name: '다크', family: 'dark', group: 'color', source: 'ticktick' },
  { id: 'black', name: '트루 블랙', family: 'dark', group: 'dark', source: 'sprout' }
]

export const DEFAULT_THEME = 'default'
export const DEFAULT_DARK_THEME = 'dark'
export const DARK_THEMES = THEMES.filter((t) => t.family === 'dark')

export const findTheme = (id: string | null | undefined) => THEMES.find((t) => t.id === id)

/** 저장 값 → 고른 테마 · 시스템 다크일 때 테마. 모르는 id는 기본값으로 */
export function parseTheme(stored: string | null | undefined): { main: string; dark: string } {
  const [rawMain, rawDark] = (stored ?? '').split('|')
  const main = findTheme(rawMain)?.id ?? DEFAULT_THEME
  const darkDef = findTheme(rawDark)
  return { main, dark: darkDef?.family === 'dark' ? darkDef.id : DEFAULT_DARK_THEME }
}

/** 고른 테마 · 다크 테마 → 저장 값. 다크가 기본(dark)이면 예전 형식 그대로 한 칸만 쓴다 */
export function encodeTheme(main: string, dark: string = DEFAULT_DARK_THEME): string {
  const m = findTheme(main)?.id ?? DEFAULT_THEME
  const d = findTheme(dark)?.family === 'dark' ? dark : DEFAULT_DARK_THEME
  return d === DEFAULT_DARK_THEME ? m : `${m}|${d}`
}

/** 테마 id → 문서 속성 값 */
export function themeAttrs(id: string): { theme: string; variant?: string } {
  const def = findTheme(id) ?? findTheme(DEFAULT_THEME)!
  if (def.family === 'dark') return def.id === 'dark' ? { theme: 'dark' } : { theme: 'dark', variant: def.id }
  return { theme: def.id }
}

/** 지금 보여야 할 테마 id(시스템 다크 따르기 반영) */
export function effectiveTheme(stored: string | null | undefined, followDark: boolean, systemDark: boolean): string {
  const { main, dark } = parseTheme(stored)
  return followDark && systemDark ? dark : main
}
