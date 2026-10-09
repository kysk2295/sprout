// 43 §5.4 · §8 · 49 §7 꾸미기(성장 탭 옷장·도감 → 이 화면): 분절 옷장 · 도감.
// 옷장 = 위 절반 장면 + 캐릭터 220, 아래 반투명 시트(탭 모자·목·손·등·방 + 4열). 입히면 look_json(동기화)에 바로 저장하고 옷 층이 0.25초 페이드로 겹치며 깡충.
// 새로 받음 점은 그 탭을 보면 지운다(planMarkSeen). 마지막 탭은 기기에 둔다(sprout.wardTab).
import { sceneDark, sceneKeyFor } from '@sprout/schema/characterArt'
import { equipItem, isNight, itemsOfTab, setPath, toggleDecor, unequipSlot, type Path, type WardTab } from '@sprout/schema/wardrobe'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DexScreen, WardScreen, type DecorSeg } from '../../src/growth/Decorate'
import { useMotionReduced } from '../../src/growth/motion'
import { markSeen, saveLook, useRaise } from '../../src/growth/raise'
import { KEY, preload, read, write } from '../../src/growth/store'
import { usePalette } from '../../src/theme/ThemeProvider'

const TABS: WardTab[] = ['hat', 'neck', 'hand', 'back', 'room']

export default function Decorate() {
  const p = usePalette()
  const router = useRouter()
  const ins = useSafeAreaInsets()
  const win = useWindowDimensions()
  const reduced = useMotionReduced()
  const params = useLocalSearchParams<{ tab?: string; focus?: string }>()
  const raise = useRaise()
  const cid = raise.character?.id
  const [seg, setSeg] = useState<DecorSeg>(params.tab === 'dex' ? 'dex' : 'ward')
  const [tab, setTab] = useState<WardTab>('hat')
  useEffect(() => { void preload([KEY.wardTab]).then(() => { const t = read(KEY.wardTab) as WardTab | null; if (t && TABS.includes(t)) setTab(t) }) }, [])
  const onTab = (t: WardTab) => { setTab(t); write(KEY.wardTab, t) }
  const [hopKey, setHopKey] = useState(0)

  // 이 탭의 새로 받음 점 지우기(한 번 보면 사라짐) — 1.2초 보면
  useEffect(() => {
    if (!cid || seg !== 'ward') return
    const ids = itemsOfTab(tab).map((i) => i.id).filter((id) => raise.fresh.has(id))
    if (!ids.length) return
    const t = setTimeout(() => void markSeen(cid, ids), 1200)
    return () => clearTimeout(t)
  }, [cid, seg, tab, raise.fresh])

  const save = (next: typeof raise.look) => { if (cid) void saveLook(cid, next) }
  const onEquip = (id: string) => { save(equipItem(raise.look, id)); setHopKey((k) => k + 1) }
  const onBase = (slot: Exclude<WardTab, 'room'>) => { save(unequipSlot(raise.look, slot)); setHopKey((k) => k + 1) }
  const onDecor = (id: string) => save(toggleDecor(raise.look, id))
  const onPath = (path: Path) => save(setPath(raise.look, path))

  const scroll = useRef<ScrollView>(null)
  const [troY, setTroY] = useState<number | null>(null)
  useEffect(() => { if (params.focus === 'trophy' && seg === 'dex' && troY !== null) setTimeout(() => scroll.current?.scrollTo({ y: troY, animated: true }), 200) }, [params.focus, seg, troY])

  // 성장 홈과 같은 장면(입은 배경 + 다크 테마·늦은 밤 = 밤)
  const sceneKey = sceneKeyFor(raise.worn.bg, p.dark || isNight(new Date().getHours()))
  const frame = { p, raise, width: win.width, height: win.height, topInset: ins.top, bottomInset: ins.bottom, sceneKey, seg, onSeg: setSeg, onBack: () => router.back() }
  return (
    <View style={{ flex: 1, backgroundColor: p.cardBg }}>
      <StatusBar style={seg === 'ward' ? (sceneDark(sceneKey) || p.dark ? 'light' : 'dark') : p.dark ? 'light' : 'dark'} />
      {seg === 'ward'
        ? <WardScreen {...frame} tab={tab} onTab={onTab} hopKey={hopKey} reduced={reduced} onEquip={onEquip} onBase={onBase} onDecor={onDecor} />
        : <DexScreen {...frame} onPath={onPath} onTrophyLayout={setTroY} scrollRef={scroll} />}
    </View>
  )
}
