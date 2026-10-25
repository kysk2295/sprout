import { Clock, HelpCircle, ImagePlus, ListChecks, MessageCircle } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { parseSections, type Section } from '@sprout/schema/diaryPrompts'
import { moodShort } from '@sprout/schema/diaryTalk'
import { dropSoloDraft, MOODS, promptFor, readSoloDraft, replaceSection, saveEntry, saveSection, useDayStats, writeSoloDraft, type DiaryEntry, type SoloDraft } from '../../data/diary'
import { useToast } from '../Toast'
import { dateLabel } from './dates'
import { MoodFace } from './MoodFace'
import { PhotoStrip, type usePhotoAdd } from './Photos'

// 15 §11 D2 · 28 §9 L 혼자 쓰기(데스크톱): 가운데 칸 전체가 종이 한 장 — 머리 52 / 본문(스크롤, 글 기둥 640, 줄 노트, 열면 커서) / 도구 막대 46이
// 한 세로 상자 안에 차례로(겹칠 수 없음 — v2 그냥 쓰기의 도구 막대가 글을 덮던 문제 고침). 머리: 날짜·임시 저장됨 · 💬 대화로 · 저장 ⌘↵.
// 기분(선택) · 제목(선택, 비우면 첫 줄이 제목) · 본문 · 사진 줄. 도구: 기분 · 한 일 넣기 · 📷 사진 · 질문 · 시각 · 글자 수.
// AI 0회. 1초 멈추면 기기에 임시 저장(diary-draft-<날짜>), 저장하면 지운다. 저장 = 그날 글 끝에 ✎ 장(appendSection), 고치기(index) = 그 장 자리에서.

const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function SoloWrite({ date, today, entry, index, photo, lead, extra, onChat, onSaved }: {
  date: string; today: string; entry: DiaryEntry | undefined
  /** 고칠 장(그날 글 안 순서). null = 새 장 */
  index: number | null
  photo: ReturnType<typeof usePhotoAdd>
  /** 머리 왼쪽(왼쪽 칸 열기 · 날짜 ‹ ›) · 오른쪽(🖼 · ? · ⋯) — DiaryView가 준다 */
  lead?: React.ReactNode; extra?: React.ReactNode
  onChat: () => void; onSaved: (index: number) => void
}) {
  const toast = useToast()
  const stats = useDayStats(date)
  const fromDraft = useRef(false)
  const [init] = useState<SoloDraft>(() => {
    const d = readSoloDraft(date)
    if (d && d.index === index) { fromDraft.current = true; return d }
    if (index !== null) { const sec = parseSections(entry?.content)[index]; if (sec) return { title: sec.title, body: sec.body, index } }
    return { title: '', body: '', index }
  })
  const [title, setTitle] = useState(init.title)
  const [body, setBody] = useState(init.body)
  const [status, setStatus] = useState<'new' | 'draft' | 'saving'>(fromDraft.current ? 'draft' : 'new')
  const latest = useRef<SoloDraft>(init)
  const timer = useRef<number>(undefined)
  const saved = useRef(false)
  const keep = () => {
    window.clearTimeout(timer.current)
    if (saved.current) return
    const d = latest.current
    writeSoloDraft(date, d)
    if (d.title.trim() || d.body.trim()) setStatus('draft')
  }
  const edit = (patch: Partial<SoloDraft>) => {
    latest.current = { ...latest.current, ...patch }
    if (patch.title !== undefined) setTitle(patch.title)
    if (patch.body !== undefined) setBody(patch.body)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(keep, 1000)
  }
  // 떠날 때(대화로·다른 날·다른 탭) 마지막 글을 남긴다 — 저장했으면 이미 지움
  useEffect(() => () => keep(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const mood = entry?.mood ?? null
  const pickMood = (v: number) => { setPop(null); void saveEntry(date, { mood: mood === v ? null : v }) }
  // ⌘1~5 기분 · ⌘↵ 저장(15 §11.3)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || document.querySelector('.desktop-dialog, .popover, [role="dialog"]')) return
    if (/^[1-5]$/.test(e.key) && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); pickMood(Number(e.key)); return }
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); void save() }
  }
  useEffect(() => { const k = (e: KeyboardEvent) => keys.current(e); window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [])

  // 본문: 열면 커서(끝에) · 글 높이만큼 늘어나 종이 전체가 스크롤
  const area = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => { const a = area.current; if (!a) return; a.style.height = 'auto'; a.style.height = `${Math.max(a.scrollHeight, 300)}px` }, [body])
  useEffect(() => { const a = area.current; if (!a) return; a.focus(); a.setSelectionRange(a.value.length, a.value.length) }, [])
  // 커서 자리에 넣기(한 일·질문·시각)
  const insert = (piece: string) => {
    const a = area.current
    const b = latest.current.body
    const s0 = a ? a.selectionStart : b.length, s1 = a ? a.selectionEnd : b.length
    const before = b.slice(0, s0)
    const lead = !before ? '' : piece.endsWith('\n') ? (before.endsWith('\n') ? '' : '\n') : /\s$/.test(before) ? '' : ' '
    const next = before + lead + piece + b.slice(s1)
    const caret = s0 + lead.length + piece.length
    edit({ body: next })
    setPop(null)
    window.setTimeout(() => { area.current?.focus(); area.current?.setSelectionRange(caret, caret) }, 20)
  }
  const [shift, setShift] = useState(0)
  const ask = () => { insert(`${promptFor(date, shift)}\n`); setShift((n) => n + 1) }
  const [pop, setPop] = useState<'mood' | 'done' | null>(null)
  useEffect(() => {
    if (!pop) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPop(null) } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [pop])

  const empty = !title.trim() && !body.trim()
  const save = async () => {
    if (empty || status === 'saving') return
    setStatus('saving')
    window.clearTimeout(timer.current)
    const secs = parseSections(entry?.content)
    const sec = index !== null ? secs[index] : undefined
    const next: Section = { time: sec?.time ?? hhmm(), title: title.trim(), tags: sec?.tags ?? [], body: body.trim(), solo: sec ? sec.solo ?? false : true }
    try {
      if (index !== null && sec) await replaceSection(date, index, next)
      else await saveSection(date, next, null)
      saved.current = true
      dropSoloDraft(date)
      toast.show(index !== null && sec ? '고쳐서 저장했어요' : '저장했어요')
      onSaved(index !== null && sec ? index : secs.length)
    } catch {
      setStatus('draft')
      toast.show('저장하지 못했어요. 글은 그대로 있어요')
    }
  }
  const chars = [...body.replace(/\s/g, '')].length

  return (
    <section className="dsolo" aria-label="혼자 쓰기">
      <header className="dsolo__head">
        {lead}
        <div className="dsolo__title">
          <b>{dateLabel(date, today, true)}</b>
          <small>✎ {index !== null ? '고치는 중' : '혼자 쓰기'}{status === 'saving' ? ' · 저장 중…' : status === 'draft' ? ' · 임시 저장됨' : ''}</small>
        </div>
        <span className="dsolo__sp" />
        {extra}
        <button className="dpill" onClick={() => { keep(); onChat() }} title="캐릭터와 이야기로"><MessageCircle />대화로</button>
        <button className="dpill is-save" disabled={empty || status === 'saving'} onClick={() => void save()} title="저장 (⌘↵)">저장<kbd>⌘↵</kbd></button>
      </header>
      <div className="dsolo__body">
        <div className="dsolo__col">
          <div className="dsolo__moods" role="radiogroup" aria-label="기분(선택)">
            <span>기분</span>
            {MOODS.map((m, i) => (
              <button key={m.value} role="radio" aria-checked={mood === m.value} aria-label={m.label} title={`${m.label} (⌘${i + 1})`} className={mood === m.value ? 'is-on' : ''} onClick={() => pickMood(m.value)}>
                <MoodFace mood={m.value} size={28} faded={mood !== m.value} />
              </button>
            ))}
          </div>
          <input className="dsolo__h" value={title} maxLength={60} placeholder="제목 (없어도 돼요)" aria-label="제목"
            onChange={(e) => edit({ title: e.target.value.replace(/\n/g, '') })}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); area.current?.focus() } }} />
          <textarea ref={area} className="dsolo__text" value={body} placeholder="오늘 하루를 편하게 적어요" aria-label="일기 글" onChange={(e) => edit({ body: e.target.value })} />
          <PhotoStrip photos={photo.photos} pending={photo.pending} onAdd={() => void photo.pick()} busy={photo.busy} size={92} />
        </div>
      </div>
      <div className="dsolo__bar" role="toolbar" aria-label="혼자 쓰기 도구">
        {pop && (
          <div className="dsolo__pop" role="dialog" aria-label={pop === 'mood' ? '기분' : '끝낸 할 일 넣기'}>
            {pop === 'mood' ? (
              <div className="dsolo__popmoods">
                {MOODS.map((m) => <button key={m.value} aria-label={m.label} className={mood === m.value ? 'is-on' : ''} onClick={() => pickMood(m.value)}><MoodFace mood={m.value} size={36} faded={!!mood && mood !== m.value} /><small>{moodShort(m.value)}</small></button>)}
              </div>
            ) : stats.doneTitles.length ? (
              <ul className="dsolo__done">{stats.doneTitles.map((t, i) => <li key={i}><button onClick={() => insert(`✓ ${t}\n`)}><b>✓</b>{t}</button></li>)}</ul>
            ) : <p className="dsolo__none">{date === today ? '오늘' : '이 날'} 끝낸 할 일이 없어요</p>}
          </div>
        )}
        <button className={`dtool${pop === 'mood' ? ' is-on' : ''}`} onClick={() => setPop((v) => (v === 'mood' ? null : 'mood'))}>{mood ? <MoodFace mood={mood} size={20} /> : <MoodFace mood={3} size={20} faded />}기분</button>
        <button className={`dtool${pop === 'done' ? ' is-on' : ''}`} onClick={() => setPop((v) => (v === 'done' ? null : 'done'))}><ListChecks />한 일 넣기</button>
        <button className="dtool" disabled={photo.busy} onClick={() => { setPop(null); void photo.pick() }}><ImagePlus />{photo.count ? `사진 ${photo.count}` : '사진'}</button>
        <button className="dtool" onClick={ask}><HelpCircle />질문</button>
        <button className="dtool" onClick={() => insert(`${hhmm()} `)}><Clock />시각</button>
        <span className="dsolo__count">글자 {chars}</span>
      </div>
    </section>
  )
}
