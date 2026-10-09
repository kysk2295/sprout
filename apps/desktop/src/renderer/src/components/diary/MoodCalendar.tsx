import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { weekLineOf } from '@sprout/schema/diaryTalk'
import { useQuery } from '../../data/useQuery'
import { useWeekStart } from '../../data/calendarOptions'
import { dayRange, isWritten, monthGrid, moodOf, moodShare, MOODS, previewOf, weekDaysHead, weekOf, type DiaryEntry } from '../../data/diary'
import { dayKey } from '../../lib/dates'
import { CharacterArt } from '../growth/CharacterArt'
import { dateLabel, monthOf, parse, shiftMonth } from './dates'
import { MoodFace, PaperIcon } from './MoodFace'
import type { FullBuddy } from './Talk'

// 15 §10.6 · 28 §8.4 기분 달력 하나(§9.6 돌아보기를 대신): 월 = 달력(얼굴) · 이번 달 기분(막대 + 개수) · 이번 주 돌아보기(AI 없음)
// 연 = 12줄 × 31칸 모자이크. 연속 기록·XP 숫자는 없다(28 §8.1-8).
type Props = { entries: DiaryEntry[]; byDate: Map<string, DiaryEntry>; today: string; initialMonth: string; buddy: FullBuddy; wide: boolean; reduced: boolean; onPick: (d: string) => void; onWeekOne: () => void }
export function MoodCalendar({ entries, byDate, today, initialMonth, buddy, wide, reduced, onPick, onWeekOne }: Props) {
  const [scale, setScale] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(initialMonth)
  const ws = useWeekStart()
  const year = month.slice(0, 4)
  const written = useMemo(() => entries.filter(isWritten), [entries])
  const inMonth = written.filter((e) => monthOf(e.date) === month)
  const inYear = written.filter((e) => e.date.slice(0, 4) === year)
  const share = moodShare(inMonth)
  const m0 = parse(`${month}-01`)
  const nav = (n: number) => setMonth(scale === 'month' ? shiftMonth(month, n) : `${Number(year) + n}-${month.slice(5)}`)
  const canNext = scale === 'month' ? month < monthOf(today) : year < today.slice(0, 4)
  // 이번 주(주 시작 설정) — 이번 달을 볼 때만
  const week = weekOf(today, ws)
  const range = useMemo(() => [dayRange(week[0])[0], dayRange(week[6])[1]], [week[0]]) // eslint-disable-line react-hooks/exhaustive-deps
  const doneRows = useQuery<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ?', range)
  const doneBy = useMemo(() => { const map = new Map<string, number>(); for (const r of doneRows ?? []) { const d = dayKey(0, new Date(r.completed_at)); map.set(d, (map.get(d) ?? 0) + 1) } return map }, [doneRows])
  const weekRows = week.map((d) => { const e = byDate.get(d); return { date: d, mood: e?.mood ?? null, written: !!e && isWritten(e), done: doneBy.get(d) ?? 0, private: !!e?.private } })
  const weekLine = weekLineOf(weekRows.filter((d) => d.date <= today))

  return (
    <div className="dcal">
      <div className="dcal__inner">
        <div className="dcal__bar">
          <h2>{scale === 'month' ? <>{m0.getMonth() + 1}월<small>{m0.getFullYear()}</small></> : `${year}년`}</h2>
          <button className="icon-btn" aria-label={scale === 'month' ? '이전 달' : '지난해'} onClick={() => nav(-1)}><ChevronLeft /></button>
          <button className="icon-btn" aria-label={scale === 'month' ? '다음 달' : '다음 해'} disabled={!canNext} onClick={() => nav(1)}><ChevronRight /></button>
          <span className="dcal__sp" />
          <div className="seg" role="tablist" aria-label="기분 달력 단위">
            <button role="tab" aria-selected={scale === 'month'} className={scale === 'month' ? 'is-on' : ''} onClick={() => setScale('month')}>월</button>
            <button role="tab" aria-selected={scale === 'year'} className={scale === 'year' ? 'is-on' : ''} onClick={() => setScale('year')}>연</button>
          </div>
        </div>

        {scale === 'year' ? (
          <section className="dcard dyear">
            <h4>한 해 기분<small>{inYear.length}일 남겼어요</small></h4>
            <div className="dyear__scroll">
              <div className="dyear__grid" role="grid" aria-label={`${year}년 기분 모자이크`}>
                <span />
                {Array.from({ length: 31 }, (_, i) => <em key={i}>{i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}</em>)}
                {Array.from({ length: 12 }, (_, mi) => {
                  const mo = `${year}-${String(mi + 1).padStart(2, '0')}`
                  return [
                    <button key={mo} className="dyear__mn" disabled={mo > monthOf(today)} onClick={() => { setMonth(mo); setScale('month') }}>{mi + 1}월</button>,
                    ...Array.from({ length: 31 }, (_, di) => {
                      const d = `${mo}-${String(di + 1).padStart(2, '0')}`
                      if (parse(d).getMonth() !== mi) return <i key={d} className="is-none" />
                      if (d > today) return <i key={d} className="is-future" />
                      const e = byDate.get(d)
                      const w = !!e && isWritten(e)
                      const mood = w ? moodOf(e?.mood) : undefined
                      const label = `${dateLabel(d, today)}${mood ? ` · ${mood.label}` : w ? ' · 일기 있음' : ''}`
                      return <button key={d} className={w && !mood ? 'is-written' : ''} style={mood ? { background: mood.color } : undefined} title={label} aria-label={label} onClick={() => onPick(d)} />
                    })
                  ]
                })}
              </div>
            </div>
            <div className="dlegend">
              {MOODS.map((m) => <span key={m.value}><MoodFace mood={m.value} size={16} />{m.label}</span>)}
              <span><i className="dlegend__w" />기분 없이 쓴 날</span>
            </div>
          </section>
        ) : (
          <div className={`dcal__grid${wide ? ' is-wide' : ''}`}>
            <section className="dcard dmonth">
              <div className="dmonth__grid">
                {weekDaysHead(ws).map((w) => <b key={w}>{w}</b>)}
                {monthGrid(month, ws).map((d) => {
                  const other = monthOf(d) !== month
                  if (other) return <i key={d} />
                  const e = byDate.get(d)
                  const w = !!e && isWritten(e)
                  const mood = w ? moodOf(e?.mood) : undefined
                  const label = `${dateLabel(d, today)}${mood ? ` · ${mood.label}` : w ? ' · 일기 있음' : ''}`
                  return (
                    <button key={d} className={`${d > today ? 'is-future' : ''}${d === today ? ' is-today' : ''}`} disabled={d > today} onClick={() => onPick(d)} aria-label={label}
                      title={w ? (previewOf(e!) || mood?.label || '') : undefined}>
                      <span className="dmonth__n">{parse(d).getDate()}</span>
                      {e?.private && w ? <span className="dmonth__lock"><Lock /></span>
                        : mood ? <MoodFace mood={mood.value} size={30} />
                          : w ? <PaperIcon size={28} />
                            : d < today ? <span className="dmonth__blank" /> : <span className="dmonth__none" />}
                    </button>
                  )
                })}
              </div>
            </section>
            <div className="dcal__col">
              <section className="dcard">
                <h4>이번 달 기분<small>{inMonth.length}일 남겼어요</small></h4>
                {share.length ? (
                  <>
                    <div className="ddist">{share.map((s) => <i key={s.mood} style={{ width: `${s.ratio * 100}%`, background: moodOf(s.mood)?.color }} />)}</div>
                    <div className="dlegend">{share.map((s) => <span key={s.mood}><MoodFace mood={s.mood} size={18} />{s.n}</span>)}</div>
                  </>
                ) : <p className="dnone">{inMonth.length ? '기분을 고른 날이 아직 없어요' : '이 달은 아직 비어 있어요. 지난 날도 쓸 수 있어요'}</p>}
              </section>
              {month === monthOf(today) && (
                <section className="dcard">
                  <h4>이번 주 돌아보기<small>{Number(week[0].slice(5, 7))}월 {Number(week[0].slice(8))}일 ~ {Number(week[6].slice(8))}일</small></h4>
                  <div className="dweek">
                    {weekRows.map((d, i) => (
                      <button key={d.date} disabled={d.date > today} onClick={() => onPick(d.date)} aria-label={dateLabel(d.date, today)}>
                        {d.private && d.written ? <span className="dweek__e is-lock"><Lock /></span> : d.mood ? <MoodFace mood={d.mood} size={30} /> : <span className={`dweek__e${d.date > today ? ' is-future' : ''}`} />}
                        <small className={d.date === today ? 'is-today' : ''}>{weekDaysHead(ws)[i]}</small>
                      </button>
                    ))}
                  </div>
                  <div className="dweek__say">
                    <CharacterArt species={buddy.species} stage={buddy.stage} size={40} mood="happy" crop="bust" motion={reduced ? 'still' : 'idle'} />
                    <p>{weekLine}</p>
                  </div>
                  <button className="dbtn is-block" onClick={onWeekOne}>이번 주를 한 줄로 남기기</button>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
