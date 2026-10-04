import { moodOf } from '../../data/diary'

// 15 §9.2 기분 얼굴 — 캐릭터 화풍(둥근 얼굴·볼터치), 직접 그린 단순 SVG. 색은 MOODS 기분 색 그대로
const K = '#3A3A3A'
export function MoodFace({ mood, size = 40, className }: { mood: number; size?: number; className?: string }) {
  const m = moodOf(mood)
  if (!m) return null
  const dot = (x: number) => <circle cx={x} cy="19" r="2.1" fill={K} />
  let eyes = <>{dot(14)}{dot(26)}</>
  let mouth = null
  let extra = null
  const line = { stroke: K, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const }
  if (mood === 1) {
    mouth = <path d="M15 29 q5 -4 10 0" {...line} />
    extra = <><path d="M10.5 15.8 l5 -1.8M29.5 15.8 l-5 -1.8" stroke={K} strokeWidth="1.5" strokeLinecap="round" /><path d="M12 23 q-1.6 2.6 0 3.6 q1.6 -1 0 -3.6Z" fill="#9fd0ff" /></>
  } else if (mood === 2) mouth = <path d="M15 28.5 q2.5 -2 5 0 t5 -0.5" {...line} />
  else if (mood === 3) mouth = <path d="M15.5 27.5 h9" {...line} />
  else if (mood === 4) {
    eyes = <path d="M11.5 19.5 q2.5 -3 5 0M23.5 19.5 q2.5 -3 5 0" {...line} />
    mouth = <path d="M14 25 q6 6 12 0" {...line} />
  } else {
    const star = (x: number) => <path d={`M${x} 15.5 l1 2.4 2.5.3-1.9 1.6.6 2.5-2.2-1.4-2.2 1.4.6-2.5-1.9-1.6 2.5-.3Z`} fill={K} />
    eyes = <>{star(14)}{star(26)}</>
    mouth = <path d="M13.5 24.5 q6.5 9 13 0Z" fill="#7a3b3b" />
    extra = <path d="M33 6 l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" fill="#ffd166" />
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="21" r="17" fill={m.color} />
      <ellipse cx="15" cy="12" rx="6" ry="3" fill="#fff" opacity=".22" />
      <circle cx="10.5" cy="25" r="3" fill="#FF9FA8" opacity=".5" />
      <circle cx="29.5" cy="25" r="3" fill="#FF9FA8" opacity=".5" />
      {eyes}{mouth}{extra}
    </svg>
  )
}

/** 기분 없이 쓴 날·빈 일기장 그림(종이 한 장) */
export function PaperIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="14" y="8" width="36" height="48" rx="4" fill="var(--diary-paper)" stroke="var(--color-text-quaternary)" strokeWidth="2.5" />
      <path d="M21 22h22M21 30h22M21 38h14" stroke="var(--color-text-quaternary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** 새싹 잎(연속 기록 — 결정 ⑦, 불꽃 대신) */
export function LeafIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21V12" stroke="#5DBB63" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 13C8 6 3 8 4 12c3 2 6 2 8 1Z" fill="#5DBB63" />
      <path d="M12 11c3-6 8-5 8-1-2 2-5 2-8 1Z" fill="#7bcf80" />
    </svg>
  )
}

/** 하늘 띠의 해·달 */
export function SkyIcon({ sky }: { sky: 'morning' | 'day' | 'evening' | 'night' }) {
  if (sky === 'night') {
    return <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="12" fill="#f5f1d0" /><circle cx="23" cy="12" r="11" fill="var(--sky1)" /><circle cx="4" cy="26" r="1.4" fill="#fff" /><circle cx="30" cy="30" r="1" fill="#fff" /></svg>
  }
  return <svg width="40" height="34" viewBox="0 0 40 34" aria-hidden="true"><circle cx="16" cy="16" r="11" fill={sky === 'evening' ? '#ffb27a' : '#ffe08a'} /><path d="M22 28a6 6 0 0 1 1-11 8 8 0 0 1 15 3 5 5 0 0 1-1 8Z" fill="#fff" opacity=".85" /></svg>
}
