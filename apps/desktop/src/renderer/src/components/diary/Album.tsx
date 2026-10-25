import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { topWords } from '@sprout/schema/diaryScene'
import { addDays } from '@sprout/schema/time'
import type { SceneCard } from '@sprout/schema/diaryScene'
import { isWritten, MOODS, weekDaysHead, weekdayIdx, type DiaryEntry } from '../../data/diary'
import { useWeekStart } from '../../data/calendarOptions'
import { parse, shiftMonth } from './dates'
import { SceneCardView } from './SceneCard'
import { useMonthScenes } from './sceneData'

// 15 §11 D3 · 28 §10.4 앨범 — 한 달이 사진첩처럼: 7칸 격자(칸 = 그날의 장면 3:4, 빈 날 빗금 — 빨강·탓 없음) + ▶ 넘겨 보기 + 이번 달 세 장
// (기분 비율 · 좋았던 날 자주 한 일(할 일 데이터) · 많이 쓴 말(topWords — 기기에서, AI 없음)). 칸 누르기 = 오른쪽 칸에 그날, 두 번 누르기 = 그날 일기 열기.

const STEP = 3000

export function AlbumView({ month, entries, today, selected, reduced, onMonth, onSelect, onOpen }: {
  month: string; entries: DiaryEntry[] | undefined; today: string; selected: string; reduced: boolean
  onMonth: (m: string) => void; onSelect: (d: string) => void; onOpen: (d: string) => void
}) {
  const { scenes, doneByDay } = useMonthScenes(month, entries)
  const [play, setPlay] = useState(false)
  const ws = useWeekStart()
  const first = parse(`${month}-01`)
  const lead = weekdayIdx(`${month}-01`, ws)
  const days: string[] = []
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) days.push(d)
  const inMonth = useMemo(() => (entries ?? []).filter((e) => e.date.slice(0, 7) === month), [entries, month])
  const cards = [...scenes.values()]
  const photoN = cards.reduce((n, c) => n + c.photoCount, 0)
  const moods = MOODS.map((m) => ({ ...m, n: cards.filter((c) => c.mood === m.value).length }))
  const moodTotal = moods.reduce((n, m) => n + m.n, 0)
  const top = [...moods].sort((a, b) => b.n - a.n)[0]
  // 좋았던 날(기분 4~5) 자주 끝낸 할 일 — 제목 앞 12자로 묶어 센다
  const goodDone = useMemo(() => {
    const c = new Map<string, number>()
    for (const card of cards) if ((card.mood ?? 0) >= 4) for (const t of doneByDay.get(card.date) ?? []) { const k = t.trim().slice(0, 12); c.set(k, (c.get(k) ?? 0) + 1) }
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)
  }, [cards, doneByDay]) // eslint-disable-line react-hooks/exhaustive-deps
  const words = useMemo(() => topWords(inMonth.filter(isWritten).map((e) => e.content ?? '')), [inMonth])
  const canNext = month < today.slice(0, 7)
  return (
    <section className="dalbum" aria-label={`${first.getMonth() + 1}월 앨범`}>
      <header className="dalbum__head">
        <div className="dalbum__title">
          <b>{first.getFullYear() !== parse(today).getFullYear() ? `${first.getFullYear()}년 ` : ''}{first.getMonth() + 1}월 앨범</b>
          <small>{scenes.size ? `${scenes.size}장 남겼어요${photoN ? ` · 사진 ${photoN}` : ''}${top?.n ? ` · ${top.label.replace(/어요$/, '던')} 날이 제일 많아요` : ''}` : '아직 장면이 없어요 — 기분 하나만 남겨도 한 장이 돼요'}</small>
        </div>
        <span className="dalbum__sp" />
        <button className="icon-btn" aria-label="이전 달" onClick={() => onMonth(shiftMonth(month, -1))}><ChevronLeft /></button>
        <button className="icon-btn" aria-label="다음 달" disabled={!canNext} onClick={() => onMonth(shiftMonth(month, 1))}><ChevronRight /></button>
        <button className="dpill is-save" disabled={!scenes.size} onClick={() => setPlay(true)}><Play />넘겨 보기</button>
      </header>
      <div className="dalbum__scroll">
        <div className="dalbum__week" aria-hidden="true">{weekDaysHead(ws).map((w) => <span key={w}>{w}</span>)}</div>
        <div className="dalbum__grid">
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} className="dalbum__pad" />)}
          {days.map((d) => {
            const c = scenes.get(d)
            const future = d > today
            return (
              <div key={d} className={`dalbum__cell${d === selected ? ' is-selected' : ''}${future ? ' is-future' : ''}`} onDoubleClick={() => { if (!future) onOpen(d) }}>
                {c ? <SceneCardView card={c} variant="cell" onClick={() => onSelect(d)} />
                  : <button className="dalbum__empty" disabled={future} onClick={() => onSelect(d)} aria-label={`${Number(d.slice(8))}일 비어 있음`}><span>{Number(d.slice(8))}</span></button>}
              </div>
            )
          })}
        </div>
        <div className="dalbum__recap">
          <div className="drecap">
            <b>이번 달 기분</b>
            {moodTotal ? <>
              <div className="ddist">{moods.filter((m) => m.n).map((m) => <i key={m.value} style={{ flex: m.n, background: m.color }} title={`${m.label} ${m.n}`} />)}</div>
              <span>{moods.filter((m) => m.n).sort((a, b) => b.n - a.n).slice(0, 2).map((m) => `${m.label.replace(/어요$/, '던')} 날 ${m.n}`).join(' · ')}</span>
            </> : <span className="drecap__none">기분을 남기면 여기에 모여요</span>}
          </div>
          <div className="drecap">
            <b>좋았던 날 자주 한 일</b>
            <span>{goodDone.length ? goodDone.join(' · ') : <span className="drecap__none">좋았던 날 끝낸 할 일이 여기에 모여요</span>}</span>
          </div>
          <div className="drecap">
            <b>이번 달 가장 많이 쓴 말</b>
            <span>{words.length ? words.join(' · ') : <span className="drecap__none">일기를 몇 번 더 쓰면 보여요</span>}</span>
          </div>
        </div>
      </div>
      {play && <AlbumPlay month={month} cards={cards.sort((a, b) => (a.date < b.date ? -1 : 1))} reduced={reduced} onClose={() => setPlay(false)} onOpen={(d) => { setPlay(false); onOpen(d) }} />}
    </section>
  )
}

/** ▶ 넘겨 보기(28 §10.4 P3): 3초마다 다음 장(위 진행 줄), ←/→ 앞뒤, 스페이스 멈춤·계속, Esc 닫기. 움직임 줄이기면 자동 넘김 끔 */
function AlbumPlay({ month, cards, reduced, onClose, onOpen }: { month: string; cards: SceneCard[]; reduced: boolean; onClose: () => void; onOpen: (d: string) => void }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(reduced)
  const bar = useRef<HTMLElement>(null)
  const go = (d: number) => setI((x) => { const n = x + d; if (n >= cards.length) { onClose(); return x } return Math.max(0, n) })
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const el = bar.current
    if (!el || paused || !cards.length) return
    const a = el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: STEP, easing: 'linear', fill: 'forwards' })
    a.onfinish = () => goRef.current(1)
    return () => a.cancel()
  }, [i, paused, cards.length])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); goRef.current(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); goRef.current(-1) }
      else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPaused((p) => !p) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  const card = cards[i]
  return (
    <div className="dplay" role="dialog" aria-modal="true" aria-label={`${Number(month.slice(5))}월 넘겨 보기`}>
      <div className="dplay__bars">{cards.map((c, k) => <span key={c.date}>{k < i ? <i style={{ transform: 'none' }} /> : k === i ? <i ref={bar} style={{ transform: paused ? 'scaleX(0)' : undefined }} /> : null}</span>)}</div>
      <div className="dplay__top">
        <button className="dplay__btn" aria-label="닫기 (Esc)" onClick={onClose}><X /></button>
        <b>{Number(month.slice(5))}월 · {i + 1} / {cards.length}장</b>
        <button className="dplay__btn" aria-label={paused ? '계속 (스페이스)' : '멈춤 (스페이스)'} onClick={() => setPaused((p) => !p)}>{paused ? <Play /> : <Pause />}</button>
      </div>
      <div className="dplay__stage">
        <button className="dplay__nav is-prev" aria-label="앞 장 (←)" onClick={() => go(-1)} disabled={i === 0}><ChevronLeft /></button>
        {card && <div key={card.date} className="dplay__card"><SceneCardView card={card} variant="hero" /></div>}
        <button className="dplay__nav is-next" aria-label="다음 장 (→)" onClick={() => go(1)}><ChevronRight /></button>
      </div>
      <div className="dplay__acts">
        <button className="dbtn is-soft" disabled={!card} onClick={() => card && onOpen(card.date)}>이 날 일기 열기</button>
        <small>← → 넘기기 · 스페이스 멈춤 · Esc 닫기</small>
      </div>
    </div>
  )
}
