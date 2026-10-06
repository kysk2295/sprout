import { ChevronDown, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { isWritten, monthGrid, moodOf, WEEK_DAYS, weekOf, type DiaryEntry } from '../../data/diary'
import { dateLabel, firstLine, monthOf, parse, shiftMonth } from './dates'
import { LeafIcon, MoodFace, PaperIcon } from './MoodFace'

// 15 §9.1 왼쪽 260 — 이어 쓰기 카드 · 미니 달력(일요일 시작, 기분 색 칸) · 날짜 목록

/** 이어 쓰기 카드: 연속 N일(새싹 잎) + 이번 주(월~일) 7칸 */
export function StreakCard({ streak, byDate, today }: { streak: { days: number; today: boolean }; byDate: Map<string, DiaryEntry>; today: string }) {
  const n = streak.days
  return (
    <div className="diary-streak">
      <span className="diary-streak__leaf"><LeafIcon /></span>
      <span className="diary-streak__text">
        <b>{n ? `${n}일째 이어 쓰는 중` : '오늘부터 시작해요'}</b>
        <small>{n ? (streak.today ? '지난 날을 채워도 이어져요' : '오늘도 이어 가요') : '하루 한 줄이면 충분해요'}</small>
      </span>
      <span className="diary-streak__week" aria-label="이번 주 기록">
        {weekOf(today).map((d, i) => {
          const e = byDate.get(d)
          const on = !!e && isWritten(e)
          const m = moodOf(e?.mood)
          return (
            <span key={d} title={d}>
              <small>{WEEK_DAYS[i]}</small>
              <i className={`${on ? 'is-on' : ''}${d === today ? ' is-today' : ''}${d > today ? ' is-future' : ''}`} style={on ? { background: m?.color ?? 'var(--color-accent)' } : undefined} />
            </span>
          )
        })}
      </span>
    </div>
  )
}

export function MiniCalendar({ date, today, byDate, onPick }: { date: string; today: string; byDate: Map<string, DiaryEntry>; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(monthOf(date))
  useEffect(() => setMonth(monthOf(date)), [date])
  const m = parse(`${month}-01`)
  return (
    <div className="diary-cal">
      <div className="diary-cal__head">
        <span>{m.getFullYear()}년 {m.getMonth() + 1}월</span>
        <span className="diary-cal__nav">
          <button className="icon-btn" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button>
          <button className="icon-btn" aria-label="다음 달" disabled={month >= monthOf(today)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button>
        </span>
      </div>
      <div className="diary-cal__grid">
        {WEEK_DAYS.map((w) => <b key={w}>{w}</b>)}
        {monthGrid(month).map((d) => {
          const e = byDate.get(d)
          const written = !!e && isWritten(e)
          const mood = written ? moodOf(e?.mood) : undefined
          const cls = ['diary-cal__day', monthOf(d) !== month && 'is-other', d === date && 'is-selected', d === today && 'is-today', d > today && 'is-future', mood && 'has-mood', written && !mood && 'has-entry'].filter(Boolean).join(' ')
          return (
            <button key={d} className={cls} disabled={d > today} style={mood ? ({ '--mood': mood.color } as React.CSSProperties) : undefined} onClick={() => onPick(d)} aria-label={`${dateLabel(d, today)}${mood ? ` · ${mood.label}` : written ? ' · 일기 있음' : ''}`} aria-current={d === date ? 'date' : undefined}>
              {parse(d).getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function EntryList({ entries, date, today, query, onPick }: { entries?: DiaryEntry[]; date: string; today: string; query: string; onPick: (d: string) => void }) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const q = query.trim().toLowerCase()
  const rows = (entries ?? []).filter(isWritten).filter((e) => !q || (e.content ?? '').toLowerCase().includes(q))
  const groups = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>()
    for (const e of rows) map.set(monthOf(e.date), [...(map.get(monthOf(e.date)) ?? []), e])
    return [...map]
  }, [rows])
  if (!entries) return <div className="diary-list" />
  if (!rows.length) {
    return (
      <div className="diary-list">
        <div className="diary-list__empty">
          <PaperIcon size={56} />
          {q ? <span>&quot;{query}&quot;와 맞는 일기가 없어요</span> : <span>아직 쓴 일기가 없어요<br />첫 페이지를 채워 볼까요?</span>}
        </div>
      </div>
    )
  }
  return (
    <div className="diary-list">
      {groups.map(([m, items]) => {
        const shut = closed.has(m) && !q
        const md = parse(`${m}-01`)
        return (
          <section key={m}>
            <div className="group__header diary-list__group" onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(m)) n.delete(m); else n.add(m); return n })}>
              <ChevronDown className={`group__chevron${shut ? ' is-collapsed' : ''}`} />
              <span className="group__name">{m.slice(0, 4) === today.slice(0, 4) ? '' : `${md.getFullYear()}년 `}{md.getMonth() + 1}월</span>
              <span className="group__count">{items.length}</span>
            </div>
            {!shut && items.map((e) => (
              <button key={e.id} className={`diary-row${e.date === date ? ' is-selected' : ''}`} onClick={() => onPick(e.date)}>
                <span className="diary-row__mood">{e.mood ? <MoodFace mood={e.mood} size={26} /> : <PaperIcon />}</span>
                <span className="diary-row__main">
                  <span className="diary-row__date">{dateLabel(e.date, today)}{e.date === today ? ' · 오늘' : ''}</span>
                  {/* 나만 보기 날은 미리보기를 숨긴다(결정 ⑥, 화면 공유 대비) — 검색 중에는 내가 찾은 글이라 보인다 */}
                  {e.private && !q
                    ? <span className="diary-row__preview is-locked"><Lock aria-hidden="true" />나만 보기</span>
                    : <span className="diary-row__preview">{firstLine(e.content) || moodOf(e.mood)?.label}</span>}
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}
