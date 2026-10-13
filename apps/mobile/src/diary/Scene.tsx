// 28 §9 C~H 일기 대화 무대: 고른 배경 장면(자동 = 시간대) 끝까지 + 받침 위 캐릭터(AI 비서 채팅 49 v1.6과 같은 방식).
// 받침이 아래 덩어리(기분·칩·입력창) 바로 위에 오도록 장면을 옮긴다(키보드가 오르면 같이 위로, 캐릭터는 작게).
// 캐릭터 몸짓: 듣기(쓰는 중) = 기울며 조금 커짐 · 생각 = 좌우로 천천히 · 말하기 = 들썩 · 끄덕(보내자마자) · 깡충(저장). 움직임 줄이기면 얼굴만.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg'
import type { ArtMood } from '@sprout/schema/characterArt'
import { FOOT, SCENE_EDGE, SCENE_TINT, sceneLayout } from '@sprout/schema/characterArt'
import { companionLabel } from '@sprout/schema/companion'
import { SceneBackdrop } from '../growth/art/Scene3D'
import { useCharacterWear } from '../growth/art/CharacterArt'
import { PlayableCharacter, type PlayHandle } from '../growth/art/PlayableCharacter'
import type { Buddy } from './logic'

export type BuddyState = 'idle' | 'listen' | 'think' | 'talk'
export type SceneHandle = { nod: () => void; hop: () => void }

export const DiaryScene = forwardRef<SceneHandle, {
  sceneKey: string; width: number
  /** 장면 높이(키보드 없을 때 높이로 고정 — 출렁이지 않게) */
  height: number
  /** 받침이 올 화면 y */
  perchY: number
  size: number
  buddy: Buddy & { stage: number; level: number }
  state: BuddyState; mood: ArtMood; reduced: boolean
}>(function DiaryScene({ sceneKey, width, height, perchY, size, buddy, state, mood, reduced }, ref) {
  const wear = useCharacterWear()
  const L0 = sceneLayout(sceneKey, width, height, 'bottom')
  const shift = perchY - L0.perchY
  const shiftV = useSharedValue(shift)
  useEffect(() => { shiftV.value = reduced ? shift : withTiming(shift, { duration: 380 }) }, [shift, reduced, shiftV])
  const shiftSt = useAnimatedStyle(() => ({ transform: [{ translateY: shiftV.value }] }))
  const tint = SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-day']
  const edge = SCENE_EDGE[sceneKey] ?? tint.top

  // 몸짓
  const pc = useRef<PlayHandle>(null)
  const rot = useSharedValue(0), sc = useSharedValue(1), sy = useSharedValue(1), ny = useSharedValue(0)
  const ease = Easing.inOut(Easing.sin)
  useEffect(() => {
    cancelAnimation(rot); cancelAnimation(sc); cancelAnimation(sy)
    if (reduced) { rot.value = 0; sc.value = 1; sy.value = 1; return }
    if (state === 'think') {
      sc.value = withTiming(1, { duration: 250 }); sy.value = withTiming(1, { duration: 200 })
      rot.value = withSequence(withTiming(-3, { duration: 400, easing: ease }), withRepeat(withSequence(withTiming(3, { duration: 900, easing: ease }), withTiming(-3, { duration: 900, easing: ease })), -1))
    } else if (state === 'talk') {
      rot.value = withTiming(0, { duration: 200 }); sc.value = withTiming(1.02, { duration: 200 })
      sy.value = withRepeat(withSequence(withTiming(1.04, { duration: 150, easing: ease }), withTiming(0.98, { duration: 170, easing: ease })), -1, true)
    } else if (state === 'listen') {
      sy.value = withTiming(1, { duration: 200 })
      rot.value = withSpring(-5, { damping: 9, stiffness: 120 }); sc.value = withSpring(1.04, { damping: 10, stiffness: 120 })
    } else {
      rot.value = withSpring(0, { damping: 10, stiffness: 110 }); sc.value = withSpring(1, { damping: 10, stiffness: 110 }); sy.value = withTiming(1, { duration: 250 })
    }
  }, [state, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    // 끄덕 2번(아래로 4px) — 28 §9 D
    nod: () => { if (reduced) return; ny.value = withSequence(withTiming(4, { duration: 110 }), withTiming(0, { duration: 130 }), withTiming(4, { duration: 110 }), withTiming(0, { duration: 160 })) },
    hop: () => { pc.current?.play('hop'); if (!reduced) setTimeout(() => pc.current?.play('giggle'), 420) }
  }), [reduced, ny])
  const bodySt = useAnimatedStyle(() => ({ transform: [{ translateY: ny.value }, { rotate: `${rot.value}deg` }, { scale: sc.value }, { scaleY: sy.value }] }))

  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: Math.max(height, perchY + 400), backgroundColor: edge }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width, height }, shiftSt]}>
        <SceneBackdrop sceneKey={sceneKey} width={width} height={height} />
        <Svg pointerEvents="none" width={width} height={90} style={{ position: 'absolute', left: 0, top: L0.y }}>
          <Defs><SvgGradient id="dedge" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={edge} stopOpacity={1} /><Stop offset="1" stopColor={edge} stopOpacity={0} /></SvgGradient></Defs>
          <Rect x="0" y="0" width={width} height={90} fill="url(#dedge)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: L0.perchX - size * FOOT.x, top: perchY - size * FOOT.y, width: size, height: size, transformOrigin: '50% 90%' }, bodySt]} pointerEvents="box-none">
        <PlayableCharacter ref={pc} species={buddy.species} stage={buddy.stage} size={size} mood={mood} seed={wear?.wear.seed}
          wear={buddy.species ? wear?.wear : undefined} level="full" draggable={false} idle={state === 'idle' || state === 'listen'} reduced={reduced}
          accessibilityLabel={companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage)} />
      </Animated.View>
    </>
  )
})
