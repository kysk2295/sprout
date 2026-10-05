// 31 §12.3 관계 타임라인(프로젝트를 열면, 시안 ②) — 가로 = 날짜, 세로 줄 = 일의 종류, 선 = 순서(또는 추정), 오늘·마감 세로선, 옆 칸(사람·메모·리스트).
// 리스트가 달라도 한 장에. 칩 클릭 = 상세, 호버 ✕ = 이 프로젝트에서 빼기(태그만). 말풍선 [빠진 거 없어] [＋ 더 넣기].
import { ArrowLeft, Sparkles, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { daysBetween, inferredChain, stackRows, taskDay, WORK_KINDS, WORK_LABEL, type WorkKind } from '@sprout/schema/projects'
import { addToProject, confirmProject, removeFromProject } from '../../../data/projects'
import { openTarget, openWikiTopic } from '../../../data/wiki'
import { dayKey } from '../../../lib/dates'
import { eulReul } from '../../../lib/josa'
import { MenuItem, Popover } from '../../Popover'
import { useToast } from '../../Toast'
import { deadlineText, PlanBubble, type PlanOpen } from './ProjectBoard'
import type { PlanData, ProjectView, PTaskRow } from './useProjects'

const LANE_W = 96
const SOMEDAY_W = 172
const ROW = 32
const CHIP_MAX = 160
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
/** 칩 폭 어림(글자 수) — 겹침 쌓기용. 실제 폭은 그린 뒤 선 계산에서 잰다 */
const chipW = (t: PTaskRow) => Math.min(CHIP_MAX, 34 + [...t.title].length * 11.5 + (t.due_at || t.completed_at ? 28 : 0))

type Placed = { t: PTaskRow; kind: WorkKind; day: string | null; x: number; row: number; someday: boolean }

export function ProjectTimeline({ p, data, selected, onBack, onSelect, onPlan }: {
  p: ProjectView; data: PlanData; selected: string | null
  onBack: () => void; onSelect: (id: string) => void; onPlan: PlanOpen
}) {
  const toast = useToast()
  const today = dayKey()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [paths, setPaths] = useState<{ d: string; guess: boolean }[]>([])
  const [menu, setMenu] = useState<{ t: PTaskRow; point: { x: number; y: number } }>()
  const [adding, setAdding] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  // Esc = 모든 프로젝트(입력·팝오버 밖)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.popover,[aria-modal="true"]')) return
      if ((e.target as HTMLElement).closest?.('input,textarea,[contenteditable],.app__detail,.pc')) return
      onBack()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onBack])

  // ── 배치 ──
  const layout = useMemo(() => {
    const items = p.members.map((t) => ({ t, kind: p.kindOf.get(t.id) ?? 'other' as WorkKind, day: taskDay(t) }))
    const dated = items.filter((i) => i.day)
    const hasSomeday = items.some((i) => !i.day)
    let from = p.span?.from ?? today, to = p.span?.to ?? today
    if (today >= addDays(from, -30) && today <= addDays(to, 30)) { if (today < from) from = today; if (today > to) to = today }
    from = addDays(from, -2); to = addDays(to, 3)
    const days = Math.max(7, daysBetween(from, to) + 1)
    const trackW = Math.max(240, width - LANE_W - (hasSomeday ? SOMEDAY_W : 0))
    const px = trackW / days
    const xOf = (d: string) => LANE_W + (daysBetween(from, d) + 0.5) * px
    const lanes = WORK_KINDS.map((k) => ({ kind: k, items: items.filter((i) => i.kind === k) })).filter((l) => l.items.length)
    const placed: Placed[] = []
    const laneRows = new Map<WorkKind, number>()
    for (const lane of lanes) {
      const d = lane.items.filter((i) => i.day)
      // 오른쪽 끝 칩은 줄 안으로 당긴다(옆 칸·언젠가 칸을 덮지 않게)
      const at = (i: { t: PTaskRow; day: string | null }) => Math.min(xOf(i.day!) - 5, LANE_W + trackW - chipW(i.t) - 4)
      const rows = stackRows(d.map((i) => ({ id: i.t.id, x: at(i), w: chipW(i.t) })))
      let n = 0
      for (const i of d) { const r = rows.get(i.t.id)!; n = Math.max(n, r + 1); placed.push({ ...i, x: at(i), row: r, someday: false }) }
      const s = lane.items.filter((i) => !i.day)
      s.forEach((i, k) => placed.push({ ...i, x: LANE_W + trackW + 8, row: k, someday: true }))
      laneRows.set(lane.kind, Math.max(1, n, s.length))
    }
    const step = days <= 70 ? 7 : days <= 150 ? 14 : 30
    const ticks: { x: number; label: string }[] = []
    // 첫 월요일부터
    let t0 = from
    for (let i = 0; i < 7 && new Date(`${t0}T00:00:00Z`).getUTCDay() !== 1; i++) t0 = addDays(t0, 1)
    // 오늘·마감 글자와 겹치는 눈금은 뺀다
    const marks = [today, p.deadline?.day].filter((x): x is string => !!x && x >= from && x <= to).map(xOf)
    for (let d = t0; d <= to; d = addDays(d, step)) { const x = xOf(d); if (!marks.some((m) => x > m - 34 && x < m + 70) && x < LANE_W + trackW - 18) ticks.push({ x, label: md(d) }) }
    return { lanes, placed, laneRows, ticks, xOf, from, to, trackW, hasSomeday, dated }
  }, [p, width, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const laneTop = useMemo(() => {
    const m = new Map<WorkKind, number>()
    let y = 0
    for (const l of layout.lanes) { m.set(l.kind, y); y += layout.laneRows.get(l.kind)! * ROW + 12 }
    return { m, height: y }
  }, [layout])

  // ── 선: 순서 선(구성원끼리) · 없으면 추정 — 그린 뒤 칩 자리를 재서 ──
  const pairs = useMemo(() => {
    const dated = new Set(p.members.filter((t) => taskDay(t)).map((t) => t.id))
    const explicit = p.seq.map((l) => ({ a: l.from_id, b: l.to_id, guess: false }))
    if (explicit.some((x) => dated.has(x.a) || dated.has(x.b))) return explicit // 그릴 수 있는 순서 선이 있으면 그것만
    return inferredChain(p.members.map((t) => ({ id: t.id, kind: p.kindOf.get(t.id) ?? 'other', day: taskDay(t) })), p.deadline?.taskId).map(([a, b]) => ({ a, b, guess: true }))
  }, [p])
  useLayoutEffect(() => {
    const root = wrap.current
    if (!root) return
    const R = root.getBoundingClientRect()
    const box = (id: string) => root.querySelector<HTMLElement>(`[data-tid="${id}"]`)?.getBoundingClientRect()
    const someday = new Set(layout.placed.filter((x) => x.someday).map((x) => x.t.id))
    const out: { d: string; guess: boolean }[] = []
    for (const { a, b, guess } of pairs) {
      if (someday.has(a) && someday.has(b)) continue // 날짜 없는 둘 사이엔 시간 순서가 없다 — 선 대신 언젠가 칸 순서로
      const A = box(a), B = box(b)
      if (!A || !B) continue
      const x1 = A.right - R.left, y1 = A.top - R.top + A.height / 2
      const x2 = B.left - R.left - 2, y2 = B.top - R.top + B.height / 2
      if (x2 < x1 + 8) {
        // 뒤 칩이 앞 칩과 겹치거나 왼쪽 → 앞 칩 아래에서 돌아 들어간다
        const sx = A.left - R.left + 18, sy = A.bottom - R.top
        out.push({ d: `M${sx} ${sy} C ${sx} ${y2}, ${sx} ${y2}, ${x2} ${y2}`, guess })
      } else {
        const mx = (x1 + x2) / 2
        out.push({ d: `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, guess })
      }
    }
    setPaths(out)
  }, [pairs, layout, laneTop])

  const dl = deadlineText(p, today)
  const short = p.short
  const out = async (t: PTaskRow) => {
    const undo = await removeFromProject(t.id, p.tag.id)
    toast.show(`'${t.title}'${eulReul(t.title).slice(t.title.length)} 프로젝트에서 뺐어요`, undo)
  }
  const chip = (it: Placed) => {
    const done = it.t.status !== 0
    const late = !done && !!it.t.due_at && it.t.due_at.slice(0, 10) < today
    return (
      <div key={it.t.id} data-tid={it.t.id} className={`plan-tk${done ? ' is-done' : ' is-open'}${selected === it.t.id ? ' is-selected' : ''}`}
        style={{ left: it.x, top: laneTop.m.get(it.kind)! + 6 + it.row * ROW }}
        role="button" tabIndex={0} title={it.t.title}
        onClick={() => onSelect(it.t.id)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(it.t.id) }}
        onContextMenu={(e: MouseEvent) => { e.preventDefault(); setMenu({ t: it.t, point: { x: e.clientX, y: e.clientY } }) }}>
        <i className="plan-tk__dot" />
        <span className="plan-tk__t">{it.t.title}</span>
        {it.day && <em className={late ? 'is-late' : ''}>{md(it.day)}</em>}
        <button className="plan-tk__x" aria-label="이건 아니야" title="이 프로젝트에서 빼기(태그만 떨어져요)" onClick={(e) => { e.stopPropagation(); void out(it.t) }}><X />이건 아니야</button>
      </div>
    )
  }
  const xToday = today >= layout.from && today <= layout.to ? layout.xOf(today) : null
  const xDl = p.deadline && p.deadline.day >= layout.from && p.deadline.day <= layout.to ? layout.xOf(p.deadline.day) : null

  return (
    <div className="plan-proj">
      <button className="plan-crumb" onClick={onBack}><ArrowLeft />모든 프로젝트</button>
      <div className="plan-ftitle">
        <h2><span className="pc-card__emoji">{p.emoji}</span>{p.title}</h2>
        {p.auto && <span className="plan-auto">✦ 자동으로 묶었어요</span>}
        <span className="pc-card__meta">{p.members.length}개 · 끝냄 {p.done} · 남음 {p.open}{dl ? <> · {dl.word} <b className={dl.late ? 'is-late' : ''}>{dl.text}</b></> : ''}</span>
      </div>
      {!p.confirmed && p.members.length > 0 && (
        <PlanBubble text={`${short} 관련 일 ${p.members.length}개를 찾아서 묶었어. 빠진 거 있으면 말해 줘`}>
          <button className="pc-chip" onClick={() => confirmProject(p.tag.id, p.members.length)}>빠진 거 없어</button>
          <button className="pc-chip" onClick={(e) => setAdding(e.currentTarget)}>＋ 더 넣기</button>
        </PlanBubble>
      )}
      {p.members.length === 0 ? (
        <div className="plan-empty plan-empty--small">
          <h3>이 프로젝트에 남은 일이 없어요</h3>
          <div className="plan-empty__acts">
            <button className="map-btn" onClick={(e) => setAdding(e.currentTarget)}>＋ 더 넣기</button>
            <button className="map-btn map-btn--text" onClick={onBack}>← 모든 프로젝트</button>
          </div>
        </div>
      ) : (
        <div className="plan-proj__body">
          <div className="plan-tl" ref={wrap}>
            <div className="plan-tl__axis" style={{ marginLeft: 0 }}>
              {layout.ticks.map((t) => <span key={t.label + t.x} style={{ left: t.x }}>{t.label}</span>)}
              {layout.hasSomeday && <span className="is-someday" style={{ left: LANE_W + layout.trackW + 8 }}>언젠가</span>}
            </div>
            <div className="plan-tl__lanes" style={{ height: laneTop.height }}>
              {layout.lanes.map((l) => (
                <div key={l.kind} className="plan-lane" style={{ top: laneTop.m.get(l.kind), height: layout.laneRows.get(l.kind)! * ROW + 12 }}>
                  <div className="plan-lane__n">{WORK_LABEL[l.kind]}<small>{l.items.length}</small></div>
                </div>
              ))}
              {layout.hasSomeday && <i className="plan-tl__somedayline" style={{ left: LANE_W + layout.trackW }} />}
              {xToday !== null && <div className="plan-vline is-today" style={{ left: xToday }}><span>오늘 {md(today)}</span></div>}
              {xDl !== null && dl && <div className="plan-vline is-dl" style={{ left: xDl }}><span>⚑ {dl.word} {md(p.deadline!.day)}</span></div>}
              {layout.placed.map(chip)}
            </div>
            <svg className="plan-rel" aria-hidden="true">
              <defs><marker id="plan-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="currentColor" /></marker></defs>
              {paths.map((q, i) => <path key={i} d={q.d} className={q.guess ? 'is-guess' : ''} markerEnd="url(#plan-ah)" />)}
            </svg>
            <div className="plan-legend">
              <span><i className="plan-lgd is-done" />끝냄</span><span><i className="plan-lgd" />남음</span>
              <span><i className="plan-lgd is-rel" />이어지는 일{pairs.some((x) => x.guess) ? '(점선 = 추정)' : ''}</span>
              <span>세로 줄은 일의 종류로 자동 분류</span>
            </div>
          </div>
          <aside className="plan-side">
            {p.people.length > 0 && <section><h6>관련 사람</h6><div className="plan-side__rows">{p.people.map((x) => <button key={x.id} onClick={() => openTarget({ view: `tag:${x.id}` })}><span>👤 {x.name}</span><small>{x.label}</small></button>)}</div></section>}
            {p.memos.length > 0 && <section><h6>관련 메모</h6><div className="plan-side__rows">{p.memos.map((m) => <button key={m.kind + m.id} onClick={() => m.kind === 'topic' ? openWikiTopic(m.id) : openTarget({ view: 'notes' })}><span>📄 {m.title}</span><small>{m.kind === 'topic' ? '수집함 위키' : '수집함'}</small></button>)}</div></section>}
            {p.lists.length > 0 && <section><h6>관련 리스트 · {p.lists.length}곳에서 모음</h6><div className="plan-kinds">{p.lists.map((l) => <button key={l.id} onClick={() => openTarget({ view: `list:${l.id}` })}>{l.emoji ? `${l.emoji} ` : ''}{l.name} <small>{l.count}</small></button>)}</div></section>}
            <button className="map-btn map-btn--primary plan-side__go" onClick={() => onPlan({ project: { id: p.tag.id, name: p.title } })}><Sparkles />다음 단계 같이 짜기</button>
          </aside>
        </div>
      )}
      {menu && (
        <Popover point={menu.point} onClose={() => setMenu(undefined)} className="menu" width={190}>
          <MenuItem label="열기" onClick={() => { setMenu(undefined); onSelect(menu.t.id) }} />
          <MenuItem label="이건 아니야" danger onClick={() => { const t = menu.t; setMenu(undefined); void out(t) }} />
        </Popover>
      )}
      {adding && <AddPicker anchor={adding} p={p} data={data} onClose={() => setAdding(null)} onAdd={async (ids) => {
        const undo = await addToProject(ids, p.tag.id)
        toast.show(`${ids.length}개를 '${p.title}'에 넣었어요`, undo)
      }} />}
    </div>
  )
}

/** ＋ 더 넣기: 프로젝트 밖 열린 할 일을 제목으로 거름, 누르면 바로 넣는다(여러 번) */
function AddPicker({ anchor, p, data, onClose, onAdd }: { anchor: HTMLElement; p: ProjectView; data: PlanData; onClose: () => void; onAdd: (ids: string[]) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const inside = useMemo(() => new Set(p.members.map((m) => m.id)), [p])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = data.openTasks.filter((t) => !inside.has(t.id) && !added.has(t.id) && words.every((w) => t.title.toLowerCase().includes(w))).slice(0, 30)
  return (
    <Popover anchor={anchor} onClose={onClose} width={340} className="plan-add">
      <input autoFocus className="plan-add__q" placeholder="넣을 할 일 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="넣을 할 일 찾기" />
      <div className="plan-add__list" role="listbox">
        {rows.length ? rows.map((t) => (
          <button key={t.id} role="option" aria-selected={false} onClick={() => { setAdded((s) => new Set(s).add(t.id)); void onAdd([t.id]) }}>
            <span>{t.title}</span><small>{data.listName(t.list_id)}</small>
          </button>
        )) : <p className="plan-add__none">{q ? '맞는 할 일이 없어요' : '열린 할 일이 없어요'}</p>}
      </div>
    </Popover>
  )
}
