// 19 §3.2 밀린 일 정리 대화 상자: ① 오래된 것 한꺼번에 → ② 같은 일 묶기 → ③ 최근 것 하나씩 → 끝 화면(요약·모두 되돌리기·캐릭터 한마디)
import { ArrowLeft, Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { datePart, parseRule, repeatPresets, ruleSummary } from '@sprout/schema/time'
import { Dialog } from '../Dialog'
import { DatePicker, EMPTY_SCHEDULE } from '../DatePicker'
import { CharacterArt } from '../growth/CharacterArt'
import { useGrowth } from '../../data/growth'
import { aiChat } from '../../data/ai'
import { dayKey, rowDateLabel } from '../../lib/dates'
import {
  addTally, AI_TAG_LABEL, aiTagPrompt, aiTagSchema, applyCleanup, beginCleanupSession, BUCKET_CHOICES, BUCKET_DEFAULT, characterLine, isOverdue, loadOverdue,
  OUTCOME_LABEL, overdueDays, parseAiTags, planOverdue, resetToSnapshot, suggestRepeat, tallyTotal, thisFriday, undoCleanup,
  type AiTag, type BucketAction, type BucketId, type CleanupOp, type DupGroup, type OTask, type Outcome, type OverduePlan, type Tally
} from '../../data/overdue'
import './overdue.css'

const BUCKET_TITLE: Record<BucketId, string> = { old: '3달 넘음', mid: '1~3달', events: '이미 지난 일정' }
const BUCKET_HINT: Record<BucketId, string> = { old: '오래 손대지 않은 일', mid: '한동안 밀린 일', events: '시각이 있는 지난 일 — 미팅·약속 같은 것' }
const ACTION_LABEL: Record<BucketAction, string> = {
  wontdo: '하지 않음으로 보관', nodate: '날짜만 빼기', done: '완료 처리(XP 없음)', trash: '삭제(휴지통)', one: '하나씩 보기', leave: '그대로'
}
const OP_OF: Partial<Record<BucketAction, CleanupOp>> = { wontdo: { kind: 'wontdo' }, nodate: { kind: 'nodate' }, done: { kind: 'done' }, trash: { kind: 'trash' } }
const OUT_OF: Partial<Record<BucketAction, Outcome>> = { wontdo: 'wontdo', nodate: 'nodate', done: 'done', trash: 'trash' }

type DupChoice = { mode: 'latest' | 'repeat' | 'leave'; rule?: string }
type Step = 'loading' | 'buckets' | 'dups' | 'one' | 'end'
const STEPS: [Step, string][] = [['buckets', '오래된 것'], ['dups', '같은 일'], ['one', '하나씩']]
const n = (v: number) => v.toLocaleString('ko-KR')

export function CleanupDialog({ only, onClose }: { only?: string[]; onClose: () => void }) {
  const today = dayKey()
  const [step, setStep] = useState<Step>('loading')
  const [plan, setPlan] = useState<OverduePlan>()
  const [busy, setBusy] = useState(false)
  const [tally, setTally] = useState<Tally>({})
  const [queue, setQueue] = useState<OTask[]>([])
  const [left, setLeft] = useState(0)
  const [undone, setUndone] = useState<number>()
  const started = useRef(performance.now())

  // 열 때 한 번 읽어 나눈다. only가 있으면(어제 못 한 일 [하나씩]) 바로 ③으로
  useEffect(() => {
    beginCleanupSession()
    void loadOverdue(today).then((rows) => {
      if (only) {
        const set = new Set(only)
        setQueue(rows.filter((r) => set.has(r.id)))
        setPlan(planOverdue([], today))
        setStep('one')
        return
      }
      const p = planOverdue(rows, today)
      setPlan(p)
      setQueue(p.recent)
      setStep(p.total === 0 ? 'end' : Object.values(p.buckets).some((b) => b.length) ? 'buckets' : p.dups.length ? 'dups' : 'one')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(async () => {
    setStep('end')
    setLeft((await loadOverdue(today)).filter((t) => isOverdue(t, today)).length)
    window.dispatchEvent(new CustomEvent('sprout:cleanup-done', { detail: { tally, seconds: Math.round((performance.now() - started.current) / 1000) } }))
  }, [today, tally])

  const goDups = () => setStep(plan?.dups.length ? 'dups' : 'one')
  const goOne = (extra: OTask[] = []) => {
    const q = [...extra, ...queue.filter((t) => !extra.some((e) => e.id === t.id))]
    setQueue(q)
    if (q.length) setStep('one')
    else void finish()
  }

  // 단계가 바뀌면 그 단계의 주 버튼으로 초점(Enter로 넘어가게)
  useEffect(() => { document.querySelector<HTMLElement>('.od [data-autofocus]')?.focus() }, [step])
  const stepIndex = STEPS.findIndex(([s]) => s === step)
  return (
    <Dialog label="밀린 일 정리" className="od" onClose={onClose}>
      <header className="od__head">
        <h2>밀린 일 정리</h2>
        {stepIndex >= 0 && (
          <ol className="od__steps" aria-label="단계">
            {STEPS.map(([s, label], i) => <li key={s} className={i === stepIndex ? 'is-on' : i < stepIndex ? 'is-done' : ''}>{i < stepIndex ? <Check /> : <span>{i + 1}</span>}{label}</li>)}
          </ol>
        )}
        <button className="icon-btn" aria-label="닫기" onClick={onClose}><X /></button>
      </header>
      {step === 'loading' && <p className="od__muted od__pad">만료된 할 일을 모으는 중…</p>}
      {step === 'buckets' && plan && (
        <BucketStep plan={plan} busy={busy} onSkip={goDups} onApply={async (choices, picked) => {
          setBusy(true)
          let t = tally
          const extra: OTask[] = []
          try {
            for (const id of Object.keys(choices) as BucketId[]) {
              const tasks = plan.buckets[id].filter((x) => picked.has(x.id))
              if (!tasks.length) continue
              const a = choices[id]
              const op = OP_OF[a]
              if (op) { await applyCleanup(tasks.map((x) => x.id), op, today); t = addTally(t, OUT_OF[a]!, tasks.length) }
              else if (a === 'one') extra.push(...tasks)
              else t = addTally(t, 'kept', tasks.length)
            }
            // 체크를 뺀 것은 그대로 둔다
            const unpicked = Object.values(plan.buckets).flat().filter((x) => !picked.has(x.id)).length
            if (unpicked) t = addTally(t, 'kept', unpicked)
          } finally { setBusy(false) }
          setTally(t)
          if (plan.dups.length) { setQueue((q) => [...extra, ...q]); setStep('dups') } else goOne(extra)
        }} />
      )}
      {step === 'dups' && plan && (
        <DupStep groups={plan.dups} busy={busy} today={today} onSkip={() => goOne()} onApply={async (choices) => {
          setBusy(true)
          let t = tally
          try {
            for (const g of plan.dups) {
              const c = choices[g.key] ?? { mode: 'latest' }
              const [latest, ...rest] = g.tasks
              if (c.mode === 'leave') { t = addTally(t, 'kept', g.tasks.length); continue }
              await applyCleanup(rest.map((x) => x.id), { kind: 'wontdo' }, today)
              t = addTally(t, 'wontdo', rest.length)
              if (c.mode === 'repeat' && c.rule) { await applyCleanup([latest.id], { kind: 'repeat', rule: c.rule }, today); t = addTally(t, 'repeat') }
              else t = addTally(t, 'kept')
            }
          } finally { setBusy(false) }
          setTally(t)
          goOne()
        }} />
      )}
      {step === 'one' && (
        <OneStep queue={queue} today={today} onDone={(t) => { setTally((x) => { const m = { ...x }; for (const [k, v] of Object.entries(t)) m[k as Outcome] = (m[k as Outcome] ?? 0) + (v ?? 0); return m }); void finish() }} />
      )}
      {step === 'end' && (
        <EndStep total={only ? queue.length : plan?.total ?? 0} tally={tally} left={left} undone={undone} onUndo={async () => { setBusy(true); try { setUndone(await undoCleanup()) } finally { setBusy(false) } }} busy={busy} onClose={onClose} />
      )}
    </Dialog>
  )
}

// ── ① 오래된 것 한꺼번에 ──
function BucketStep({ plan, busy, onSkip, onApply }: { plan: OverduePlan; busy: boolean; onSkip: () => void; onApply: (c: Record<BucketId, BucketAction>, picked: Set<string>) => void }) {
  const [choices, setChoices] = useState<Record<BucketId, BucketAction>>({ ...BUCKET_DEFAULT })
  const [picked, setPicked] = useState(() => new Set(Object.values(plan.buckets).flat().map((t) => t.id)))
  const [open, setOpen] = useState<BucketId>()
  const ids = (Object.keys(plan.buckets) as BucketId[]).filter((b) => plan.buckets[b].length)
  const dupCount = plan.dups.reduce((a, g) => a + g.tasks.length, 0)
  const toggle = (id: string) => setPicked((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s })
  return (
    <>
      <div className="od__body">
        <p className="od__lead">만료된 할 일 <b>{n(plan.total)}개</b>를 다시 정해요. 오래된 것부터 한꺼번에 — 모두 나중에 되돌릴 수 있어요.</p>
        {ids.map((b) => {
          const tasks = plan.buckets[b]
          const on = tasks.filter((t) => picked.has(t.id)).length
          return (
            <section key={b} className="od-bucket">
              <div className="od-bucket__top">
                <button className="od-bucket__toggle" aria-expanded={open === b} onClick={() => setOpen(open === b ? undefined : b)}>
                  {open === b ? <ChevronDown /> : <ChevronRight />}
                  <span className="od-bucket__name">{BUCKET_TITLE[b]}</span>
                  <span className="od-bucket__count">{on === tasks.length ? n(tasks.length) : `${n(on)}/${n(tasks.length)}`}</span>
                </button>
                <select className="od-select" aria-label={`${BUCKET_TITLE[b]} 처리`} value={choices[b]} onChange={(e) => setChoices({ ...choices, [b]: e.target.value as BucketAction })}>
                  {[...BUCKET_CHOICES[b], 'leave' as const].map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}{a === BUCKET_DEFAULT[b] ? ' (추천)' : ''}</option>)}
                </select>
              </div>
              <p className="od-bucket__hint">{BUCKET_HINT[b]} · {tasks.slice(0, 3).map((t) => t.title || '제목 없음').join(' · ')}{tasks.length > 3 ? ' …' : ''}</p>
              {open === b && (
                <ul className="od-bucket__list">
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <label><input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} /><span className="od-bucket__title">{t.title || '제목 없음'}</span>
                        <span className="od__meta">{t.list_name ?? ''} · {overdueDays(t, dayKey())}일 지남</span></label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
        {dupCount > 0 && <p className="od__muted">같은 제목이 반복되는 {n(dupCount)}개는 다음 단계에서 한 줄씩 정해요.</p>}
      </div>
      <footer className="od__foot">
        <button onClick={onSkip} disabled={busy}>건너뛰기</button>
        <span className="od__spacer" />
        <button className="entry-primary" data-autofocus disabled={busy} onClick={() => onApply(choices, picked)}>{busy ? '정리하는 중…' : '적용하고 다음'}</button>
      </footer>
    </>
  )
}

// ── ② 같은 일 묶기 ──
function DupStep({ groups, busy, today, onSkip, onApply }: { groups: DupGroup[]; busy: boolean; today: string; onSkip: () => void; onApply: (c: Record<string, DupChoice>) => void }) {
  const suggestions = useMemo(() => Object.fromEntries(groups.map((g) => [g.key, suggestRepeat(g.tasks.map((t) => t.due_at!))])), [groups])
  const [choices, setChoices] = useState<Record<string, DupChoice>>(() => Object.fromEntries(groups.map((g) => [g.key, { mode: 'latest' as const, rule: suggestions[g.key]?.rule }])))
  const [picker, setPicker] = useState<{ key: string; anchor: HTMLElement }>()
  const set = (key: string, c: Partial<DupChoice>) => setChoices((x) => ({ ...x, [key]: { ...x[key], ...c } }))
  return (
    <>
      <div className="od__body">
        <p className="od__lead">같은 제목이 여러 번 만료됐어요. 반복 할 일을 손으로 만들어 온 것 같아요.</p>
        <p className="od__muted od__chips-line">{groups.slice(0, 6).map((g) => `${g.title} ×${g.tasks.length}`).join(' · ')}</p>
        {groups.map((g) => {
          const c = choices[g.key]
          const sug = suggestions[g.key]
          const anchor = datePart(g.tasks[0].due_at!)
          const options = [...(sug ? [sug] : []), ...repeatPresets(anchor).map((p) => ({ rule: p.rule, label: ruleSummary(parseRule(p.rule), anchor) }))]
            .filter((o, i, a) => a.findIndex((x) => x.rule === o.rule) === i)
          if (c.rule && !options.some((o) => o.rule === c.rule)) options.push({ rule: c.rule, label: ruleSummary(parseRule(c.rule), anchor) })
          return (
            <section key={g.key} className="od-dup">
              <div className="od-dup__top">
                <span className="od-dup__title">{g.title || '제목 없음'}</span>
                <span className="od-bucket__count">×{g.tasks.length}</span>
                <span className="od__meta">{g.tasks.map((t) => datePart(t.due_at!).slice(5).replace('-', '/')).slice(0, 4).join(', ')}{g.tasks.length > 4 ? ' …' : ''}</span>
              </div>
              <div className="od-seg" role="radiogroup" aria-label={`${g.title} 처리`}>
                {([['latest', '가장 최근 1개만 남기기'], ['repeat', '반복 할 일로 바꾸기'], ['leave', '그대로']] as const).map(([m, label]) => (
                  <button key={m} role="radio" aria-checked={c.mode === m} className={c.mode === m ? 'is-on' : ''} onClick={() => set(g.key, { mode: m, rule: c.rule ?? sug?.rule ?? options[0]?.rule })}>{label}</button>
                ))}
              </div>
              {c.mode === 'repeat' && (
                <div className="od-dup__repeat">
                  <select className="od-select" aria-label="반복 규칙" value={c.rule} onChange={(e) => set(g.key, { rule: e.target.value })}>
                    {options.map((o) => <option key={o.rule} value={o.rule}>{o.label}{o.rule === sug?.rule ? ' (추천)' : ''}</option>)}
                  </select>
                  <button className="od__link" onClick={(e) => setPicker({ key: g.key, anchor: e.currentTarget })}>직접 고르기</button>
                  <span className="od__meta">가장 최근 1개를 반복으로 바꾸고 나머지 {g.tasks.length - 1}개는 보관</span>
                </div>
              )}
            </section>
          )
        })}
      </div>
      {picker && (
        <DatePicker
          initial={{ ...EMPTY_SCHEDULE, due_at: today, repeat_rule: choices[picker.key]?.rule ?? null, repeat_from: 'due' }}
          anchor={picker.anchor}
          onSave={(s) => { if (s.repeat_rule) set(picker.key, { mode: 'repeat', rule: s.repeat_rule }) }}
          onClose={() => setPicker(undefined)}
        />
      )}
      <footer className="od__foot">
        <button onClick={onSkip} disabled={busy}>건너뛰기</button>
        <span className="od__spacer" />
        <button className="entry-primary" data-autofocus disabled={busy} onClick={() => onApply(choices)}>{busy ? '정리하는 중…' : '적용하고 다음'}</button>
      </footer>
    </>
  )
}

// ── ③ 최근 것 하나씩 ──
type OneAction = { key: string; label: string; outcome: Outcome; op: (today: string) => CleanupOp | 'pick' }
const ONE_ACTIONS: OneAction[] = [
  { key: '1', label: '오늘', outcome: 'today', op: (d) => ({ kind: 'date', date: d }) },
  { key: '2', label: '이번 주(금)', outcome: 'week', op: (d) => ({ kind: 'date', date: thisFriday(d) }) },
  { key: '3', label: '날짜 고르기', outcome: 'date', op: () => 'pick' },
  { key: '4', label: '날짜 빼기', outcome: 'nodate', op: () => ({ kind: 'nodate' }) },
  { key: '5', label: '완료했어요', outcome: 'done', op: () => ({ kind: 'done' }) },
  { key: '6', label: '하지 않음', outcome: 'wontdo', op: () => ({ kind: 'wontdo' }) }
]

function OneStep({ queue, today, onDone }: { queue: OTask[]; today: string; onDone: (t: Tally) => void }) {
  const [i, setI] = useState(0)
  const [decided, setDecided] = useState<Record<string, Outcome>>({})
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<HTMLElement | null>(null)
  const [tags, setTags] = useState<Record<string, AiTag>>({})
  const btns = useRef<(HTMLButtonElement | null)[]>([])
  const card = queue[i]
  const tallyOf = useCallback((d: Record<string, Outcome>) => Object.values(d).reduce<Tally>((t, o) => addTally(t, o), {}), [])
  const stop = useCallback((d = decided) => onDone(tallyOf(d)), [decided, onDone, tallyOf])

  // 19 §5 AI 꼬리표: /ai/classify — 안 되면 조용히 꼬리표 없이
  useEffect(() => {
    const ctrl = new AbortController()
    void (async () => {
      // 처음 몇 장은 작게(빨리 보이게), 그다음 30개씩 — 90장까지
      for (let k = 0; k < Math.min(queue.length, 90); k += k === 0 ? 8 : 30) {
        const items = queue.slice(k, k === 0 ? 8 : k + 30)
        try {
          const raw = await aiChat({ purpose: 'classify', format: aiTagSchema(items.length), messages: [{ role: 'user', content: aiTagPrompt(items, today) }] }, ctrl.signal)
          if (ctrl.signal.aborted) return
          const got = parseAiTags(raw, items)
          setTags((t) => ({ ...t, ...got }))
        } catch { return }
      }
    })()
    return () => ctrl.abort()
  }, [queue, today])

  const act = useCallback(async (a: OneAction, date?: string) => {
    if (!card || busy) return
    const op = date ? { kind: 'date' as const, date } : a.op(today)
    if (op === 'pick') { setPick(btns.current[2]); return }
    setBusy(true)
    try {
      if (decided[card.id]) await resetToSnapshot([card.id]) // 다시 정하면 먼저 정리 전으로(하지 않음 → 오늘 등)
      await applyCleanup([card.id], op, today)
    } finally { setBusy(false) }
    const d = { ...decided, [card.id]: date ? (date === today ? 'today' : 'date') : a.outcome } as Record<string, Outcome>
    setDecided(d)
    if (i + 1 >= queue.length) stop(d)
    else setI(i + 1)
  }, [card, busy, today, decided, i, queue.length, stop])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (pick || document.querySelector('.popover') || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input,select,textarea')) return
      const a = ONE_ACTIONS.find((x) => x.key === e.key)
      if (a) { e.preventDefault(); void act(a) }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); setI(i - 1) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [act, i, pick])

  if (!queue.length) return <div className="od__body"><p className="od__muted">하나씩 볼 할 일이 없어요.</p><footer className="od__foot"><span className="od__spacer" /><button className="entry-primary" data-autofocus onClick={() => stop()}>마치기</button></footer></div>
  const label = card ? rowDateLabel(card, today) : null
  const tag = card ? tags[card.id] : undefined
  const prev = card ? decided[card.id] : undefined
  return (
    <>
      <div className="od__body">
        <div className="od-progress" role="progressbar" aria-label="진행" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={i}>
          <span style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
        <p className="od__muted od-progress__text">{i + 1} / {queue.length} · 남은 {queue.length - i}개</p>
        {card && (
          <article className="od-card" key={card.id}>
            <h3 className="od-card__title">{card.title || '제목 없음'}</h3>
            <p className="od__meta">{card.list_name ?? '기본함'} · <span className="od-card__date">{label?.label}</span> · {overdueDays(card, today)}일 지남</p>
            <div className="od-card__tags">
              {tag && <span className="od-tag">{AI_TAG_LABEL[tag]}</span>}
              {prev && <span className="od-tag is-muted">이미 정함: {OUTCOME_LABEL[prev]}</span>}
            </div>
          </article>
        )}
        <div className="od-actions">
          {ONE_ACTIONS.map((a, k) => (
            <button key={a.key} ref={(el) => { btns.current[k] = el }} className={`od-action${a.outcome === 'wontdo' ? ' is-wontdo' : ''}`} disabled={busy} onClick={() => void act(a)} data-autofocus={k === 0 ? true : undefined}>
              <kbd>{a.key}</kbd>{a.label}
            </button>
          ))}
        </div>
      </div>
      {pick && card && (
        <DatePicker variant="date-only" initial={{ ...EMPTY_SCHEDULE, due_at: today }} anchor={pick}
          onSave={(s) => { if (s.due_at) void act(ONE_ACTIONS[2], datePart(s.due_at)) }} onClose={() => setPick(null)} />
      )}
      <footer className="od__foot">
        <button onClick={() => setI(i - 1)} disabled={i === 0 || busy} aria-label="이전 카드"><ArrowLeft />이전</button>
        <span className="od__spacer" />
        <button onClick={() => stop()} disabled={busy}>여기까지</button>
      </footer>
    </>
  )
}

// ── 끝 화면 ──
function EndStep({ total, tally, left, undone, busy, onUndo, onClose }: { total: number; tally: Tally; left: number; undone?: number; busy: boolean; onUndo: () => void; onClose: () => void }) {
  const { character, progress } = useGrowth()
  const parts = (Object.keys(OUTCOME_LABEL) as Outcome[]).filter((o) => tally[o]).map((o) => `${OUTCOME_LABEL[o]} ${n(tally[o]!)}`)
  const changed = tallyTotal(tally) - (tally.kept ?? 0)
  return (
    <>
      <div className="od__body od-end">
        {total === 0 && !changed ? <p className="od__lead">만료된 할 일이 없어요. 깔끔해요!</p> : (
          <>
            <p className="od-end__sum"><b>{n(total)}개</b> → {parts.join(' · ') || '바꾼 것 없음'}</p>
            {left > 0 && <p className="od__muted">아직 만료 {n(left)}개가 남았어요 — 언제든 다시 정리할 수 있어요.</p>}
          </>
        )}
        <div className="od-end__char">
          <CharacterArt species={character?.species ?? null} stage={progress.stage} size={56} mood="default" />
          <p className="od-end__line"><b>{character?.name ?? '새싹'}</b>“{characterLine(tally, left)}”</p>
        </div>
        {undone !== undefined && <p className="od__muted" role="status">{undone ? `${n(undone)}개를 정리 전으로 되돌렸어요.` : '되돌릴 정리가 없어요(24시간이 지났거나 이미 되돌림).'}</p>}
        {changed > 0 && undone === undefined && <p className="od__muted">XP는 정리로 생기지 않아요. 24시간 안에는 설정 › 할 일에서도 되돌릴 수 있어요.</p>}
      </div>
      <footer className="od__foot">
        {changed > 0 && undone === undefined && <button onClick={onUndo} disabled={busy}>모두 되돌리기</button>}
        <span className="od__spacer" />
        <button className="entry-primary" data-autofocus onClick={onClose}>닫기</button>
      </footer>
    </>
  )
}
