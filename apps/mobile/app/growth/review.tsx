// 29 §9.3 주간 점검 — 성장 탭에서 들어오는 전체 화면 3단계(31 R.* 그대로): ① 이번 주 돌아보기 → ② 밀린 일 정하기 → ③ 다음 주 고르기 → 끝(+30 XP, 주 1회).
// 계산은 공용 @sprout/schema/review(데스크톱과 같은 코드), DB 효과는 src/map/v2/review. 진행은 그 주 안에서 기기에 기억.
import { useQuery } from '@powersync/react-native'
import type { AtLink, AtTag } from '@sprout/schema/autoTag'
import { isoWeekStart, XP } from '@sprout/schema/growth'
import {
  dayStartIso, finishSummary, goStep, lookColumns, lookLine, md, membershipOf, mergeMissed, missedLine, missedOf, pickLine, pickRoom, planColumns, projectProgress,
  reviewTarget, suggestGoals, togglePick, undecided, weekNumbers, weekRangeLabel, DECISION_LABEL,
  type DayCell, type Decision, type ReviewProgress, type RGoal, type RList, type RTask, type SnapRow, type Step, type Suggestion
} from '@sprout/schema/review'
import { addDays } from '@sprout/schema/time'
import { useRouter } from 'expo-router'
import { Check, ChevronLeft, Plus } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { grantReviewXp } from '../../src/growth/data'
import { dayKey } from '../../src/lib/dates'
import { Buddy, Card, PartnerLine } from '../../src/map/v2/bits'
import { applyDecision, createGoals, loadProgressKv, restoreSnap, saveProgressKv, undoGoals } from '../../src/map/v2/review'
import { useKv } from '../../src/map/v2/kv'
import { usePalette } from '../../src/theme/ThemeProvider'
import { useToast } from '../../src/ui/Toast'

const STEPS: { n: 1 | 2 | 3; label: string; what: string }[] = [
  { n: 1, label: '돌아보기', what: '지난 7일을 한눈에 봐요. 고칠 건 없어요 — 보기만 하고 "다음"을 눌러요.' },
  { n: 2, label: '밀린 일', what: '못 한 일마다 하나씩 골라요. 안 고르면 "다음 주로"가 돼요.' },
  { n: 3, label: '다음 주', what: '다음 주에 꼭 할 목표를 3개까지 골라요. 고른 건 아래 다음 주 칸에 바로 놓여요.' }
]
const TASKS_SQL = `SELECT t.id, t.title, t.status, t.parent_id, t.due_at, t.start_at, t.completed_at, t.list_id, t.repeat_rule, t.priority FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
  WHERE t.deleted_at IS NULL AND t.title != '' AND l.archived_at IS NULL AND (
    (t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) >= ? AND substr(t.due_at, 1, 10) < ?) OR (t.status = 1 AND t.completed_at >= ? AND t.completed_at < ?) OR (t.status = 0 AND t.parent_id IS NULL))
  ORDER BY t.due_at, t.sort_order`
const GOALS_SQL = 'SELECT id, week_start, title, target, progress, status FROM kpis WHERE week_start IN (?, ?) ORDER BY sort_order, created_at'
const TAGS_SQL = "SELECT id, name, kind, home_type, home_id FROM tags WHERE kind = 'project' ORDER BY sort_order, name"
const TAG_LINKS_SQL = "SELECT tt.id, tt.task_id, tt.tag_id, tt.state FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE g.kind = 'project'"
const LISTS_SQL = 'SELECT id, name, emoji, kind, folder_id FROM lists WHERE archived_at IS NULL ORDER BY sort_order'
const DONE_TEXT: Record<Decision, (t: string) => string> = {
  next: (t) => `'${t}' 다음 주 월요일로 옮겼어요`, someday: (t) => `'${t}' 날짜를 뺐어요`, done: (t) => `'${t}' 끝냈어요 (XP 없음)`, trash: (t) => `'${t}' 지웠어요`
}

export default function WeeklyReview() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const [at] = useState(() => new Date())
  const { week, planWeek } = useMemo(() => reviewTarget(at), [at])
  const today = dayKey()
  const [, , kvLoaded] = useKv('sprout.map.review', null)
  const [pr, setPr] = useState<ReviewProgress>(() => loadProgressKv(week))
  const pRef = useRef(pr)
  useEffect(() => { if (kvLoaded) { pRef.current = loadProgressKv(week); setPr(pRef.current) } }, [kvLoaded, week])
  const patch = useCallback((f: (p: ReviewProgress) => ReviewProgress) => {
    const next = f(pRef.current)
    pRef.current = next
    saveProgressKv(next)
    setPr(next)
  }, [])
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const tasksQ = useQuery<RTask>(TASKS_SQL, [week, addDays(planWeek, 14), dayStartIso(week), dayStartIso(planWeek)])
  const goals = useQuery<RGoal>(GOALS_SQL, [week, planWeek]).data
  const tagProjects = useQuery<AtTag>(TAGS_SQL).data
  const tagLinks = useQuery<AtLink>(TAG_LINKS_SQL).data
  const allLists = useQuery<RList>(LISTS_SQL).data
  const tasks = tasksQ.data
  const loaded = !tasksQ.isLoading && kvLoaded

  const live = useMemo(() => missedOf(tasks, week, today), [tasks, week, today])
  useEffect(() => {
    if (!loaded || pr.step === 4) return
    const merged = mergeMissed(pRef.current.missed, live)
    if (merged.length !== pRef.current.missed.length) patch((x) => ({ ...x, missed: merged }))
  }, [loaded, live, pr.step, patch])
  const ids = pr.missed.map((m) => m.id)
  const cardRows = useQuery<{ id: string; title: string; status: number; due_at: string | null; deleted_at: string | null; list_id: string | null }>(ids.length
    ? `SELECT id, title, status, due_at, deleted_at, list_id FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})`
    : 'SELECT id, title, status, due_at, deleted_at, list_id FROM tasks WHERE 0', ids).data
  const cards = useMemo(() => {
    const byId = new Map(cardRows.map((r) => [r.id, r]))
    return pr.missed.map((m) => ({ ...m, row: byId.get(m.id) })).filter((c) => c.row && (pr.decisions[c.id] || (c.row.status === 0 && !c.row.deleted_at)))
  }, [cardRows, pr.missed, pr.decisions])
  const alive = useMemo(() => new Set(cards.map((c) => c.id)), [cards])
  const listName = (id: string | null) => { const l = allLists.find((x) => x.id === id); return l ? (l.kind === 'inbox' ? '기본함' : `${l.emoji ?? ''}${l.emoji ? ' ' : ''}${l.name}`) : '' }

  const mem = useMemo(() => membershipOf(tasks, tagProjects, tagLinks, allLists), [tasks, tagProjects, tagLinks, allLists])
  const nums = useMemo(() => weekNumbers(tasks, goals, week, cards.filter((c) => !pr.decisions[c.id]).length), [tasks, goals, week, cards, pr.decisions])
  const projects = useMemo(() => projectProgress(tasks, mem.projects, mem.member, week), [tasks, mem, week])
  const lookCols = useMemo(() => lookColumns(tasks, week, today), [tasks, week, today])
  const planGoals = goals.filter((g) => g.week_start === planWeek && !pr.created.some((c) => c.goalId === g.id))
  const room = pickRoom(planGoals.length)
  const sugs = useMemo<Suggestion[]>(() => {
    const base = suggestGoals({ tasks, projects: mem.projects, member: mem.member, goals: goals.filter((g) => !pr.created.some((c) => c.goalId === g.id)), week, planWeek, today, exclude: new Set(ids) })
    return [...base, ...pr.custom.map((c) => ({ key: c.key, kind: 'custom' as const, title: c.title, meta: '직접 적음', target: 1, taskIds: [] }))]
  }, [tasks, mem, goals, week, planWeek, today, ids.join(','), pr.custom, pr.created]) // eslint-disable-line react-hooks/exhaustive-deps
  const picked = sugs.filter((x) => pr.picks.includes(x.key))
  const goalTasks = useMemo(() => new Set(picked.flatMap((x) => x.taskIds)), [picked])
  const planCols = useMemo(() => planColumns(tasks, planWeek, goalTasks), [tasks, planWeek, goalTasks])
  const reviewXp = useQuery<{ amount: number }>('SELECT amount FROM xp_events WHERE kind = ? AND ref_id = ? LIMIT 1', ['review', `review:${isoWeekStart(week)}`]).data

  const label = (id: string) => cards.find((c) => c.id === id)?.row?.title ?? ''
  const undoOne = async (id: string) => {
    const snap = pRef.current.snaps[id]
    if (snap) await restoreSnap(snap)
    patch((x) => { const { [id]: _a, ...decisions } = x.decisions; const { [id]: _b, ...snaps } = x.snaps; return { ...x, decisions, snaps } })
  }
  const decide = async (id: string, d: Decision) => {
    if (busy.has(id)) return
    setBusy((b) => new Set(b).add(id))
    try {
      const prev = pRef.current.decisions[id]
      const prevSnap = pRef.current.snaps[id]
      if (prev && prevSnap) await restoreSnap(prevSnap)
      if (prev === d) { patch((x) => { const { [id]: _a, ...decisions } = x.decisions; const { [id]: _b, ...snaps } = x.snaps; return { ...x, decisions, snaps } }); return }
      const snap = await applyDecision(id, d, planWeek, today)
      patch((x) => ({ ...x, decisions: { ...x.decisions, [id]: d }, snaps: { ...x.snaps, [id]: snap } }))
      toast.show(DONE_TEXT[d](label(id)), { undo: () => undoOne(id) })
    } finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n }) }
  }
  const allNext = async () => {
    const todo = undecided(pRef.current, alive)
    if (!todo.length) return
    const snaps: Record<string, SnapRow[]> = {}
    for (const id of todo) snaps[id] = await applyDecision(id, 'next', planWeek, today)
    patch((x) => ({ ...x, decisions: { ...x.decisions, ...Object.fromEntries(todo.map((id) => [id, 'next' as const])) }, snaps: { ...x.snaps, ...snaps } }))
    toast.show(`밀린 ${todo.length}개를 다음 주로 옮겼어요`, { undo: async () => { for (const id of todo) await undoOne(id) } })
  }
  const go = (n: Step) => patch((x) => goStep(x, n))
  const [finishing, setFinishing] = useState(false)
  const finish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      if (pRef.current.created.length) await undoGoals(pRef.current.created)
      const created = await createGoals(today, planWeek, picked)
      patch((x) => ({ ...goStep(x, 4), created, finishedAt: new Date().toISOString() }))
      await grantReviewXp(today, week).catch((e) => console.warn('[review] XP', e))
      if (created.length) toast.show(`다음 주 목표 ${created.length}개를 정했어요`, { undo: async () => { await undoGoals(pRef.current.created); patch((x) => ({ ...x, created: [], step: 3, finishedAt: null })) } })
    } finally { setFinishing(false) }
  }
  const next = async () => {
    if (pr.step === 1) go(2)
    else if (pr.step === 2) { await allNext(); go(3) }
    else if (pr.step === 3) await finish()
  }
  const step = pr.step
  const reached = Math.max(pr.reached ?? 1, step)
  const left = cards.filter((c) => !pr.decisions[c.id]).length
  const line = step === 1 ? lookLine(nums) : step === 2 ? missedLine(left, cards.length) : step === 3 ? pickLine(sugs.filter((x) => x.kind !== 'custom'), today, planWeek) : ''

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.nav, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="성장으로 돌아가기" style={s.back} hitSlop={6}>
          <ChevronLeft size={24} color={p.accent} /><Text style={{ color: p.accent, fontSize: 17 }}>성장</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Text style={{ color: p.textTertiary, fontSize: 13 }}>{weekRangeLabel(week)} · 약 5분</Text>
      </View>
      <Text style={[s.title, { color: p.textPrimary }]}>주간 점검</Text>
      {step < 4 ? (
        <View style={s.stepper} accessibilityRole="tablist">
          {STEPS.map((x, i) => {
            const on = x.n === step, ok = !on && x.n < reached, can = !on && x.n <= reached
            return (
              <View key={x.n} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                {i > 0 ? <View style={[s.sline, { backgroundColor: p.borderDivider }]} /> : null}
                <Pressable disabled={!can} onPress={() => go(x.n)} accessibilityRole="tab" accessibilityState={{ selected: on, disabled: !can && !on }}
                  style={[s.pill, { borderColor: on ? p.accent : p.borderDivider, backgroundColor: on ? p.accentSubtle : p.cardBg }]}>
                  <View style={[s.num, { backgroundColor: ok ? '#2fa84f' : on ? p.accent : p.textQuaternary }]}><Text style={s.numT}>{ok ? '✓' : x.n}</Text></View>
                  <Text style={{ color: on ? p.textPrimary : can ? p.textSecondary : p.textTertiary, fontSize: 12.5, fontWeight: on ? '700' : '500' }} numberOfLines={1}>{x.n === 3 && planWeek <= today ? '이번 주' : x.label}</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
        {step < 4 ? <Text style={[s.what, { color: p.textSecondary, backgroundColor: p.cardBg }]}><Text style={{ color: p.accent, fontWeight: '700' }}>이건 뭐예요? </Text>{STEPS[step - 1].what}</Text> : null}
        {step < 4 && line ? <PartnerLine text={line} /> : null}
        {!loaded ? null : step === 1 ? (
          <>
            <View style={s.nums}>
              <Num n={nums.done} label="끝낸 일" color="#2fa84f" />
              <Num n={nums.missed} label="밀린 일" color={p.overdue} sub="다음 단계에서" />
              <Num n={nums.goals.total ? `${nums.goals.achieved}/${nums.goals.total}` : '–'} label="이번 주 목표" color={p.accent} sub={nums.goals.total ? undefined : '3단계에서 골라요'} />
            </View>
            {projects.length ? (
              <Card style={{ padding: 14, gap: 10 }}>
                <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '700' }}>{mem.byTag ? '프로젝트별 이번 주' : '리스트별 이번 주'}</Text>
                {projects.map((r) => (
                  <View key={r.id} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, color: p.textPrimary, fontSize: 14 }} numberOfLines={1}>{r.name}</Text><Text style={{ color: p.textTertiary, fontSize: 13 }}>{r.done} / {r.total}</Text></View>
                    <View style={[s.bar, { backgroundColor: p.bgSelected }]}><View style={[s.barIn, { width: `${r.total ? (r.done / r.total) * 100 : 0}%`, backgroundColor: p.accent }]} /></View>
                  </View>
                ))}
              </Card>
            ) : null}
            <Week cols={lookCols} today={today} legend="✓ 끝냄  ✕ 못 함  ▢ 남음" />
          </>
        ) : step === 2 ? (
          <>
            {!cards.length ? <Text style={{ color: p.textTertiary, textAlign: 'center', marginTop: 30, fontSize: 15 }}>이번 주에 밀린 일이 없어요 ✓</Text> : null}
            {cards.map((c) => {
              const d = pr.decisions[c.id]
              return (
                <Card key={c.id} style={{ padding: 14, gap: 10 }}>
                  <Pressable onPress={() => router.push(`/task/${c.id}`)} accessibilityRole="button">
                    <Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600', textDecorationLine: d === 'done' || d === 'trash' ? 'line-through' : 'none' }} numberOfLines={2}>{c.row!.title}</Text>
                    <Text style={{ color: p.textTertiary, fontSize: 12.5, marginTop: 3 }}>{md(c.due)} · {listName(c.row!.list_id)}{d ? <Text style={{ color: p.accent }}>{`  → ${DECISION_LABEL[d]}`}</Text> : null}</Text>
                  </Pressable>
                  <View style={s.grid}>
                    {(['next', 'someday', 'done', 'trash'] as Decision[]).map((k) => {
                      const on = d === k
                      const col = k === 'done' ? '#2fa84f' : k === 'trash' ? p.danger : p.accent
                      return (
                        <Pressable key={k} disabled={busy.has(c.id)} onPress={() => void decide(c.id, k)} accessibilityRole="button" accessibilityState={{ selected: on }}
                          style={[s.dbtn, { borderColor: on ? col : p.borderDivider, backgroundColor: on ? col : 'transparent' }]}>
                          <Text style={{ color: on ? '#fff' : k === 'trash' ? p.danger : p.textPrimary, fontSize: 14, fontWeight: '600' }}>{k === 'someday' ? '언젠가' : DECISION_LABEL[k]}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </Card>
              )
            })}
          </>
        ) : step === 3 ? (
          <PickStep sugs={sugs} picks={pr.picks} room={room} cols={planCols} today={today}
            onToggle={(k) => patch((x) => ({ ...x, picks: togglePick(x.picks, k, room) }))}
            onCustom={(title) => patch((x) => { const key = `custom:${Date.now()}`; return { ...x, custom: [...x.custom, { key, title }], picks: togglePick(x.picks, key, room) } })} />
        ) : (
          <View style={{ alignItems: 'center', paddingHorizontal: 28, paddingTop: 30, gap: 10 }}>
            <Buddy size={96} mood="happy" still />
            <Text style={{ color: p.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>다음 주 준비 끝! 월요일 아침에 ⚡로 알려 줄게</Text>
            <Text style={{ color: p.textTertiary, fontSize: 14 }}>{finishSummary(pr)}</Text>
            {pr.created.map((c) => <Text key={c.goalId} style={{ color: p.textPrimary, fontSize: 15, textAlign: 'center' }}>{c.title}</Text>)}
            {reviewXp.length ? <View style={[s.xp, { backgroundColor: p.accentSubtle }]}><Text style={{ color: p.accent, fontWeight: '700' }}>주간 점검 +{XP.review} XP</Text></View> : null}
            <Pressable onPress={() => router.push('/map')} accessibilityRole="button" style={[s.big, { backgroundColor: p.accent, alignSelf: 'stretch', marginTop: 8 }]}><Text style={s.bigT}>작업 지도 보기</Text></Pressable>
            <Pressable onPress={() => go(3)} accessibilityRole="button" hitSlop={8}><Text style={{ color: p.accent, fontSize: 15, fontWeight: '600', padding: 8 }}>다음 주 다시 고르기</Text></Pressable>
          </View>
        )}
      </ScrollView>
      {step < 4 ? (
        <View style={[s.foot, { paddingBottom: insets.bottom + 10, backgroundColor: p.pageBg, borderTopColor: p.borderDivider }]}>
          {step > 1 ? <Pressable onPress={() => go((step - 1) as Step)} accessibilityRole="button" hitSlop={8}><Text style={{ color: p.textSecondary, fontSize: 15 }}>← 이전</Text></Pressable> : <Text style={{ color: p.textTertiary, fontSize: 13 }}>{step} / 3 단계</Text>}
          {step === 2 && left > 0 ? <Pressable onPress={() => void allNext()} accessibilityRole="button" hitSlop={8}><Text style={{ color: p.accent, fontSize: 14, fontWeight: '600' }}>모두 다음 주로</Text></Pressable> : null}
          <View style={{ flex: 1 }} />
          <Pressable disabled={finishing || !loaded} onPress={() => void next()} accessibilityRole="button" style={[s.big, { backgroundColor: p.accent, paddingHorizontal: 26 }]}>
            <Text style={s.bigT}>{step === 3 ? '점검 끝내기 ✓' : '다음 →'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

function Num({ n, label, color, sub }: { n: number | string; label: string; color: string; sub?: string }) {
  const p = usePalette()
  return (
    <View style={[s.num3, { backgroundColor: p.cardBg }]}>
      <Text style={{ color, fontSize: 26, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color: p.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      {sub ? <Text style={{ color: p.textTertiary, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  )
}

/** 7칸 → 세로 7줄(요일 머리 + 막대 최대 3 + +N) */
function Week({ cols, today, legend }: { cols: DayCell[]; today: string; legend: string }) {
  const p = usePalette()
  const tone = (t: string) => t === 'done' ? { bg: '#2fa84f22', fg: '#2fa84f', mark: '✓ ' } : t === 'miss' ? { bg: `${p.overdue}22`, fg: p.overdue, mark: '✕ ' } : t === 'goal' ? { bg: p.accentSubtle, fg: p.accent, mark: '' } : { bg: 'transparent', fg: p.textSecondary, mark: '' }
  return (
    <Card>
      {cols.map((c, i) => (
        <View key={c.day} style={[s.dayRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, c.day === today && { backgroundColor: p.accentSubtle }]}>
          <Text style={{ width: 62, color: c.day === today ? p.accent : p.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{c.label}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            {c.bars.slice(0, 3).map((b) => {
              const t = tone(b.tone)
              return <Text key={b.id} style={[s.barT, { backgroundColor: t.bg, color: t.fg, borderColor: b.tone === 'open' ? p.borderDivider : 'transparent' }]} numberOfLines={1}>{t.mark}{b.title}</Text>
            })}
            {c.bars.length > 3 ? <Text style={{ color: p.textTertiary, fontSize: 12 }}>+{c.bars.length - 3}</Text> : null}
            {!c.bars.length ? <Text style={{ color: p.textQuaternary, fontSize: 12 }}>{c.day === today ? '지금 점검 중' : '–'}</Text> : null}
          </View>
        </View>
      ))}
      <Text style={{ color: p.textTertiary, fontSize: 12, padding: 12 }}>{legend}</Text>
    </Card>
  )
}

function PickStep({ sugs, picks, room, cols, today, onToggle, onCustom }: { sugs: Suggestion[]; picks: string[]; room: number; cols: DayCell[]; today: string; onToggle: (k: string) => void; onCustom: (t: string) => void }) {
  const p = usePalette()
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState('')
  const full = picks.length >= room
  return (
    <>
      <Text style={{ color: p.textTertiary, fontSize: 13, paddingHorizontal: 20, paddingBottom: 8 }}>
        {full && room > 0 ? `${picks.length} / ${room} 골랐어요 — 더 고르려면 하나를 빼요` : `${picks.length} / ${room} 골랐어요${picks.length ? '' : ' — 안 골라도 끝낼 수 있어요'}`}
      </Text>
      {sugs.map((x) => {
        const on = picks.includes(x.key)
        const dim = !on && full
        return (
          <Pressable key={x.key} onPress={() => onToggle(x.key)} disabled={dim} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: dim }}
            style={[s.sug, { backgroundColor: on ? p.accentSubtle : p.cardBg, borderColor: on ? p.accent : 'transparent', opacity: dim ? 0.45 : 1 }]}>
            <View style={[s.box, { borderColor: on ? p.accent : p.textQuaternary, backgroundColor: on ? p.accent : 'transparent' }]}>{on ? <Check size={13} color="#fff" strokeWidth={3} /> : null}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.textPrimary, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{x.title}</Text>
              <Text style={{ color: p.textTertiary, fontSize: 12.5, marginTop: 2 }}>{x.meta}</Text>
            </View>
          </Pressable>
        )
      })}
      {writing ? (
        <View style={[s.sug, { backgroundColor: p.cardBg, borderColor: p.accent }]}>
          <TextInput value={draft} onChangeText={setDraft} autoFocus placeholder="예: 운동 3번" placeholderTextColor={p.textTertiary} returnKeyType="done"
            onSubmitEditing={() => { const t = draft.trim(); if (t) onCustom(t); setDraft(''); setWriting(false) }} onBlur={() => setWriting(false)}
            style={{ flex: 1, color: p.textPrimary, fontSize: 15 }} accessibilityLabel="다음 주 목표 직접 적기" />
        </View>
      ) : (
        <Pressable onPress={() => setWriting(true)} accessibilityRole="button" style={[s.sug, { borderColor: p.textQuaternary, borderStyle: 'dashed', justifyContent: 'center' }]}>
          <Plus size={16} color={p.accent} /><Text style={{ color: p.accent, fontSize: 15, fontWeight: '600' }}>직접 적기</Text>
        </Pressable>
      )}
      <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '700', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>다음 주</Text>
      <Week cols={cols} today={today} legend="파란 칸 = 고른 목표에 딸린 일" />
    </>
  )
}

const s = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingRight: 16 },
  back: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 0 },
  sline: { width: 8, height: 2 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, height: 36 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  numT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  what: { marginHorizontal: 12, marginBottom: 12, borderRadius: 12, padding: 12, fontSize: 13.5, lineHeight: 19, overflow: 'hidden' },
  nums: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginBottom: 10 },
  num3: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 2 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barIn: { height: 6, borderRadius: 3 },
  dayRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10 },
  barT: { fontSize: 13, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dbtn: { width: '48%', flexGrow: 1, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sug: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  xp: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  big: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bigT: { color: '#fff', fontSize: 16, fontWeight: '700' }
})
