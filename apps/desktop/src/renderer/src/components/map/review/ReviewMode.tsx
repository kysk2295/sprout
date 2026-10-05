// 31 §12 점검 — 일주일에 한 번, 3단계 안내(시안 mockups/work-map-modes-v2.html 점검).
// 스테퍼(① 돌아보기 → ② 밀린 일 → ③ 다음 주) + 단계마다 "이건 뭐예요?" 한 줄 + 캐릭터 한마디 + 오른쪽 아래 큰 "다음" 하나.
// 데이터는 스스로 읽는다(WorkMapView는 모드 자리만 준다). 계산은 data/review.ts, 진행은 그 주 안에서 기기에 기억.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { addDays } from '@sprout/schema/time'
import { isoWeekStart, XP } from '@sprout/schema/growth'
import { grantReviewXp } from '../../../data/growth'
import { useQuery } from '../../../data/useQuery'
import { dayKey } from '../../../lib/dates'
import { saveMoments } from '../../../data/mapMoments'
import {
  applyDecision, createGoals, dayStartIso, goStep, finishSummary, loadProgress, lookColumns, lookLine, membershipOf, mergeMissed, missedLine, missedOf, pickLine, pickRoom,
  planColumns, projectProgress, restoreSnap, reviewTarget, saveProgress, suggestGoals, togglePick, undecided, undoGoals, weekNumbers, weekRangeLabel,
  type Decision, type ReviewProgress, type SnapRow, type RGoal, type RList, type RTask, type Step, type Suggestion
} from '../../../data/review'
import type { AtLink, AtTag } from '@sprout/schema/autoTag'
import type { ModeSlotProps } from '../modes'
import { BuddyAvatar, useBuddy } from '../PlanChat'
import { CharacterArt } from '../../growth/CharacterArt'
import { LookStep, MissedStep, PickStep, type CardRow } from './ReviewSteps'
import './review.css'

const STEPS: { n: 1 | 2 | 3; label: string; what: string }[] = [
  { n: 1, label: '이번 주 돌아보기', what: '지난 7일을 한눈에 봐요. 고칠 건 없어요 — 보기만 하고 “다음”을 눌러요.' },
  { n: 2, label: '밀린 일 정하기', what: '못 한 일마다 하나씩 골라요. 안 고르면 “다음 주로”가 돼요.' },
  { n: 3, label: '다음 주 고르기', what: '다음 주에 꼭 할 목표를 3개까지 골라요. 고른 건 아래 다음 주 칸에 바로 놓여요.' }
]

// 이번 주·다음 2주 마감, 이번 주에 끝낸 것, 열린 최상위 전부(프로젝트 제안용)
const TASKS_SQL = `SELECT t.id, t.title, t.status, t.parent_id, t.due_at, t.start_at, t.completed_at, t.list_id, t.repeat_rule, t.priority FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
  WHERE t.deleted_at IS NULL AND t.title != '' AND l.archived_at IS NULL AND (
    (t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) >= ? AND substr(t.due_at, 1, 10) < ?) OR (t.status = 1 AND t.completed_at >= ? AND t.completed_at < ?) OR (t.status = 0 AND t.parent_id IS NULL))
  ORDER BY t.due_at, t.sort_order`
const GOALS_SQL = 'SELECT id, week_start, title, target, progress, status FROM kpis WHERE week_start IN (?, ?) ORDER BY sort_order, created_at'
// 프로젝트 = project 태그(구성원 규칙은 계획 모드와 같은 projectMembers — ✕ 행도 읽는다)
const TAGS_SQL = "SELECT id, name, kind, home_type, home_id FROM tags WHERE kind = 'project' ORDER BY sort_order, name"
const TAG_LINKS_SQL = "SELECT tt.id, tt.task_id, tt.tag_id, tt.state FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE g.kind = 'project'"
const LISTS_SQL = 'SELECT id, name, emoji, kind, folder_id FROM lists WHERE archived_at IS NULL ORDER BY sort_order'

export function ReviewMode({ lists, onSelectTask, onMode, notify }: ModeSlotProps & { onClose?: () => void }) {
  const [at] = useState(() => new Date())
  const { week, planWeek } = useMemo(() => reviewTarget(at), [at])
  const today = dayKey()
  const [p, setP] = useState<ReviewProgress>(() => loadProgress(week))
  const pRef = useRef(p)
  const patch = useCallback((f: (p: ReviewProgress) => ReviewProgress) => {
    const next = f(pRef.current)
    pRef.current = next
    saveProgress(next)
    setP(next)
  }, [])
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const { buddy, stage } = useBuddy()

  const tasks = useQuery<RTask>(TASKS_SQL, [week, addDays(planWeek, 14), dayStartIso(week), dayStartIso(planWeek)])
  const goals = useQuery<RGoal>(GOALS_SQL, [week, planWeek])
  const tagProjects = useQuery<AtTag>(TAGS_SQL)
  const tagLinks = useQuery<AtLink>(TAG_LINKS_SQL)
  const allLists = useQuery<RList>(LISTS_SQL)
  const loaded = !!tasks && !!goals && !!tagProjects && !!tagLinks && !!allLists

  // ② 카드 = 처음 본 밀린 일 + 새로 밀린 것(처리해도 카드는 남아 다시 고르거나 되돌린다)
  const live = useMemo(() => (tasks ? missedOf(tasks, week, today) : []), [tasks, week, today])
  useEffect(() => {
    if (!loaded || p.step === 4) return
    const merged = mergeMissed(pRef.current.missed, live)
    if (merged.length !== pRef.current.missed.length) patch((x) => ({ ...x, missed: merged }))
  }, [loaded, live, p.step, patch])
  const ids = p.missed.map((m) => m.id)
  const cardRows = useQuery<CardRow>(ids.length
    ? `SELECT t.id, t.title, t.status, t.due_at, t.deleted_at, t.list_id FROM tasks t WHERE t.id IN (${ids.map(() => '?').join(',')})`
    : 'SELECT id, title, status, due_at, deleted_at, list_id FROM tasks WHERE 0', ids)
  const cards = useMemo(() => {
    const byId = new Map((cardRows ?? []).map((r) => [r.id, r]))
    // 다른 곳에서 끝내거나 지운 것(여기서 정하지 않은)은 뺀다
    return p.missed.map((m) => ({ ...m, row: byId.get(m.id) })).filter((c) => c.row && (p.decisions[c.id] || (c.row.status === 0 && !c.row.deleted_at)))
  }, [cardRows, p.missed, p.decisions])
  const alive = useMemo(() => new Set(cards.map((c) => c.id)), [cards])

  const mem = useMemo(() => membershipOf(tasks ?? [], tagProjects ?? [], tagLinks ?? [], allLists ?? []), [tasks, tagProjects, tagLinks, allLists])
  const nums = useMemo(() => weekNumbers(tasks ?? [], goals ?? [], week, cards.filter((c) => !p.decisions[c.id]).length), [tasks, goals, week, cards, p.decisions])
  const projects = useMemo(() => projectProgress(tasks ?? [], mem.projects, mem.member, week), [tasks, mem, week])
  const lookCols = useMemo(() => lookColumns(tasks ?? [], week, today), [tasks, week, today])

  const planGoals = (goals ?? []).filter((g) => g.week_start === planWeek && !p.created.some((c) => c.goalId === g.id))
  const room = pickRoom(planGoals.length)
  const sugs = useMemo<Suggestion[]>(() => {
    const base = suggestGoals({ tasks: tasks ?? [], projects: mem.projects, member: mem.member, goals: (goals ?? []).filter((g) => !p.created.some((c) => c.goalId === g.id)), week, planWeek, today, exclude: new Set(ids) })
    return [...base, ...p.custom.map((c) => ({ key: c.key, kind: 'custom' as const, title: c.title, meta: '직접 적음', target: 1, taskIds: [] }))]
  }, [tasks, mem, goals, week, planWeek, today, ids.join(','), p.custom, p.created]) // eslint-disable-line react-hooks/exhaustive-deps
  const picked = sugs.filter((s) => p.picks.includes(s.key))
  const goalTasks = useMemo(() => new Set(picked.flatMap((s) => s.taskIds)), [picked])
  const planCols = useMemo(() => planColumns(tasks ?? [], planWeek, goalTasks), [tasks, planWeek, goalTasks])

  // ── ② 정하기 ──
  const label = (id: string) => cards.find((c) => c.id === id)?.row?.title ?? ''
  const decide = async (id: string, d: Decision) => {
    if (busy.has(id)) return
    setBusy((b) => new Set(b).add(id))
    try {
      const prev = pRef.current.decisions[id]
      const prevSnap = pRef.current.snaps[id]
      if (prev && prevSnap) await restoreSnap(prevSnap)
      if (prev === d) { // 같은 것을 다시 누르면 고르기 전으로
        patch((x) => { const { [id]: _a, ...decisions } = x.decisions; const { [id]: _b, ...snaps } = x.snaps; return { ...x, decisions, snaps } })
        return
      }
      const snap = await applyDecision(id, d, planWeek, today)
      patch((x) => ({ ...x, decisions: { ...x.decisions, [id]: d }, snaps: { ...x.snaps, [id]: snap } }))
      notify(DONE_TEXT[d](label(id)), { label: '되돌리기', run: () => void undoOne(id) })
    } finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n }) }
  }
  const undoOne = async (id: string) => {
    const snap = pRef.current.snaps[id]
    if (snap) await restoreSnap(snap)
    patch((x) => { const { [id]: _a, ...decisions } = x.decisions; const { [id]: _b, ...snaps } = x.snaps; return { ...x, decisions, snaps } })
  }
  /** 안 고른 것 전부 다음 주로(모두 다음 주로 · ②의 다음) — 토스트 하나로 한꺼번에 되돌리기 */
  const allNext = async (): Promise<number> => {
    const todo = undecided(pRef.current, alive)
    if (!todo.length) return 0
    const snaps: Record<string, SnapRow[]> = {}
    for (const id of todo) snaps[id] = await applyDecision(id, 'next', planWeek, today)
    patch((x) => ({ ...x, decisions: { ...x.decisions, ...Object.fromEntries(todo.map((id) => [id, 'next' as const])) }, snaps: { ...x.snaps, ...snaps } }))
    notify(`밀린 ${todo.length}개를 다음 주로 옮겼어요`, { label: '되돌리기', run: () => void (async () => { for (const id of todo) await undoOne(id) })() })
    return todo.length
  }

  // ── 단계 이동 ──
  const go = (step: Step) => patch((x) => goStep(x, step))
  const [finishing, setFinishing] = useState(false)
  const finish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      if (pRef.current.created.length) await undoGoals(pRef.current.created) // 다시 고른 거면 지난번 것을 바꾼다
      const created = await createGoals(planWeek, picked)
      patch((x) => ({ ...goStep(x, 4), created, finishedAt: new Date().toISOString() }))
      saveMoments({ review: week }) // 오늘 목록 점검 카드는 이 주에 다시 안 뜬다
      // 10 §6 주간 점검 +30 — 점검한 주마다 한 번(다시 끝내도 그대로). "+30"은 sprout:xp로 캐릭터 카드에 뜬다
      await grantReviewXp(week).catch((e) => console.warn('[review] XP', e))
      if (created.length) notify(`다음 주 목표 ${created.length}개를 정했어요`, { label: '되돌리기', run: () => void undoFinish() })
    } finally { setFinishing(false) }
  }
  const undoFinish = async () => {
    await undoGoals(pRef.current.created)
    patch((x) => ({ ...x, created: [], step: 3, finishedAt: null }))
  }
  const next = async () => {
    if (p.step === 1) go(2)
    else if (p.step === 2) { await allNext(); go(3) }
    else if (p.step === 3) await finish()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && p.step < 4) { e.preventDefault(); void next() }
  }

  // 끝 화면 알약: 이 주 점검 XP를 받았으면(원장 기준 — 다른 기기에서 받았어도)
  const reviewXp = useQuery<{ amount: number }>('SELECT amount FROM xp_events WHERE kind = ? AND ref_id = ? LIMIT 1', ['review', `review:${isoWeekStart(week)}`])
  const step = p.step
  const reached = Math.max(p.reached ?? 1, step)
  const left = cards.filter((c) => !p.decisions[c.id]).length
  const line = step === 1 ? lookLine(nums) : step === 2 ? missedLine(left, cards.length) : step === 3 ? pickLine(sugs.filter((s) => s.kind !== 'custom'), today, planWeek) : ''

  return (
    <section className="rv-root" aria-label="주간 점검" onKeyDown={onKey}>
      <nav className="rv-stepper" aria-label="점검 단계">
        {STEPS.map((s, i) => {
          const on = s.n === step
          const ok = !on && s.n < reached // 지나온 단계 ✓
          const back = !on && s.n <= reached // 가 본 단계는 앞뒤로 다시 갈 수 있다
          return (
            <span key={s.n} className="rv-stepper__item">
              {i > 0 && <span className="rv-sline" aria-hidden="true" />}
              <button className={`rv-sx${on ? ' is-on' : ''}${ok ? ' is-ok' : ''}${back ? ' is-back' : ''}`} aria-current={on ? 'step' : undefined}
                disabled={!back && !on} onClick={() => go(s.n)} title={back ? `${s.label} 다시 보기` : undefined}>
                <i>{ok ? '✓' : s.n}</i>{s.n === 3 && planWeek <= today ? '이번 주 고르기' : s.label}
              </button>
            </span>
          )
        })}
        <span className="rv-stepper__sp" />
        <span className="rv-stepper__range">{weekRangeLabel(week)} · 약 5분</span>
      </nav>

      {step < 4 && <div className="rv-what"><b>이건 뭐예요?</b>{STEPS[step - 1].what}</div>}
      {step < 4 && line && (
        <div className="rv-bub" role="status">
          <BuddyAvatar buddy={buddy} stage={stage} size={34} />
          <div className="rv-bub__msg">{line}</div>
        </div>
      )}

      <div className="rv-body">
        {!loaded ? <div className="rv-loading" /> : step === 1 ? (
          <LookStep nums={nums} projects={projects} byTag={mem.byTag} cols={lookCols} today={today} onOpen={onSelectTask} />
        ) : step === 2 ? (
          <MissedStep cards={cards} decisions={p.decisions} busy={busy} lists={lists} onDecide={(id, d) => void decide(id, d)} onOpen={onSelectTask} />
        ) : step === 3 ? (
          <PickStep sugs={sugs} picks={p.picks} room={room} existing={planGoals.length} cols={planCols} today={today} planWeek={planWeek}
            onToggle={(k) => patch((x) => ({ ...x, picks: togglePick(x.picks, k, room) }))}
            onCustom={(title) => patch((x) => { const key = `custom:${Date.now()}`; return { ...x, custom: [...x.custom, { key, title }], picks: togglePick(x.picks, key, room) } })}
            onOpen={onSelectTask} />
        ) : (
          <div className="rv-fin">
            <CharacterArt species={buddy.species} stage={stage} size={120} mood="happy" />
            <h3>다음 주 준비 끝! 월요일 아침에 ⚡로 알려 줄게</h3>
            <p>{finishSummary(p)}</p>
            {p.created.length > 0 && <ul className="rv-fin__goals">{p.created.map((c) => <li key={c.goalId}>🎯 {c.title}</li>)}</ul>}
            {!!reviewXp?.length && <span className="map-xp">주간 점검 +{XP.review} XP</span>}
            <div className="rv-fin__acts">
              <button className="map-btn map-btn--primary" onClick={() => onMode('plan')}>계획 보러 가기</button>
              <button className="map-btn" onClick={() => go(3)}>다음 주 다시 고르기</button>
            </div>
          </div>
        )}
      </div>

      {step < 4 && (
        <footer className="rv-foot">
          <span className="rv-foot__hint">{step} / 3 단계{step === 2 ? ' · 끝냄은 XP 없이 닫혀요' : step === 3 ? ` · ${weekRangeLabel(planWeek)}` : ''}</span>
          {step === 2 && left > 0 && <button className="map-btn rv-btn" onClick={() => void allNext()}>모두 다음 주로</button>}
          {step > 1 && <button className="map-btn rv-btn" onClick={() => go((step - 1) as Step)}>← 이전</button>}
          <button className="map-btn map-btn--primary rv-next" disabled={finishing || !loaded} onClick={() => void next()} title="⌘↵">
            {step === 3 ? '점검 끝내기 ✓' : '다음 →'}
          </button>
        </footer>
      )}
    </section>
  )
}

const quote = (t: string) => `'${[...t].length > 16 ? `${[...t].slice(0, 15).join('')}…` : t}'`
const DONE_TEXT: Record<Decision, (t: string) => string> = {
  next: (t) => `${quote(t)} 다음 주 월요일로 옮겼어요`,
  someday: (t) => `${quote(t)} 날짜를 뺐어요`,
  done: (t) => `${quote(t)} 끝냈어요 (XP 없음)`,
  trash: (t) => `${quote(t)} 휴지통으로 옮겼어요`
}
