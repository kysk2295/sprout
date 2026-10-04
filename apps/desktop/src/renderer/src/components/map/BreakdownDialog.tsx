// 31 작업 지도 v3 §4.2 쪼개기 창(가운데, 폭 600, 높이 최대 640) — 덧붙일 말 → [쪼개기] → 미리 보기(고치기·끄기·순서) → [N개 만들기].
// AI 답은 창 안에만 있고 저장하지 않는다. 만들면 하위 할 일 + 순서 선(한 트랜잭션), 토스트 ⟲ 24시간 되돌리기.
import { GripVertical, Plus, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { isUnavailable } from '../../data/ai'
import {
  addStep, applyBreakdown, askBreakdown, BREAKDOWN, bridgedAfter, countNew, removeStep, reorderSteps, stepsInvalid, stepWouldCycle, type BreakdownSnapshot, type BreakdownTask, type Step
} from '../../data/breakdown'
import { getDb } from '../../data/db'
import { listTitle, type MapList } from '../../data/map'
import { dayKey } from '../../lib/dates'
import { Dialog } from '../Dialog'
import { MenuItem, Popover } from '../Popover'
import { ListIcon } from './parts'

type Phase =
  | { s: 'idle' }
  | { s: 'wait'; position: number }
  | { s: 'run' }
  | { s: 'preview' }
  | { s: 'error'; text: string; retry: boolean }

export function BreakdownDialog({ taskId, lists, aiOk, onClose, onDone, onAddSubtask }: {
  taskId: string; lists: MapList[]; aiOk: boolean | null
  onClose: () => void
  onDone: (snap: BreakdownSnapshot, count: number) => void
  /** AI를 못 쓸 때: 하위 할 일 직접 추가(02 동작) */
  onAddSubtask: (parentId: string) => void
}) {
  const [task, setTask] = useState<BreakdownTask & { list_name: string | null }>()
  const [existing, setExisting] = useState<string[]>([])
  const [hint, setHint] = useState('')
  const [memo, setMemo] = useState(false)
  const [phase, setPhase] = useState<Phase>({ s: 'idle' })
  const [steps, setSteps] = useState<Step[]>([])
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'subtask' | 'sibling'>('subtask')
  const [afterMenu, setAfterMenu] = useState<{ key: string; anchor: HTMLElement }>()
  const [modeMenu, setModeMenu] = useState<HTMLElement>()
  const [drag, setDrag] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const abort = useRef<AbortController | undefined>(undefined)
  const hintRef = useRef<HTMLInputElement>(null)
  const list = useMemo(() => lists.find((l) => l.id === task?.list_id), [lists, task])

  useEffect(() => {
    let alive = true
    void (async () => {
      const db = await getDb()
      const t = await db.get<BreakdownTask & { list_name: string | null }>('SELECT t.id, t.title, t.list_id, t.due_at, t.start_at, t.content, l.name AS list_name FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.id = ?', [taskId])
      const kids = await db.getAll<{ title: string }>("SELECT title FROM tasks WHERE parent_id = ? AND deleted_at IS NULL AND title != '' ORDER BY sort_order", [taskId])
      if (!alive) return
      setTask(t ?? undefined)
      setExisting(kids.map((k) => k.title))
    })()
    return () => { alive = false; abort.current?.abort() }
  }, [taskId])

  const busy = phase.s === 'wait' || phase.s === 'run'
  const ask = async () => {
    if (!task || busy) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setPhase({ s: 'error', text: '연결되면 쓸 수 있어요.', retry: true }); return }
    const c = new AbortController()
    abort.current = c
    setPhase({ s: 'run' })
    try {
      const r = await askBreakdown(task, { list: list ? listTitle(list) : task.list_name, existing, hint, memo, today: dayKey() }, {
        signal: c.signal,
        onQueue: (position) => setPhase(position > 0 ? { s: 'wait', position } : { s: 'run' })
      })
      if (c.signal.aborted) return
      if (!r.steps.length) { setPhase({ s: 'error', text: '쪼갤 단계를 찾지 못했어요. 덧붙일 말을 적고 다시 해 보세요.', retry: false }); return }
      setSteps(r.steps)
      setNote(r.note)
      setPhase({ s: 'preview' })
    } catch (e) {
      if (c.signal.aborted) { setPhase(steps.length ? { s: 'preview' } : { s: 'idle' }); return }
      const msg = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
      // 429(분·하루 상한)는 서버 문구 그대로, 형식 깨짐은 다시 시도, 그 밖의 연결 문제는 "쓸 수 없어요"
      if (/한도|잦아요|다 썼어요|이미 처리 중|이미 사용/.test(msg)) setPhase({ s: 'error', text: msg, retry: false })
      else if (/형식|JSON|Unexpected/.test(msg)) setPhase({ s: 'error', text: '제안을 읽지 못했어요.', retry: true })
      else if (isUnavailable(e) || /없는 AI 기능/.test(msg)) setPhase({ s: 'error', text: '지금은 AI를 쓸 수 없어요.', retry: true })
      else setPhase({ s: 'error', text: msg || '지금은 AI를 쓸 수 없어요.', retry: true })
    } finally { if (abort.current === c) abort.current = undefined }
  }
  const stop = () => abort.current?.abort()
  const close = () => { if (busy) stop(); else onClose() }

  const counts = countNew(steps)
  const invalid = stepsInvalid(steps)
  const bridged = bridgedAfter(steps)
  const create = async () => {
    if (!task || saving || !counts.tasks || invalid) return
    setSaving(true)
    try {
      const snap = await applyBreakdown(task, steps, mode)
      onDone(snap, snap.tasks.length)
    } finally { setSaving(false) }
  }
  const patch = (key: string, p: Partial<Step>) => setSteps((ss) => ss.map((s) => (s.key === key ? { ...s, ...p } : s)))
  const num = new Map(steps.map((s, i) => [s.key, i + 1]))
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (phase.s === 'preview') void create(); else void ask() }
  }
  const rowKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const rows = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.bd-step') ?? [])]
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[i + 1]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); rows[i - 1]?.focus() }
    else if (e.key === ' ') { e.preventDefault(); patch(steps[i].key, { on: !steps[i].on }) }
  }

  if (aiOk === false) {
    return (
      <Dialog label="큰 일 쪼개기" className="map-dialog bd" onClose={onClose}>
        <header className="bd__head"><h2><Sparkles />큰 일 쪼개기</h2><button className="icon-btn" aria-label="닫기" onClick={onClose}><X /></button></header>
        <p className="bd__msg">지금은 AI를 쓸 수 없어요. 하위 할 일은 직접 추가할 수 있어요.</p>
        <footer><button className="map-btn" onClick={onClose}>닫기</button><button className="map-btn map-btn--primary" data-autofocus onClick={() => { onClose(); onAddSubtask(taskId) }}>하위 할 일 추가</button></footer>
      </Dialog>
    )
  }

  return (
    <Dialog label="큰 일 쪼개기" className="map-dialog bd" onClose={close}>
      <div onKeyDown={onKey} className="bd__wrap">
        <header className="bd__head"><h2><Sparkles />큰 일 쪼개기</h2><button className="icon-btn" aria-label="닫기" onClick={close}><X /></button></header>
        {task && (
          <div className="bd__target">
            {list && <ListIcon list={list} />}
            <span className="bd__target-title">{task.title}</span>
            {task.due_at && <span className="bd__meta">{task.due_at.slice(5, 10).replace('-', '/')} 마감</span>}
            {existing.length > 0 && <span className="bd__meta">하위 {existing.length}개 있음</span>}
          </div>
        )}
        <div className="bd__ask">
          <input ref={hintRef} data-autofocus className="bd__hint" value={hint} maxLength={BREAKDOWN.hint} placeholder="예: 다음 주 금요일까지, 하루 2시간 정도" onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey && phase.s !== 'preview') { e.preventDefault(); void ask() } }} />
          {busy
            ? <button className="map-btn" onClick={stop}>멈추기</button>
            : <button className={`map-btn${phase.s === 'preview' ? '' : ' map-btn--primary'}`} disabled={!task} onClick={() => void ask()}>{phase.s === 'preview' ? '다시 제안' : '쪼개기'}</button>}
        </div>
        {task?.content?.trim() && <label className="bd__memo"><input type="checkbox" checked={memo} onChange={(e) => setMemo(e.target.checked)} />메모도 함께 보내기</label>}

        {phase.s === 'wait' && <p className="bd__status">대기 {phase.position}번째…</p>}
        {phase.s === 'run' && <p className="bd__status"><span className="bd__spin" />단계를 만드는 중…</p>}
        {phase.s === 'error' && <p className="bd__status is-error">{phase.text}{phase.retry && <button className="map-btn map-btn--text" onClick={() => void ask()}>다시 시도</button>}</p>}

        {phase.s === 'preview' && (
          <>
            <div className="bd__preview-head">
              {note ? <span className="bd__note">{note}</span> : <span />}
              <OrderPicture steps={steps} bridged={bridged} />
            </div>
            <div className="bd__steps">
              {steps.map((s, i) => (
                <div key={s.key} className={`bd-step${s.on ? '' : ' is-off'}${drag === i ? ' is-drag' : ''}`} tabIndex={0} onKeyDown={rowKey(i)}
                  onDragOver={(e) => { if (drag !== null) e.preventDefault() }}
                  onDrop={(e) => { e.preventDefault(); if (drag === null || drag === i) return; const next = reorderSteps(steps, drag, i); if (next) setSteps(next); setDrag(null) }}>
                  <input type="checkbox" checked={s.on} aria-label="만들기" onChange={(e) => patch(s.key, { on: e.target.checked })} />
                  <span className="bd-step__n">{i + 1}</span>
                  <input className={`bd-step__title${s.on && !s.title.trim() ? ' is-bad' : ''}`} value={s.title} maxLength={BREAKDOWN.title} placeholder="단계 이름" onChange={(e) => patch(s.key, { title: e.target.value })} />
                  <span className="bd-step__days"><input type="number" min={1} max={BREAKDOWN.maxDays} value={s.days ?? ''} aria-label="예상 일수" onChange={(e) => { const v = Number(e.target.value); patch(s.key, { days: e.target.value === '' ? null : Number.isInteger(v) && v >= 1 && v <= BREAKDOWN.maxDays ? v : s.days }) }} />일</span>
                  <button className="bd-step__after" onClick={(e) => setAfterMenu({ key: s.key, anchor: e.currentTarget })} title="먼저 해야 하는 단계">
                    {s.after.length ? `먼저 ${s.after.map((a) => num.get(a)).filter(Boolean).join('·')}` : '먼저 —'}
                  </button>
                  <span className="bd-step__grip" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.key); setDrag(i) }} onDragEnd={() => setDrag(null)} title="끌어 순서 바꾸기"><GripVertical /></span>
                  <button className="icon-btn bd-step__x" aria-label="지우기" onClick={() => setSteps((ss) => removeStep(ss, s.key))}><X /></button>
                </div>
              ))}
              <button className="map-btn map-btn--text bd__add" onClick={() => setSteps(addStep)}><Plus />단계 추가</button>
            </div>
            <div className="bd__where">
              <button className="map-btn" onClick={(e) => setModeMenu(e.currentTarget)}>{mode === 'subtask' ? `하위 할 일로 · 부모: ${task?.title ?? ''}` : '같은 리스트의 할 일로'} ▾</button>
            </div>
          </>
        )}

        <footer className="bd__foot">
          {phase.s === 'preview' && <span className="bd__count">새 할 일 {counts.tasks}개 · 순서 선 {counts.links}개</span>}
          <button className="map-btn" onClick={close}>취소</button>
          {phase.s === 'preview' && <button className="map-btn map-btn--primary" disabled={!counts.tasks || invalid || saving} onClick={() => void create()}>{counts.tasks}개 만들기</button>}
        </footer>
      </div>
      {afterMenu && (
        <Popover anchor={afterMenu.anchor} onClose={() => setAfterMenu(undefined)} width={220} className="menu">
          {steps.slice(0, steps.findIndex((x) => x.key === afterMenu.key)).map((p) => {
            const cur = steps.find((x) => x.key === afterMenu.key)!
            const on = cur.after.includes(p.key)
            const cycle = !on && stepWouldCycle(steps, afterMenu.key, p.key)
            return <MenuItem key={p.key} label={`${num.get(p.key)}. ${p.title || '(이름 없음)'}`} disabled={cycle} active={on}
              onClick={() => patch(afterMenu.key, { after: on ? cur.after.filter((a) => a !== p.key) : [...cur.after, p.key] })} />
          })}
          {steps.findIndex((x) => x.key === afterMenu.key) === 0 && <p className="bd__menu-empty">첫 단계는 앞 단계가 없어요</p>}
        </Popover>
      )}
      {modeMenu && (
        <Popover anchor={modeMenu} onClose={() => setModeMenu(undefined)} width={260} className="menu">
          <MenuItem label={`하위 할 일로 · 부모: ${task?.title ?? ''}`} active={mode === 'subtask'} onClick={() => { setMode('subtask'); setModeMenu(undefined) }} />
          <MenuItem label="같은 리스트의 할 일로" active={mode === 'sibling'} onClick={() => { setMode('sibling'); setModeMenu(undefined) }} />
        </Popover>
      )}
    </Dialog>
  )
}

/** 오른쪽 위 작은 순서 그림(폭 160): 켠 단계 점 + 이어 붙인 순서 화살표 */
function OrderPicture({ steps, bridged }: { steps: Step[]; bridged: Map<string, string[]> }) {
  const on = steps.filter((s) => s.on)
  if (on.length < 2) return null
  const gap = Math.min(28, 148 / Math.max(1, on.length - 1))
  const x = new Map(on.map((s, i) => [s.key, 6 + i * gap]))
  return (
    <svg className="bd__pic" width={160} height={28} viewBox="0 0 160 28" aria-hidden>
      {[...bridged].flatMap(([to, pre]) => pre.map((p) => {
        const a = x.get(p)!, b = x.get(to)!
        const mid = (a + b) / 2, lift = Math.min(12, (b - a) / 3)
        return <path key={`${p}-${to}`} d={`M${a + 3} 16 Q${mid} ${16 - lift} ${b - 4} 16`} className="bd__pic-line" />
      }))}
      {on.map((s) => <circle key={s.key} cx={x.get(s.key)} cy={16} r={3.5} className="bd__pic-dot" />)}
    </svg>
  )
}
