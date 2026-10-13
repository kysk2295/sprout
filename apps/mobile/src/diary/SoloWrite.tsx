// 28 §9 혼자 쓰기(L): 메모장처럼 쓰고 [저장]. 머리 ‹ · 날짜/임시 저장됨 · 💬(대화로) · 저장.
// 기분 한 줄(선택) · 제목(선택, 비우면 첫 줄이 제목) · 본문(열면 커서) · 키보드 위 도구(기분 · 한 일 · 질문 · 시각 · 키보드 내리기).
// AI 0회 — 혼자 쓴 장은 어디로도 보내지 않는다. 쓰는 중엔 1초 뒤 기기에 임시 저장(동기화 안 함), 저장하면 지운다.
// 저장 = 그날 글 끝에 ✎ 장을 이어 붙인다(앞 장을 덮지 않음). 고치기(index) = 그 장 자리에서 바꾼다.
import { ChevronLeft, ChevronDown, Clock, HelpCircle, ListChecks, MessageCircle } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { parseSections, type Section } from '@sprout/schema/diaryPrompts'
import { readJson, removeJson, writeJson } from '../collect/localStore'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { GlassButton, GlassGroup } from '../ui/Glass'
import { hx } from '../ui/haptics'
import { useToast } from '../ui/Toast'
import { MoodFace } from './art'
import { replaceSection, saveEntry, saveSection, useDayStats } from './data'
import { useKeyboardHeight, useKeyboardLift } from './keyboard'
import { dayTitle, MOODS, promptFor, type DiaryEntry } from './logic'
import { moodShort } from './talk'

type Draft = { title: string; body: string; index: number | null }
const draftKey = (date: string) => `diary-draft-${date}`
export const hasSoloDraft = (date: string) => { const d = readJson<Draft | null>(draftKey(date), null); return !!d && !!(d.title.trim() || d.body.trim()) }
/** 대화에서 넘어올 때 지금까지 내 답으로 새 장을 채워 둔다(이미 쓰던 임시 글이 있으면 그대로) */
export function seedSoloDraft(date: string, body: string) { if (body.trim() && !hasSoloDraft(date)) writeJson(draftKey(date), { title: '', body: body.trim(), index: null }) }
export const dropSoloDraft = (date: string) => removeJson(draftKey(date))
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** 종이색 — 라이트 크림, 다크는 카드 면 */
export const paperOf = (dark: boolean, card: string) => (dark ? card : '#FFFDF8')

export function SoloWrite({ date, entry, index, onBack, onChat, onSaved }: {
  date: string; entry: DiaryEntry | undefined
  /** 고칠 장(그날 글 안 순서). null = 새 장 */
  index: number | null
  onBack: () => void; onChat: () => void; onSaved: () => void
}) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const stats = useDayStats(date)
  const paper = paperOf(p.dark, p.cardBg)

  // 처음 값: 같은 장의 임시 글 → (고치기면) 그 장 → 빈 종이
  const fromDraft = useRef(false)
  const [init] = useState<Draft>(() => {
    const d = readJson<Draft | null>(draftKey(date), null)
    if (d && d.index === index) { fromDraft.current = true; return d }
    if (index !== null) { const sec = parseSections(entry?.content)[index]; if (sec) return { title: sec.title, body: sec.body, index } }
    return { title: '', body: '', index }
  })
  const [title, setTitle] = useState(init.title)
  const [body, setBody] = useState(init.body)
  const [status, setStatus] = useState<'new' | 'draft' | 'saving'>(fromDraft.current ? 'draft' : 'new')
  const latest = useRef<Draft>(init)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const keep = () => {
    clearTimeout(timer.current)
    const d = latest.current
    if (d.title.trim() || d.body.trim()) { writeJson(draftKey(date), d); setStatus('draft') } else removeJson(draftKey(date))
  }
  const edit = (patch: Partial<Draft>) => {
    latest.current = { ...latest.current, ...patch }
    if (patch.title !== undefined) setTitle(patch.title)
    if (patch.body !== undefined) setBody(patch.body)
    clearTimeout(timer.current)
    timer.current = setTimeout(keep, 1000)
  }
  // 떠날 때(뒤로·대화로·앱이 이 화면을 내림) 마지막 글을 남긴다 — 저장했으면 이미 지움
  const saved = useRef(false)
  useEffect(() => () => { if (!saved.current) keep() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const mood = entry?.mood ?? null
  const pickMood = (v: number) => { hx.tick(); setPop(null); void saveEntry(date, { mood: mood === v ? null : v }) }

  // 커서 자리에 넣기(한 일·질문·시각)
  const bodyRef = useRef<TextInput>(null)
  const sel = useRef({ start: init.body.length, end: init.body.length })
  const insert = (piece: string) => {
    hx.tick()
    const b = latest.current.body
    const at = Math.min(sel.current.start, b.length)
    const before = b.slice(0, at)
    const lead = !before ? '' : piece.endsWith('\n') ? (before.endsWith('\n') ? '' : '\n') : /\s$/.test(before) ? '' : ' '
    const next = before + lead + piece + b.slice(sel.current.end)
    const caret = at + lead.length + piece.length
    sel.current = { start: caret, end: caret }
    edit({ body: next })
    setPop(null)
    setTimeout(() => bodyRef.current?.focus(), 30)
  }
  const [shift, setShift] = useState(0)
  const ask = () => { insert(`${promptFor(date, shift)}\n`); setShift((n) => n + 1) }

  const [pop, setPop] = useState<'mood' | 'done' | null>(null)
  const kbH = useKeyboardHeight()
  const lift = useKeyboardLift(insets.bottom)
  const [barH, setBarH] = useState(50 + insets.bottom)
  const onBar = (e: LayoutChangeEvent) => setBarH(Math.round(e.nativeEvent.layout.height))
  const above = barH + Math.max(0, kbH - insets.bottom)

  const empty = !title.trim() && !body.trim()
  const save = async () => {
    if (empty || status === 'saving') return
    hx.success()
    setStatus('saving')
    clearTimeout(timer.current)
    const sec = index !== null ? parseSections(entry?.content)[index] : undefined
    const next: Section = { time: sec?.time ?? hhmm(), title: title.trim(), tags: sec?.tags ?? [], body: body.trim(), solo: true }
    try {
      if (index !== null && sec) await replaceSection(date, index, next)
      else await saveSection(date, next, null)
      saved.current = true
      removeJson(draftKey(date))
      Keyboard.dismiss()
      toast.show('저장했어요')
      onSaved()
    } catch {
      setStatus('draft')
      toast.show('저장하지 못했어요. 글은 그대로 있어요')
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: paper }}>
      <View style={[s.hdr, { marginTop: insets.top }]}>
        <GlassButton label="뒤로" onPress={onBack}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <View style={s.mid} accessible accessibilityLabel={`${dayTitle(date)}, 혼자 쓰기`}>
          <Text style={[s.midTitle, { color: p.textPrimary }]} numberOfLines={1}>{dayTitle(date)}</Text>
          <Text style={{ color: p.textTertiary, fontSize: 12 }}>{status === 'saving' ? '저장 중…' : status === 'draft' ? '임시 저장됨' : index !== null ? '고치는 중' : '혼자 쓰기'}</Text>
        </View>
        <GlassGroup>
          <GlassButton plain label="캐릭터와 이야기로" onPress={() => { keep(); onChat() }}><MessageCircle size={19} color={p.textPrimary} /></GlassButton>
        </GlassGroup>
        <Pressable accessibilityRole="button" accessibilityLabel="저장" accessibilityState={{ disabled: empty }} disabled={empty} onPress={() => void save()} style={[s.save, { backgroundColor: empty ? alpha(p.textTertiary, 0.18) : p.accent }]}>
          <Text style={{ color: empty ? p.textTertiary : p.onAccent, fontSize: 15, fontWeight: '700' }}>저장</Text>
        </Pressable>
      </View>

      <View style={s.moods} accessibilityRole="radiogroup" accessibilityLabel="기분(선택)">
        <Text style={{ color: p.textTertiary, fontSize: 12.5, marginRight: 2 }}>기분</Text>
        {MOODS.map((m) => (
          <Pressable key={m.value} accessibilityRole="radio" accessibilityLabel={m.label} accessibilityState={{ selected: mood === m.value }} onPress={() => pickMood(m.value)} hitSlop={4}
            style={[s.mf, mood === m.value && { borderColor: p.accent }]}>
            <MoodFace mood={m.value} size={28} faded={mood !== m.value} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={title}
        onChangeText={(v) => edit({ title: v.replace(/\n/g, '') })}
        placeholder="제목 (없어도 돼요)"
        placeholderTextColor={p.textQuaternary}
        accessibilityLabel="제목"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => bodyRef.current?.focus()}
        maxLength={60}
        style={[s.title, { color: p.textPrimary }]}
      />
      <TextInput
        ref={bodyRef}
        value={body}
        onChangeText={(v) => edit({ body: v })}
        onSelectionChange={(e) => { sel.current = e.nativeEvent.selection }}
        autoFocus
        multiline
        placeholder="오늘 하루를 편하게 적어요"
        placeholderTextColor={p.textQuaternary}
        accessibilityLabel="일기 글"
        textAlignVertical="top"
        style={[s.body, { color: p.textPrimary, marginBottom: above }]}
      />

      {pop ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(90)} style={[s.pop, { backgroundColor: p.sheetBg, bottom: above + 6, shadowOpacity: p.dark ? 0.5 : 0.15 }]}>
          {pop === 'mood' ? (
            <View style={s.popMoods}>
              {MOODS.map((m) => (
                <Pressable key={m.value} accessibilityRole="radio" accessibilityLabel={m.label} accessibilityState={{ selected: mood === m.value }} onPress={() => pickMood(m.value)} style={s.popMood}>
                  <MoodFace mood={m.value} size={38} faded={!!mood && mood !== m.value} />
                  <Text style={{ color: p.textSecondary, fontSize: 11.5 }}>{moodShort(m.value)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="always">
              {stats.doneTitles.length ? stats.doneTitles.map((t, i) => (
                <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${t} 넣기`} onPress={() => insert(`✓ ${t}\n`)} style={({ pressed }) => [s.doneRow, pressed && { backgroundColor: p.bgSelected }]}>
                  <Text style={{ color: p.accentInk, fontSize: 15, fontWeight: '700' }}>✓</Text>
                  <Text style={{ color: p.textPrimary, fontSize: 15, flex: 1 }} numberOfLines={1}>{t}</Text>
                </Pressable>
              )) : <Text style={{ color: p.textTertiary, fontSize: 14, padding: 14 }}>이 날 끝낸 할 일이 없어요</Text>}
            </ScrollView>
          )}
        </Animated.View>
      ) : null}

      <Animated.View onLayout={onBar} style={[s.bar, { paddingBottom: insets.bottom, backgroundColor: p.dark ? p.bgSelected : '#F6F3EC', borderTopColor: p.borderDivider }, lift]}>
        <View style={s.barRow}>
          <Tool label={mood ? '기분 바꾸기' : '기분'} on={pop === 'mood'} onPress={() => setPop((v) => (v === 'mood' ? null : 'mood'))}>
            {mood ? <MoodFace mood={mood} size={22} /> : <View style={{ opacity: 0.5 }}><MoodFace mood={3} size={22} faded /></View>}
            <Text style={[s.tl, { color: p.textSecondary }]}>기분</Text>
          </Tool>
          <Tool label="오늘 끝낸 할 일 넣기" on={pop === 'done'} onPress={() => setPop((v) => (v === 'done' ? null : 'done'))}>
            <ListChecks size={18} color={p.textSecondary} /><Text style={[s.tl, { color: p.textSecondary }]}>한 일</Text>
          </Tool>
          <Tool label="질문 넣기" onPress={ask}><HelpCircle size={18} color={p.textSecondary} /><Text style={[s.tl, { color: p.textSecondary }]}>질문</Text></Tool>
          <Tool label="지금 시각 넣기" onPress={() => insert(`${hhmm()} `)}><Clock size={18} color={p.textSecondary} /><Text style={[s.tl, { color: p.textSecondary }]}>시각</Text></Tool>
          {kbH ? <Tool label="키보드 내리기" onPress={() => { setPop(null); keep(); Keyboard.dismiss() }}><ChevronDown size={20} color={p.accentInk} /></Tool> : null}
        </View>
      </Animated.View>
    </View>
  )
}

function Tool({ label, on, onPress, children }: { label: string; on?: boolean; onPress: () => void; children: React.ReactNode }) {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.tool, (on || pressed) && { backgroundColor: alpha(p.accent, 0.12) }]}>
      {children}
    </Pressable>
  )
}

const s = StyleSheet.create({
  hdr: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  mid: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  midTitle: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  save: { height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  moods: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingTop: 6, height: 46 },
  mf: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, paddingHorizontal: 18, paddingVertical: 8 },
  body: { flex: 1, fontSize: 17, lineHeight: 29, paddingHorizontal: 18, paddingTop: 2 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
  barRow: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6 },
  tool: { minWidth: 44, height: 40, borderRadius: 12, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  tl: { fontSize: 13, fontWeight: '600' },
  pop: { position: 'absolute', left: 8, right: 8, borderRadius: 20, paddingVertical: 6, shadowColor: '#000', shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  popMoods: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
  popMood: { alignItems: 'center', gap: 4, minWidth: 56, paddingVertical: 4 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14 }
})
