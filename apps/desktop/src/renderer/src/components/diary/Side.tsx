import { ChevronDown, ChevronLeft, ChevronRight, PenLine } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { lookbackDates } from '@sprout/schema/diaryScene'
import { hasSoloDraft, isWritten, monthGrid, moodOf, previewOf, weekDaysHead, type DiaryEntry } from '../../data/diary'
import { useQuery } from '../../data/useQuery'
import { SceneCardView } from './SceneCard'
import { useSceneCard } from './sceneData'
import { useWeekStart } from '../../data/calendarOptions'
import { dateLabel, monthOf, parse, shiftMonth } from './dates'
import { MoodFace, PaperIcon } from './MoodFace'

// 15 §11 왼쪽 268 — 기록: 미니 기분 달력(주 시작 설정 — 06 §16.1, 기분 색 칸) · 1년·한 달 전 오늘 카드 · 장 목록(첫 줄 = 첫 장 제목, 머리·태그 줄은 안 보임)
// / 앨범: 달 목록(N장 · 사진 N). 나만 보기 표시는 없앴다(28 §9.7 ⑥).

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
                  <span className="diary-row__preview">{e.date === today && hasSoloDraft(e.date) ? <><PenLine aria-hidden="true" />쓰는 중 · 임시 저장됨</> : previewOf(e, { search: true }) || moodOf(e.mood)?.label}</span>
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}

/** 28 §10.4 1년·한 달 전 오늘 — 그날 장면이 있을 때만(앨범 칸과 같은 카드) */
export function Lookbacks({ today, byDate, onPick }: { today: string; byDate: Map<string, DiaryEntry>; onPick: (d: string) => void }) {
  return <>{lookbackDates(today).map((x) => <Lookback key={x.date} date={x.date} label={`${x.label} · ${x.date.replace(/-/g, '.')}`} entry={byDate.get(x.date)} onPick={onPick} />)}</>
}
function Lookback({ date, label, entry, onPick }: { date: string; label: string; entry: DiaryEntry | undefined; onPick: (d: string) => void }) {
  const card = useSceneCard(date, entry)
  if (!card) return null
  return <div className="diary-ago"><SceneCardView card={card} variant="row" label={label} onClick={() => onPick(date)} /></div>
}

/** 앨범: 남긴 달 목록(그 달 장면 수는 일기 쓴 날 기준 · 사진 수) */
export function AlbumMonths({ entries, month, today, onPick }: { entries?: DiaryEntry[]; month: string; today: string; onPick: (m: string) => void }) {
  const photos = useQuery<{ m: string; n: number }>("SELECT substr(date, 1, 7) AS m, count(*) AS n FROM diary_photos GROUP BY m")
  const months = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries ?? []) if (isWritten(e) || e.mood) map.set(monthOf(e.date), (map.get(monthOf(e.date)) ?? 0) + 1)
    for (const p of photos ?? []) if (!map.has(p.m)) map.set(p.m, 0)
    if (!map.has(monthOf(today))) map.set(monthOf(today), 0)
    return [...map].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [entries, photos, today])
  const ph = new Map((photos ?? []).map((p) => [p.m, p.n]))
  return (
    <div className="diary-list diary-months">
      {months.map(([m, n]) => {
        const d = parse(`${m}-01`)
        return (
          <button key={m} className={`diary-row is-month${m === month ? ' is-selected' : ''}`} onClick={() => onPick(m)} aria-current={m === month ? 'true' : undefined}>
            <span className="diary-row__main">
              <span className="diary-row__preview"><b>{d.getFullYear()}년 {d.getMonth() + 1}월</b></span>
              <span className="diary-row__date">{n}장{ph.get(m) ? ` · 사진 ${ph.get(m)}` : ''}</span>
            </span>
          </button>
        )
      })}
      <div className="diary-book"><b>한 해 책 · 12월에</b>올해의 장면들을 한 권으로 모아 드려요</div>
    </div>
  )
}
