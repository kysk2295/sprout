// 빠른 입력 — 기초판. 22(키보드 위 카드 · 하이라이트 · 도구 막대 · 날짜 칩)는 다음 작업이 이 경로를 바꿔 만든다.
// 지금 되는 것: + → 키보드 위 카드, "무엇을 할까요?", 데스크톱과 같은 한국어 자연어 인식(@sprout/schema/recognition), 보내기.
// 기본값은 지금 보기 조건(오늘에서 열면 마감 오늘·기본함, 리스트에서 열면 그 리스트 — 02 §4).
import { recognize } from '@sprout/schema/recognition'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowUp, Calendar } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLists, useTags } from '../src/data/lists'
import { createTask } from '../src/data/tasks'
import { newTaskDefaults } from '../src/data/views'
import { dayKey, rowDateLabel } from '../src/lib/dates'
import { FONT } from '../src/theme/palette'
import { usePalette } from '../src/theme/ThemeProvider'

export default function QuickAdd() {
  const { view = 'smart:today' } = useLocalSearchParams<{ view?: string }>()
  const p = usePalette()
  const router = useRouter()
  const lists = useLists()
  const tags = useTags()
  const [text, setText] = useState('')
  const inbox = lists.find((l) => l.kind === 'inbox')
  const today = dayKey()
  const r = useMemo(() => recognize(text, lists, tags), [text, lists, tags])
  const defaults = newTaskDefaults(view, inbox?.id ?? '', today)
  const due = r.due_at ?? defaults.due_at
  const chip = due ? rowDateLabel({ due_at: due }, today)?.label : null
  const send = async () => {
    if (!r.title || !inbox) return
    await createTask({ title: r.title, list_id: r.list_id ?? defaults.list_id, due_at: due, priority: r.priority, tag_ids: r.tag_ids, repeat_rule: r.repeat_rule })
    router.back()
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }]} onPress={() => router.back()} accessibilityLabel="닫기" />
      <View style={{ flex: 1 }} pointerEvents="box-none" />
      <View style={[s.card, { backgroundColor: p.bgPopover }]}>
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder="무엇을 할까요?"
          placeholderTextColor={p.textTertiary}
          multiline
          blurOnSubmit
          returnKeyType="send"
          onSubmitEditing={send}
          style={[FONT.body, s.input, { color: p.textPrimary }]}
          accessibilityLabel="할 일 제목"
        />
        <View style={s.bar}>
          <View style={[s.chip, { backgroundColor: chip ? p.accentSubtle : p.bgInput }]}>
            <Calendar size={14} color={chip ? p.accent : p.textSecondary} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: chip ? p.accent : p.textSecondary }}>{chip ?? '날짜'}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="추가" disabled={!r.title} onPress={send} style={[s.send, { backgroundColor: r.title ? p.accent : p.bgSelected }]}>
            <ArrowUp size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
const s = StyleSheet.create({
  card: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  input: { maxHeight: 110, minHeight: 28 },
  bar: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  chip: { height: 28, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }
})
