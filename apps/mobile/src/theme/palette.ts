// 테마 색표 = 정본 토큰(tokens.generated.ts) + 모바일 전용 값(시안 키트 mobile-kit.css 2부 --m-*)
// 화면 코드는 이 Palette만 쓴다. 순수 모듈(시험: theme.test.ts).
import { TOKEN_THEMES, type TokenColors } from './tokens.generated.ts'
import { findTheme, DEFAULT_THEME } from './themes.ts'

export type ThemeId = keyof typeof TOKEN_THEMES

export type Palette = TokenColors & {
  id: ThemeId
  dark: boolean
  /** 회색 바닥(목록·설정) — 라이트 #F3F3F6, 색 테마는 견본색 9% 섞음 [sprout 해석 research 24 §11] */
  pageBg: string
  /** 묶음 카드 면 */
  cardBg: string
  sheetBg: string
  /** 둥근 머리 버튼·탭 알약(유리) */
  glass: string
  glassLine: string
  drawerBg: string
  drawerSel: string
  tabIcon: string
  tabOn: string
  scrim: string
  swipeMove: string
  swipeDel: string
  swipeDate: string
  swipeDone: string
  swipePin: string
  overdue: string
  /** 서랍 스마트 목록 아이콘 색 */
  slToday: string
  slTomorrow: string
  slWeek: string
  slInbox: string
  slTags: string
  toastBg: string
  toastAction: string
}

/** '#rrggbb' 두 색을 섞는다(CSS color-mix in srgb와 같은 계산) */
export function mix(a: string, b: string, weightA: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v * weightA + y[i] * (1 - weightA)).toString(16).padStart(2, '0')).join('')}`
}

/** 'rgba(…)'가 아닌 '#rrggbb'에 투명도를 붙인다 */
export const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`

export function paletteOf(id: string): Palette {
  const def = findTheme(id) ?? findTheme(DEFAULT_THEME)!
  const themeId = def.id as ThemeId
  const t = TOKEN_THEMES[themeId]
  const dark = def.family === 'dark'
  const black = themeId === 'black'
  const colored = !dark && themeId !== 'default'
  const base = {
    swipeMove: '#4e75f2', swipeDel: '#f0464a', swipeDate: '#ff9500', swipeDone: '#1fc79a', swipePin: '#ffb300',
    slToday: '#f0643a', slTomorrow: '#f29a2e', slWeek: '#e9b200', slInbox: '#e5534b', slTags: '#2bb3c0',
    toastBg: '#2b2b2e', toastAction: '#8fa6ff'
  }
  if (dark) {
    return {
      ...t, ...base, id: themeId, dark,
      pageBg: black ? '#000000' : '#0f0f0f',
      cardBg: black ? '#121212' : '#1c1c1c',
      sheetBg: t.bgPopover,
      glass: black ? 'rgba(28,28,30,0.85)' : 'rgba(44,44,46,0.82)',
      glassLine: 'rgba(255,255,255,0.08)',
      drawerBg: black ? '#0a0a0a' : '#1a1a1a',
      drawerSel: black ? '#222222' : '#2c2c2c',
      tabIcon: '#a0a0a5',
      tabOn: t.accent,
      scrim: 'rgba(0,0,0,0.55)',
      overdue: t.danger,
      toastBg: '#3a3a3c'
    }
  }
  return {
    ...t, ...base, id: themeId, dark,
    pageBg: colored ? mix(t.bgRail, '#f3f3f6', 0.09) : '#f3f3f6',
    cardBg: t.bgApp,
    sheetBg: t.bgPopover,
    glass: 'rgba(255,255,255,0.82)',
    glassLine: 'rgba(0,0,0,0.06)',
    drawerBg: t.bgSidebar,
    drawerSel: colored ? t.bgSelected : t.accentSubtle,
    tabIcon: '#3c3c43',
    tabOn: t.accent,
    scrim: 'rgba(0,0,0,0.30)',
    overdue: t.danger
  }
}

/** 우선순위 → 체크박스 테두리 색(02 §0) */
export const priorityColor = (p: Palette, priority: number | null | undefined) =>
  priority === 3 ? p.priorityHigh : priority === 2 ? p.priorityMedium : priority === 1 ? p.priorityLow : p.priorityNone

/** 모바일 크기 토큰 [임시 — research 24 §14] */
export const M = {
  navH: 52,
  titleH: 48,
  tabH: 58,
  tabInset: 16,
  tabBottom: 22,
  gutter: 16,
  cardInset: 12,
  cardGap: 10,
  rowH: 46,
  rowH2: 62,
  check: 18,
  fab: 56,
  radiusSheet: 22,
  radiusCard: 14,
  tap: 44
} as const

export const FONT = {
  large: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  nav: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  detailTitle: { fontSize: 20, lineHeight: 27, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  sub: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  group: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const }
}
