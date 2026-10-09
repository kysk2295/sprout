// 태그 시트(21 §5 · 20 M3 — 태그는 v1에서 붙이고 뗄 수 있다): 검색/새 태그 칸 + 태그 목록(체크 = 붙음). 누르면 바로 반영.
// 33 §11: 체크 = accepted만, 끄면 자동 태그는 dismissed(다시 안 붙음), 켜면 user. 종류 아이콘(👤🚀📍)
import { useLiveQuery } from '../src/data/rows'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, Hash, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTagsFull } from '../src/data/organization'
import { tagShow } from '../src/data/emojiLead'
import { createTag, setTag } from '../src/data/tasks'
import { FONT, M } from '../src/theme/palette'
import { usePalette } from '../src/theme/ThemeProvider'
import { Cell, Cells } from '../src/ui/Cells'
import { SheetHead } from '../src/ui/SheetHead'

export default function Tags() {
  const { ids: raw } = useLocalSearchParams<{ ids: string }>()
  const ids = (raw ?? '').split(',').filter(Boolean)
  const p = usePalette()
  const router = useRouter()
  const tags = useTagsFull()
  const on = useLiveQuery<{ tag_id: string; n: number }>(`SELECT tag_id, count(DISTINCT task_id) AS n FROM task_tags WHERE task_id IN (${ids.map(() => '?').join(',') || 'NULL'}) AND COALESCE(state,'accepted') = 'accepted' GROUP BY tag_id`, ids).data
  const all = new Set(on.filter((r) => r.n === ids.length).map((r) => r.tag_id))
  const [q, setQ] = useState('')
  const shown = tags.filter((t) => !q || t.name.toLowerCase().includes(q.trim().replace(/^#/, '').toLowerCase()))
  const name = q.trim().replace(/^#/, '')
  const exact = tags.some((t) => t.name === name)
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* iOS formSheet는 ScrollView를 시트 맨 위에 붙인다 — 머리·검색을 형제로 두면 가려져서 안에 둔다 */}
        <SheetHead title="태그" onDone={() => router.back()} />
      <View style={[s.search, { backgroundColor: p.cardBg }]}>
        <Hash size={16} color={p.textTertiary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="태그 찾기 또는 새로 만들기"
          placeholderTextColor={p.textTertiary}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={async () => { if (name && !exact) { const id = await createTag(name); await setTag(ids, id, true); setQ('') } }}
          style={[FONT.sub, { flex: 1, color: p.textPrimary }]}
          accessibilityLabel="태그 이름"
        />
      </View>

        <Cells>
          {name && !exact ? (
            <Cell first label={`"${name}" 태그 만들기`} icon={<Plus size={20} color={p.accent} />} iconBg="transparent" chevron={false} onPress={async () => { const id = await createTag(name); await setTag(ids, id, true); setQ('') }} />
          ) : null}
          {shown.map((t, i) => (
            <Cell
              key={t.id}
              first={i === 0 && !(name && !exact)}
              label={tagShow(t).name}
              icon={tagShow(t).emoji ? <Text style={{ fontSize: 16 }}>{tagShow(t).emoji}</Text> : <Hash size={18} color={t.color ?? p.textSecondary} />}
              iconBg="transparent"
              chevron={false}
              right={all.has(t.id) ? <Check size={18} color={p.accent} /> : null}
              onPress={() => void setTag(ids, t.id, !all.has(t.id))}
            />
          ))}
          {!shown.length && !name ? <Cell first label="태그가 없어요 — 위 칸에 이름을 적어 만드세요" chevron={false} /> : null}
        </Cells>
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  search: { height: 36, borderRadius: 10, marginHorizontal: M.cardInset, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }
})
