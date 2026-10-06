// 29 §9.2 같이 계획 짜기 — 전체 화면(뿌리 스택, 밀려 들어옴). 대화 규칙은 공용 @sprout/schema/planChat(데스크톱과 같은 상태 기계),
// 효과는 휴대폰 DB에(src/map/v2/planActions). params: project = 그 프로젝트로(31 §12.4) · make = 큰 일로 프로젝트 만들기 · task = 그 할 일로(① 건너뜀).
import { chipsOf, initPlan, inputOpen, planReduce, questionNo, type Effect, type PlanEvent, type PlanState } from '@sprout/schema/planChat'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowUp, RotateCcw, X } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { completeTasks } from '../src/data/tasks'
import { dayKey } from '../src/lib/dates'
import { Buddy, useBuddyName } from '../src/map/v2/bits'
import { addToProject, ensureProjectForGoal, projectCandidates, usePlanData } from '../src/map/v2/plan'
import { linkTeam } from '../src/map/v2/focus'
import {
  applyManualSteps, createGoalTask, journalChanged, loadPlanTask, newJournal, planCandidates, recordComplete, setPlanDue, splitWithAi, SplitError, undoLastSplit, undoPlanSession, type PlanJournal
} from '../src/map/v2/planActions'
import { usePalette } from '../src/theme/ThemeProvider'
import { useToast } from '../src/ui/Toast'

const SAY_DELAY = 350

export default function PlanChatScreen() {
  const params = useLocalSearchParams<{ project?: string; make?: string; task?: string }>()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const name = useBuddyName()
  const plan = usePlanData()
  const today = dayKey()
  const [state, setState] = useState<PlanState>(() => initPlan(name, today))
  const ref = useRef(state)
  const journal = useRef<PlanJournal>(newJournal())
  const abort = useRef<AbortController | undefined>(undefined)
  const alive = useRef(true)
  const started = useRef(false)
  const [changed, setChanged] = useState(false)
  const [draft, setDraft] = useState('')
  const [shown, setShown] = useState(0)
  const [made, setMade] = useState<string[]>([])
  const scroll = useRef<ScrollView>(null)
  const project = params.project ? plan.projects.find((x) => x.tag.id === params.project) : undefined
  const planRef = useRef({ project, params })
  planRef.current = { project, params }

  const madeTag = useRef<string | null>(null) // 31 §12.13.2 팀원을 이을 프로젝트
  const toProject = async (goal: { id: string; title: string }) => {
    const { params: q } = planRef.current
    try {
      if (q.project) await addToProject([goal.id], q.project)
      else if (q.make) madeTag.current = await ensureProjectForGoal(goal)
    } catch (e) { console.warn('[plan-chat] 프로젝트 연결 보류', e) }
  }
  const mark = () => setChanged(journalChanged(journal.current))
  const dispatch = useCallback((ev: PlanEvent) => {
    if (!alive.current) return
    const out = planReduce(ref.current, ev)
    ref.current = out.state
    setState(out.state)
    for (const f of out.effects) void runEffect(f)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const runSplit = async (taskId: string, again: boolean) => {
    const c = new AbortController()
    abort.current = c
    try {
      if (again) await undoLastSplit(journal.current)
      const steps = await splitWithAi(journal.current, taskId, today, c.signal)
      mark()
      if (!steps.length) { dispatch({ type: 'splitFailed', reason: 'empty' }); return }
      setMade(steps.map((s) => s.title))
      dispatch({ type: 'stepsReady', steps })
    } catch (e) {
      if (c.signal.aborted) { dispatch({ type: 'splitFailed', reason: 'stopped' }); return }
      if (e instanceof SplitError) dispatch({ type: 'splitFailed', reason: e.reason, message: e.reason === 'limit' ? e.message : undefined })
      else dispatch({ type: 'splitFailed', reason: 'format' })
    } finally { if (abort.current === c) abort.current = undefined }
  }
  const runEffect = async (f: Effect) => {
    const j = journal.current
    try {
      switch (f.kind) {
        case 'createGoal': {
          const goal = await createGoalTask(j, f.title, f.due)
          await toProject(goal)
          mark()
          dispatch({ type: 'goalReady', goal, steps: [] })
          break
        }
        case 'useGoal': {
          const r = await loadPlanTask(f.id)
          if (!r) { dispatch({ type: 'observed', goal: null, steps: [] }); break }
          j.title ||= r.goal.title
          await toProject(r.goal)
          dispatch({ type: 'goalReady', goal: r.goal, steps: r.steps })
          break
        }
        case 'setDue': await setPlanDue(j, f.taskId, f.due); mark(); break
        case 'split': await runSplit(f.taskId, false); break
        case 'resplit': await runSplit(f.taskId, true); break
        case 'manualSteps': {
          const steps = await applyManualSteps(j, f.taskId, f.titles)
          mark()
          setMade(steps.map((s) => s.title))
          dispatch({ type: 'stepsReady', steps })
          break
        }
        case 'complete': await completeTasks(f.ids); await recordComplete(j, f.ids); mark(); break
        case 'close': close(); break
        case 'team': if (madeTag.current) await linkTeam(madeTag.current, f.names); break
        default: break // light·focus = 지도가 없어 말로만
      }
    } catch (e) {
      console.error('[plan-chat]', e)
      if (f.kind === 'createGoal' || f.kind === 'manualSteps' || f.kind === 'useGoal') dispatch({ type: 'splitFailed', reason: 'format' })
    }
  }
  const close = () => {
    abort.current?.abort()
    const j = journal.current
    router.back()
    if (journalChanged(j)) toast.show(`'${j.title || '계획'}' 계획을 짰어요`, { undo: async () => { await undoPlanSession(j) } })
  }
  const undoAll = async () => {
    abort.current?.abort()
    const r = await undoPlanSession(journal.current)
    journal.current = newJournal()
    setChanged(false)
    setMade([])
    toast.show(r.kept ? `되돌렸어요 · 손댄 ${r.kept}개는 남겼어요` : '같이 짠 계획을 되돌렸어요')
    started.current = false
    ref.current = initPlan(name, today)
    setState(ref.current); setShown(0)
    void start()
  }
  const start = async () => {
    if (started.current) return
    if (params.project && !planRef.current.project) return // 프로젝트를 읽은 뒤
    started.current = true
    const task = params.task ? await loadPlanTask(params.task) : null
    const pj = planRef.current.project
    const candidates = pj ? projectCandidates(pj) : await planCandidates()
    if (task) { await toProject(task.goal); journal.current.title = task.goal.title }
    dispatch({ type: 'start', goal: task?.goal ?? null, steps: task?.steps, candidates: candidates.filter((c) => c.id !== params.task), askTeam: !!params.make && !params.project })
  }
  useEffect(() => { if (plan.loaded) void start() }, [plan.loaded, project?.tag.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { alive.current = false; abort.current?.abort() }, [])
  useEffect(() => { if (ref.current.name !== name) { ref.current = { ...ref.current, name }; setState(ref.current) } }, [name])

  // 캐릭터 말은 0.35초 뒤 하나씩
  useEffect(() => {
    if (shown >= state.msgs.length) return
    const next = state.msgs[shown]
    const t = setTimeout(() => setShown((n) => n + 1), next.who === 'bud' ? SAY_DELAY : 0)
    return () => clearTimeout(t)
  }, [shown, state.msgs])
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60) }, [shown, made])

  const { chips, skip } = chipsOf(state)
  const settled = shown >= state.msgs.length
  const qn = questionNo(state.phase)
  const send = () => { const t = draft.trim(); if (!t) return; setDraft(''); dispatch({ type: 'answer', text: t }) }

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.head, { paddingTop: insets.top + 6, borderBottomColor: p.borderDivider }]}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기 — 만든 건 남아요"><X size={24} color={p.textPrimary} /></Pressable>
        <Buddy size={32} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
          <Text style={{ color: p.textTertiary, fontSize: 12 }} numberOfLines={1}>{project ? `${project.emoji} ${project.title}` : params.make ? '새 프로젝트 만들기' : '같이 계획 짜기'}</Text>
        </View>
        <View style={s.dots} accessibilityLabel={qn ? `${qn}번째 물음` : undefined}>
          {[1, 2, 3, 4].map((n) => <View key={n} style={[s.pd, { backgroundColor: qn && n <= qn ? p.accent : p.textQuaternary }]} />)}
        </View>
        {changed ? <Pressable onPress={() => void undoAll()} hitSlop={8} accessibilityRole="button" accessibilityLabel="이번 대화 되돌리기" style={s.undo}><RotateCcw size={14} color={p.accent} /><Text style={{ color: p.accent, fontSize: 13.5, fontWeight: '600' }}>되돌리기</Text></Pressable> : null}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled" accessibilityLiveRegion="polite">
          {state.msgs.slice(0, shown).map((m) => m.who === 'sys'
            ? <Text key={m.id} style={{ color: p.textTertiary, fontSize: 12.5, textAlign: 'center' }}>{m.text}</Text>
            : (
              <View key={m.id} style={[s.msgRow, m.who === 'me' && { justifyContent: 'flex-end' }]}>
                <View style={[s.msg, m.who === 'me'
                  ? { backgroundColor: p.accentSubtle, borderBottomRightRadius: 4 }
                  : { backgroundColor: p.cardBg, borderBottomLeftRadius: 4 }, m.strong && { borderWidth: 2, borderColor: p.accent }]}>
                  <Text style={{ color: p.textPrimary, fontSize: 15, lineHeight: 21, fontWeight: m.strong ? '700' : '400' }}>{m.text.replace('지도 봐 봐!', '잠깐만 기다려 줘!')}</Text>
                </View>
              </View>
            ))}
          {made.length && (state.phase === 'done' || state.phase === 'first' || state.phase === 'end') ? (
            <View style={[s.made, { backgroundColor: p.cardBg }]}>
              {made.map((t, i) => <Text key={i} style={{ color: p.textSecondary, fontSize: 13.5 }} numberOfLines={1}>{i + 1}. {t}</Text>)}
            </View>
          ) : null}
          {!settled || state.busy ? <Text style={{ color: p.textTertiary, fontSize: 18, letterSpacing: 2 }}>···{state.queue ? <Text style={{ fontSize: 12 }}>  대기 {state.queue}번째…</Text> : null}</Text> : null}
        </ScrollView>
        {settled && (chips.length || skip) ? (
          <ScrollView horizontal style={{ flexGrow: 0, flexShrink: 0, maxHeight: 52 }} showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled" accessibilityLabel="빠른 답">
            {chips.slice(0, 6).map((c) => (
              <Pressable key={c.id} onPress={() => dispatch({ type: 'chip', id: c.id })} accessibilityRole="button" style={[s.chip, { backgroundColor: p.accentSubtle }]}>
                <Text style={{ color: p.accent, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{c.label}</Text>
              </Pressable>
            ))}
            {skip ? <Pressable onPress={() => dispatch({ type: 'skip' })} accessibilityRole="button" style={s.chip}><Text style={{ color: p.textTertiary, fontSize: 14 }}>건너뛰기</Text></Pressable> : null}
          </ScrollView>
        ) : null}
        <View style={[s.inputRow, { paddingBottom: insets.bottom + 8, borderTopColor: p.borderDivider, backgroundColor: p.pageBg }]}>
          <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={send} returnKeyType="send" editable={inputOpen(state)} placeholder={state.phase === 'split-manual' ? '예: 자료 조사, 목차 잡기, 초안 쓰기' : state.phase === 'team' ? '예: 민수, 지은' : '답을 적어 줘'}
            placeholderTextColor={p.textTertiary} style={[s.input, { backgroundColor: p.cardBg, color: p.textPrimary }]} accessibilityLabel="답 입력" />
          {state.busy && abort.current ? (
            <Pressable onPress={() => abort.current?.abort()} accessibilityRole="button" accessibilityLabel="멈추기" style={[s.send, { backgroundColor: p.textTertiary }]}><X size={18} color="#fff" /></Pressable>
          ) : (
            <Pressable onPress={send} disabled={!draft.trim() || !inputOpen(state)} accessibilityRole="button" accessibilityLabel="보내기" style={[s.send, { backgroundColor: draft.trim() ? p.accent : p.textQuaternary }]}><ArrowUp size={18} color="#fff" /></Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  dots: { flexDirection: 'row', gap: 4 },
  pd: { width: 6, height: 6, borderRadius: 3 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  msgRow: { flexDirection: 'row' },
  msg: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  made: { borderRadius: 12, padding: 12, gap: 4 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 14, height: 34, justifyContent: 'center', maxWidth: 240 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 40, borderRadius: 20, paddingHorizontal: 14, fontSize: 15 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }
})
