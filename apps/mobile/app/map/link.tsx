// 잇기 시트(29 §4): kind=sequence → "다음에 할 일 고르기"(이 할 일 → 고른 할 일, 고리면 거부) · kind=goal → 이번 주 목표와 연결
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, Search, Target } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { connect, useMapData, useMapOptions } from '../../src/map/data'
import { pathOf } from '../../src/map/logic'
import { usePalette } from '../../src/theme/ThemeProvider'
import { SheetHead } from '../../src/ui/SheetHead'
import { useToast } from '../../src/ui/Toast'

export default function MapLink() {
  const { task, kind } = useLocalSearchParams<{ task: string; kind: 'sequence' | 'goal' }>()
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const [o] = useMapOptions()
  const data = useMapData({ ...o, period: 'all' })
  const [q, setQ] = useState('')
  const me = data.byId.get(task)
  const myList = me?.list_id ?? null
  const linked = new Set(data.links.filter((l) => l.state === 'accepted' && l.kind === kind && (kind === 'goal' ? l.to_id === task : l.from_id === task)).map((l) => (kind === 'goal' ? l.from_id : l.to_id)))
  // 같은 리스트 할 일을 먼저
  const candidates = useMemo(() => data.tasks
    .filter((t) => t.id !== task && t.status === 0 && (!q || t.title.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(b.list_id === myList) - Number(a.list_id === myList)), [data, task, q, myList])

  const pick = async (from: string, to: string, label: string) => {
    const r = await connect(kind, from, to)
    if (r === 'cycle') { toast.show('순서가 돌고 돌아서 이을 수 없어요', { error: true }); return }
    router.back()
    toast.show(kind === 'goal' ? `🎯 '${label}'에 연결했어요` : `'${label}'을(를) 다음에 하도록 이었어요`)
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.pageBg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <SheetHead title={kind === 'goal' ? '목표와 연결' : '다음에 할 일 고르기'} />
      {me ? <Text style={{ color: p.textTertiary, fontSize: 13, paddingHorizontal: 20, marginBottom: 8 }} numberOfLines={2}>{kind === 'goal' ? `'${me.title}'을(를) 이번 주 목표와 이어요` : `'${me.title}' 다음에 할 일을 골라요`}</Text> : null}
      {kind === 'goal' ? (
        <View style={[s.card, { backgroundColor: p.cardBg }]}>
          {data.goals.map((g, i) => (
            <Pressable key={g.id} onPress={() => void pick(g.id, task, g.title)} accessibilityRole="button" style={({ pressed }) => [s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
              <Target size={17} color="#e8a23a" />
              <Text style={{ flex: 1, fontSize: 16, color: p.textPrimary }} numberOfLines={1}>{g.title}</Text>
              {linked.has(g.id) ? <Check size={17} color={p.accent} /> : null}
            </Pressable>
          ))}
          {!data.goals.length ? <Text style={{ color: p.textTertiary, padding: 16 }}>이번 주 목표가 없어요. 성장 탭에서 목표를 정해 보세요</Text> : null}
        </View>
      ) : (
        <>
          <View style={[s.search, { backgroundColor: p.cardBg }]}>
            <Search size={16} color={p.textTertiary} />
            <TextInput value={q} onChangeText={setQ} placeholder="할 일 검색" placeholderTextColor={p.textTertiary} style={{ flex: 1, fontSize: 15, color: p.textPrimary }} accessibilityLabel="할 일 검색" />
          </View>
          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            {candidates.slice(0, 80).map((t, i) => (
              <Pressable key={t.id} onPress={() => void pick(task, t.id, t.title)} accessibilityRole="button" style={({ pressed }) => [s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: p.textPrimary }} numberOfLines={1}>{t.title}</Text>
                  <Text style={{ fontSize: 12, color: p.textTertiary }} numberOfLines={1}>{pathOf(data.folders, data.lists, t.list_id) ?? ''}</Text>
                </View>
                {linked.has(t.id) ? <Check size={17} color={p.accent} /> : null}
              </Pressable>
            ))}
            {!candidates.length ? <Text style={{ color: p.textTertiary, padding: 16 }}>고를 할 일이 없어요</Text> : null}
          </View>
        </>
      )}
    </ScrollView>
  )
}
const s = StyleSheet.create({
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginBottom: 10, height: 38, borderRadius: 12, paddingHorizontal: 10 }
})
