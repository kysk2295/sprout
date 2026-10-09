// 43 §5.4 옷장 · §8 도감(휴대폰 꾸미기 화면 부품, 시안 character-raising-v2 A 오른쪽). 데이터·규칙은 공용 wardrobe — 화면은 그리기만.
// 칸 상태: 기본 · 입은 것(강조 옅은 면 + 2px) · 새로 받음(점) · 잠김(한 색 실루엣 + 자물쇠 + 조건, 누르면 좌우 3px만).
import { art, artScale, artTop, decorIcon, itemIcon, PATHS, scene, sceneGround, standBottom, titleOf, trophyIcon } from '@sprout/schema/characterArt'
import { STAGES, type Species } from '@sprout/schema/growth'
import {
  babyHidesSlot, baseName, conditionText, DECOR, ITEMS, itemsOfTab, SLOTS, stageBoxSize, trophyShape, trophySub, decorOn, type Item, type Path, type WardTab
} from '@sprout/schema/wardrobe'
import { Lock } from 'lucide-react-native'
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import type { Palette } from '../theme/palette'
import { hx } from '../ui/haptics'
import { CharacterArt, SvgString } from './art/CharacterArt'
import type { Raise } from './raise'

/** 미리보기 무대(높이 230, 모서리 24) + 왼쪽 위 유리 칩 */
export function PreviewStage({ p, raise, hopKey }: { p: Palette; raise: Raise; hopKey: number }) {
  const { species, progress, look, worn } = raise
  const [w, setW] = useState(0)
  const H = 230
  // 머리(새싹·모자) 꼭대기가 미리보기 위쪽 8 안에 들게 상자를 줄인다 — 그림이 단계마다 같은 상자를 채워서 위가 비지 않는다
  const sk = w ? Math.max(w / 600, H / 420) : 0.6
  const headFrac = species ? (artTop(species, progress.stage) - 2 - (worn.hat ? 16 * artScale(species, progress.stage) : 0)) / 120 : 0.1
  const box = Math.round(Math.min(stageBoxSize() * 0.74, (H - 120 * sk - 8) / (11 / 12 - headFrac)))
  const svg = useMemo(() => scene({ bg: worn.bg, decor: decorOn(progress.level, look), preview: true, rn: true }), [worn.bg, progress.level, look])
  const hop = useSharedValue(0)
  useEffect(() => { if (hopKey) hop.value = withSequence(withTiming(-8, { duration: 140 }), withTiming(0, { duration: 200 })) }, [hopKey, hop])
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }] }))
  return (
    <View style={[s.pv, { backgroundColor: sceneGround(worn.bg) }]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w ? <SvgString svg={svg} width={w} height={H} preserveAspectRatio="xMidYMax slice" /> : null}
      <View style={[s.badge, { backgroundColor: p.dark ? 'rgba(18,24,20,0.72)' : 'rgba(255,255,255,0.82)' }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: p.textPrimary }}>Lv {progress.level} · {species ? titleOf(species, progress.stage, look.path) : '씨앗'}</Text>
      </View>
      {w ? (
        <Animated.View style={[s.pvChar, { bottom: standBottom(w, H, box), width: box, height: box }, st]} pointerEvents="none">
          <CharacterArt species={species} stage={progress.stage} size={box} fit={false} mood="smile" noAura />
        </Animated.View>
      ) : null}
    </View>
  )
}

/** 탭 알약(고른 탭 = 진한 글자 색 채움) + 새로 받음 점 */
export function WardTabs({ p, tab, onTab, fresh }: { p: Palette; tab: WardTab; onTab: (t: WardTab) => void; fresh: Set<string> }) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {SLOTS.map(([k, n]) => {
        const on = k === tab
        const dot = itemsOfTab(k).some((i) => fresh.has(i.id))
        return (
          <Pressable key={k} onPress={() => { hx.tick(); onTab(k) }} style={[s.tab, { backgroundColor: on ? p.textPrimary : p.bgSelected }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.tabT, { color: on ? p.cardBg : p.textSecondary }]}>{n}</Text>
            {dot ? <View style={[s.tabDot, { backgroundColor: p.accent }]} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

/** 칸 하나(옷·배경·장식·기본) */
const Cell = memo(function Cell({ p, icon, name, sub, on, locked, fresh, onPress, label, cols }: {
  p: Palette; icon: ReactNode; name: string; sub?: string; on?: boolean; locked?: boolean; fresh?: boolean; onPress: () => void; label: string; cols: number
}) {
  const x = useSharedValue(0)
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const press = () => {
    if (locked) { x.value = withSequence(withTiming(-3, { duration: 55 }), withTiming(3, { duration: 55 }), withTiming(0, { duration: 55 })); return }
    hx.tick(); onPress()
  }
  return (
    <Animated.View style={[{ width: `${100 / cols}%`, padding: 4 }, st]}>
      <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on, disabled: !!locked }}
        style={({ pressed }) => [s.cell, { backgroundColor: on ? (p.dark ? 'rgba(34,164,93,0.22)' : 'rgba(34,164,93,0.12)') : p.bgSelected, borderColor: on ? p.accent : 'transparent' }, pressed && !locked && { transform: [{ scale: 0.95 }] }]}>
        {icon}
        <Text style={[s.cellN, { color: locked ? p.textTertiary : p.textPrimary }]} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={[s.cellC, { color: p.textTertiary }]} numberOfLines={2}>{sub}</Text> : null}
        {fresh ? <View style={[s.ndot, { backgroundColor: p.accent }]} /> : locked ? <View style={s.lk}><Lock size={13} color={p.textTertiary} /></View> : null}
      </Pressable>
    </Animated.View>
  )
})
const Ico = ({ svg }: { svg: string }) => <SvgString svg={svg} size={50} />

/** 옷장 격자(43 §5.4): 맨 앞 `기본`(진화 소품) + 옷. 방 탭 = 배경 + 장식 */
export function WardGrid({ p, raise, tab, cols, onEquip, onBase, onDecor }: {
  p: Palette; raise: Raise; tab: WardTab; cols: number; onEquip: (id: string) => void; onBase: (slot: Exclude<WardTab, 'room'>) => void; onDecor: (id: string) => void
}) {
  const { species, progress, worn, owned, fresh, state, look } = raise
  const st = progress.stage
  const cell = (it: Item) => {
    const own = owned.has(it.id)
    const on = (it.slot === 'bg' ? worn.bg : worn[it.slot]) === it.id
    return <Cell key={it.id} p={p} cols={cols} icon={<IconMemo id={it.id} locked={!own} lc={lockOf(p)} />} name={it.name} sub={own ? undefined : conditionText(it, state)} on={on} locked={!own} fresh={fresh.has(it.id)}
      label={`${it.name}${own ? (on ? ', 입은 것' : '') : `, 잠김 ${conditionText(it, state)}`}`} onPress={() => onEquip(it.id)} />
  }
  if (tab === 'room') {
    return (
      <View>
        <Text style={[s.subh, { color: p.textPrimary }]}>배경</Text>
        <View style={s.grid}>{itemsOfTab('room').map(cell)}</View>
        <View style={s.subhRow}><Text style={[s.subh, { color: p.textPrimary }]}>장식</Text><Text style={[s.subhS, { color: p.textTertiary }]}>눌러서 놓기·치우기</Text></View>
        <View style={s.grid}>
          {DECOR.map((d) => {
            const own = progress.level >= d.lv, on = own && !look.decorOff.includes(d.id)
            return <Cell key={d.id} p={p} cols={cols} icon={<DecorIco id={d.id} locked={!own} lc={lockOf(p)} />} name={d.name} sub={own ? undefined : `Lv ${d.lv}`} on={on} locked={!own}
              label={`${d.name}${own ? (on ? ', 놓음' : ', 치움') : `, 잠김 Lv ${d.lv}`}`} onPress={() => onDecor(d.id)} />
          })}
        </View>
      </View>
    )
  }
  const slot = tab
  return (
    <View>
      <View style={[s.grid, { marginTop: 2 }]}>
        <Cell p={p} cols={cols} icon={<View style={[s.base, { borderColor: p.textTertiary }]} />} name="기본" sub={species ? baseName(slot, species, st) : '없음'} on={!worn[slot]} onPress={() => onBase(slot)} label="기본, 진화 소품" />
        {itemsOfTab(slot).map(cell)}
      </View>
      {babyHidesSlot(slot, st) ? <Text style={[s.note, { color: p.textTertiary }]}>아기 때는 씨앗 껍질 안이라 목·등 옷은 꼬마부터 보인다.</Text> : null}
    </View>
  )
}
/** 잠긴 실루엣 색: 다크에서는 밝은 회색이 빛나 보여서(43 §16 "다크에서 빛나 보이지 않게") 어두운 회녹색 */
const lockOf = (p: Palette) => (p.dark ? '#46544B' : true)
const IconMemo = memo(function IconMemo({ id, locked, lc = true }: { id: string; locked: boolean; lc?: string | true }) {
  const svg = useMemo(() => itemIcon(id, { locked: locked ? lc : false, rn: true }), [id, locked, lc])
  return <Ico svg={svg} />
})
const DecorIco = memo(function DecorIco({ id, locked, lc = true }: { id: string; locked: boolean; lc?: string | true }) {
  const svg = useMemo(() => decorIcon(id, { locked: locked ? lc : false, rn: true }), [id, locked, lc])
  return <Ico svg={svg} />
})

/** 도감(43 §8 · §18.2): 요약 3칸 + 모습 8칸 + 옷(칸별) + 트로피 */
export function DexView({ p, raise, onPath, onTrophyLayout }: { p: Palette; raise: Raise; onPath: (path: Path) => void; onTrophyLayout?: (y: number) => void }) {
  const { species, progress, look, owned, state, trophies } = raise
  const st = progress.stage
  const looks: [number, Path][] = [[1, 'a'], [2, 'a'], [3, 'a'], [3, 'b'], [4, 'a'], [4, 'b'], [5, 'a'], [5, 'b']]
  const ownN = ITEMS.filter((i) => owned.has(i.id)).length
  const lookN = looks.filter(([x]) => x <= st).length
  const Sum = ({ n, of, label, ratio }: { n: number; of?: number; label: string; ratio: number }) => (
    <View style={[s.sum, { backgroundColor: p.bgSelected }]}>
      <Text style={[s.sumB, { color: p.textPrimary }]}>{n}{of ? <Text style={{ fontSize: 13, color: p.textTertiary }}>/{of}</Text> : null}</Text>
      <Text style={[s.sumS, { color: p.textTertiary }]}>{label}</Text>
      <View style={[s.sumBar, { backgroundColor: p.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}><View style={{ width: `${Math.min(100, ratio * 100)}%`, height: 5, borderRadius: 3, backgroundColor: p.accent }} /></View>
    </View>
  )
  return (
    <View>
      <View style={s.sumRow}>
        <Sum n={ownN} of={ITEMS.length} label="옷" ratio={ownN / ITEMS.length} />
        <Sum n={lookN} of={8} label="모습" ratio={lookN / 8} />
        <Sum n={trophies.length} label="트로피" ratio={trophies.length * 0.12} />
      </View>
      {species ? (
        <>
          <View style={s.subhRow}><Text style={[s.subh, { color: p.textPrimary }]}>모습</Text><Text style={[s.subhS, { color: p.textTertiary }]}>다른 길은 언제든 바꿀 수 있어</Text></View>
          <View style={s.grid}>
            {looks.map(([x, path]) => {
              const ok = x <= st, cur = x === st && (x < 3 || path === look.path), swap = ok && x === st && x >= 3 && path !== look.path
              const sub = ok ? (x >= 3 && path !== look.path ? (x === st ? '눌러서 바꾸기' : '다른 길') : x >= 3 ? PATHS[species][path].name : '') : `Lv ${STAGES[x - 1].from}`
              return <Cell key={`${x}${path}`} p={p} cols={3} icon={<LookIco species={species} stage={x} path={path} locked={!ok} lc={lockOf(p)} />} name={titleOf(species, x, path)} sub={sub} on={cur} locked={!ok && !swap}
                label={`${titleOf(species, x, path)}${ok ? '' : `, Lv ${STAGES[x - 1].from}`}${swap ? ', 눌러서 이 길로 바꾸기' : ''}`} onPress={() => { if (swap) onPath(path) }} />
            })}
          </View>
        </>
      ) : null}
      {SLOTS.map(([k, n]) => {
        const list = itemsOfTab(k)
        return (
          <View key={k}>
            <View style={s.subhRow}><Text style={[s.subh, { color: p.textPrimary }]}>{k === 'room' ? '배경' : n}</Text><Text style={[s.subhS, { color: p.textTertiary }]}>{list.filter((i) => owned.has(i.id)).length}/{list.length}</Text></View>
            <View style={s.grid}>{list.map((it) => { const o = owned.has(it.id); return <Cell key={it.id} p={p} cols={4} icon={<IconMemo id={it.id} locked={!o} lc={lockOf(p)} />} name={it.name} sub={o ? undefined : conditionText(it, state)} locked={!o} onPress={() => {}} label={`${it.name}${o ? '' : `, ${conditionText(it, state)}`}`} /> })}</View>
          </View>
        )
      })}
      <View onLayout={(e) => onTrophyLayout?.(e.nativeEvent.layout.y)}>
        <Text style={[s.subh, { color: p.textPrimary }]}>트로피 선반</Text>
        {trophies.length ? trophies.map((t, i) => (
          <View key={t.id} style={[s.trow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
            <TrophyIco t={trophyShape(t)} />
            <Text style={[s.trowT, { color: p.textPrimary }]} numberOfLines={1}>{t.title}</Text>
            <Text style={[s.trowS, { color: p.textTertiary }]}>{trophySub(t)}</Text>
          </View>
        )) : <Text style={[s.note, { color: p.textTertiary }]}>프로젝트를 끝내거나 한 날이 7일이 되면 선반에 올라가요.</Text>}
      </View>
    </View>
  )
}
const LookIco = memo(function LookIco({ species, stage, path, locked, lc = true }: { species: Species; stage: number; path: Path; locked: boolean; lc?: string | true }) {
  // 도감은 실제 비율(43 결정 ⑨): 아기는 작게, 전설은 칸을 채운다
  const svg = useMemo(() => art(species, stage, { path, size: 64, detail: 'full', crop: 'full', noAura: true, lock: locked ? lc : false, mood: 'smile', rn: true, lv: STAGES[stage - 1].from }), [species, stage, path, locked, lc])
  return <SvgString svg={svg} size={64} />
})
const TrophyIco = memo(function TrophyIco({ t }: { t: ReturnType<typeof trophyShape> }) {
  const svg = useMemo(() => trophyIcon(t, { rn: true }), [t.k, t.n]) // eslint-disable-line react-hooks/exhaustive-deps
  return <SvgString svg={svg} size={28} />
})

const s = StyleSheet.create({
  pv: { height: 230, borderRadius: 24, overflow: 'hidden' },
  pvChar: { position: 'absolute', alignSelf: 'center' },
  badge: { position: 'absolute', left: 12, top: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, zIndex: 3 },
  tabs: { flexDirection: 'row', gap: 6, paddingVertical: 12 },
  tab: { height: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  tabT: { fontSize: 13, fontWeight: '600' },
  tabDot: { position: 'absolute', top: 5, right: 6, width: 6, height: 6, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { minHeight: 92, borderRadius: 18, alignItems: 'center', paddingTop: 8, paddingBottom: 8, paddingHorizontal: 4, gap: 3, borderWidth: 2 },
  cellN: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
  cellC: { fontSize: 10, lineHeight: 12.5, textAlign: 'center' },
  ndot: { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4 },
  lk: { position: 'absolute', top: 6, right: 7 },
  base: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderStyle: 'dashed', margin: 5 },
  subh: { fontSize: 13.5, fontWeight: '700', marginTop: 14, marginBottom: 8, marginHorizontal: 2 },
  subhRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  subhS: { fontSize: 11.5, marginHorizontal: 2 },
  note: { fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  sumRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  sum: { flex: 1, borderRadius: 16, padding: 12, paddingBottom: 10 },
  sumB: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  sumS: { fontSize: 11.5, fontWeight: '600' },
  sumBar: { height: 5, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 46 },
  trowT: { flex: 1, fontSize: 14.5, fontWeight: '500' },
  trowS: { fontSize: 12 }
})
