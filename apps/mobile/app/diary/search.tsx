// 28 §4 🔍 일기 검색: 글 부분 일치, 결과 = 날짜 행(기분 얼굴 · 날짜 · 첫 줄). 누르면 그날 쓰기.
import { useRouter } from 'expo-router'
import { ChevronLeft, Search } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MoodFace, PaperIcon, diaryColors } from '../../src/diary/art'
import { useEntries } from '../../src/diary/data'
import { dayTitle, previewOf, searchEntries } from '../../src/diary/logic'
import { openDay } from '../../src/diary/state'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'

export default function DiarySearch() {
  const p = usePalette()
  const c = diaryColors(p)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const entries = useEntries()
  const [q, setQ] = useState('')
  const found = useMemo(() => searchEntries(entries, q), [entries, q])
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg, paddingTop: insets.top }}>
      <View style={s.head}>
        <GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <View style={[s.box, { backgroundColor: p.cardBg }]}>
          <Search size={16} color={p.textTertiary} />
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder="일기 검색" placeholderTextColor={p.textTertiary} returnKeyType="search" accessibilityLabel="일기 검색" style={{ flex: 1, fontSize: 16, color: p.textPrimary }} />
        </View>
      </View>
      <FlatList
        data={found}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={q.trim() ? (
          <View style={s.empty}><Search size={36} color={p.textQuaternary} /><Text style={{ color: p.textTertiary, fontSize: 14 }}>'{q.trim()}'이(가) 들어간 일기가 없어요</Text></View>
        ) : null}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => { openDay(item.date); router.back() }} accessibilityRole="button" style={[s.row, { backgroundColor: p.cardBg }, index === 0 && s.first, index === found.length - 1 && s.last, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
            {item.mood ? <MoodFace mood={item.mood} size={26} /> : <PaperIcon size={26} paper={c.paper} line={p.textQuaternary} />}
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '600' }}>{item.date.slice(0, 4)}년 {dayTitle(item.date)}</Text>
              <Text style={{ color: p.textPrimary, fontSize: 14.5, lineHeight: 20 }} numberOfLines={2}>{previewOf(item, { search: true })}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  )
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 56 },
  box: { flex: 1, height: 38, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  first: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 }
})
