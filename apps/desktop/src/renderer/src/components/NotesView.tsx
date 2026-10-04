import { BookOpen, CalendarDays, ChevronDown, Copy, ExternalLink, FileText, Link2, MoreHorizontal, Plus, Search, Sparkles, SquareCheck, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '../data/useQuery'
import { convertNote, deleteNote, restoreNote, saveNote, type Note } from '../data/notes'
import { listLabel, type ListRow } from '../data/types'
import { dayKey, detailDateLabel } from '../lib/dates'
import type { Schedule } from '../lib/taskActions'
import { DatePicker, EMPTY_SCHEDULE } from './DatePicker'
import { ListPickerBody } from './Pickers'
import { MenuItem, Popover } from './Popover'
import { useToast } from './Toast'
import './notes.css'

// 11-notes v2: 틱틱 노트 리스트 모양 — 머리(제목 + 메모·주제 위키 전환) · 추가 바 · 작성일 그룹 · 문서 아이콘 행 · 오른쪽 상세(336)
type Section = 'notes' | 'watch' | 'wiki'
type Props = { lists: ListRow[]; onOpen: (id: string) => void; section: Section; onSection: (section: Section) => void }
type GroupId = 'today' | 'yesterday' | 'week' | 'older'
const GROUPS: [GroupId, string][] = [['today', '오늘'], ['yesterday', '어제'], ['week', '이번 주'], ['older', '이전']]
const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim() ?? ''
const localDay = (iso: string) => dayKey(0, new Date(iso))
const timeKo = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
const monthDayKo = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
const fullKo = (iso: string) => `${monthDayKo(iso)} ${timeKo(iso)}`

function groupOf(iso: string, today: string): GroupId {
  const day = localDay(iso)
  if (day === today) return 'today'
  if (day === dayKey(-1)) return 'yesterday'
  const weekStart = dayKey(-new Date().getDay()) // 주 시작 = 일요일(캘린더와 같다)
  return day >= weekStart ? 'week' : 'older'
}

export function NotesView({ lists, onOpen, section, onSection }: Props) {
  const toast = useToast()
  const [search, setSearch] = useState<string | null>(null) // null = 검색칸 닫힘
  const [selected, setSelected] = useState<string>()
  const [collapsed, setCollapsed] = useState<Set<GroupId>>(() => new Set(['older']))
  const [menu, setMenu] = useState<{ note: Note; anchor?: HTMLElement | null; point?: { x: number; y: number } }>()
  const [convert, setConvert] = useState<{ note: Note; scheduled: boolean; anchor: HTMLElement | null }>()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const q = search ?? ''
  const notes = useQuery<Note>(
    `SELECT n.*, t.title AS task_title, t.deleted_at AS task_deleted, CASE WHEN t.start_at IS NOT NULL OR t.due_at LIKE '%T%' THEN 1 ELSE 0 END AS task_scheduled
     FROM notes n LEFT JOIN tasks t ON t.id = n.task_id WHERE instr(lower(n.content), lower(?)) > 0 ORDER BY n.created_at DESC, n.id DESC`,
    [q]
  )
  const today = dayKey()
  const grouped = useMemo(() => {
    const map = new Map<GroupId, Note[]>()
    for (const n of notes ?? []) {
      const g = groupOf(n.created_at, today)
      map.set(g, [...(map.get(g) ?? []), n])
    }
    return GROUPS.filter(([id]) => map.has(id)).map(([id, name]) => ({ id, name, items: map.get(id)! }))
  }, [notes, today])
  const visible = grouped.flatMap((g) => (collapsed.has(g.id) && !q ? [] : g.items))
  const current = notes?.find((n) => n.id === selected)

  // ⌘F = 검색 (메모 탭에서만)
  useEffect(() => {
    if (section !== 'notes') return
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); setSearch((s) => s ?? '') }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [section])

  const add = async () => {
    const text = draft
    if (!text.trim()) return
    setDraft('') // 낙관적으로 바로 비운다(실패하면 되돌린다)
    try {
      const id = await saveNote(text)
      setSelected(id)
    } catch {
      setDraft(text)
      toast.show('저장하지 못했어요. 다시 시도해 주세요.')
    }
  }
  const remove = async (note: Note) => {
    setMenu(undefined)
    if (selected === note.id) setSelected(undefined)
    await deleteNote(note.id)
    toast.show('메모를 삭제했어요', () => restoreNote(note))
  }
  const openConvert = (note: Note, scheduled: boolean, anchor: HTMLElement | null) => {
    setMenu(undefined)
    if (note.task_id && note.task_title && !note.task_deleted) return onOpen(note.task_id)
    setConvert({ note, scheduled, anchor })
  }
  const moveSelection = (dir: 1 | -1) => {
    if (!visible.length) return
    const i = visible.findIndex((n) => n.id === selected)
    const next = visible[Math.max(0, Math.min(visible.length - 1, i < 0 ? 0 : i + dir))]
    setSelected(next.id)
    listRef.current?.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="notes">
      <main className="list notes__main">
        <header className="pane-header">
          <h1 className="pane-header__title notes__title">메모함</h1>
          <SectionSwitch section={section} onSection={onSection} />
          <div className="pane-header__actions">
            {section === 'notes' && <button className="icon-btn" aria-label="메모 검색 (⌘F)" onClick={() => setSearch((s) => (s === null ? '' : null))}><Search /></button>}
          </div>
        </header>
        {section === 'wiki' ? <WikiEmpty count={notes?.length ?? 0} onBack={() => onSection('notes')} /> : (
          <>
            {search !== null ? (
              <div className="addbar is-active notes__search">
                <div className="addbar__line">
                  <Search className="addbar__icon" />
                  <input className="addbar__input" autoFocus placeholder="메모 검색" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setSearch(null) }} />
                  <button className="addbar__tool" aria-label="검색 닫기" onClick={() => setSearch(null)}><X /></button>
                </div>
              </div>
            ) : <NoteAddBar value={draft} onChange={setDraft} onSubmit={add} />}
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
              {!notes ? <div className="notes__loading">{Array.from({ length: 5 }, (_, i) => <span key={i} />)}</div>
                : !notes.length ? (q ? <NotesEmpty title={`"${q}"와 맞는 메모가 없어요`} /> : <NotesEmpty title="생각나는 것을 바로 적어 두세요" hint="필요할 때 할 일이나 일정으로 바꿀 수 있어요" />)
                  : grouped.map((g) => {
                    const closed = collapsed.has(g.id) && !q
                    return (
                      <section key={g.id} className="group">
                        <div className="group__header" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n })}>
                          <ChevronDown className={`group__chevron${closed ? ' is-collapsed' : ''}`} />
                          <span className="group__name">{g.name}</span>
                          <span className="group__count">{g.items.length}</span>
                        </div>
                        {!closed && g.items.map((n) => (
                          <NoteRow
                            key={n.id}
                            note={n}
                            query={q}
                            selected={n.id === selected}
                            showTime={g.id === 'today'}
                            onClick={() => { setSelected(n.id); listRef.current?.focus({ preventScroll: true }) }}
                            onContextMenu={(e) => { e.preventDefault(); setSelected(n.id); setMenu({ note: n, point: { x: e.clientX, y: e.clientY } }) }}
                          />
                        ))}
                      </section>
                    )
                  })}
            </div>
          </>
        )}
      </main>
      {section === 'notes' && (
        <NoteDetail
          key={current?.id ?? 'none'}
          note={current}
          onMenu={(anchor) => current && setMenu({ note: current, anchor })}
          onConvert={(anchor) => current && openConvert(current, false, anchor)}
          onOpen={onOpen}
          onEmpty={() => toast.show('빈 메모는 저장하지 않아요')}
        />
      )}
      {menu && (
        <Popover anchor={menu.anchor} point={menu.point} align="end" onClose={() => setMenu(undefined)} className="menu" width={190}>
          {menu.note.task_id && menu.note.task_title && !menu.note.task_deleted
            ? <MenuItem icon={<ExternalLink />} label="연결된 할 일 열기" onClick={() => { setMenu(undefined); onOpen(menu.note.task_id!) }} />
            : <>
              <MenuItem icon={<SquareCheck />} label="할 일로 만들기" onClick={() => openConvert(menu.note, false, menu.anchor ?? null)} />
              <MenuItem icon={<CalendarDays />} label="일정으로 만들기" onClick={() => openConvert(menu.note, true, menu.anchor ?? null)} />
            </>}
          <MenuItem icon={<Copy />} label="복사" onClick={() => { void navigator.clipboard?.writeText(menu.note.content); setMenu(undefined); toast.show('복사했어요') }} />
          <div className="menu__divider" />
          <MenuItem icon={<Trash2 />} label="삭제" danger onClick={() => void remove(menu.note)} />
        </Popover>
      )}
      {convert && (
        <ConvertPopover
          key={convert.note.id + convert.scheduled}
          note={convert.note}
          scheduled={convert.scheduled}
          anchor={convert.anchor ?? document.querySelector<HTMLElement>('.note-detail .detail__header')}
          lists={lists}
          onClose={() => setConvert(undefined)}
          onDone={(title) => { setConvert(undefined); toast.show(`"${title}" 만들었어요`) }}
        />
      )}
    </div>
  )
}

/** 머리의 메모 · 주제 위키 전환(06 캘린더 보기 전환과 같은 세그먼트). ←→ Home End로도 바꾼다 */
function SectionSwitch({ section, onSection }: { section: Section; onSection: (s: Section) => void }) {
  return (
    <div
      className="seg notes__seg"
      role="tablist"
      aria-label="메모함 보기"
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const next = e.key === 'Home' ? 'notes' : e.key === 'End' ? 'wiki' : section === 'notes' ? 'wiki' : 'notes'
        onSection(next)
        requestAnimationFrame(() => e.currentTarget.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus())
      }}
    >
      {(['notes', 'wiki'] as const).map((s) => (
        <button key={s} role="tab" data-section={s} aria-selected={section === s} tabIndex={section === s ? 0 : -1} className={section === s ? 'is-on' : ''} onClick={() => onSection(s)}>
          {s === 'notes' ? '메모' : '주제 위키'}
        </button>
      ))}
    </div>
  )
}

/** 추가 바: Enter 저장, Shift+Enter 줄바꿈(최대 5줄), 한글 조합 중 Enter 무시 — 11 §5 */
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
          placeholder="메모 추가하기"
          aria-label="새 메모"
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

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  const ql = query.toLowerCase()
  let i = 0
  for (let at = lower.indexOf(ql); at >= 0; at = lower.indexOf(ql, i)) {
    parts.push(text.slice(i, at), <mark key={at} className="notes__mark">{text.slice(at, at + query.length)}</mark>)
    i = at + query.length
  }
  parts.push(text.slice(i))
  return <>{parts}</>
}

function NoteRow({ note, query, selected, showTime, onClick, onContextMenu }: { note: Note; query: string; selected: boolean; showTime: boolean; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void }) {
  const linked = !!note.task_id
  const gone = linked && (!note.task_title || !!note.task_deleted)
  const kind = note.task_scheduled ? '일정' : '할 일'
  return (
    <div data-id={note.id} className={`row note-row${selected ? ' is-selected' : ''}`} onClick={onClick} onContextMenu={onContextMenu}>
      <FileText className="note-row__icon" />
      <div className="row__main"><span className="row__title"><Highlight text={firstLine(note.content)} query={query} /></span></div>
      <span className="row__meta">
        {linked ? <span className={`note-tag${gone ? ' is-gone' : ''}`}>{gone ? `${kind} · 삭제됨` : kind}</span>
          : <span className="row__date">{showTime ? timeKo(note.created_at) : monthDayKo(note.created_at)}</span>}
      </span>
    </div>
  )
}

/** 상세(336): 첫 줄 = 제목, 나머지 = 본문. 0.6초 뒤 자동 저장(02 상세와 같다) — 11 §2 상세 패널 */
function NoteDetail({ note, onMenu, onConvert, onOpen, onEmpty }: { note?: Note; onMenu: (a: HTMLElement) => void; onConvert: (a: HTMLElement) => void; onOpen: (id: string) => void; onEmpty: () => void }) {
  const split = (s: string) => { const i = s.indexOf('\n'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)] }
  const [title, setTitle] = useState(() => split(note?.content ?? '')[0])
  const [body, setBody] = useState(() => split(note?.content ?? '')[1])
  const saved = useRef(note?.content ?? '')
  const timer = useRef<number>(undefined)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const convertRef = useRef<HTMLButtonElement>(null)
  const join = (t: string, b: string) => (b ? `${t}\n${b}` : t)
  const flush = (t = title, b = body) => {
    window.clearTimeout(timer.current)
    if (!note) return
    const next = join(t, b)
    if (next === saved.current) return
    if (!next.trim()) return
    saved.current = next
    void saveNote(next, note.id)
  }
  const schedule = (t: string, b: string) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => flush(t, b), 600) }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    for (const el of [bodyRef.current, titleRef.current]) {
      if (!el) continue
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [body, title])
  if (!note) {
    return (
      <aside className="detail detail--empty note-detail">
        <FileText className="note-detail__empty-icon" />
        <p className="detail__empty-text">메모를 고르면 여기에서 고칠 수 있어요</p>
      </aside>
    )
  }
  const leave = () => {
    if (!join(title, body).trim()) {
      const [t, b] = split(saved.current)
      setTitle(t); setBody(b); onEmpty()
      return
    }
    flush()
  }
  const edited = Date.parse(note.modified_at) - Date.parse(note.created_at) > 60_000
  const links = Array.from(new Set(join(title, body).match(/https?:\/\/[^\s)]+/g) ?? [])).slice(0, 5)
  const linked = !!note.task_id
  const gone = linked && (!note.task_title || !!note.task_deleted)
  return (
    <aside className="detail note-detail" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) leave() }}>
      <div className="detail__header">
        <span className="note-detail__meta">{fullKo(note.created_at)} 작성{edited ? ' · 수정됨' : ''}</span>
        <div className="detail__footer-actions">
          <button ref={convertRef} className="icon-btn" aria-label={linked && !gone ? '연결된 할 일 열기' : '할 일로 만들기'} onClick={() => convertRef.current && onConvert(convertRef.current)}><SquareCheck /></button>
          <button ref={moreRef} className="icon-btn" aria-label="메모 메뉴" onClick={() => moreRef.current && onMenu(moreRef.current)}><MoreHorizontal /></button>
        </div>
      </div>
      <div className="detail__body">
        <textarea
          ref={titleRef}
          rows={1}
          className="detail__title note-detail__title"
          aria-label="메모 제목"
          placeholder="제목"
          value={title}
          onChange={(e) => { const v = e.target.value.replace(/\n/g, ' '); setTitle(v); schedule(v, body) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); bodyRef.current?.focus() } }}
        />
        <textarea
          ref={bodyRef}
          className="note-detail__body"
          aria-label="메모 내용"
          placeholder="내용"
          value={body}
          onChange={(e) => { setBody(e.target.value); schedule(title, e.target.value) }}
        />
        {links.length > 0 && (
          <div className="note-detail__links">
            {links.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer"><Link2 />{l.replace(/^https?:\/\//, '')}</a>)}
          </div>
        )}
      </div>
      {linked && (
        <div className="detail__footer note-detail__footer">
          {gone ? <span className="note-detail__gone">연결된 항목이 삭제되었어요</span> : (
            <button className="note-detail__link" onClick={() => onOpen(note.task_id!)}>
              <span>↳ {note.task_scheduled ? '일정' : '할 일'}: {note.task_title}</span>
              <ExternalLink />
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

/** 할 일·일정으로 만들기 팝오버(폭 300): 제목 · 리스트 · 날짜(03 날짜 피커) — 11 §4 */
function ConvertPopover({ note, scheduled, anchor, lists, onClose, onDone }: { note: Note; scheduled: boolean; anchor: HTMLElement | null; lists: ListRow[]; onClose: () => void; onDone: (title: string) => void }) {
  const [title, setTitle] = useState(firstLine(note.content).slice(0, 200))
  const [listId, setListId] = useState(lists.find((l) => l.kind === 'inbox')?.id ?? lists[0]?.id ?? '')
  const [when, setWhen] = useState<Schedule>(EMPTY_SCHEDULE)
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
      await convertNote(note.id, { title, listId, due: when.due_at ?? undefined, start: when.start_at ?? undefined })
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
      <p className="note-convert__note">원본 메모는 그대로 두고 설명에 함께 저장해요</p>
      {error && <p className="note-convert__error" role="alert">{error}</p>}
      <div className="note-convert__actions">
        <button onClick={onClose} disabled={busy}>취소</button>
        <button className="is-primary" onClick={() => void submit()} disabled={busy || !title.trim() || !listId}>{busy ? '만드는 중…' : '만들기'}</button>
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

function NotesEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty notes__empty">
      <FileText className="notes__empty-icon" />
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
    </div>
  )
}

/** 주제 위키 — 테이블·AI 프록시 전(11 §6 [다음])이라 "주제 없음" 상태만 */
function WikiEmpty({ count, onBack }: { count: number; onBack: () => void }) {
  return (
    <div className="notes__wiki">
      <div className="notes__wiki-banner">
        <Sparkles />
        <span>메모 {count}개가 있어요. AI 정리는 sprout AI가 연결되면 쓸 수 있어요.</span>
        <button disabled title="지금은 AI를 쓸 수 없어요">AI로 정리하기</button>
      </div>
      <div className="empty">
        <BookOpen className="notes__empty-icon" />
        <p className="empty__title">메모가 쌓이면 주제별로 정리해 드려요</p>
        <p className="empty__hint">메모 5개 이상이면 AI가 주제를 제안해요</p>
        <button className="notes__back" onClick={onBack}>메모로 돌아가기</button>
      </div>
    </div>
  )
}
