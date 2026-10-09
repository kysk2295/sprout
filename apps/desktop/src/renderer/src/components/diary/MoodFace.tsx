import { INK } from '@sprout/schema/characterArt'
import { moodOf } from '../../data/diary'

// 15 §10 · 28 §8.2 v2 기분 얼굴 — 정원 친구 화풍(휴대폰 src/diary/art.tsx와 같은 그림): 기분 색 둥근 얼굴 + 윤기 + 볼 + 눈·입.
// 색 5개 = 비 · 안개 · 꿀 · 잎 · 살구(MOODS, packages/schema/diary). 보라·반짝이 없음(40 §0.1). 선 색은 캐릭터와 같은 INK.
const line = { stroke: INK, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const dot = (x: number) => <g key={`d${x}`}><ellipse cx={x} cy={19.5} rx={2} ry={2.5} fill={INK} /><circle cx={x + 0.7} cy={18.5} r={0.8} fill="#fff" /></g>
const up = (x: number) => <path key={`u${x}`} d={`M${x - 2.8} 20 q2.8 -3.4 5.6 0`} {...line} strokeWidth={1.9} />
const down = (x: number) => <path key={`w${x}`} d={`M${x - 2.6} 18.6 q2.6 2.6 5.2 0`} {...line} />

export function MoodFace({ mood, size = 40, faded, className }: { mood: number; size?: number; faded?: boolean; className?: string }) {
  const m = moodOf(mood)
  if (!m) return null
  let eyes, mouth
  if (mood === 1) { eyes = [down(14), down(26)]; mouth = <path d="M16.5 28.6 q3.5 -2.6 7 0" {...line} /> }
  else if (mood === 2) { eyes = [dot(14), dot(26)]; mouth = <path d="M15.5 28 q2.2 -1.8 4.5 0 t4.5 0" {...line} /> }
  else if (mood === 3) { eyes = [dot(14), dot(26)]; mouth = <path d="M16.5 27.6 h7" {...line} /> }
  else if (mood === 4) { eyes = [up(14), up(26)]; mouth = <path d="M15.2 25.6 q4.8 5 9.6 0" {...line} /> }
  else { eyes = [up(14), up(26)]; mouth = <g><path d="M14.6 25 q5.4 7.6 10.8 0 z" fill="#B8475A" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" /><ellipse cx={20} cy={28.6} rx={2.6} ry={1.3} fill="#FF9AAE" /></g> }
  const cheek = mood >= 3 ? 0.5 : 0.28
  // 고르지 않은 얼굴 = 바랜 색(그냥 쓰기 기분 줄)
  const fill = faded ? `color-mix(in srgb, ${m.color} 60%, #d9dcd9)` : m.color
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx={20} cy={21} r={17} style={{ fill }} />
      <ellipse cx={14} cy={12.6} rx={5.4} ry={2.6} fill="#fff" opacity={0.38} transform="rotate(-18 14 12.6)" />
      <ellipse cx={10.4} cy={25} rx={3.2} ry={2} fill="#FF8FA3" opacity={cheek} />
      <ellipse cx={29.6} cy={25} rx={3.2} ry={2} fill="#FF8FA3" opacity={cheek} />
      {eyes}{mouth}
    </svg>
  )
}

/** 기분 없이 쓴 날·빈 일기장 그림(종이 한 장) */
export function PaperIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="14" y="8" width="36" height="48" rx="6" fill="var(--color-bg-card)" stroke="var(--color-text-quaternary)" strokeWidth="2.5" />
      <path d="M21 22h22M21 30h22M21 38h14" stroke="var(--color-text-quaternary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
