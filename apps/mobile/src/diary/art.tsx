// 일기 그림(15 §9.2·§9.9) — 데스크톱 components/diary/MoodFace.tsx를 react-native-svg로 옮김. 캐릭터 화풍 기분 얼굴 · 종이 · 새싹 잎 · 해/달.
// 색: 일기 전용 색(종이·쪽지)은 테마와 무관한 고유색 + 테마 바탕 섞기(데스크톱 diary.css 변수와 같은 계산).
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg'
import { mix, type Palette } from '../theme/palette'
import { moodOf, type DaySky } from './logic'

const K = '#3A3A3A'
export function MoodFace({ mood, size = 40, faded }: { mood: number; size?: number; faded?: boolean }) {
  const m = moodOf(mood)
  if (!m) return null
  const line = { stroke: K, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const }
  const dot = (x: number) => <Circle cx={x} cy={19} r={2.1} fill={K} />
  let eyes = <>{dot(14)}{dot(26)}</>
  let mouth = null
  let extra = null
  if (mood === 1) {
    mouth = <Path d="M15 29 q5 -4 10 0" {...line} />
    extra = <><Path d="M10.5 15.8 l5 -1.8M29.5 15.8 l-5 -1.8" stroke={K} strokeWidth={1.5} strokeLinecap="round" /><Path d="M12 23 q-1.6 2.6 0 3.6 q1.6 -1 0 -3.6Z" fill="#9fd0ff" /></>
  } else if (mood === 2) mouth = <Path d="M15 28.5 q2.5 -2 5 0 t5 -0.5" {...line} />
  else if (mood === 3) mouth = <Path d="M15.5 27.5 h9" {...line} />
  else if (mood === 4) {
    eyes = <Path d="M11.5 19.5 q2.5 -3 5 0M23.5 19.5 q2.5 -3 5 0" {...line} />
    mouth = <Path d="M14 25 q6 6 12 0" {...line} />
  } else {
    const star = (x: number) => <Path d={`M${x} 15.5 l1 2.4 2.5.3-1.9 1.6.6 2.5-2.2-1.4-2.2 1.4.6-2.5-1.9-1.6 2.5-.3Z`} fill={K} />
    eyes = <>{star(14)}{star(26)}</>
    mouth = <Path d="M13.5 24.5 q6.5 9 13 0Z" fill="#7a3b3b" />
    extra = <Path d="M33 6 l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" fill="#ffd166" />
  }
  // 고르지 않은 얼굴 = 살짝 바랜 색(15 §9.2 "색 35% 채도")
  const fill = faded ? mix(m.color, '#d9d9d9', 0.45) : m.color
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx={20} cy={21} r={17} fill={fill} />
      <Ellipse cx={15} cy={12} rx={6} ry={3} fill="#fff" opacity={0.22} />
      <Circle cx={10.5} cy={25} r={3} fill="#FF9FA8" opacity={0.5} />
      <Circle cx={29.5} cy={25} r={3} fill="#FF9FA8" opacity={0.5} />
      {eyes}{mouth}{extra}
    </Svg>
  )
}
export function PaperIcon({ size = 26, paper, line }: { size?: number; paper: string; line: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x={14} y={8} width={36} height={48} rx={4} fill={paper} stroke={line} strokeWidth={2.5} />
      <Path d="M21 22h22M21 30h22M21 38h14" stroke={line} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  )
}
/** 새싹 잎(연속 기록 — 15 §9.12 ⑦, 불꽃 대신) */
export function LeafIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21V12" stroke="#5DBB63" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M12 13C8 6 3 8 4 12c3 2 6 2 8 1Z" fill="#5DBB63" />
      <Path d="M12 11c3-6 8-5 8-1-2 2-5 2-8 1Z" fill="#7bcf80" />
    </Svg>
  )
}
export function SkyIcon({ sky, behind }: { sky: DaySky; behind: string }) {
  if (sky === 'night') {
    return <Svg width={30} height={30} viewBox="0 0 34 34"><Circle cx={17} cy={17} r={12} fill="#f5f1d0" /><Circle cx={23} cy={12} r={11} fill={behind} /><Circle cx={4} cy={26} r={1.4} fill="#fff" /><Circle cx={30} cy={30} r={1} fill="#fff" /></Svg>
  }
  return <Svg width={36} height={30} viewBox="0 0 40 34"><Circle cx={16} cy={16} r={11} fill={sky === 'evening' ? '#ffb27a' : '#ffe08a'} /><Path d="M22 28a6 6 0 0 1 1-11 8 8 0 0 1 15 3 5 5 0 0 1-1 8Z" fill="#fff" opacity={0.85} /></Svg>
}

/** 일기 전용 색(15 §9.9). 라이트 계열의 밤은 옅은 밤색(날짜 숫자가 읽히게) */
export type DiaryColors = { paper: string; note: string; line: string; sky: Record<DaySky, [string, string]> }
export function diaryColors(p: Palette): DiaryColors {
  const black = p.id === 'black'
  const paper = black ? '#0d0d0d' : p.dark ? mix(p.bgCard, '#3a3226', 0.94) : mix(p.bgApp, '#f3e6cf', 0.92)
  return {
    paper,
    note: black ? '#26231a' : p.dark ? '#3a3523' : '#fff6c9',
    line: p.borderRow,
    sky: p.dark
      ? { morning: ['#5a4636', '#6e5a48'], day: ['#2f4a66', '#41607c'], evening: ['#5c3a33', '#6e4a3e'], night: ['#11152e', '#1e2246'] }
      : { morning: ['#ffe3c7', '#fff6e8'], day: ['#cde8ff', '#eef7ff'], evening: ['#ffbfa3', '#ffe3cc'], night: ['#aeb3e0', '#d9dbf2'] }
  }
}
