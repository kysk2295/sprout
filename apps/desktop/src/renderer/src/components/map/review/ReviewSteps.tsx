// 31 §12 점검 단계별 본문 — ① 돌아보기(큰 숫자 · 프로젝트 진행 · 7칸) ② 밀린 일 카드 ③ 목표 고르기 + 다음 주 7칸.
import { useState } from 'react'
import type { ListRow } from '../../../data/types'
import { DECISION_LABEL, md, type DayCell, type Decision, type ProjectRow, type Suggestion, type weekNumbers } from '../../../data/review'

export type CardRow = { id: string; title: string; status: number; due_at: string | null; deleted_at: string | null; list_id: string | null }

function Week({ cols, today, onOpen, small }: { cols: DayCell[]; today: string; onOpen: (id: string) => void; small?: boolean }) {
  return (
    <div className={`rv-wk${small ? ' is-small' : ''}`}>
      {cols.map((c) => (
        <div key={c.day} className={`rv-day${c.day === today ? ' is-today' : ''}`}>
          <h6>{c.label}</h6>
          {c.bars.slice(0, 4).map((b) => (
            <button key={b.id} className={`rv-ev is-${b.tone}`} title={b.title} onClick={() => onOpen(b.id)}>{b.title}</button>
          ))}
          {c.bars.length > 4 && <span className="rv-day__more">+{c.bars.length - 4}</span>}
          {c.day === today && !c.bars.length && <span className="rv-ev is-now">지금 점검 중</span>}
        </div>
      ))}
    </div>
  )
}

export function LookStep({ nums, projects, byTag, cols, today, onOpen }: {
  nums: ReturnType<typeof weekNumbers>; projects: ProjectRow[]; byTag: boolean; cols: DayCell[]; today: string; onOpen: (id: string) => void
}) {
  const g = nums.goals
  return (
    <>
      <div className="rv-big3">
        <div className="rv-bn is-ok"><b>{nums.done}</b><span>끝낸 일</span></div>
        <div className="rv-bn is-miss"><b>{nums.missed}</b><span>밀린 일{nums.missed ? ' · 다음 단계에서 정해요' : ''}</span></div>
        <div className="rv-bn is-goal">
          <b>{g.total ? `${g.achieved} / ${g.total}` : '–'}</b>
          <span>{g.total ? `이번 주 목표${g.lead ? ` (${g.lead.title})` : ''}` : '이번 주 목표 없음 · 3단계에서 골라요'}</span>
        </div>
      </div>
      {projects.length > 0 && (
        <div className="rv-proj" aria-label={byTag ? '프로젝트별 이번 주' : '리스트별 이번 주'}>
          {projects.map((p) => (
            <div key={p.id} className="rv-wp">
              <b>{p.emoji ? `${p.emoji} ` : ''}{p.name} <em>{p.done} / {p.total}</em></b>
              <div className="rv-bar"><i style={{ width: `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      <Week cols={cols} today={today} onOpen={onOpen} />
      <div className="rv-legend"><span><i className="is-done">✓</i> 끝냄</span><span><i className="is-miss">✕</i> 못 함</span><span><i className="is-open" /> 남음</span></div>
    </>
  )
}

const CHOICES: Decision[] = ['next', 'someday', 'done', 'trash']
export function MissedStep({ cards, decisions, busy, lists, onDecide, onOpen }: {
  cards: { id: string; due: string; row?: CardRow }[]; decisions: Record<string, Decision>; busy: ReadonlySet<string>; lists: ListRow[]
  onDecide: (id: string, d: Decision) => void; onOpen: (id: string) => void
}) {
  if (!cards.length) return <div className="rv-empty">이번 주에 밀린 일이 없어요 ✓</div>
  const listOf = (id: string | null) => lists.find((l) => l.id === id)
  return (
    <div className="rv-cards">
      {cards.map((c) => {
        const d = decisions[c.id]
        const l = listOf(c.row?.list_id ?? null)
        const place = !l ? '' : l.kind === 'inbox' ? '📥 기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name}`
        return (
          <div key={c.id} className={`rv-mt${d ? ` is-${d}` : ''}`}>
            <div className="rv-mt__txt">
              <button className="rv-mt__t" onClick={() => onOpen(c.id)} title="자세히 보기">{c.row?.title}</button>
              <div className="rv-mt__m">{md(c.due)}{place ? ` · ${place}` : ''}{d ? <span className="rv-mt__now"> → {DECISION_LABEL[d]}</span> : null}</div>
            </div>
            <div className="rv-ch" role="group" aria-label="어떻게 할까요">
              {CHOICES.map((k) => (
                <button key={k} className={`rv-ch__b is-${k}${d === k ? ' is-on' : ''}`} aria-pressed={d === k} disabled={busy.has(c.id)}
                  title={d === k ? '다시 누르면 되돌려요' : k === 'done' ? 'XP 없이 끝낸 것으로 닫아요' : undefined}
                  onClick={() => onDecide(c.id, k)}>{DECISION_LABEL[k]}</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PickStep({ sugs, picks, room, existing, cols, today, planWeek, onToggle, onCustom, onOpen }: {
  sugs: Suggestion[]; picks: string[]; room: number; existing: number; cols: DayCell[]; today: string; planWeek: string
  onToggle: (key: string) => void; onCustom: (title: string) => void; onOpen: (id: string) => void
}) {
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const picked = sugs.filter((s) => picks.includes(s.key))
  const full = picked.length >= room
  const onGrid = new Set(cols.flatMap((c) => c.bars.map((b) => b.id)))
  const floating = picked.filter((s) => !s.taskIds.some((id) => onGrid.has(id)))
  const save = () => { const t = text.trim(); if (t) onCustom(t); setText(''); setWriting(false) }
  return (
    <>
      <div className="rv-picks">
        {sugs.map((s) => {
          const on = picks.includes(s.key)
          return (
            <button key={s.key} className={`rv-pk${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => onToggle(s.key)}>
              <i className="rv-pk__box">{on ? '✓' : ''}</i>
              <span><b>{s.kind === 'project' ? (s.emoji ?? '📁') : s.kind === 'custom' ? '✏️' : '🎯'} {s.title}</b><small>{s.meta}</small></span>
            </button>
          )
        })}
        {writing ? (
          <div className="rv-pk is-input">
            <input autoFocus value={text} placeholder="예: 운동 3번" maxLength={60} aria-label="목표 직접 적기"
              onChange={(e) => setText(e.target.value)} onBlur={save}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save() } else if (e.key === 'Escape') { setText(''); setWriting(false) } }} />
          </div>
        ) : (
          <button className="rv-pk is-add" disabled={full} onClick={() => setWriting(true)}>＋ 직접 적기</button>
        )}
      </div>
      <div className="rv-cnt">
        {room === 0 ? <>다음 주 목표가 이미 {existing}개라 더 고를 수 없어요 — 그대로 끝내도 돼요</>
          : <><b>{picked.length} / {room}</b> 골랐어요{full ? ' — 더 고르려면 하나를 빼요' : picked.length === 0 ? ' — 안 골라도 끝낼 수 있어요' : ''}</>}
        {existing > 0 && room > 0 && <span className="rv-cnt__sub"> · 이미 있는 다음 주 목표 {existing}개</span>}
      </div>
      <div className="rv-next-h">다음 주 {md(planWeek)}부터</div>
      {floating.length > 0 && <div className="rv-floating">{floating.map((s) => <span key={s.key} className="rv-ev is-goal">{s.title}</span>)}</div>}
      <Week cols={cols} today={today} onOpen={onOpen} small />
      <div className="rv-legend"><span><i className="is-goal">🎯</i> 고른 목표</span><span><i className="is-open" /> 다음 주 할 일</span></div>
    </>
  )
}
