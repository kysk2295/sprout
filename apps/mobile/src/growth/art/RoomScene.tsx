// 23 §2 ① 캐릭터 방 장면 — 데스크톱 StageScene.tsx(10 §3.2.2 시간대 × 단계, 종마다 소품, §3.2.7 장식 10개)와 같은 그림을
// 휴대폰 방(폭 ≈ 화면 − 24, 높이 260)에 맞게 600×400 좌표로 다시 배치했다. 가운데(300)가 캐릭터 자리, 양옆은 잘릴 수 있다(slice).
// 그림 색은 그림 고유색(테마 무관), 강조색만 깃발 줄에 스민다(10 §3.2.2). 다크 계열은 하늘·땅을 어두운 짝 색으로.
import type { Species } from '@sprout/schema/growth'
import type { ReactNode } from 'react'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg'
import type { TimeOfDay } from '../logic'

type SceneColors = { sky1: string; sky2: string; ground: string; hill1: string; hill2: string }
const LIGHT: Record<TimeOfDay, SceneColors> = {
  morning: { sky1: '#ffe3c7', sky2: '#fff6e8', ground: '#dcefc8', hill1: '#cfe6b6', hill2: '#c2dea9' },
  day: { sky1: '#cde8ff', sky2: '#eef7ff', ground: '#d5edc5', hill1: '#c3e3b2', hill2: '#b4dba3' },
  evening: { sky1: '#ffbfa3', sky2: '#ffe3cc', ground: '#d8e3bf', hill1: '#d6cfae', hill2: '#c9c49e' },
  night: { sky1: '#232a5c', sky2: '#454a85', ground: '#3e5a48', hill1: '#34503f', hill2: '#2d4637' }
}
const DARK: Record<TimeOfDay, SceneColors> = {
  morning: { sky1: '#5a4636', sky2: '#6e5a48', ground: '#3f5537', hill1: '#4a6141', hill2: '#425a3a' },
  day: { sky1: '#2f4a66', sky2: '#41607c', ground: '#3b5a3a', hill1: '#456a43', hill2: '#3d613c' },
  evening: { sky1: '#5c3a33', sky2: '#6e4a3e', ground: '#4a5238', hill1: '#555a3d', hill2: '#4c5236' },
  night: { sky1: '#11152e', sky2: '#1e2246', ground: '#24352b', hill1: '#1f3026', hill2: '#1b2a21' }
}
export const sceneColors = (tod: TimeOfDay, dark: boolean) => (dark ? DARK : LIGHT)[tod]
/** 장면 위 글자(이름·단계)가 읽히도록: 밤·다크는 밝은 글자 */
export const sceneIsDark = (tod: TimeOfDay, dark: boolean) => dark || tod === 'night'

export const SCENE_W = 600
export const SCENE_H = 400

export function RoomScene({ species, stage, tod, dark, name, placed, accent, width, height, lampOn }: {
  species: Species | null; stage: number; tod: TimeOfDay; dark: boolean; name: string; placed: Set<string>; accent: string; width: number; height: number; lampOn?: boolean
}) {
  const c = sceneColors(tod, dark)
  const has = (id: string) => placed.has(id)
  const deco = (id: string, el: ReactNode) => (has(id) ? <G key={id}>{el}</G> : null)
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio="xMidYMax slice" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.sky1} />
          <Stop offset="1" stopColor={c.sky2} />
        </LinearGradient>
      </Defs>
      <Rect x={-200} y={-200} width={SCENE_W + 400} height={SCENE_H + 400} fill="url(#sky)" />
      {/* 하늘: 해·달·별 */}
      {tod === 'night' ? (
        <G>
          <Circle cx={480} cy={64} r={22} fill="#f5f1d0" />
          <Circle cx={490} cy={57} r={20} fill={c.sky1} />
          {[[70, 50], [150, 90], [240, 40], [340, 70], [400, 30], [560, 100], [30, 120]].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={i % 2 ? 1.8 : 2.4} fill="#fff" opacity={0.9} />
          ))}
        </G>
      ) : (
        <Circle cx={tod === 'morning' ? 110 : tod === 'evening' ? 500 : 480} cy={tod === 'day' ? 60 : 86} r={28} fill={tod === 'evening' ? '#ffb27a' : '#ffe08a'} opacity={0.9} />
      )}
      {/* 단계가 오를수록 풍성해진다: 꼬마 언덕 · 친구 나무 · 단짝 두 겹 언덕 · 전설 무지개 */}
      {stage >= 5 && (
        <G opacity={0.35} transform="translate(300 0) scale(0.62 1) translate(-520 0)">
          <Path d="M80 330 a440 300 0 0 1 880 0" stroke="#ff8fa3" strokeWidth={10} fill="none" />
          <Path d="M92 330 a428 288 0 0 1 856 0" stroke="#ffd166" strokeWidth={10} fill="none" />
          <Path d="M104 330 a416 276 0 0 1 832 0" stroke="#7bd389" strokeWidth={10} fill="none" />
          <Path d="M116 330 a404 264 0 0 1 808 0" stroke="#7ca7ff" strokeWidth={10} fill="none" />
        </G>
      )}
      {stage >= 2 && <Ellipse cx={90} cy={360} rx={300} ry={110} fill={c.hill1} />}
      {stage >= 4 && <Ellipse cx={540} cy={370} rx={300} ry={115} fill={c.hill2} />}
      {stage >= 3 && species !== 'bee' && (
        <G transform="translate(36 0)"><Rect x={42} y={230} width={14} height={110} rx={5} fill="#a5794f" /><Circle cx={49} cy={214} r={44} fill="#8ed081" /><Circle cx={22} cy={236} r={26} fill="#7cc472" /></G>
      )}
      <Ellipse cx={300} cy={470} rx={560} ry={140} fill={c.ground} />

      {/* 뒤쪽 장식 */}
      {deco('bunting', (
        <G transform="translate(-220 0)">
          <Path d="M320 26 Q520 76 720 26" stroke="rgba(0,0,0,.25)" fill="none" strokeWidth={1.5} />
          {Array.from({ length: 7 }, (_, i) => {
            const x = 350 + i * 57
            const t = (x - 320) / 400
            const y = 26 + 4 * t * (1 - t) * 25
            return <Path key={i} d={`M${x - 11} ${y} L${x + 11} ${y} L${x} ${y + 22} Z`} fill={i % 2 ? accent : '#f4c542'} opacity={0.9} />
          })}
        </G>
      ))}
      {tod === 'night' && deco('fireflies', (
        <G>{[[80, 180], [170, 120], [420, 170], [510, 140], [270, 90], [560, 220]].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={3.5} fill="#fff59a" />)}</G>
      ))}
      {deco('butterfly', (
        <G transform="translate(420 110)">
          <Ellipse cx={-7} cy={0} rx={8} ry={7} fill="#c49bff" /><Ellipse cx={7} cy={0} rx={8} ry={7} fill="#c49bff" />
          <Ellipse cx={-6} cy={9} rx={5} ry={4} fill="#9fb8ff" /><Ellipse cx={6} cy={9} rx={5} ry={4} fill="#9fb8ff" />
          <Rect x={-1} y={-6} width={2} height={18} rx={1} fill="#555" />
        </G>
      ))}
      {deco('tent', (
        <G transform="translate(-500 0)"><Path d="M920 340 L980 250 L1040 340 Z" fill="#f4c542" /><Path d="M980 250 L962 340 L998 340 Z" fill="#7a5b2e" /><Path d="M980 250 l0 -14 l16 6 z" fill={accent} /></G>
      ))}
      {deco('fence', (
        <G opacity={0.9} transform="translate(-230 -20)">
          <Path d="M640 300h90M640 316h90" stroke="#c89c6d" strokeWidth={5} />
          {[646, 672, 698, 722].map((x) => <Rect key={x} x={x} y={288} width={8} height={40} rx={3} fill="#b5835a" />)}
        </G>
      ))}
      {deco('arch', (
        <G transform="translate(-220 0)">
          <Path d="M430 352 V250 a90 90 0 0 1 180 0 V352" stroke="#5DBB63" strokeWidth={10} fill="none" />
          {[[432, 300], [440, 240], [470, 190], [520, 170], [570, 190], [600, 240], [608, 300]].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={7} fill={['#ff8fa3', '#ffd166', '#fff', '#c49bff'][i % 4]} />)}
        </G>
      ))}

      {/* 종마다 소품(10 §3.1) */}
      <Props species={species} />

      {/* 앞쪽 장식 */}
      {deco('sign', (
        <G transform="translate(-100 -36)">
          <Rect x={218} y={318} width={6} height={34} fill="#9a7552" /><Rect x={180} y={296} width={82} height={28} rx={4} fill="#c89c6d" />
          <SvgText x={221} y={315} textAnchor="middle" fontSize={15} fontWeight="700" fill="#5b4126">{name.length > 6 ? `${name.slice(0, 6)}…` : name}</SvgText>
        </G>
      ))}
      {deco('flowers', (
        <G transform="translate(60 0)">
          <Path d="M114 330h36l-5 26h-26z" fill="#d9825b" /><Path d="M124 330v-18M138 330v-24" stroke="#5DBB63" strokeWidth={3} />
          <Circle cx={124} cy={308} r={8} fill="#ff8fa3" /><Circle cx={138} cy={300} r={8} fill="#ffd166" /><Circle cx={124} cy={308} r={3} fill="#fff" /><Circle cx={138} cy={300} r={3} fill="#fff" />
        </G>
      ))}
      {deco('lamp', (
        <G transform="translate(-320 0)">
          {(lampOn || tod === 'night') && <Circle cx={866} cy={318} r={40} fill="#ffe7a3" opacity={0.55} />}
          <Rect x={858} y={320} width={16} height={30} rx={5} fill="#f3e3c8" /><Path d="M840 324a26 22 0 0 1 52 0z" fill="#ff8f6b" />
          <Circle cx={854} cy={312} r={4} fill="#fff" /><Circle cx={876} cy={308} r={3} fill="#fff" />
        </G>
      ))}
      {deco('ball', (<G transform="translate(-240 6)"><Circle cx={640} cy={350} r={14} fill="#ff8f8f" /><Path d="M626 350h28" stroke="#fff" strokeWidth={4} /></G>))}
    </Svg>
  )
}

/** 종마다 소품(데스크톱 Props를 600 무대로 옮김) */
function Props({ species }: { species: Species | null }) {
  switch (species) {
    case 'snail': return <G transform="translate(-40 120)"><Ellipse cx={460} cy={230} rx={70} ry={16} fill="#8FD3F2" opacity={0.75} /><Ellipse cx={440} cy={226} rx={16} ry={5} fill="#7BC47F" /><Ellipse cx={482} cy={233} rx={11} ry={3.5} fill="#7BC47F" /></G>
    case 'bee': return (
      <G>
        <G transform="translate(-352 24)"><Rect x={424} y={160} width={18} height={190} rx={6} fill="#B5835A" /><Circle cx={432} cy={146} r={56} fill="#8ED081" /><Circle cx={410} cy={132} r={6} fill="#C98E5B" /><Circle cx={452} cy={152} r={6} fill="#B5764A" /></G>
        <G transform="translate(50 0)"><Ellipse cx={420} cy={358} rx={9} ry={7} fill="#B5764A" /><Ellipse cx={440} cy={361} rx={9} ry={7} fill="#C98E5B" /></G>
      </G>
    )
    case 'worm': return <G><Ellipse cx={300} cy={356} rx={110} ry={16} fill="#F4B6C2" opacity={0.85} /><G transform="translate(-10 110)"><Circle cx={430} cy={246} r={13} fill="#9FB8FF" /><Path d="M419 246 q11 -10 22 0 M421 251 q9 -6 18 0" stroke="#fff" strokeWidth={2} fill="none" /></G></G>
    case 'frog': return <G><Path d="M-80 350 q40 -10 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 V400 H-80 Z" fill="#8FD3F2" opacity={0.55} /><G transform="translate(-250 0)"><Circle cx={690} cy={342} r={9} fill="#B8B2A7" /><Circle cx={710} cy={347} r={7} fill="#CFC9BE" /><Circle cx={728} cy={341} r={8} fill="#A9A397" /></G></G>
    default: return null
  }
}
