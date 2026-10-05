// 30 §B.3 AI 리스트 제안 화면들 — 할 일 행·상세의 제안 칩, 기본함 화면 위 카드, 기본함 정리(리스트 구조 제안) 창,
// 제안 하나씩 보기 창, 새 주제 카드, 설정 › 할 일 줄. AI는 제안만 하고 사용자가 승인해야 리스트를 만든다.
import { Combine, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { isUnavailable } from '../../data/ai'
import {
  acceptSuggestions, applyProposals, autoSortEnabled, chipFor, loadApplySnapshot, mergeProposals, proposeStructure,
  setAutoSort, suggestStore, SUGGEST, topicCandidates, undoApply, LISTS_SQL, type Proposal, type SuggestList
} from '../../data/listSuggest'
import { useListSuggester } from '../../data/useListSuggester'
import { useAutoTagger } from '../../data/useAutoTagger'
import { openMap } from '../../data/mapMoments'
import { useQuery } from '../../data/useQuery'
import { withRo } from '../../lib/dates'
import { Dialog } from '../Dialog'
import { EmojiPicker } from '../EmojiPicker'
import { MenuItem, Popover, SubMenu } from '../Popover'
import { useToast } from '../Toast'
import './listSuggest.css'

// ── 공용 상태: 제안(기기 저장) + 리스트(호스트가 한 번 읽어 나눠 준다 — 행마다 질의하지 않게) ──
let lists: SuggestList[] = []
const listSubs = new Set<() => void>()
const setLists = (l: SuggestList[]) => { lists = l; listSubs.forEach((f) => f()) }
const useLists = () => useSyncExternalStore((f) => { listSubs.add(f); return () => { listSubs.delete(f) } }, () => lists)
export const useSuggestState = () => useSyncExternalStore(suggestStore.subscribe, suggestStore.get)
const label = (l: Pick<SuggestList, 'name' | 'emoji'>) => `${l.emoji ? `${l.emoji} ` : ''}${l.name}`

// ── 창 열기(어디서든) ──
const OPEN = 'sprout:list-suggest'
type Open = 'organize' | 'review'
export const openInboxOrganize = () => window.dispatchEvent(new CustomEvent(OPEN, { detail: 'organize' }))
export const openSuggestReview = () => window.dispatchEvent(new CustomEvent(OPEN, { detail: 'review' }))

/** App에 한 번: 새 할 일 자동 분류 + 자동 태그(33 §7) + 리스트 공급 + 창 */
export function ListSuggestHost() {
  useListSuggester()
  useAutoTagger()
  const rows = useQuery<SuggestList>(LISTS_SQL)
  useEffect(() => { if (rows) setLists(rows) }, [rows])
  const [open, setOpen] = useState<Open>()
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<Open>).detail)
    window.addEventListener(OPEN, on)
    return () => window.removeEventListener(OPEN, on)
  }, [])
  if (open === 'organize') return <OrganizeDialog onClose={() => setOpen(undefined)} />
  if (open === 'review') return <ReviewDialog onClose={() => setOpen(undefined)} />
  return null
}

/** 할 일 행·상세의 칩: `→ 🏫 대학교로 옮길까요?` ✓ ✕ — 할 일이 기본함에 있을 때만 그린다 */
export function SuggestChip({ taskId, variant = 'row' }: { taskId: string; variant?: 'row' | 'detail' | 'card' }) {
  const s = useSuggestState()
  const all = useLists()
  const toast = useToast()
  const list = chipFor(s, taskId, all)
  if (!list) return null
  const accept = async () => {
    const r = await acceptSuggestions([{ taskId, listId: list.id }])
    if (r.moved) toast.show(`${withRo(`${list.emoji ?? ''}${list.name}`)} 옮겼어요`, r.undo)
  }
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <span className={`ls-chip ls-chip--${variant}`} onClick={stop} onPointerDown={stop} onDoubleClick={stop} title="AI 제안 — 기본함 할 일을 이미 있는 리스트로 옮길까요?">
      <Sparkles className="ls-chip__spark" />
      <button className="ls-chip__go" onClick={() => void accept()}>{variant === 'detail' ? `${withRo(label(list))} 옮길까요?` : `→ ${label(list)}`}</button>
      <button className="ls-chip__x" aria-label="제안 무시" title="무시(다시 제안하지 않아요)" onClick={() => suggestStore.dismiss([taskId])}><X /></button>
    </span>
  )
}

/** 기본함 할 일 id들(카드·지도가 같이 쓴다) */
export function useInboxTasks() {
  const rows = useQuery<{ id: string; title: string }>("SELECT t.id, t.title FROM tasks t JOIN lists l ON l.id = t.list_id WHERE l.kind = 'inbox' AND t.deleted_at IS NULL AND t.status = 0 AND t.title != '' AND t.parent_id IS NULL ORDER BY t.created_at")
  return rows ?? []
}

/**
 * 기본함 화면 위 카드(그리고 작업 지도 기본함 노드): 우선순위 — 새 주제 → 기본함 정리(20개 넘음) → 제안 N개.
 * [나중에] = 7일 동안 기본함 정리 카드를 숨긴다.
 */
export function InboxSuggestCard({ compact }: { compact?: boolean }) {
  const s = useSuggestState()
  const all = useLists()
  const inbox = useInboxTasks()
  const toast = useToast()
  const ids = useMemo(() => inbox.map((t) => t.id), [inbox])
  const topics = useMemo(() => topicCandidates(s, ids, all), [s, ids, all])
  const chips = useMemo(() => ids.filter((id) => chipFor(s, id, all)), [s, ids, all])
  const later = s.laterUntil && s.laterUntil > new Date().toISOString()
  const topic = topics[0]
  if (topic) {
    const make = async () => {
      const r = await applyProposals([{ key: 'topic', listId: null, name: topic.name, emoji: topic.emoji, taskIds: topic.taskIds, on: true }])
      if (r.moved) toast.show(`'${topic.name}' 리스트를 만들고 할 일 ${r.moved}개를 옮겼어요`, async () => { await undoApply() })
    }
    return (
      <div className={`ls-card${compact ? ' is-compact' : ''}`} role="status">
        <Sparkles className="ls-card__icon" />
        <span className="ls-card__text">새 리스트 <b>{topic.emoji ? `${topic.emoji} ` : ''}{topic.name}</b> 만들까요? <span className="ls-card__meta">기본함에 같은 주제 할 일이 {topic.taskIds.length}개 있어요</span></span>
        <span className="ls-card__acts">
          <button className="ls-btn ls-btn--primary" onClick={() => void make()}>만들기</button>
          <button className="ls-btn" onClick={() => suggestStore.dismissTopic(topic.name)}>괜찮아요</button>
        </span>
      </div>
    )
  }
  if (ids.length > SUGGEST.inboxCard && !later) {
    return (
      <div className={`ls-card${compact ? ' is-compact' : ''}`} role="status">
        <Sparkles className="ls-card__icon" />
        <span className="ls-card__text">기본함에 할 일이 {ids.length.toLocaleString('ko-KR')}개 있어요. <span className="ls-card__meta">AI가 리스트로 나눠 볼게요 — 확인한 뒤에 만들어요</span></span>
        <span className="ls-card__acts">
          <button className="ls-btn ls-btn--primary" onClick={openInboxOrganize}>기본함 정리</button>
          {!compact && <button className="ls-btn ls-btn--link" onClick={() => openMap({ mode: 'tidy' })}>지도에서 정리 ›</button>}{/* 31 §10.3 ④ */}
          <button className="ls-btn" onClick={() => suggestStore.later(new Date(Date.now() + 7 * 86400_000).toISOString())}>나중에</button>
        </span>
      </div>
    )
  }
  if (chips.length > 0) {
    const applyAll = async () => {
      const r = await acceptSuggestions(chips.map((id) => ({ taskId: id, listId: s.items[id].listId! })))
      if (r.moved) toast.show(`할 일 ${r.moved}개를 리스트로 옮겼어요`, r.undo)
    }
    return (
      <div className={`ls-card${compact ? ' is-compact' : ''}`} role="status">
        <Sparkles className="ls-card__icon" />
        <span className="ls-card__text">기본함 정리: AI 제안 {chips.length}개</span>
        <span className="ls-card__acts">
          <button className="ls-btn ls-btn--primary" onClick={() => void applyAll()}>모두 적용</button>
          <button className="ls-btn" onClick={openSuggestReview}>하나씩</button>
        </span>
      </div>
    )
  }
  return null
}

/** 제안 하나씩: 행마다 [옮기기] [무시] */
function ReviewDialog({ onClose }: { onClose: () => void }) {
  const s = useSuggestState()
  const all = useLists()
  const inbox = useInboxTasks()
  const toast = useToast()
  const rows = inbox.map((t) => ({ t, list: chipFor(s, t.id, all) })).filter((r) => r.list)
  return (
    <Dialog label="AI 제안 하나씩" className="ls-dialog" onClose={onClose}>
      <header className="ls-dialog__head"><h2>AI 제안 {rows.length}개</h2><button className="icon-btn" aria-label="닫기" onClick={onClose}><X /></button></header>
      <p className="ls-dialog__hint">기본함 할 일을 이미 있는 리스트로 옮길지 하나씩 정해요. 무시한 것은 다시 제안하지 않아요.</p>
      <div className="ls-review">
        {!rows.length && <p className="ls-empty">남은 제안이 없어요</p>}
        {rows.map(({ t, list }) => (
          <div className="ls-review__row" key={t.id}>
            <span className="ls-review__title">{t.title}</span>
            <span className="ls-review__to">→ {label(list!)}</span>
            <button className="ls-btn ls-btn--primary" onClick={async () => { const r = await acceptSuggestions([{ taskId: t.id, listId: list!.id }]); if (r.moved) toast.show(`${withRo(`${list!.emoji ?? ''}${list!.name}`)} 옮겼어요`, r.undo) }}>옮기기</button>
            <button className="ls-btn" onClick={() => suggestStore.dismiss([t.id])}>무시</button>
          </div>
        ))}
      </div>
      <footer className="ls-dialog__foot"><button className="ls-btn" data-autofocus onClick={onClose}>닫기</button></footer>
    </Dialog>
  )
}

// ── ① 기본함 정리: 리스트 구조 제안 ──
type Phase = { s: 'running'; done: number; total: number } | { s: 'ready'; total: number } | { s: 'error'; text: string }
// 화면을 닫아도 정리는 계속 돈다 → 진행·결과를 화면 밖에 둔다(다시 열면 이어서 보인다)
const job: { phase?: Phase; proposals?: Proposal[]; stop?: AbortController; subs: Set<() => void> } = { subs: new Set() }
const setJob = (p: Partial<typeof job>) => { Object.assign(job, p); job.subs.forEach((f) => f()) }
export const organizeRunning = () => job.phase?.s === 'running'
function startOrganize() {
  if (job.phase?.s === 'running') return
  const ctrl = new AbortController()
  setJob({ stop: ctrl, phase: { s: 'running', done: 0, total: 0 }, proposals: undefined })
  proposeStructure({ signal: ctrl.signal, onProgress: (done, total) => setJob({ phase: { s: 'running', done, total } }) })
    .then((r) => setJob({ phase: { s: 'ready', total: r.total }, proposals: r.proposals }))
    .catch((e) => {
      if (ctrl.signal.aborted) { setJob({ phase: undefined }); return }
      setJob({ phase: { s: 'error', text: isUnavailable(e) ? '지금은 AI를 쓸 수 없어요. 리스트는 직접 만들어 옮길 수 있어요.' : 'AI 정리에 실패했어요. 잠시 뒤 다시 시도해 주세요.' } })
    })
}
const useJob = () => { const [, f] = useState(0); useEffect(() => { const g = () => f((n) => n + 1); job.subs.add(g); return () => { job.subs.delete(g) } }, []); return job }

function OrganizeDialog({ onClose }: { onClose: () => void }) {
  const j = useJob()
  const toast = useToast()
  const all = useLists()
  const inbox = useInboxTasks()
  const titles = useMemo(() => new Map(inbox.map((t) => [t.id, t.title])), [inbox])
  const [ps, setPs] = useState<Proposal[]>(j.proposals ?? [])
  const [emojiFor, setEmojiFor] = useState<{ key: string; anchor: HTMLElement }>()
  const [menu, setMenu] = useState<{ key: string; anchor: HTMLElement }>()
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!j.phase) startOrganize() }, [j.phase])
  useEffect(() => { if (j.proposals) setPs(j.proposals.map((p) => ({ ...p, taskIds: p.taskIds.filter((id) => titles.size === 0 || titles.has(id)) }))) }, [j.proposals]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key: string, patch: Partial<Proposal>) => setPs((xs) => xs.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const chosen = ps.filter((p) => p.on)
  const moving = new Set(chosen.flatMap((p) => p.taskIds)).size
  const newCount = chosen.filter((p) => !p.listId).length
  const dupNames = (() => { const seen = new Set<string>(); const d = new Set<string>(); for (const p of chosen) { const k = p.name.trim().toLowerCase(); if (seen.has(k)) d.add(k); seen.add(k) } return d })()
  const apply = async () => {
    setBusy(true)
    try {
      const r = await applyProposals(ps)
      setJob({ phase: undefined, proposals: undefined })
      onClose()
      toast.show(`리스트 ${r.created}개를 만들고 할 일 ${r.moved}개를 옮겼어요`, async () => { await undoApply() })
    } finally { setBusy(false) }
  }
  const close = () => { if (j.phase?.s !== 'running') setJob({ phase: undefined, proposals: undefined }); onClose() }
  const phase = j.phase
  return (
    <Dialog label="기본함 정리" className="ls-dialog ls-dialog--wide" onClose={close}>
      <header className="ls-dialog__head"><h2><Sparkles className="ls-dialog__spark" />기본함 정리</h2><button className="icon-btn" aria-label="닫기" onClick={close}><X /></button></header>
      <p className="ls-dialog__hint">AI가 기본함 할 일 {inbox.length.toLocaleString('ko-KR')}개를 보고 리스트를 제안해요. 이미 있는 리스트는 그대로 다시 쓰고, 고친 뒤 <b>이대로 만들기</b>를 눌러야 만들어져요.</p>
      {phase?.s === 'running' && (
        <div className="ls-progress">
          <span>{phase.total ? `할 일 ${phase.total.toLocaleString('ko-KR')}개를 살펴보는 중… ${phase.done}/${phase.total}` : '기본함을 읽는 중…'}</span>
          <progress value={phase.done} max={Math.max(1, phase.total)} />
          <button className="ls-btn" onClick={() => j.stop?.abort()}><Square />멈추기</button>
        </div>
      )}
      {phase?.s === 'error' && <div className="ls-progress is-error"><span>{phase.text}</span><button className="ls-btn" onClick={() => startOrganize()}>다시 시도</button></div>}
      {phase?.s === 'ready' && !ps.length && <p className="ls-empty">묶을 만한 주제를 찾지 못했어요. 할 일은 기본함에 그대로 있어요.</p>}
      {ps.length > 0 && (
        <div className="ls-props">
          {ps.map((p) => (
            <div key={p.key} className={`ls-prop${p.on ? '' : ' is-off'}`}>
              <input type="checkbox" className="ls-prop__check" aria-label={`${p.name} 만들기`} checked={p.on} onChange={(e) => set(p.key, { on: e.target.checked })} />
              <button type="button" className="ls-prop__emoji" aria-label="아이콘 고르기" disabled={!!p.listId} onClick={(e) => setEmojiFor({ key: p.key, anchor: e.currentTarget })}>{p.emoji ?? '≡'}</button>
              <div className="ls-prop__main">
                <div className="ls-prop__line">
                  {p.listId
                    ? <span className="ls-prop__name">{p.name}</span>
                    : <input className={`ls-prop__input${dupNames.has(p.name.trim().toLowerCase()) ? ' is-dup' : ''}`} value={p.name} maxLength={SUGGEST.name} aria-label="리스트 이름" onChange={(e) => set(p.key, { name: e.target.value })} />}
                  <span className={`ls-tag${p.listId ? ' is-existing' : ''}`}>{p.listId ? '있는 리스트' : '새 리스트'}</span>
                  <span className="ls-prop__count">{p.taskIds.length}개</span>
                  <button type="button" className="icon-btn ls-prop__more" aria-label="합치기" title="다른 리스트와 합치기" onClick={(e) => setMenu({ key: p.key, anchor: e.currentTarget })}><Combine /></button>
                </div>
                <div className="ls-prop__examples">{p.taskIds.slice(0, 3).map((id) => titles.get(id)).filter(Boolean).map((t, i) => <span key={i}>{t}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <footer className="ls-dialog__foot">
        <span className="ls-dialog__sum">{ps.length > 0 ? `새 리스트 ${newCount}개 · 옮길 할 일 ${moving}개 · 나머지 ${Math.max(0, inbox.length - moving)}개는 기본함에 남아요` : ''}</span>
        {phase?.s === 'ready' && <button className="ls-btn" onClick={() => startOrganize()}>다시 제안</button>}
        <button className="ls-btn" onClick={close}>나중에</button>
        <button className="ls-btn ls-btn--primary" data-autofocus disabled={busy || !moving || phase?.s !== 'ready' || dupNames.size > 0} onClick={() => void apply()}>이대로 만들기</button>
      </footer>
      {emojiFor && <EmojiPicker anchor={emojiFor.anchor} onPick={(e) => set(emojiFor.key, { emoji: e })} onClose={() => setEmojiFor(undefined)} />}
      {menu && (
        <Popover anchor={menu.anchor} align="end" width={220} className="menu" onClose={() => setMenu(undefined)}>
          <SubMenu label="다른 리스트와 합치기" width={220}>
            {ps.filter((p) => p.key !== menu.key).map((p) => <MenuItem key={p.key} label={label(p)} onClick={() => { setPs((xs) => mergeProposals(xs, menu.key, p.key)); setMenu(undefined) }} />)}
          </SubMenu>
        </Popover>
      )}
    </Dialog>
  )
}

/** 설정 › 할 일: 새 할 일 자동 분류(기본 켬) · 기본함 정리 · 되돌리기 · 무시한 제안 다시 받기 */
export function ListSuggestSettings() {
  const [on, setOn] = useState(autoSortEnabled)
  const [msg, setMsg] = useState('')
  const snap = loadApplySnapshot()
  return (
    <div className="settings-card ls-set">
      <div className="settings-row"><span>새 할 일 자동 분류<small className="ls-set__hint">기본함에 들어온 새 할 일을 AI가 확실할 때만 있는 리스트로 옮겨요. 애매하면 제안만 해요</small></span>
        <button className={`dp__switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label="새 할 일 자동 분류" onClick={() => { setAutoSort(!on); setOn(!on) }}><span /></button></div>
      <div className="settings-row"><span>기본함 정리<small className="ls-set__hint">AI가 리스트 구조를 제안하고, 확인한 뒤에 만들어요</small></span><button className="ls-btn" onClick={openInboxOrganize}>열기</button></div>
      <div className="settings-row"><span>마지막 기본함 정리 되돌리기<small className="ls-set__hint">{msg || (snap ? `할 일 ${snap.moves.length}개 · 만든 리스트 ${snap.created.length}개 · ${SUGGEST.undoHours}시간 안` : '되돌릴 정리가 없어요')}</small></span>
        <button className="ls-btn" disabled={!snap} onClick={async () => { setMsg((await undoApply()) ? '되돌렸어요' : '되돌릴 정리가 없어요') }}>되돌리기</button></div>
      <div className="settings-row"><span>무시한 AI 제안 다시 받기</span><button className="ls-btn" onClick={() => { suggestStore.resetDismissed(); setMsg('무시한 제안을 지웠어요') }}>지우기</button></div>
    </div>
  )
}
