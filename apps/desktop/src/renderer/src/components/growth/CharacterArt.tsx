import type { Species } from '@sprout/schema/growth'

// 10 §2.2 자리 표시 그림(직접 그린 단순 벡터). 정식 그림 자산이 생기면 이 컴포넌트만 바꾼다.
// 공통 화풍: 둥근 몸 · 큰 눈 · 볼터치 · 머리에 새싹(단계마다 자란다). species = null 이면 "아직 모르는 알".
const COLORS: Record<Species, { body: string; accent: string }> = {
  turtle: { body: '#9BD3A0', accent: '#5E9E6B' },
  squirrel: { body: '#E8B48A', accent: '#B5764A' },
  cat: { body: '#F2C9A0', accent: '#C98E5B' },
  otter: { body: '#B89A7E', accent: '#7E6249' }
}

export function CharacterArt({ species, stage = 1, size = 120, mood = 'default', look, blink }: { species: Species | null; stage?: number; size?: number; mood?: 'default' | 'happy' | 'sleepy'; look?: { x: number; y: number }; blink?: boolean }) {
  // look: 눈동자가 바라보는 방향(−1~1), blink: 눈 감기(깜빡임 한 프레임)
  const lx = (look?.x ?? 0) * 2.6
  const ly = (look?.y ?? 0) * 2
  if (!species) return <Egg size={size} />
  const c = COLORS[species]
  const scale = 0.72 + stage * 0.07 // 자랄수록 조금씩 커진다
  return (
    <svg className={`character character--${species}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="캐릭터">
      <ellipse cx="60" cy="110" rx={30 * scale} ry="5" fill="rgba(0,0,0,0.08)" />
      <g transform={`translate(60 ${108 - 50 * scale}) scale(${scale}) translate(-60 -58)`}>
        {species === 'turtle' && <ellipse cx="60" cy="74" rx="40" ry="26" fill={c.accent} />}
        {species === 'squirrel' && <path d="M88 84 C116 76 112 30 90 34 C104 46 96 64 84 70 Z" fill={c.accent} />}
        {species === 'otter' && <ellipse cx="60" cy="96" rx="34" ry="8" fill={c.accent} opacity="0.6" />}
        {species === 'cat' && <path d="M86 92 C104 92 108 74 100 66" stroke={c.accent} strokeWidth="7" fill="none" strokeLinecap="round" />}
        <ellipse cx="60" cy="66" rx="34" ry="32" fill={c.body} />
        {species === 'cat' && (<><path d="M32 44 L36 22 L50 38 Z" fill={c.body} /><path d="M88 44 L84 22 L70 38 Z" fill={c.body} /></>)}
        {(species === 'squirrel' || species === 'otter') && (<><circle cx="36" cy="40" r="7" fill={c.body} /><circle cx="84" cy="40" r="7" fill={c.body} /></>)}
        {species === 'turtle' && (<><circle cx="30" cy="90" r="6" fill={c.body} /><circle cx="90" cy="90" r="6" fill={c.body} /></>)}
        {/* 얼굴 */}
        {mood === 'sleepy' || blink ? (
          <><path d="M44 62 q5 4 10 0" stroke="#3A3A3A" strokeWidth="2.4" fill="none" strokeLinecap="round" /><path d="M66 62 q5 4 10 0" stroke="#3A3A3A" strokeWidth="2.4" fill="none" strokeLinecap="round" /></>
        ) : mood === 'happy' ? (
          <><path d="M44 63 q5 -6 10 0" stroke="#3A3A3A" strokeWidth="2.6" fill="none" strokeLinecap="round" /><path d="M66 63 q5 -6 10 0" stroke="#3A3A3A" strokeWidth="2.6" fill="none" strokeLinecap="round" /></>
        ) : (
          <g transform={`translate(${lx} ${ly})`}><circle cx="49" cy="62" r="4.5" fill="#3A3A3A" /><circle cx="71" cy="62" r="4.5" fill="#3A3A3A" /><circle cx="50.5" cy="60.5" r="1.4" fill="#fff" /><circle cx="72.5" cy="60.5" r="1.4" fill="#fff" /></g>
        )}
        <circle cx="41" cy="72" r="5" fill="#FF9FA8" opacity="0.55" />
        <circle cx="79" cy="72" r="5" fill="#FF9FA8" opacity="0.55" />
        <path d={mood === 'happy' ? 'M54 72 q6 7 12 0' : 'M55 73 q5 4 10 0'} stroke="#3A3A3A" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* 머리 새싹: 단계마다 잎이 늘고, 4단계부터 작은 나무, 5단계는 꽃 */}
        <Sprout stage={stage} />
      </g>
    </svg>
  )
}

function Sprout({ stage }: { stage: number }) {
  const leaf = '#5DBB63'
  if (stage >= 4) {
    return (
      <g>
        <rect x="58" y="22" width="4" height="14" rx="2" fill="#8B6B4A" />
        <circle cx="60" cy="18" r={stage >= 5 ? 13 : 11} fill={leaf} />
        {stage >= 5 && (<><circle cx="54" cy="14" r="3.5" fill="#FFD166" /><circle cx="66" cy="16" r="3.5" fill="#FF8FA3" /><circle cx="60" cy="9" r="3.5" fill="#FFF" /></>)}
      </g>
    )
  }
  return (
    <g>
      <path d="M60 36 V24" stroke={leaf} strokeWidth="3" strokeLinecap="round" />
      <path d="M60 26 C52 18 44 22 46 28 C52 30 57 29 60 26 Z" fill={leaf} />
      {stage >= 2 && <path d="M60 24 C68 16 76 20 74 26 C68 28 63 27 60 24 Z" fill={leaf} />}
      {stage >= 3 && <path d="M60 30 C66 26 72 30 70 34 C66 35 62 33 60 30 Z" fill={leaf} />}
    </g>
  )
}

function Egg({ size }: { size: number }) {
  return (
    <svg className="character character--egg" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="아직 모르는 알">
      <ellipse cx="60" cy="108" rx="24" ry="5" fill="rgba(0,0,0,0.08)" />
      <path d="M60 22 C82 22 92 58 92 76 C92 96 78 106 60 106 C42 106 28 96 28 76 C28 58 38 22 60 22 Z" fill="#F3EBDD" stroke="#E0D3BC" strokeWidth="2" />
      <path d="M40 70 l8 -6 l8 6 l8 -6 l8 6 l8 -6" stroke="#D8C7A8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M60 30 V20" stroke="#5DBB63" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 22 C53 15 46 19 48 24 C53 26 57 25 60 22 Z" fill="#5DBB63" />
    </svg>
  )
}
