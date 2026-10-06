// 옮기기 시트(29 §4): 할 일 → 기본함 / 폴더 › 리스트 고르기. tasks.list_id를 바꾼다(공용 moveToList, 토스트에 되돌리기).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, Inbox } from 'lucide-react-native'
import { FolderGlyph, ListGlyph, listShow, splitLead } from '../../src/ui/OrgIcons'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { moveToList } from '../../src/data/tasks'
import { withRo } from '../../src/lib/dates'
import { useMapData, useMapOptions } from '../../src/map/data'
import { moveTargets, type MapList } from '../../src/map/logic'
import { usePalette } from '../../src/theme/ThemeProvider'
import { SheetHead } from '../../src/ui/SheetHead'
import { useToast } from '../../src/ui/Toast'

export default function MapMove() {
  const { task } = useLocalSearchParams<{ task: string }>()
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const [o] = useMapOptions()
  const data = useMapData(o)
  const current = data.byId.get(task)?.list_id ?? null
  const pick = async (l: MapList) => {
    const undo = await moveToList([task], l.id)
    router.back()
    toast.show(`${withRo(l.kind === 'inbox' ? '기본함' : l.name)} 옮겼어요`, { undo })
  }
  const row = (l: MapList, first: boolean, indent = false) => (
    <Pressable key={l.id} onPress={() => void pick(l)} accessibilityRole="button" style={({ pressed }) => [s.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }, indent && { paddingLeft: 30 }]}>
      {l.kind === 'inbox' ? <Inbox size={18} color={p.slInbox} /> : <ListGlyph list={l} size={16} />}
      <Text style={{ flex: 1, fontSize: 16, color: p.textPrimary }} numberOfLines={1}>{l.kind === 'inbox' ? '기본함' : listShow(l).name}</Text>
      {current === l.id ? <Check size={17} color={p.accent} /> : null}
    </Pressable>
  )
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.pageBg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <SheetHead title="다른 리스트로 옮기기" />
      {data.tree.inbox ? <View style={[s.card, { backgroundColor: p.cardBg }]}>{row(data.tree.inbox.list, true)}</View> : null}
      {moveTargets(data.tree).map((g) => (
        <View key={g.folder?.id ?? 'loose'} style={[s.card, { backgroundColor: p.cardBg }]}>
          {g.folder ? <View style={s.fhead}><FolderGlyph name={g.folder.name} size={16} /><Text style={{ color: p.textSecondary, fontSize: 14, fontWeight: '600' }}>{splitLead(g.folder.name).name}</Text></View> : null}
          {g.lists.map((l, i) => row(l, !g.folder && i === 0, !!g.folder))}
        </View>
      ))}
    </ScrollView>
  )
}
const s = StyleSheet.create({
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  fhead: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  row: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  dot: { width: 9, height: 9, borderRadius: 5, marginHorizontal: 4.5 }
})
