// 43 §19 연속 불꽃 — 보이는 숫자만 `한 날 N일`(누적) → `N일 연속`. 해금(§6)은 누적 그대로(wardrobe `activeDayList` · `RaiseState.days`).
// 한 날 = 할 일 XP(task − task_revoke)가 1 이상 남은 사용자 시간대 날짜(xp_events.day). 오늘 아직이면 어제까지의 연속을 그대로 보이고,
// 하루를 통째로 건너뛰면 끊긴다(봐주는 날·얼음 없음 — §19.1 결정). 끊겨도 잃는 것도, 아쉬운 말도 없다(§19.4).
import { addDays, dayKeyIn } from './time.ts'

/** 이정표(§19.3) — 이날 한 번 작은 축하 */
export const STREAK_MILESTONES = [3, 7, 14, 30] as const

export type Streak = {
  /** 보이는 연속 수(오늘 아직이면 어제까지) */
  days: number
  /** 오늘이 한 날인가(불꽃 켜짐) */
  today: boolean
  /** 오늘 하면 될 수(오늘 했으면 days 그대로) */
  next: number
  /** 오늘 막 닿은 이정표(오늘 한 날일 때만) */
  milestone: number | null
}

/** 한 날 목록(정렬 무관) + 오늘(사용자 시간대 YYYY-MM-DD) → 연속 */
export function streakOf(activeDays: Iterable<string>, today: string): Streak {
  const set = activeDays instanceof Set ? (activeDays as Set<string>) : new Set(activeDays)
  const did = set.has(today)
  let d = did ? today : addDays(today, -1)
  let n = 0
  while (set.has(d)) { n++; d = addDays(d, -1) }
  const milestone = did && (STREAK_MILESTONES as readonly number[]).includes(n) ? n : null
  return { days: n, today: did, next: did ? n : n + 1, milestone }
}

/** 끝낸 순간(ISO·ms) → 그 사람 시간대의 날짜. xp_events.day와 같은 뜻(시험·서버용) */
export const dayOfIn = (at: string | number | Date, tz: string) => dayKeyIn(typeof at === 'number' ? at : new Date(at).getTime(), tz)

/** 알약 글(§19.2): main = 굵은 줄, sub = 뒤쪽 흐린 줄, a11y = 읽어 줄 말 */
export function streakText(s: Pick<Streak, 'days' | 'today' | 'next'>): { main: string; sub: string | null; a11y: string } {
  if (s.days === 0) return { main: `오늘 하면 ${s.next}일`, sub: null, a11y: `연속 기록 없음. 오늘 하면 ${s.next}일` }
  if (s.today) return { main: `${s.days}일 연속`, sub: null, a11y: `${s.days}일 연속` }
  return { main: `${s.days}일 연속`, sub: `오늘 하면 ${s.next}일`, a11y: `${s.days}일 연속. 오늘 하면 ${s.next}일` }
}

/** 툴팁(데스크톱) — 끊겨도 잃는 것이 없다는 것만 */
export const STREAK_HINT = '하루에 할 일 하나면 이어져요. 끊겨도 받은 건 그대로예요'

/** 이정표 말(§19.3) — 칭찬만, 재촉·아쉬움 없음 */
export function cheerLine(n: number): string {
  if (n === 3) return '3일 연속이야! 내일도 같이 하자'
  if (n === 7) return '7일 연속! 일주일 내내 했네'
  if (n === 14) return '14일 연속이야. 대단해'
  if (n === 30) return '30일 연속! 한 달을 같이 왔어'
  return `${n}일 연속이야!`
}

/** 기기 저장 값(`날짜:수`) */
export const cheerStamp = (today: string, n: number) => `${today}:${n}`
/** 지금 축하할 이정표(없으면 null) — 같은 날 같은 수는 한 번(seen = 지난 cheerStamp) */
export function cheerToShow(s: Streak, today: string, seen: string | null | undefined): number | null {
  if (!s.milestone) return null
  return seen === cheerStamp(today, s.milestone) ? null : s.milestone
}

/**
 * 불꽃 그림(§19.2, 32×32) — 3D 비닐 화풍처럼 둥근 음영: 바깥 방사형(살구 → 주황 → 다홍) + 안쪽(연노랑 → 크림) + 빛 띠 + 옅은 그림자.
 * 꺼진 색(오늘 아직) = 모래 회색 두 톤 + 크림, 빛 띠 없음. 두 앱이 같은 데이터로 그린다(데스크톱 = SVG 글, 휴대폰 = react-native-svg).
 */
export const FLAME = {
  view: 32,
  outer: 'M16 2.6C17.3 7.4 23.6 10.5 24.7 17.3C25.7 23.5 21.5 29.4 16 29.4C10.5 29.4 6.4 25.1 7 19.5C7.4 15.9 9.5 13.5 11.2 11.9C11.4 14.3 12.4 15.7 13.6 16.3C13.1 11.5 14.4 6.7 16 2.6Z',
  inner: 'M16.2 13.6C17.5 16.7 20.9 18.7 20.9 22.7C20.9 25.7 18.7 27.7 16 27.7C13.4 27.7 11.3 25.8 11.3 23.1C11.3 20.7 12.8 19.4 13.9 18.4C14.2 19.9 14.9 20.7 15.6 21C15.3 18.3 15.5 15.8 16.2 13.6Z',
  /** 빛 띠(왼쪽 위) */
  shine: 'M11.6 15.2C10.2 16.8 9.4 18.6 9.5 20.6C9.55 21.4 10.5 21.5 10.7 20.7C11 19 11.6 17.5 12.6 16.1C13.1 15.4 12.2 14.6 11.6 15.2Z',
  shadow: { cx: 16, cy: 30.3, rx: 7.2, ry: 1.2 },
  lit: { outer: ['#FFC15A', '#FF8A34', '#E9472B'] as const, inner: ['#FFE98F', '#FFF9E8'] as const, shine: 0.55, shadow: 0.16 },
  unlit: { outer: ['#E4DBCF', '#CDBFAF', '#B4A593'] as const, inner: ['#F1EBE2', '#FBF8F3'] as const, shine: 0, shadow: 0.1 }
} as const

/** 데스크톱용 SVG 글(id 겹침 막으려고 접두어) */
export function flameSvg(lit: boolean, id = 'fl'): string {
  const c = lit ? FLAME.lit : FLAME.unlit
  const o = `${id}${lit ? 'L' : 'U'}o`, i = `${id}${lit ? 'L' : 'U'}i`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><defs>`
    + `<radialGradient id="${o}" cx="0.48" cy="0.72" r="0.62"><stop offset="0" stop-color="${c.outer[0]}"/><stop offset="0.55" stop-color="${c.outer[1]}"/><stop offset="1" stop-color="${c.outer[2]}"/></radialGradient>`
    + `<linearGradient id="${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.inner[0]}"/><stop offset="1" stop-color="${c.inner[1]}"/></linearGradient></defs>`
    + `<ellipse cx="${FLAME.shadow.cx}" cy="${FLAME.shadow.cy}" rx="${FLAME.shadow.rx}" ry="${FLAME.shadow.ry}" fill="#0F2316" opacity="${c.shadow}"/>`
    + `<path d="${FLAME.outer}" fill="url(#${o})"/><path d="${FLAME.inner}" fill="url(#${i})"/>`
    + (c.shine ? `<path d="${FLAME.shine}" fill="#FFFFFF" opacity="${c.shine}"/>` : '')
    + `</svg>`
}
