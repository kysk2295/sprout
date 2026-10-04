import { CalendarDays, Check, Download, Lock, LockOpen, MessageCircle, MessageCircleOff, MoreHorizontal, Search, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays } from '@sprout/schema/time'
import { useQuery } from '../../data/useQuery'
import { readMotionPref, useGrowth } from '../../data/growth'
import {
  buddyLine, buddyOf, dayRange, deleteEntry, DONE_SQL, getConsent, getMemory, isSolo, isWritten, josa, MOODS, moodFaceOf, moodOf, promptFor,
  saveEntry, setConsent, setMemory, setPrivate, setSolo, skyOf, streakOf, summarizeEntry, XP_SQL, type Buddy, type DiaryEntry
} from '../../data/diary'
import { dayKey } from '../../lib/dates'
import { CharacterArt } from '../growth/CharacterArt'
import { Dialog } from '../Dialog'
import { MenuItem, Popover } from '../Popover'
import { useToast } from '../Toast'
import { Companion, type CompanionMode, type Cue } from './Companion'
import { dateLabel, dayName, hhmm, monthOf, parse, timeKo } from './dates'
import { MoodFace, SkyIcon } from './MoodFace'
import { Review } from './Review'
import { EntryList, MiniCalendar, StreakCard } from './Side'
import './diary.css'

// 15 일기 v1 디자인(§9) — 왼쪽 260(이어 쓰기·미니 달력·목록) · 가운데 종이 페이지 · 오른쪽 곁자리 320(캐릭터와 이야기)
// 동작·데이터·안전 규칙은 §3~§8 그대로. 폭 1180 미만이면 곁자리가 페이지 아래로, 760 미만이면 왼쪽이 접힌다.

/** 움직임 줄이기 = OS 설정 또는 성장 화면의 스위치(읽기만, 10 §3.2.11) */
function useReducedMotion() {
  const query = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || readMotionPref()
  const [reduced, setReduced] = useState(query)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(query())
    mq?.addEventListener('change', on)
    window.addEventListener('storage', on)
    window.addEventListener('focus', on)
    return () => { mq?.removeEventListener('change', on); window.removeEventListener('storage', on); window.removeEventListener('focus', on) }
  }, [])
  return reduced
}

/** 다른 대화 상자(성향 조사·첫 실행 안내·레벨업 등)가 열려 있는지 — 동의 창은 그게 닫힌 뒤에 연다(§9.7) */
const OTHER_DIALOG = '[role="dialog"]:not(.diary-dialog), .modal-scrim, .onb-scrim'
function useOtherDialogOpen() {
  const [open, setOpen] = useState(true) // 처음엔 막아 두고 잠깐 뒤에 본다(다른 창이 같은 순간 열리는 경우)
  useEffect(() => {
    const check = () => setOpen(!!document.querySelector(OTHER_DIALOG))
    const t = window.setTimeout(check, 600)
    const mo = new MutationObserver(() => window.setTimeout(check, 50))
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { window.clearTimeout(t); mo.disconnect() }
  }, [])
  return open
}

export function DiaryView({ onOpen }: { onOpen: (taskId: string) => void }) {
  const today = dayKey()
  const [mode, setMode] = useState<'write' | 'review'>('write')
  const [date, setDate] = useState(today)
  const [consent, setConsentState] = useState(getConsent)
  const [memory, setMemoryState] = useState(getMemory)
  const [search, setSearch] = useState<string | null>(null)
  const [width, setWidth] = useState(1400)
  const [sideOpen, setSideOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const prevDate = useRef(date)
  const { character, progress } = useGrowth()
  const buddy = buddyOf(character ?? undefined)
  const reduced = useReducedMotion()
  const otherDialog = useOtherDialogOpen()
  const entries = useQuery<DiaryEntry>('SELECT * FROM diary_entries ORDER BY date DESC')
  const byDate = useMemo(() => new Map((entries ?? []).map((e) => [e.date, e])), [entries])
  const writtenDates = useMemo(() => new Set((entries ?? []).filter(isWritten).map((e) => e.date)), [entries])
  const streak = streakOf(writtenDates, today)
  const narrow = width < 760
  const wide = width >= 1180
  // 페이지 넘김 방향: 지난날 = 오른쪽에서, 앞날 = 왼쪽에서
  const from = date < prevDate.current ? '8px' : date > prevDate.current ? '-8px' : '0px'
  useEffect(() => { prevDate.current = date }, [date])

  const go = (d: string) => { if (d <= today) { setDate(d); setMode('write'); setSideOpen(false) } }

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
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
    <div ref={rootRef} className={`diary${narrow ? ' is-narrow' : ''}${wide ? ' is-wide' : ''}${reduced ? ' is-reduced' : ''}`}>
      {mode === 'review' ? (
        <main className="diary__review-pane">
          {head}
          <Review entries={entries ?? []} byDate={byDate} today={today} streak={streak.days} initialMonth={monthOf(date)} buddy={buddy} stage={progress.stage} onPick={go} />
        </main>
      ) : (
        <>
          <aside className={`diary__side${narrow ? (sideOpen ? ' is-open' : ' is-closed') : ''}`} aria-hidden={narrow && !sideOpen ? true : undefined}>
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
            {search === null && <StreakCard streak={streak} byDate={byDate} today={today} />}
            {search === null && <MiniCalendar date={date} today={today} byDate={byDate} onPick={go} />}
            <EntryList entries={entries} date={date} today={today} query={search ?? ''} onPick={go} />
          </aside>
          {narrow && sideOpen && <div className="diary__scrim" onClick={() => setSideOpen(false)} />}
          {entries === undefined ? <section className="diary__editor"><div className="diary__desk"><div className="diary-page is-loading"><div className="diary-page__sky diary-sky--day" /><div className="diary-page__body"><i /><i /><i /></div></div></div></section> : (
            <Editor
              key={date}
              date={date}
              today={today}
              entry={byDate.get(date)}
              first={!writtenDates.size}
              buddy={buddy}
              stage={progress.stage}
              consent={consent}
              memory={memory}
              narrow={narrow}
              wide={wide}
              reduced={reduced}
              from={from}
              onSide={() => setSideOpen(true)}
              onConsent={(on) => { setConsent(on); setConsentState(on) }}
              onMemory={(on) => { setMemory(on); setMemoryState(on) }}
              onOpen={onOpen}
            />
          )}
        </>
      )}
      {consent === null && !otherDialog && <ConsentDialog buddy={buddy} stage={progress.stage} onAnswer={(on) => { setConsent(on); setConsentState(on) }} />}
    </div>
  )
}

// ── 가운데 종이 페이지 + 곁자리 ──
type EditorProps = {
  date: string; today: string; entry?: DiaryEntry; first: boolean; buddy: Buddy; stage: number; consent: boolean | null; memory: boolean
  narrow: boolean; wide: boolean; reduced: boolean; from: string; onSide: () => void
  onConsent: (on: boolean) => void; onMemory: (on: boolean) => void; onOpen: (id: string) => void
}
function Editor({ date, today, entry, first, buddy, stage, consent, memory, narrow, wide, reduced, from, onSide, onConsent, onMemory, onOpen }: EditorProps) {
  const toast = useToast()
  const [content, setContent] = useState(entry?.content ?? '')
  const [savedAt, setSavedAt] = useState<Date | null>(entry ? new Date(entry.modified_at) : null)
  const [shift, setShift] = useState(0)
  const [flip, setFlip] = useState(0)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [solo, setSoloState] = useState(() => isSolo(date))
  const [cue, setCue] = useState<Cue>()
  const [typing, setTyping] = useState(false)
  const [pop, setPop] = useState<number>()
  const saved = useRef(entry?.content ?? '')
  const latest = useRef(content)
  const dirty = useRef(false)
  const timer = useRef<number>(undefined)
  const typingTimer = useRef<number>(undefined)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const isPrivate = !!entry?.private
  const isToday = date === today
  const name = buddy.name
  const cueId = useRef(0)
  const react = (c: Omit<Cue, 'id'>) => setCue({ ...c, id: ++cueId.current })

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
    setTyping(true)
    window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => setTyping(false), 2500)
  }
  // 떠날 때 저장하고, 오늘 쓴 게 있으면 기억하기 요약을 만든다
  useEffect(() => () => {
    flush()
    window.clearTimeout(typingTimer.current)
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
    el.style.height = `${Math.max(el.scrollHeight, 168)}px`
  }, [content])
  // 빈 일기장을 처음 열면 캐릭터가 먼저
  useEffect(() => { if (first && isToday) { const t = window.setTimeout(() => react({ line: buddyLine({ kind: 'first' }) }), 700); return () => window.clearTimeout(t) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pickMood = (v: number) => {
    const next = entry?.mood === v ? null : v
    void saveEntry(date, { mood: next }).then(() => setSavedAt(new Date()))
    if (next) {
      setPop(v)
      if (!isPrivate) react({ line: buddyLine({ kind: 'mood', mood: v }), face: moodFaceOf(v), hop: v >= 4, heart: v <= 2 })
    }
  }
  const moodKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const n = Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))
    e.preventDefault()
    items[n]?.focus()
  }
  const usePrompt = (p: string) => {
    const next = `Q. ${p}\n${latest.current}`
    change(next)
    void saveEntry(date, { prompt: p })
    requestAnimationFrame(() => { const el = textRef.current; if (el) { el.focus(); el.setSelectionRange(next.length, next.length) } })
  }
  const togglePrivate = async () => {
    await setPrivate(date, !isPrivate)
    toast.show(isPrivate ? `${josa(name, '와', '과')} 같이 읽어요` : `나만 보기로 바꿨어요. ${josa(name, '는', '은')} 이 날 일기를 읽지 않아요`)
    if (!isPrivate) react({ line: buddyLine({ kind: 'private' }) })
  }
  const toggleSolo = () => {
    setMenu(false); setSolo(date, !solo); setSoloState(!solo)
    if (!solo) react({ line: buddyLine({ kind: 'solo' }) })
  }
  const prompt = promptFor(date, shift)
  const mood = moodOf(entry?.mood)
  const sky = isToday ? skyOf(new Date().getHours()) : null
  const companionMode: CompanionMode = consent !== true ? 'consent' : isPrivate ? 'private' : solo ? 'solo' : 'talk'
  const { done, xp } = useDone(date)
  const n = done?.length ?? 0
  const doneLine = n === 0 ? '쉬어 가는 날도 필요해!' : n < 3 ? '조금씩이라도 해냈네. 잘했어!' : n < 6 ? '오늘 꽤 많이 해냈다!' : '와, 대단한 하루였어!'
  const x = parse(date)

  const companion = (
    <Companion
      date={date} content={content} buddy={buddy} stage={stage} memory={memory} mode={companionMode} inline={!wide}
      reduced={reduced} typing={typing} cue={cue} doneLine={doneLine}
      onActivity={() => { dirty.current = true }}
      onConsent={() => onConsent(true)}
      onPrivateOff={() => void togglePrivate()}
      onSoloOff={toggleSolo}
    />
  )

  return (
    <section className="diary__editor">
      <header className="pane-header diary__ehead">
        {narrow && <button className="icon-btn" aria-label="달력 열기" onClick={onSide}><CalendarDays /></button>}
        {narrow && <h2 className="diary__etitle">일기</h2>}
        <div className="pane-header__actions">
          <button ref={moreRef} className="icon-btn" aria-label="일기 메뉴" onClick={() => setMenu(true)}><MoreHorizontal /></button>
        </div>
      </header>
      <div className="diary__cols">
        <div className="diary__desk">
          <article className="diary-page" style={{ '--from': from } as React.CSSProperties} aria-label={`${dateLabel(date, today, true)} 일기`}>
            <div className={`diary-page__sky ${sky ? `diary-sky--${sky}` : mood ? 'diary-sky--mood' : 'diary-sky--day is-past'}`} style={mood && !sky ? ({ '--mood': mood.color } as React.CSSProperties) : undefined}>
              {sky && <span className="diary-page__sun"><SkyIcon sky={sky} /></span>}
            </div>
            <button
              className={`diary-mark${isPrivate ? ' is-on' : ''}`}
              aria-pressed={isPrivate}
              aria-label="나만 보기"
              title={isPrivate ? '나만 보기 켜짐 — AI가 읽지 않아요' : '나만 보기'}
              onClick={() => void togglePrivate()}
            >{isPrivate ? <Lock /> : <LockOpen />}</button>
            <div className="diary-page__head">
              <span className="diary-page__num">{x.getDate()}</span>
              <span className="diary-page__md">
                <b>{date.slice(0, 4) === today.slice(0, 4) ? '' : `${x.getFullYear()}년 `}{x.getMonth() + 1}월 · {dayName(date)}요일{isToday && <span className="diary-page__today">오늘</span>}</b>
              </span>
              <span className="diary-page__saved" key={savedAt?.getTime() ?? 0}>{savedAt && <><Check />{timeKo(savedAt)} · 저장됨</>}</span>
            </div>
            <div className="diary-page__body">
              <div className="diary-lab">{isToday ? '오늘' : '이 날'} 기분</div>
              <div className="diary-moods" role="radiogroup" aria-label={`${isToday ? '오늘' : '이 날'} 기분`} onKeyDown={moodKeys}>
                {MOODS.map((m) => {
                  const on = entry?.mood === m.value
                  return (
                    <button key={m.value} role="radio" aria-checked={on} aria-label={m.label} tabIndex={on || (!entry?.mood && m.value === 1) ? 0 : -1}
                      className={`diary-mood${on ? ' is-on' : ''}${on && pop === m.value ? ' is-pop' : ''}`} style={{ '--mood': m.color } as React.CSSProperties} onClick={() => pickMood(m.value)}>
                      <span className="diary-mood__ring"><MoodFace mood={m.value} /></span>
                      <small>{m.label}</small>
                    </button>
                  )
                })}
              </div>
              {!content.trim() && (
                <div className={`diary-note${flip ? ' is-flip' : ''}`} key={flip}>
                  <div className="diary-note__head"><CharacterArt species={buddy.species} stage={stage} size={18} mood="smile" />오늘의 질문</div>
                  <div className="diary-note__q">{prompt}</div>
                  <div className="diary-note__acts">
                    <button onClick={() => usePrompt(prompt)}>이 질문으로 쓰기</button>
                    <button onClick={() => { setShift((s) => s + 1); setFlip((f) => f + 1) }}>다른 질문 ↻</button>
                  </div>
                </div>
              )}
              <textarea
                ref={textRef}
                className="diary__text"
                aria-label="일기"
                placeholder={isToday ? '오늘 하루는 어땠나요?' : '이 날은 비어 있어요. 지금 써도 돼요'}
                value={content}
                onChange={(e) => change(e.target.value)}
                onBlur={flush}
              />
              <DoneTimeline date={date} today={today} done={done} xp={xp} onOpen={onOpen} />
            </div>
          </article>
          {!wide && companion}
        </div>
        {wide && companion}
      </div>
      <footer className="diary__foot">
        <span className="diary__foot-say">
          {consent !== true ? '일기는 나만 봐요'
            : isPrivate ? '🔒 나만 보기 — AI가 읽지 않아요'
              : `${name}만 같이 읽어요`}
        </span>
        <span className="diary__foot-sp" />
        <button className="diary__foot-btn" onClick={() => void togglePrivate()}>{isPrivate ? <><Lock />나만 보기 끄기</> : <><LockOpen />나만 보기 켜기</>}</button>
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

// ── 오늘 한 일(자동, 저장하지 않음) — 세로 타임라인(§9.5) ──
type Done = { id: string; title: string; completed_at: string }
function useDone(date: string) {
  const range = useMemo(() => dayRange(date), [date])
  const done = useQuery<Done>(DONE_SQL, range)
  const xp = useQuery<{ xp: number }>(XP_SQL, [date])?.[0]?.xp ?? 0
  return { done, xp }
}
function DoneTimeline({ date, today, done, xp, onOpen }: { date: string; today: string; done?: Done[]; xp: number; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!done) return <div className="diary-done" />
  const word = date === today ? '오늘' : '이 날'
  const shown = open ? done : done.slice(0, 3)
  return (
    <div className="diary-done">
      <div className="diary-lab">
        {word} 한 일{done.length ? ` ${done.length}개` : ''}
        {xp > 0 && <span className="diary-xp">+{xp} XP</span>}
        {done.length > 3 && <button className="diary-done__more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? '접기' : '할 일 보기'}</button>}
      </div>
      {done.length ? (
        <ul className="diary-tl">
          {shown.map((t) => <li key={t.id}><time>{hhmm(t.completed_at)}</time><i /><button onClick={() => onOpen(t.id)}>{t.title || '제목 없음'}</button></li>)}
          {!open && done.length > 3 && <li className="is-more"><time /><i /><button onClick={() => setOpen(true)}>＋ {done.length - 3}개 더</button></li>}
        </ul>
      ) : <p className="diary-none">{date === today ? '오늘 끝낸 할 일이 아직 없어요' : '이 날 끝낸 할 일이 없어요'}</p>}
    </div>
  )
}

// ── 처음 한 번 묻는 동의(§3.1 문구·동작 그대로, 모양 §9.7) ──
function ConsentDialog({ buddy, stage, onAnswer }: { buddy: Buddy; stage: number; onAnswer: (on: boolean) => void }) {
  const name = buddy.name
  return (
    <Dialog label="일기 나누기" className="diary-dialog diary-consent" onClose={() => onAnswer(false)}>
      <div className="diary-consent__art" aria-hidden="true">
        <svg width="220" height="100" viewBox="0 0 220 100">
          <ellipse cx="110" cy="92" rx="100" ry="8" fill="rgba(0,0,0,.06)" />
          <path d="M30 84 L104 76 L104 26 L30 34Z" fill="var(--diary-paper)" stroke="var(--color-text-quaternary)" strokeWidth="1.5" />
          <path d="M104 76 L178 84 L178 34 L104 26Z" fill="var(--diary-paper)" stroke="var(--color-text-quaternary)" strokeWidth="1.5" />
          <path d="M42 46l50-6M42 56l50-6M42 66l36-4M116 40l50 6M116 50l50 6" stroke="var(--color-text-quaternary)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M150 32 l0 22 l5 -4 l5 4 l0 -22" fill="var(--color-accent)" />
        </svg>
        <span className="diary-consent__char"><CharacterArt species={buddy.species} stage={stage} size={62} mood="happy" /></span>
      </div>
      <h2>일기를 {josa(name, '와', '과')} 나눌까요?</h2>
      <div className="diary-consent__facts">
        <div><CloudIcon /><span>일기 글이 sprout AI(운영자의 Mac mini)에서 처리돼요. {josa(name, '가', '이')} 읽고 공감하며 이야기를 들어 줘요.</span></div>
        <div><Lock /><span>나만 보기로 둔 날은 보내지 않아요.</span></div>
        <div><Undo2 /><span>언제든 ⋯ 메뉴에서 끌 수 있어요.</span></div>
      </div>
      <p className="diary-consent__small">{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요.</p>
      <div className="diary-dialog__actions">
        <button onClick={() => onAnswer(false)}>혼자 쓸게요</button>
        <button className="is-primary" data-autofocus onClick={() => onAnswer(true)}>나누기</button>
      </div>
    </Dialog>
  )
}
function CloudIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" /></svg>
}
