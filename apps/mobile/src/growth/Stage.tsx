// 49 §6 휴대폰 성장 홈(시안 character-v3 B): 3D 정원 장면이 상태 막대 뒤까지 화면 끝까지 + 위 `꿈틀`·유리 알약 불꽃 `N일 연속`(43 §19)·⋯ +
// 유리 주 달력 띠(오늘 = 강조색 원, 한 날 = 옅은 원) + 받침(perch) 위 캐릭터(숨쉬기) + 아래 유리 카드(Lv 배지 · 큰 % · 꼬리 칩 · 14px 막대 · 옷장·도감·이번 주).
// v1.2(49 §6.0): 이 무대 전체가 고정 화면 한 장(스크롤 없음). `이번 주` 칸 = 이번 주 목표 진행(누르면 팝업), Lv 카드 윗줄·%를 누르면 진화 길 팝업.
// 만지기 v3(49 §7.1 — PlayableCharacter full): 누르기 = 깡충 + 유리 말풍선 한 줄 · 두 번/3번째 = 공중 한 바퀴 · 빠르게 4번 = 간지럼 · 길게 = 쓰다듬기 ·
// 끌었다 놓기(받침 반경 안에서 따라옴) · 가만히 두면 8~15초마다 딴짓 · 이름 = 부르기.
// 만지기는 아무것도 주지 않는다(XP·아이템 없음). 움직임은 감싸개의 transform·opacity만, UI 스레드(39 §11). 반복 움직임 캐릭터는 이 무대 하나.
// 트로피 선반은 장면에서 뺐다(49 §6) — 트로피는 도감 화면 목록에 있다.
// 말풍선(49 §7.2): 무대 감싸개 + 만지기 공유 값으로 머리 점을 구해 UI 스레드 스프링으로 따라간다(회전 없음, 화면 안에 가둠, 다시 그리기 없음).
import { FOOT, headTop3d, sceneDark, sceneLayout, standOnPerch, titleOf } from '@sprout/schema/characterArt'
import { XP, type Species } from '@sprout/schema/growth'
import { decorOn, ITEMS, TOUCH, TOUCH_LINES, type Equip } from '@sprout/schema/wardrobe'
import type { PlayKind } from '@sprout/schema/charPlay'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated'
import type { Streak } from '@sprout/schema/streak'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { hx } from '../ui/haptics'
import type { Palette } from '../theme/palette'
import { CharacterArt } from './art/CharacterArt'
import { PlayableCharacter, usePlayValues, type PlayHandle, type PlayValues } from './art/PlayableCharacter'
import { clampBubble, headShift, springStep } from './art/follow'
import { StreakPill, type StreakPillHandle } from './Flame'
import { SceneBackdrop } from './art/Scene3D'
import { FloatChip, SpeciesBurst } from './Bits'
import { DEX_TOTAL } from './home/dex'
import { AccThumb, fitScene, Glass, glassTone } from './home/glass'
import type { Raise } from './raise'

export type StageHandle = {
  hop: (times?: number, h?: number) => void
  say: (text: string, ms?: number) => void
  feel: (mood: StageMood, ms?: number) => void
  xp: (n: number) => void
  levelUp: (level: number) => void
  burst: (n: number, dist: number) => void
  wave: (line?: string) => void
  /** 잠깐 손에 든 것(마감 날 깃발) */
  holdFor: (hand: string, ms: number) => void
  /** 만지기 반응 하나(데모·확인용) — 49 §7.1 */
  play: (kind: 'hop' | 'spin' | 'giggle' | 'wobble' | 'pet' | 'dizzy') => void
  /** 연속 이정표 축하(43 §19.3): 알약 톡 + 반짝이 + 깡충 + 한 줄 */
  cheer: (line: string) => void
}
type StageMood = 'default' | 'smile' | 'happy' | 'pet' | 'giggle' | 'wow' | 'sleepy' | 'eat'
/** 주 달력 띠 한 칸 */
export type WeekCell = { day: string; label: string; num: number; did: boolean; today: boolean }

/** 옷장 칸 썸네일: 입은 옷 → 받은 옷 → 첫 옷 */
const wardIconOf = (worn: Partial<Equip>, owned: Set<string>) =>
  worn.hat ?? worn.neck ?? worn.hand ?? worn.back ?? ITEMS.find((i) => i.slot !== 'bg' && owned.has(i.id))?.id ?? 'acorn-cap'

export const RaiseStage = forwardRef<StageHandle, {
  p: Palette; raise: Raise; name: string; width: number; height: number; topInset: number
  /** 화면 바닥 ~ 탭 막대 윗변(유리 카드는 그 위 12) */
  bottomClear: number
  sceneKey: string; reduced: boolean; live: boolean
  night: boolean; calm: boolean; lines: () => string; onEgg?: () => void
  week: WeekCell[]; dexN: number; freshDot?: boolean
  /** 머리 알약 = 연속 불꽃(43 §19) */
  streak: Streak
  /** 이번 주 목표 진행(49 §6.0 고정 카드 `이번 주` 칸) */
  goals?: { done: number; total: number; /** 진행 합 평균 0~1(10 §4.6) */ ratio?: number }
  onWard?: () => void; onDex?: () => void; onWeek?: () => void
  /** Lv 카드(%·막대)를 누르면 — 진화 길 팝업(49 §6.0) */
  onRoad?: () => void
  /** 머리 오른쪽(⋯ 메뉴) */
  menu?: ReactNode
}>(function RaiseStage({ p, raise, name, width, height, topInset, bottomClear, sceneKey, reduced, live, night, calm, lines, onEgg, week, dexN, freshDot, streak, goals, onWard, onDex, onWeek, onRoad, menu }, ref) {
  const { species, progress, look, worn, owned } = raise
  const lv = progress.level
  const st = progress.stage
  const seed = look.seed ?? 0
  const sd = sceneDark(sceneKey) // 유리·글자 톤 = 장면 밝기(49 §6.1). 다크 테마는 밤 짝 장면이라 저절로 어둡다
  const t = glassTone(sd)

  // ── 자리: 유리 카드 위에 받침이 오게 장면을 깐다 ──
  const hudBottom = bottomClear + 12
  const [hudH, setHudH] = useState(236)
  const T = Math.round(height - hudBottom - hudH - 6)
  const fit = useMemo(() => fitScene(sceneKey, width, height, T), [sceneKey, width, height, T])
  const L = useMemo(() => sceneLayout(sceneKey, width, fit.height, 'bottom'), [sceneKey, width, fit.height])
  const perchX = L.perchX, perchY = fit.top + L.perchY
  const weekBottom = topInset + 50 + 66
  const headFrac = species ? headTop3d(species, st, look.path, seed).y - (worn.hat ? 0.07 : 0) : 0.22
  const box = Math.round(Math.max(120, Math.min(250, (perchY - weekBottom - 10) / (FOOT.y - headFrac))))
  const size = species ? box : Math.round(Math.min(box, 190))
  const pos = standOnPerch(perchX, perchY, size)
  const headY = pos.top + size * headFrac

  // ── 얼굴 · 말 · 하트 · 칩 ──
  const [mood, setMood] = useState<{ m: StageMood; id: number } | null>(null)
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null)
  const [chips, setChips] = useState<{ id: number; text: string; kind: 'xp' | 'lv' | 'z'; dx: number }[]>([])
  const [bursts, setBursts] = useState<{ id: number; n: number; dist: number }[]>([])
  const [hold, setHold] = useState<string | null>(null)
  const [woke, setWoke] = useState(false)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = useCallback((fn: () => void, ms: number) => { const tm = setTimeout(() => { timers.current.delete(tm); fn() }, ms); timers.current.add(tm) }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const feel = useCallback((m: StageMood, ms?: number) => { const id = Math.random(); setMood({ m, id }); if (ms) later(() => setMood((x) => (x?.id === id ? null : x)), ms) }, [later])
  const say = useCallback((text: string, ms: number = TOUCH.sayMs) => { const id = Math.random(); setBubble({ text, id }); later(() => setBubble((b) => (b?.id === id ? null : b)), ms) }, [later])
  const chip = useCallback((text: string, kind: 'xp' | 'lv' | 'z', dx = 0) => { const id = Math.random(); setChips((c) => [...c, { id, text, kind, dx }]); later(() => setChips((c) => c.filter((x) => x.id !== id)), kind === 'xp' ? 1000 : 1600) }, [later])
  const burst = useCallback((n: number, dist: number) => { if (reduced) return; const id = Math.random(); setBursts((b) => [...b, { id, n, dist }]); later(() => setBursts((b) => b.filter((x) => x.id !== id)), 1200) }, [reduced, later])

  // ── 감싸개 움직임(UI 스레드) ──
  const rot = useSharedValue(0), hopY = useSharedValue(0)
  const sx = useSharedValue(1), sy = useSharedValue(1), breath = useSharedValue(0)
  const sleepy = !!species && night && !woke
  useEffect(() => {
    if (reduced || !live) { cancelAnimation(breath); breath.value = 0; return }
    breath.value = 0
    breath.value = withRepeat(withTiming(1, { duration: sleepy || calm ? 2500 : st === 1 ? 1200 : 1600, easing: Easing.inOut(Easing.sin) }), -1, true)
    return () => cancelAnimation(breath)
  }, [reduced, live, sleepy, calm, st, breath])
  // 4·5단계 제자리 깡충(42 §4.1)은 49 §7.1 딴짓(8~15초 · 작은 깡충 포함)이 맡는다 — 반복 움직임 하나
  const wrap = useAnimatedStyle(() => ({
    transformOrigin: 'bottom',
    transform: [
      { translateY: hopY.value },
      { rotate: `${rot.value}deg` },
      { scaleX: sx.value * (1 + breath.value * 0.018) }, { scaleY: sy.value * (1 - breath.value * 0.028) }
    ]
  }))
  const wrapV = useMemo(() => ({ hopY, rot, sx, sy, breath }), [hopY, rot, sx, sy, breath])
  const hop = useCallback((times = 1, h = 14) => {
    if (reduced) return
    const one = [withTiming(3, { duration: 70 }), withTiming(-h, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) })]
    hopY.value = withSequence(...(times > 1 ? [...one, ...one] : one))
    const sq = [withTiming(1.06, { duration: 70 }), withTiming(0.96, { duration: 150 }), withTiming(1.05, { duration: 120 }), withTiming(1, { duration: 100 })]
    sx.value = withSequence(...sq)
    sy.value = withSequence(withTiming(0.93, { duration: 70 }), withTiming(1.05, { duration: 150 }), withTiming(0.95, { duration: 120 }), withTiming(1, { duration: 100 }))
  }, [reduced, hopY, sx, sy])

  const wave = useCallback((line: string = TOUCH_LINES.call) => {
    feel('smile')
    if (!reduced) rot.value = withSequence(withTiming(-5, { duration: 300 }), withDelay(800, withTiming(0, { duration: 300 })))
    say(line)
    later(() => setMood(null), TOUCH.callMs)
  }, [reduced, rot, say, feel, later])

  useImperativeHandle(ref, () => ({
    hop, say, feel, burst, wave,
    xp: (n) => { chip(`+${n}`, 'xp'); feel('happy', 2200); hop() },
    levelUp: (level) => {
      if (!reduced) {
        sx.value = withSequence(withTiming(0.94, { duration: 120 }), withTiming(1.12, { duration: 190 }), withTiming(0.98, { duration: 190 }), withTiming(1, { duration: 120 }))
        sy.value = withSequence(withTiming(1.05, { duration: 120 }), withTiming(1.12, { duration: 190 }), withTiming(1.02, { duration: 190 }), withTiming(1, { duration: 120 }))
        hopY.value = withSequence(withTiming(0, { duration: 120 }), withTiming(-12, { duration: 190 }), withTiming(0, { duration: 310 }))
      }
      burst(10, 90); chip(`Lv ${level}`, 'lv')
    },
    holdFor: (hand, ms) => { setHold(hand); later(() => setHold(null), ms) },
    play: (kind) => pc.current?.play(kind),
    cheer: (line) => { pill.current?.cheer(); feel('happy', 2200); hop(); say(line, 3200) }
  }), [hop, say, feel, burst, wave, chip, reduced, sx, sy, hopY, later])
  const pill = useRef<StreakPillHandle>(null)
  const pv = usePlayValues()

  // ── 만지기(49 §7.1 — 움직임·조각·진동은 PlayableCharacter, 말·얼굴은 여기) ──
  const pc = useRef<PlayHandle>(null)
  const onTap = useCallback((kind: PlayKind) => {
    if (!species) { onEgg?.(); return }
    if (sleepy) { setWoke(true); feel('default', TOUCH.wakeMs); say(TOUCH_LINES.wake); later(() => setWoke(false), TOUCH.wakeMs); return }
    if (kind === 'giggle') { feel('giggle', 1800); return } // 한 줄은 onSay
    feel('happy', 1500)
    say(lines())
  }, [species, sleepy, feel, say, lines, later, onEgg])
  const onSay = useCallback((text: string) => { say(text); if (text === TOUCH_LINES.pet) feel('happy', 1500) }, [say, feel])
  const petStart = useCallback(() => feel('pet'), [feel])
  const dragStart = useCallback(() => { feel('wow') }, [feel])
  const drop = useCallback((far: boolean) => { feel('happy', 1600); later(() => say(far ? TOUCH_LINES.dropFar : TOUCH_LINES.drop), reduced ? 0 : 500) }, [feel, say, later, reduced])

  // 늦은 밤 Z 3개(움직임 줄이기면 없음)
  useEffect(() => {
    if (!sleepy || reduced || !live) return
    let i = 0
    const tm = setInterval(() => { chip('Z', 'z', 10 + (i % 3) * 6); i++ }, 1700)
    return () => clearInterval(tm)
  }, [sleepy, reduced, live, chip])

  const decor = useMemo(() => (species ? decorOn(lv, look) : []), [species, lv, look])
  const faceMood = mood?.m ?? (sleepy ? 'sleepy' : 'default')
  const eq: Partial<Equip> = hold ? { ...worn, hand: hold } : worn

  // ── 카드 ──
  const pct = Math.floor(Math.min(100, (progress.into / Math.max(1, progress.toNext)) * 100))
  const left = Math.max(1, Math.ceil((progress.toNext - progress.into) / XP.task))
  const title = species ? titleOf(species, st, look.path) : '아직 모르는 씨앗'
  const tailBg = sd ? '#EEF3F0' : '#13211B', tailInk = sd ? '#13211B' : '#FFFFFF'
  const wardIcon = wardIconOf(worn, owned)
  const doneDays = week.filter((c) => c.did).length

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <SceneBackdrop sceneKey={sceneKey} width={width} height={fit.height} fade={300} decor={decor} style={{ position: 'absolute', left: 0, top: fit.top }} />

      {/* 위: 꿈틀 · 한 날 · ⋯ */}
      <View style={[s.head, { top: topInset + 6 }]} pointerEvents="box-none">
        <Text style={[s.logo, { color: t.ink }]} accessibilityRole="header" accessibilityLabel="성장">꿈틀</Text>
        <View style={{ flex: 1 }} />
        <StreakPill ref={pill} streak={streak} dark={sd} ink={t.ink} reduced={reduced} />
        {menu}
      </View>

      {/* 주 달력 띠(43 누적: 한 날 = 옅은 원) */}
      <Glass dark={sd} radius={22} style={[s.week, { top: topInset + 50 }]}>
        <View style={s.weekRow} accessible accessibilityLabel={`이번 주 한 날 ${doneDays}일`}>
          {week.map((c) => (
            <View key={c.day} style={s.wcol}>
              <Text style={[s.wd, { color: t.ink }]}>{c.label}</Text>
              <View style={[s.wn, c.today ? { backgroundColor: p.accent } : c.did ? { backgroundColor: t.did } : null]}>
                <Text style={[s.wnT, { color: c.today ? '#fff' : t.ink }]}>{c.num}</Text>
              </View>
            </View>
          ))}
        </View>
      </Glass>

      {/* 받침 위 캐릭터 */}
      <Animated.View style={[{ position: 'absolute', left: pos.left, top: pos.top, width: size, height: size }, wrap]} pointerEvents="box-none">
        <PlayableCharacter ref={pc} species={species} stage={st} size={size} mood={species ? faceMood : undefined} seed={seed}
          wear={species ? { lv, path: look.path, eq, seed } : undefined} level="full" reduced={reduced} active={live} idle={!sleepy} values={pv}
          onTap={onTap} onSay={onSay} onPetStart={petStart} onDragStart={dragStart} onDrop={drop}
          accessibilityLabel={species ? `${name}, Lv ${lv} ${title}. 눌러서 말 걸기` : '아직 모르는 씨앗. 눌러서 깨우기'} />
      </Animated.View>
      <FollowBubble bubble={bubble} bg={t.bubble} line={t.line} ink={t.ink} reduced={reduced} pv={pv} wrapV={wrapV}
        size={size} headLocal={size * headFrac} foot={FOOT.y} cx={perchX} headY={headY} screenW={width} minTop={topInset + 4} />
      <View style={[s.fx, { left: perchX, top: headY + 6 }]} pointerEvents="none">
        {chips.map((c) => <FloatChip key={c.id} text={c.text} kind={c.kind} dx={c.kind === 'xp' ? 34 : c.dx} reduced={reduced} />)}
      </View>
      {species ? <View style={[s.fx, { left: perchX, top: pos.top + size * 0.55 }]} pointerEvents="none">{bursts.map((b) => <SpeciesBurst key={b.id} species={species as Species} count={b.n} dist={b.dist} />)}</View> : null}

      {/* 아래 유리 카드 */}
      <View style={[s.hud, { bottom: hudBottom }]} onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (Math.abs(h - hudH) > 1) setHudH(h) }}>
        <Glass dark={sd} radius={26} style={s.hudIn}>
          <View style={s.lvRow}>
            <View style={[s.lvb, { backgroundColor: p.accent }]}><Text style={s.lvbT}>Lv {lv}</Text></View>
            <Pressable onPress={() => species && wave()} hitSlop={8} disabled={!species} accessibilityRole="button" accessibilityLabel={species ? `${name} 부르기` : title} style={{ flexShrink: 1 }}>
              <Text style={[s.who, { color: t.ink }]} numberOfLines={1}>{species ? `${name} · ${title}` : title}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => { if (species && onRoad) { hx.tick(); onRoad() } }} disabled={!species || !onRoad} accessibilityRole="button" accessibilityLabel={`다음 레벨까지 ${pct}퍼센트. 진화 길 보기`} accessibilityHint="다음 모습과 열리는 레벨을 봐요">
          <View style={s.row2}>
            <Text style={[s.big, { color: t.ink }]}>{pct}<Text style={s.bigPct}>%</Text></Text>
            <View style={[s.tail, { backgroundColor: tailBg }]}>
              <Text style={[s.tailT, { color: tailInk }]} numberOfLines={1}>할 일 {left}개 더 하면 Lv {lv + 1}</Text>
              <View style={[s.tailTip, { backgroundColor: tailBg }]} />
            </View>
          </View>
          <Text style={[s.lbl, { color: t.ink }]}>다음 레벨까지</Text>
          <XpBar pct={pct} live={live} reduced={reduced} track={t.track} from={p.accentHi} to={p.accent} into={progress.into} toNext={progress.toNext} />
          </Pressable>
          {species ? (
            <View style={s.quick}>
              <Quick label="옷장" bg={t.soft} ink={t.ink} dot={freshDot ? p.accent : undefined} onPress={onWard}><AccThumb id={wardIcon} size={34} /></Quick>
              <Quick label={`도감 ${dexN}/${DEX_TOTAL}`} bg={t.soft} ink={t.ink} onPress={onDex}><CharacterArt species={species} stage={st} size={34} crop="bust" /></Quick>
              <Quick label={goals?.total ? `이번 주 ${goals.done}/${goals.total}` : '이번 주'} a11y={goals?.total ? undefined : '이번 주 목표 만들기'} bg={t.soft} ink={t.ink} onPress={onWeek}>
                <GoalMini ratio={goals?.ratio ?? (goals?.total ? goals.done / goals.total : 0)} total={goals?.total ?? 0} track={t.track} fill={p.accent} ink={t.ink} />
              </Quick>
            </View>
          ) : (
            <Pressable onPress={onEgg} style={({ pressed }) => [s.eggBtn, { backgroundColor: p.accent }, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button">
              <Text style={s.eggBtnT}>씨앗 깨우기</Text>
            </Pressable>
          )}
        </Glass>
      </View>
    </View>
  )
})

type WrapValues = { hopY: SharedValue<number>; rot: SharedValue<number>; sx: SharedValue<number>; sy: SharedValue<number>; breath: SharedValue<number> }

/**
 * 49 §7.2 말풍선: 꼬리 끝 = 지금 머리 꼭대기. 무대 감싸개(wrapV)와 만지기(pv) 공유 값으로 머리가 옮겨 간 양을 구해
 * useFrameCallback 스프링으로 살짝 늦게 쫓는다(말풍선이 떠 있을 때만 켬). 좌우 12 안 · 위 minTop 아래로 가두고, 가둔 만큼 꼬리가 머리 쪽으로.
 * 쓰는 것은 감싸개·꼬리 translate뿐(39 §11). 크기는 뜰 때 onLayout 한 번.
 */
const FollowBubble = memo(function FollowBubble({ bubble, bg, line, ink, reduced, pv, wrapV, size, headLocal, foot, cx, headY, screenW, minTop }: {
  bubble: { text: string; id: number } | null; bg: string; line: string; ink: string; reduced: boolean
  pv: PlayValues; wrapV: WrapValues; size: number; headLocal: number; foot: number; cx: number; headY: number; screenW: number; minTop: number
}) {
  const bx = useSharedValue(0), by = useSharedValue(0), vx = useSharedValue(0), vy = useSharedValue(0)
  const bw = useSharedValue(0), bh = useSharedValue(0), snap = useSharedValue(1)
  const still = useSharedValue(reduced ? 1 : 0)
  useEffect(() => { still.value = reduced ? 1 : 0 }, [reduced, still])
  const frame = useFrameCallback((fi) => {
    const { y, sx, sy, rot, dx, dy, drot } = pv
    const b = wrapV.breath.value
    const d = headShift(size, headLocal, foot,
      { tx: 0, ty: y.value * size, rot: rot.value, sx: sx.value, sy: sy.value },
      { tx: dx.value, ty: dy.value, rot: drot.value, sx: 1, sy: 1 },
      { tx: 0, ty: wrapV.hopY.value, rot: wrapV.rot.value, sx: wrapV.sx.value * (1 + b * 0.018), sy: wrapV.sy.value * (1 - b * 0.028) })
    if (snap.value || still.value) { bx.value = d.x; by.value = d.y; vx.value = 0; vy.value = 0; snap.value = 0; return }
    const dt = (fi.timeSincePreviousFrame ?? 16) / 1000
    const nx = springStep(bx.value, vx.value, d.x, dt), ny = springStep(by.value, vy.value, d.y, dt)
    bx.value = nx.pos; vx.value = nx.vel; by.value = ny.pos; vy.value = ny.vel
  }, false)
  const on = !!bubble
  useEffect(() => {
    if (on) { snap.value = 1; frame.setActive(true) } else frame.setActive(false)
    return () => frame.setActive(false)
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  const box = useAnimatedStyle(() => {
    const c = clampBubble(cx, headY - 8 - bh.value, bx.value, by.value, bw.value, bh.value, screenW, minTop)
    return { transform: [{ translateX: c.x }, { translateY: c.y }] }
  })
  const tail = useAnimatedStyle(() => {
    const c = clampBubble(cx, headY - 8 - bh.value, bx.value, by.value, bw.value, bh.value, screenW, minTop)
    return { transform: [{ translateX: c.tail }, { rotate: '45deg' }] }
  })
  if (!bubble) return null
  return (
    <Animated.View style={[s.sayBox, { left: cx - 150, top: headY }, box]} pointerEvents="none">
      <Animated.View key={bubble.id} entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={[s.say, { backgroundColor: bg, borderColor: line }]}
        onLayout={(e) => { bw.value = e.nativeEvent.layout.width; bh.value = e.nativeEvent.layout.height }}>
        <Text style={[s.sayT, { color: ink }]} numberOfLines={2} accessibilityLiveRegion="polite">{bubble.text}</Text>
        <Animated.View style={[s.sayTail, { backgroundColor: bg }, tail]} />
      </Animated.View>
    </Animated.View>
  )
})

/** 14px 막대(강조색 그라데이션, 둥근 끝). 돌아오면(live) 0.8초 동안 찬다 — transform만(39 §11) */
const XpBar = memo(function XpBar({ pct, live, reduced, track, from, to, into, toNext }: { pct: number; live: boolean; reduced: boolean; track: string; from: string; to: string; into: number; toNext: number }) {
  const [w, setW] = useState(0)
  const v = useSharedValue(pct)
  const shown = useRef(false)
  useEffect(() => {
    if (!live) return
    if (!shown.current || reduced) { shown.current = true; cancelAnimation(v); v.value = pct; return }
    v.value = withDelay(250, withTiming(pct, { duration: 800, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }))
  }, [pct, live, reduced, v])
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -w * (1 - Math.max(0, Math.min(100, v.value)) / 100) }] }))
  return (
    <View style={[s.bar, { backgroundColor: track }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: toNext, now: into }}>
      {w ? (
        <Animated.View style={[s.fill, { width: w }, st]}>
          <Svg width={w} height={14}>
            <Defs><LinearGradient id="xpFill" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={from} /><Stop offset="1" stopColor={to} /></LinearGradient></Defs>
            <Rect x={0} y={0} width={w} height={14} rx={7} fill="url(#xpFill)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
})

/** 이번 주 칸 그림: 목표 진행 막대(진행 합 평균 — 10 §4.6). 목표가 없으면 `+ 목표 만들기`(누르면 팝업 + 입력 커서) — 34 높이에 맞춘다 */
function GoalMini({ ratio, total, track, fill, ink }: { ratio: number; total: number; track: string; fill: string; ink: string }) {
  if (!total) {
    return (
      <View style={{ height: 34, justifyContent: 'center', alignItems: 'center', width: '92%' }} accessibilityElementsHidden>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 9, borderWidth: 1.2, borderStyle: 'dashed', borderColor: fill, paddingHorizontal: 6, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: fill }}>+</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: fill }} numberOfLines={1}>목표 만들기</Text>
        </View>
      </View>
    )
  }
  return (
    <View style={{ height: 34, justifyContent: 'center', alignItems: 'center', width: '82%' }} accessibilityElementsHidden>
      <Text style={{ fontSize: 11, fontWeight: '700', color: ink, opacity: 0.62, marginBottom: 4 }}>목표</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: track, width: '100%', overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: fill, width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }} />
      </View>
    </View>
  )
}

function Quick({ label, a11y, bg, ink, dot, onPress, children }: { label: string; a11y?: string; bg: string; ink: string; dot?: string; onPress?: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={() => { hx.tick(); onPress?.() }} style={({ pressed }) => [s.qb, { backgroundColor: bg }, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityRole="button" accessibilityLabel={a11y ?? label}>
      {children}
      <Text style={[s.qbT, { color: ink }]} numberOfLines={1}>{label}</Text>
      {dot ? <View style={[s.qbDot, { backgroundColor: dot }]} /> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  head: { position: 'absolute', left: 18, right: 18, height: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { fontSize: 21, fontWeight: '800', letterSpacing: -0.85 },
  week: { position: 'absolute', left: 14, right: 14 },
  weekRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 6 },
  wcol: { flex: 1, alignItems: 'center' },
  wd: { fontSize: 11, fontWeight: '600', opacity: 0.6, marginBottom: 6 },
  wn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  wnT: { fontSize: 14.5, fontWeight: '700' },
  fx: { position: 'absolute', width: 0, height: 0, alignItems: 'center' },
  sayBox: { position: 'absolute', width: 300, height: 0, alignItems: 'center' },
  say: { position: 'absolute', bottom: 8, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10, maxWidth: 230, shadowColor: '#0F2316', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  sayT: { fontSize: 14, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  sayTail: { position: 'absolute', bottom: -6, left: '50%', marginLeft: -7, width: 14, height: 14, borderRadius: 3 },
  hud: { position: 'absolute', left: 14, right: 14 },
  hudIn: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  lvRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lvb: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  lvbT: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  who: { fontSize: 13, fontWeight: '700', opacity: 0.82 },
  row2: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  big: { fontSize: 54, lineHeight: 58, fontWeight: '800', letterSpacing: -2.7, marginTop: 6, includeFontPadding: false },
  bigPct: { fontSize: 28, letterSpacing: -0.5 },
  tail: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, marginBottom: 12, flexShrink: 1 },
  tailT: { fontSize: 12.5, fontWeight: '700' },
  tailTip: { position: 'absolute', left: 22, bottom: -5, width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  lbl: { fontSize: 12.5, fontWeight: '600', opacity: 0.6, marginTop: 2 },
  bar: { height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 12 },
  fill: { height: 14 },
  quick: { flexDirection: 'row', gap: 8, marginTop: 14 },
  qb: { flex: 1, borderRadius: 16, paddingTop: 4, paddingBottom: 7, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  qbT: { fontSize: 12.5, fontWeight: '700' },
  qbDot: { position: 'absolute', top: 7, right: 10, width: 7, height: 7, borderRadius: 4 },
  eggBtn: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  eggBtnT: { color: '#fff', fontSize: 16, fontWeight: '700' }
})
