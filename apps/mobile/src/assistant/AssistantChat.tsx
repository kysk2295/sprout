// 27 D1·D2 대화 본문 — 전체 화면(app/assistant)과 반 시트(AssistantSheet)가 같이 쓴다.
// 40 §3: AI 쪽 얼굴 = 내 캐릭터 30(✦ 원 자리). 한 줄은 앱이 고르고(@sprout/schema/companion), 카드·오류 상자·버튼은 13 해요체 그대로.
// 움직이는 캐릭터는 마지막 답(또는 받는 중·오류 줄) 하나뿐, 지난 답은 그 답의 얼굴로 멈춘 그림.
// 내 말 = 오른쪽 회색 면 · AI = 왼쪽 캐릭터 + 이름 + 본문 · 결과 카드(할 일 행: 체크 = 완료(XP) · 누름 = 상세) · 집계 카드 · ↶ 되돌리기
// · 받는 중(글자 + 깜빡이는 커서, 단계 줄 `● 연결 › ● 해석 › ● 확인 · N초`, 대기열이면 `순서를 기다리는 중…`) · 오류 상자(13 §6 문구)
// · ↓ 최신으로 · 입력창(1줄 44 → 최대 6줄, Return = 보내기, 처리 중 = ■ 정지)
import { useQuery } from '@powersync/react-native'
import { useRouter } from 'expo-router'
import { ArrowDown, ArrowUp, BarChart3, Check, List, RefreshCw, RotateCcw, Square, TriangleAlert } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { XP } from '@sprout/schema/growth'
import { answerFace, answerKindOf, COMPANION_SIZE, companionLabel, companionName, EGG_TAP_LINE, errorFace, levelLine, pickLine, quickReplies, tapSpeaks, TAP_LINES, WAITING_FACE, type CompanionFace as Face, type CompanionMove } from '@sprout/schema/companion'
import { completeTasks } from '../data/tasks'
import { useBuddy } from '../diary/data'
import { CompanionFace, SayBubble, StaticFace, XpPop } from '../ui/CompanionFace'
import { dayKey, rowDateLabel } from '../lib/dates'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { Checkbox } from '../ui/Checkbox'
import { OFFLINE, type AssistantProgress, type AssistantResult } from './core'
import { cancel, refresh, send, setDraft, undo, type AssistantState, type Message } from './store'

/** "2026-10-05 ~ 2026-10-11" → "10/5–10/11" */
const shortRange = (range: string) => range.split(' ~ ').map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join('–')
// 40 §3.3: 빈 대화 예시는 회색 테두리 알약(색·아이콘 없음). 글은 13 그대로(누르면 바로 보냄)
const SUGGESTIONS = ['내일 오후 3시에 기획 회의 한 시간 잡아줘', '이번 주 남은 할 일 보여줘', '이번 주에 완료한 거 몇 개야?']
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
  const buddy = useBuddy()
  const egg = !buddy.species
  const who = companionName(buddy.species, buddy.name)
  const today = dayKey()
  // 결과 카드에서 완료할 때 오늘 할 일 XP가 상한 아래였을 때만 +1(10 §6 — 등록만으로는 XP 없음, 40 결정 ④)
  const todayTaskXp = useQuery<{ xp: number }>("SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events WHERE day = ? AND kind IN ('task', 'task_revoke')", [today]).data[0]?.xp ?? 0
  // 빠른 답 칩(리스트를 물을 때): 최근 쓴 리스트 3개
  const recentLists = useQuery<{ name: string }>("SELECT l.name AS name FROM tasks t JOIN lists l ON l.id = t.list_id WHERE t.deleted_at IS NULL AND l.archived_at IS NULL AND COALESCE(l.kind, '') <> 'inbox' GROUP BY l.id ORDER BY MAX(t.modified_at) DESC LIMIT 3").data.map((r) => r.name)
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
  const submit = async (text = a.draft, prompt?: string) => {
    if (a.busy || !a.model || !text.trim()) return
    if (text === a.draft) setDraft('')
    latest()
    await send(text, prompt)
  }
  // 마지막 답의 한 번 움직임: 새 답이 들어오면 그 얼굴의 움직임(깡충·갸웃), 누르기·완료면 깡충
  let lastAi = a.messages.length - 1
  while (lastAi >= 0 && a.messages[lastAi].role !== 'assistant') lastAi--
  const lastId = lastAi >= 0 ? a.messages[lastAi].id : ''
  const [play, setPlay] = useState<{ move: CompanionMove; n: number }>({ move: null, n: 0 })
  const [xp, setXp] = useState(0)
  const seen = useRef(lastId)
  const doUndo = async (m: Message) => {
    try { await undo(m.id); setNotice('등록을 되돌렸어요'); if (m.id === lastId) setPlay((o) => ({ move: 'tilt', n: o.n + 1 })) } catch (e) { setNotice(e instanceof Error ? e.message : '되돌리지 못했어요.') }
  }
  const faces = useMemo(() => a.messages.map((m, i): Face | null => {
    if (m.role !== 'assistant') return null
    const r = m.result
    const kind = answerKindOf(r)
    const prev = a.messages[i - 1]
    return answerFace({ kind, undone: m.undone, count: r?.total ?? r?.tasks?.length ?? 0, first: r?.tasks?.[0], status: r?.status, request: prev?.role === 'user' ? prev.sent ?? prev.text : '', text: r?.stats ? '' : m.text, egg })
  }), [a.messages, egg])
  useEffect(() => {
    if (!lastId || lastId === seen.current) return
    seen.current = lastId
    const f = faces[lastAi]
    if (f?.move) setPlay((o) => ({ move: f.move, n: o.n + 1 }))
  }, [lastId, lastAi, faces])
  const phaseIndex = STEPS.findIndex((st) => st.key.includes(a.progress.phase))
  const cooling = a.cooldownUntil > now
  const left = Math.ceil((a.cooldownUntil - now) / 1000)
  const errShown = !!a.error && !a.busy
  const errFace = errShown ? errorFace(a.error, egg) : null
  // 마지막 답이 되묻기면 빠른 답 칩(40 §3.3) — 받는 중·오류·직접 쓰는 중이면 없음
  const last = lastAi >= 0 && lastAi === a.messages.length - 1 ? a.messages[lastAi] : null
  const chips = last && !a.busy && !errShown && !a.draft.trim() && faces[lastAi]?.mood === 'puzzled' && answerKindOf(last.result) === 'reply'
    ? quickReplies({ request: a.messages[lastAi - 1]?.text ?? '', question: last.text, lists: recentLists })
    : []
  const animatedRow = a.busy || errShown ? -1 : lastAi
  const faceOf = (f: Face | null, live: boolean, key?: string) => live
    ? <CompanionFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.chat} mood={f?.mood ?? 'smile'} dim={f?.dim} loop={f === WAITING_FACE ? 'think' : null} play={key === 'last' ? play : undefined}
      onPress={key === 'last' ? () => setPlay((o) => ({ move: 'hop', n: o.n + 1 })) : undefined} label={key === 'last' ? companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage) : undefined} />
    : <StaticFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.chat} mood={f?.mood ?? 'smile'} dim={f?.dim} />

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
        {!a.messages.length ? <EmptyChat a={a} variant={variant} onPick={(t) => void submit(t)} /> : null}
        {a.messages.map((m, i) => m.role === 'user' ? (
          <View key={m.id} style={[s.me, { backgroundColor: p.dark ? '#2c2c2e' : '#ececf0' }]}><Text style={[s.text, { color: p.textPrimary }]}>{m.text}</Text></View>
        ) : (
          <Ai key={m.id} name={who} face={faceOf(faces[i], i === animatedRow, i === lastAi ? 'last' : undefined)} xp={i === lastAi ? xp : 0}>
            {faces[i]?.line ? <Text style={[s.text, { color: p.textPrimary }]} selectable>{faces[i]!.line}</Text> : null}
            {m.result ? <ResultCard r={m.result} onComplete={() => { if (i === lastAi) setPlay((o) => ({ move: 'hop', n: o.n + 1 })); if (todayTaskXp < XP.taskDailyCap && i === lastAi) setXp((n) => n + 1) }} /> : null}
            {m.result?.created && !m.undone ? (
              <Pressable accessibilityRole="button" onPress={() => void doUndo(m)} style={s.undo} hitSlop={6}>
                <RotateCcw size={15} color={p.accent} /><Text style={[FONT.sub, { color: p.accent, fontWeight: '600' }]}>되돌리기</Text>
              </Pressable>
            ) : null}
            {i === lastAi && chips.length ? (
              <View style={s.chips}>
                {chips.map((c) => (
                  <Pressable key={c.label} accessibilityRole="button" disabled={!a.model} onPress={() => void submit(c.label, c.send)} style={({ pressed }) => [s.chip, { borderColor: p.borderDivider, backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
                    <Text style={[s.chipText, { color: c.ghost ? p.textSecondary : p.textPrimary }]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Ai>
        ))}
        {a.busy ? (
          <Ai name={who} face={faceOf(WAITING_FACE, true)}>
            {a.progress.preview ? <Text style={[s.text, { color: p.textPrimary }]}>{a.progress.preview}<Caret /></Text> : (
              <Text style={[s.text, { color: p.textSecondary }]}>{(a.progress.queue ?? 0) > 0 ? `순서를 기다리는 중… (앞에 ${a.progress.queue}명)` : a.progress.phase === 'connecting' ? '꿈틀 AI에 연결하는 중…' : '생각하는 중…'}</Text>
            )}
            <View style={s.steps} accessibilityRole="progressbar">
              {STEPS.map((st, i) => (
                <Text key={st.label} style={[s.step, { color: i <= phaseIndex ? p.accent : p.textQuaternary }]}>{i > 0 ? <Text style={{ color: p.textQuaternary }}>{' › '}</Text> : null}● {st.label}</Text>
              ))}
              <Text style={[s.step, { color: p.textTertiary }]}> · {elapsed}초</Text>
            </View>
          </Ai>
        ) : null}
        {errShown && errFace ? (
          <Ai name={who} face={faceOf(errFace, true)}>
            {errFace.line ? <Text style={[s.text, { color: p.textPrimary }]}>{errFace.line}</Text> : null}
            <View style={[s.err, { backgroundColor: p.dark ? '#2a2a2c' : '#f2f2f5' }]} accessibilityRole="alert">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TriangleAlert size={16} color={p.textSecondary} style={{ marginTop: 2 }} />
                <Text style={[FONT.sub, { color: p.textPrimary, flex: 1 }]}>{a.error}</Text>
              </View>
              {a.error === OFFLINE && !a.models.length ? <Text style={[FONT.meta, { color: p.textTertiary }]}>1분 뒤 저절로 다시 확인해요</Text> : null}
              <View style={s.errActs}>
                {a.lastRequest ? <Btn label={cooling ? `다시 시도 · ${left}초` : '다시 시도'} icon={<RefreshCw size={14} color={p.textPrimary} />} disabled={a.busy || cooling || !a.model} onPress={() => void submit(a.lastRequest, a.lastPrompt)} /> : null}
                {a.lastRequest ? <Btn label="입력으로 가져오기" onPress={() => setDraft(a.lastPrompt || a.lastRequest)} /> : null}
                {!a.models.length ? <Btn label="다시 연결" disabled={a.connecting} onPress={() => void refresh()} /> : null}
              </View>
            </View>
          </Ai>
        ) : null}
      </ScrollView>
      {showLatest ? (
        <Pressable accessibilityRole="button" onPress={latest} style={[s.latest, { backgroundColor: p.bgPopover, borderColor: p.borderDivider }]}>
          <ArrowDown size={14} color={p.textPrimary} /><Text style={[FONT.meta, { color: p.textPrimary, fontWeight: '600' }]}>최신으로</Text>
        </Pressable>
      ) : null}
      {notice ? <Text style={[s.notice, { backgroundColor: p.toastBg }]}>{notice}</Text> : null}
      <Composer a={a} autoFocus={autoFocus} onSubmit={() => void submit()} />
      {variant === 'full' ? <Text style={[s.foot, { color: p.textTertiary }]}>결과는 카드에서 되돌릴 수 있어요</Text> : null}
    </View>
  )
}

/** 40 §3.1 빈 대화: 캐릭터 L 96(반 시트 64, 숨쉬기) · 이름 · `종 · Lv · 단계` · 13 문장 · 예시 알약. 캐릭터를 누르면 깡충 + 말풍선 */
function EmptyChat({ a, variant, onPick }: { a: AssistantState; variant: 'full' | 'sheet'; onPick: (text: string) => void }) {
  const p = usePalette()
  const buddy = useBuddy()
  const size = variant === 'sheet' ? COMPANION_SIZE.sheet : COMPANION_SIZE.l
  const [play, setPlay] = useState<{ move: CompanionMove; n: number }>({ move: null, n: 0 })
  const [say, setSay] = useState({ text: '', n: 0 })
  const prev = useRef(-1)
  const taps = useRef<number[]>([])
  const tap = () => {
    setPlay((o) => ({ move: 'hop', n: o.n + 1 }))
    if (!tapSpeaks(taps.current, Date.now())) return
    if (!buddy.species) { setSay((o) => ({ text: EGG_TAP_LINE, n: o.n + 1 })); return }
    const i = pickLine(TAP_LINES, prev.current)
    prev.current = i
    setSay((o) => ({ text: TAP_LINES[i], n: o.n + 1 }))
  }
  return (
    <View style={[s.empty, { paddingTop: variant === 'sheet' ? 16 : 56 }]}>
      <View style={{ alignItems: 'center' }}>
        <SayBubble text={say.text} n={say.n} style={{ bottom: size * 0.86 }} />
        <CompanionFace species={buddy.species} stage={buddy.stage} size={size} mood="smile" loop="breathe" play={play} onPress={tap} label={companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage)} />
      </View>
      <Text style={[s.emptyName, { color: p.textPrimary }]}>{companionName(buddy.species, buddy.name)}</Text>
      <Text style={[s.emptyLv, { color: p.textTertiary }]}>{levelLine(buddy.species, buddy.level, buddy.stage)}</Text>
      <Text style={[s.emptyOne, { color: p.textSecondary }]}>할 일을 말로 등록하거나, 내 일정과 완료 기록을 물어보세요.</Text>
      <View style={s.emptyChips}>
        {SUGGESTIONS.slice(0, variant === 'sheet' ? 2 : 3).map((text) => (
          <Pressable key={text} accessibilityRole="button" disabled={a.busy || !a.model} onPress={() => onPick(text)} style={({ pressed }) => [s.chip, s.chipWide, { borderColor: p.borderDivider, backgroundColor: pressed ? p.bgSelected : p.cardBg }, (!a.model || a.busy) && { opacity: 0.5 }]}>
            <Text style={[s.chipText, { color: p.textPrimary }]} numberOfLines={1}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/** AI 쪽 한 줄: 캐릭터 30(13의 ✦ 원 자리, 배경 원 없음) · 이름(3차 11.5) · 본문 */
function Ai({ face, name, xp = 0, children }: { face: ReactNode; name: string; xp?: number; children: ReactNode }) {
  const p = usePalette()
  return (
    <View style={s.ai}>
      <View style={s.who}>{face}<XpPop n={xp} style={{ top: -8, right: -10 }} /></View>
      <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
        <Text style={[s.name, { color: p.textTertiary }]} numberOfLines={1}>{name}</Text>
        {children}
      </View>
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
function ResultCard({ r, onComplete }: { r: AssistantResult; onComplete?: () => void }) {
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
            <Checkbox priority={cur?.priority ?? 0} done={done} disabled={gone || done} label={`${t.title} 완료`} onPress={() => { onComplete?.(); void completeTasks([t.id]) }} />
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
  who: { width: 30, height: 30, marginTop: -4 },
  name: { fontSize: 11.5, lineHeight: 14, marginBottom: -6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chipWide: { alignSelf: 'stretch' },
  chipText: { fontSize: 14, lineHeight: 18 },
  empty: { alignItems: 'center' },
  emptyName: { marginTop: 6, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  emptyLv: { fontSize: 12, lineHeight: 16 },
  emptyOne: { marginTop: 10, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 20 },
  emptyChips: { alignSelf: 'stretch', gap: 8, marginTop: 16, paddingHorizontal: 8 },
  me: { alignSelf: 'flex-end', maxWidth: '80%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 9 },
  text: { fontSize: 15.5, lineHeight: 22 },
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
