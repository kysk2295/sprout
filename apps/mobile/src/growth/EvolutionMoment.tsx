// 49 §7 · 42 §10.6 진화 순간(휴대폰 전체 화면, 약 2.5초, 시안 character-v3 E) · 43 §9 꼬마 → 친구 두 갈래 고르기 · 부화(씨앗 → 아기).
// 성장 홈과 같은 장면 위에서: 어두워짐 → 웅크림 → 흰 실루엣 꿀렁 세 번 → 빛 방울 → (고르기는 여기서 멈춤) → 고리 두 겹 + 새 실루엣 톡 →
// 색 그림 → 유리 이름 카드(전 → 후 작은 그림 둘). 실루엣 = CharacterArt silhouette(같은 층을 흰색 한 색으로, 필터 없음).
// 부화도 같은 순서: 씨앗 흔들 + 금 한 줄 → 두 줄(미리 올린 금 층의 opacity 교차) → 흰 씨앗 실루엣 꿀렁 → 빛 → 아기.
// 누르면 끝 장면, 움직임 줄이기 = 페이드 + 카드. Reanimated withSequence·withDelay·withTiming(층의 opacity·transform만, 39 §11).
import { newPartOf, PATHS, sceneDark, sceneLayout, standOnPerch, titleOf } from '@sprout/schema/characterArt'
import { STAGES, type Species } from '@sprout/schema/growth'
import { evolutionGift, type Equip, type Path } from '@sprout/schema/wardrobe'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from '../ui/haptics'
import { CharacterArt } from './art/CharacterArt'
import { SceneBackdrop } from './art/Scene3D'
import { SpeciesBurst } from './Bits'
import { fitScene, Glass, glassTone, myScene } from './home/glass'

export type Evolution = { species: Species; from: number; to: number; path: Path; eq: Partial<Equip>; choose: boolean; seed?: number; scene?: string }

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
  const p = usePalette()
  const win = useWindowDimensions()
  const { species: sp, from, to, eq } = evo
  const seed = evo.seed ?? 0
  const hatch = from === 0
  const [path, setPath] = useState<Path>(evo.path)
  const [phase, setPhase] = useState<'play' | 'choose' | 'end'>('play')
  const [burst, setBurst] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // ── 자리: 성장 홈과 같은 장면, 받침이 화면 56%에 ──
  const sceneKey = evo.scene ?? myScene(eq.bg, p.dark)
  const tone = glassTone(sceneDark(sceneKey)) // 유리 톤 = 장면 밝기(49 §6.1)
  const W = win.width, H = win.height
  const T = Math.round(H * 0.56)
  const fit = useMemo(() => fitScene(sceneKey, W, H, T), [sceneKey, W, H, T])
  const perchX = useMemo(() => sceneLayout(sceneKey, W, fit.height, 'bottom').perchX, [sceneKey, W, fit.height])
  const BOX = Math.round(Math.min(250, (T - ins.top - 70) / 0.8))
  const EGG = Math.round(BOX * 0.78)
  const at = standOnPerch(perchX, T, BOX)
  const eggAt = standOnPerch(perchX, T, EGG)
  const midY = T - BOX * 0.42

  // 층: A 옛 모습(부화 = 씨앗, 금 층 c1·c2) · As 옛 실루엣 · halo 빛 · r1·r2 고리 · Bs 새 실루엣 · B 새 모습 · dim · card
  const dim = useSharedValue(0)
  const aO = useSharedValue(1), aX = useSharedValue(1), aY = useSharedValue(1), aR = useSharedValue(0)
  const c1 = useSharedValue(0), c2 = useSharedValue(0)
  const asO = useSharedValue(0), asX = useSharedValue(1), asY = useSharedValue(1)
  const hO = useSharedValue(0), hS = useSharedValue(0.3)
  const bsO = useSharedValue(0), bX = useSharedValue(0.12), bY = useSharedValue(0.12)
  const bO = useSharedValue(0), bS = useSharedValue(0.9)
  const r1O = useSharedValue(0), r1S = useSharedValue(0.4), r2O = useSharedValue(0), r2S = useSharedValue(0.4)
  const cO = useSharedValue(0), cY = useSharedValue(26)
  const all = [dim, aO, aX, aY, aR, c1, c2, asO, asX, asY, hO, hS, bsO, bX, bY, bO, bS, r1O, r1S, r2O, r2S, cO, cY]

  const showCard = useCallback((delay: number) => {
    frames(cO, [[0, 0], [360, 1]], delay, Easing.out(Easing.quad))
    if (reduced) { cY.value = 0; return }
    frames(cY, [[0, 26], [360, -4], [520, 0]], delay, Easing.out(Easing.quad))
  }, [cO, cY, reduced])
  const end = useCallback((ms: number) => { later(() => { setPhase('end'); later(onDone, 2600) }, ms) }, [onDone]) // eslint-disable-line react-hooks/exhaustive-deps

  const popped = useRef(false)
  /** 고리 두 겹 + 새 실루엣 톡 → 색 그림 → 카드 → 밝아짐(시안 E, 1180ms부터의 상대 시각) */
  const pop = useCallback(() => {
    popped.current = true
    if (reduced) { bsO.value = 0; bS.value = 1; frames(bO, [[0, 0], [300, 1]]); frames(dim, [[0, dim.value], [300, 0]]); showCard(200); end(520); return }
    hx.tap()
    frames(r1O, [[0, 0.9], [700, 0]]); frames(r1S, [[0, 0.4], [700, 2.6]], 0, Easing.out(Easing.quad))
    frames(r2O, [[0, 0], [79, 0], [80, 0.9], [840, 0]]); frames(r2S, [[0, 0.4], [80, 0.4], [840, 3.2]], 0, Easing.out(Easing.quad))
    frames(bsO, [[0, 1], [512, 1], [640, 0]])
    frames(bX, [[0, 0.12], [256, 1.24], [416, 0.9], [512, 1]], 0, Easing.out(Easing.quad))
    frames(bY, [[0, 0.12], [256, 0.84], [416, 1.12], [512, 1]], 0, Easing.out(Easing.quad))
    frames(bO, [[0, 0], [260, 0], [520, 1]]); frames(bS, [[0, 0.9], [260, 0.9], [520, 1]])
    frames(hO, [[0, Math.max(hO.value, 0.5)], [900, 0.5], [1300, 0]])
    frames(dim, [[0, 0.55], [920, 0.55], [1320, 0]])
    setBurst((b) => b + 1)
    showCard(480)
    end(1340)
  }, [reduced, bsO, bX, bY, bO, bS, hO, dim, r1O, r1S, r2O, r2S, showCard, end])

  const ask = useCallback(() => setPhase('choose'), [])
  const pick = (v: Path) => { hx.tick(); setPath(v); onPick?.(v); setPhase('play'); pop() }

  useEffect(() => {
    if (reduced) { frames(aO, [[0, 1], [300, 0]]); later(() => (evo.choose ? ask() : pop()), 300); return }
    frames(dim, [[0, 0], [250, 0.55]])
    if (hatch) {
      // 씨앗: 흔들 + 금 한 줄 → 흔들 + 금 두 줄 → 흰 씨앗 실루엣 꿀렁
      frames(aR, [[0, 0], [100, -6], [200, 6], [300, 0], [450, 0], [550, -8], [650, 8], [760, 0]])
      frames(c1, [[0, 0], [190, 0], [200, 1]]); frames(c2, [[0, 0], [540, 0], [550, 1]])
      later(() => hx.tick(), 200); later(() => hx.tick(), 550)
      frames(aO, [[0, 1], [820, 1], [840, 0]])
      frames(asO, [[0, 0], [700, 0], [820, 1], [1300, 1], [1360, 0]])
      frames(asX, [[0, 1], [820, 1], [940, 1.12], [1060, 0.92], [1180, 0.16], [1360, 0.1]])
      frames(asY, [[0, 1], [820, 1], [940, 0.88], [1060, 1.14], [1180, 0.16], [1360, 0.1]])
    } else {
      // 웅크림 → 흰 실루엣 꿀렁 세 번 → 작아짐
      frames(aX, [[0, 1], [125, 1.07], [250, 1]]); frames(aY, [[0, 1], [125, 0.9], [250, 1]])
      frames(aO, [[0, 1], [440, 1], [460, 0]])
      frames(asO, [[0, 0], [260, 0], [440, 1], [1300, 1], [1360, 0]])
      frames(asX, [[0, 1], [440, 1], [624, 1.12], [808, 0.92], [992, 1.2], [1176, 0.16], [1360, 0.1]])
      frames(asY, [[0, 1], [440, 1], [624, 0.88], [808, 1.14], [992, 0.84], [1176, 0.16], [1360, 0.1]])
    }
    frames(hO, [[0, 0], [900, 0], [1350, 1]]); frames(hS, [[0, 0.3], [900, 0.3], [1350, 1], [1800, 1.05]])
    later(() => (evo.choose ? ask() : pop()), 1180)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** 누르면 끝 장면(고르는 중이면 고르기는 남는다) */
  const skip = () => {
    if (phase === 'choose') return
    if (phase === 'end') { timers.current.forEach(clearTimeout); onDone(); return }
    timers.current.forEach(clearTimeout); timers.current = []
    all.forEach((v) => cancelAnimation(v))
    if (evo.choose && !popped.current) { aO.value = 0; asO.value = 0; hO.value = 1; hS.value = 1; dim.value = 0.55; ask(); return }
    aO.value = 0; asO.value = 0; hO.value = 0; bsO.value = 0; r1O.value = 0; r2O.value = 0; dim.value = 0
    bO.value = 1; bS.value = 1; cO.value = 1; cY.value = 0
    setPhase('end'); later(onDone, 2600)
  }

  const Dim = useAnimatedStyle(() => ({ opacity: dim.value }))
  const A = useAnimatedStyle(() => ({ opacity: aO.value, transformOrigin: 'bottom', transform: [{ rotate: `${aR.value}deg` }, { scaleX: aX.value }, { scaleY: aY.value }] }))
  const C1 = useAnimatedStyle(() => ({ opacity: c1.value }))
  const C2 = useAnimatedStyle(() => ({ opacity: c2.value }))
  const As = useAnimatedStyle(() => ({ opacity: asO.value, transform: [{ scaleX: asX.value }, { scaleY: asY.value }] }))
  const Halo = useAnimatedStyle(() => ({ opacity: hO.value, transform: [{ scale: hS.value }] }))
  const Bs = useAnimatedStyle(() => ({ opacity: bsO.value, transformOrigin: 'bottom', transform: [{ scaleX: bX.value }, { scaleY: bY.value }] }))
  const B = useAnimatedStyle(() => ({ opacity: bO.value, transformOrigin: 'bottom', transform: [{ scale: bS.value }] }))
  const R1 = useAnimatedStyle(() => ({ opacity: r1O.value, transform: [{ scale: r1S.value }] }))
  const R2 = useAnimatedStyle(() => ({ opacity: r2O.value, transform: [{ scale: r2S.value }] }))
  const Card = useAnimatedStyle(() => ({ opacity: cO.value, transform: [{ translateY: cY.value }] }))

  const lvFrom = hatch ? 1 : STAGES[to - 1].from - 1
  const lvTo = STAGES[to - 1].from
  const gift = evolutionGift(to)
  const title = titleOf(sp, to, path)
  const P = PATHS[sp]
  const wearFrom = { lv: lvFrom, path, eq, seed }
  const wearTo = { lv: lvTo, path, eq, seed }
  const abs = (x: { left: number; top: number }, size: number) => ({ position: 'absolute' as const, left: x.left, top: x.top, width: size, height: size })
  return (
    <Pressable style={s.root} onPress={skip} accessible={phase !== 'choose'} accessibilityLabel={hatch ? '씨앗이 깨어나는 장면. 누르면 건너뛰기' : '진화 장면. 누르면 건너뛰기'} accessibilityViewIsModal>
      <SceneBackdrop sceneKey={sceneKey} width={W} height={fit.height} style={{ position: 'absolute', left: 0, top: fit.top }} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#050807' }, Dim]} pointerEvents="none" />

      <Animated.View style={[{ position: 'absolute', left: perchX - 180, top: midY - 180, width: 360, height: 360 }, Halo]} pointerEvents="none">
        <Svg width={360} height={360}>
          <Defs><RadialGradient id="evHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} /><Stop offset="0.5" stopColor="#FFFAE1" stopOpacity={0.55} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient></Defs>
          <Rect width={360} height={360} fill="url(#evHalo)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[s.ring, { left: perchX - 80, top: midY - 80 }, R1]} pointerEvents="none" />
      <Animated.View style={[s.ring, { left: perchX - 80, top: midY - 80 }, R2]} pointerEvents="none" />

      {hatch ? (
        <>
          <Animated.View style={[abs(eggAt, EGG), A]} pointerEvents="none">
            <CharacterArt species={null} size={EGG} seed={seed} />
            <Animated.View style={[StyleSheet.absoluteFill, C1]}><CharacterArt species={null} size={EGG} seed={seed} cracks={1} /></Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, C2]}><CharacterArt species={null} size={EGG} seed={seed} cracks={2} /></Animated.View>
          </Animated.View>
          <Animated.View style={[abs(eggAt, EGG), As]} pointerEvents="none"><CharacterArt species={null} size={EGG} seed={seed} cracks={2} silhouette /></Animated.View>
        </>
      ) : (
        <>
          <Animated.View style={[abs(at, BOX), A]} pointerEvents="none"><CharacterArt species={sp} stage={from} size={BOX} mood="wow" wear={wearFrom} /></Animated.View>
          <Animated.View style={[abs(at, BOX), As]} pointerEvents="none"><CharacterArt species={sp} stage={from} size={BOX} silhouette wear={wearFrom} /></Animated.View>
        </>
      )}
      <Animated.View style={[abs(at, BOX), Bs]} pointerEvents="none"><CharacterArt species={sp} stage={to} size={BOX} silhouette wear={wearTo} /></Animated.View>
      <Animated.View style={[abs(at, BOX), B]} pointerEvents="none"><CharacterArt species={sp} stage={to} size={BOX} mood={hatch ? 'wow' : 'happy'} wear={wearTo} /></Animated.View>
      {burst > 0 && !reduced ? <View key={burst} style={[s.burst, { left: perchX, top: midY }]} pointerEvents="none"><SpeciesBurst species={sp} count={hatch ? 12 : 16} dist={hatch ? 120 : 150} big /></View> : null}

      <Pressable style={[s.skip, { top: ins.top + 10, backgroundColor: tone.bg, borderColor: tone.line }]} onPress={skip} hitSlop={8} accessibilityRole="button">
        <Text style={[s.skipT, { color: tone.ink }]}>{phase === 'end' ? '닫기' : '건너뛰기'}</Text>
      </Pressable>

      <Animated.View style={[s.card, { bottom: ins.bottom + 40 }, Card]} pointerEvents="none">
        <Glass dark={sceneDark(sceneKey)} radius={26} style={s.cardIn}>
          <Text style={[s.k, { color: tone.ink }]}>{hatch ? '씨앗이 깨어났어요' : `${STAGES[to - 1].name}${to === 4 ? '으로' : '로'} 자랐어요`}</Text>
          <Text style={[s.n, { color: tone.ink }]} accessibilityRole="header">{title}</Text>
          <View style={s.pair}>
            <View style={[s.pb, { backgroundColor: tone.soft }]}>
              {hatch ? <CharacterArt species={null} size={62} seed={seed} /> : <CharacterArt species={sp} stage={from} size={64} wear={wearFrom} />}
            </View>
            <Text style={[s.arrow, { color: tone.ink }]}>→</Text>
            <View style={[s.pb, { backgroundColor: tone.soft, borderColor: p.accentHi, borderWidth: 2 }]}>
              <CharacterArt species={sp} stage={to} size={64} mood="happy" wear={wearTo} />
            </View>
          </View>
          <Text style={[s.f, { color: tone.ink }]}>+ {newPartOf(sp, to, path)}{gift ? ` · 선물 ${gift.name}` : ''}</Text>
        </Glass>
      </Animated.View>

      {phase === 'choose' ? (
        <View style={s.choice}>
          <Text style={s.q}>어떤 친구로 자랄까?</Text>
          <View style={s.opts}>
            {(['a', 'b'] as Path[]).map((v) => (
              <Pressable key={v} style={({ pressed }) => [s.opt, pressed && { transform: [{ scale: 0.97 }], borderColor: p.accentHi }]} onPress={() => pick(v)} accessibilityRole="button" accessibilityLabel={`${P[v].name}. ${P[v].line}`}>
                <CharacterArt species={sp} stage={3} size={116} mood="smile" wear={{ lv: 6, path: v, eq: {}, seed }} />
                <Text style={s.optB}>{P[v].name}</Text>
                <Text style={s.optS} lineBreakStrategyIOS="hangul-word">{P[v].line}</Text>
                <Text style={[s.optT, { color: p.accentHi }]} numberOfLines={1}>→ {P[v].t[2]}</Text>
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
  root: { flex: 1, backgroundColor: '#0E1A15', overflow: 'hidden' },
  ring: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  burst: { position: 'absolute', width: 0, height: 0 },
  skip: { position: 'absolute', right: 18, height: 30, borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, zIndex: 5 },
  skipT: { fontSize: 12.5, fontWeight: '600' },
  card: { position: 'absolute', left: 20, right: 20 },
  cardIn: { paddingHorizontal: 20, paddingVertical: 18, alignItems: 'center' },
  k: { fontSize: 13, fontWeight: '700', opacity: 0.7 },
  n: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -1, marginTop: 4, marginBottom: 10 },
  pair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  pb: { width: 70, height: 70, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  arrow: { fontSize: 12, fontWeight: '700' },
  f: { fontSize: 12.5, fontWeight: '600', opacity: 0.7, marginTop: 10, textAlign: 'center' },
  choice: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,16,10,0.82)', alignItems: 'center', justifyContent: 'center', gap: 18, zIndex: 10 },
  q: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  opts: { flexDirection: 'row', gap: 12, paddingHorizontal: 12 },
  opt: { flex: 1, maxWidth: 170, borderRadius: 24, padding: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  optB: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 6, marginBottom: 4 },
  optS: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  optT: { fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  later: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }
})
