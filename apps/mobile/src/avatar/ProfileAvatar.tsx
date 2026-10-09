// 35 §2 프로필 이미지 한 개(휴대폰) — 데스크톱 components/avatar/ProfileAvatar.tsx와 같은 규칙:
// 글자 · 성장 캐릭터(CharacterArt 재사용) · 알 · 얼굴(공용 도형 데이터 AVATAR_FACES).
import { findFace, type FaceShape, type ResolvedAvatar } from '@sprout/schema/avatar'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg'
import { CharacterArt } from '../growth/art/CharacterArt'

/** 글자 아바타 색 — 지금까지 설정·서랍에 쓰던 초록 그대로 */
const LETTER_BG = '#4caf6a'

function Shape({ s }: { s: FaceShape }) {
  const paint = { fill: s.fill ?? 'none', stroke: s.stroke, strokeWidth: s.sw, opacity: s.o, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (s.t === 'circle') return <Circle cx={s.cx} cy={s.cy} r={s.r} {...paint} />
  if (s.t === 'ellipse') return <Ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined} {...paint} />
  if (s.t === 'rect') return <Rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...paint} />
  return <Path d={s.d} {...paint} />
}

export function ProfileAvatar({ avatar, size, letter }: { avatar: ResolvedAvatar; size: number; letter: string }) {
  const round = { width: size, height: size, borderRadius: size / 2 }
  if (avatar.type === 'letter') {
    return <View style={[s.base, round, { backgroundColor: LETTER_BG }]}><Text style={{ color: '#fff', fontSize: Math.round(size * 0.38), fontWeight: '600' }}>{letter}</Text></View>
  }
  if (avatar.type === 'face') {
    const face = findFace(avatar.faceId)
    return (
      <View style={[s.base, round, { backgroundColor: avatar.bg }]}>
        <Svg width={size} height={size} viewBox="0 0 120 120">{face?.shapes.map((sh, i) => <Shape key={i} s={sh} />)}</Svg>
      </View>
    )
  }
  // 42 §5.3 · 49 §8.1 아바타 = 3D 그림을 머리 쪽으로 확대해 원 안에 자름(bust, 공용 cropBox): 단계마다 다른 새싹·관·모자가 원 안에 보인다. 입힌 모자는 CharacterWearProvider(따라가기 = 지금 단계)
  return (
    <View style={[s.base, round, { backgroundColor: avatar.bg }]}>
      <CharacterArt species={avatar.type === 'char' ? avatar.species : null} stage={avatar.type === 'char' ? avatar.stage : 1} size={size} crop="bust" mood="smile" />
    </View>
  )
}
const s = StyleSheet.create({ base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } })
