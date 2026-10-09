// 47 §5 AI 비서 B안 화면 조각 — 도구 칩 · 결과 카드(도구별) · 확인 카드(넣기 전) · 인터넷 없음/건강·돈 띠. 값은 모두 앱이 도구 결과로 만든 것(공용 assistantExec).
import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, Clock, FileText, FolderKanban, HeartPulse, List, RotateCcw, Sparkles, Trash2, WifiOff, X } from 'lucide-react'
import { dateLabel, mdw, whenLine, ymd } from '@sprout/schema/assistantTools'
import type { Card, Chip, ConfirmCard } from '@sprout/schema/assistantExec'
import type { Band } from '@sprout/schema/assistantRouter'
import { useQuery } from '../data/useQuery'
import { useMyCalColor } from '../data/events'
import { MY_CAL_COLOR } from '@sprout/schema/events'
import { dayKey, rowDateLabel } from '../lib/dates'
import { StillFace } from './companion/CompanionFace'
import type { Species } from '@sprout/schema/growth'

/** 한 답에 붙는 B안 결과(기기 기록에 그대로 저장 — 13 §5) */
export type AgentView = {
  chips: Chip[]
  cards: Card[]
  bands: Band[]
  hint?: string
  action?: 'diary' | 'settings'
  error?: string
  busyFallback?: boolean
  route?: string
  calls?: number
  ms?: number
  /** 넣기·완료 뒤 캐릭터 한 줄(앱이 붙임 — savedLine) */
  line?: string
}

/** 도구 칩(§5.1): 부르는 중 = 돌기 + 글, 끝 = ✓ + 글 + ›(누르면 찾은 조건) */
export function ToolChips({ chips, running }: { chips: Chip[]; running?: Set<number> }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!chips.length) return null
  return (
    <div className="aa-chips">
      {chips.map((c, i) => {
        const busy = running?.has(i)
        const done = !busy && !c.failed && !!c.done
        return (
          <div key={i} className="aa-chip-wrap">
            <button type="button" className={`aa-chip${busy ? ' is-busy' : c.failed ? ' is-failed' : ' is-done'}${open === i ? ' is-open' : ''}`} disabled={busy || !c.detail} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              {busy ? <span className="aa-chip__spin" aria-hidden /> : done ? <Check className="aa-chip__ok" /> : <AlertTriangle className="aa-chip__ok" />}
              <span>{busy ? c.running : c.done || c.running}</span>
              {done && c.detail && <ChevronRight className="aa-chip__chev" />}
            </button>
            {open === i && c.detail && <div className="aa-chip__detail">{c.detail.split('\n').map((l) => <p key={l}>{l}</p>)}</div>}
          </div>
        )
      })}
    </div>
  )
}

export const BAND_TEXT: Record<Band, string> = {
  noweb: '꿈틀 AI는 인터넷에 연결되지 않아요. 뉴스·가격·날씨처럼 지금 바뀌는 정보는 알 수 없어요.',
  care: '건강·돈 이야기는 일반적인 내용이에요. 꼭 전문가와 상의해 주세요.'
}
export function Bands({ bands }: { bands: Band[] }) {
  return <>{bands.map((b) => <div key={b} className="aa-band" role="note">{b === 'noweb' ? <WifiOff /> : <HeartPulse />}<span>{BAND_TEXT[b]}</span></div>)}</>
}

type Live = { id: string; status: number; deleted_at: string | null; title: string; start_at: string | null; due_at: string | null }
/** 일정 카드(47 §19.3) 넣은 뒤: 지금 행(되돌리기·지움 표시). status는 늘 0 */
function useLiveEvents(ids: string[]) {
  return useQuery<Live>(ids.length ? `SELECT id, 0 AS status, deleted_at, title, start_at, end_at AS due_at FROM events WHERE id IN (${ids.map(() => '?').join(',')})` : 'SELECT NULL AS id WHERE 0', ids)
}
/** 확인 카드 '캘린더 · 내 일정' 점(06 §14.3 내 일정 색) */
function MyCalDot() {
  const color = useMyCalColor()
  return <i className="aa-caldot" style={{ background: color || MY_CAL_COLOR }} aria-hidden />
}
function useLiveTasks(ids: string[]) {
  return useQuery<Live>(ids.length ? `SELECT id, status, deleted_at, title, start_at, due_at FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})` : 'SELECT NULL AS id WHERE 0', ids)
}
const timeOf = (at: string) => { const h = Number(at.slice(11, 13)); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${at.slice(14, 16)}` }

export type CardHandlers = { onOpen: (id: string) => void; onComplete: (id: string) => void; species: Species | null; stage: number }

/** 결과 카드(§5.2) — 확인 카드는 ConfirmView */
export function AgentCard({ card, h }: { card: Card; h: CardHandlers }) {
  if (card.type === 'tasks') return <TasksCard card={card} h={h} />
  if (card.type === 'since') return <SinceCard card={card} h={h} />
  if (card.type === 'events') {
    return (
      <div className="assistant-card">
        <div className="assistant-card__head"><CalendarDays /><span>{card.head}</span><em>{card.total}</em></div>
        {card.events.slice(0, 5).map((e, i) => (
          <div key={`${e.id}:${i}`} className="assistant-row" onClick={() => h.onOpen(e.kind === 'event' ? `ev:${e.id}` : e.id)}>
            <span className="aa-evbar" aria-hidden />
            <span className="assistant-row__title">{e.title}</span>
            <span className="assistant-row__meta">{mdw(e.start.slice(0, 10), new Date())}{e.start.includes('T') ? ` ${timeOf(e.start)}` : ''}</span>
            <ArrowUpRight className="assistant-row__go" />
          </div>
        ))}
        {!card.total && <div className="assistant-row is-empty"><span className="assistant-row__title">{card.empty ?? '일정이 없어요'}</span></div>}
      </div>
    )
  }
  if (card.type === 'notes') {
    return (
      <div className="assistant-card">
        <div className="assistant-card__head"><FileText /><span>{card.head}</span><em>{card.total}</em></div>
        {card.notes.slice(0, 5).map((n) => (
          <div key={n.id} className="assistant-row" onClick={() => h.onOpen(`note:${n.id}`)}>
            <FileText className="assistant-row__icon" aria-hidden />
            <span className="assistant-row__title">{n.title}</span>
            {n.modified && <span className="assistant-row__meta">{mdw(n.modified, new Date())}</span>}
            <ArrowUpRight className="assistant-row__go" />
          </div>
        ))}
        {!card.total && <div className="assistant-row is-empty"><span className="assistant-row__title">찾은 메모가 없어요</span></div>}
      </div>
    )
  }
  if (card.type === 'diary') {
    return (
      <div className="assistant-card">
        <div className="assistant-card__head"><BookOpen /><span>{card.head}</span><em>{card.total}일</em></div>
        {card.days.map((d) => (
          <div key={d.date} className="assistant-row" onClick={() => h.onOpen('view:diary')}>
            <span className="assistant-row__meta aa-diary__date">{mdw(d.date, new Date())}</span>
            <span className="assistant-row__title">{d.snippet}</span>
          </div>
        ))}
        {!card.total && <div className="assistant-row is-empty"><span className="assistant-row__title">찾은 일기가 없어요</span></div>}
        <div className="aa-foot">나만 보기로 둔 날은 AI가 보지 않아요</div>
      </div>
    )
  }
  if (card.type === 'project') {
    const today = ymd(new Date())
    return (
      <div className="assistant-card">
        <div className="assistant-card__head"><FolderKanban /><span>프로젝트</span><em>{card.projects.length}</em></div>
        {card.projects.map((p) => {
          const dd = p.deadline ? Math.round((Date.parse(`${p.deadline}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000) : null
          return (
            <div key={p.id} className="aa-project">
              <div className="aa-project__top"><b>{p.name}</b>{dd !== null && <span className={`aa-pill${dd <= 3 ? ' is-hot' : ''}`}>{dd === 0 ? 'D-day' : dd > 0 ? `D-${dd}` : `D+${-dd}`}</span>}<em>{p.done}/{p.total}</em></div>
              <div className="aa-bar" role="progressbar" aria-valuenow={p.done} aria-valuemax={p.total}><i style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} /></div>
              {p.next.map((t) => <div key={t.id} className="assistant-row" onClick={() => h.onOpen(t.id)}><span className="checkbox" aria-hidden /><span className="assistant-row__title">{t.title}</span>{t.due_at && <span className="assistant-row__meta">{mdw(t.due_at.slice(0, 10), new Date())}</span>}</div>)}
            </div>
          )
        })}
        {!card.projects.length && <div className="assistant-row is-empty"><span className="assistant-row__title">찾은 프로젝트가 없어요</span></div>}
      </div>
    )
  }
  if (card.type === 'growth') {
    return (
      <div className="assistant-card aa-growth">
        <StillFace species={h.species} stage={h.stage} size={36} mood="smile" />
        <div>
          <b>Lv {card.level} · {card.stageName}</b>
          <div className="aa-bar"><i style={{ width: `${card.toNext ? Math.round((card.into / card.toNext) * 100) : 0}%` }} /></div>
          <small>다음 레벨까지 {Math.max(0, card.toNext - card.into)} XP · 이번 주 완료 {card.weekDone}개</small>
        </div>
      </div>
    )
  }
  return null
}

function TasksCard({ card, h }: { card: Extract<Card, { type: 'tasks' }>; h: CardHandlers }) {
  const [more, setMore] = useState(false)
  const ids = card.tasks.map((t) => t.id)
  const live = useLiveTasks(ids)
  const byId = new Map((live ?? []).map((t) => [t.id, t]))
  const today = dayKey()
  const shown = more ? card.tasks : card.tasks.slice(0, 5)
  return (
    <div className="assistant-card">
      <div className="assistant-card__head"><List /><span>{card.head}</span><em>{card.total}개</em></div>
      {shown.map((t) => {
        const cur = byId.get(t.id)
        const gone = live && (!cur || !!cur.deleted_at)
        const done = (cur?.status ?? t.status) === 1
        const date = rowDateLabel({ start_at: cur?.start_at ?? t.start_at, due_at: cur?.due_at ?? t.due_at }, today)
        return (
          <div key={t.id} className={`assistant-row${done ? ' is-done' : ''}${gone ? ' is-gone' : ''}`} onClick={() => !gone && h.onOpen(t.id)}>
            <button className={`checkbox${done ? ' is-checked' : ''}${t.priority ? ` is-p${t.priority}` : ''}`} aria-label={done ? '완료됨' : '완료'} disabled={!!gone || done} onClick={(e) => { e.stopPropagation(); h.onComplete(t.id) }}>{done && <Check />}</button>
            <span className="assistant-row__title">{cur?.title ?? t.title}</span>
            {gone ? <span className="assistant-row__meta">삭제됨</span> : date && <span className={`assistant-row__meta is-${date.tone}`}>{date.label}</span>}
            {!gone && <ArrowUpRight className="assistant-row__go" />}
          </div>
        )
      })}
      {!card.total && <div className="assistant-row is-empty"><span className="assistant-row__title">찾은 할 일이 없어요</span></div>}
      {!more && card.tasks.length > 5 && <button className="assistant-card__more" onClick={() => setMore(true)}>더 보기 {card.tasks.length - 5}</button>}
      {(card.note || card.empty) && <div className="aa-foot">{card.total ? card.note : card.empty}</div>}
    </div>
  )
}

function SinceCard({ card, h }: { card: Extract<Card, { type: 'since' }>; h: CardHandlers }) {
  const now = new Date()
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  const dots = [...card.dates].reverse()
  return (
    <div className="assistant-card">
      <div className="assistant-card__head"><Clock /><span>{card.last ? '마지막으로 한 날' : `‘${card.phrase}’ 기록`}</span><em>기록 {card.dates.length ? `${card.dates.length}${card.dates.length >= 4 ? '+' : ''}` : 0}개</em></div>
      {card.last ? (
        <>
          <div className="aa-big"><b>{card.days === 0 ? '오늘' : card.days}</b>{card.days !== 0 && <span>일 지났어요</span>}</div>
          {dots.length > 1 && (
            <div className="aa-dots" aria-hidden>
              <div className="aa-dots__line">{dots.map((d) => <i key={d} />)}<i className="is-today" /></div>
              <div className="aa-dots__labels">{dots.map((d) => <span key={d}>{md(d)}</span>)}<span>오늘</span></div>
            </div>
          )}
          <div className="assistant-row is-done" onClick={() => h.onOpen(card.last!.source === 'event' ? `ev:${card.last!.id}` : card.last!.id)}>
            {card.last.source === 'task' ? <span className="checkbox is-checked" aria-hidden><Check /></span> : <CalendarDays className="assistant-row__icon" aria-hidden />}
            <span className="assistant-row__title">{card.last.title}</span>
            <span className="assistant-row__meta">{mdw(card.last.date, now)} 완료</span>
            <ArrowUpRight className="assistant-row__go" />
          </div>
        </>
      ) : <div className="assistant-row is-empty"><span className="assistant-row__title">끝낸 할 일·일정이 없어요</span></div>}
      {card.next && (
        <div className="assistant-row" onClick={() => h.onOpen(card.next!.source === 'event' ? `ev:${card.next!.id}` : card.next!.id)}>
          <CalendarDays className="assistant-row__icon" aria-hidden />
          <span className="assistant-row__title">{card.next.title}</span>
          <span className="assistant-row__meta is-future">다음 예정 · {mdw(card.next.date, now)}</span>
        </div>
      )}
      <div className="aa-foot">{card.last ? card.note : card.first ? `꿈틀의 첫 기록 · ${mdw(card.first, now)} · 다른 앱 캘린더(구글·iCloud)는 AI가 보지 않아요` : '다른 앱 캘린더(구글·iCloud)는 AI가 보지 않아요'}</div>
    </div>
  )
}

/** 확인 카드(§5.3) — 넣기 전엔 아무것도 바뀌지 않는다. 지우기는 위험색·단추로만 */
export function ConfirmView({ card, onSave, onEdit, onCancel, onUndo, onOpen, busy }: { card: ConfirmCard; onSave: (picked?: string[]) => void; onEdit: (anchor: HTMLElement) => void; onCancel: () => void; onUndo: () => void; onOpen: (id: string) => void; busy?: boolean }) {
  const now = new Date()
  const multi = (card.targets?.length ?? 0) > 1
  const [picked, setPicked] = useState<string[]>(() => card.targets?.filter((t) => t.picked).map((t) => t.id) ?? [])
  const danger = card.op === 'delete'
  const ids = card.saved?.ids ?? []
  const isEvent = card.op === 'create' && card.kind === 'event'
  const liveTasks = useLiveTasks(card.state === 'saved' && !isEvent ? ids : [])
  const liveEvents = useLiveEvents(card.state === 'saved' && isEvent ? ids : [])
  const live = isEvent ? liveEvents : liveTasks
  // 47 §19.3 머리 말 = 실제 넣을 곳(일정 = events, 그 밖 = 할 일)
  const kind = card.op === 'create' ? (isEvent ? '일정' : '할 일') : ''
  if (card.state === 'cancelled') return <div className="aa-confirm is-cancel"><div className="aa-confirm__head"><X />{card.op === 'create' ? '넣지 않았어요' : '바꾸지 않았어요'}</div><div className="aa-confirm__title">{card.title}</div></div>
  if (card.state === 'saved' || card.state === 'undone') {
    const undone = card.state === 'undone'
    const head = undone ? '되돌렸어요' : card.op === 'create' ? '넣었어요' : card.op === 'complete' ? '완료로 바꿨어요' : card.op === 'move' ? '옮겼어요' : '지웠어요'
    const rows = card.op === 'create' ? [{ id: ids[0], title: card.title, at: card.start || card.due }] : (card.targets ?? []).filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, title: t.title, at: card.op === 'move' && !undone ? card.moveTo ?? '' : t.start_at || t.due_at || '' }))
    return (
      <div className={`aa-confirm is-saved${undone ? ' is-undone' : ''}`}>
        <div className="aa-confirm__head">{undone ? <RotateCcw /> : <Check />}{head}</div>
        {rows.map((r) => {
          const cur = (live ?? []).find((x) => x.id === r.id)
          const gone = (undone && card.op === 'create') || (card.op === 'delete' && !undone) || !!cur?.deleted_at
          return (
            <div key={r.id} className={`assistant-row${gone ? ' is-gone' : ''}${cur?.status === 1 ? ' is-done' : ''}`} onClick={() => !gone && onOpen(isEvent ? `ev:${r.id}` : r.id)}>
              {isEvent ? <span className="aa-evbar" aria-hidden /> : <span className={`checkbox${cur?.status === 1 ? ' is-checked' : ''}`} aria-hidden>{cur?.status === 1 && <Check />}</span>}
              <span className="assistant-row__title">{cur?.title ?? r.title}</span>
              <span className="assistant-row__meta">{gone ? '삭제됨' : r.at ? whenLine(r.at, now) : ''}</span>
            </div>
          )
        })}
        {!undone && <button className="aa-undo" disabled={busy} onClick={onUndo}><RotateCcw />되돌리기</button>}
      </div>
    )
  }
  const head = card.op === 'create' ? `새 ${kind} · 확인해 줘` : card.op === 'complete' ? '완료로 바꿀까?' : card.op === 'move' ? '날짜를 옮길까?' : '지울까?'
  const verb = card.op === 'create' ? '넣기' : card.op === 'complete' ? '완료' : card.op === 'move' ? '옮기기' : '지우기'
  const at = card.start || card.due
  return (
    <div className={`aa-confirm${danger ? ' is-danger' : ''}`}>
      <div className="aa-confirm__head">{danger ? <Trash2 /> : card.op === 'create' ? <CalendarDays /> : <Sparkles />}{head}</div>
      {!multi && <div className="aa-confirm__title">{card.title}</div>}
      {multi && (
        <div className="aa-confirm__pick" role="group" aria-label="고르기">
          {card.targets!.map((t) => {
            const on = picked.includes(t.id)
            return (
              <label key={t.id} className="assistant-row">
                <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id])} />
                <span className="assistant-row__title">{t.title}</span>
                {(t.due_at || t.start_at) && <span className="assistant-row__meta">{whenLine(t.due_at || t.start_at, now)}</span>}
              </label>
            )
          })}
        </div>
      )}
      <dl>
        {card.op === 'create' && <><dt>언제</dt><dd className="is-hl">{whenLine(at, now)}{card.said && <span className="aa-said"> (“{card.said}”)</span>}</dd></>}
        {card.op === 'create' && card.length && <><dt>길이</dt><dd>{card.length}</dd></>}
        {card.op === 'create' && (isEvent ? <><dt>캘린더</dt><dd><MyCalDot />내 일정</dd></> : <><dt>리스트</dt><dd>{card.listName || '기본함'}</dd></>)}
        {card.op === 'create' && card.repeat && <><dt>반복</dt><dd>{repeatWord(card.repeat)}</dd></>}
        {card.op === 'move' && !multi && <><dt>언제</dt><dd className="is-hl">{card.due ? `${whenLine(card.due, now)} → ` : ''}{card.moveTo ? whenLine(card.moveTo, now) : ''}{card.said && <span className="aa-said"> (“{card.said}”)</span>}</dd></>}
        {card.op === 'move' && multi && <><dt>옮길 날</dt><dd className="is-hl">{card.moveTo ? whenLine(card.moveTo, now) : ''}</dd></>}
        {(card.op === 'complete' || card.op === 'delete') && !multi && (card.due || card.start) && <><dt>마감</dt><dd>{dateLabel(card.due || card.start, now)}</dd></>}
        {card.assumed && <><dt>참고</dt><dd>{card.assumed}</dd></>}
        {card.basis && <><dt>근거</dt><dd>{card.basis}</dd></>}
      </dl>
      <div className="aa-confirm__act">
        <button className={`aa-btn ${danger ? 'is-danger' : 'is-primary'}`} disabled={busy || (multi && !picked.length)} onClick={() => onSave(multi ? picked : undefined)}>{multi ? `골라서 ${verb} ${picked.length}` : verb}</button>
        {!danger && <button className="aa-btn" disabled={busy} onClick={(e) => onEdit(e.currentTarget)}>고치기</button>}
        <button className="aa-btn is-ghost" disabled={busy} onClick={onCancel}>취소</button>
      </div>
      <div className="aa-confirm__note">{danger ? '지우기는 단추로만 할 수 있어요 · 지운 뒤 되돌릴 수 있어요' : `‘${verb}’를 누르기 전엔 ${card.op === 'create' ? '저장되지' : '바뀌지'} 않아요 · “응”이라고 답해도 돼요`}</div>
    </div>
  )
}
const DAY_WORD: Record<string, string> = { MO: '월', TU: '화', WE: '수', TH: '목', FR: '금', SA: '토', SU: '일' }
function repeatWord(rule: string) {
  if (/FREQ=DAILY/.test(rule)) return '매일'
  const by = /BYDAY=([A-Z,]+)/.exec(rule)?.[1]
  if (/FREQ=WEEKLY/.test(rule)) return by ? `매주 ${by.split(',').map((d) => DAY_WORD[d] ?? d).join('·')}요일` : '매주'
  if (/FREQ=MONTHLY/.test(rule)) return '매월'
  if (/FREQ=YEARLY/.test(rule)) return '매년'
  return rule
}

