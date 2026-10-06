// 10 §2.2 자리 표시 캐릭터 그림 — 데스크톱 components/growth/CharacterArt.tsx와 같은 도형을 react-native-svg로 옮김(23 §4 [임시]).
// 4종 × 5단계 + 알. 정식 그림이 생기면 이 파일만 바꾼다. 틱틱·다른 앱 그림 원본 없음.
import type { Species } from '@sprout/schema/growth'
import type { Ref } from 'react'
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg'
import type { Mood } from '../logic'

export const SPECIES_COLORS: Record<Species, { body: string; accent: string }> = {
  turtle: { body: '#9BD3A0', accent: '#5E9E6B' },
  squirrel: { body: '#E8B48A', accent: '#B5764A' },
  cat: { body: '#F2C9A0', accent: '#C98E5B' },
  otter: { body: '#B89A7E', accent: '#7E6249' }
}
const INK = '#3A3A3A'

/** 40 §6 [임시] 작은 자리(30 이하 — 대화 얼굴·오프라인 띠·퀘스트 줄)는 몸 둘레로 잘라 그린다(눈이 작아 보이지 않게). 데스크톱 CharacterArt와 같은 계산 */
export function tightViewBox(species: Species | null, stage = 1) {
  if (!species) return '12 16 96 96'
  const s = 0.72 + stage * 0.07
  const top = 108 - 50 * s + ((stage >= 4 ? 4 : 15) - 58) * s - 2
  const h = 114 - top
  return `${(60 - h / 2).toFixed(1)} ${top.toFixed(1)} ${h.toFixed(1)} ${h.toFixed(1)}`
}

/** look: 눈동자 방향(−1~1), blink: 눈 감기 한 프레임, silhouette: 앞 단계 실루엣(진화 길), cracks: 알 금(0~3), svgRef: 위젯 그림 굽기(36 §7.3 — toDataURL) */
export function CharacterArt({ species, stage = 1, size = 120, mood = 'default', look, blink, cracks, silhouette, svgRef, tight }: {
  species: Species | null; stage?: number; size?: number; mood?: Mood; look?: { x: number; y: number }; blink?: boolean; cracks?: number; silhouette?: string; svgRef?: Ref<Svg>; tight?: boolean
}) {
  if (!species) return <Egg size={size} cracks={cracks} svgRef={svgRef} viewBox={tight ? tightViewBox(null) : undefined} />
  const c = silhouette ? { body: silhouette, accent: silhouette } : SPECIES_COLORS[species]
  // 40 §6 새 얼굴: think = 눈동자 위·옆, puzzled = 살짝 옆(시선 look에 더한다)
  const lx = (look?.x ?? 0) * 2.6 + (mood === 'think' ? -2.2 : mood === 'puzzled' ? 1.6 : 0)
  const ly = (look?.y ?? 0) * 2 + (mood === 'think' ? -2.4 : 0)
  const scale = 0.72 + stage * 0.07 // 자랄수록 조금씩 커진다
  const closed = (
    <>
      <Path d="M44 62 q5 4 10 0" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M66 62 q5 4 10 0" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </>
  )
  const face = silhouette ? null : mood === 'sleepy' || blink ? closed : mood === 'happy' || mood === 'content' ? (
    <>
      <Path d="M44 63 q5 -6 10 0" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M66 63 q5 -6 10 0" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
    </>
  ) : (
    <G transform={`translate(${lx} ${ly})`}>
      <Circle cx={49} cy={62} r={4.5} fill={INK} /><Circle cx={71} cy={62} r={4.5} fill={INK} />
      <Circle cx={50.5} cy={60.5} r={1.4} fill="#fff" /><Circle cx={72.5} cy={60.5} r={1.4} fill="#fff" />
    </G>
  )
  return (
    <Svg ref={svgRef} width={size} height={size} viewBox={tight ? tightViewBox(species, stage) : '0 0 120 120'} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ellipse cx={60} cy={110} rx={30 * scale} ry={5} fill="rgba(0,0,0,0.08)" />
      <G transform={`translate(60 ${108 - 50 * scale}) scale(${scale}) translate(-60 -58)`}>
        {species === 'turtle' && <Ellipse cx={60} cy={74} rx={40} ry={26} fill={c.accent} />}
        {species === 'squirrel' && <Path d="M88 84 C116 76 112 30 90 34 C104 46 96 64 84 70 Z" fill={c.accent} />}
        {species === 'otter' && <Ellipse cx={60} cy={96} rx={34} ry={8} fill={c.accent} opacity={0.6} />}
        {species === 'cat' && <Path d="M86 92 C104 92 108 74 100 66" stroke={c.accent} strokeWidth={7} fill="none" strokeLinecap="round" />}
        <Ellipse cx={60} cy={66} rx={34} ry={32} fill={c.body} />
        {species === 'cat' && <><Path d="M32 44 L36 22 L50 38 Z" fill={c.body} /><Path d="M88 44 L84 22 L70 38 Z" fill={c.body} /></>}
        {(species === 'squirrel' || species === 'otter') && <><Circle cx={36} cy={40} r={7} fill={c.body} /><Circle cx={84} cy={40} r={7} fill={c.body} /></>}
        {species === 'turtle' && <><Circle cx={30} cy={90} r={6} fill={c.body} /><Circle cx={90} cy={90} r={6} fill={c.body} /></>}
        {face}
        {!silhouette && (
          <>
            <Circle cx={41} cy={72} r={5} fill="#FF9FA8" opacity={0.55} />
            <Circle cx={79} cy={72} r={5} fill="#FF9FA8" opacity={0.55} />
            {mood === 'eat'
              ? <Ellipse cx={60} cy={75} rx={5} ry={5.5} fill="#7A3B3B" />
              : mood === 'think' ? <Circle cx={61} cy={74} r={2.3} fill="none" stroke={INK} strokeWidth={2} />
              : mood === 'puzzled' ? <Path d="M53 74 q3.5 -3 7 0 q3.5 3 7 0" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
              : <Path d={mood === 'content' ? 'M53 72 q7 6 14 0' : mood === 'happy' || mood === 'smile' ? 'M54 72 q6 7 12 0' : 'M55 73 q5 4 10 0'} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />}
          </>
        )}
        <Sprout stage={stage} color={silhouette} />
      </G>
    </Svg>
  )
}

/** 머리 새싹: 단계마다 잎이 늘고, 4단계부터 작은 나무, 5단계는 꽃 */
function Sprout({ stage, color }: { stage: number; color?: string }) {
  const leaf = color ?? '#5DBB63'
  if (stage >= 4) {
    return (
      <G>
        <Rect x={58} y={22} width={4} height={14} rx={2} fill={color ?? '#8B6B4A'} />
        <Circle cx={60} cy={18} r={stage >= 5 ? 13 : 11} fill={leaf} />
        {stage >= 5 && !color && <><Circle cx={54} cy={14} r={3.5} fill="#FFD166" /><Circle cx={66} cy={16} r={3.5} fill="#FF8FA3" /><Circle cx={60} cy={9} r={3.5} fill="#FFF" /></>}
      </G>
    )
  }
  return (
    <G>
      <Path d="M60 36 V24" stroke={leaf} strokeWidth={3} strokeLinecap="round" />
      <Path d="M60 26 C52 18 44 22 46 28 C52 30 57 29 60 26 Z" fill={leaf} />
      {stage >= 2 && <Path d="M60 24 C68 16 76 20 74 26 C68 28 63 27 60 24 Z" fill={leaf} />}
      {stage >= 3 && <Path d="M60 30 C66 26 72 30 70 34 C66 35 62 33 60 30 Z" fill={leaf} />}
    </G>
  )
}

export function Egg({ size, cracks = 0, svgRef, viewBox = '0 0 120 120' }: { size: number; cracks?: number; svgRef?: Ref<Svg>; viewBox?: string }) {
  return (
    <Svg ref={svgRef} width={size} height={size} viewBox={viewBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ellipse cx={60} cy={108} rx={24} ry={5} fill="rgba(0,0,0,0.08)" />
      <Path d="M60 22 C82 22 92 58 92 76 C92 96 78 106 60 106 C42 106 28 96 28 76 C28 58 38 22 60 22 Z" fill="#F3EBDD" stroke="#E0D3BC" strokeWidth={2} />
      <Path d="M40 70 l8 -6 l8 6 l8 -6 l8 6 l8 -6" stroke="#D8C7A8" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      {cracks > 0 && <Path d="M50 40 l6 8 l-4 6 l6 6" stroke="#B9A47F" strokeWidth={2} fill="none" />}
      {cracks > 1 && <Path d="M74 46 l-5 7 l5 5" stroke="#B9A47F" strokeWidth={2} fill="none" />}
      {cracks > 2 && <Path d="M64 86 l-4 -7 l6 -5" stroke="#B9A47F" strokeWidth={2} fill="none" />}
      <Path d="M60 30 V20" stroke="#5DBB63" strokeWidth={3} strokeLinecap="round" />
      <Path d="M60 22 C53 15 46 19 48 24 C53 26 57 25 60 22 Z" fill="#5DBB63" />
    </Svg>
  )
}
