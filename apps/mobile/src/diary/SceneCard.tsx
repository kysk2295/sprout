// 28 §10.2 그날의 장면 카드 그리기: hero(크게, P1) · row(그날 장 목록 맨 위) · cell(앨범 칸 3:4).
// 사진이 있으면 장면 위에 흰 테두리 사진이 기울어 붙고, 없으면 기분 장면 + 제목. 처음 나타날 때(appear) 움직임(28 §10.5):
// 카드 뒤집힘 700ms → 사진 떨어져 붙음(spring, −8° → 5°) → 칩 60ms 간격. 움직임 줄이기면 흐려지며 나타남만.
import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import type { SceneCard } from '@sprout/schema/diaryScene'
import { SceneBackdrop } from '../growth/art/Scene3D'
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
  const drop = useSharedValue(appear && !reduced ? 1 : 0)
  useEffect(() => {
    if (!appear) return
    if (reduced) { fade.value = withTiming(1, { duration: 200 }); return }
    fade.value = withTiming(1, { duration: 260 })
    flip.value = withTiming(0, { duration: 700, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
    drop.value = withDelay(420, withSpring(0, { damping: 12, stiffness: 180 }))
  }, [appear, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  const cardSt = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ perspective: 900 }, { rotateY: `${flip.value}deg` }] }))
  const photoSt = useAnimatedStyle(() => ({ transform: [{ translateY: -40 * drop.value }, { rotate: `${5 - 13 * drop.value}deg` }], opacity: 1 - drop.value * 0.6 }))
  const big = variant === 'hero'
  const small = variant === 'cell'
  const pw = big ? box.w * 0.42 : variant === 'row' ? 74 : box.w * 0.62
  const ph = pw * 1.25
  const chips = [card.done ? `✓ 할 일 ${card.done}` : null, card.firstEvent ? `📅 ${card.firstEvent}` : null, card.photoCount > 1 ? `📷 ${card.photoCount}` : null, big ? `"${card.buddyLine}"` : null].filter(Boolean) as string[]
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label ? `${label}, ` : ''}${dayLabel(card.date)} ${moodLabel(card.mood)} ${card.title}`}>
      <Animated.View onLayout={onLayout} style={[small ? s.cell : big ? s.hero : s.row, cardSt]}>
        {box.w ? <SceneBackdrop sceneKey={card.sceneKey} width={box.w} height={box.h} style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, s.shade]} pointerEvents="none" />
        <View style={[s.band, { backgroundColor: moodColor(card.mood) }]} />
        {uri && box.w ? (
          <Animated.View style={[s.photo, small ? s.photoCell : null, { width: pw, height: small ? box.h * 0.62 : ph, right: small ? box.w * 0.19 : big ? 18 : 14, top: small ? 10 : big ? 22 : 14 }, photoSt]}>
            <Image source={{ uri }} style={{ flex: 1, borderRadius: small ? 6 : 10 }} resizeMode="cover" />
          </Animated.View>
        ) : null}
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

const s = StyleSheet.create({
  hero: { height: 420, borderRadius: 26, overflow: 'hidden', backgroundColor: '#2c3048' },
  row: { height: 150, borderRadius: 22, overflow: 'hidden', backgroundColor: '#2c3048' },
  cell: { aspectRatio: 3 / 4, borderRadius: 14, overflow: 'hidden', backgroundColor: '#2c3048' },
  shade: { backgroundColor: 'rgba(10,14,24,0.28)' },
  band: { position: 'absolute', left: 0, right: 0, top: 0, height: 4 },
  photo: { position: 'absolute', backgroundColor: '#fff', padding: 4, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  photoCell: { padding: 2, borderRadius: 7 },
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
