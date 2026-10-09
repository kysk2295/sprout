// 42 §10.6 진화 순간(휴대폰 전체 화면, 약 2.5초) · 43 §9 꼬마 → 친구 두 갈래 고르기 · 씨앗 깨기(종마다 뚜껑).
// 깊은 초록 덮개 + 빛 원(캐릭터 자리에서만 — 결정 ⑦). 웅크림 → 흰 실루엣 꿀렁 3번 → 빛 방울(1.18초, 고르기는 여기서 멈춤) →
// 고리 두 겹 + 톡 튀어나와 통통 → 종 조각 16개 → 이름 카드(전 → 후). 누르면 끝 장면, 움직임 줄이기 = 0.3초 페이드 + 카드.
// Reanimated withSequence·withDelay·withTiming(층의 opacity·transform만, 39 §11).
import { newPartOf, PATHS, RING, titleOf } from '@sprout/schema/characterArt'
import { STAGES, type Species } from '@sprout/schema/growth'
import { evolutionGift, type Equip, type Path } from '@sprout/schema/wardrobe'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { hx } from '../ui/haptics'
import { CharacterArt, HatchTop } from './art/CharacterArt'
import { SpeciesBurst } from './Bits'

export type Evolution = { species: Species; from: number; to: number; path: Path; eq: Partial<Equip>; choose: boolean }
const BOX = 230

/** [시각 ms, 값] 목록 → 지연 + 이어진 timing(첫 값에서 시작) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function frames(sv: SharedValue<number>, fr: [number, number][], start = 0, easing: any = Easing.inOut(Easing.quad)) {
  sv.value = fr[0][1]
  const steps = fr.slice(1).map(([t, v], i) => withTiming(v, { duration: Math.max(1, t - fr[i][0]), easing }))
  const first = fr[0][0] + start
  sv.value = first > 0 ? withDelay(first, withSequence(...steps)) : withSequence(...steps)
}

export function EvolutionMoment({ evo, reduced, onPick, onDone }: { evo: Evolution | null; reduced: boolean; onPick?: (path: Path) => void; onDone: () => void }) {
  if (!evo) return null
  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onDone}><Moment key={`${evo.from}-${evo.to}`} evo={evo} reduced={reduced} onPick={onPick} onDone={onDone} /></Modal>
}

function Moment({ evo, reduced, onPick, onDone }: { evo: Evolution; reduced: boolean; onPick?: (path: Path) => void; onDone: () => void }) {
  const ins = useSafeAreaInsets()
  const { species: sp, from, to, eq } = evo
  const [path, setPath] = useState<Path>(evo.path)
  const [phase, setPhase] = useState<'play' | 'choose' | 'end'>('play')
  const [burst, setBurst] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // 층: A 옛 모습 · As 옛 실루엣 · orb 빛 방울 · Bs 새 실루엣 · B 새 모습 · T 부화 뚜껑 · r1·r2 고리 · card
  const aO = useSharedValue(1), aX = useSharedValue(1), aY = useSharedValue(1)
  const asO = useSharedValue(0), asX = useSharedValue(1), asY = useSharedValue(1)
  const oO = useSharedValue(0), oS = useSharedValue(0.2)
  const bsO = useSharedValue(0), bX = useSharedValue(from === 0 ? 1 : 0.12), bY = useSharedValue(from === 0 ? 1 : 0.12), bO = useSharedValue(from === 0 ? 1 : 0), bT = useSharedValue(0)
  const tO = useSharedValue(1), tR = useSharedValue(0), tX = useSharedValue(0), tY = useSharedValue(0), tS = useSharedValue(1)
  const r1O = useSharedValue(0), r1S = useSharedValue(0.2), r2O = useSharedValue(0), r2S = useSharedValue(0.2)
  const cO = useSharedValue(0), cY = useSharedValue(14)
  const all = [aO, aX, aY, asO, asX, asY, oO, oS, bsO, bX, bY, bO, bT, tO, tR, tX, tY, tS, r1O, r1S, r2O, r2S, cO, cY]

  const showCard = useCallback((at: number) => {
    frames(cO, [[0, 0], [320, 1]], at, Easing.out(Easing.back(1.4)))
    frames(cY, [[0, reduced ? 0 : 14], [320, 0]], at, Easing.out(Easing.back(1.4)))
  }, [cO, cY, reduced])
  const end = useCallback((ms: number) => { later(() => { setPhase('end'); later(onDone, 2600) }, ms) }, [onDone]) // eslint-disable-line react-hooks/exhaustive-deps

  const popped = useRef(false)
  const pop = useCallback(() => {
    popped.current = true
    if (reduced) { bsO.value = 0; bX.value = 1; bY.value = 1; frames(bO, [[0, 0], [300, 1]]); showCard(200); end(520); return }
    hx.tap()
    frames(bsO, [[0, 1], [280, 1], [400, 0.35], [500, 0]])
    frames(bX, [[0, 0.12], [150, 1.24], [280, 0.9], [400, 1.06], [500, 1]], 0, Easing.bezier(0.3, 0.7, 0.4, 1))
    frames(bY, [[0, 0.12], [150, 0.84], [280, 1.12], [400, 0.96], [500, 1]], 0, Easing.bezier(0.3, 0.7, 0.4, 1))
    frames(bO, [[0, 0], [259, 0], [260, 1]])
    frames(oO, [[0, 1], [90, 1], [260, 0]]); frames(oS, [[0, 0.48], [90, 0.9], [260, 1.8]])
    frames(r1O, [[0, 0], [40, 1], [520, 0]]); frames(r1S, [[0, 0.2], [40, 0.3], [520, 2.6]], 0, Easing.bezier(0.2, 0.8, 0.3, 1))
    frames(r2O, [[0, 0], [110, 1], [610, 0]]); frames(r2S, [[0, 0.2], [110, 0.3], [610, 3.2]], 0, Easing.bezier(0.2, 0.8, 0.3, 1))
    setBurst((b) => b + 1)
    showCard(480)
    end(1340)
  }, [reduced, bsO, bX, bY, bO, oO, oS, r1O, r1S, r2O, r2S, showCard, end])

  const ask = useCallback(() => { setPhase('choose') }, [])
  const pick = (p: Path) => { hx.tick(); setPath(p); onPick?.(p); setPhase('play'); pop() }

  useEffect(() => {
    if (from === 0) { // 씨앗 깨기(42 §4.3): 두 번 흔들림 → 뚜껑이 날아감(물방울은 터짐) → 아기가 톡
      if (reduced) { frames(tO, [[0, 1], [300, 0]]); showCard(200); end(520); return }
      frames(tR, [[0, 0], [180, -6], [360, 6], [540, -8], [720, 8], [900, 0]])
      if (sp === 'frog') { frames(tS, [[0, 1], [900, 1], [1200, 1.3]]); frames(tO, [[0, 1], [900, 1], [1200, 0]]) }
      else { frames(tX, [[0, 0], [900, 0], [1200, 40]]); frames(tY, [[0, 0], [900, 0], [1200, -120]]); frames(tO, [[0, 1], [900, 1], [1200, 0]]) }
      frames(bT, [[0, 0], [900, 0], [1050, -10], [1200, 0]])
      later(() => { hx.tap(); setBurst(1) }, 900)
      showCard(1000); end(1700)
      return
    }
    if (reduced) { frames(aO, [[0, 1], [300, 0]]); later(() => (evo.choose ? ask() : pop()), 300); return }
    frames(aX, [[0, 1], [140, 1.07], [260, 0.97], [380, 1]]); frames(aY, [[0, 1], [140, 0.9], [260, 1.04], [380, 1]])
    frames(aO, [[0, 1], [380, 1], [460, 0]])
    frames(asO, [[0, 0], [260, 0], [440, 1], [1080, 1], [1140, 0]])
    frames(asX, [[0, 1], [440, 1], [600, 1.12], [760, 0.92], [910, 1.2], [1080, 0.16]])
    frames(asY, [[0, 1], [440, 1], [600, 0.88], [760, 1.14], [910, 0.84], [1080, 0.16]])
    frames(oO, [[0, 0], [1000, 0], [1100, 1]]); frames(oS, [[0, 0.2], [1000, 0.2], [1100, 0.62], [1180, 0.48]])
    later(() => (evo.choose ? ask() : pop()), 1180)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** 누르면 끝 장면(고르는 중이면 고르기는 남는다) */
  const skip = () => {
    if (phase === 'choose') return
    if (phase === 'end') { timers.current.forEach(clearTimeout); onDone(); return }
    timers.current.forEach(clearTimeout); timers.current = []
    all.forEach((v) => cancelAnimation(v))
    if (evo.choose && !popped.current) { aO.value = 0; asO.value = 0; oO.value = 1; oS.value = 0.48; ask(); return }
    aO.value = 0; asO.value = 0; oO.value = 0; bsO.value = 0; tO.value = 0; r1O.value = 0; r2O.value = 0
    bX.value = 1; bY.value = 1; bO.value = 1; bT.value = 0; cO.value = 1; cY.value = 0
    setPhase('end'); later(onDone, 2600)
  }

  const A = useAnimatedStyle(() => ({ opacity: aO.value, transformOrigin: 'bottom', transform: [{ scaleX: aX.value }, { scaleY: aY.value }] }))
  const As = useAnimatedStyle(() => ({ opacity: asO.value, transform: [{ scaleX: asX.value }, { scaleY: asY.value }] }))
  const O = useAnimatedStyle(() => ({ opacity: oO.value, transform: [{ scale: oS.value }] }))
  const Bs = useAnimatedStyle(() => ({ opacity: bsO.value, transform: [{ scaleX: bX.value }, { scaleY: bY.value }] }))
  const B = useAnimatedStyle(() => ({ opacity: bO.value, transform: [{ translateY: bT.value }, { scaleX: bX.value }, { scaleY: bY.value }] }))
  const T = useAnimatedStyle(() => ({ opacity: tO.value, transform: [{ translateX: tX.value }, { translateY: tY.value }, { rotate: `${tR.value}deg` }, { scale: tS.value }] }))
  const R1 = useAnimatedStyle(() => ({ opacity: r1O.value, transform: [{ scale: r1S.value }] }))
  const R2 = useAnimatedStyle(() => ({ opacity: r2O.value, transform: [{ scale: r2S.value }] }))
  const Card = useAnimatedStyle(() => ({ opacity: cO.value, transform: [{ translateY: cY.value }] }))

  const lvFrom = STAGES[to - 1].from - 1
  const lvTo = STAGES[to - 1].from
  const gift = evolutionGift(to)
  const title = titleOf(sp, to, path)
  const P = PATHS[sp]
  return (
    <Pressable style={s.root} onPress={skip} accessibilityLabel="진화 장면. 누르면 건너뛰기" accessibilityViewIsModal>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs><RadialGradient id="evbg" cx="50%" cy="42%" r="75%"><Stop offset="0" stopColor="#2C6A43" /><Stop offset="0.55" stopColor="#12301E" /><Stop offset="1" stopColor="#08150D" /></RadialGradient>
          <RadialGradient id="evglow" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor="#8CF0AA" stopOpacity="0.42" /><Stop offset="0.65" stopColor="#8CF0AA" stopOpacity="0" /></RadialGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#evbg)" />
      </Svg>
      <View style={s.glow} pointerEvents="none"><Svg width={320} height={320}><Rect width={320} height={320} fill="url(#evglow)" /></Svg></View>
      <Pressable style={[s.skip, { top: ins.top + 10 }]} onPress={skip} hitSlop={8} accessibilityRole="button"><Text style={s.skipT}>{phase === 'end' ? '닫기' : '건너뛰기'}</Text></Pressable>

      <View style={s.box} pointerEvents="none">
        {from > 0 ? <Animated.View style={[s.layer, A]}><CharacterArt species={sp} stage={from} size={BOX} fit={false} mood="wow" wear={{ lv: lvFrom, path, eq }} /></Animated.View> : null}
        {from > 0 ? <Animated.View style={[s.layer, As]}><CharacterArt species={sp} stage={from} size={BOX} fit={false} silhouette wear={{ lv: lvFrom, path, eq }} /></Animated.View> : null}
        <Animated.View style={[s.orb, O]} />
        <Animated.View style={[s.ring, { borderColor: '#fff' }, R1]} />
        <Animated.View style={[s.ring, { borderColor: RING[sp], borderWidth: 3 }, R2]} />
        <Animated.View style={[s.layer, Bs]}><CharacterArt species={sp} stage={to} size={BOX} fit={false} silhouette wear={{ lv: lvTo, path, eq }} /></Animated.View>
        <Animated.View style={[s.layer, B]}><CharacterArt species={sp} stage={to} size={BOX} fit={false} mood={from === 0 ? 'wow' : 'happy'} wear={{ lv: lvTo, path, eq }} /></Animated.View>
        {from === 0 ? <Animated.View style={[s.layer, T]}><HatchTop species={sp} size={BOX} /></Animated.View> : null}
        {burst > 0 && !reduced ? <View key={burst} style={s.burst}><SpeciesBurst species={sp} count={from === 0 ? 12 : 16} dist={from === 0 ? 120 : 150} big /></View> : null}
      </View>

      <Animated.View style={[s.card, { bottom: ins.bottom + 60 }, Card]} pointerEvents="none">
        <Text style={s.k}>{to === 1 ? '태어났어요' : `${STAGES[to - 1].name}${to === 4 ? '으로' : '로'} 자랐어요`}</Text>
        <Text style={s.n}>{title}</Text>
        {from > 0 ? (
          <View style={s.ba}>
            <View style={s.bi}><CharacterArt species={sp} stage={from} size={52} mood="smile" noAura wear={{ lv: lvFrom, path, eq }} /><Text style={s.bie}>{titleOf(sp, from, path)}</Text></View>
            <Text style={s.arrow}>→</Text>
            <View style={[s.bi, s.biNow]}><CharacterArt species={sp} stage={to} size={52} mood="happy" noAura wear={{ lv: lvTo, path, eq }} /><Text style={s.bie}>{title}</Text></View>
          </View>
        ) : null}
        <View style={s.f}><Text style={s.fT}>+ {newPartOf(sp, to, path)}{gift ? ` · 선물 ${gift.name}` : ''}</Text></View>
      </Animated.View>

      {phase === 'choose' ? (
        <View style={s.choice}>
          <Text style={s.q}>어떤 친구로 자랄까?</Text>
          <View style={s.opts}>
            {(['a', 'b'] as Path[]).map((p) => (
              <Pressable key={p} style={({ pressed }) => [s.opt, pressed && { transform: [{ scale: 0.97 }], borderColor: '#8FF0B5' }]} onPress={() => pick(p)} accessibilityRole="button" accessibilityLabel={`${P[p].name}. ${P[p].line}`}>
                <CharacterArt species={sp} stage={3} size={116} mood="smile" wear={{ lv: 6, path: p, eq: {} }} />
                <Text style={s.optB}>{P[p].name}</Text>
                <Text style={s.optS}>{P[p].line}{'\n'}→ {P[p].t[2]}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => pick('a')} hitSlop={10} accessibilityRole="button"><Text style={s.later}>나중에 고를래</Text></Pressable>
        </View>
      ) : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12301E' },
  glow: { position: 'absolute', left: '50%', top: '40%', marginLeft: -160, marginTop: -160 },
  skip: { position: 'absolute', right: 18, height: 30, borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', zIndex: 5 },
  skipT: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: '600' },
  box: { position: 'absolute', left: '50%', top: '33%', width: 0, height: 0 },
  layer: { position: 'absolute', left: -BOX / 2, top: -115, width: BOX, height: BOX },
  orb: { position: 'absolute', left: -60, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', shadowColor: '#8CF0AA', shadowOpacity: 0.9, shadowRadius: 30 },
  ring: { position: 'absolute', left: -60, top: -40, width: 120, height: 120, borderRadius: 60, borderWidth: 4 },
  burst: { position: 'absolute', left: 0, top: 10, width: 0, height: 0 },
  card: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  k: { color: '#8FF0B5', fontSize: 13, fontWeight: '650' as never, marginBottom: 10 },
  n: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.9, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 16 },
  ba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 },
  bi: { alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  biNow: { backgroundColor: 'rgba(143,240,181,0.2)', borderWidth: 1.5, borderColor: '#8FF0B5' },
  bie: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '650' as never },
  arrow: { color: '#8FF0B5', fontSize: 18, fontWeight: '800' },
  f: { marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  fT: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  choice: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,16,10,0.82)', alignItems: 'center', justifyContent: 'center', gap: 18, zIndex: 10 },
  q: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  opts: { flexDirection: 'row', gap: 12, paddingHorizontal: 12 },
  opt: { flex: 1, maxWidth: 170, borderRadius: 24, padding: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  optB: { color: '#fff', fontSize: 16, fontWeight: '750' as never, marginTop: 6, marginBottom: 4 },
  optS: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  later: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }
})
