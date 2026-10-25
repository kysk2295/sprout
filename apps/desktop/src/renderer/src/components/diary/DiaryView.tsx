import { CalendarDays, ChevronLeft, ChevronRight, Download, Image as ImageIcon, MessageCircle, MessageCircleOff, MoreHorizontal, PanelLeft, PenLine, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays } from '@sprout/schema/time'
import { BYE_ME, SCRIPTED } from '@sprout/schema/diaryTalk'
import { useQuery } from '../../data/useQuery'
import { readMotionPref, useGrowth } from '../../data/growth'
import {
  buddyOf, clearScripted, deleteEntry, dropSoloDraft, getConsent, getMemory, getWriteMode, isWritten, josa, MESSAGES_BY_DATE_SQL, seedSoloDraft, setConsent, setMemory,
  setWriteMode, summarizeEntry, type DiaryEntry, type DiaryMessage, type WriteMode
} from '../../data/diary'
import { dayKey } from '../../lib/dates'
import { Dialog } from '../Dialog'
import { MenuItem, Popover } from '../Popover'
import { useToast } from '../Toast'
import { GuideButton, GuideLayer, useGuide } from '../guide/Guide'
import { AlbumView } from './Album'
import { dateLabel, monthOf } from './dates'
import { DayPanel } from './DayPanel'
import { usePhotoAdd } from './Photos'
import { AlbumMonths, EntryList, Lookbacks, MiniCalendar } from './Side'
import { SoloWrite } from './SoloWrite'
import { forgetAuto, glassVars, soloRef, Talk, useTalkScene, type FullBuddy } from './Talk'
import './diary.css'

// 15 §11 일기 v7(데스크톱) — 레일 · 왼쪽 268(기록: 기분 달력 · 1년·한 달 전 오늘 · 장 목록 / 앨범: 달 목록) · 가운데(최소 560: 대화 | ✎ 혼자 쓰기 | 앨범 격자)
// · 오른쪽 330(오늘의 장면 + 그날 장들 + 사진). 창 폭: 1280↑ 3칸 · 960~1279 오른쪽 접힘(머리 🖼, Esc) · 960↓ 왼쪽도 접힘(⌘\). 모든 칸은 자기 안에서만 스크롤.
// 흐름·말·데이터는 휴대폰 28 §9·§10과 같다(packages/schema diaryTalk·diaryScene). 일기 화면에선 AI 비서 떠 있는 단추를 숨긴다(diary.css :has).
// 단축키(15 §11.3): ⌘N 혼자 쓰기 · ⌘↵ 저장(혼자 쓰기) · ↵ 보내기 · ⇧↵ 줄 바꿈 · ⌘1~5 기분 · ⌘V·끌어 놓기 = 사진 · ←→ 날짜(앨범 넘겨 보기에선 장) · ⌘\ 왼쪽 칸 · ⌘F 검색 · T 오늘 · Esc 닫기.

const RAIL = 56
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
const blocked = () => !!document.querySelector('.desktop-dialog, .popover, [role="dialog"]:not(.dsolo__pop)')

export function DiaryView({ onOpen }: { onOpen: (taskId: string) => void }) {
  const toast = useToast()
  const today = dayKey()
  const [seg, setSeg] = useState<'record' | 'album'>('record')
  const [date, setDate] = useState(today)
  const [month, setMonth] = useState(monthOf(today))
  const [consent, setConsentState] = useState(getConsent)
  const [memory, setMemoryState] = useState(getMemory)
  const [mode, setModeState] = useState<WriteMode>(getWriteMode)
  const [soloIndex, setSoloIndex] = useState<number | null>(null)
  const [search, setSearch] = useState<string | null>(null)
  const [width, setWidth] = useState(1400)
  const rootRef = useRef<HTMLDivElement>(null)
  const { character, progress } = useGrowth()
  const buddy: FullBuddy = { ...buddyOf(character ?? undefined), stage: progress.stage, level: progress.level }
  const reduced = useReducedMotion()
  const talkScene = useTalkScene()
  const entries = useQuery<DiaryEntry>('SELECT * FROM diary_entries ORDER BY date DESC')
  const byDate = useMemo(() => new Map((entries ?? []).map((e) => [e.date, e])), [entries])
  const entry = byDate.get(date)
  const name = buddy.name
  const isToday = date === today

  // ── 창 폭 규칙(시안 §4.5): 레일 포함 창 폭으로 ──
  const win = width + RAIL
  const rightDocked = win >= 1280
  const leftDocked = win >= 960
  const [leftOpen, setLeftOpen] = useState(true) // 넓은 창: 접기·펴기(⌘\) / 좁은 창: 서랍
  const [drawer, setDrawer] = useState(false)
  const [sceneOver, setSceneOver] = useState(false)
  useEffect(() => { if (rightDocked) setSceneOver(false) }, [rightDocked])
  useEffect(() => { if (leftDocked) setDrawer(false) }, [leftDocked])
  const leftShown = leftDocked ? leftOpen : drawer
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const go = useCallback((d: string) => { if (d <= today) { setDate(d); setSeg('record'); setDrawer(false); setSoloIndex(null) } }, [today])
  const toMode = (m: WriteMode) => { if (date === today) setWriteMode(m); setModeState(m) }
  /** ✎ 혼자 쓰기(새 장 또는 그 장 고치기). 대화에서 넘어오면 지금까지 한 말로 새 장을 채워 둔다 */
  const toSolo = (index: number | null = null, fill?: { text: string; mood: number | null }) => {
    if (index === null) seedSoloDraft(date, (fill ?? (mode === 'chat' ? soloRef.current() : { text: '' })).text)
    setSoloIndex(index)
    setSeg('record')
    toMode('solo')
  }
  const toChat = () => { setSoloIndex(null); toMode('chat') }

  // 37 첫 둘러보기 · `?`
  const guide = useGuide('diary', { ready: entries !== undefined })
  const tryRecipe = (r: string) => {
    if (r === 'review') { setSeg('album'); return }
    go(today)
    toMode('chat')
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.dcomposer textarea, .dsolo__text')?.focus(), 60)
  }

  // ── 사진 한 장: 📷 · 끌어 놓기 · ⌘V(그 화면의 날) ──
  const photoDate = date
  const photo = usePhotoAdd(photoDate)
  const [drag, setDrag] = useState(false)
  const dragDepth = useRef(0)
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files')
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!files.length || blocked()) return
      e.preventDefault()
      void photo.add(files)
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [photo])

  // ── 떠날 때 기억하기 요약(켜 둔 사람만, 이 날을 고쳤으면) ──
  const touched = useRef(new Set<string>())
  const lastContent = useRef(new Map<string, string>())
  useEffect(() => {
    const prev = lastContent.current.get(date)
    if (prev !== undefined && prev !== (entry?.content ?? '')) touched.current.add(date)
    lastContent.current.set(date, entry?.content ?? '')
  }, [date, entry?.content])
  useEffect(() => () => { for (const d of touched.current) void summarizeEntry(d, AbortSignal.timeout(120_000)).catch(() => {}) }, [])

  // ── 단축키 ──
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (blocked()) return
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (mod && !e.shiftKey && !e.altKey && k === 'n') { e.preventDefault(); e.stopPropagation(); toSolo(null); return }
    if (mod && k === 'f') { e.preventDefault(); e.stopPropagation(); setSeg('record'); setSearch((s) => s ?? ''); if (leftDocked) setLeftOpen(true); else setDrawer(true); return }
    if (mod && e.key === '\\') { e.preventDefault(); e.stopPropagation(); if (leftDocked) setLeftOpen((o) => !o); else setDrawer((o) => !o); return }
    if (e.key === 'Escape') {
      if (sceneOver) { setSceneOver(false); e.preventDefault() } else if (drawer) { setDrawer(false); e.preventDefault() } else if (search !== null) { setSearch(null); e.preventDefault() }
      return
    }
    if (seg !== 'record' || mod || e.altKey) return
    if ((e.target as HTMLElement | null)?.closest?.('input,textarea,[contenteditable],button')) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(addDays(date, -1)) }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); if (date < today) go(addDays(date, 1)) }
    if (k === 't') { e.preventDefault(); go(today) }
  }
  useEffect(() => { const k = (e: KeyboardEvent) => keyRef.current(e); window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [])

  // ── 머리 ⋯ 메뉴 ──
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const msgs = useQuery<DiaryMessage>(MESSAGES_BY_DATE_SQL, [date])
  const hasScripted = (msgs ?? []).some((m) => m.safety === SCRIPTED && m.content !== BYE_ME)
  const written = !!entry && isWritten(entry)
  const status = mode === 'chat' ? (written ? '저장됨 ✓' : isToday ? '오늘 이야기' : '지난 날 — 지금 이야기해도 돼요') : ''

  const sideBtn = !leftDocked || !leftOpen
    ? <button className="icon-btn dglass" aria-label="왼쪽 칸 열기 (⌘\)" title="기록 (⌘\)" onClick={() => (leftDocked ? setLeftOpen(true) : setDrawer(true))}><PanelLeft /></button>
    : null
  const sceneBtn = !rightDocked && seg === 'record'
    ? <button className={`dpill dglass${sceneOver ? ' is-on' : ''}`} aria-expanded={sceneOver} onClick={() => setSceneOver((o) => !o)} title="오늘의 장면 (Esc로 닫기)"><ImageIcon />{isToday ? '오늘의 장면' : '그날의 장면'}</button>
    : null
  const nav = (
    <div className="dhead__nav">
      <button className="icon-btn dglass" aria-label="전날 (←)" title="전날 (←)" onClick={() => go(addDays(date, -1))}><ChevronLeft /></button>
      <button className="icon-btn dglass" aria-label="다음 날 (→)" title={isToday ? '내일은 아직 오지 않았어요' : '다음 날 (→)'} disabled={isToday} onClick={() => go(addDays(date, 1))}><ChevronRight /></button>
    </div>
  )
  const more = <button ref={moreRef} className="icon-btn dglass" aria-label="일기 메뉴" onClick={() => setMenu(true)}><MoreHorizontal /></button>

  const side = (
    <aside className={`diary__side${leftDocked ? (leftOpen ? '' : ' is-folded') : drawer ? ' is-drawer is-open' : ' is-drawer is-closed'}`} aria-hidden={!leftShown ? true : undefined}>
      <header className="pane-header diary__head">
        <h1 className="pane-header__title diary__title">일기</h1>
        <div className="seg diary__seg" role="tablist" aria-label="일기 보기">
          {(['record', 'album'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={seg === m} className={seg === m ? 'is-on' : ''} onClick={() => { setSeg(m); if (m === 'album') setMonth(monthOf(date)) }}>{m === 'record' ? '기록' : '앨범'}</button>
          ))}
        </div>
        <div className="pane-header__actions">
          {seg === 'record' && <button className="icon-btn" aria-label="일기 검색 (⌘F)" onClick={() => setSearch((s) => (s === null ? '' : null))}><Search /></button>}
        </div>
      </header>
      {seg === 'album' ? (
        <AlbumMonths entries={entries} month={month} today={today} onPick={(m) => { setMonth(m); const d = m === monthOf(today) ? today : `${m}-01`; setDate(d); setDrawer(false) }} />
      ) : <>
        {search !== null && (
          <div className="addbar is-active diary__search">
            <div className="addbar__line">
              <Search className="addbar__icon" />
              <input className="addbar__input" autoFocus placeholder="일기 검색" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSearch(null) } }} />
              <button className="addbar__tool" aria-label="검색 닫기" onClick={() => setSearch(null)}><X /></button>
            </div>
          </div>
        )}
        <div className="diary__sidescroll">
          {search === null && <MiniCalendar date={date} today={today} byDate={byDate} onPick={go} />}
          {search === null && <Lookbacks today={today} byDate={byDate} onPick={go} />}
          <EntryList entries={entries} date={date} today={today} query={search ?? ''} onPick={go} />
        </div>
      </>}
    </aside>
  )

  const panel = (
    <DayPanel key={date} date={date} today={today} entry={entry} name={name} photo={photo} onOpenTask={onOpen}
      onSolo={(i) => { setSceneOver(false); toSolo(i) }}
      onOpenDay={seg === 'album' ? () => go(date) : undefined}
      head={seg === 'album' ? dateLabel(date, today) : undefined} />
  )

  let center: React.ReactNode
  if (seg === 'album') {
    center = <AlbumView month={month} entries={entries} today={today} selected={date} reduced={reduced} onMonth={(m) => setMonth(m)} onSelect={(d) => setDate(d)} onOpen={go} />
  } else if (entries === undefined) {
    center = <div className="dconv is-loading"><i /><i /><i /></div>
  } else if (mode === 'solo') {
    center = (
      <SoloWrite key={`${date}:${soloIndex}`} date={date} today={today} entry={entry} index={soloIndex} photo={photo} lead={<>{sideBtn}{nav}</>} extra={<>{sceneBtn}<GuideButton guide={guide} />{more}</>}
        onChat={toChat} onSaved={() => { setSoloIndex(null); if (!rightDocked) setSceneOver(true) }} />
    )
  } else {
    center = (
      <div className="dchat" style={glassVars(talkScene)}>
        <header className="dhead is-glass">
          {sideBtn}{nav}
          <div className="dhead__title"><b>{dateLabel(date, today, true)}</b><small>{status}</small></div>
          <span className="dhead__sp" />
          {!isToday && <button className="dpill dglass" onClick={() => go(today)} title="오늘 (T)">오늘</button>}
          <button className="dpill dglass" onClick={() => toSolo(null)} title="혼자 쓰기 (⌘N)"><PenLine />혼자 쓰기<kbd>⌘N</kbd></button>
          {sceneBtn}
          <GuideButton guide={guide} />
          {more}
        </header>
        <Talk key={date} date={date} today={today} entry={entry} buddy={buddy} reduced={reduced} consent={consent}
          onConsent={(on) => setConsentState(on)} onSolo={(fill) => toSolo(null, fill)} onPhoto={photo.pick} photoBusy={photo.busy} />
      </div>
    )
  }

  return (
    <div ref={rootRef}
      className={`diary${reduced ? ' is-reduced' : ''}${rightDocked ? ' is-3' : ''}${leftDocked ? '' : ' is-narrow'}${drag ? ' is-drag' : ''}`}
      onDragEnter={(e) => { if (!hasFiles(e)) return; dragDepth.current++; setDrag(true) }}
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
      onDragLeave={(e) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDrag(false) }}
      onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDrag(false); void photo.add([...e.dataTransfer.files]) }}>
      {side}
      {!leftDocked && drawer && <div className="diary__scrim" onClick={() => setDrawer(false)} />}
      <main className={`diary__center is-${seg === 'album' ? 'album' : mode}`}>{center}</main>
      {rightDocked ? panel : sceneOver && (
        <>
          <div className="diary__scrim is-right" onClick={() => setSceneOver(false)} />
          <div className="dright-over" role="dialog" aria-label={isToday ? '오늘의 장면' : '그날의 장면'}>
            <button className="icon-btn dright-over__x" aria-label="닫기 (Esc)" onClick={() => setSceneOver(false)}><X /></button>
            {panel}
          </div>
        </>
      )}
      {drag && <div className="ddrop" aria-hidden="true"><div><ImageIcon /><b>여기에 놓으면 {isToday ? '오늘' : dateLabel(date, today)} 장면에 붙어요</b><small>하루 10장까지 · 줄여서 올려요</small></div></div>}
      {menu && (
        <Popover anchor={moreRef.current} align="end" width={250} onClose={() => setMenu(false)} className="menu">
          {mode === 'chat'
            ? <MenuItem icon={<PenLine />} label="혼자 쓰기 (⌘N)" onClick={() => { setMenu(false); toSolo(null) }} />
            : <MenuItem icon={<MessageCircle />} label={`${josa(name, '와', '과')} 이야기하기`} onClick={() => { setMenu(false); toChat() }} />}
          <MenuItem icon={consent === true ? <MessageCircleOff /> : <MessageCircle />} label={consent === true ? `${josa(name, '와', '과')} 나누기 끄기` : `${josa(name, '와', '과')} 나누기 켜기`}
            onClick={() => { setMenu(false); const on = consent !== true; setConsent(on); setConsentState(on); toast.show(on ? '나누기를 켰어요' : '나누기를 껐어요. 질문은 계속 정해진 말로 해요') }} />
          {consent === true && <MenuItem icon={<Sparkles />} label={memory ? '기억하기 끄기' : '기억하기 켜기 (최근 7일 요약)'} onClick={() => { setMenu(false); setMemory(!memory); setMemoryState(!memory); toast.show(memory ? '그날 일기만 같이 읽어요' : '최근 7일 일기의 짧은 요약을 같이 봐요') }} />}
          {mode === 'chat' && hasScripted && !written && <MenuItem icon={<RotateCcw />} label="처음부터 다시 묻기" onClick={() => { setMenu(false); forgetAuto(date); void clearScripted(date).then(() => toast.show('처음부터 다시 물어볼게요')) }} />}
          <MenuItem icon={<Search />} label="일기 검색 (⌘F)" onClick={() => { setMenu(false); setSeg('record'); setSearch(''); if (leftDocked) setLeftOpen(true); else setDrawer(true) }} />
          <MenuItem icon={<CalendarDays />} label="앨범 보기" onClick={() => { setMenu(false); setMonth(monthOf(date)); setSeg('album') }} />
          <div className="menu__divider" />
          <MenuItem icon={<Download />} label="텍스트로 내보내기 (준비 중)" disabled onClick={() => {}} />
          <MenuItem icon={<Trash2 />} label="이 날 일기 지우기" danger disabled={!entry} onClick={() => { setMenu(false); setConfirm(true) }} />
        </Popover>
      )}
      {confirm && (
        <Dialog label="일기 지우기" className="diary-dialog" onClose={() => setConfirm(false)}>
          <h2>이 날 일기를 지울까요?</h2>
          <p>{dateLabel(date, today)}의 일기와 {josa(name, '와', '과')} 나눈 이야기가 모든 기기에서 지워져요. 되돌릴 수 없어요.</p>
          <div className="diary-dialog__actions">
            <button onClick={() => setConfirm(false)}>취소</button>
            <button className="is-danger" data-autofocus onClick={() => { setConfirm(false); forgetAuto(date); dropSoloDraft(date); touched.current.delete(date); void deleteEntry(date).then(() => toast.show('일기를 지웠어요')) }}>지우기</button>
          </div>
        </Dialog>
      )}
      <GuideLayer guide={guide} onTry={tryRecipe} />
    </div>
  )
}
