// 33 §11 상세 태그 줄: 칩 전부(accepted) + `+`. 자동 태그(rule·ai)는 이름 앞 작은 ✦, 칩 오른쪽 ✕ = 떼기
// (직접 붙인 것은 삭제, 자동·링크는 dismissed — 다시 안 붙음) + 토스트 ⟲. 칩 이름을 누르면 태그 페이지.
import { useLiveQuery } from '../data/rows'
import { useRouter } from 'expo-router'
import { Plus, X } from 'lucide-react-native'
import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'
import { useToast } from '../ui/Toast'
import { isAuto, removeTaskTags } from './data'
import { KindGlyph } from './RowBits'
import { tagShow } from '../data/emojiLead'
import { openView } from './WikiIndex'

type Row = { id: string; name: string; color: string | null; kind: string | null; source: string | null; confidence: number | null }

export function DetailTags({ taskId, onAdd }: { taskId: string; onAdd: () => void }) {
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const rows = useLiveQuery<Row>(
    `SELECT g.id, g.name, g.color, g.kind, tt.source, tt.confidence FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
     WHERE tt.task_id = ? AND COALESCE(tt.state,'accepted') = 'accepted' ORDER BY g.sort_order, g.name`, [taskId]
  ).data
  // 같은 태그가 직접·링크·자동으로 겹치면 하나로 — 하나라도 사람 쪽이면 ✦ 없음
  const tags = useMemo(() => {
    const m = new Map<string, Row & { auto: boolean }>()
    for (const r of rows) {
      const cur = m.get(r.id)
      m.set(r.id, { ...r, auto: (cur ? cur.auto : true) && isAuto(r.source) })
    }
    return [...m.values()]
  }, [rows])
  if (!tags.length) return null
  const remove = async (t: (typeof tags)[number]) => {
    const undo = await removeTaskTags([taskId], t.id)
    toast.show('태그를 뗐어요', { undo })
  }
  return (
    <View style={s.wrap}>
      {tags.map((t) => (
        <View key={t.id} style={[s.chip, { backgroundColor: p.accentSubtle }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.auto ? 'AI가 붙인 ' : ''}태그 ${t.name} 페이지`} onPress={() => openView(router, `tag:${t.id}`)} style={s.name}>
            {t.auto ? <Text style={[s.ai, { color: p.accentInk }]}>✦</Text> : null}
            <KindGlyph kind={t.kind} name={t.name} size={12} color={p.accent} />
            <Text style={{ color: p.accentInk, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{tagShow(t).name}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`태그 ${t.name} 떼기`} hitSlop={8} onPress={() => void remove(t)} style={s.x}>
            <X size={13} color={p.accent} />
          </Pressable>
        </View>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="태그 더하기" onPress={onAdd} style={[s.add, { borderColor: p.borderDivider }]}>
        <Plus size={14} color={p.textTertiary} />
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { height: 28, borderRadius: 14, paddingLeft: 10, paddingRight: 4, flexDirection: 'row', alignItems: 'center' },
  name: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 28, maxWidth: 220 },
  ai: { fontSize: 10, lineHeight: 14, marginRight: 1 },
  x: { width: 22, height: 28, alignItems: 'center', justifyContent: 'center' },
  add: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }
})
