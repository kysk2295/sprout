// 28 §10.2 · §10.9 그날의 장면 카드 v2: hero(크게, P1) · row(그날 장 목록 맨 위) · cell(앨범 칸 3:4).
// 사진이 있으면 첫 사진이 카드 전체 배경(cover) + 아래 어두운 그라데이션. 없으면 기분 장면 받침 위에 내 캐릭터가 그날 기분의 표정·몸짓
// (최고 깡충 · 좋았어요 살랑 · 그저 그래 숨 · 별로 고개 숙임 · 힘들어요 우는 얼굴 웅크림 — cardPoseOf). 앨범 칸은 작아서 움직이지 않는다.
// 처음 나타날 때(appear): 카드 뒤집힘 700ms → 칩 60ms 간격. 움직임 줄이기면 흐려지며 나타남만, 몸짓 없음.
import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { cancelAnimation, Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { cardPoseOf, type CardMotion, type SceneCard } from '@sprout/schema/diaryScene'
import { CharacterArt } from '../growth/art/CharacterArt'
import { onPerch, SceneBackdrop } from '../growth/art/Scene3D'
import { useBuddy } from './data'
import { MOODS } from './logic'
import { usePhotoUri } from './photos'

const moodColor = (m: number | null) => MOODS.find((x) => x.value === m)?.color ?? '#9AA39D'
const dayLabel = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getMonth() + 1}월 ${x.getDate()}일 ${'일월화수목금토'[x.getDay()]}` }
const moodLabel = (m: number | null) => MOODS.find((x) => x.value === m)?.label ?? ''

export function SceneCardView({ card, variant, appear, reduced, onPress, label }: {
  card: SceneCard; variant: 'hero' | 'row' | 'cell'; appear?: boolean; reduced: boolean; onPress?: () => void
  /** 위 작은 글(예: "1년 전 오늘") */
  label?: string
}) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  const onLayout = (e: LayoutChangeEvent) => { const { width, height } = e.nativeEvent.layout; setBox((o) => (o.w === width && o.h === height ? o : { w: width, h: height })) }
  const uri = usePhotoUri(card.photo?.media_id)
  // 움직임
  const flip = useSharedValue(appear && !reduced ? 90 : 0)
  const fade = useSharedValue(appear ? 0 : 1)
  useEffect(() => {
    if (!appear) return
    if (reduced) { fade.value = withTiming(1, { duration: 200 }); return }
    fade.value = withTiming(1, { duration: 260 })
    flip.value = withTiming(0, { duration: 700, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
  }, [appear, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  const cardSt = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ perspective: 900 }, { rotateY: `${flip.value}deg` }] }))
  const big = variant === 'hero'
  const small = variant === 'cell'
  const buddy = useBuddy()
  const pose = cardPoseOf(card.mood)
  const chips = [card.done ? `✓ 할 일 ${card.done}` : null, card.firstEvent ? `📅 ${card.firstEvent}` : null, card.photoCount > 1 ? `📷 ${card.photoCount}` : null, big ? `"${card.buddyLine}"` : null].filter(Boolean) as string[]
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label ? `${label}, ` : ''}${dayLabel(card.date)} ${moodLabel(card.mood)} ${card.title}`}>
      <Animated.View onLayout={onLayout} style={[small ? s.cell : big ? s.hero : s.row, cardSt]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : box.w ? (
            <SceneBackdrop sceneKey={card.sceneKey} width={box.w} height={box.h} align="center" style={StyleSheet.absoluteFill}>
              {(L) => {
                if (!buddy.species || variant === 'row') return null
                const size = Math.round(box.h * (small ? 0.5 : 0.46))
                const p = onPerch(L, size)
                // 아래 글(날짜·제목·칩)과 겹치지 않게 받침보다 위로 올릴 수 있다
                const top = Math.min(p.top, box.h - (small ? 24 : big ? 120 : 96) - size * 0.92)
                return <PoseBuddy species={buddy.species} stage={buddy.stage} size={size} face={pose.face} motion={small || reduced ? null : pose.motion} style={{ position: 'absolute', left: p.left, top }} />
              }}
            </SceneBackdrop>
          ) : null}
        {!uri && buddy.species && variant === 'row' ? <PoseBuddy species={buddy.species} stage={buddy.stage} size={92} face={pose.face} motion={reduced ? null : pose.motion} style={{ position: 'absolute', right: 10, bottom: 6 }} /> : null}
        {uri && box.w ? (
          <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs><LinearGradient id="g" x1="0" y1="0" x2="0" y2="1"><Stop offset="0.45" stopColor="#000" stopOpacity="0" /><Stop offset="1" stopColor="#000" stopOpacity="0.62" /></LinearGradient></Defs>
            <Rect x="0" y="0" width={box.w} height={box.h} fill="url(#g)" />
          </Svg>
        ) : <View style={[StyleSheet.absoluteFill, s.shade]} pointerEvents="none" />}
        <View style={[s.band, { backgroundColor: moodColor(card.mood) }]} />
        <View style={[s.text, small && s.textCell]}>
          {label ? <Text style={s.label}>{label}</Text> : null}
          {!small ? <Text style={s.meta}>{dayLabel(card.date)}{card.mood ? ` · ${moodLabel(card.mood)}` : ''}</Text> : <Text style={s.cellDay}>{Number(card.date.slice(8))}</Text>}
          <Text style={[s.title, big ? s.titleHero : small ? s.titleCell : null]} numberOfLines={small ? 2 : 2}>{card.title}</Text>
          {!small && chips.length ? (
            <View style={s.chips}>
              {chips.map((c, i) => <Animated.View key={c} entering={appear && !reduced ? FadeIn.delay(700 + i * 60).duration(200) : undefined} style={s.chip}><Text style={s.chipText} numberOfLines={1}>{c}</Text></Animated.View>)}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  )
}

/** 장면 카드의 캐릭터 몸짓(transform만, 반복) — 깡충·살랑·숨·고개 숙임·웅크림. motion null = 가만히(앨범 칸·움직임 줄이기) */
function PoseBuddy({ species, stage, size, face, motion, style }: { species: string; stage: number; size: number; face: string; motion: CardMotion | null; style: object }) {
  const t = useSharedValue(0)
  useEffect(() => {
    if (!motion) { t.value = 0; return }
    const ms = motion === 'hop' ? 1400 : motion === 'sway' ? 2400 : motion === 'huddle' ? 2600 : 3000
    t.value = withRepeat(withSequence(withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.sin) })), -1)
    return () => cancelAnimation(t)
  }, [motion]) // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => {
    const v = t.value
    if (motion === 'hop') return { transform: [{ translateY: -size * 0.14 * Math.sin(v * Math.PI) }] }
    if (motion === 'sway') return { transform: [{ rotate: `${-4 + 8 * v}deg` }] }
    if (motion === 'droop') return { transform: [{ translateY: 3 * v }, { rotate: `${-3 * v}deg` }] }
    if (motion === 'huddle') return { transform: [{ scaleX: 1 + 0.02 * v }, { scaleY: 1 - 0.04 * v }] }
    if (motion === 'breathe') return { transform: [{ scale: 1 + 0.03 * v }] }
    return {}
  })
  return <Animated.View pointerEvents="none" style={[{ width: size, height: size }, style, st]}><CharacterArt species={species as never} stage={stage} size={size} mood={face as never} /></Animated.View>
}

const s = StyleSheet.create({
  hero: { height: 420, borderRadius: 26, overflow: 'hidden', backgroundColor: '#2c3048' },
  row: { height: 150, borderRadius: 22, overflow: 'hidden', backgroundColor: '#2c3048' },
  cell: { aspectRatio: 3 / 4, borderRadius: 14, overflow: 'hidden', backgroundColor: '#2c3048' },
  shade: { backgroundColor: 'rgba(10,14,24,0.28)' },
  band: { position: 'absolute', left: 0, right: 0, top: 0, height: 4 },
  text: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  textCell: { left: 7, right: 7, bottom: 6, top: 5 },
  label: { color: '#FFE3B0', fontSize: 11.5, fontWeight: '800', marginBottom: 2 },
  meta: { color: 'rgba(255,255,255,0.82)', fontSize: 11.5 },
  cellDay: { color: '#fff', fontSize: 11, fontWeight: '800', textShadowColor: '#0008', textShadowRadius: 3 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3, marginTop: 2, textShadowColor: '#0006', textShadowRadius: 4 },
  titleHero: { fontSize: 22, lineHeight: 28 },
  titleCell: { position: 'absolute', bottom: 0, fontSize: 10, lineHeight: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  chip: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%' },
  chipText: { color: '#fff', fontSize: 11.5, fontWeight: '600' }
})
