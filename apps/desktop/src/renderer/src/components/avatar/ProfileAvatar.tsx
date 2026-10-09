// 35 §2 프로필 이미지 한 개 — 글자 · 성장 캐릭터(CharacterArt 재사용) · 알 · 얼굴(공용 도형 데이터).
// 크기만 받는다(레일 34 · 설정 72 · 고르기 칸 40 · 미리 보기 64). 배경색은 그림의 일부라 테마와 무관.
import { findFace, type FaceShape, type ResolvedAvatar } from '@sprout/schema/avatar'
import type { CSSProperties } from 'react'
import { CharacterArt } from '../growth/CharacterArt'
import './avatar.css'

export function FaceArt({ id, size }: { id: string; size: number }) {
  const face = findFace(id)
  if (!face) return null
  return <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">{face.shapes.map((s, i) => <Shape key={i} s={s} />)}</svg>
}
function Shape({ s }: { s: FaceShape }) {
  const paint = { fill: s.fill ?? 'none', stroke: s.stroke, strokeWidth: s.sw, opacity: s.o, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (s.t === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} {...paint} />
  if (s.t === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined} {...paint} />
  if (s.t === 'rect') return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...paint} />
  return <path d={s.d} {...paint} />
}

/** 그림 부분만(원 안). 캐릭터는 머리 쪽을 잘라(bust) 원을 채운다 — 42 §5.3 아바타 칸, 43 결정 ⑨ fit. 입힌 모자가 보인다(43 §5.3) */
export function AvatarArt({ avatar, size }: { avatar: Exclude<ResolvedAvatar, { type: 'letter' }>; size: number }) {
  if (avatar.type === 'face') return <FaceArt id={avatar.faceId} size={size} />
  const style: CSSProperties = { position: 'absolute', left: 0, top: size * 0.04 }
  return <span className="avatar__char" style={style}><CharacterArt species={avatar.type === 'char' ? avatar.species : null} stage={avatar.type === 'char' ? avatar.stage : 1} size={size} crop="bust" noAura mood="smile" /></span>
}

export function ProfileAvatar({ avatar, size, letter, className = '' }: { avatar: ResolvedAvatar; size: number; letter: string; className?: string }) {
  if (avatar.type === 'letter') {
    return <span className={`avatar avatar--letter ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">{letter}</span>
  }
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, background: avatar.bg }} aria-hidden="true">
      <AvatarArt avatar={avatar} size={size} />
    </span>
  )
}
