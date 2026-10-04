import { ArrowUp, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Lock, LockOpen, MessageCircle, MessageCircleOff, MoreHorizontal, Phone, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays } from '@sprout/schema/time'
import { useQuery } from '../../data/useQuery'
import { useGrowth } from '../../data/growth'
import { isUnavailable } from '../../data/ai'
import {
  buddyOf, buddyReply, CRISIS_CARD, dayRange, deleteEntry, DONE_SQL, getConsent, getMemory, insightOf, isSolo, isWritten, josa,
  MOODS, moodOf, parseBuddyReply, promptFor, saveEntry, sendMessage, setConsent, setMemory, setPrivate, setSolo, streakOf,
  summarizeEntry, takeNotice, taskFromChip, XP_SQL, type Buddy, type DiaryEntry, type DiaryMessage
} from '../../data/diary'
import { dayKey } from '../../lib/dates'
import { CharacterArt } from '../growth/CharacterArt'
import { Dialog } from '../Dialog'
import { MenuItem, Popover } from '../Popover'
import { useToast } from '../Toast'
import './diary.css'

// 15 일기 v0.3 — 쓰기(왼쪽 300: 미니 달력 + 날짜 목록 / 오른쪽 편집 + 캐릭터와 이야기) · 돌아보기(월 기분 달력)
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const parse = (d: string) => new Date(`${d}T00:00:00`)
const monthOf = (d: string) => d.slice(0, 7)
const shiftMonth = (m: string, n: number) => { const d = new Date(`${m}-01T00:00:00`); d.setMonth(d.getMonth() + n); return dayKey(0, d).slice(0, 7) }
const firstLine = (s: string | null) => (s ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
function dateLabel(d: string, today: string, long = false) {
  const x = parse(d)
  const year = d.slice(0, 4) === today.slice(0, 4) ? '' : `${x.getFullYear()}년 `
  return `${year}${x.getMonth() + 1}월 ${x.getDate()}일 ${WEEK[x.getDay()]}${long ? '요일' : ''}`
}
/** 그 달 달력 칸(일요일 시작, 6주) */
function monthCells(m: string) {
  const first = parse(`${m}-01`)
  const start = addDays(`${m}-01`, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
const timeKo = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })

export function DiaryView({ onOpen }: { onOpen: (taskId: string) => void }) {
  const today = dayKey()
  const [mode, setMode] = useState<'write' | 'review'>('write')
  const [date, setDate] = useState(today)
  const [consent, setConsentState] = useState(getConsent)
  const [memory, setMemoryState] = useState(getMemory)
  const [search, setSearch] = useState<string | null>(null)
  const [narrow, setNarrow] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const { character, progress } = useGrowth()
  const buddy = buddyOf(character ?? undefined)
  const entries = useQuery<DiaryEntry>('SELECT * FROM diary_entries ORDER BY date DESC')
  const byDate = useMemo(() => new Map((entries ?? []).map((e) => [e.date, e])), [entries])
  const writtenDates = useMemo(() => new Set((entries ?? []).filter(isWritten).map((e) => e.date)), [entries])
  const streak = streakOf(writtenDates, today)

  const go = (d: string) => { if (d <= today) { setDate(d); setMode('write'); setSideOpen(false) } }

  // 좁은 창: 왼쪽 목록을 접는다 [임시]
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 760))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ↑↓ 하루 앞뒤, T 오늘, ⌘F 검색(§4)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.desktop-dialog, .popover')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); setMode('write'); setSearch((s) => s ?? ''); setSideOpen(true); return }
      if (mode !== 'write' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,[contenteditable]')) return
      if (e.key === 'ArrowUp') { e.preventDefault(); setDate((d) => addDays(d, -1)) }
      if (e.key === 'ArrowDown') { e.preventDefault(); setDate((d) => (d < today ? addDays(d, 1) : d)) }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setDate(today) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [mode, today])

  const head = (
    <header className="pane-header diary__head">
      <h1 className="pane-header__title diary__title">일기</h1>
      <div className="seg diary__seg" role="tablist" aria-label="일기 보기">
        {(['write', 'review'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => setMode(m)}>{m === 'write' ? '쓰기' : '돌아보기'}</button>
        ))}
      </div>
      {mode === 'write' && <div className="pane-header__actions"><button className="icon-btn" aria-label="일기 검색 (⌘F)" onClick={() => setSearch((s) => (s === null ? '' : null))}><Search /></button></div>}
    </header>
  )

  return (
    <div ref={rootRef} className={`diary${narrow ? ' is-narrow' : ''}`}>
      {mode === 'review' ? (
        <main className="diary__review-pane">
          {head}
          <Review entries={entries ?? []} byDate={byDate} today={today} streak={streak.days} initialMonth={monthOf(date)} onPick={go} />
        </main>
      ) : (
        <>
          {(!narrow || sideOpen) && (
            <aside className="diary__side">
              {head}
              {search !== null && (
                <div className="addbar is-active diary__search">
                  <div className="addbar__line">
                    <Search className="addbar__icon" />
                    <input className="addbar__input" autoFocus placeholder="일기 검색" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setSearch(null) }} />
                    <button className="addbar__tool" aria-label="검색 닫기" onClick={() => setSearch(null)}><X /></button>
                  </div>
                </div>
              )}
              {search === null && <MiniCalendar date={date} today={today} byDate={byDate} onPick={go} />}
              <EntryList entries={entries} date={date} today={today} query={search ?? ''} onPick={go} />
            </aside>
          )}
          {narrow && sideOpen && <div className="diary__scrim" onClick={() => setSideOpen(false)} />}
          {entries === undefined ? <section className="diary__editor" /> : (
            <Editor
              key={date}
              date={date}
              today={today}
              entry={byDate.get(date)}
              empty={!writtenDates.size}
              buddy={buddy}
              stage={progress.stage}
              consent={consent}
              memory={memory}
              streak={streak}
              narrow={narrow}
              onSide={() => setSideOpen(true)}
              onConsent={(on) => { setConsent(on); setConsentState(on) }}
              onMemory={(on) => { setMemory(on); setMemoryState(on) }}
              onOpen={onOpen}
            />
          )}
        </>
      )}
      {consent === null && <ConsentDialog buddy={buddy} stage={progress.stage} onAnswer={(on) => { setConsent(on); setConsentState(on) }} />}
    </div>
  )
}

// ── 왼쪽: 미니 달력(03 날짜 피커 달력) ──
function MiniCalendar({ date, today, byDate, onPick }: { date: string; today: string; byDate: Map<string, DiaryEntry>; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(monthOf(date))
  useEffect(() => setMonth(monthOf(date)), [date])
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
        {WEEK.map((w) => <b key={w}>{w}</b>)}
        {monthCells(month).map((d) => {
          const e = byDate.get(d)
          const mood = moodOf(e?.mood)
          const cls = ['diary-cal__day', monthOf(d) !== month && 'is-other', d === date && 'is-selected', d === today && 'is-today', d > today && 'is-future', e && isWritten(e) && 'has-entry'].filter(Boolean).join(' ')
          return (
            <button key={d} className={cls} disabled={d > today} style={mood ? ({ '--mood': mood.color } as React.CSSProperties) : undefined} onClick={() => onPick(d)} aria-label={`${dateLabel(d, today)}${mood ? ` · ${mood.label}` : ''}`}>
              {parse(d).getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── 왼쪽: 날짜 목록(월 그룹) ──
function EntryList({ entries, date, today, query, onPick }: { entries?: DiaryEntry[]; date: string; today: string; query: string; onPick: (d: string) => void }) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const q = query.trim().toLowerCase()
  const rows = (entries ?? []).filter(isWritten).filter((e) => !q || (e.content ?? '').toLowerCase().includes(q))
  const groups = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>()
    for (const e of rows) map.set(monthOf(e.date), [...(map.get(monthOf(e.date)) ?? []), e])
    return [...map]
  }, [rows])
  if (!entries) return <div className="diary-list" />
  if (!rows.length) return <div className="diary-list"><p className="diary-list__empty">{q ? `"${query}"와 맞는 일기가 없어요` : '아직 쓴 일기가 없어요'}</p></div>
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
                <span className="diary-row__mood">{moodOf(e.mood)?.emoji ?? '📝'}</span>
                <span className="diary-row__main">
                  <span className="diary-row__date">{dateLabel(e.date, today)}{e.date === today ? ' · 오늘' : ''}{e.private ? <Lock className="diary-row__lock" aria-label="나만 보기" /> : null}</span>
                  <span className="diary-row__preview">{firstLine(e.content) || moodOf(e.mood)?.label}</span>
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}

// ── 오른쪽: 편집 ──
type EditorProps = {
  date: string; today: string; entry?: DiaryEntry; empty: boolean; buddy: Buddy; stage: number; consent: boolean | null; memory: boolean
  streak: { days: number; today: boolean }; narrow: boolean; onSide: () => void
  onConsent: (on: boolean) => void; onMemory: (on: boolean) => void; onOpen: (id: string) => void
}
function Editor({ date, today, entry, empty, buddy, stage, consent, memory, streak, narrow, onSide, onConsent, onMemory, onOpen }: EditorProps) {
  const toast = useToast()
  const [content, setContent] = useState(entry?.content ?? '')
  const [savedAt, setSavedAt] = useState<Date | null>(entry ? new Date(entry.modified_at) : null)
  const [shift, setShift] = useState(0)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [solo, setSoloState] = useState(() => isSolo(date))
  const saved = useRef(entry?.content ?? '')
  const latest = useRef(content)
  const dirty = useRef(false)
  const timer = useRef<number>(undefined)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const isPrivate = !!entry?.private
  const name = buddy.name

  const flush = () => {
    window.clearTimeout(timer.current)
    const next = latest.current
    if (next === saved.current) return
    saved.current = next
    dirty.current = true
    void saveEntry(date, { content: next }).then(() => setSavedAt(new Date()))
  }
  const change = (v: string) => {
    setContent(v)
    latest.current = v
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 600) // 02 상세와 같은 0.6초 자동 저장
  }
  // 떠날 때 저장하고, 오늘 쓴 게 있으면 기억하기 요약을 만든다
  useEffect(() => () => {
    flush()
    if (dirty.current) void summarizeEntry(date, AbortSignal.timeout(120_000)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 다른 기기에서 바뀐 글: 지금 고치는 중이 아니면 받아 온다(마지막 저장이 이김)
  useEffect(() => {
    const remote = entry?.content ?? ''
    if (remote === saved.current || latest.current !== saved.current || document.activeElement === textRef.current) return
    saved.current = latest.current = remote
    setContent(remote)
  }, [entry?.content])
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`
  }, [content])

  const pickMood = (v: number) => { void saveEntry(date, { mood: entry?.mood === v ? null : v }).then(() => setSavedAt(new Date())) }
  const usePrompt = (p: string) => {
    const next = `Q. ${p}\n${latest.current}`
    change(next)
    void saveEntry(date, { prompt: p })
    requestAnimationFrame(() => { const el = textRef.current; if (el) { el.focus(); el.setSelectionRange(next.length, next.length) } })
  }
  const togglePrivate = async () => {
    await setPrivate(date, !isPrivate)
    toast.show(isPrivate ? `${josa(name, '와', '과')} 같이 읽어요` : `나만 보기로 바꿨어요. ${josa(name, '는', '은')} 이 날 일기를 읽지 않아요`)
  }
  const toggleSolo = () => { setMenu(false); setSolo(date, !solo); setSoloState(!solo) }
  const talkOn = consent === true && !isPrivate && !solo
  const prompt = promptFor(date, shift)

  return (
    <section className="diary__editor">
      <header className="pane-header diary__ehead">
        {narrow && <button className="icon-btn" aria-label="달력 열기" onClick={onSide}><CalendarDays /></button>}
        <h2 className="diary__etitle">{dateLabel(date, today, true)}</h2>
        <span className="diary__saved">{savedAt ? `${timeKo(savedAt)} · 자동 저장됨` : ''}</span>
        <div className="pane-header__actions">
          <button className={`icon-btn${isPrivate ? ' is-on' : ''}`} aria-pressed={isPrivate} aria-label="나만 보기" title={isPrivate ? '나만 보기 켜짐 — AI가 읽지 않아요' : '나만 보기'} onClick={() => void togglePrivate()}>{isPrivate ? <Lock /> : <LockOpen />}</button>
          <button ref={moreRef} className="icon-btn" aria-label="일기 메뉴" onClick={() => setMenu(true)}><MoreHorizontal /></button>
        </div>
      </header>
      <div className="diary__body">
        {empty && !content && (
          <div className="diary__welcome"><CharacterArt species={buddy.species} stage={stage} size={56} mood="happy" /><span>오늘 하루를 한 줄로 남겨 볼까요?</span></div>
        )}
        <div className="diary-moods" role="radiogroup" aria-label="오늘 기분">
          {MOODS.map((m) => (
            <button key={m.value} role="radio" aria-checked={entry?.mood === m.value} aria-label={m.label} className={entry?.mood === m.value ? 'is-on' : ''} onClick={() => pickMood(m.value)}>{m.emoji}</button>
          ))}
          {entry?.mood ? <em>{moodOf(entry.mood)?.label}</em> : null}
        </div>
        {!content.trim() && (
          <div className="diary-prompt">
            <Sparkles />
            <button className="diary-prompt__text" onClick={() => usePrompt(prompt)} title="눌러서 일기에 넣기">{prompt}</button>
            <button className="diary-prompt__next" onClick={() => setShift((s) => s + 1)}>다른 질문</button>
          </div>
        )}
        <textarea
          ref={textRef}
          className="diary__text"
          aria-label="일기"
          placeholder="오늘 하루는 어땠나요?"
          value={content}
          onChange={(e) => change(e.target.value)}
          onBlur={flush}
        />
        {consent === true ? <DoneStrip date={date} today={today} onOpen={onOpen} /> : <DoneCard date={date} today={today} buddy={buddy} stage={stage} onOpen={onOpen} />}
        {talkOn && <Talk date={date} content={content} buddy={buddy} stage={stage} memory={memory} onActivity={() => { dirty.current = true }} />}
      </div>
      <footer className="diary__foot">
        <span>{streak.days ? `🔥 ${streak.days}일 연속 기록${streak.today ? '' : ' · 오늘도 이어 가요'}` : '오늘부터 기록을 이어 가요'}</span>
        <span className="diary__foot-sp" />
        <span>
          {consent !== true ? '일기는 나만 봐요'
            : isPrivate ? '🔒 나만 보기 — AI가 읽지 않아요'
              : `${name}만 같이 읽어요 · 🔒 나만 보기로 바꾸면 AI가 읽지 않아요`}
        </span>
      </footer>
      {menu && (
        <Popover anchor={moreRef.current} align="end" width={230} onClose={() => setMenu(false)} className="menu">
          {consent === true && !isPrivate && (
            <MenuItem icon={solo ? <MessageCircle /> : <MessageCircleOff />} label={solo ? `${josa(name, '와', '과')} 이야기하기` : '오늘은 혼자 쓸게'} onClick={toggleSolo} />
          )}
          {consent === true && <MenuItem icon={<Sparkles />} label={memory ? '기억하기 끄기' : '기억하기 켜기 (최근 7일 요약)'} onClick={() => { setMenu(false); onMemory(!memory); toast.show(memory ? '그날 일기만 같이 읽어요' : '최근 7일 일기의 짧은 요약을 같이 봐요') }} />}
          <MenuItem icon={consent === true ? <MessageCircleOff /> : <MessageCircle />} label={consent === true ? `${josa(name, '와', '과')} 나누기 끄기` : `${josa(name, '와', '과')} 일기 나누기`} onClick={() => { setMenu(false); onConsent(consent !== true) }} />
          <div className="menu__divider" />
          <MenuItem icon={<Download />} label="텍스트로 내보내기 (준비 중)" disabled onClick={() => {}} />
          <MenuItem icon={<Trash2 />} label="이 날 일기 지우기" danger disabled={!entry} onClick={() => { setMenu(false); setConfirm(true) }} />
        </Popover>
      )}
      {confirm && (
        <Dialog label="일기 지우기" className="diary-dialog" onClose={() => setConfirm(false)}>
          <h2>이 날 일기를 지울까요?</h2>
          <p>{dateLabel(date, today)}의 일기와 {josa(name, '와', '과')} 나눈 이야기가 모두 지워져요. 되돌릴 수 없어요.</p>
          <div className="diary-dialog__actions">
            <button onClick={() => setConfirm(false)}>취소</button>
            <button className="is-danger" data-autofocus onClick={() => {
              setConfirm(false)
              window.clearTimeout(timer.current)
              saved.current = latest.current = ''
              setContent(''); setSavedAt(null); dirty.current = false
              void deleteEntry(date).then(() => toast.show('일기를 지웠어요'))
            }}>지우기</button>
          </div>
        </Dialog>
      )}
    </section>
  )
}

// ── 오늘 한 일(자동, 저장하지 않음) ──
function useDone(date: string) {
  const range = useMemo(() => dayRange(date), [date])
  const done = useQuery<{ id: string; title: string }>(DONE_SQL, range)
  const xp = useQuery<{ xp: number }>(XP_SQL, [date])?.[0]?.xp ?? 0
  return { done, xp }
}
function DoneList({ done, onOpen }: { done: { id: string; title: string }[]; onOpen: (id: string) => void }) {
  return (
    <ul className="diary-done">
      {done.map((t) => <li key={t.id}><button onClick={() => onOpen(t.id)}><Check />{t.title || '제목 없음'}</button></li>)}
    </ul>
  )
}
function DoneStrip({ date, today, onOpen }: { date: string; today: string; onOpen: (id: string) => void }) {
  const { done, xp } = useDone(date)
  const [open, setOpen] = useState(false)
  if (!done) return null
  const word = date === today ? '오늘' : '이 날'
  return (
    <div className="diary-strip-wrap">
      <button className="diary-strip" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={!done.length}>
        <Check />
        {done.length ? `${word} 한 일 ${done.length}개` : date === today ? '오늘 끝낸 할 일이 아직 없어요' : '이 날 끝낸 할 일이 없어요'}
        {xp > 0 && <span className="diary-xp">+{xp} XP</span>}
        <span className="diary-strip__sp" />
        {done.length > 0 && <span className="diary-strip__more">{open ? '접기' : '할 일 보기'}</span>}
      </button>
      {open && <DoneList done={done} onOpen={onOpen} />}
    </div>
  )
}
/** AI를 꺼 둔 사람에게: 캐릭터 + 미리 준비한 한마디(v0.1 카드) */
function DoneCard({ date, today, buddy, stage, onOpen }: { date: string; today: string; buddy: Buddy; stage: number; onOpen: (id: string) => void }) {
  const { done, xp } = useDone(date)
  if (!done) return null
  const n = done.length
  const line = n === 0 ? '쉬어 가는 날도 필요해!' : n < 3 ? '조금씩이라도 해냈네. 잘했어!' : n < 6 ? '오늘 꽤 많이 해냈다!' : '와, 대단한 하루였어!'
  return (
    <div className="diary-card">
      <div className="diary-card__char"><CharacterArt species={buddy.species} stage={stage} size={56} mood="happy" /><span className="diary-card__bubble">{line}</span></div>
      <div className="diary-card__body">
        <h4><Check />{date === today ? '오늘' : '이 날'} 한 일 {n}개{xp > 0 && <span className="diary-xp">+{xp} XP</span>}</h4>
        {n > 0 ? <DoneList done={done.slice(0, 6)} onOpen={onOpen} /> : <p className="diary-card__none">끝낸 할 일이 없어요</p>}
        {n > 6 && <p className="diary-card__none">외 {n - 6}개</p>}
      </div>
    </div>
  )
}

// ── 캐릭터와 이야기(§3.1) ──
const chipsMade = new Set<string>()
let noticeShown: boolean | undefined
function Talk({ date, content, buddy, stage, memory, onActivity }: { date: string; content: string; buddy: Buddy; stage: number; memory: boolean; onActivity: () => void }) {
  const toast = useToast()
  const messages = useQuery<DiaryMessage>('SELECT * FROM diary_messages WHERE entry_id = ? ORDER BY created_at, id', [`diary-${date}`])
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<'down' | 'fail' | null>(null)
  const [draft, setDraft] = useState('')
  const [, bump] = useState(0)
  const [notice] = useState(() => (noticeShown ??= takeNotice()))
  const ctrl = useRef<AbortController>(undefined)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const busy = pending !== null
  const name = buddy.name

  const ask = async (fn: (signal: AbortSignal) => Promise<unknown>) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setError(null); setPending('')
    onActivity()
    try { await fn(c.signal) } catch (e) {
      if (!c.signal.aborted) setError(isUnavailable(e) ? 'down' : 'fail')
    } finally { if (ctrl.current === c) setPending(null) }
  }
  const opts = (signal: AbortSignal) => ({ buddy, memoryOn: memory, signal, onDelta: (t: string) => setPending(t) })
  useEffect(() => () => ctrl.current?.abort(), [])

  // 첫 답: 저장(0.6초) 뒤 3초 동안 더 쓰지 않으면 캐릭터가 먼저 한 번
  useEffect(() => {
    if (!messages || messages.length || busy || error || content.trim().length < 10) return
    const t = window.setTimeout(() => void ask((s) => buddyReply(date, opts(s))), 3600)
    return () => window.clearTimeout(t)
  }, [content, messages?.length, busy, error]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages?.length, pending])

  const send = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void ask((s) => sendMessage(date, text, opts(s)))
  }
  const makeTask = async (m: DiaryMessage, title: string) => {
    try { await taskFromChip(title); chipsMade.add(m.id); bump((n) => n + 1); toast.show(`"${title}" 할 일을 기본함에 넣었어요`) } catch { toast.show('할 일을 만들지 못했어요. 다시 시도해 주세요.') }
  }
  if (!messages) return null
  if (!messages.length && !busy && !error && content.trim().length < 10) return null // 일기를 쓰면 대화가 열린다

  return (
    <div className="diary-talk">
      <div className="diary-talk__div">{josa(name, '와', '과')} 이야기</div>
      <div className="diary-talk__list" aria-live="polite">
        {messages.map((m) => {
          if (m.role === 'me') return <div key={m.id} className="diary-msg diary-msg--me">{m.content}</div>
          if (m.safety) return <CrisisCard key={m.id} />
          const p = parseBuddyReply(m.content)
          return (
            <div key={m.id} className="diary-msg diary-msg--buddy">
              <CharacterArt species={buddy.species} stage={stage} size={30} mood="happy" />
              <div className="diary-msg__bubble">
                {p.text}
                {p.task && (chipsMade.has(m.id)
                  ? <span className="diary-chip is-done"><Check />할 일에 넣었어요</span>
                  : <button className="diary-chip" onClick={() => void makeTask(m, p.task!)}><Plus />할 일로: {p.task}</button>)}
              </div>
            </div>
          )
        })}
        {busy && (
          <div className="diary-msg diary-msg--buddy">
            <CharacterArt species={buddy.species} stage={stage} size={30} />
            <div className="diary-msg__bubble">{pending || <span className="diary-typing"><i /><i /><i /></span>}</div>
          </div>
        )}
        {error && (
          <div className="diary-talk__error" role="status">
            {error === 'down' ? `지금은 ${josa(name, '가', '이')} 쉬고 있어요. 일기는 그대로 저장돼요` : '답을 받지 못했어요.'}
            <button onClick={() => void ask((s) => buddyReply(date, opts(s)))}>다시 시도</button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="diary-talk__in">
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={`${name}에게 이야기하기…`}
          aria-label={`${name}에게 이야기하기`}
          onChange={(e) => { setDraft(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 96)}px` }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
        />
        {busy
          ? <button className="diary-talk__send" aria-label="멈추기" onClick={() => { ctrl.current?.abort(); setPending(null) }}><X /></button>
          : <button className="diary-talk__send" aria-label="보내기" disabled={!draft.trim()} onClick={send}><ArrowUp /></button>}
      </div>
      {notice && <p className="diary-talk__notice">{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요</p>}
    </div>
  )
}

function CrisisCard() {
  return (
    <div className="diary-crisis" role="alert">
      <strong>{CRISIS_CARD.title}</strong>
      <ul>
        {CRISIS_CARD.lines.map((l) => (
          <li key={l.number}><Phone /><span>{l.label}</span><b>{l.number}</b><em>{l.note}</em></li>
        ))}
      </ul>
      <p>{CRISIS_CARD.footer}</p>
    </div>
  )
}

// ── 처음 한 번 묻는 동의 ──
function ConsentDialog({ buddy, stage, onAnswer }: { buddy: Buddy; stage: number; onAnswer: (on: boolean) => void }) {
  const name = buddy.name
  return (
    <Dialog label="일기 나누기" className="diary-dialog diary-consent" onClose={() => onAnswer(false)}>
      <div className="diary-consent__art"><CharacterArt species={buddy.species} stage={stage} size={72} mood="happy" /></div>
      <h2>일기를 {josa(name, '와', '과')} 나눌까요?</h2>
      <p>일기 글이 sprout AI(운영자의 Mac mini)에서 처리돼요. {josa(name, '가', '이')} 읽고 공감하며 이야기를 들어 줘요. 언제든 끌 수 있어요.</p>
      <p className="diary-consent__small">🔒 나만 보기로 둔 날은 보내지 않아요. {josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요.</p>
      <div className="diary-dialog__actions">
        <button onClick={() => onAnswer(false)}>혼자 쓸게요</button>
        <button className="is-primary" data-autofocus onClick={() => onAnswer(true)}>나누기</button>
      </div>
    </Dialog>
  )
}

// ── 돌아보기(⑤-b) ──
function Review({ entries, byDate, today, streak, initialMonth, onPick }: { entries: DiaryEntry[]; byDate: Map<string, DiaryEntry>; today: string; streak: number; initialMonth: string; onPick: (d: string) => void }) {
  const [scale, setScale] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(initialMonth)
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
  const inMonth = entries.filter((e) => monthOf(e.date) === month && isWritten(e))
  const counts = MOODS.map((m) => ({ m, n: inMonth.filter((e) => e.mood === m.value).length })).filter((x) => x.n)
  const total = counts.reduce((s, x) => s + x.n, 0)
  const m0 = parse(`${month}-01`)
  const nav = (n: number) => setMonth(scale === 'month' ? shiftMonth(month, n) : `${Number(year) + n}-${month.slice(5)}`)
  const canNext = scale === 'month' ? month < monthOf(today) : year < today.slice(0, 4)

  return (
    <div className="diary-review">
      <div className="diary-review__bar">
        <div className="seg" role="tablist" aria-label="돌아보기 단위">
          <button role="tab" aria-selected={scale === 'month'} className={scale === 'month' ? 'is-on' : ''} onClick={() => setScale('month')}>월</button>
          <button role="tab" aria-selected={scale === 'year'} className={scale === 'year' ? 'is-on' : ''} onClick={() => setScale('year')}>연</button>
        </div>
        <button className="icon-btn" aria-label="이전" onClick={() => nav(-1)}><ChevronLeft /></button>
        <span className="diary-review__label">{scale === 'month' ? `${m0.getFullYear()}년 ${m0.getMonth() + 1}월` : `${year}년`}</span>
        <button className="icon-btn" aria-label="다음" disabled={!canNext} onClick={() => nav(1)}><ChevronRight /></button>
      </div>
      {scale === 'year' ? (
        <div className="diary-year">
          {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((m) => (
            <button key={m} className="diary-year__month" onClick={() => { setMonth(m); setScale('month') }} disabled={m > monthOf(today)}>
              <span>{Number(m.slice(5))}월</span>
              <span className="diary-year__grid">
                {monthCells(m).map((d) => {
                  const mood = monthOf(d) === m ? moodOf(byDate.get(d)?.mood) : undefined
                  return <i key={d} className={monthOf(d) !== m ? 'is-blank' : ''} style={mood ? { background: mood.color } : undefined} />
                })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="diary-review__wrap">
          <div className="diary-review__grid">
            {WEEK.map((w) => <b key={w}>{w}</b>)}
            {monthCells(month).filter((d, i) => monthOf(d) === month || (i < 7 && d < `${month}-01`)).map((d) => {
              if (monthOf(d) !== month) return <i key={d} className="is-blank" />
              const e = byDate.get(d)
              const mood = moodOf(e?.mood)
              return (
                <button key={d} className={`${d === today ? 'is-today' : ''}${d > today ? ' is-future' : ''}`} disabled={d > today} onClick={() => onPick(d)} aria-label={`${dateLabel(d, today)}${mood ? ` · ${mood.label}` : e && isWritten(e) ? ' · 일기 있음' : ''}`}>
                  <em>{mood?.emoji ?? (e && isWritten(e) ? '📝' : '')}</em>{parse(d).getDate()}
                </button>
              )
            })}
          </div>
          <div className="diary-review__stats">
            <div className="diary-stat"><strong>{inMonth.length}일</strong><span>이번 달 기록{streak ? ` · 🔥 ${streak}일 연속` : ''}</span></div>
            <div className="diary-stat">
              <span>이번 달 기분</span>
              {total ? (
                <>
                  <div className="diary-stat__bar">{counts.map(({ m, n }) => <i key={m.value} style={{ width: `${(n / total) * 100}%`, background: m.color }} />)}</div>
                  <div className="diary-stat__legend">{counts.map(({ m, n }) => <span key={m.value}>{m.emoji} {n}</span>)}</div>
                </>
              ) : <p className="diary-stat__none">아직 고른 기분이 없어요</p>}
            </div>
            <div className="diary-stat"><strong className="diary-stat__title">한 줄 발견</strong><span>{insightOf(inMonth, doneByDay)}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}
