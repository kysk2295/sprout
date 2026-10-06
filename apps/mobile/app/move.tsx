// 이동 시트(21 §4.2, 시안 F-4): ✕ · "이동" · 검색 칸 · 기본함 + 리스트(지금 것 ✓) · 폴더 묶음 · + 리스트 추가
// 고르면 옮기고 토스트 "업무로 옮겼어요 ⟲"(받침 로/으로)
import { useLiveQuery } from '../src/data/rows'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, Inbox, Plus, Search } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFolders, useLists } from '../src/data/lists'
import { FolderGlyph, ListGlyph, listShow, splitLead } from '../src/ui/OrgIcons'
import { createList, moveToList } from '../src/data/tasks'
import { withRo } from '../src/lib/dates'
import { FONT, M } from '../src/theme/palette'
import { usePalette } from '../src/theme/ThemeProvider'
import { Cell, Cells } from '../src/ui/Cells'
import { SheetHead } from '../src/ui/SheetHead'
import { useToast } from '../src/ui/Toast'

export default function Move() {
  const { ids: raw } = useLocalSearchParams<{ ids: string }>()
  const ids = (raw ?? '').split(',').filter(Boolean)
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const lists = useLists()
  const folders = useFolders()
  const current = useLiveQuery<{ list_id: string }>(`SELECT DISTINCT list_id FROM tasks WHERE id IN (${ids.map(() => '?').join(',') || 'NULL'})`, ids).data
  const cur = current.length === 1 ? current[0].list_id : null
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const match = (n: string) => !q || n.toLowerCase().includes(q.toLowerCase())
  const pick = async (listId: string, label: string) => {
    const undo = await moveToList(ids, listId)
    router.back()
    toast.show(`${withRo(label)} 옮겼어요`, { undo })
  }
  // 30 §A.5: 리스트 = 이모지 또는 ≡, 폴더 = 이름 앞 이모지 또는 폴더 그림
  const icon = (l: { name: string; emoji: string | null }) => <ListGlyph list={l} />
  const check = (id: string) => (cur === id ? <Check size={16} color={p.accent} /> : null)
  const inbox = lists.find((l) => l.kind === 'inbox')
  const loose = lists.filter((l) => l.kind !== 'inbox' && (!l.folder_id || !folders.some((f) => f.id === l.folder_id)) && match(l.name))
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* iOS formSheet는 ScrollView를 시트 맨 위에 붙인다 — 머리·검색을 형제로 두면 가려져서 안에 둔다 */}
        <SheetHead title="이동" />
      <View style={[s.search, { backgroundColor: p.cardBg }]}>
        <Search size={16} color={p.textTertiary} />
        <TextInput value={q} onChangeText={setQ} placeholder="검색" placeholderTextColor={p.textTertiary} style={[FONT.sub, { flex: 1, color: p.textPrimary }]} accessibilityLabel="리스트 검색" />
      </View>

        <Cells>
          {inbox && match('기본함') ? <Cell first label="기본함" icon={<Inbox size={22} color={p.slInbox} />} iconBg="transparent" chevron={false} right={check(inbox.id)} onPress={() => void pick(inbox.id, '기본함')} /> : null}
          {loose.map((l) => <Cell key={l.id} label={listShow(l).name} icon={icon(l)} iconBg="transparent" chevron={false} right={check(l.id)} onPress={() => void pick(l.id, l.name)} />)}
          {folders.map((f) => {
            const kids = lists.filter((l) => l.folder_id === f.id && match(l.name))
            if (!kids.length) return null
            return (
              <View key={f.id}>
                <Cell label={splitLead(f.name).name} icon={<FolderGlyph name={f.name} size={20} />} iconBg="transparent" chevron={false} />
                {kids.map((l) => <View key={l.id} style={{ paddingLeft: 24 }}><Cell label={listShow(l).name} icon={icon(l)} iconBg="transparent" chevron={false} right={check(l.id)} onPress={() => void pick(l.id, l.name)} /></View>)}
              </View>
            )
          })}
          {adding ? (
            <View style={s.addRow}>
              <Plus size={20} color={p.accent} />
              <TextInput
                autoFocus
                value={name}
                onChangeText={setName}
                placeholder="새 리스트 이름"
                placeholderTextColor={p.textTertiary}
                returnKeyType="done"
                onSubmitEditing={async () => { const n = name.trim(); if (!n) return setAdding(false); const id = await createList(n); await pick(id, n) }}
                style={[FONT.body, { flex: 1, color: p.textPrimary }]}
              />
            </View>
          ) : (
            <Cell label="리스트 추가" icon={<Plus size={20} color={p.accent} />} iconBg="transparent" chevron={false} onPress={() => setAdding(true)} />
          )}
        </Cells>
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  search: { height: 36, borderRadius: 10, marginHorizontal: M.cardInset, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  addRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }
})
