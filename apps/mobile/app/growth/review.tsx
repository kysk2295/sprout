// 29 §9.3 주간 점검 — 성장 탭에서 들어오는 전체 화면 3단계(31 R.* 그대로): ① 이번 주 돌아보기 → ② 밀린 일 정하기 → ③ 다음 주 고르기 → 끝(+30 XP, 주 1회).
// 모양 v2(31 R.10, 2026-10-06 "너무 AI 스러워"): 틱틱 설정처럼 세그먼트 + 묶음 목록, 설명은 묶음 밑글, 캐릭터는 끝 화면에만.
// 계산은 공용 @sprout/schema/review(데스크톱과 같은 코드), DB 효과는 src/map/v2/review. 진행은 그 주 안에서 기기에 기억.
import { useQuery } from '@powersync/react-native'
import type { AtLink, AtTag } from '@sprout/schema/autoTag'
import { isoWeekStart, XP } from '@sprout/schema/growth'
import {
  dayStartIso, finishSummary, goStep, lookColumns, md, membershipOf, mergeMissed, missedOf, pickRoom, planColumns, projectProgress,
  reviewTarget, suggestGoals, togglePick, undecided, weekNumbers, weekRangeLabel,
  type DayCell, type Decision, type ReviewProgress, type RGoal, type RList, type RTask, type SnapRow, type Step, type Suggestion
} from '@sprout/schema/review'
import { addDays } from '@sprout/schema/time'
import { useRouter } from 'expo-router'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { grantReviewXp } from '../../src/growth/data'
import { dayKey } from '../../src/lib/dates'
import { Buddy } from '../../src/map/v2/bits'
import { ReviewProjectLeftovers } from '../../src/map/v2/ProjectAsk'
import { applyDecision, createGoals, loadProgressKv, restoreSnap, saveProgressKv, undoGoals } from '../../src/map/v2/review'
import { useKv } from '../../src/map/v2/kv'
import { FONT, M } from '../../src/theme/palette'
import { usePalette } from '../../src/theme/ThemeProvider'
import { Segmented } from '../../src/ui/Segmented'
import { useToast } from '../../src/ui/Toast'

const STEPS: { n: 1 | 2 | 3; label: string }[] = [{ n: 1, label: '돌아보기' }, { n: 2, label: '밀린 일' }, { n: 3, label: '다음 주' }]
const CHOICES: [Decision, string][] = [['next', '다음 주'], ['someday', '언젠가'], ['done', '끝냄'], ['trash', '지우기']]
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
  const g = nums.goals

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.nav, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="성장으로 돌아가기" style={s.back} hitSlop={6}>
          <ChevronLeft size={24} color={p.accent} /><Text style={{ color: p.accent, fontSize: 17 }}>성장</Text>
        </Pressable>
      </View>
      <Text style={[FONT.title, s.title, { color: p.textPrimary }]}>주간 점검</Text>
      <Text style={[FONT.sub, s.sub, { color: p.textTertiary }]}>{weekRangeLabel(week)} 돌아보기</Text>
      {step < 4 ? (
        <Segmented style={s.seg} value={String(step)}
          items={STEPS.map((x) => ({ key: String(x.n), label: x.n === 3 && planWeek <= today ? '이번 주' : x.label }))}
          disabled={STEPS.filter((x) => x.n > reached).map((x) => String(x.n))}
          onChange={(k) => { const n = Number(k) as Step; if (n <= reached) go(n) }} />
      ) : null}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
        {!loaded ? null : step === 1 ? (
          <>
            <Group title="이번 주" foot="보기만 하고 다음으로 넘어가요">
              <Row first label="끝낸 일" value={String(nums.done)} />
              <Row label="밀린 일" value={String(nums.missed)} valueColor={nums.missed ? p.overdue : undefined} />
              <Row label="이번 주 목표" value={g.total ? `${g.achieved} / ${g.total}` : '없음'} />
            </Group>
            {projects.length ? (
              <Group title={mem.byTag ? '프로젝트' : '리스트'}>
                {projects.map((r, i) => (
                  <View key={r.id}>
                    <Row first={i === 0} icon={r.emoji ?? (mem.byTag ? '🚀' : '≡')} label={r.name} value={`${r.done} / ${r.total}`} />
                    <View style={[s.ptrack, { backgroundColor: p.bgSelected }]}><View style={{ height: 3, borderRadius: 2, width: `${r.total ? (r.done / r.total) * 100 : 0}%`, backgroundColor: p.accent }} /></View>
                  </View>
                ))}
              </Group>
            ) : null}
            <Group title="요일별"><Days cols={lookCols} today={today} onOpen={(id) => router.push(`/task/${id}`)} /></Group>
          </>
        ) : step === 2 ? (
          <>
            <Group title={`밀린 일 ${cards.length}`} foot={cards.length ? '안 고른 일은 다음 주 월요일로 옮겨요 · 끝냄은 XP 없이 닫혀요' : undefined}>
              {!cards.length ? <Row first label="이번 주에 밀린 일이 없어요" dim /> : null}
              {cards.map((c, i) => {
                const d = pr.decisions[c.id]
                const closed = d === 'done' || d === 'trash'
                return (
                  <View key={c.id} style={[s.mt, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
                    <Pressable onPress={() => router.push(`/task/${c.id}`)} accessibilityRole="button">
                      <Text style={[FONT.body, { color: closed ? p.textTertiary : p.textPrimary, textDecorationLine: closed ? 'line-through' : 'none' }]} numberOfLines={2}>{c.row!.title}</Text>
                      <Text style={[FONT.meta, { color: p.textTertiary, marginTop: 2 }]}>{md(c.due)}{listName(c.row!.list_id) ? ` · ${listName(c.row!.list_id)}` : ''}</Text>
                    </Pressable>
                    <View style={[s.dseg, { backgroundColor: p.segTrack }]} accessibilityRole="radiogroup">
                      {CHOICES.map(([k, t]) => {
                        const on = d === k
                        return (
                          <Pressable key={k} disabled={busy.has(c.id)} onPress={() => void decide(c.id, k)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                            style={[s.dseg1, on && { backgroundColor: p.segOn }]}>
                            <Text style={{ fontSize: 13, fontWeight: on ? '600' : '500', color: k === 'trash' ? p.danger : on ? p.textPrimary : p.textSecondary }}>{t}</Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>
                )
              })}
            </Group>
            {left > 0 ? (
              <Pressable onPress={() => void allNext()} accessibilityRole="button" style={s.link} hitSlop={6}>
                <Text style={{ color: p.accent, fontSize: 15 }}>안 고른 {left}개 모두 다음 주로</Text>
              </Pressable>
            ) : null}
          </>
        ) : step === 3 ? (
          <PickStep sugs={sugs} picks={pr.picks} room={room} existing={planGoals.length} cols={planCols} today={today} planWeek={planWeek}
            onOpen={(id) => router.push(`/task/${id}`)}
            onToggle={(k) => patch((x) => ({ ...x, picks: togglePick(x.picks, k, room) }))}
            onCustom={(title) => patch((x) => { const key = `custom:${Date.now()}`; return { ...x, custom: [...x.custom, { key, title }], picks: togglePick(x.picks, key, room) } })} />
        ) : (
          <>
            <View style={s.me}>
              <Buddy size={40} mood="happy" still />
              <View style={{ flex: 1 }}>
                <Text style={[FONT.bodyStrong, { color: p.textPrimary }]}>다음 주 준비를 마쳤어요</Text>
                <Text style={[FONT.sub, { color: p.textTertiary }]}>{finishSummary(pr)}</Text>
              </View>
            </View>
            <ReviewProjectLeftovers />{/* 29 §9.8 · 31 §12.13.6 */}
            <Group title="다음 주 목표">
              {pr.created.length ? pr.created.map((c, i) => <Row key={c.goalId} first={i === 0} label={c.title} />) : <Row first label="고른 목표 없음" dim />}
              {reviewXp.length ? <Row label="주간 점검" value={`+${XP.review} XP`} valueColor={p.accent} /> : null}
            </Group>
            <Group>
              <Row first label="작업 지도 보기" onPress={() => router.push('/map')} />
              <Row label="다음 주 다시 고르기" onPress={() => go(3)} />
            </Group>
          </>
        )}
      </ScrollView>
      {step < 4 ? (
        <View style={[s.foot, { paddingBottom: insets.bottom + 10, backgroundColor: p.pageBg, borderTopColor: p.borderDivider }]}>
          {step > 1 ? <Pressable onPress={() => go((step - 1) as Step)} accessibilityRole="button" hitSlop={8}><Text style={{ color: p.textSecondary, fontSize: 16 }}>이전</Text></Pressable> : <Text style={{ color: p.textTertiary, fontSize: 14 }}>{step} / 3</Text>}
          <View style={{ flex: 1 }} />
          <Pressable disabled={finishing || !loaded} onPress={() => void next()} accessibilityRole="button" style={({ pressed }) => [s.big, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={s.bigT}>{step === 3 ? '점검 끝내기' : '다음'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

/** 묶음: 회색 이름 + 흰 카드 + 회색 밑글(틱틱 설정 묶음) */
function Group({ title, foot, children }: { title?: string; foot?: string; children: ReactNode }) {
  const p = usePalette()
  return (
    <View>
      {title ? <Text style={[s.gTitle, { color: p.textTertiary }]}>{title}</Text> : <View style={{ height: 18 }} />}
      <View style={[s.gBox, { backgroundColor: p.cardBg }]}>{children}</View>
      {foot ? <Text style={[s.gFoot, { color: p.textTertiary }]}>{foot}</Text> : null}
    </View>
  )
}

function Row({ label, value, valueColor, icon, first, dim, onPress, right }: { label: string; value?: string; valueColor?: string; icon?: string; first?: boolean; dim?: boolean; onPress?: () => void; right?: ReactNode }) {
  const p = usePalette()
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [s.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
      {icon ? <Text style={[s.ic, { color: p.textTertiary }]}>{icon}</Text> : null}
      <Text style={[FONT.body, { flex: 1, color: dim ? p.textTertiary : p.textPrimary }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={[FONT.sub, { color: valueColor ?? p.textTertiary }]}>{value}</Text> : null}
      {right}
      {onPress ? <ChevronRight size={16} color={p.textQuaternary} /> : null}
    </Pressable>
  )
}

const daySummary = (c: DayCell) => {
  const n = (t: string) => c.bars.filter((b) => b.tone === t).length
  return ([['끝냄', n('done')], ['못 함', n('miss')], ['남음', n('open')]] as const).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ')
}

/** 요일 7행 — 누르면 그날 할 일이 행 아래 펼쳐진다 */
function Days({ cols, today, onOpen, goal }: { cols: DayCell[]; today: string; onOpen: (id: string) => void; goal?: boolean }) {
  const p = usePalette()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      {cols.map((c, i) => {
        const on = open === c.day
        const goals = c.bars.filter((b) => b.tone === 'goal').length
        const summary = goal ? (c.bars.length ? `${c.bars.length}개` : '') : daySummary(c)
        return (
          <View key={c.day} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }}>
            <Pressable disabled={!c.bars.length} onPress={() => setOpen(on ? null : c.day)} accessibilityRole="button" accessibilityState={{ expanded: on }}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
              <Text style={[FONT.body, { flex: 1, color: c.day === today ? p.accent : p.textPrimary }]}>{c.label}</Text>
              {goal && goals ? <Text style={[FONT.sub, { color: p.accent }]}>목표 {goals}</Text> : null}
              <Text style={[FONT.sub, { color: p.textTertiary }]}>{summary || '–'}</Text>
              {c.bars.length ? (on ? <ChevronDown size={16} color={p.textQuaternary} /> : <ChevronRight size={16} color={p.textQuaternary} />) : <View style={{ width: 16 }} />}
            </Pressable>
            {on ? (
              <View style={{ paddingBottom: 6 }}>
                {c.bars.map((b) => (
                  <Pressable key={b.id} onPress={() => onOpen(b.id)} accessibilityRole="button" style={({ pressed }) => [s.ev, pressed && { backgroundColor: p.bgSelected }]}>
                    <View style={[s.evBox, { borderColor: b.tone === 'done' ? 'transparent' : p.textQuaternary }]}>{b.tone === 'done' ? <Check size={13} color={p.textTertiary} strokeWidth={2.5} /> : null}</View>
                    <Text style={[FONT.sub, { flex: 1, color: b.tone === 'done' ? p.textTertiary : p.textPrimary }]} numberOfLines={1}>{b.title}</Text>
                    {b.tone === 'miss' ? <Text style={[FONT.meta, { color: p.overdue }]}>못 함</Text> : b.tone === 'goal' ? <Text style={[FONT.meta, { color: p.accent }]}>목표</Text> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )
      })}
    </>
  )
}

function PickStep({ sugs, picks, room, existing, cols, today, planWeek, onToggle, onCustom, onOpen }: {
  sugs: Suggestion[]; picks: string[]; room: number; existing: number; cols: DayCell[]; today: string; planWeek: string
  onToggle: (k: string) => void; onCustom: (t: string) => void; onOpen: (id: string) => void
}) {
  const p = usePalette()
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState('')
  const full = picks.length >= room
  const foot = room === 0 ? `다음 주 목표가 이미 ${existing}개라 더 고를 수 없어요 — 그대로 끝내도 돼요`
    : full ? '더 고르려면 하나를 빼요' : `다음 주 목표를 ${room}개까지 골라요${existing ? ` · 이미 있는 목표 ${existing}개` : ''}`
  return (
    <>
      <Group title={`목표 고르기 ${picks.length} / ${room}`} foot={foot}>
        {sugs.map((x, i) => {
          const on = picks.includes(x.key)
          const dim = !on && full
          return (
            <Pressable key={x.key} onPress={() => onToggle(x.key)} disabled={dim} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: dim }}
              style={({ pressed }) => [s.pk, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, { opacity: dim ? 0.4 : 1 }, pressed && { backgroundColor: p.bgSelected }]}>
              <View style={[s.box, { borderColor: on ? p.accent : p.textQuaternary, backgroundColor: on ? p.accent : 'transparent' }]}>{on ? <Check size={13} color="#fff" strokeWidth={3} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={[FONT.body, { color: p.textPrimary }]} numberOfLines={2}>{x.kind === 'project' ? `${x.emoji ?? '🚀'} ` : ''}{x.title}</Text>
                <Text style={[FONT.meta, { color: p.textTertiary, marginTop: 2 }]}>{x.meta}</Text>
              </View>
            </Pressable>
          )
        })}
        {writing ? (
          <View style={[s.pk, sugs.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
            <TextInput value={draft} onChangeText={setDraft} autoFocus placeholder="예: 운동 3번" placeholderTextColor={p.textTertiary} returnKeyType="done"
              onSubmitEditing={() => { const t = draft.trim(); if (t) onCustom(t); setDraft(''); setWriting(false) }} onBlur={() => setWriting(false)}
              style={[FONT.body, { flex: 1, color: p.textPrimary, paddingVertical: 0 }]} accessibilityLabel="다음 주 목표 직접 적기" />
          </View>
        ) : (
          <Pressable onPress={() => setWriting(true)} disabled={full} accessibilityRole="button"
            style={({ pressed }) => [s.row, sugs.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, { opacity: full ? 0.4 : 1 }, pressed && { backgroundColor: p.bgSelected }]}>
            <Text style={[FONT.body, { color: p.accent }]}>＋ 직접 적기</Text>
          </Pressable>
        )}
      </Group>
      <Group title={`다음 주 · ${md(planWeek)}부터`}><Days cols={cols} today={today} onOpen={onOpen} goal /></Group>
    </>
  )
}

const s = StyleSheet.create({
  nav: { height: M.navH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center' },
  title: { paddingHorizontal: 20 },
  sub: { paddingHorizontal: 20, marginTop: 2 },
  seg: { marginHorizontal: M.cardInset, marginTop: 14 },
  gTitle: { fontSize: 13, lineHeight: 18, paddingTop: 18, paddingBottom: 6, paddingHorizontal: M.cardInset + 14 },
  gBox: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, overflow: 'hidden' },
  gFoot: { fontSize: 13, lineHeight: 18, paddingTop: 6, paddingHorizontal: M.cardInset + 14 },
  row: { minHeight: M.rowH, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  ic: { width: 20, textAlign: 'center', fontSize: 16 },
  ptrack: { height: 3, borderRadius: 2, marginLeft: 44, marginRight: 14, marginTop: -10, marginBottom: 10, overflow: 'hidden' },
  ev: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingLeft: 28, paddingRight: 14 },
  evBox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  mt: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  dseg: { flexDirection: 'row', borderRadius: 8, padding: 2, height: 32 },
  dseg1: { flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  link: { paddingHorizontal: M.cardInset + 14, paddingTop: 14 },
  pk: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: M.rowH2, paddingHorizontal: 14, paddingVertical: 10 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 14 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  big: { height: 44, borderRadius: 10, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  bigT: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
