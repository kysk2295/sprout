import type { ReactNode } from 'react'
import type { Species } from '@sprout/schema/growth'
import type { TimeOfDay } from '../../data/growth'

// 10 §3.2.2 무대 장면 · §3.2.7 장식 — 직접 그린 단순 SVG(틱틱·다른 앱 그림 원본 없음).
// 좌표는 1040×400 기준, 가운데(520)를 중심으로 양옆이 잘린다(xMidYMax slice).

type Fx = { ball: boolean; lamp: boolean; flowers: number; butterfly: number }

export function Scene({ species, stage, tod, name, placed, fx, onDeco }: {
  species: Species | null; stage: number; level: number; tod: TimeOfDay; name: string; placed: Set<string>; fx: Fx; onDeco: (id: string) => void
}) {
  const has = (id: string) => placed.has(id)
  const deco = (id: string, el: ReactNode, clickable = false) => has(id) && (
    <g key={id} className={`gs-deco gs-deco--${id}${clickable ? ' is-clickable' : ''}`} onClick={clickable ? () => onDeco(id) : undefined}>{el}</g>
  )
  return (
    <svg className="gs-scene" viewBox="0 0 1040 400" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {/* 하늘: 해·달·별 */}
      {tod === 'night' ? (
        <g>
          <circle cx="880" cy="70" r="26" fill="#f5f1d0" />
          <circle cx="892" cy="62" r="24" className="gs-sky1" />
          {[[120, 50], [260, 90], [420, 40], [600, 70], [720, 30], [980, 110], [60, 130]].map(([x, y], i) => (
            <circle key={i} className="gs-twinkle" style={{ animationDelay: `-${i * 0.5}s` }} cx={x} cy={y} r={i % 2 ? 1.6 : 2.2} fill="#fff" />
          ))}
        </g>
      ) : (
        <circle cx={tod === 'morning' ? 140 : tod === 'evening' ? 900 : 860} cy={tod === 'day' ? 60 : 90} r="30" fill={tod === 'evening' ? '#ffb27a' : '#ffe08a'} opacity="0.9" />
      )}
      {/* 단계가 오를수록 풍성해진다: 꼬마 언덕 · 친구 나무 · 단짝 두 겹 언덕 · 전설 무지개 */}
      {stage >= 5 && (
        <g opacity="0.35" fill="none" strokeWidth="10">
          <path d="M80 330 a440 300 0 0 1 880 0" stroke="#ff8fa3" /><path d="M92 330 a428 288 0 0 1 856 0" stroke="#ffd166" />
          <path d="M104 330 a416 276 0 0 1 832 0" stroke="#7bd389" /><path d="M116 330 a404 264 0 0 1 808 0" stroke="#7ca7ff" />
        </g>
      )}
      {stage >= 2 && <ellipse className="gs-hill1" cx="230" cy="360" rx="380" ry="120" />}
      {stage >= 4 && <ellipse className="gs-hill2" cx="840" cy="370" rx="400" ry="125" />}
      {stage >= 3 && species !== 'bee' && (
        <g><rect x="42" y="230" width="14" height="110" rx="5" fill="#a5794f" /><circle cx="49" cy="214" r="44" fill="#8ed081" /><circle cx="22" cy="236" r="26" fill="#7cc472" /></g>
      )}
      <ellipse className="gs-ground" cx="520" cy="470" rx="780" ry="140" />

      {/* 뒤쪽 장식 */}
      {deco('bunting', (
        <g>
          <path d="M320 26 Q520 76 720 26" stroke="rgba(0,0,0,.25)" fill="none" strokeWidth="1.5" />
          {Array.from({ length: 7 }, (_, i) => { const x = 350 + i * 57, t = (x - 320) / 400, y = 26 + 4 * t * (1 - t) * 25; return <path key={i} d={`M${x - 11} ${y} L${x + 11} ${y} L${x} ${y + 22} Z`} className={i % 2 ? 'gs-accent-fill' : undefined} fill={i % 2 ? undefined : '#f4c542'} opacity="0.9" /> })}
        </g>
      ))}
      {tod === 'night' && deco('fireflies', (
        <g>{[[140, 180], [300, 120], [700, 170], [860, 140], [480, 90], [940, 220]].map(([x, y], i) => <circle key={i} className="gs-firefly" style={{ animationDelay: `-${i * 0.7}s` }} cx={x} cy={y} r="3.5" fill="#fff59a" />)}</g>
      ))}
      {deco('butterfly', (
        <g className="gs-butterfly" key={`b${fx.butterfly}`} style={fx.butterfly ? { animationDuration: '3s' } : undefined}>
          <g transform="translate(600 140)">
            <g className="gs-wing"><ellipse cx="-7" cy="0" rx="8" ry="7" fill="#c49bff" /><ellipse cx="7" cy="0" rx="8" ry="7" fill="#c49bff" /><ellipse cx="-6" cy="9" rx="5" ry="4" fill="#9fb8ff" /><ellipse cx="6" cy="9" rx="5" ry="4" fill="#9fb8ff" /></g>
            <rect x="-1" y="-6" width="2" height="18" rx="1" fill="#555" />
          </g>
        </g>
      ), true)}
      {deco('tent', (<g><path d="M920 340 L980 250 L1040 340 Z" fill="#f4c542" /><path d="M980 250 L962 340 L998 340 Z" fill="#7a5b2e" /><path d="M980 250 l0 -14 l16 6 z" className="gs-accent-fill" /></g>))}
      {deco('fence', (
        <g opacity="0.9"><path d="M640 300h90M640 316h90" stroke="#c89c6d" strokeWidth="5" />{[646, 672, 698, 722].map((x) => <rect key={x} x={x} y="288" width="8" height="40" rx="3" fill="#b5835a" />)}</g>
      ))}
      {deco('arch', (
        <g><path d="M430 352 V250 a90 90 0 0 1 180 0 V352" stroke="#5DBB63" strokeWidth="10" fill="none" />
          {[[432, 300], [440, 240], [470, 190], [520, 170], [570, 190], [600, 240], [608, 300]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" fill={['#ff8fa3', '#ffd166', '#fff', '#c49bff'][i % 4]} />)}</g>
      ))}

      {/* 종마다 소품(10 §3.1) */}
      <Props species={species} />

      {/* 앞쪽 장식 */}
      {deco('sign', (
        <g><rect x="218" y="318" width="6" height="34" fill="#9a7552" /><rect x="180" y="296" width="82" height="28" rx="4" fill="#c89c6d" />
          <text x="221" y="315" textAnchor="middle" className="gs-namesign">{name.length > 6 ? `${name.slice(0, 6)}…` : name}</text></g>
      ))}
      {deco('flowers', (
        <g key={`f${fx.flowers}`} className={fx.flowers ? 'gs-wiggle' : undefined}>
          <path d="M114 330h36l-5 26h-26z" fill="#d9825b" /><path d="M124 330v-18M138 330v-24" stroke="#5DBB63" strokeWidth="3" />
          <circle cx="124" cy="308" r="8" fill="#ff8fa3" /><circle cx="138" cy="300" r="8" fill="#ffd166" /><circle cx="124" cy="308" r="3" fill="#fff" /><circle cx="138" cy="300" r="3" fill="#fff" />
        </g>
      ), true)}
      {deco('lamp', (
        <g className={fx.lamp || tod === 'night' ? 'is-lit' : undefined}>
          <circle className="gs-lamp__glow" cx="866" cy="318" r="40" fill="#ffe7a3" />
          <rect x="858" y="320" width="16" height="30" rx="5" fill="#f3e3c8" /><path d="M840 324a26 22 0 0 1 52 0z" fill="#ff8f6b" />
          <circle cx="854" cy="312" r="4" fill="#fff" /><circle cx="876" cy="308" r="3" fill="#fff" />
        </g>
      ), true)}
      {deco('ball', (<g className={`gs-ball${fx.ball ? ' is-rolled' : ''}`}><circle cx="640" cy="350" r="14" fill="#ff8f8f" /><path d="M626 350h28" stroke="#fff" strokeWidth="4" /></g>), true)}
    </svg>
  )
}

/** 종마다 소품(Interactive v2 RoomProps를 1040×400 무대로 옮김) */
function Props({ species }: { species: Species | null }) {
  switch (species) {
    case 'snail': return <g transform="translate(200 120)"><ellipse cx="460" cy="230" rx="70" ry="16" fill="#8FD3F2" opacity="0.75" /><ellipse cx="440" cy="226" rx="16" ry="5" fill="#7BC47F" /><ellipse cx="482" cy="233" rx="11" ry="3.5" fill="#7BC47F" /></g>
    case 'bee': return <g><g transform="translate(-350 -10)"><rect x="424" y="160" width="18" height="190" rx="6" fill="#B5835A" /><circle cx="432" cy="146" r="56" fill="#8ED081" /><circle cx="410" cy="132" r="6" fill="#C98E5B" /><circle cx="452" cy="152" r="6" fill="#B5764A" /></g><ellipse cx="420" cy="358" rx="9" ry="7" fill="#B5764A" /><ellipse cx="440" cy="361" rx="9" ry="7" fill="#C98E5B" /></g>
    case 'worm': return <g><ellipse cx="520" cy="356" rx="110" ry="16" fill="#F4B6C2" opacity="0.85" /><g transform="translate(160 110)"><circle cx="430" cy="246" r="13" fill="#9FB8FF" /><path d="M419 246 q11 -10 22 0 M421 251 q9 -6 18 0" stroke="#fff" strokeWidth="2" fill="none" /></g></g>
    case 'frog': return <g><path d="M0 350 q40 -10 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 V400 H0 Z" fill="#8FD3F2" opacity="0.55" /><circle cx="690" cy="342" r="9" fill="#B8B2A7" /><circle cx="710" cy="347" r="7" fill="#CFC9BE" /><circle cx="728" cy="341" r="8" fill="#A9A397" /></g>
    default: return null
  }
}

/** 꾸미기 패널 · 새 장식 카드의 작은 그림(34×34) */
export function DecorIcon({ id }: { id: string }) {
  const body: Record<string, ReactNode> = {
    sign: <><rect x="15" y="20" width="4" height="16" fill="#9a7552" /><rect x="5" y="9" width="24" height="13" rx="2" fill="#c89c6d" /></>,
    flowers: <><path d="M10 22h14l-2 12H12z" fill="#d9825b" /><circle cx="13" cy="14" r="4" fill="#ff8fa3" /><circle cx="21" cy="12" r="4" fill="#ffd166" /><path d="M13 18v4M21 16v6" stroke="#5DBB63" strokeWidth="2" /></>,
    fence: <><path d="M4 16h26M4 25h26" stroke="#c89c6d" strokeWidth="3" /><path d="M8 10v22M17 10v22M26 10v22" stroke="#b5835a" strokeWidth="4" /></>,
    lamp: <><path d="M6 18a11 9 0 0 1 22 0z" fill="#ff8f6b" /><circle cx="12" cy="14" r="2" fill="#fff" /><circle cx="21" cy="12" r="1.6" fill="#fff" /><rect x="14" y="18" width="6" height="12" rx="2" fill="#f3e3c8" /></>,
    butterfly: <><ellipse cx="11" cy="14" rx="7" ry="6" fill="#c49bff" /><ellipse cx="23" cy="14" rx="7" ry="6" fill="#c49bff" /><ellipse cx="12" cy="23" rx="5" ry="4" fill="#9fb8ff" /><ellipse cx="22" cy="23" rx="5" ry="4" fill="#9fb8ff" /><rect x="16" y="10" width="2" height="16" rx="1" fill="#555" /></>,
    ball: <><circle cx="17" cy="18" r="11" fill="#ff8f8f" /><path d="M6 18h22" stroke="#fff" strokeWidth="3" /></>,
    bunting: <><path d="M2 8q15 10 30 0" stroke="#999" fill="none" /><path d="M6 10l4 10 4-8zM24 11l4 9 3-11z" fill="#f4c542" /><path d="M15 13l4 10 4-10z" className="gs-accent-fill" /></>,
    tent: <><path d="M17 6 3 30h28z" fill="#f4c542" /><path d="M17 14l-5 16h10z" fill="#7a5b2e" /></>,
    fireflies: <><circle cx="9" cy="12" r="2.5" fill="#e8c93a" /><circle cx="22" cy="9" r="2" fill="#e8c93a" /><circle cx="17" cy="22" r="3" fill="#e8c93a" /><circle cx="27" cy="24" r="1.8" fill="#e8c93a" /></>,
    arch: <><path d="M6 32V17a11 11 0 0 1 22 0v15" stroke="#5DBB63" strokeWidth="4" fill="none" /><circle cx="8" cy="18" r="3" fill="#ff8fa3" /><circle cx="17" cy="7" r="3" fill="#ffd166" /><circle cx="26" cy="18" r="3" fill="#c49bff" /></>
  }
  return <svg className="gs-decoicon" viewBox="0 0 34 34" width="34" height="34" aria-hidden>{body[id]}</svg>
}
