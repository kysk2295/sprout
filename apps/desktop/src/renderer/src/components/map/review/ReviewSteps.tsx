// 31 §12 점검 단계별 본문 — 모양 v2(31 R.10, 2026-10-06 "너무 AI 스러워"): 틱틱 설정·목록처럼 묶음 + 행.
// ① 돌아보기(이번 주 숫자 행 · 프로젝트 행 · 요일별 7행) ② 밀린 일 행 + 작은 세그먼트 ③ 목표 고르기 체크 행 + 다음 주 7행.
import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import type { ListRow } from '../../../data/types'
import { md, type DayCell, type Decision, type ProjectRow, type Suggestion, type weekNumbers } from '../../../data/review'

export type CardRow = { id: string; title: string; status: number; due_at: string | null; deleted_at: string | null; list_id: string | null }

/** 묶음: 회색 이름 + 카드 + (회색 밑글) */
export function Sec({ title, right, foot, children }: { title?: string; right?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <section className="rv-sec">
      {(title || right) && <div className="rv-sec__h"><span>{title}</span>{right}</div>}
      <div className="rv-sec__b">{children}</div>
      {foot && <div className="rv-sec__f">{foot}</div>}
    </section>
  )
}

const count = (c: DayCell) => {
  const n = (t: string) => c.bars.filter((b) => b.tone === t).length
  return [['끝냄', n('done')], ['못 함', n('miss')], ['남음', n('open')]].filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ')
}

/** 요일 7행 — 누르면 그날 할 일이 행 아래 펼쳐진다 */
function Days({ cols, today, onOpen, goal }: { cols: DayCell[]; today: string; onOpen: (id: string) => void; goal?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      {cols.map((c) => {
        const on = open === c.day
        const goals = c.bars.filter((b) => b.tone === 'goal').length
        const summary = goal ? (c.bars.length ? `${c.bars.length}개` : '') : count(c)
        return (
          <div key={c.day} className="rv-dayw">
            <button className={`rv-row rv-day${c.day === today ? ' is-today' : ''}`} aria-expanded={on} disabled={!c.bars.length} onClick={() => setOpen(on ? null : c.day)}>
              <span className="rv-row__t">{c.label}</span>
              {goal && goals > 0 && <span className="rv-row__acc">목표 {goals}</span>}
              <span className="rv-row__v">{summary || '–'}</span>
              {c.bars.length > 0 ? (on ? <ChevronDown className="rv-row__chev" /> : <ChevronRight className="rv-row__chev" />) : <span className="rv-row__chev" />}
            </button>
            {on && (
              <div className="rv-day__list">
                {c.bars.map((b) => (
                  <button key={b.id} className={`rv-ev is-${b.tone}`} onClick={() => onOpen(b.id)} title="자세히 보기">
                    {b.tone === 'done' ? <Check className="rv-ev__i" /> : <i className="rv-ev__i" />}
                    <span>{b.title}</span>
                    {b.tone === 'miss' && <em>못 함</em>}
                    {b.tone === 'goal' && <em>목표</em>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export function LookStep({ nums, projects, byTag, cols, today, onOpen }: {
  nums: ReturnType<typeof weekNumbers>; projects: ProjectRow[]; byTag: boolean; cols: DayCell[]; today: string; onOpen: (id: string) => void
}) {
  const g = nums.goals
  return (
    <>
      <Sec title="이번 주" foot="보기만 하고 다음으로 넘어가요">
        <div className="rv-row"><span className="rv-row__t">끝낸 일</span><span className="rv-row__v">{nums.done}</span></div>
        <div className="rv-row"><span className="rv-row__t">밀린 일</span><span className={`rv-row__v${nums.missed ? ' is-miss' : ''}`}>{nums.missed}</span></div>
        <div className="rv-row"><span className="rv-row__t">이번 주 목표{g.lead ? <small> · {g.lead.title}</small> : null}</span><span className="rv-row__v">{g.total ? `${g.achieved} / ${g.total}` : '없음'}</span></div>
      </Sec>
      {projects.length > 0 && (
        <Sec title={byTag ? '프로젝트' : '리스트'}>
          {projects.map((p) => (
            <div key={p.id} className="rv-row rv-row--bar">
              <span className="rv-row__ic">{p.emoji ?? (byTag ? '🚀' : '≡')}</span>
              <span className="rv-row__t">{p.name}</span>
              <span className="rv-row__v">{p.done} / {p.total}</span>
              <span className="rv-row__track"><i style={{ width: `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` }} /></span>
            </div>
          ))}
        </Sec>
      )}
      <Sec title="요일별">
        <Days cols={cols} today={today} onOpen={onOpen} />
      </Sec>
    </>
  )
}

const CHOICES: [Decision, string][] = [['next', '다음 주'], ['someday', '언젠가'], ['done', '끝냄'], ['trash', '지우기']]
export function MissedStep({ cards, decisions, busy, lists, left, onDecide, onAllNext, onOpen }: {
  cards: { id: string; due: string; row?: CardRow }[]; decisions: Record<string, Decision>; busy: ReadonlySet<string>; lists: ListRow[]; left: number
  onDecide: (id: string, d: Decision) => void; onAllNext: () => void; onOpen: (id: string) => void
}) {
  const listOf = (id: string | null) => lists.find((l) => l.id === id)
  return (
    <Sec title={`밀린 일 ${cards.length}`} foot={cards.length ? '안 고른 일은 다음 주 월요일로 옮겨요 · 끝냄은 XP 없이 닫혀요' : undefined}
      right={left > 0 ? <button className="rv-link" onClick={onAllNext}>안 고른 {left}개 모두 다음 주로</button> : undefined}>
      {!cards.length && <div className="rv-row"><span className="rv-row__t is-dim">이번 주에 밀린 일이 없어요</span></div>}
      {cards.map((c) => {
        const d = decisions[c.id]
        const l = listOf(c.row?.list_id ?? null)
        const place = !l ? '' : l.kind === 'inbox' ? '기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name}`
        return (
          <div key={c.id} className={`rv-row rv-mt${d === 'done' || d === 'trash' ? ' is-closed' : ''}`}>
            <div className="rv-mt__txt">
              <button className="rv-mt__t" onClick={() => onOpen(c.id)} title="자세히 보기">{c.row?.title}</button>
              <div className="rv-mt__m">{md(c.due)}{place ? ` · ${place}` : ''}</div>
            </div>
            <div className="seg rv-mt__seg" role="group" aria-label="어떻게 할까요">
              {CHOICES.map(([k, label]) => (
                <button key={k} className={`${d === k ? 'is-on' : ''}${k === 'trash' ? ' is-danger' : ''}`} aria-pressed={d === k} disabled={busy.has(c.id)}
                  title={d === k ? '다시 누르면 되돌려요' : k === 'done' ? 'XP 없이 끝낸 것으로 닫아요' : undefined}
                  onClick={() => onDecide(c.id, k)}>{label}</button>
              ))}
            </div>
          </div>
        )
      })}
    </Sec>
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
  const save = () => { const t = text.trim(); if (t) onCustom(t); setText(''); setWriting(false) }
  const foot = room === 0 ? `다음 주 목표가 이미 ${existing}개라 더 고를 수 없어요 — 그대로 끝내도 돼요`
    : full ? '더 고르려면 하나를 빼요' : `다음 주 목표를 ${room}개까지 골라요${existing ? ` · 이미 있는 목표 ${existing}개` : ''}`
  return (
    <>
      <Sec title={`목표 고르기 ${picked.length} / ${room}`} foot={foot}>
        {sugs.map((s) => {
          const on = picks.includes(s.key)
          return (
            <button key={s.key} className={`rv-row rv-pk${on ? ' is-on' : ''}`} role="checkbox" aria-checked={on} disabled={!on && full} onClick={() => onToggle(s.key)}>
              <i className="rv-pk__box">{on && <Check />}</i>
              <span className="rv-pk__txt"><b>{s.kind === 'project' ? `${s.emoji ?? '🚀'} ` : ''}{s.title}</b><small>{s.meta}</small></span>
            </button>
          )
        })}
        {writing ? (
          <div className="rv-row rv-pk is-input">
            <input autoFocus value={text} placeholder="예: 운동 3번" maxLength={60} aria-label="목표 직접 적기"
              onChange={(e) => setText(e.target.value)} onBlur={save}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save() } else if (e.key === 'Escape') { setText(''); setWriting(false) } }} />
          </div>
        ) : (
          <button className="rv-row rv-add" disabled={full} onClick={() => setWriting(true)}>＋ 직접 적기</button>
        )}
      </Sec>
      <Sec title={`다음 주 · ${md(planWeek)}부터`}>
        <Days cols={cols} today={today} onOpen={onOpen} goal />
      </Sec>
    </>
  )
}
