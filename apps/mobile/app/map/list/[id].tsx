// 29 §2.2 리스트 → 할 일(F2): ‹ 폴더 이름 · ⋯(이름 바꾸기·보관) · 진행 고리 + 리스트 이름
// 순서 카드(번호 원 + 세로선, 끝난 단계 회색, ⛓ 먼저 N) → AI 제안 줄(점선, ✓ ✕ — 데스크톱이 만든 순서·목표 제안) → 나머지 카드(🎯·날짜).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, ChevronLeft, MoreHorizontal, Sparkles, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { acceptLink, dropLink, useMapData, useMapOptions } from '../../../src/map/data'
import { Dialog, type DialogSpec } from '../../../src/map/Dialog'
import { useFolderMenu } from '../../../src/map/folderMenu'
import { chainView, progressOf, suggestionsFor, type MapTask } from '../../../src/map/logic'
import { MapTaskRow, Ring } from '../../../src/map/parts'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { GlassButton } from '../../../src/ui/Glass'
import { PopMenu, useAnchor } from '../../../src/ui/Menu'
import { useToast } from '../../../src/ui/Toast'

export default function MapList() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const [o] = useMapOptions()
  const data = useMapData({ ...o, view: 'list' })
  const more = useAnchor()
  const [dialog, setDialog] = useState<DialogSpec | null>(null)
  const menus = useFolderMenu(setDialog)

  const list = data.lists.find((l) => l.id === id)
  const folder = list?.folder_id ? data.folders.find((f) => f.id === list.folder_id) : undefined
  const tasks: MapTask[] = useMemo(() => data.tasks.filter((t) => t.list_id === id), [data.tasks, id])
  const view = useMemo(() => chainView(tasks, data.links), [tasks, data.links])
  const sugg = useMemo(() => suggestionsFor(new Set(tasks.map((t) => t.id)), data.links), [tasks, data.links])
  const prog = progressOf(tasks)
  const back = folder?.name ?? '작업 지도'
  const titleOf = (tid: string) => data.byId.get(tid)?.title ?? data.links.find((l) => l.to_id === tid)?.to_title ?? data.links.find((l) => l.from_id === tid)?.from_title ?? '할 일'
  const goalTitle = (gid: string) => data.goals.find((g) => g.id === gid)?.title ?? '목표'
  const items = list ? menus.list(list, () => router.back()) : []

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.nav, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={`${back}로 돌아가기`} style={s.back} hitSlop={6}>
          <ChevronLeft size={24} color={p.accent} /><Text style={{ color: p.accent, fontSize: 17 }} numberOfLines={1}>{back}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {items.length ? <GlassButton label="리스트 메뉴" onPress={more.open}><View ref={more.ref} collapsable={false}><MoreHorizontal size={20} color={p.textPrimary} /></View></GlassButton> : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        <View style={s.title}>
          <Ring done={prog.done} total={prog.total} size={30} />
          {list?.emoji ? <Text style={{ fontSize: 24 }}>{list.emoji}</Text> : null}
          <Text style={[s.titleText, { color: p.textPrimary }]} numberOfLines={1}>{list?.kind === 'inbox' ? '기본함' : list?.name ?? ''}</Text>
        </View>

        {view.chain.length ? (
          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            <View style={s.ghead}>
              <Text style={[s.gtitle, { color: p.textSecondary }]}>순서 <Text style={{ color: p.textTertiary }}>{view.chain.length}</Text></Text>
              <Text style={{ color: p.textTertiary, fontSize: 12 }}>위에서부터 먼저</Text>
            </View>
            {view.chain.map((c, i) => {
              const done = c.task.status === 1
              return (
                <MapTaskRow key={c.task.id} task={c.task} data={data} first={i === 0} waiting={c.waiting}
                  lead={
                    <View style={s.numCol}>
                      {i > 0 ? <View style={[s.vline, { top: 0, height: '50%', backgroundColor: p.borderDivider }]} /> : null}
                      {i < view.chain.length - 1 ? <View style={[s.vline, { bottom: 0, height: '50%', backgroundColor: p.borderDivider }]} /> : null}
                      <View style={[s.num, done ? { backgroundColor: p.textQuaternary } : { borderWidth: 1.5, borderColor: p.accent, backgroundColor: p.cardBg }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: done ? '#fff' : p.accent }}>{c.n}</Text>
                      </View>
                    </View>
                  } />
              )
            })}
          </View>
        ) : null}

        {sugg.map((l) => (
          <View key={l.id} style={[s.sugg, { borderColor: p.accent }]}>
            <Sparkles size={15} color={p.accent} />
            <Text style={{ flex: 1, color: p.textPrimary, fontSize: 13.5, lineHeight: 19 }}>
              {l.kind === 'sequence' ? `AI 제안: '${titleOf(l.to_id)}'은(는) '${titleOf(l.from_id)}' 다음` : `AI 제안: '${titleOf(l.to_id)}' → 🎯 ${goalTitle(l.from_id)}`}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="제안 받기" hitSlop={8} onPress={() => void acceptLink(l.id).then((r) => { if (r === 'cycle') toast.show('순서가 돌고 돌아서 이을 수 없어요', { error: true }) })}><Check size={20} color="#3fb950" /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="제안 무시" hitSlop={8} onPress={() => void dropLink(l)}><X size={20} color={p.textTertiary} /></Pressable>
          </View>
        ))}

        {view.rest.length ? (
          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            {view.chain.length ? <View style={s.ghead}><Text style={[s.gtitle, { color: p.textSecondary }]}>나머지 <Text style={{ color: p.textTertiary }}>{view.rest.length}</Text></Text></View> : null}
            {view.rest.map((t, i) => <MapTaskRow key={t.id} task={t} data={data} first={i === 0} />)}
          </View>
        ) : null}
        {!tasks.length ? <Text style={{ color: p.textTertiary, textAlign: 'center', marginTop: 40 }}>이 기간에 보이는 할 일이 없어요</Text> : null}
        <Text style={{ color: p.textTertiary, fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }}>할 일을 길게 누르면 다른 리스트로 옮기기 · 순서 잇기 · 목표 연결</Text>
      </ScrollView>
      <PopMenu anchor={more.rect} onClose={more.close} items={items} />
      <Dialog spec={dialog} onClose={() => setDialog(null)} />
    </View>
  )
}
const s = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingRight: 12 },
  back: { flexDirection: 'row', alignItems: 'center', maxWidth: '70%' },
  title: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 52 },
  titleText: { fontSize: 26, fontWeight: '700', flexShrink: 1 },
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  ghead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  gtitle: { fontSize: 14, fontWeight: '600' },
  numCol: { width: 22, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  vline: { position: 'absolute', width: 1.5 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sugg: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 12, paddingVertical: 10 }
})
