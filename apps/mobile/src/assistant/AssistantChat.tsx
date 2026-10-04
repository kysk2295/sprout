// 27 D1·D2 대화 본문 — 전체 화면(app/assistant)과 반 시트(AssistantSheet)가 같이 쓴다.
// 내 말 = 오른쪽 회색 면 · AI = 왼쪽 ✦ 원 + 본문 · 결과 카드(할 일 행: 체크 = 완료(XP) · 누름 = 상세) · 집계 카드 · ↶ 되돌리기
// · 받는 중(글자 + 깜빡이는 커서, 단계 줄 `● 연결 › ● 해석 › ● 확인 · N초`, 대기열이면 `순서를 기다리는 중…`) · 오류 상자(13 §6 문구)
// · ↓ 최신으로 · 입력창(1줄 44 → 최대 6줄, Return = 보내기, 처리 중 = ■ 정지)
import { useQuery } from '@powersync/react-native'
import { useRouter } from 'expo-router'
import { ArrowDown, ArrowUp, BarChart3, CalendarDays, Check, List, RefreshCw, RotateCcw, Sparkles, Square, TriangleAlert } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { completeTasks } from '../data/tasks'
import { dayKey, rowDateLabel } from '../lib/dates'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { Checkbox } from '../ui/Checkbox'
import { OFFLINE, type AssistantProgress, type AssistantResult } from './core'
import { cancel, refresh, send, setDraft, undo, type AssistantState, type Message } from './store'

/** "2026-10-05 ~ 2026-10-11" → "10/5–10/11" */
const shortRange = (range: string) => range.split(' ~ ').map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join('–')
const SUGGESTIONS: [typeof CalendarDays, string][] = [[CalendarDays, '내일 오후 3시에 기획 회의 한 시간 잡아줘'], [List, '이번 주 남은 할 일 보여줘'], [BarChart3, '이번 주에 완료한 거 몇 개야?']]
const STEPS: { key: AssistantProgress['phase'][]; label: string }[] = [{ key: ['connecting'], label: '연결' }, { key: ['generating'], label: '해석' }, { key: ['validating', 'saving', 'querying'], label: '확인' }]

/** 머리 상태 알약(13 §2.1): 연결됨(초록) · 대기 중 · 앞에 N명(주황) · 연결 중… · 지금은 쓸 수 없어요(회색). 누르면 다시 연결 */
export function StatusPill({ a }: { a: AssistantState }) {
  const p = usePalette()
  const waiting = a.busy && (a.progress.queue ?? 0) > 0
  const state = a.connecting || waiting ? 'wait' : a.models.length ? 'ok' : 'off'
  const color = state === 'ok' ? '#2fb36b' : state === 'wait' ? '#f29a2e' : p.textTertiary
  const label = a.connecting ? '연결 중…' : waiting ? `대기 중 · 앞에 ${a.progress.queue}명` : a.models.length ? '연결됨' : '지금은 쓸 수 없어요'
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, 다시 연결`} disabled={a.connecting || a.busy} onPress={() => void refresh()} style={[s.pill, { backgroundColor: p.bgSelected }]}>
      <View style={[s.pillDot, { backgroundColor: color }]} />
      <Text style={[s.pillText, { color: state === 'off' ? p.textTertiary : p.textSecondary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

export function AssistantChat({ a, variant, autoFocus }: { a: AssistantState; variant: 'full' | 'sheet'; autoFocus?: boolean }) {
  const p = usePalette()
  const scroll = useRef<ScrollView>(null)
  const follow = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!a.busy) return; const tick = () => setElapsed(Math.floor((Date.now() - a.started) / 1000)); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t) }, [a.busy, a.started])
  useEffect(() => { if (a.cooldownUntil <= Date.now()) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [a.cooldownUntil])
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(t) }, [notice])
  useEffect(() => { if (follow.current) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true })) }, [a.messages, a.busy, a.progress, a.error])
  const latest = () => { follow.current = true; setShowLatest(false); scroll.current?.scrollToEnd({ animated: true }) }
  // ↓ 최신으로는 맨 아래에서 70 넘게 떨어졌을 때만. 반 시트가 커지는 동안(높이만 바뀌고 스크롤 이벤트는 없음)에도 다시 잰다
  const box = useRef({ content: 0, view: 0, y: 0 })
  const measure = () => {
    const { content, view, y } = box.current
    follow.current = content - y - view < 70
    setShowLatest(!follow.current)
  }
  const submit = async (text = a.draft) => {
    if (a.busy || !a.model || !text.trim()) return
    if (text === a.draft) setDraft('')
    latest()
    await send(text)
  }
  const doUndo = async (m: Message) => {
    try { await undo(m.id); setNotice('등록을 되돌렸어요') } catch (e) { setNotice(e instanceof Error ? e.message : '되돌리지 못했어요.') }
  }
  const phaseIndex = STEPS.findIndex((st) => st.key.includes(a.progress.phase))
  const cooling = a.cooldownUntil > now
  const left = Math.ceil((a.cooldownUntil - now) / 1000)

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 14 }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          box.current = { content: contentSize.height, view: layoutMeasurement.height, y: contentOffset.y }
          measure()
        }}
        onLayout={(e) => {
          const wasFollowing = follow.current
          box.current.view = e.nativeEvent.layout.height
          if (wasFollowing) { scroll.current?.scrollToEnd({ animated: false }); follow.current = true; setShowLatest(false) } else measure()
        }}
        onContentSizeChange={(_, h) => { box.current.content = h; if (!follow.current) measure() }}
        scrollEventThrottle={100}
        accessibilityLabel="AI 대화 기록"
      >
        {!a.messages.length ? (
          <Ai>
            <Text style={[s.text, { color: p.textSecondary }]}>할 일을 말로 등록하거나, 내 일정과 완료 기록을 물어보세요.</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {SUGGESTIONS.slice(0, variant === 'sheet' ? 2 : 3).map(([Icon, text]) => (
                <Pressable key={text} accessibilityRole="button" disabled={a.busy || !a.model} onPress={() => void submit(text)} style={({ pressed }) => [s.ex, { borderColor: p.borderDivider, backgroundColor: pressed ? p.bgSelected : p.cardBg }, (!a.model || a.busy) && { opacity: 0.5 }]}>
                  <Icon size={16} color={p.accent} />
                  <Text style={[FONT.sub, { color: p.textPrimary, flex: 1 }]}>{text}</Text>
                </Pressable>
              ))}
            </View>
          </Ai>
        ) : null}
        {a.messages.map((m) => m.role === 'user' ? (
          <View key={m.id} style={[s.me, { backgroundColor: p.dark ? '#2c2c2e' : '#ececf0' }]}><Text style={[s.text, { color: p.textPrimary }]}>{m.text}</Text></View>
        ) : (
          <Ai key={m.id}>
            <Text style={[s.text, { color: p.textPrimary }]} selectable>{m.result?.stats ? `완료한 항목은 ${m.result.stats.count}개, 일정 길이 합계는 ${m.result.stats.hours}시간이에요.` : m.text}</Text>
            {m.result ? <ResultCard r={m.result} /> : null}
            {m.result?.created ? (
              <Pressable accessibilityRole="button" onPress={() => void doUndo(m)} style={s.undo} hitSlop={6}>
                <RotateCcw size={15} color={p.accent} /><Text style={[FONT.sub, { color: p.accent, fontWeight: '600' }]}>되돌리기</Text>
              </Pressable>
            ) : null}
          </Ai>
        ))}
        {a.busy ? (
          <Ai>
            {a.progress.preview ? <Text style={[s.text, { color: p.textPrimary }]}>{a.progress.preview}<Caret /></Text> : (
              <Text style={[s.text, { color: p.textSecondary }]}>{(a.progress.queue ?? 0) > 0 ? `순서를 기다리는 중… (앞에 ${a.progress.queue}명)` : a.progress.phase === 'connecting' ? 'sprout AI에 연결하는 중…' : '생각하는 중…'}</Text>
            )}
            <View style={s.steps} accessibilityRole="progressbar">
              {STEPS.map((st, i) => (
                <Text key={st.label} style={[s.step, { color: i <= phaseIndex ? p.accent : p.textQuaternary }]}>{i > 0 ? <Text style={{ color: p.textQuaternary }}>{' › '}</Text> : null}● {st.label}</Text>
              ))}
              <Text style={[s.step, { color: p.textTertiary }]}> · {elapsed}초</Text>
            </View>
          </Ai>
        ) : null}
        {a.error && !a.busy ? (
          <View style={[s.err, { backgroundColor: p.dark ? '#2a2a2c' : '#f2f2f5' }]} accessibilityRole="alert">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TriangleAlert size={16} color={p.textSecondary} style={{ marginTop: 2 }} />
              <Text style={[FONT.sub, { color: p.textPrimary, flex: 1 }]}>{a.error}</Text>
            </View>
            {a.error === OFFLINE && !a.models.length ? <Text style={[FONT.meta, { color: p.textTertiary }]}>1분 뒤 저절로 다시 확인해요</Text> : null}
            <View style={s.errActs}>
              {a.lastRequest ? <Btn label={cooling ? `다시 시도 · ${left}초` : '다시 시도'} icon={<RefreshCw size={14} color={p.textPrimary} />} disabled={a.busy || cooling || !a.model} onPress={() => void submit(a.lastRequest)} /> : null}
              {a.lastRequest ? <Btn label="입력으로 가져오기" onPress={() => setDraft(a.lastRequest)} /> : null}
              {!a.models.length ? <Btn label="다시 연결" disabled={a.connecting} onPress={() => void refresh()} /> : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
      {showLatest ? (
        <Pressable accessibilityRole="button" onPress={latest} style={[s.latest, { backgroundColor: p.bgPopover, borderColor: p.borderDivider }]}>
          <ArrowDown size={14} color={p.textPrimary} /><Text style={[FONT.meta, { color: p.textPrimary, fontWeight: '600' }]}>최신으로</Text>
        </Pressable>
      ) : null}
      {notice ? <Text style={[s.notice, { backgroundColor: p.toastBg }]}>{notice}</Text> : null}
      <Composer a={a} autoFocus={autoFocus} onSubmit={() => void submit()} />
      {variant === 'full' ? <Text style={[s.foot, { color: p.textTertiary }]}>sprout AI는 운영자의 Mac mini에서 돌아가요 · 결과는 카드에서 되돌릴 수 있어요</Text> : null}
    </View>
  )
}

function Ai({ children }: { children: ReactNode }) {
  const p = usePalette()
  return (
    <View style={s.ai}>
      <View style={[s.who, { backgroundColor: p.accentSubtle }]}><Sparkles size={15} color={p.accent} /></View>
      <View style={{ flex: 1, gap: 8, minWidth: 0 }}>{children}</View>
    </View>
  )
}

function Caret() {
  const p = usePalette()
  const o = useSharedValue(1)
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (!r) o.value = withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1) }) }, [o])
  const st = useAnimatedStyle(() => ({ opacity: o.value }))
  return <Animated.View style={[{ width: 2, height: 16, backgroundColor: p.accent, marginLeft: 2, transform: [{ translateY: 3 }] }, st]} />
}

function Btn({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: ReactNode }) {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, { backgroundColor: p.cardBg, borderColor: p.borderDivider }, (pressed || disabled) && { opacity: 0.45 }]}>
      {icon}<Text style={[FONT.sub, { color: p.textPrimary, fontWeight: '500' }]}>{label}</Text>
    </Pressable>
  )
}

function Composer({ a, onSubmit, autoFocus }: { a: AssistantState; onSubmit: () => void; autoFocus?: boolean }) {
  const p = usePalette()
  const input = useRef<TextInput>(null)
  // Android: Modal(반 시트) 안의 autoFocus는 창이 붙기 전에 불려 키보드가 안 뜬다 → 조금 뒤에 직접 초점
  useEffect(() => {
    if (!autoFocus || Platform.OS !== 'android') return
    const t = setTimeout(() => input.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [autoFocus])
  const can = !a.busy && !!a.model && !!a.draft.trim() && !a.connecting
  return (
    <View style={[s.composer, { backgroundColor: p.dark ? '#2a2a2c' : '#ececf0' }]}>
      <TextInput
        ref={input}
        value={a.draft}
        onChangeText={setDraft}
        autoFocus={autoFocus && Platform.OS !== 'android'}
        multiline
        maxLength={4000}
        placeholder={a.busy ? '다음에 물어볼 내용을 적어 두세요' : '무엇이든 물어보세요'}
        placeholderTextColor={p.textTertiary}
        style={[s.input, { color: p.textPrimary }]}
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={() => { if (can) onSubmit() }}
        accessibilityLabel="AI에게 보낼 내용"
      />
      {a.busy ? (
        <Pressable accessibilityRole="button" accessibilityLabel="멈추기" onPress={cancel} style={[s.send, { backgroundColor: p.textPrimary }]}><Square size={12} color={p.cardBg} fill={p.cardBg} /></Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="보내기" disabled={!can} onPress={onSubmit} style={[s.send, { backgroundColor: p.accent }, !can && { opacity: 0.35 }]}><ArrowUp size={18} color="#fff" strokeWidth={2.6} /></Pressable>
      )}
    </View>
  )
}

/** 결과 카드(13 §3): 머리 줄(아이콘 · 이름 · 개수) + 할 일 행(체크 · 제목 · 날짜). 집계는 큰 숫자 + 기준 문구 + 근거 행 최대 5개 */
function ResultCard({ r }: { r: AssistantResult }) {
  const p = usePalette()
  const router = useRouter()
  const tasks = r.tasks ?? []
  const [more, setMore] = useState(false)
  const ids = tasks.map((t) => t.id)
  const live = useQuery<{ id: string; status: number; deleted_at: string | null; title: string; start_at: string | null; due_at: string | null; priority: number }>(
    ids.length ? `SELECT id, status, deleted_at, title, start_at, due_at, priority FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})` : 'SELECT NULL AS id WHERE 0', ids
  ).data
  if (!tasks.length && !r.stats) return null
  const byId = new Map(live.map((t) => [t.id, t]))
  const limit = r.created ? tasks.length : 5
  const shown = more ? tasks : tasks.slice(0, limit)
  const today = dayKey()
  const head = r.created ? (tasks.some((t) => t.due_at?.includes('T')) ? '등록한 일정' : '등록한 할 일') : r.stats ? `완료 기록${r.stats.range ? ` · ${shortRange(r.stats.range)}` : ''}` : '찾은 항목'
  const Icon = r.created ? Check : r.stats ? BarChart3 : List
  return (
    <View style={[s.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
      <View style={[s.cardHead, { borderBottomColor: p.borderDivider }]}>
        <Icon size={14} color={p.textSecondary} />
        <Text style={[FONT.sub, { color: p.textSecondary, flex: 1, fontWeight: '600' }]} numberOfLines={1}>{head}</Text>
        <Text style={[FONT.meta, { color: p.textTertiary }]}>{r.stats ? '완료 시각 기준' : r.total ?? tasks.length}</Text>
      </View>
      {r.stats ? (
        <View style={s.stats}>
          <Text style={[s.big, { color: p.textPrimary }]}>{r.stats.hours}시간</Text>
          <Text style={[FONT.meta, { color: p.textTertiary }]}>일정 길이 합계 · 겹친 시간 포함, 실제 측정 아님 · 시간 없는 완료 {r.stats.untimed}개</Text>
        </View>
      ) : null}
      {shown.map((t) => {
        const cur = byId.get(t.id)
        const gone = live.length > 0 && (!cur || !!cur.deleted_at)
        const done = cur?.status === 1
        const date = rowDateLabel({ start_at: cur?.start_at ?? t.start_at, due_at: cur?.due_at ?? t.due_at }, today)
        return (
          <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${cur?.title ?? t.title} 열기`} disabled={gone} onPress={() => router.push(`/task/${t.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
            <Checkbox priority={cur?.priority ?? 0} done={done} disabled={gone || done} label={`${t.title} 완료`} onPress={() => void completeTasks([t.id])} />
            <Text style={[FONT.body, { flex: 1, fontSize: 15, color: done || gone ? p.textTertiary : p.textPrimary }, gone && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{cur?.title ?? t.title}</Text>
            {gone ? <Text style={[FONT.meta, { color: p.textTertiary }]}>삭제됨</Text> : date && !done ? <Text style={[FONT.meta, { color: date.tone === 'overdue' ? p.overdue : p.accent, fontSize: 13 }]}>{date.label}</Text> : null}
          </Pressable>
        )
      })}
      {!more && tasks.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={s.more}><Text style={[FONT.sub, { color: p.accent }]}>더 보기 {tasks.length - limit}</Text></Pressable>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 11.5, lineHeight: 15, fontWeight: '500' },
  ai: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  who: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  me: { alignSelf: 'flex-end', maxWidth: '80%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 9 },
  text: { fontSize: 15.5, lineHeight: 22 },
  ex: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  step: { fontSize: 12, lineHeight: 16 },
  err: { borderRadius: 12, padding: 12, gap: 8 },
  errActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, borderRadius: 9, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth },
  latest: { position: 'absolute', alignSelf: 'center', bottom: 70, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 16, paddingHorizontal: 12, height: 32, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  notice: { position: 'absolute', alignSelf: 'center', bottom: 72, color: '#fff', fontSize: 13.5, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 9 },
  composer: { marginHorizontal: 12, marginTop: 4, borderRadius: 22, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 44 },
  input: { flex: 1, fontSize: 16, lineHeight: 21, maxHeight: 6 * 21 + 12, paddingTop: 6, paddingBottom: 6 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  foot: { fontSize: 11, lineHeight: 15, textAlign: 'center', paddingHorizontal: 20, paddingTop: 6 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderBottomWidth: StyleSheet.hairlineWidth },
  stats: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 2 },
  big: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 12 },
  more: { height: 40, alignItems: 'center', justifyContent: 'center' }
})
