// 일기 기분 얼굴(28 §8.2 v2) — 정원 친구 화풍(시안 mobile-diary.html face()): 기분 색 둥근 얼굴 + 윤기 + 볼 + 눈·입.
// 색 5개 = 비 · 안개 · 꿀 · 잎 · 살구(logic MOODS). 보라·반짝이 없음(40 §0.1). 선 색은 캐릭터와 같은 INK.
import { memo } from 'react'
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg'
import { INK } from '@sprout/schema/characterArt'
import { mix } from '../theme/palette'
import { moodOf } from './logic'

const line = { stroke: INK, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const dot = (x: number) => <G key={`d${x}`}><Ellipse cx={x} cy={19.5} rx={2} ry={2.5} fill={INK} /><Circle cx={x + 0.7} cy={18.5} r={0.8} fill="#fff" /></G>
const up = (x: number) => <Path key={`u${x}`} d={`M${x - 2.8} 20 q2.8 -3.4 5.6 0`} {...line} strokeWidth={1.9} />
const down = (x: number) => <Path key={`w${x}`} d={`M${x - 2.6} 18.6 q2.6 2.6 5.2 0`} {...line} />

export const MoodFace = memo(function MoodFace({ mood, size = 40, faded }: { mood: number; size?: number; faded?: boolean }) {
  const m = moodOf(mood)
  if (!m) return null
  let eyes, mouth
  if (mood === 1) { eyes = [down(14), down(26)]; mouth = <Path d="M16.5 28.6 q3.5 -2.6 7 0" {...line} /> }
  else if (mood === 2) { eyes = [dot(14), dot(26)]; mouth = <Path d="M15.5 28 q2.2 -1.8 4.5 0 t4.5 0" {...line} /> }
  else if (mood === 3) { eyes = [dot(14), dot(26)]; mouth = <Path d="M16.5 27.6 h7" {...line} /> }
  else if (mood === 4) { eyes = [up(14), up(26)]; mouth = <Path d="M15.2 25.6 q4.8 5 9.6 0" {...line} /> }
  else { eyes = [up(14), up(26)]; mouth = <G><Path d="M14.6 25 q5.4 7.6 10.8 0 z" fill="#B8475A" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" /><Ellipse cx={20} cy={28.6} rx={2.6} ry={1.3} fill="#FF9AAE" /></G> }
  const cheek = mood >= 3 ? 0.5 : 0.28
  // 고르지 않은 얼굴 = 바랜 색(28 §8.4 그냥 쓰기 기분 줄)
  const fill = faded ? mix(m.color, '#d9dcd9', 0.4) : m.color
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={20} cy={21} r={17} fill={fill} />
      <Ellipse cx={14} cy={12.6} rx={5.4} ry={2.6} fill="#fff" opacity={0.38} transform="rotate(-18 14 12.6)" />
      <Ellipse cx={10.4} cy={25} rx={3.2} ry={2} fill="#FF8FA3" opacity={cheek} />
      <Ellipse cx={29.6} cy={25} rx={3.2} ry={2} fill="#FF8FA3" opacity={cheek} />
      {eyes}{mouth}
    </Svg>
  )
})
