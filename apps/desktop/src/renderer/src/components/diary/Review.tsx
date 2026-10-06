import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useQuery } from '../../data/useQuery'
import { useWeekStart } from '../../data/calendarOptions'
import {
  averageMood, dayRange, highlightsOf, insightOf, isWritten, longestStreak, monthGrid, moodOf, moodTrend, MOODS, weekDaysHead, weekdayIdx,
  type Buddy, type DiaryEntry
} from '../../data/diary'
import { dayKey } from '../../lib/dates'
import { CharacterArt } from '../growth/CharacterArt'
import { dateLabel, firstLine, monthOf, parse, shiftMonth } from './dates'
import { LeafIcon, MoodFace, PaperIcon } from './MoodFace'

// 15 §9.6 돌아보기 — 이번 달 한 장(캐릭터 + 한 줄 발견 + 칩) · 기분 달력 · 기분 흐름 · 기억에 남는 날 · 연 모자이크(12×31)
type Props = { entries: DiaryEntry[]; byDate: Map<string, DiaryEntry>; today: string; streak: number; initialMonth: string; buddy: Buddy; stage: number; onPick: (d: string) => void }
export function Review({ entries, byDate, today, streak, initialMonth, buddy, stage, onPick }: Props) {
  const [scale, setScale] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(initialMonth)
  const ws = useWeekStart() // 06 §16.1 주 시작 설정
  const year = month.slice(0, 4)
  const range = useMemo(() => {
    const from = scale === 'month' ? `${month}-01` : `${year}-01-01`
    const to = scale === 'month' ? `${shiftMonth(month, 1)}-01` : `${Number(year) + 1}-01-01`
    return [dayRange(from)[0], dayRange(to)[0]]
  }, [scale, month, year])
  const doneRows = useQuery<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ?', range)
  const doneByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of doneRows ?? []) { const d = dayKey(0, new Date(r.completed_at)); map.set(d, (map.get(d) ?? 0) + 1) }
    return map
  }, [doneRows])
  const written = useMemo(() => entries.filter(isWritten), [entries])
  const best = useMemo(() => longestStreak(written.map((e) => e.date)), [written])
  const inMonth = written.filter((e) => monthOf(e.date) === month)
  const inYear = written.filter((e) => e.date.slice(0, 4) === year)
  const scope = scale === 'month' ? inMonth : inYear
  const avg = averageMood(scope)
  const counts = MOODS.map((m) => ({ m, n: scope.filter((e) => e.mood === m.value).length })).filter((x) => x.n)
  const total = counts.reduce((s, x) => s + x.n, 0)
  const top = [...counts].sort((a, b) => b.n - a.n)[0]
  const m0 = parse(`${month}-01`)
  const nav = (n: number) => setMonth(scale === 'month' ? shiftMonth(month, n) : `${Number(year) + n}-${month.slice(5)}`)
  const canNext = scale === 'month' ? month < monthOf(today) : year < today.slice(0, 4)
  const say = scale === 'month'
    ? (inMonth.length ? insightOf(inMonth, doneByDay) : '이 달은 아직 비어 있어요. 지난 날도 쓸 수 있어요')
    : (inYear.length ? `올해 ${inYear.length}일을 같이 적었어요${top ? ` · ${top.m.emoji} ${top.m.label.replace(/어요$/, '던')} 날이 가장 많았어요` : ''}` : '올해는 아직 비어 있어요')

  return (
    <div className="diary-review">
      <div className="diary-review__inner">
        <div className="diary-review__bar">
          <div className="seg" role="tablist" aria-label="돌아보기 단위">
            <button role="tab" aria-selected={scale === 'month'} className={scale === 'month' ? 'is-on' : ''} onClick={() => setScale('month')}>월</button>
            <button role="tab" aria-selected={scale === 'year'} className={scale === 'year' ? 'is-on' : ''} onClick={() => setScale('year')}>연</button>
          </div>
          <button className="icon-btn" aria-label="이전" onClick={() => nav(-1)}><ChevronLeft /></button>
          <span className="diary-review__label">{scale === 'month' ? `${m0.getFullYear()}년 ${m0.getMonth() + 1}월` : `${year}년`}</span>
          <button className="icon-btn" aria-label="다음" disabled={!canNext} onClick={() => nav(1)}><ChevronRight /></button>
        </div>

        <section className="diary-hero diary-sky--day">
          <svg className="diary-hero__ground" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="300" cy="60" rx="700" ry="44" /></svg>
          <span className="diary-hero__char"><CharacterArt species={buddy.species} stage={stage} size={100} mood="happy" /></span>
          <div className="diary-hero__say">
            <div className="diary-hero__bubble" role="status">{say}</div>
            <div className="diary-hero__chips">
              <span className="diary-hchip">기록 <b>{scope.length}일</b></span>
              <span className="diary-hchip"><LeafIcon size={16} />지금 <b>{streak}일</b> 연속</span>
              <span className="diary-hchip">가장 길게 <b>{best}일</b></span>
              {avg && <span className="diary-hchip">평균 기분 <MoodFace mood={avg} size={18} /></span>}
            </div>
          </div>
        </section>

        {scale === 'year' ? (
          <section className="diary-rcard diary-year">
            <h4>올해의 기분 모자이크<small>칸 = 하루 · 누르면 그날로</small></h4>
            <div className="diary-year__scroll">
              <div className="diary-year__grid" role="grid" aria-label={`${year}년 기분 모자이크`}>
                <span />
                {Array.from({ length: 31 }, (_, i) => <em key={i}>{i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}</em>)}
                {Array.from({ length: 12 }, (_, mi) => {
                  const mo = `${year}-${String(mi + 1).padStart(2, '0')}`
                  return [
                    <button key={mo} className="diary-year__mn" disabled={mo > monthOf(today)} onClick={() => { setMonth(mo); setScale('month') }}>{mi + 1}월</button>,
                    ...Array.from({ length: 31 }, (_, di) => {
                      const d = `${mo}-${String(di + 1).padStart(2, '0')}`
                      if (parse(d).getMonth() !== mi) return <i key={d} className="is-none" />
                      const e = byDate.get(d)
                      const w = !!e && isWritten(e)
                      const mood = w ? moodOf(e?.mood) : undefined
                      if (d > today) return <i key={d} className="is-future" />
                      return <button key={d} className={w && !mood ? 'is-written' : ''} style={mood ? { background: mood.color } : undefined} title={`${dateLabel(d, today)}${mood ? ` · ${mood.label}` : w ? ' · 일기 있음' : ''}`} aria-label={`${dateLabel(d, today)}${mood ? ` · ${mood.label}` : w ? ' · 일기 있음' : ''}`} onClick={() => onPick(d)} />
                    })
                  ]
                })}
              </div>
            </div>
            <div className="diary-legend">
              {MOODS.map((m) => <span key={m.value}><MoodFace mood={m.value} size={16} />{m.label}</span>)}
              <span><i className="diary-legend__w" />기분 없이 쓴 날</span>
            </div>
          </section>
        ) : (
          <div className="diary-review__grid">
            <section className="diary-rcard">
              <h4>기분 달력<small>칸을 누르면 그날 쓰기</small></h4>
              <div className="diary-mgrid">
                {weekDaysHead(ws).map((w) => <b key={w}>{w}</b>)}
                {Array.from({ length: weekdayIdx(`${month}-01`, ws) }, (_, i) => <i key={`b${i}`} />)}
                {monthGrid(month, ws).filter((d) => monthOf(d) === month).map((d) => {
                  const e = byDate.get(d)
                  const w = !!e && isWritten(e)
                  const mood = w ? moodOf(e?.mood) : undefined
                  const cls = d > today ? 'is-future' : w ? (mood ? 'has-mood' : 'has-entry') : 'is-blank'
                  return (
                    <button key={d} className={`${cls}${d === today ? ' is-today' : ''}`} disabled={d > today} style={mood ? ({ '--mood': mood.color } as React.CSSProperties) : undefined} onClick={() => onPick(d)} aria-label={`${dateLabel(d, today)}${mood ? ` · ${mood.label}` : w ? ' · 일기 있음' : ''}`}>
                      <span className="diary-mgrid__n">{parse(d).getDate()}</span>
                      {mood ? <MoodFace mood={mood.value} size={26} /> : w ? <PaperIcon size={24} /> : null}
                      {w && <span className="diary-mgrid__tip">{e!.private ? <><Lock />나만 보기</> : firstLine(e!.content) || mood?.label}</span>}
                    </button>
                  )
                })}
              </div>
            </section>
            <div className="diary-review__col">
              <section className="diary-rcard">
                <h4>기분 흐름</h4>
                <Trend points={moodTrend(inMonth, month)} />
                {total ? (
                  <>
                    <div className="diary-dist">{counts.map(({ m, n }) => <i key={m.value} style={{ width: `${(n / total) * 100}%`, background: m.color }} />)}</div>
                    <div className="diary-legend">{counts.map(({ m, n }) => <span key={m.value}><MoodFace mood={m.value} size={16} />{n}</span>)}</div>
                  </>
                ) : <p className="diary-none">아직 고른 기분이 없어요</p>}
              </section>
              <section className="diary-rcard">
                <h4>기억에 남는 날<small>나만 보기 날은 빼요</small></h4>
                <div className="diary-hl">
                  {highlightsOf(inMonth, month).map((e, i) => (
                    <button key={e.date} className="diary-hl__card" style={{ '--r': `${[-0.6, 0.5, -0.3][i]}deg` } as React.CSSProperties} onClick={() => onPick(e.date)}>
                      <span className="diary-hl__head"><MoodFace mood={e.mood!} size={20} />{dateLabel(e.date, today)}</span>
                      <p>{e.content}</p>
                    </button>
                  ))}
                  {!highlightsOf(inMonth, month).length && <p className="diary-none">기분과 함께 쓴 날이 생기면 여기에 모아 둘게요</p>}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** 기분 흐름 선: 가로 = 그 달 날짜, 세로 = 기분 1~5. 빈 날은 끊긴다 */
function Trend({ points }: { points: { date: string; mood: number | null }[] }) {
  const W = 320
  const H = 130
  const n = Math.max(points.length - 1, 1)
  const px = (i: number) => 12 + (i * (W - 20)) / n
  const py = (v: number) => H - 14 - ((v - 1) * (H - 28)) / 4
  let path = ''
  let prev = -2
  points.forEach((p, i) => { if (p.mood) { path += `${prev === i - 1 ? 'L' : 'M'}${px(i)} ${py(p.mood)} `; prev = i } })
  const has = points.some((p) => p.mood)
  return (
    <svg className="diary-trend" viewBox={`-24 0 ${W + 26} ${H}`} role="img" aria-label={has ? '이번 달 기분 흐름' : '이번 달 기분 기록 없음'}>
      {MOODS.map((m) => <line key={m.value} x1="10" x2={W} y1={py(m.value)} y2={py(m.value)} />)}
      {MOODS.map((m) => <g key={`f${m.value}`} transform={`translate(-24 ${py(m.value) - 9})`}><MoodFace mood={m.value} size={18} /></g>)}
      <path d={path} />
      {points.map((p, i) => p.mood ? <circle key={p.date} cx={px(i)} cy={py(p.mood)} r="3.6" fill={moodOf(p.mood)?.color} /> : null)}
    </svg>
  )
}
