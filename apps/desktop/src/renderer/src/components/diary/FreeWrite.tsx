import { HelpCircle, Lock, LockOpen, MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MOODS, moodOf, promptFor, saveEntry, type DiaryEntry } from '../../data/diary'
import { useToast } from '../Toast'
import { MoodFace } from './MoodFace'

// 15 §10.5 · 28 §8.4 그냥 쓰기: 기분 얼굴 줄(고른 것 진하게 + 이름, 나머지 바램) · 글 칸(남은 높이 가득) · 아래 도구 막대
// (기분 · 나만 보기 · 질문 · 대화로 · 완료). 0.6초 뒤 자동 저장(diary_entries.content) — 글 전체(편 머리·태그 줄 포함)를 그대로 고친다.

export function FreeWrite({ date, entry, prefill, onChat, onPrivate, onSaved }: {
  date: string; entry: DiaryEntry | undefined; prefill: { text: string; mood: number | null } | null
  onChat: () => void; onPrivate: () => void; onSaved: (at: Date) => void
}) {
  const toast = useToast()
  const start = () => {
    const cur = entry?.content ?? ''
    if (!prefill?.text.trim()) return cur
    return cur.trim() ? `${cur.trim()}\n\n${prefill.text.trim()}` : prefill.text.trim()
  }
  const [text, setText] = useState(start)
  const saved = useRef(entry?.content ?? '')
  const latest = useRef(text)
  const timer = useRef<number>(undefined)
  const area = useRef<HTMLTextAreaElement>(null)
  const moodsRef = useRef<HTMLDivElement>(null)
  const flush = () => {
    window.clearTimeout(timer.current)
    const v = latest.current
    if (v === saved.current) return
    saved.current = v
    void saveEntry(date, { content: v }).then(() => onSaved(new Date()))
  }
  // 대화에서 넘어온 말·기분은 바로 남긴다
  useEffect(() => {
    if (prefill?.mood && !entry?.mood) void saveEntry(date, { mood: prefill.mood })
    if (latest.current !== saved.current) flush()
    area.current?.focus()
    return () => flush()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 다른 기기에서 바뀐 글: 지금 고치는 중이 아니면 받아 온다(마지막 저장이 이김)
  useEffect(() => {
    const remote = entry?.content ?? ''
    if (remote === saved.current || latest.current !== saved.current || document.activeElement === area.current) return
    saved.current = latest.current = remote
    setText(remote)
  }, [entry?.content])
  const change = (v: string) => {
    setText(v)
    latest.current = v
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 600)
  }
  const mood = entry?.mood ?? null
  const pickMood = (v: number) => void saveEntry(date, { mood: mood === v ? null : v }).then(() => onSaved(new Date()))
  const priv = !!entry?.private
  const [shift, setShift] = useState(0)
  const ask = () => {
    const q = `Q. ${promptFor(date, shift)}\n`
    setShift((n) => n + 1)
    const next = text.startsWith('Q. ') ? q + text.split('\n').slice(1).join('\n').replace(/^\n+/, '') : q + text.replace(/^\n+/, '')
    change(next)
    requestAnimationFrame(() => { const el = area.current; if (el) { el.focus(); el.setSelectionRange(q.length, q.length) } })
  }
  const done = () => { flush(); area.current?.blur(); if (text.trim()) toast.show('저장했어요') }
  const m = moodOf(mood)

  return (
    <div className="dfree">
      <div className="dfree__col">
        <div ref={moodsRef} className="dmoods is-free" role="radiogroup" aria-label="기분">
          {MOODS.map((x) => (
            <button key={x.value} role="radio" aria-checked={mood === x.value} aria-label={x.label} className={mood === x.value ? 'is-on' : ''} onClick={() => pickMood(x.value)}>
              <MoodFace mood={x.value} size={mood === x.value ? 44 : 34} faded={!!mood && mood !== x.value} />
              <small>{mood === x.value ? x.label : ''}</small>
            </button>
          ))}
        </div>
        <textarea
          ref={area}
          className="dfree__text"
          value={text}
          placeholder="오늘 하루는 어땠어요?"
          aria-label="일기 글"
          onChange={(e) => change(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done() } }}
        />
      </div>
      <div className="dfree__bar" role="toolbar" aria-label="그냥 쓰기 도구">
        <button className={`dtool${m ? ' is-on' : ''}`} aria-label={m ? `기분: ${m.label}` : '기분 고르기'} title="기분" onClick={() => moodsRef.current?.querySelector<HTMLButtonElement>('button')?.focus()}>
          <MoodFace mood={m?.value ?? 3} size={24} faded={!m} />
        </button>
        <button className={`dtool${priv ? ' is-on' : ''}`} aria-pressed={priv} aria-label="나만 보기" title="나만 보기" onClick={onPrivate}>{priv ? <Lock /> : <LockOpen />}</button>
        <button className="dtool" aria-label="질문 넣기" title="질문 넣기" onClick={ask}><HelpCircle /></button>
        <button className="dtool" aria-label="대화로 쓰기" title="대화로 쓰기" onClick={() => { flush(); onChat() }}><MessageCircle /><span>대화로</span></button>
        <button className="dtool is-done" onClick={done} title="완료 (⌘↵)">완료</button>
      </div>
    </div>
  )
}
