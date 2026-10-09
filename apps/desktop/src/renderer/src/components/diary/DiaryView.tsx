import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, Lock, LockOpen, MessageCircle, MessageCircleOff, MoreHorizontal, PenLine, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays } from '@sprout/schema/time'
import { useQuery } from '../../data/useQuery'
import { readMotionPref, useGrowth } from '../../data/growth'
import {
  buddyOf, clearScripted, deleteEntry, getConsent, getMemory, getWriteMode, isSolo, isWritten, josa, saveEntry, setConsent, setMemory, setPrivate, setSolo,
  setWriteMode, summarizeEntry, type DiaryEntry, type WriteMode
} from '../../data/diary'
import { SCRIPTED } from '@sprout/schema/diaryTalk'
import { dayKey } from '../../lib/dates'
import { Dialog } from '../Dialog'
import { MenuItem, Popover } from '../Popover'
import { useToast } from '../Toast'
import { GuideButton, GuideLayer, useGuide } from '../guide/Guide'
import { dateLabel, monthOf, timeKo } from './dates'
import { DayPanel, DoneList, SectionsPreview } from './DayPanel'
import { FreeWrite } from './FreeWrite'
import { MoodCalendar } from './MoodCalendar'
import { EntryList, MiniCalendar } from './Side'
import { Dock, Talk, useTalk, type FullBuddy } from './Talk'
import './diary.css'

// 15 §10 일기 v2 — 왼쪽 260(미니 달력·목록) · 가운데 캐릭터와 이야기(또는 그냥 쓰기) · 오른쪽 340 `오늘 일기`(저장한 편 + 지금 쓰는 편 / 초안).
// 흐름·말·데이터는 휴대폰 28 §8.10과 같다(packages/schema diaryTalk). 1180 미만이면 오른쪽 열 대신 대화 안 카드, 760 미만이면 왼쪽이 접힌다.

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

export function DiaryView({ onOpen }: { onOpen: (taskId: string) => void }) {
  const today = dayKey()
  const [mode, setMode] = useState<'write' | 'calendar'>('write')
  const [date, setDate] = useState(today)
  const [consent, setConsentState] = useState(getConsent)
  const [memory, setMemoryState] = useState(getMemory)
  const [writeMode, setWriteModeState] = useState<WriteMode>(getWriteMode)
  const [prefill, setPrefill] = useState<{ text: string; mood: number | null } | null>(null)
  const [search, setSearch] = useState<string | null>(null)
  const [width, setWidth] = useState(1400)
  const [sideOpen, setSideOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const { character, progress } = useGrowth()
  const buddy: FullBuddy = { ...buddyOf(character ?? undefined), stage: progress.stage, level: progress.level }
  const reduced = useReducedMotion()
  const entries = useQuery<DiaryEntry>('SELECT * FROM diary_entries ORDER BY date DESC')
  const byDate = useMemo(() => new Map((entries ?? []).map((e) => [e.date, e])), [entries])
  const narrow = width < 760
  const wide = width >= 1180

  const go = (d: string) => { if (d <= today) { setDate(d); setMode('write'); setSideOpen(false); setPrefill(null) } }
  const chooseWrite = (m: WriteMode, fill?: { text: string; mood: number | null }) => { setWriteMode(m); setWriteModeState(m); setPrefill(m === 'free' ? fill ?? null : null) }
  // 37 첫 둘러보기 · `?`
  const guide = useGuide('diary', { ready: entries !== undefined })
  const tryRecipe = (r: string) => {
    if (r === 'review') { setMode('calendar'); return }
    go(today)
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.dcomposer textarea, .dfree__text')?.focus(), 60)
  }
  // 이번 주를 한 줄로 남기기(28 §8.9): 오늘을 그냥 쓰기로 열고 질문 줄을 넣는다
  const weekOne = async () => {
    const e = byDate.get(today)
    const q = 'Q. 이번 주를 한 줄로 남긴다면?\n'
    if (!(e?.content ?? '').includes(q.trim())) await saveEntry(today, { content: e?.content?.trim() ? `${e.content.trim()}\n\n${q}` : q })
    go(today)
    chooseWrite('free')
  }

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ←→·↑↓ 하루 앞뒤, T 오늘, ⌘F 검색, Esc 서랍·검색 닫기(15 §10.7)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.desktop-dialog, .popover, [role="dialog"]')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); setMode('write'); setSearch((s) => s ?? ''); setSideOpen(true); return }
      if (e.key === 'Escape') { if (sideOpen) { setSideOpen(false); e.preventDefault() } else if (search !== null) { setSearch(null); e.preventDefault() } return }
      if (mode !== 'write' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,[contenteditable]')) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setDate((d) => addDays(d, -1)); setPrefill(null) }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setDate((d) => (d < today ? addDays(d, 1) : d)); setPrefill(null) }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setDate(today); setPrefill(null) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [mode, today, sideOpen, search])

  const sideHead = (
    <header className="pane-header diary__head">
      <h1 className="pane-header__title diary__title">일기</h1>
      <div className="seg diary__seg" role="tablist" aria-label="일기 보기">
        {(['write', 'calendar'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => setMode(m)}>{m === 'write' ? '쓰기' : '기분 달력'}</button>
        ))}
      </div>
      <div className="pane-header__actions"><button className="icon-btn" aria-label="일기 검색 (⌘F)" onClick={() => { setMode('write'); setSearch((s) => (s === null ? '' : null)) }}><Search /></button></div>
    </header>
  )

  return (
    <div ref={rootRef} className={`diary${narrow ? ' is-narrow' : ''}${wide ? ' is-wide' : ''}${reduced ? ' is-reduced' : ''}`}>
      <aside className={`diary__side${narrow ? (sideOpen ? ' is-open' : ' is-closed') : ''}`} aria-hidden={narrow && !sideOpen ? true : undefined}>
        {sideHead}
        {search !== null && (
          <div className="addbar is-active diary__search">
            <div className="addbar__line">
              <Search className="addbar__icon" />
              <input className="addbar__input" autoFocus placeholder="일기 검색" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSearch(null) } }} />
              <button className="addbar__tool" aria-label="검색 닫기" onClick={() => setSearch(null)}><X /></button>
            </div>
          </div>
        )}
        {search === null && <MiniCalendar date={date} today={today} byDate={byDate} onPick={go} />}
        <EntryList entries={entries} date={date} today={today} query={search ?? ''} onPick={go} />
      </aside>
      {narrow && sideOpen && <div className="diary__scrim" onClick={() => setSideOpen(false)} />}
      {mode === 'calendar' ? (
        <main className="diary__editor">
          <header className="pane-header dhead">
            {narrow && <button className="icon-btn" aria-label="달력 열기" onClick={() => setSideOpen(true)}><CalendarDays /></button>}
            <div className="dhead__title"><b>기분 달력</b><small>그날 기분과 이번 주를 돌아봐요</small></div>
            <div className="pane-header__actions"><GuideButton guide={guide} /></div>
          </header>
          <MoodCalendar entries={entries ?? []} byDate={byDate} today={today} initialMonth={monthOf(date)} buddy={buddy} wide={width >= 1000} reduced={reduced} onPick={go} onWeekOne={() => void weekOne()} />
        </main>
      ) : entries === undefined ? (
        <main className="diary__editor"><div className="dtalk is-loading"><i /><i /><i /></div></main>
      ) : (
        <DayView
          key={date}
          date={date}
          today={today}
          entry={byDate.get(date)}
          buddy={buddy}
          consent={consent}
          memory={memory}
          writeMode={writeMode}
          prefill={prefill}
          narrow={narrow}
          wide={wide}
          reduced={reduced}
          onDate={(d) => { if (d <= today) { setDate(d); setPrefill(null) } }}
          onSide={() => setSideOpen(true)}
          onConsent={(on) => { setConsent(on); setConsentState(on) }}
          onMemory={(on) => { setMemory(on); setMemoryState(on) }}
          onWriteMode={chooseWrite}
          onOpen={onOpen}
          help={<GuideButton guide={guide} />}
        />
      )}
      <GuideLayer guide={guide} onTry={tryRecipe} />
    </div>
  )
}

// ── 그날 한 장: 머리 + (대화 | 그냥 쓰기) + 오른쪽 열 ──
type DayProps = {
  date: string; today: string; entry?: DiaryEntry; buddy: FullBuddy; consent: boolean | null; memory: boolean; writeMode: WriteMode
  prefill: { text: string; mood: number | null } | null; narrow: boolean; wide: boolean; reduced: boolean
  onDate: (d: string) => void; onSide: () => void; onConsent: (on: boolean) => void; onMemory: (on: boolean) => void
  onWriteMode: (m: WriteMode, prefill?: { text: string; mood: number | null }) => void; onOpen: (id: string) => void
  /** 37 머리 `?`(⋯ 왼쪽) */ help?: React.ReactNode
}
function DayView({ date, today, entry, buddy, consent, memory, writeMode, prefill, narrow, wide, reduced, onDate, onSide, onConsent, onMemory, onWriteMode, onOpen, help }: DayProps) {
  const toast = useToast()
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const t = useTalk({ date, today, entry, buddy, consent, onConsent, reduced, onFree: (fill) => onWriteMode('free', fill) })
  const isPrivate = !!entry?.private
  const isToday = date === today
  const name = buddy.name
  const free = writeMode === 'free'
  // 떠날 때 기억하기 요약(켜 둔 사람만, 이 날을 고쳤으면)
  const touched = useRef(false)
  const lastContent = useRef(entry?.content ?? '')
  useEffect(() => { if ((entry?.content ?? '') !== lastContent.current) touched.current = true }, [entry?.content])
  useEffect(() => () => { if (touched.current) void summarizeEntry(date, AbortSignal.timeout(120_000)).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 저장 표시: 글이 바뀌면 그때
  useEffect(() => { if ((entry?.content ?? '') !== lastContent.current) { lastContent.current = entry?.content ?? ''; setSavedAt(new Date()) } }, [entry?.content])

  // ⌘Enter = 초안 저장 / 정리, 1~5 = 기분 빠른 답(15 §10.7)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (free || document.querySelector('.desktop-dialog, .popover, [role="dialog"]')) return
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) { if ((e.target as HTMLElement | null)?.closest?.('.ddraft.is-saved')) return; if (t.commit()) e.preventDefault(); return }
      if (t.phase === 'mood' && /^[1-5]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target as HTMLElement | null)?.closest?.('input,textarea')) { e.preventDefault(); void t.answerMood({ mood: Number(e.key) }) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const togglePrivate = async () => {
    await setPrivate(date, !isPrivate)
    toast.show(isPrivate ? `${josa(name, '와', '과')} 같이 읽어요` : `나만 보기로 바꿨어요. ${josa(name, '는', '은')} 이 날 일기를 읽지 않아요`)
  }
  const toggleSolo = () => { setMenu(false); setSolo(date, !t.solo); t.setSolo(!t.solo) }
  const restart = async () => { setMenu(false); t.setDraft(null); await clearScripted(date); toast.show('처음부터 다시 물어볼게요') }
  const hasScripted = t.S.some((m) => m.safety === SCRIPTED)
  const status = isPrivate ? <><Lock />나만 보기</> : savedAt && Date.now() - savedAt.getTime() < 60_000 ? <><Check />{timeKo(savedAt)} · 저장됨</> : entry && isWritten(entry) ? (isToday ? '오늘 일기' : '지난 일기') : isToday ? '오늘 일기' : '지난 날 — 지금 써도 돼요'

  return (
    <section className="diary__editor">
      <header className="pane-header dhead">
        {narrow && <button className="icon-btn" aria-label="달력 열기" onClick={onSide}><CalendarDays /></button>}
        <div className="dhead__nav">
          <button className="icon-btn" aria-label="전날 (←)" title="전날 (←)" onClick={() => onDate(addDays(date, -1))}><ChevronLeft /></button>
          <button className="icon-btn" aria-label="다음 날 (→)" title={isToday ? '내일은 아직 오지 않았어요' : '다음 날 (→)'} disabled={isToday} onClick={() => onDate(addDays(date, 1))}><ChevronRight /></button>
        </div>
        <div className="dhead__title">
          <b>{dateLabel(date, today, true)}</b>
          <small className={isPrivate ? 'is-lock' : ''}>{status}</small>
        </div>
        <div className="pane-header__actions">
          {!isToday && <button className="dbtn is-ghost is-sm" onClick={() => onDate(today)} title="오늘 (T)">오늘</button>}
          <button className="dbtn is-ghost is-sm dhead__mode" onClick={() => onWriteMode(free ? 'chat' : 'free', free ? undefined : { text: '', mood: null })} title={free ? `${josa(name, '와', '과')} 이야기하며 쓰기` : '혼자 길게 쓰기'}>
            {free ? <><MessageCircle />대화로</> : <><PenLine />그냥 쓰기</>}
          </button>
          {help}
          <button ref={moreRef} className="icon-btn dhead__more" aria-label="일기 메뉴" onClick={() => setMenu(true)}><MoreHorizontal /></button>
        </div>
      </header>
      <div className="dbody">
        <div className="dmain">
          {free ? (
            <FreeWrite date={date} entry={entry} prefill={prefill} onChat={() => onWriteMode('chat')} onPrivate={() => void togglePrivate()} onSaved={setSavedAt} />
          ) : (
            <>
              {!wide && <div className="dmain__done"><DoneList t={t} onOpenTask={onOpen} /></div>}
              <Talk t={t} inline={!wide} />
              <Dock t={t} />
            </>
          )}
        </div>
        {wide && (free
          ? <aside className="dpanel"><div className="dpanel__head"><b>{isToday ? '오늘 일기' : '그날 일기'}</b><small>편 미리보기</small></div><div className="dpanel__scroll"><SectionsPreview content={entry?.content ?? ''} /><DoneList t={t} onOpenTask={onOpen} /></div></aside>
          : <DayPanel t={t} onPrivate={() => void togglePrivate()} onOpenTask={onOpen} />)}
      </div>
      {menu && (
        <Popover anchor={moreRef.current} align="end" width={250} onClose={() => setMenu(false)} className="menu">
          <MenuItem icon={free ? <MessageCircle /> : <PenLine />} label={free ? '대화로 쓰기' : '그냥 쓰기 (이 기기는 다음에도)'} onClick={() => { setMenu(false); onWriteMode(free ? 'chat' : 'free') }} />
          <MenuItem icon={isPrivate ? <LockOpen /> : <Lock />} label={isPrivate ? '나만 보기 끄기' : '이 날은 나만 보기'} onClick={() => { setMenu(false); void togglePrivate() }} />
          {consent === true && !isPrivate && <MenuItem icon={t.solo ? <MessageCircle /> : <MessageCircleOff />} label={t.solo ? `${josa(name, '와', '과')} 이야기하기` : '오늘은 혼자 쓸게'} onClick={toggleSolo} />}
          {consent === true && <MenuItem icon={<Sparkles />} label={memory ? '기억하기 끄기' : '기억하기 켜기 (최근 7일 요약)'} onClick={() => { setMenu(false); onMemory(!memory); toast.show(memory ? '그날 일기만 같이 읽어요' : '최근 7일 일기의 짧은 요약을 같이 봐요') }} />}
          <MenuItem icon={consent === true ? <MessageCircleOff /> : <MessageCircle />} label={consent === true ? `${josa(name, '와', '과')} 나누기 끄기` : `${josa(name, '와', '과')} 나누기 켜기`} onClick={() => { setMenu(false); onConsent(consent !== true); setConsent(consent !== true) }} />
          {!free && hasScripted && !t.draft && <MenuItem icon={<RotateCcw />} label="처음부터 다시 묻기" onClick={() => void restart()} />}
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
            <button className="is-danger" data-autofocus onClick={() => { setConfirm(false); t.setDraft(null); touched.current = false; void deleteEntry(date).then(() => toast.show('일기를 지웠어요')) }}>지우기</button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
