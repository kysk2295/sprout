// 43 §5.4 · §8 꾸미기(성장 탭 옷장·도감·트로피 → 이 화면): ‹ 꾸미기 + 분절 옷장 · 도감.
// 옷장 = 미리보기 무대 230 + 탭(모자·목·손·등·방) + 4열 격자. 입히면 look_json(동기화)에 바로 저장하고 캐릭터가 8px 깡충.
// 새로 받음 점은 그 탭을 보면 지운다(planMarkSeen). 마지막 탭은 기기에 둔다(sprout.wardTab).
import { equipItem, itemsOfTab, setPath, toggleDecor, unequipSlot, type Path, type WardTab } from '@sprout/schema/wardrobe'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DexView, PreviewStage, WardGrid, WardTabs } from '../../src/growth/Decorate'
import { markSeen, saveLook, useRaise } from '../../src/growth/raise'
import { KEY, preload, read, write } from '../../src/growth/store'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { Segmented } from '../../src/ui/Segmented'

const TABS: WardTab[] = ['hat', 'neck', 'hand', 'back', 'room']

export default function Decorate() {
  const p = usePalette()
  const router = useRouter()
  const ins = useSafeAreaInsets()
  const params = useLocalSearchParams<{ tab?: string; focus?: string }>()
  const raise = useRaise()
  const cid = raise.character?.id
  const [seg, setSeg] = useState<'ward' | 'dex'>(params.tab === 'dex' ? 'dex' : 'ward')
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
  const onBase = (slot: Exclude<WardTab, 'room'>) => save(unequipSlot(raise.look, slot))
  const onDecor = (id: string) => save(toggleDecor(raise.look, id))
  const onPath = (path: Path) => save(setPath(raise.look, path))

  const scroll = useRef<ScrollView>(null)
  const [troY, setTroY] = useState<number | null>(null)
  useEffect(() => { if (params.focus === 'trophy' && seg === 'dex' && troY !== null) setTimeout(() => scroll.current?.scrollTo({ y: troY, animated: true }), 200) }, [params.focus, seg, troY])

  return (
    <View style={{ flex: 1, backgroundColor: p.cardBg }}>
      <View style={[s.nav, { marginTop: ins.top }]}>
        <GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <Text style={[s.title, { color: p.textPrimary }]}>꾸미기</Text>
        <Segmented items={[{ key: 'ward', label: '옷장' }, { key: 'dex', label: '도감' }]} value={seg} onChange={setSeg} style={{ width: 150 }} small />
      </View>
      {seg === 'ward' ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 14 }}>
            <PreviewStage p={p} raise={raise} hopKey={hopKey} />
            <WardTabs p={p} tab={tab} onTab={onTab} fresh={raise.fresh} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: ins.bottom + 30 }}>
            <WardGrid p={p} raise={raise} tab={tab} cols={4} onEquip={onEquip} onBase={onBase} onDecor={onDecor} />
          </ScrollView>
        </View>
      ) : (
        <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: ins.bottom + 30 }}>
          <DexView p={p} raise={raise} onPath={onPath} onTrophyLayout={setTroY} />
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }
})
