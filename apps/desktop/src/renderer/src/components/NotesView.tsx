import { CalendarDays, Check, ChevronDown, Copy, ExternalLink, FileText, MessageSquareText, MoreHorizontal, Plus, Search, Sparkles, SquareCheck, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '../data/useQuery'
import { convertNote } from '../data/notes'
import { deleteItem, registerSuggestion, saveItem, suggestionOf, type CollectItem } from '../data/collect'
import { collector, useCollectorStatus } from '../data/collector'
import { listLabel, type ListRow } from '../data/types'
import { dayKey, detailDateLabel } from '../lib/dates'
import type { Schedule } from '../lib/taskActions'
import { DatePicker, EMPTY_SCHEDULE } from './DatePicker'
import { ListPickerBody } from './Pickers'
import { MenuItem, Popover } from './Popover'
import { useToast } from './Toast'
import { ItemDetail } from './collect/ItemDetail'
import { KakaoDialog, LAST_IMPORT_KEY } from './collect/KakaoDialog'
import { WatchList } from './collect/WatchList'
import { WikiView } from './collect/WikiView'
import { takeWikiTopic } from '../data/wiki'
import {
  Empty, Highlight, KindIcon, firstLine, localDay, monthDayKo, registered, registeredGone, scheduledWord, sentAt, suggestionDate, timeKo, titleOf, type Section
} from './collect/shared'
import './notes.css'
import { GuideButton, GuideLayer, useGuide } from './guide/Guide'

// 11-notes v3 수집함: 머리(제목 + 수집·볼 것·위키) · 진행 띠 · 추가 바 · 날짜 그룹(카톡은 원래 날짜별) · 종류 아이콘 행 + 꼬리표 · 오른쪽 상세(336)
type Props = { lists: ListRow[]; onOpen: (id: string) => void; section: Section; onSection: (section: Section) => void }
type Group = { id: string; name: string; items: CollectItem[]; closedByDefault: boolean; showTime: boolean }
const APP_GROUPS: [string, string][] = [['today', '오늘'], ['yesterday', '어제'], ['week', '이번 주'], ['older', '이전']]
const SECTIONS: [Section, string][] = [['notes', '수집'], ['watch', '볼 것'], ['wiki', '위키']]

function appGroupOf(iso: string, today: string) {
  const day = localDay(iso)
  if (day === today) return 'today'
  if (day === dayKey(-1)) return 'yesterday'
  const weekStart = dayKey(-((new Date().getDay() + 6) % 7)) // 주 시작 = 월요일(앱 전체 통일, 2026-10-05)
  return day >= weekStart ? 'week' : 'older'
}
const isKakao = (n: CollectItem) => n.source === 'kakao_import' || n.source === 'kakao_channel'

export function NotesView({ lists, onOpen, section, onSection }: Props) {
  const toast = useToast()
  const status = useCollectorStatus()
  const [search, setSearch] = useState<string | null>(null) // null = 검색칸 닫힘
  const [selected, setSelected] = useState<string>()
  // 01 §2.1 오른쪽 상세 닫기: 닫으면 목록이 넓어지고, 항목을 다시 고르면 열린다
  const [detailHidden, setDetailHidden] = useState(false)
  useEffect(() => { if (selected) setDetailHidden(false) }, [selected])
  const [wikiTopic, setWikiTopic] = useState<string | undefined>(takeWikiTopic) // 33 태그 페이지 위키 줄에서 열기
  useEffect(() => { const on = () => { const t = takeWikiTopic(); if (t) setWikiTopic(t) }; window.addEventListener('sprout:open-wiki', on); return () => window.removeEventListener('sprout:open-wiki', on) }, [])
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  const [menu, setMenu] = useState<{ item: CollectItem; anchor?: HTMLElement | null; point?: { x: number; y: number } }>()
  const [more, setMore] = useState<HTMLElement | null>(null)
  const [kakao, setKakao] = useState(false)
  const [convert, setConvert] = useState<{ item: CollectItem; scheduled: boolean; anchor: HTMLElement | null }>()
  const [draft, setDraft] = useState('')
  const [scrollTo, setScrollTo] = useState<string>()
  const listRef = useRef<HTMLDivElement>(null)
  const q = search ?? ''
  const items = useQuery<CollectItem>(
    `SELECT n.*, t.title AS task_title, t.deleted_at AS task_deleted, CASE WHEN t.start_at IS NOT NULL THEN 1 ELSE 0 END AS task_scheduled, w.name AS topic_name
     FROM notes n LEFT JOIN tasks t ON t.id = n.task_id LEFT JOIN wiki_topics w ON w.id = n.topic_id
     WHERE instr(lower(n.content || ' ' || COALESCE(n.link_title, '')), lower(?)) > 0
     ORDER BY COALESCE(n.captured_at, n.created_at) DESC, n.id DESC`,
    [q]
  )
  const guide = useGuide('collect', { ready: items !== undefined }) // 37 첫 둘러보기 · 머리 `?`
  const tryRecipe = (r: string) => {
    if (r === 'watch' || r === 'wiki') { onSection(r); return }
    setSearch(null); onSection('notes')
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.notes__addbar-input')?.focus(), 80)
  }
  const pendingKakao = useQuery<{ n: number }>("SELECT COUNT(*) AS n FROM notes WHERE source = 'kakao_import' AND ai_state = 'pending'")?.[0]?.n ?? 0
  const today = dayKey()
  const groups = useMemo<Group[]>(() => {
    const app = new Map<string, CollectItem[]>()
    const kakaoDays = new Map<string, CollectItem[]>()
    for (const n of items ?? []) {
      if (isKakao(n)) { const d = localDay(sentAt(n)); kakaoDays.set(d, [...(kakaoDays.get(d) ?? []), n]) }
      else { const g = appGroupOf(n.created_at, today); app.set(g, [...(app.get(g) ?? []), n]) }
    }
    const out: Group[] = APP_GROUPS.filter(([id]) => app.has(id)).map(([id, name]) => ({ id, name, items: app.get(id)!, closedByDefault: id === 'older', showTime: id === 'today' }))
    ;[...kakaoDays.keys()].sort().reverse().forEach((d, i) => {
      const rows = kakaoDays.get(d)!
      out.push({ id: `kakao:${d}`, name: `카카오톡에서 가져옴 · ${monthDayKo(sentAt(rows[0]))}`, items: rows, closedByDefault: i > 0, showTime: true })
    })
    return out
  }, [items, today])
  const closed = (g: Group) => !q && g.closedByDefault !== toggled.has(g.id)
  const toggle = (id: string) => setToggled((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const watchItems = useMemo(() => (items ?? []).filter((n) => n.url), [items])
  const visible = section === 'watch' ? [...watchItems.filter((n) => !n.seen_at), ...watchItems.filter((n) => n.seen_at)] : groups.flatMap((g) => (closed(g) ? [] : g.items))
  const current = (section === 'watch' ? watchItems : items)?.find((n) => n.id === selected)

  // ⌘F = 검색 (수집·볼 것·위키)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); setSearch((s) => s ?? '') }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  // 위키 출처에서 넘어오면 그 행이 보이게
  useEffect(() => {
    if (!scrollTo || section !== 'notes') return
    listRef.current?.querySelector(`[data-id="${scrollTo}"]`)?.scrollIntoView({ block: 'center' })
    setScrollTo(undefined)
  }, [scrollTo, section, groups])

  const add = async () => {
    const text = draft
    if (!text.trim()) return
    setDraft('') // 낙관적으로 바로 비운다(실패하면 되돌린다)
    try {
      const id = await saveItem(text)
      setSelected(id)
    } catch {
      setDraft(text)
      toast.show('저장하지 못했어요. 다시 시도해 주세요.')
    }
  }
  const remove = async (item: CollectItem) => {
    setMenu(undefined)
    if (selected === item.id) setSelected(undefined)
    try {
      const undo = await deleteItem(item.id)
      toast.show('삭제했어요', undo)
    } catch { toast.show('삭제하지 못했어요. 다시 시도해 주세요.') }
  }
  const register = async (item: CollectItem) => {
    try {
      await registerSuggestion(item, lists)
      toast.show(`"${suggestionOf(item)?.title || firstLine(item.content)}" 할 일로 등록했어요`)
    } catch (e) { toast.show(e instanceof Error ? e.message : '등록하지 못했어요. 다시 시도해 주세요.') }
  }
  const openConvert = (item: CollectItem, scheduled: boolean, anchor: HTMLElement | null) => {
    setMenu(undefined)
    if (item.task_id && item.task_title && !item.task_deleted) return onOpen(item.task_id)
    setConvert({ item, scheduled, anchor })
  }
  const moveSelection = (dir: 1 | -1) => {
    if (!visible.length) return
    const i = visible.findIndex((n) => n.id === selected)
    const next = visible[Math.max(0, Math.min(visible.length - 1, i < 0 ? 0 : i + dir))]
    setSelected(next.id)
    listRef.current?.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const jump = (id: string) => {
    const g = groups.find((x) => x.items.some((n) => n.id === id))
    setSearch(null)
    if (g && closed(g)) toggle(g.id)
    setSelected(id)
    setScrollTo(id)
    onSection('notes')
  }
  const showTopic = (id: string) => { setWikiTopic(id); onSection('wiki') }
  const rowMenu = (item: CollectItem, e: React.MouseEvent) => { e.preventDefault(); setSelected(item.id); setMenu({ item, point: { x: e.clientX, y: e.clientY } }) }

  return (
    <div className="notes">
      <main className="list notes__main">
        <header className="pane-header">
          <h1 className="pane-header__title notes__title">수집함</h1>
          <SectionSwitch section={section} onSection={onSection} />
          <div className="pane-header__actions">
            <button className="icon-btn" aria-label="검색 (⌘F)" onClick={() => setSearch((s) => (s === null ? '' : null))}><Search /></button>
            <GuideButton guide={guide} />{/* 37 §3: ⋯ 왼쪽 */}
            <button className="icon-btn" aria-label="수집함 메뉴" onClick={(e) => setMore(e.currentTarget)}><MoreHorizontal /></button>
          </div>
        </header>
        {search !== null && (
          <div className="addbar is-active notes__search">
            <div className="addbar__line">
              <Search className="addbar__icon" />
              <input className="addbar__input" autoFocus placeholder={section === 'wiki' ? '주제 검색' : section === 'watch' ? '볼 것 검색' : '수집함 검색'} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setSearch(null) }} />
              <button className="addbar__tool" aria-label="검색 닫기" onClick={() => setSearch(null)}><X /></button>
            </div>
          </div>
        )}
        {section === 'wiki' ? <WikiView query={q} topicId={wikiTopic} onTopic={setWikiTopic} onJump={jump} onBack={() => onSection('notes')} /> : (
          <>
            {section === 'notes' && pendingKakao > 0 && <ProgressBand pending={pendingKakao} />}
            {section === 'notes' && search === null && <NoteAddBar value={draft} onChange={setDraft} onSubmit={add} />}
            <div
              className="list__scroll notes__scroll"
              ref={listRef}
              tabIndex={-1}
              onKeyDown={(e) => {
                if ((e.target as HTMLElement).closest('input,textarea')) return
                if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
                if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
                if (e.key === 'Enter' && selected) { e.preventDefault(); document.querySelector<HTMLTextAreaElement>('.note-detail__body')?.focus() }
              }}
            >
              {!items ? <div className="notes__loading">{Array.from({ length: 5 }, (_, i) => <span key={i} />)}</div>
                : section === 'watch' ? (
                  <WatchList items={watchItems} query={q} selected={selected} onSelect={(id) => { setSelected(id); listRef.current?.focus({ preventScroll: true }) }} onContextMenu={rowMenu} />
                ) : !items.length ? (q
                  ? <Empty icon={<FileText className="notes__empty-icon" />} title={`"${q}"와 맞는 항목이 없어요`} />
                  : <Empty icon={<FileText className="notes__empty-icon" />} title="무엇이든 던져 두세요" hint="할 일·링크·메모를 AI가 알아서 나눠 둬요" />)
                  : groups.map((g) => {
                    const shut = closed(g)
                    return (
                      <section key={g.id} className="group">
                        <div className="group__header" onClick={() => toggle(g.id)}>
                          <ChevronDown className={`group__chevron${shut ? ' is-collapsed' : ''}`} />
                          <span className="group__name">{g.name}</span>
                          <span className="group__count">{g.items.length}</span>
                        </div>
                        {!shut && g.items.map((n) => (
                          <ItemRow
                            key={n.id}
                            idle={status.aiDown || status.paused || !status.auto}
                            item={n}
                            query={q}
                            selected={n.id === selected}
                            showTime={g.showTime}
                            onRegister={() => void register(n)}
                            onClick={() => { setSelected(n.id); listRef.current?.focus({ preventScroll: true }) }}
                            onContextMenu={(e) => rowMenu(n, e)}
                          />
                        ))}
                      </section>
                    )
                  })}
            </div>
          </>
        )}
      </main>
      {section !== 'wiki' && !(detailHidden && !current) && (
        <ItemDetail
          onHide={() => { setSelected(undefined); setDetailHidden(true) }}
          key={current?.id ?? 'none'}
          item={current}
          lists={lists}
          emptyText={section === 'watch' ? '링크를 고르면 여기에서 볼 수 있어요' : '항목을 고르면 여기에서 고칠 수 있어요'}
          onMenu={(anchor) => current && setMenu({ item: current, anchor })}
          onConvert={(anchor) => current && openConvert(current, false, anchor)}
          onOpen={onOpen}
          onTopic={showTopic}
          onEmpty={() => toast.show('빈 메모는 저장하지 않아요')}
        />
      )}
      {more && (
        <Popover anchor={more} align="end" onClose={() => setMore(null)} className="menu" width={220}>
          <MenuItem icon={<MessageSquareText />} label="카카오톡 대화 가져오기" onClick={() => { setMore(null); setKakao(true) }} />
          <MenuItem icon={<Sparkles />} label="자동 분류" trail={status.auto ? <Check className="menu__check" /> : undefined} onClick={() => { setMore(null); collector.setAuto(!status.auto); toast.show(status.auto ? '자동 분류를 껐어요' : '자동 분류를 켰어요') }} />
        </Popover>
      )}
      {menu && (
        <Popover anchor={menu.anchor} point={menu.point} align="end" onClose={() => setMenu(undefined)} className="menu" width={190}>
          {menu.item.task_id && menu.item.task_title && !menu.item.task_deleted
            ? <MenuItem icon={<ExternalLink />} label="연결된 할 일 열기" onClick={() => { setMenu(undefined); onOpen(menu.item.task_id!) }} />
            : <>
              <MenuItem icon={<SquareCheck />} label="할 일로 만들기" onClick={() => openConvert(menu.item, false, menu.anchor ?? null)} />
              <MenuItem icon={<CalendarDays />} label="일정으로 만들기" onClick={() => openConvert(menu.item, true, menu.anchor ?? null)} />
            </>}
          <MenuItem icon={<Copy />} label="복사" onClick={() => { void navigator.clipboard?.writeText(menu.item.content); setMenu(undefined); toast.show('복사했어요') }} />
          <div className="menu__divider" />
          <MenuItem icon={<Trash2 />} label="삭제" danger onClick={() => void remove(menu.item)} />
        </Popover>
      )}
      {convert && (
        <ConvertPopover
          key={convert.item.id + convert.scheduled}
          item={convert.item}
          scheduled={convert.scheduled}
          anchor={convert.anchor ?? document.querySelector<HTMLElement>('.note-detail .detail__header')}
          lists={lists}
          onClose={() => setConvert(undefined)}
          onDone={(title) => { setConvert(undefined); toast.show(`"${title}" 만들었어요`) }}
        />
      )}
      {kakao && (
        <KakaoDialog
          onClose={() => setKakao(false)}
          onDone={(count) => { setKakao(false); setSearch(null); onSection('notes'); toast.show(`${count.toLocaleString()}개를 가져왔어요. 뒤에서 정리할게요`) }}
        />
      )}
      <GuideLayer guide={guide} onTry={tryRecipe} aiOk={status.aiDown ? false : null} />
    </div>
  )
}

/** 머리의 수집 · 볼 것 · 위키 전환(06 캘린더 보기 전환과 같은 세그먼트). ←→ Home End로도 바꾼다 */
function SectionSwitch({ section, onSection }: { section: Section; onSection: (s: Section) => void }) {
  return (
    <div
      className="seg notes__seg"
      role="tablist"
      aria-label="수집함 보기"
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const i = SECTIONS.findIndex(([s]) => s === section)
        const n = SECTIONS.length
        const next = SECTIONS[e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n][0]
        onSection(next)
        requestAnimationFrame(() => e.currentTarget.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus())
      }}
    >
      {SECTIONS.map(([s, name]) => (
        <button key={s} role="tab" data-section={s} aria-selected={section === s} tabIndex={section === s ? 0 : -1} className={section === s ? 'is-on' : ''} onClick={() => onSection(s)}>
          {name}
        </button>
      ))}
    </div>
  )
}

/** 진행 띠(v3-4): 카톡에서 가져온 것을 정리하는 동안. 합계는 마지막 가져오기 수(기기별) */
function ProgressBand({ pending }: { pending: number }) {
  const st = useCollectorStatus()
  let total = pending
  try { total = Math.max(pending, JSON.parse(localStorage.getItem(LAST_IMPORT_KEY) ?? '{}')?.count ?? 0) } catch { /* 합계 = 남은 수 */ }
  const done = total - pending
  const state = !st.auto ? '개 · 자동 분류가 꺼져 있어요' : st.aiDown ? '개 · 지금은 AI를 쓸 수 없어요(돌아오면 이어서)' : st.paused ? '개 · 정리를 멈췄어요' : '개를 정리하는 중'
  return (
    <div className="collect-band" role="status">
      <Sparkles />
      <span className="collect-band__text">카카오톡에서 가져온 {total.toLocaleString()}{state} · {done.toLocaleString()}/{total.toLocaleString()}</span>
      <span className="collect-band__bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
      {!st.auto
        ? <button onClick={() => collector.setAuto(true)}>켜기</button>
        : st.paused ? <button onClick={collector.resume}>다시 시작</button> : <button onClick={collector.pause}>멈추기</button>}
    </div>
  )
}

/** 추가 바: Enter 저장, Shift+Enter 줄바꿈(최대 5줄), 한글 조합 중 Enter 무시 — 부록 B §5 */
function NoteAddBar({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '20px'
    if (value) el.style.height = `${Math.min(el.scrollHeight, 5 * 20)}px`
  }, [value])
  return (
    <div className={`addbar notes__addbar${focused ? ' is-active' : ''}`}>
      <div className="addbar__line">
        <Plus className="addbar__icon" />
        <textarea
          ref={ref}
          rows={1}
          className="addbar__input notes__addbar-input"
          placeholder="무엇이든 던져 두세요 — 할 일, 링크, 메모"
          aria-label="새 항목"
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
            if (e.key === 'Escape') { onChange(''); e.currentTarget.blur() }
          }}
        />
        {focused && <span className="notes__hint">Enter 저장</span>}
      </div>
    </div>
  )
}

/** 행(40): 종류 아이콘 · 첫 줄 · 꼬리표(카톡 테두리 + 종류). 꼬리표가 없으면 시각·날짜 */
/** idle = AI를 지금 못 쓰거나(멈춤·자동 분류 끔 포함) 정리를 기다리는 중 → "정리 중…"을 띄우지 않고 꼬리표 없이 둔다(v3-3) */
function ItemRow({ item, query, selected, showTime, idle, onRegister, onClick, onContextMenu }: { item: CollectItem; query: string; selected: boolean; showTime: boolean; idle: boolean; onRegister: () => void; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void }) {
  const chips: React.ReactNode[] = []
  if (isKakao(item)) chips.push(<span key="src" className="collect-chip is-src">카톡</span>)
  if (registered(item)) {
    chips.push(<span key="k" className="collect-chip">{registeredGone(item) ? `${scheduledWord(item)} · 삭제됨` : (scheduledWord(item) === '일정' ? '일정으로 등록됨' : '할 일로 등록됨')}</span>)
  } else if (item.ai_state === 'pending') {
    if (!idle) chips.push(<span key="k" className="collect-pending">정리 중…</span>)
  } else if (item.kind === 'task' && item.ai_state !== 'failed') {
    const d = suggestionDate(item)
    chips.push(<span key="k" className="collect-chip is-accent">할 일 제안{d ? ` · ${d.label}` : ''}</span>)
    chips.push(<button key="b" className="collect-mini" onClick={(e) => { e.stopPropagation(); onRegister() }}>등록</button>)
  } else if (item.kind === 'link') chips.push(<span key="k" className="collect-chip">볼 것</span>)
  else if (item.kind === 'wiki') chips.push(<span key="k" className="collect-chip is-wiki">위키{item.topic_name ? ` · ${item.topic_name}` : ''}</span>)
  else if (item.kind === 'memo') chips.push(<span key="k" className="collect-chip">메모</span>)
  const at = sentAt(item)
  const hasKind = chips.length > (isKakao(item) ? 1 : 0)
  return (
    <div data-id={item.id} className={`row note-row${selected ? ' is-selected' : ''}`} onClick={onClick} onContextMenu={onContextMenu}>
      <KindIcon item={item} idle={idle} />
      <div className="row__main"><span className="row__title"><Highlight text={titleOf(item)} query={query} /></span></div>
      <span className="row__meta">
        {chips}
        {!hasKind && <span className="row__date">{showTime ? timeKo(at) : monthDayKo(at)}</span>}
      </span>
    </div>
  )
}

/** 할 일·일정으로 만들기 팝오버(폭 300): 제목 · 리스트 · 날짜(03 날짜 피커) — AI 제안이 있으면 그 값으로 채운다 */
function ConvertPopover({ item, scheduled, anchor, lists, onClose, onDone }: { item: CollectItem; scheduled: boolean; anchor: HTMLElement | null; lists: ListRow[]; onClose: () => void; onDone: (title: string) => void }) {
  const s = suggestionOf(item)
  const [title, setTitle] = useState((s?.title || firstLine(item.content)).slice(0, 200))
  const [listId, setListId] = useState((s?.listId && lists.some((l) => l.id === s.listId) ? s.listId : lists.find((l) => l.kind === 'inbox')?.id) ?? lists[0]?.id ?? '')
  const [when, setWhen] = useState<Schedule>(s?.due ? { ...EMPTY_SCHEDULE, start_at: s.start || null, due_at: s.due, is_all_day: s.due.includes('T') ? 0 : 1 } : EMPTY_SCHEDULE)
  const [pop, setPop] = useState<'list' | 'date'>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const listBtn = useRef<HTMLButtonElement>(null)
  const dateBtn = useRef<HTMLButtonElement>(null)
  const list = lists.find((l) => l.id === listId)
  const date = detailDateLabel(when, dayKey())
  const submit = async () => {
    if (busy) return
    if (!title.trim()) return setError('제목을 입력해 주세요.')
    if (scheduled && !when.due_at) return setError('날짜를 골라 주세요.')
    setBusy(true); setError('')
    try {
      await convertNote(item.id, { title, listId, due: when.due_at ?? undefined, start: when.start_at ?? undefined })
      onDone(title.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : '만들지 못했어요. 다시 시도해 주세요.')
      setBusy(false)
    }
  }
  return (
    <Popover anchor={anchor} align="end" width={300} onClose={() => { if (!pop) onClose() }} className="menu note-convert">
      <div className="note-convert__head">{scheduled ? '일정으로 만들기' : '할 일로 만들기'}</div>
      <input
        className="note-convert__title"
        autoFocus
        aria-label="제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit() }}
      />
      <button ref={listBtn} className="note-convert__field" onClick={() => setPop('list')}>
        <span className="note-convert__label">리스트</span><span>{list ? listLabel(list) : '선택'}</span>
      </button>
      <button ref={dateBtn} className={`note-convert__field${when.due_at ? ` is-${date.tone}` : ''}`} onClick={() => setPop('date')}>
        <span className="note-convert__label">날짜</span><span>{when.due_at ? date.label : scheduled ? '날짜 고르기 (필수)' : '없음'}</span>
      </button>
      <p className="note-convert__note">원본은 그대로 두고 설명에 함께 저장해요</p>
      {error && <p className="note-convert__error" role="alert">{error}</p>}
      <div className="note-convert__actions">
        <button onClick={onClose} disabled={busy}>취소</button>
        <button className="is-primary" onClick={() => void submit()} disabled={busy || !title.trim() || !listId}>{busy ? '만드는 중…' : '등록'}</button>
      </div>
      {pop === 'list' && (
        <Popover anchor={listBtn.current} onClose={() => setPop(undefined)} className="menu" width={220}>
          <ListPickerBody lists={lists} current={listId} onPick={(l) => { setListId(l.id); setPop(undefined) }} />
        </Popover>
      )}
      {pop === 'date' && <DatePicker initial={when} anchor={dateBtn.current} onSave={setWhen} onClose={() => setPop(undefined)} />}
    </Popover>
  )
}
