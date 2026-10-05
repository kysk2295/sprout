// 31 §10.3 작업 지도로 이어 주는 순간 — 할 일 목록 쪽 조각들.
// ① 큰 일 행 칩(BigTaskChip + useBigPick) ② 오늘 ⚡ 줄(NowLine) ③ 주간 점검 카드(ReviewCard). ④는 30 기본함 정리 카드에 단추 하나(ListSuggest).
import { Map as MapIcon, Sparkles, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '../../data/useQuery'
import { nowStrip, taskStates, unlockCounts } from '../../data/mapNow'
import {
  loadMoments, markBigSeen, nowLineDue, NOW_LINE, openMap, pickBigTask, reviewDue, saveMoments, subscribeMoments, type BigKind, type BigTaskInput
} from '../../data/mapMoments'
import { addDays } from '@sprout/schema/time'
import './moments.css'

const useMoments = () => {
  const [, tick] = useState(0)
  useEffect(() => subscribeMoments(() => tick((n) => n + 1)), [])
  return loadMoments()
}

const CHILDREN_SQL = 'SELECT parent_id AS id, count(*) AS n FROM tasks WHERE parent_id IS NOT NULL AND status = 0 AND deleted_at IS NULL GROUP BY parent_id'
/** ① 한 목록에 큰 일 칩 하나 — 신호가 가장 센 것(같으면 위), 본·닫은 것 빼고 */
export function useBigPick(enabled: boolean, tasks: BigTaskInput[] | undefined, order: string[], today: string): { id: string; kind: BigKind } | null {
  const m = useMoments()
  const seenKey = m.big.join(',')
  const kids = useQuery<{ id: string; n: number }>(CHILDREN_SQL)
  return useMemo(() => {
    if (!enabled || !tasks?.length || !kids) return null
    const idx = new Map(order.map((id, i) => [id, i]))
    const rows = [...tasks].sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9))
    return pickBigTask(rows, today, new Set(seenKey ? seenKey.split(',') : []), new Map(kids.map((k) => [k.id, k.n])))
  }, [enabled, tasks, order, today, seenKey, kids])
}

export function BigTaskChip({ taskId, kind }: { taskId: string; kind: BigKind }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const go = () => { markBigSeen(taskId); openMap({ mode: 'plan', task: taskId, breakdown: kind === 'split' }) }
  return (
    <span className="mm-chip" onClick={stop} onPointerDown={stop} onDoubleClick={stop} title="큰 일이에요 — 작업 지도에서 단계와 순서를 잡아요">
      <button className="mm-chip__go" onClick={go}><Sparkles />{kind === 'split' ? '지도에서 쪼개기' : '지도에서 순서 잡기'}</button>
      <button className="mm-chip__x" aria-label="다시 보지 않기" title="이 할 일에는 다시 안 보여요" onClick={() => markBigSeen(taskId)}><X /></button>
    </span>
  )
}

type NowRow = { id: string; title: string; status: number; due_at: string | null; start_at: string | null; priority: number; parent_id: string | null }
const TODAY_SQL = `SELECT t.id, t.title, t.status, t.due_at, t.start_at, t.priority, t.parent_id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
  WHERE t.deleted_at IS NULL AND t.status = 0 AND t.title != '' AND l.archived_at IS NULL AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) <= ?
  ORDER BY t.due_at, t.sort_order`
const SEQ_SQL = `SELECT ml.kind, ml.from_id, ml.to_id, ml.state FROM map_links ml JOIN tasks f ON f.id = ml.from_id
  WHERE ml.kind = 'sequence' AND ml.state = 'accepted' AND f.status = 0 AND f.deleted_at IS NULL`

/** 오늘 목록 맨 위: ③ 점검 카드가 뜰 때면 카드, 아니면 ② ⚡ 줄 */
export function TodayMoments({ today, onPick }: { today: string; onPick: (id: string) => void }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t) }, [])
  const m = useMoments()
  const week = reviewDue(now, m.review)
  if (week) return <ReviewCard week={week} today={today} />
  return <NowLine today={today} onPick={onPick} />
}

function NowLine({ today, onPick }: { today: string; onPick: (id: string) => void }) {
  const rows = useQuery<NowRow>(TODAY_SQL, [today])
  const links = useQuery<{ kind: 'sequence'; from_id: string; to_id: string; state: 'accepted' }>(SEQ_SQL)
  const m = useMoments()
  // 처음 판단을 기억해 둔다 — "오늘 처음 연 때"로 떴으면 이번에 열린 동안은 계속 보인다
  const [firstShown, setFirstShown] = useState(false)
  const pick = useMemo(() => {
    if (!rows || !links) return null
    const open = new Set(rows.map((r) => r.id))
    for (const l of links) open.add(l.from_id)
    const { state } = taskStates(rows, links, today, open)
    const strip = nowStrip(rows, state, { unlock: unlockCounts(links, open), goalLinked: new Set(), today, hasSeq: links.length > 0, max: NOW_LINE.show })
    return { items: strip.items.map((i) => i.task), open: rows.length, overdue: rows.filter((r) => r.due_at!.slice(0, 10) < today).length }
  }, [rows, links, today])
  const due = !!pick && pick.items.length > 0 && (firstShown || nowLineDue({ open: pick.open, overdue: pick.overdue, today, dismissedDay: m.nowLine, firstOpenDay: m.firstOpen }))
  useEffect(() => {
    if (due && m.firstOpen !== today) { setFirstShown(true); saveMoments({ firstOpen: today }) }
  }, [due, m.firstOpen, today])
  if (!due || !pick || m.nowLine === today) return null
  return (
    <div className="od-band mm-now" role="note">
      <Zap className="mm-now__icon" />
      <span className="od-band__text">지금 할 수 있는 {pick.items.length}개:{' '}
        {pick.items.map((t, i) => (
          <span key={t.id}>{i > 0 && <span className="mm-now__dot"> · </span>}<button className="mm-now__task" onClick={() => onPick(t.id)}>{t.title}</button></span>
        ))}
      </span>
      <button className="od-band__go" onClick={() => openMap({ mode: 'plan', now: true })}>지도에서 보기 ›</button>
      <button className="od-band__x" aria-label="오늘은 그만 보기" title="오늘은 그만 보기" onClick={() => saveMoments({ nowLine: today })}><X /></button>
    </div>
  )
}

function ReviewCard({ week, today }: { week: string; today: string }) {
  const end = addDays(week, 7)
  const done = useQuery<{ n: number }>('SELECT count(*) AS n FROM tasks WHERE deleted_at IS NULL AND status = 1 AND completed_at >= ? AND completed_at < ?',
    [new Date(`${week}T00:00`).toISOString(), new Date(`${end}T00:00`).toISOString()])?.[0]?.n ?? 0
  const late = useQuery<{ n: number }>(`SELECT count(*) AS n FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.deleted_at IS NULL AND t.status = 0 AND t.parent_id IS NULL
    AND l.archived_at IS NULL AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) < ? AND substr(t.due_at, 1, 10) >= ?`, [today, week])?.[0]?.n ?? 0
  const close = () => saveMoments({ review: week })
  return (
    <div className="ls-card mm-review" role="status">
      <MapIcon className="ls-card__icon" />
      <span className="ls-card__text"><b>이번 주 돌아보기</b> <span className="ls-card__meta">{done}개 끝냈고 {late}개가 밀렸어요. 5분만 보고 다음 주를 정해 볼까요?</span></span>
      <span className="ls-card__acts">
        <button className="ls-btn ls-btn--primary" onClick={() => { close(); openMap({ mode: 'review' }) }}>지도에서 보기</button>
        <button className="ls-btn" onClick={close}>나중에</button>
      </span>
    </div>
  )
}
