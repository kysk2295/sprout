// 31 §11 같이 계획 짜기 — 계획 모드 오른쪽 대화 칸. 내 성장 캐릭터가 짧게 묻고(최대 4개), 답하는 즉시 지도에 할 일·마감·순서 선이 생긴다.
// 대화는 상태 기계(data/planChat.ts)가 정하고, 여기서는 효과를 실행(data/planActions.ts — 보통 편집)하고 결과를 다시 넣는다. 대화는 저장하지 않는다.
// 같은 목소리의 한 줄 말풍선(PartnerLine)은 점검·정리 모드가 쓴다(§11.9).
import { ArrowUp, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { buddyOf, type Buddy } from '../../data/diary'
import { readMotionPref, useGrowth } from '../../data/growth'
import { isUnavailable } from '../../data/ai'
import { chipsOf, initPlan, inputOpen, planReduce, questionNo, type Effect, type PlanEvent, type PlanState } from '../../data/planChat'
import {
  applyManualSteps, createGoalTask, journalChanged, loadPlanTask, newJournal, planCandidates, recordComplete, savePlanUndo, setPlanDue, splitWithAi, toGoal, toStep, undoLastSplit, undoPlanSession, type PlanJournal
} from '../../data/planActions'
import { useQuery } from '../../data/useQuery'
import type { MapList } from '../../data/map'
import type { TaskActions } from '../../lib/taskActions'
import { dayKey } from '../../lib/dates'
import { CharacterArt, type CharacterMood } from '../growth/CharacterArt'
import './planchat.css'

const STAGE_RING = ['#9fd39f', '#7cc472', '#5DBB63', '#f4c542', '#ff8fa3']
const SAY_DELAY = 350

/** 움직임 줄이기 = OS 설정 또는 성장 화면의 스위치(일기와 같음) */
export function useReducedMotion() {
  const query = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || readMotionPref()
  const [reduced, setReduced] = useState(query)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(query())
    mq?.addEventListener('change', on)
    window.addEventListener('focus', on)
    return () => { mq?.removeEventListener('change', on); window.removeEventListener('focus', on) }
  }, [])
  return reduced
}
/** 내 성장 캐릭터(없으면 새싹) + 단계 */
export function useBuddy(): { buddy: Buddy; stage: number } {
  const { character, progress } = useGrowth()
  return { buddy: buddyOf(character ?? undefined), stage: progress.stage }
}
export function BuddyAvatar({ buddy, stage, size = 30, mood = 'smile', busy }: { buddy: Buddy; stage: number; size?: number; mood?: CharacterMood; busy?: boolean }) {
  return (
    <span className={`pc-av${busy ? ' is-busy' : ''}`} style={{ '--ring': STAGE_RING[Math.max(0, stage - 1)], width: size, height: size } as CSSProperties} aria-hidden="true">
      <CharacterArt species={buddy.species} stage={stage} size={size} mood={mood} />
    </span>
  )
}

export type PlanRequest = { key: number; taskId?: string }
type KidRow = { id: string; title: string; status: number; due_at: string | null; deleted_at: string | null; parent_id: string | null }

export function PlanChat({ req, lists, aiOk, actions, onLight, onReveal, onFresh, onClose, onUndone, onGoal }: {
  req: PlanRequest
  lists: MapList[]
  aiOk: boolean | null
  actions: TaskActions
  /** ⚡ 첫 걸음 밝히기(null = 끔) */
  onLight: (id: string | null) => void
  /** 지도에서 그 노드로 이동(접혀 있으면 펼침) */
  onReveal: (id: string) => void
  /** 막 만든 노드·선(피어나는 움직임) */
  onFresh: (tasks: string[], links: string[]) => void
  /** 닫기 — 만든 것은 남는다. 바꾼 게 있으면 기록을 넘긴다(토스트 되돌리기) */
  onClose: (journal: PlanJournal | null) => void
  onUndone: (r: { removed: number; kept: number }) => void
  /** 같이 짜는 큰 할 일(지도에서 굵게 🎯) */
  onGoal: (id: string | null) => void
}) {
  const { buddy, stage } = useBuddy()
  const reduced = useReducedMotion()
  const today = dayKey()
  const [state, setState] = useState<PlanState>(() => initPlan(buddy.name, today))
  const ref = useRef(state)
  const journal = useRef<PlanJournal>(newJournal())
  const abort = useRef<AbortController | undefined>(undefined)
  const alive = useRef(true)
  const [, bump] = useState(0)
  const [draft, setDraft] = useState('')
  const [shown, setShown] = useState(0)
  const [typing, setTyping] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const props = useRef({ lists, aiOk, actions, onLight, onReveal, onFresh, onClose })
  props.current = { lists, aiOk, actions, onLight, onReveal, onFresh, onClose }

  const dispatch = useCallback((ev: PlanEvent) => {
    if (!alive.current) return
    const out = planReduce(ref.current, ev)
    ref.current = out.state
    setState(out.state)
    for (const f of out.effects) void runEffect(f)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => { savePlanUndo(journal.current); bump((n) => n + 1) }
  const runSplit = async (taskId: string, again: boolean) => {
    const p = props.current
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { dispatch({ type: 'splitFailed', reason: 'offline' }); return }
    if (p.aiOk === false) { dispatch({ type: 'splitFailed', reason: 'down' }); return }
    const c = new AbortController()
    abort.current = c
    try {
      if (again) await undoLastSplit(journal.current)
      const steps = await splitWithAi(journal.current, taskId, p.lists, today, { signal: c.signal, onQueue: (n) => dispatch({ type: 'queue', position: n }) })
      if (c.signal.aborted) return
      save()
      if (!steps.length) { dispatch({ type: 'splitFailed', reason: 'empty' }); return }
      p.onFresh(steps.map((s) => s.id), journal.current.lastSplit?.links ?? [])
      dispatch({ type: 'stepsReady', steps })
    } catch (e) {
      if (c.signal.aborted) { dispatch({ type: 'splitFailed', reason: 'stopped' }); return }
      const msg = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
      if (/한도|잦아요|다 썼어요|이미 처리 중|이미 사용/.test(msg)) dispatch({ type: 'splitFailed', reason: 'limit', message: msg })
      else if (/형식|JSON|Unexpected/.test(msg)) dispatch({ type: 'splitFailed', reason: 'format' })
      else dispatch({ type: 'splitFailed', reason: isUnavailable(e) ? 'down' : 'format' })
    } finally { if (abort.current === c) abort.current = undefined }
  }
  const runEffect = async (f: Effect) => {
    const p = props.current
    const j = journal.current
    try {
      switch (f.kind) {
        case 'createGoal': {
          const goal = await createGoalTask(j, f.title, f.due)
          save()
          p.onFresh([goal.id], [])
          dispatch({ type: 'goalReady', goal, steps: [] })
          break
        }
        case 'useGoal': {
          const r = await loadPlanTask(f.id)
          if (!r) { dispatch({ type: 'observed', goal: null, steps: [] }); break }
          j.title ||= r.goal.title
          dispatch({ type: 'goalReady', goal: r.goal, steps: r.steps })
          break
        }
        case 'setDue': await setPlanDue(j, f.taskId, f.due); save(); break
        case 'split': await runSplit(f.taskId, false); break
        case 'resplit': await runSplit(f.taskId, true); break
        case 'manualSteps': {
          const steps = await applyManualSteps(j, f.taskId, f.titles)
          save()
          p.onFresh(steps.map((s) => s.id), j.lastSplit?.links ?? [])
          dispatch({ type: 'stepsReady', steps })
          break
        }
        case 'complete': await p.actions.complete(f.ids); await recordComplete(j, f.ids); save(); break
        case 'light': p.onLight(f.id); break
        case 'focus': p.onReveal(f.id); break
        case 'close': close(); break
      }
    } catch (e) {
      console.error('[plan-chat]', e)
      if (f.kind === 'createGoal' || f.kind === 'manualSteps' || f.kind === 'useGoal') dispatch({ type: 'splitFailed', reason: 'format' })
    }
  }
  const close = () => {
    abort.current?.abort()
    props.current.onLight(null)
    props.current.onClose(journalChanged(journal.current) ? journal.current : null)
  }

  // 시작(입구가 바뀌면 새 대화). 할 일이 정해졌으면 ①을 건너뛴다
  useEffect(() => {
    alive.current = true
    let off = false
    journal.current = newJournal()
    ref.current = initPlan(buddy.name, today)
    setState(ref.current); setShown(0)
    void (async () => {
      const [task, candidates] = await Promise.all([req.taskId ? loadPlanTask(req.taskId) : Promise.resolve(null), planCandidates(today)])
      if (off) return
      if (task) journal.current.title = task.goal.title
      dispatch({ type: 'start', goal: task?.goal ?? null, steps: task?.steps, candidates: candidates.filter((c) => c.id !== req.taskId) })
    })()
    return () => { off = true; abort.current?.abort() }
  }, [req.key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { alive.current = false }, [])
  // 캐릭터 이름이 늦게 읽히면 고친다(첫 말 전에)
  useEffect(() => { if (ref.current.name !== buddy.name) { ref.current = { ...ref.current, name: buddy.name }; setState(ref.current) } }, [buddy.name])

  useEffect(() => { onGoal(state.goal?.id ?? null) }, [state.goal?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onGoal(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  // 지도(로컬 DB)에서 바뀐 것 → 대화(단계 제목·완료, 큰 할 일 없어짐, 첫 걸음을 끝내면 다음 걸음)
  const goalId = state.goal?.id ?? ''
  const rows = useQuery<KidRow & { sort_order: number }>(
    "SELECT id, title, status, due_at, deleted_at, parent_id, sort_order FROM tasks WHERE id = ? OR parent_id = ? ORDER BY sort_order, created_at", [goalId, goalId])
  useEffect(() => {
    if (!goalId || !rows) return
    const g = rows.find((r) => r.id === goalId)
    const kids = rows.filter((r) => r.parent_id === goalId)
    dispatch({
      type: 'observed',
      goal: g && !g.deleted_at ? toGoal(g) : null,
      steps: kids.filter((r) => !r.deleted_at && r.title.trim() && (r.status === 0 || r.status === 1)).map(toStep),
      removed: kids.filter((r) => r.deleted_at || r.status === 2).map((r) => r.id)
    })
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // 캐릭터 말은 하나씩(타자 점 → 말). 내 말·시스템 줄은 바로. 동작 줄이기면 지연 없음
  useEffect(() => {
    if (shown >= state.msgs.length) { setTyping(false); return }
    const m = state.msgs[shown]
    if (m.who !== 'bud' || reduced) { setShown((n) => n + 1); return }
    setTyping(true)
    const t = window.setTimeout(() => { setTyping(false); setShown((n) => n + 1) }, SAY_DELAY)
    return () => window.clearTimeout(t)
  }, [shown, state.msgs, reduced])
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [shown, typing, state.busy])

  const settled = shown >= state.msgs.length
  const { chips, skip } = chipsOf(state)
  const open = inputOpen(state) && settled
  useEffect(() => { if (open) inputRef.current?.focus() }, [open, state.phase])
  const send = () => {
    const t = draft.trim()
    if (!t || !open) return
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    dispatch({ type: 'answer', text: t })
  }
  const undo = async () => {
    abort.current?.abort()
    const j = journal.current
    const r = await undoPlanSession(j, (ids) => actions.reopen(ids))
    journal.current = newJournal()
    onLight(null)
    onUndone(r)
  }
  // ⌘1~⌘5 = 답 칩, Esc = 닫기(입력이 비어 있을 때)
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key) && settled) {
      const c = chips[Number(e.key) - 1]
      if (c) { e.preventDefault(); dispatch({ type: 'chip', id: c.id }) }
    } else if (e.key === 'Escape' && !draft) { e.preventDefault(); close() }
  }
  const qn = questionNo(state.phase)
  const changed = journalChanged(journal.current)
  const waiting = state.busy && state.phase === 'split'

  return (
    <aside className={`pc${reduced ? ' is-reduced' : ''}`} aria-label={`${buddy.name}와 같이 계획 짜기`} onKeyDown={onKey}>
      <header className="pc-head">
        <BuddyAvatar buddy={buddy} stage={stage} size={30} mood={state.phase === 'end' ? 'happy' : 'smile'} />
        <div className="pc-head__who"><b>{buddy.name}</b><small>같이 계획 짜기</small></div>
        {qn && <span className="pc-head__q" aria-label={`물음 4개 중 ${qn}번째`}>{[1, 2, 3, 4].map((i) => <i key={i} className={i === qn ? 'is-on' : i < qn ? 'is-past' : ''} />)}</span>}
        {changed && <button className="pc-head__undo" onClick={() => void undo()} title="이번 대화에서 바꾼 것을 한 번에 되돌려요"><RotateCcw />되돌리기</button>}
        <button className="icon-btn pc-head__x" aria-label="닫기" title="닫기 — 만든 건 남아요" onClick={close}><X /></button>
      </header>
      <div className="pc-msgs" ref={listRef} role="log" aria-live="polite">
        {state.msgs.slice(0, shown).map((m) => m.who === 'sys'
          ? <div key={m.id} className="pc-msg is-sys">{m.text}</div>
          : m.who === 'me'
            ? <div key={m.id} className="pc-msg is-me"><div className="pc-msg__bb">{m.text}</div></div>
            : <div key={m.id} className={`pc-msg${m.strong ? ' is-strong' : ''}`}><BuddyAvatar buddy={buddy} stage={stage} size={26} mood={m.strong ? 'happy' : 'smile'} /><div className="pc-msg__bb">{m.text}</div></div>)}
        {(typing || (settled && state.busy)) && (
          <div className="pc-msg is-busy">
            <BuddyAvatar buddy={buddy} stage={stage} size={26} mood="default" busy />
            <div className="pc-msg__bb">
              <span className="pc-typing"><i /><i /><i /></span>
              {settled && waiting && state.queue > 0 && <span className="pc-queue">대기 {state.queue}번째…</span>}
            </div>
          </div>
        )}
      </div>
      {settled && (chips.length > 0 || skip) && (
        <div className="pc-chips" role="group" aria-label="빠른 답">
          {chips.map((c, i) => <button key={c.id} className="pc-chip" title={i < 5 ? `⌘${i + 1}` : undefined} onClick={() => dispatch({ type: 'chip', id: c.id })}>{c.label}</button>)}
          {skip && <button className="pc-skip" onClick={() => dispatch({ type: 'skip' })}>{state.phase === 'goal' ? '다음에 할래' : '건너뛰기'}</button>}
        </div>
      )}
      <div className={`pc-in${open ? '' : ' is-off'}`}>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          disabled={!open}
          placeholder={state.phase === 'split-manual' ? '예: 자료 조사, 목차 잡기, 초안 쓰기' : '답하거나, 지도에서 카드를 끌어 고쳐도 돼'}
          aria-label={`${buddy.name}에게 답하기`}
          onChange={(e) => { setDraft(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 96)}px` }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
        />
        {waiting
          ? <button className="pc-send" aria-label="멈추기" onClick={() => abort.current?.abort()}><X /></button>
          : <button className="pc-send" aria-label="보내기" disabled={!open || !draft.trim()} onClick={send}><ArrowUp /></button>}
      </div>
    </aside>
  )
}

/** §11.9 점검·정리 모드 맨 위 한 줄: 아바타 + 한 문장 + 답 칩(아래 컨트롤과 같은 동작). ✕ = 이번에만 숨김. stacked = 칩을 말 아래로(정리 패널처럼 좁은 곳, 닫기는 패널 ✕) */
export function PartnerLine({ text, chips, stacked }: { text: string; chips: { label: string; run: () => void }[]; stacked?: boolean }) {
  const { buddy, stage } = useBuddy()
  const [hidden, setHidden] = useState<string | null>(null)
  const key = useMemo(() => text, [text])
  if (hidden === key) return null
  const buttons = chips.map((c) => <button key={c.label} className="pc-chip" onClick={c.run}>{c.label}</button>)
  return (
    <div className={`pc-partner${stacked ? ' is-stacked' : ''}`} role="status">
      <BuddyAvatar buddy={buddy} stage={stage} size={26} />
      {stacked
        ? <div className="pc-partner__col"><div className="pc-partner__bb">{text}</div>{buttons.length > 0 && <div className="pc-partner__chips">{buttons}</div>}</div>
        : <><div className="pc-partner__bb">{text}</div>{buttons}</>}
      {!stacked && <button className="icon-btn pc-partner__x" aria-label="숨기기" title="이번에만 숨겨요" onClick={() => setHidden(key)}><X /></button>}
    </div>
  )
}
