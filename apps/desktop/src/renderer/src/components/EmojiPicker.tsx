// 30 §A.2 이모지 선택기 [틱틱 Add List 2026] — 검색(한국어·영어) · 자주 쓰는(16개, 기기 저장) · 분류 탭 · 8열 격자(칸 36) · 맨 위 왼쪽 `없음`
// 키보드: 검색칸 자동 초점, ↑↓←→ 이동, Enter 고르기, Esc 닫기. 그림은 OS 이모지 글꼴.
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { EMOJI_GROUPS, GROUP_ICONS, loadEmoji, loadRecent, saveRecent, searchEmoji, type Emoji } from '../data/emoji'
import { Popover } from './Popover'
import './EmojiPicker.css'

const COLS = 8

export function EmojiPicker({ anchor, onPick, onClose }: { anchor: HTMLElement | null; onPick: (emoji: string | null) => void; onClose: () => void }) {
  const [all, setAll] = useState<Emoji[]>()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [recent] = useState(loadRecent)
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => { let alive = true; void loadEmoji().then((d) => { if (alive) setAll(d) }); return () => { alive = false } }, [])
  const shown = useMemo(() => (all ? (q.trim() ? searchEmoji(all, q) : all.filter((x) => x.group === tab)) : []), [all, q, tab])
  useEffect(() => { setCursor(0); grid.current?.scrollTo({ top: 0 }) }, [q, tab])
  useEffect(() => { grid.current?.querySelector('.emoji-cell.is-cursor')?.scrollIntoView({ block: 'nearest' }) }, [cursor])
  const nameOf = useMemo(() => new Map((all ?? []).map((x) => [x.e, x.ko || x.en])), [all])

  const pick = (e: string | null) => { if (e) saveRecent(e); onPick(e); onClose() }
  const onKey = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key]
    if (move !== undefined) {
      // 검색칸에서 ←→는 글자 이동 — 검색어가 있으면 격자 이동은 ↑↓만
      if (q && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target instanceof HTMLInputElement && e.target.selectionStart !== e.target.value.length) return
      e.preventDefault()
      setCursor((c) => Math.max(0, Math.min(shown.length - 1, c + move)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[cursor]) pick(shown[cursor].e)
    }
  }

  return (
    <Popover anchor={anchor} width={320} onClose={onClose} className="emoji-picker">
      <div onKeyDown={onKey}>
        <div className="emoji-picker__top">
          <button type="button" className="emoji-picker__none" onClick={() => pick(null)} title="기본 아이콘(≡)으로 되돌리기">없음</button>
          <div className="menu__search emoji-picker__search">
            <Search />
            <input autoFocus spellCheck={false} placeholder="이모지 검색" aria-label="이모지 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {!q && recent.length > 0 && (
          <>
            <div className="emoji-picker__label">자주 쓰는</div>
            <div className="emoji-picker__grid emoji-picker__grid--recent">
              {recent.map((e) => <button type="button" key={e} className="emoji-cell" title={nameOf.get(e)} onClick={() => pick(e)}>{e}</button>)}
            </div>
          </>
        )}
        {!q && (
          <div className="emoji-picker__tabs" role="tablist" aria-label="분류">
            {EMOJI_GROUPS.map((g, i) => (
              <button type="button" key={g} role="tab" aria-selected={tab === i} className={tab === i ? 'is-on' : ''} title={g} aria-label={g} onClick={() => setTab(i)}>{GROUP_ICONS[i]}</button>
            ))}
          </div>
        )}
        <div className="emoji-picker__label">{q ? `검색 결과 ${shown.length}` : EMOJI_GROUPS[tab]}</div>
        <div className="emoji-picker__grid emoji-picker__grid--main" ref={grid} role="listbox" aria-label="이모지">
          {!all && <p className="emoji-picker__empty">불러오는 중…</p>}
          {all && !shown.length && <p className="emoji-picker__empty">맞는 이모지가 없어요</p>}
          {shown.map((x, i) => (
            <button type="button" key={x.e} role="option" aria-selected={i === cursor} className={`emoji-cell${i === cursor ? ' is-cursor' : ''}`} title={x.ko || x.en} onMouseEnter={() => setCursor(i)} onClick={() => pick(x.e)}>{x.e}</button>
          ))}
        </div>
      </div>
    </Popover>
  )
}
