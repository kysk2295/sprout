// 49 §7 옷장 · 도감(휴대폰, 시안 character-v3 C · D). 데이터·규칙은 공용 wardrobe(43 §5.4 · §8) — 화면은 그리기만.
// 옷장: 위 절반 = 성장 홈과 같은 장면 + 받침 위 캐릭터 220(옷이 보이게), 아래 = 반투명 시트(모서리 30): `옷장 · 도감` 분절 + 탭 `모자 · 목 · 손 · 등 · 방` + 4열 칸.
//   칸 상태(43 §5.4): 입음 = 강조 테 · 새로 받음 = 점 · 잠김 = 회색 덩어리(같은 그림 한 색) + 조건. 칸 그림 = 옷 층을 옷 자리로 자른 3D(accIcon).
//   누르면 옷 층이 0.25초 페이드로 겹치고 깡충 — 새 모습을 아래에 깔고 옛 모습을 위에서 opacity 1 → 0(몸은 늘 불투명, 39 §11).
// 도감: 장면을 위 46%만 흐리게 깔고 바탕색에 녹임 + 큰 제목 `도감` + `모은 모습 N / 20` + 3열 칸(160 그림), 내 지금 모습 = `나`, 못 본 모습 = 어두운 한 색.
import { PATHS, sceneDark, sceneLayout, standOnPerch, titleOf, trophyIcon, FOOT, headTop3d } from '@sprout/schema/characterArt'
import { type Species } from '@sprout/schema/growth'
import {
  babyHidesSlot, baseName, conditionText, DECOR, ITEMS, itemsOfTab, SLOTS, trophyShape, trophySub, decorOn, type Item, type Path, type WardTab
} from '@sprout/schema/wardrobe'
import { BlurView } from 'expo-blur'
import { ChevronLeft } from 'lucide-react-native'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import type { Palette } from '../theme/palette'
import { hx } from '../ui/haptics'
import { Segmented } from '../ui/Segmented'
import { CharacterArt, SvgString, type CharacterWear } from './art/CharacterArt'
import { SceneBackdrop } from './art/Scene3D'
import { DEX_TOTAL, dexCells, dexCount, dexSeen } from './home/dex'
import { AccThumb, DecorThumb, DexFigure, fitScene, glassTone, SceneThumb } from './home/glass'
import type { Raise } from './raise'

export type DecorSeg = 'ward' | 'dex'
type Frame = { p: Palette; raise: Raise; width: number; height: number; topInset: number; bottomInset: number; sceneKey: string; seg: DecorSeg; onSeg: (s: DecorSeg) => void; onBack: () => void }

/* ───────── 머리(‹ 뒤로 · 제목) ───────── */
function GlassBack({ p, onBack, ink }: { p: Palette; onBack: () => void; ink: string }) {
  const t = glassTone(p.dark)
  return (
    <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="뒤로"
      style={({ pressed }) => [s.back, { backgroundColor: t.bg, borderColor: t.line }, pressed && { transform: [{ scale: 0.94 }] }]}>
      <ChevronLeft size={22} color={ink} />
    </Pressable>
  )
}

/* ───────── 옷 층 겹치기(0.25초 페이드) ───────── */
const wearKey = (w: CharacterWear) => JSON.stringify([w.path, w.seed, w.eq?.hat, w.eq?.neck, w.eq?.hand, w.eq?.back])
/** 새 모습은 아래(불투명), 옛 모습은 위에서 사라진다 — 옷이 생기든 없어지든 몸은 그대로 */
export const FadeWear = memo(function FadeWear({ species, stage, size, wear, mood, hopKey, reduced }: { species: Species; stage: number; size: number; wear: CharacterWear; mood?: string; hopKey: number; reduced?: boolean }) {
  const key = wearKey(wear)
  const [prev, setPrev] = useState<CharacterWear | null>(null)
  const last = useRef<{ key: string; wear: CharacterWear }>({ key, wear })
  const o = useSharedValue(0)
  const hop = useSharedValue(0)
  useEffect(() => {
    if (last.current.key === key) return
    const old = last.current.wear
    last.current = { key, wear }
    if (reduced) { setPrev(null); return }
    setPrev(old)
    o.value = 1
    o.value = withTiming(0, { duration: 250 }, (done) => { if (done) runOnJS(setPrev)(null) })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (hopKey && !reduced) hop.value = withSequence(withTiming(-14, { duration: 150 }), withTiming(0, { duration: 210 }), withTiming(-4, { duration: 90 }), withTiming(0, { duration: 90 })) }, [hopKey, hop, reduced])
  const top = useAnimatedStyle(() => ({ opacity: o.value }))
  const jump = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }] }))
  return (
    <Animated.View style={[{ width: size, height: size }, jump]}>
      <CharacterArt species={species} stage={stage} size={size} mood={mood} wear={wear} />
      {prev ? <Animated.View style={[StyleSheet.absoluteFill, top]}><CharacterArt species={species} stage={stage} size={size} mood={mood} wear={prev} /></Animated.View> : null}
    </Animated.View>
  )
})

/* ───────── 옷장(시안 C) ───────── */
export function WardScreen({ p, raise, width: W, height: H, topInset, bottomInset, sceneKey, seg, onSeg, onBack, tab, onTab, hopKey, reduced, onEquip, onBase, onDecor }: Frame & {
  tab: WardTab; onTab: (t: WardTab) => void; hopKey: number; reduced?: boolean
  onEquip: (id: string) => void; onBase: (slot: Exclude<WardTab, 'room'>) => void; onDecor: (id: string) => void
}) {
  const { species, progress, look, worn } = raise
  const st = progress.stage
  const seed = look.seed ?? 0
  const sheetTop = Math.round(H * 0.51)
  const T = sheetTop - 14
  const fit = useMemo(() => fitScene(sceneKey, W, H, T), [sceneKey, W, H, T])
  const perchX = useMemo(() => sceneLayout(sceneKey, W, fit.height, 'bottom').perchX, [sceneKey, W, fit.height])
  const headFrac = species ? headTop3d(species, st, look.path, seed).y - (worn.hat ? 0.07 : 0) : 0.22
  const box = Math.round(Math.max(120, Math.min(220, (T - topInset - 58) / (FOOT.y - headFrac))))
  const pos = standOnPerch(perchX, T, box)
  const ink = sceneDark(sceneKey) || p.dark ? '#FFFFFF' : '#13211B'
  const sheetBg = p.dark ? 'rgba(18,24,22,0.9)' : 'rgba(250,252,249,0.9)'
  return (
    <View style={{ width: W, height: H, overflow: 'hidden' }}>
      <SceneBackdrop sceneKey={sceneKey} width={W} height={fit.height} decor={species ? decorOn(progress.level, look) : []} style={{ position: 'absolute', left: 0, top: fit.top }} />
      <View style={[s.nav, { top: topInset + 6 }]}>
        <GlassBack p={p} onBack={onBack} ink={glassTone(p.dark).ink} />
        <Text style={[s.navT, { color: ink }]} accessibilityRole="header">꾸미기</Text>
        <View style={{ width: 40 }} />
      </View>
      {species ? (
        <View style={{ position: 'absolute', left: pos.left, top: pos.top }} accessible accessibilityLabel={`Lv ${progress.level} ${titleOf(species, st, look.path)} 미리보기`}>
          <FadeWear species={species} stage={st} size={box} mood="default" hopKey={hopKey} reduced={reduced} wear={{ lv: progress.level, path: look.path, eq: worn, seed }} />
        </View>
      ) : null}
      <View style={[s.sheet, { top: sheetTop, backgroundColor: Platform.OS === 'ios' ? 'transparent' : sheetBg }]}>
        {Platform.OS === 'ios' ? <BlurView intensity={24} tint={p.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
        {Platform.OS === 'ios' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: sheetBg }]} /> : null}
        <View style={[s.grab, { backgroundColor: p.textTertiary }]} />
        <View style={{ paddingHorizontal: 18 }}>
          <Segmented items={[{ key: 'ward', label: '옷장' }, { key: 'dex', label: '도감' }]} value={seg} onChange={onSeg} style={{ marginBottom: 12 }} small />
          <WardTabs p={p} tab={tab} onTab={onTab} fresh={raise.fresh} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: bottomInset + 30 }}>
          <WardGrid p={p} raise={raise} tab={tab} width={W - 36} onEquip={onEquip} onBase={onBase} onDecor={onDecor} />
        </ScrollView>
      </View>
    </View>
  )
}

/** 탭(밑줄 — 시안 .tabs) + 새로 받음 점 */
export function WardTabs({ p, tab, onTab, fresh }: { p: Palette; tab: WardTab; onTab: (t: WardTab) => void; fresh: Set<string> }) {
  return (
    <View style={[s.tabs, { borderBottomColor: p.borderDivider }]} accessibilityRole="tablist">
      {SLOTS.map(([k, n]) => {
        const on = k === tab
        const dot = itemsOfTab(k).some((i) => fresh.has(i.id))
        return (
          <Pressable key={k} onPress={() => { hx.tick(); onTab(k) }} hitSlop={6} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.tabT, { color: on ? p.textPrimary : p.textTertiary }]}>{n}</Text>
            {on ? <View style={[s.tabLine, { backgroundColor: p.accent }]} /> : null}
            {dot ? <View style={[s.tabDot, { backgroundColor: p.accent }]} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

/** 칸 하나(옷·배경·장식·기본) — 시안 .cell */
const Cell = memo(function Cell({ p, icon, name, sub, on, locked, fresh, onPress, label, w }: {
  p: Palette; icon: ReactNode; name: string; sub?: string; on?: boolean; locked?: boolean; fresh?: boolean; onPress: () => void; label: string; w: number
}) {
  const x = useSharedValue(0)
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const press = () => {
    if (locked) { x.value = withSequence(withTiming(-3, { duration: 55 }), withTiming(3, { duration: 55 }), withTiming(0, { duration: 55 })); return }
    hx.tick(); onPress()
  }
  return (
    <Animated.View style={[{ width: w }, st]}>
      <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on, disabled: !!locked }}
        style={({ pressed }) => [s.cell, { minHeight: w / 0.86, backgroundColor: on ? p.accentSubtle : cellBg(p), borderColor: on ? p.accent : 'transparent' }, pressed && !locked && { transform: [{ scale: 0.95 }] }]}>
        <View style={s.ico}>{icon}</View>
        <Text style={[s.cellN, { color: on ? p.textPrimary : locked ? p.textTertiary : p.textSecondary }]} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={[s.cellC, { color: p.textTertiary }]} numberOfLines={2}>{sub}</Text> : null}
        {fresh ? <View style={[s.ndot, { backgroundColor: p.accent }]} /> : null}
      </Pressable>
    </Animated.View>
  )
})
const cellBg = (p: Palette) => (p.dark ? 'rgba(255,255,255,0.06)' : '#F5F7F4')
/** 잠긴 덩어리 색 — 다크에서 빛나 보이지 않게(43 §16) 같은 그림을 회색 한 색으로, 옅게 */
const LockTint = ({ p, children }: { p: Palette; children: ReactNode }) => <View style={{ opacity: p.dark ? 0.35 : 0.28 }}>{children}</View>
function ItemIco({ p, it, locked, size = 50 }: { p: Palette; it: Item; locked: boolean; size?: number }) {
  const tint = locked ? p.textTertiary : undefined
  const pic = it.slot === 'bg' ? <SceneThumb bg={it.id} size={size - 4} tint={tint} /> : <AccThumb id={it.id} size={size} tint={tint} />
  return locked ? <LockTint p={p}>{pic}</LockTint> : pic
}

/** 옷장 격자(43 §5.4): 맨 앞 `기본`(진화 소품) + 옷. 방 탭 = 배경 + 장식 */
export function WardGrid({ p, raise, tab, width, onEquip, onBase, onDecor }: {
  p: Palette; raise: Raise; tab: WardTab; width: number; onEquip: (id: string) => void; onBase: (slot: Exclude<WardTab, 'room'>) => void; onDecor: (id: string) => void
}) {
  const { species, progress, worn, owned, fresh, state, look } = raise
  const st = progress.stage
  const w = Math.floor((width - 30) / 4)
  const cell = (it: Item) => {
    const own = owned.has(it.id)
    const on = (it.slot === 'bg' ? worn.bg : worn[it.slot]) === it.id
    return <Cell key={it.id} p={p} w={w} icon={<ItemIco p={p} it={it} locked={!own} />} name={it.name} sub={own ? undefined : conditionText(it, state)} on={on} locked={!own} fresh={fresh.has(it.id)}
      label={`${it.name}${own ? (on ? ', 입은 것' : '') : `, 잠김 ${conditionText(it, state)}`}`} onPress={() => onEquip(it.id)} />
  }
  if (tab === 'room') {
    return (
      <View>
        <Text style={[s.subh, { color: p.textPrimary, marginTop: 0 }]}>배경</Text>
        <View style={s.grid}>{itemsOfTab('room').map(cell)}</View>
        <View style={s.subhRow}><Text style={[s.subh, { color: p.textPrimary }]}>장식</Text><Text style={[s.subhS, { color: p.textTertiary }]}>눌러서 놓기·치우기</Text></View>
        <View style={s.grid}>
          {DECOR.map((d) => {
            const own = progress.level >= d.lv, on = own && !look.decorOff.includes(d.id)
            const pic = <DecorThumb id={d.id} size={50} tint={own ? undefined : p.textTertiary} />
            return <Cell key={d.id} p={p} w={w} icon={own ? pic : <LockTint p={p}>{pic}</LockTint>} name={d.name} sub={own ? undefined : `Lv ${d.lv}`} on={on} locked={!own}
              label={`${d.name}${own ? (on ? ', 놓음' : ', 치움') : `, 잠김 Lv ${d.lv}`}`} onPress={() => onDecor(d.id)} />
          })}
        </View>
      </View>
    )
  }
  const slot = tab
  return (
    <View>
      <View style={s.grid}>
        <Cell p={p} w={w} icon={<View style={[s.base, { borderColor: p.textTertiary }]} />} name="기본" sub={species ? baseName(slot, species, st) : '없음'} on={!worn[slot]} onPress={() => onBase(slot)} label="기본, 진화 소품" />
        {itemsOfTab(slot).map(cell)}
      </View>
      {babyHidesSlot(slot, st) ? <Text style={[s.note, { color: p.textTertiary }]}>아기 때는 씨앗 껍질 안이라 목·등 옷은 꼬마부터 보인다.</Text> : null}
    </View>
  )
}

/* ───────── 도감(시안 D) ───────── */
export function DexScreen({ p, raise, width: W, height: H, topInset, bottomInset, sceneKey, seg, onSeg, onBack, onPath, onTrophyLayout, scrollRef }: Frame & {
  onPath: (path: Path) => void; onTrophyLayout?: (y: number) => void; scrollRef?: React.RefObject<ScrollView | null>
}) {
  const { species, progress, look, owned, state, trophies } = raise
  const st = progress.stage
  const seed = look.seed ?? 0
  const sceneH = Math.round(H * 0.46)
  const bg = p.pageBg
  const n = dexCount(species, st)
  const cells = useMemo(() => dexCells(species), [species])
  const cw = Math.floor((W - 32 - 20) / 3)
  const ink = p.textPrimary
  const cellFill = p.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.66)'
  const cellLine = p.dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.9)'
  return (
    <View style={{ width: W, height: H, backgroundColor: bg, overflow: 'hidden' }}>
      <SceneBackdrop sceneKey={sceneKey} width={W} height={sceneH} align="center" style={{ position: 'absolute', left: 0, top: 0 }} />
      {Platform.OS === 'ios' ? <BlurView intensity={10} tint={p.dark ? 'dark' : 'light'} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: sceneH }} /> : null}
      <Svg style={{ position: 'absolute', left: 0, top: 0 }} width={W} height={sceneH + 2} pointerEvents="none">
        <Defs><LinearGradient id="dexFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg} stopOpacity={0} /><Stop offset="0.35" stopColor={bg} stopOpacity={0.15} /><Stop offset="0.87" stopColor={bg} stopOpacity={1} />
        </LinearGradient></Defs>
        <Rect x={0} y={0} width={W} height={sceneH + 2} fill="url(#dexFade)" />
      </Svg>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: topInset + 56, paddingHorizontal: 16, paddingBottom: bottomInset + 40 }}>
        <Text style={[s.dexH, { color: sceneDark(sceneKey) && !p.dark ? '#FFFFFF' : ink }]} accessibilityRole="header">도감</Text>
        <Text style={[s.dexN, { color: sceneDark(sceneKey) && !p.dark ? '#FFFFFF' : ink }]}>모은 모습 <Text style={{ fontWeight: '800' }}>{n}</Text> / {DEX_TOTAL}</Text>
        <View style={[s.grid, { gap: 10, marginTop: 18 }]}>
          {cells.map(({ sp, st: x }) => {
            const ok = dexSeen(species, st, sp, x)
            const me = sp === species && x === st
            const nm = ok ? titleOf(sp, x, look.path) : '?'
            return (
              <View key={`${sp}${x}`} style={[s.dexCell, { width: cw, height: cw, backgroundColor: cellFill, borderColor: cellLine }]} accessible accessibilityLabel={ok ? `${nm}${me ? ', 지금 내 모습' : ''}` : '아직 못 본 모습'}>
                <View style={{ marginTop: -cw * 0.12 }}>
                  <DexFigure species={sp} stage={x} path={sp === species ? look.path : 'a'} seed={sp === species ? seed : 0} size={Math.round(cw * 0.78)}
                    tint={ok ? undefined : p.dark ? '#FFFFFF' : '#000000'} tintOpacity={p.dark ? 0.1 : 0.16} />
                </View>
                {me ? <View style={[s.me, { backgroundColor: p.accent }]}><Text style={s.meT}>나</Text></View> : null}
                <Text style={[s.dexNm, { color: ink }]} numberOfLines={1}>{nm}</Text>
              </View>
            )
          })}
        </View>

        {species && st >= 3 ? (
          <>
            <View style={s.subhRow}><Text style={[s.subh, { color: p.textPrimary }]}>갈래</Text><Text style={[s.subhS, { color: p.textTertiary }]}>다른 길은 언제든 바꿀 수 있어</Text></View>
            <View style={[s.grid, { gap: 10 }]}>
              {(['a', 'b'] as Path[]).map((v) => {
                const on = v === look.path
                return (
                  <Pressable key={v} onPress={() => { if (!on) { hx.tick(); onPath(v) } }} accessibilityRole="button" accessibilityState={{ selected: on }}
                    accessibilityLabel={`${PATHS[species][v].name}, ${titleOf(species, st, v)}${on ? ', 지금 길' : ', 눌러서 이 길로 바꾸기'}`}
                    style={[s.pathCell, { width: (W - 42) / 2, backgroundColor: on ? p.accentSubtle : cellFill, borderColor: on ? p.accent : cellLine }]}>
                    <DexFigure species={species} stage={st} path={v} seed={seed} size={64} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.pathN, { color: p.textPrimary }]} numberOfLines={1}>{PATHS[species][v].name}</Text>
                      <Text style={[s.cellC, { color: p.textTertiary, textAlign: 'left' }]} numberOfLines={1}>{on ? '지금 길' : '눌러서 바꾸기'}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </>
        ) : null}

        {SLOTS.map(([k, nm]) => {
          const list = itemsOfTab(k)
          const w = Math.floor((W - 32 - 30) / 4)
          return (
            <View key={k}>
              <View style={s.subhRow}><Text style={[s.subh, { color: p.textPrimary }]}>{k === 'room' ? '배경' : nm}</Text><Text style={[s.subhS, { color: p.textTertiary }]}>{list.filter((i) => owned.has(i.id)).length}/{list.length}</Text></View>
              <View style={s.grid}>{list.map((it) => { const o = owned.has(it.id); return <Cell key={it.id} p={p} w={w} icon={<ItemIco p={p} it={it} locked={!o} />} name={it.name} sub={o ? undefined : conditionText(it, state)} locked={!o} onPress={() => {}} label={`${it.name}${o ? '' : `, ${conditionText(it, state)}`}`} /> })}</View>
            </View>
          )
        })}
        <View onLayout={(e: LayoutChangeEvent) => onTrophyLayout?.(e.nativeEvent.layout.y)}>
          <Text style={[s.subh, { color: p.textPrimary }]}>트로피 선반</Text>
          {trophies.length ? trophies.map((t, i) => (
            <View key={t.id} style={[s.trow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
              <TrophyIco t={trophyShape(t)} />
              <Text style={[s.trowT, { color: p.textPrimary }]} numberOfLines={1}>{t.title}</Text>
              <Text style={[s.trowS, { color: p.textTertiary }]}>{trophySub(t)}</Text>
            </View>
          )) : <Text style={[s.note, { color: p.textTertiary }]}>프로젝트를 끝내거나 한 날이 7일이 되면 선반에 올라가요.</Text>}
          <Text style={[s.note, { color: p.textTertiary }]}>옷 {ITEMS.filter((i) => owned.has(i.id)).length}/{ITEMS.length}</Text>
        </View>
      </ScrollView>
      <View style={[s.nav, { top: topInset + 6 }]}>
        <GlassBack p={p} onBack={onBack} ink={glassTone(p.dark).ink} />
        <View style={{ flex: 1 }} />
        <Segmented items={[{ key: 'ward', label: '옷장' }, { key: 'dex', label: '도감' }]} value={seg} onChange={onSeg} style={{ width: 150 }} small />
      </View>
    </View>
  )
}
const TrophyIco = memo(function TrophyIco({ t }: { t: ReturnType<typeof trophyShape> }) {
  const svg = useMemo(() => trophyIcon(t, { rn: true }), [t.k, t.n]) // eslint-disable-line react-hooks/exhaustive-deps
  return <SvgString svg={svg} size={28} />
})

const s = StyleSheet.create({
  nav: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navT: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', paddingTop: 10 },
  grab: { width: 38, height: 5, borderRadius: 3, opacity: 0.45, alignSelf: 'center', marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 18, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 14 },
  tab: { paddingTop: 8, paddingBottom: 10 },
  tabT: { fontSize: 14.5, fontWeight: '700' },
  tabLine: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2.5, borderRadius: 2 },
  tabDot: { position: 'absolute', top: 6, right: -7, width: 6, height: 6, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  ico: { width: 56, height: 52, alignItems: 'center', justifyContent: 'center' },
  cellN: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
  cellC: { fontSize: 10.5, lineHeight: 13, fontWeight: '600', textAlign: 'center' },
  ndot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4 },
  base: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderStyle: 'dashed' },
  subh: { fontSize: 13.5, fontWeight: '700', marginTop: 18, marginBottom: 8, marginHorizontal: 2 },
  subhRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  subhS: { fontSize: 11.5, marginHorizontal: 2 },
  note: { fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  dexH: { fontSize: 32, fontWeight: '800', letterSpacing: -1.1 },
  dexN: { fontSize: 14, fontWeight: '600', opacity: 0.7, marginTop: 2 },
  dexCell: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  me: { position: 'absolute', top: 8, right: 8, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  meT: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  dexNm: { position: 'absolute', left: 4, right: 4, bottom: 7, textAlign: 'center', fontSize: 11, fontWeight: '700', opacity: 0.8 },
  pathCell: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 1.5, padding: 8 },
  pathN: { fontSize: 13.5, fontWeight: '700' },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 46 },
  trowT: { flex: 1, fontSize: 14.5, fontWeight: '500' },
  trowS: { fontSize: 12 }
})
