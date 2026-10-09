import { ChevronDown, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { isWritten, monthGrid, moodOf, previewOf, weekDaysHead, type DiaryEntry } from '../../data/diary'
import { useWeekStart } from '../../data/calendarOptions'
import { dateLabel, monthOf, parse, shiftMonth } from './dates'
import { MoodFace, PaperIcon } from './MoodFace'

// 15 §9.1·§10.1 왼쪽 260 — 미니 달력(주 시작 설정 — 06 §16.1, 기분 색 칸) · 날짜 목록(첫 줄 = 첫 편 제목, 머리·태그 줄은 안 보임). 이어 쓰기(연속) 카드는 없앴다(§10)

export function MiniCalendar({ date, today, byDate, onPick }: { date: string; today: string; byDate: Map<string, DiaryEntry>; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(monthOf(date))
  useEffect(() => setMonth(monthOf(date)), [date])
  const ws = useWeekStart()
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
        {weekDaysHead(ws).map((w) => <b key={w}>{w}</b>)}
        {monthGrid(month, ws).map((d) => {
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
                    : <span className="diary-row__preview">{previewOf(e, { search: true }) || moodOf(e.mood)?.label}</span>}
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}
