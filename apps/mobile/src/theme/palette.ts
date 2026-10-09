// 테마 색표 = 정본 토큰(tokens.generated.ts) + 모바일 전용 값(시안 키트 mobile-kit.css 2부 --m-*)
// 화면 코드는 이 Palette만 쓴다. 순수 모듈(시험: theme.test.ts).
import { TOKEN_THEMES, type TokenColors } from './tokens.generated.ts'
import { findTheme, DEFAULT_THEME } from './themes.ts'

export type ThemeId = keyof typeof TOKEN_THEMES

export type Palette = TokenColors & {
  id: ThemeId
  dark: boolean
  /** 회색 바닥(목록·설정) — 기본 #F4F6F3(44), 색 테마는 견본색 9% 섞음 [sprout 해석 research 24 §11] */
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
    // 44 §3.1 다크: 바닥 #0C0F0D → 카드 #161A17 → 칸 #1F2420 (트루 블랙은 그대로)
    return {
      ...t, ...base, id: themeId, dark,
      pageBg: black ? '#000000' : t.bgGround,
      cardBg: black ? '#121212' : t.bgApp,
      sheetBg: t.bgPopover,
      glass: black ? 'rgba(28,28,30,0.85)' : 'rgba(31,36,32,0.82)',
      glassLine: 'rgba(255,255,255,0.08)',
      drawerBg: black ? '#0a0a0a' : t.bgApp,
      drawerSel: black ? '#222222' : t.bgSelected,
      tabIcon: black ? '#a0a0a5' : t.textSecondary,
      tabOn: black ? t.accent : t.accentInk,
      scrim: 'rgba(0,0,0,0.55)',
      overdue: t.textDanger,
      toastBg: black ? '#3a3a3c' : t.toastBg,
      toastAction: black ? base.toastAction : '#6fe09f'
    }
  }
  return {
    ...t, ...base, id: themeId, dark,
    // 44 §3.1: 기본 테마 바닥 #F4F6F3(옅은 초록 회색) + 흰 카드. 색 테마는 견본색 9%
    pageBg: colored ? mix(t.bgRail, '#f3f3f6', 0.09) : '#f4f6f3',
    cardBg: t.bgApp,
    sheetBg: t.bgPopover,
    glass: 'rgba(255,255,255,0.82)',
    glassLine: 'rgba(0,0,0,0.06)',
    drawerBg: t.bgSidebar,
    drawerSel: colored ? t.bgSelected : t.accentSubtle,
    tabIcon: colored ? '#3c3c43' : '#59665e',
    tabOn: colored ? t.accent : t.accentInk,
    scrim: colored ? 'rgba(0,0,0,0.30)' : t.overlayScrim,
    overdue: t.textDanger,
    ...(colored ? {} : { toastBg: t.toastBg, toastAction: '#8fe3b3' })
  }
}

/** 우선순위 → 체크박스 테두리 색(02 §0) */
export const priorityColor = (p: Palette, priority: number | null | undefined) =>
  priority === 3 ? p.priorityHigh : priority === 2 ? p.priorityMedium : priority === 1 ? p.priorityLow : p.priorityNone

/** 모바일 크기 토큰 [임시 — research 24 §14] */
export const M = {
  // [영상 실측] research 34 §1(2026-10-06 사용자 휴대폰 틱틱 녹화) — 카드 16·사이 16·묶음 머리 48·행 48·체크 17·+ 60·탭 좌우 20·바닥 16·머리 버튼 42
  navH: 52,
  titleH: 48,
  tabH: 58,
  tabInset: 20,
  tabBottom: 16,
  gutter: 16,
  cardInset: 16,
  cardGap: 12, // 44 §3.5 카드 사이 12
  groupH: 48,
  rowH: 48,
  rowH2: 62,
  rowPad: 18,
  check: 22, // 44 §4 체크 칸 22 · 모서리 7
  fab: 60,
  fabRight: 20,
  fabGap: 17,
  navBtn: 42,
  radiusSheet: 20, // 44 §3.3 r-lg
  radiusCard: 18, // 44 §4 묶음 카드
  radiusMenu: 20,
  tap: 44
} as const

export const FONT = {
  // 44 §3.2: 큰 제목 800 30/36(자간 −2.5%), 카드 머리 15/700
  large: { fontSize: 30, lineHeight: 36, fontWeight: '800' as const, letterSpacing: -0.75 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800' as const, letterSpacing: -0.75 },
  nav: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  detailTitle: { fontSize: 20, lineHeight: 27, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  sub: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  group: { fontSize: 15, lineHeight: 20, fontWeight: '700' as const },
  /** 44 §3.2 h2 — 시트 제목·카드 머리 */
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.35 },
  /** 빈 상태 제목 17/650 */
  emptyTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.2 }
}

/** 44 §3.3 모서리(휴대폰) */
export const R = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, card: 18, check: 7 } as const

/** 44 §3.4 그림자 — 라이트는 초록 기운 남색 그림자, 다크는 그림자 대신 1px 선(호출하는 쪽이 borderWidth로) */
export function shadow(p: { dark: boolean; accent: string }, kind: 'card' | 'float' | 'sheet' | 'accent') {
  if (kind === 'accent') return { shadowColor: p.accent, shadowOpacity: p.dark ? 0.22 : 0.32, shadowRadius: 9, shadowOffset: { width: 0, height: 6 }, elevation: 8 }
  if (p.dark) return kind === 'card' ? {} : { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: kind === 'sheet' ? 25 : 14, shadowOffset: { width: 0, height: kind === 'sheet' ? 20 : 6 }, elevation: kind === 'sheet' ? 20 : 10 }
  if (kind === 'card') return { shadowColor: '#12281a', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }
  if (kind === 'float') return { shadowColor: '#12281a', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 6 }
  return { shadowColor: '#12281a', shadowOpacity: 0.14, shadowRadius: 30, shadowOffset: { width: 0, height: 24 }, elevation: 20 }
}
