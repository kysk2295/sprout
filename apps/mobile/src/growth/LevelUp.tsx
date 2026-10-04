// 23 §4 레벨업(가운데 카드, 폭 345) · 진화(전체 화면, 시안 B4). 앱이 앞으로 올 때·성장 탭을 열 때 확인하고 기기에 본 레벨을 적는다
// (다른 기기에서 오른 레벨도 이 기기에서 한 번만). 움직임 줄이기면 색종이·튀어오름 없이 바로 새 모습.
import type { Species } from '@sprout/schema/growth'
import { ChevronRight } from 'lucide-react-native'
import { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import type { Palette } from '../theme/palette'
import { CharacterArt } from './art/CharacterArt'
import { Confetti } from './Bits'
import { evolveText, iGa, stageName, type LevelChange } from './logic'

export type Shown = Extract<LevelChange, { kind: 'levelup' | 'evolve' }> & { gained: { label: string; amount: number }[] }

export function LevelUpModal({ p, shown, species, onClose, reduced }: { p: Palette; shown: Shown | null; species: Species | null; onClose: () => void; reduced: boolean }) {
  if (!shown) return null
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {shown.kind === 'evolve'
        ? <Evolve p={p} shown={shown} species={species} onClose={onClose} reduced={reduced} />
        : <LevelCard p={p} shown={shown} species={species} onClose={onClose} reduced={reduced} />}
    </Modal>
  )
}

function Gained({ p, gained }: { p: Palette; gained: Shown['gained'] }) {
  if (!gained.length) return null
  return (
    <View style={[s.got, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]} accessibilityLabel="이번에 받은 XP">
      {gained.map((g, i) => (
        <View key={g.label} style={[s.gotRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
          <Text style={[s.gotLabel, { color: p.textSecondary }]}>{g.label}</Text>
          <Text style={[s.gotN, { color: p.accent }]}>+{g.amount}</Text>
        </View>
      ))}
    </View>
  )
}

function LevelCard({ p, shown, species, onClose, reduced }: { p: Palette; shown: Shown; species: Species | null; onClose: () => void; reduced: boolean }) {
  const win = useWindowDimensions()
  const y = useSharedValue(0)
  const sc = useSharedValue(reduced ? 1 : 0.9)
  useEffect(() => {
    if (reduced) return
    sc.value = withSpring(1, { damping: 12 })
    y.value = withDelay(200, withSequence(withTiming(-22, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 260, easing: Easing.bounce })))
  }, [reduced, sc, y])
  const card = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }))
  const hop = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return (
    <View style={[s.scrim, { backgroundColor: p.scrim }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
      <Animated.View style={[s.card, { width: Math.min(345, win.width - 32), backgroundColor: p.bgPopover }, card]} accessibilityViewIsModal>
        <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
          <Animated.View style={hop}><CharacterArt species={species} stage={shown.stage} size={130} mood="happy" /></Animated.View>
          {!reduced ? <View style={s.cardBurst} pointerEvents="none"><Confetti count={20} spread={110} top /></View> : null}
          <Text style={[s.cardTitle, { color: p.textPrimary }]}>레벨 {iGa(String(shown.level))} 됐어요</Text>
          <Text style={[s.cardSub, { color: p.textTertiary }]}>Lv {shown.level} · {stageName(shown.stage)}</Text>
          <Gained p={p} gained={shown.gained} />
          <Pressable style={[s.btn, { backgroundColor: p.accent }]} onPress={onClose} accessibilityRole="button"><Text style={s.btnText}>확인</Text></Pressable>
        </View>
      </Animated.View>
    </View>
  )
}

/** B4: 강조색 연한 원형 빛 · 위쪽 색종이 · 옛 모습(96, 흐림) › 새 모습(176, 기쁨) — 진화 1.2초(옛 → 반짝 → 새) */
function Evolve({ p, shown, species, onClose, reduced }: { p: Palette; shown: Shown; species: Species | null; onClose: () => void; reduced: boolean }) {
  const insets = useSafeAreaInsets()
  const win = useWindowDimensions()
  const text = evolveText(species, shown.prevStage, shown.stage, shown.level)
  const grow = useSharedValue(reduced ? 1 : 0)
  const flash = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    grow.value = withDelay(500, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.6)) }))
    flash.value = withDelay(350, withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 450 })))
  }, [reduced, grow, flash])
  const newSt = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * grow.value, transform: [{ scale: 0.55 + 0.45 * grow.value }] }))
  const flashSt = useAnimatedStyle(() => ({ opacity: flash.value }))
  return (
    <View style={[s.full, { backgroundColor: p.bgApp, paddingTop: insets.top + 70, paddingBottom: insets.bottom + 24 }]} accessibilityViewIsModal>
      <Svg style={StyleSheet.absoluteFill} width={win.width} height={win.height}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="34%" rx="60%" ry="35%">
            <Stop offset="0" stopColor={p.accent} stopOpacity={p.dark ? 0.35 : 0.22} />
            <Stop offset="1" stopColor={p.bgApp} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={win.width} height={win.height} fill="url(#glow)" />
      </Svg>
      {!reduced ? <View style={s.topBurst} pointerEvents="none"><Confetti count={30} spread={170} top /></View> : null}
      <View style={s.evo}>
        <View style={{ opacity: 0.45 }}><CharacterArt species={species} stage={shown.prevStage} size={96} /></View>
        <ChevronRight size={22} color={p.textTertiary} />
        <Animated.View style={newSt}><CharacterArt species={species} stage={shown.stage} size={176} mood="happy" /></Animated.View>
        <Animated.View pointerEvents="none" style={[s.flash, flashSt]} />
      </View>
      <View style={[s.pill, { backgroundColor: p.accent }]}><Text style={s.pillText}>레벨 {shown.level}</Text></View>
      <Text style={[s.evoTitle, { color: p.textPrimary }]} accessibilityRole="header">{text.title}</Text>
      <Text style={[s.evoSub, { color: p.textSecondary }]}>{text.sub}</Text>
      <Gained p={p} gained={shown.gained} />
      <View style={{ flex: 1 }} />
      <Pressable style={[s.bigBtn, { backgroundColor: p.accent }]} onPress={onClose} accessibilityRole="button"><Text style={s.btnText}>좋아요</Text></Pressable>
      <Text style={[s.note, { color: p.textTertiary }]}>다른 기기에서 오른 레벨도 한 번만 보여 줘요</Text>
    </View>
  )
}

const s = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, paddingTop: 22, paddingBottom: 16, paddingHorizontal: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  cardBurst: { position: 'absolute', left: 0, right: 0, top: 30, height: 1 },
  cardTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', marginTop: 4 },
  cardSub: { fontSize: 13, marginTop: 2 },
  got: { alignSelf: 'stretch', marginTop: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  gotRow: { flexDirection: 'row', alignItems: 'center', height: 40 },
  gotLabel: { flex: 1, fontSize: 14 },
  gotN: { fontSize: 14, fontWeight: '700' },
  btn: { alignSelf: 'stretch', height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  bigBtn: { alignSelf: 'stretch', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  full: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  topBurst: { position: 'absolute', left: 0, right: 0, top: 150, height: 1 },
  evo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 10 },
  flash: { position: 'absolute', right: 0, width: 176, height: 176, borderRadius: 88, backgroundColor: '#fff' },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 2 },
  pillText: { color: '#fff', fontSize: 13, lineHeight: 20, fontWeight: '700' },
  evoTitle: { fontSize: 26, lineHeight: 32, fontWeight: '800', textAlign: 'center', marginTop: 10 },
  evoSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 6 },
  note: { fontSize: 12, marginTop: 10 }
})
