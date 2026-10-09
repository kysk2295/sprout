// 41 §8 · §2 휴대폰 `＋ 새 프로젝트` 아래 시트: 제목 `새 프로젝트` · 입력칸(인식한 날짜 글자 강조) · 미리보기 줄 · 날짜 이름 칩(날짜를 읽었을 때만) ·
// `이럴 때 써요`(짧은 글, 누르면 입력칸을 채움) + 안 쓸 때 한 줄 · 접힌 `팀원 · 아이콘 ›` · `만들기`.
// 만들면 생기는 것은 태그 + (날짜가 있으면) ⚑ 할 일 하나뿐(projectDirect createProjectLine). AI는 부르지 않는다.
import { keyWordChips, parseProjectLine } from '@sprout/schema/planView'
import { splitPeople } from '@sprout/schema/projectScore'
import { ChevronRight } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { dayKey } from '../../lib/dates'
import { alpha } from '../../theme/palette'
import { usePalette } from '../../theme/ThemeProvider'
import { BottomSheet } from '../../ui/BottomSheet'
import { SheetHead } from '../../ui/SheetHead'
import { useToast } from '../../ui/Toast'
import { createProjectLine } from './projectDirect'
import { linePreview, PROJECT_EXAMPLES, PROJECT_NOT_FOR } from './projectDirectModel'

export function NewProjectSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (tagId: string) => void }) {
  const p = usePalette()
  const toast = useToast()
  const today = dayKey()
  const [raw, setRaw] = useState('')
  const [word, setWord] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [team, setTeam] = useState('')
  const [emoji, setEmoji] = useState('')
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const input = useRef<TextInput>(null)
  useEffect(() => { if (!visible) { setRaw(''); setWord(null); setMore(false); setTeam(''); setEmoji(''); setSel(undefined) } }, [visible])
  const line = parseProjectLine(raw, today, word)
  const pv = linePreview(line, today, emoji || null)
  const fill = (s: string) => { setRaw(s); setSel({ start: s.length, end: s.length }); input.current?.focus() }
  const save = async () => {
    if (!line.name || busy) return
    setBusy(true)
    try {
      const people = splitPeople(team)
      const r = await createProjectLine({ name: line.name, emoji: emoji || line.emoji || (line.icon !== '🚀' ? line.icon : null), day: line.day, word: line.word, team: people })
      toast.show(`'${line.name}' 프로젝트를 만들었어요${people.length ? ` · 팀원 ${people.length}명` : ''}`, { undo: r.undo, duration: 5000 })
      onCreated(r.tagId)
    } catch {
      toast.show('프로젝트를 만들지 못했어요. 다시 시도해 주세요.', { error: true })
    } finally { setBusy(false) }
  }
  const hl = line.token && line.tokenAt >= 0
  return (
    <BottomSheet visible={visible} onClose={onClose} mid={0.78} label="새 프로젝트" head={<SheetHead compact title="새 프로젝트" onClose={onClose} />}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={[s.field, { backgroundColor: p.bgInput }]}>
          <TextInput ref={input} value={raw} autoFocus placeholder="예: 투자자산운용사 시험 11/23" placeholderTextColor={p.textQuaternary}
            onChangeText={(v) => { setRaw(v); setSel(undefined) }} selection={sel} onSelectionChange={() => sel && setSel(undefined)}
            submitBehavior="submit" returnKeyType="done" onSubmitEditing={() => void save()}
            style={[s.input, { color: p.textPrimary }]} accessibilityLabel="새 프로젝트" />
          {hl ? (
            <Text style={[s.input, s.overlay, { color: 'transparent' }]} pointerEvents="none" accessible={false} numberOfLines={1}>
              {raw.slice(0, line.tokenAt)}
              <Text style={{ backgroundColor: alpha(p.accent, p.dark ? 0.3 : 0.16) }}>{line.token}</Text>
              {raw.slice(line.tokenAt + line.token!.length)}
            </Text>
          ) : null}
        </View>

        <Text style={[s.prev, { color: p.textTertiary }]} accessibilityLiveRegion="polite">
          {pv.empty ? (raw.trim() ? pv.text : '이름과 날짜를 한 줄로 적어요') : (
            <>
              <Text style={{ color: p.textPrimary, fontWeight: '600' }}>{pv.head}</Text>
              {pv.key ? <> · <Text style={{ color: p.textSecondary }}>{pv.key}</Text> · {pv.dday}</> : ` · ${pv.note}`}
            </>
          )}
        </Text>

        {line.day ? (
          <View style={s.chips}>
            {keyWordChips(line.starter.word).map((w) => {
              const on = w === line.word
              return (
                <Pressable key={w} onPress={() => setWord(w)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`날짜 이름 ${w}`}
                  style={[s.chip, { backgroundColor: on ? p.accentSubtle : p.bgSelected }]}>
                  <Text style={{ color: on ? p.accentInk : p.textSecondary, fontSize: 13.5, fontWeight: on ? '600' : '400' }}>{w}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        <View style={[s.guide, { borderTopColor: p.borderDivider }]}>
          <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>이럴 때 써요</Text>
          <View style={s.chips}>
            {PROJECT_EXAMPLES.map((e) => (
              <Pressable key={e.label} onPress={() => fill(e.fill)} accessibilityRole="button" accessibilityHint={`입력칸을 '${e.fill.trim()}'로 채워요`}
                style={({ pressed }) => [s.ex, { borderColor: p.borderDivider, backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
                <Text style={{ color: p.textPrimary, fontSize: 12.5 }}>{e.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: p.textTertiary, fontSize: 11.5, marginTop: 8 }}>{PROJECT_NOT_FOR}</Text>
        </View>

        {more ? (
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={[s.field, s.row, { backgroundColor: p.bgInput }]}>
              <Text style={{ color: p.textTertiary, fontSize: 14, width: 44 }}>팀원</Text>
              <TextInput value={team} onChangeText={setTeam} placeholder="예: 민수, 지은" placeholderTextColor={p.textQuaternary}
                style={[s.input, { flex: 1, color: p.textPrimary }]} accessibilityLabel="팀원" />
            </View>
            {/* 30 §A.2 휴대폰 이모지 칸(리스트 편집과 같음 — 시스템 이모지 키보드) */}
            <View style={[s.field, s.row, { backgroundColor: p.bgInput }]}>
              <Text style={{ color: p.textTertiary, fontSize: 14, width: 44 }}>아이콘</Text>
              <TextInput value={emoji} onChangeText={(v) => setEmoji(Array.from(v).slice(-1).join(''))} placeholder={line.icon} placeholderTextColor={p.textQuaternary}
                style={[s.input, { width: 60, color: p.textPrimary }]} accessibilityLabel="아이콘 이모지" />
            </View>
          </View>
        ) : null}

        <View style={s.foot}>
          {!more ? (
            <Pressable onPress={() => setMore(true)} accessibilityRole="button" hitSlop={8} style={s.more}>
              <Text style={{ color: p.textSecondary, fontSize: 14 }}>팀원 · 아이콘</Text>
              <ChevronRight size={15} color={p.textTertiary} />
            </Pressable>
          ) : <View />}
          <Pressable onPress={() => void save()} disabled={!line.name || busy} accessibilityRole="button" accessibilityState={{ disabled: !line.name || busy }}
            style={[s.make, { backgroundColor: p.accent, opacity: !line.name || busy ? 0.4 : 1 }]}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>만들기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  field: { height: 44, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { fontSize: 16, paddingVertical: 0 },
  overlay: { position: 'absolute', left: 12, right: 12 },
  prev: { fontSize: 12.5, marginTop: 10, marginHorizontal: 2, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
  guide: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 12 },
  ex: { borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 9, paddingVertical: 5 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  make: { height: 40, borderRadius: 20, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' }
})
