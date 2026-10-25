import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { normalizeTag, type Section } from '@sprout/schema/diaryPrompts'

// 15 §10.4 일기 글 그리기 — 편 머리 `## 21:45 — 제목`(혼자 쓴 장 `## 21:45 ✎ — 제목`) · 태그 줄 · 본문(parseSections). 종이 카드는 Talk.tsx, 장 목록은 DayPanel.tsx.

/** 저장한 편 하나(읽기): 시각 · 제목 · 태그 칩 · 본문 */
export function SectionView({ section, clamp }: { section: Section; clamp?: boolean }) {
  return (
    <div className="dsec">
      {(section.time || section.title) && (
        <div className="dsec__head">
          {section.time && <time>{section.time}</time>}
          {section.title && <b>{section.title}</b>}
        </div>
      )}
      {section.tags.length > 0 && <Tags tags={section.tags} />}
      <p className={`dsec__body${clamp ? ' is-clamp' : ''}`}>{section.body || '(기분만 남겼어요)'}</p>
    </div>
  )
}

export function Tags({ tags, onRemove }: { tags: string[]; onRemove?: (t: string) => void }) {
  return (
    <div className="dtags">
      {tags.map((t) => onRemove
        ? <button key={t} className="dtag is-edit" aria-label={`${t} 빼기`} onClick={() => onRemove(t)}>{t}<X /></button>
        : <span key={t} className="dtag">{t}</span>)}
    </div>
  )
}

/** 태그 고치기: 칩(✕로 빼기) + `＋ 태그`(감정/사건/영역 꼴, 영역 없이 쓰면 감정) */
export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [v, setV] = useState('')
  const add = () => {
    const t = v.trim() ? normalizeTag(v.includes('/') ? v : `감정/${v}`) : null
    if (t && !tags.includes(t)) onChange([...tags, t])
    setV(''); setAdding(false)
  }
  return (
    <div className="dtags">
      {tags.map((t) => <button key={t} className="dtag is-edit" aria-label={`${t} 빼기`} onClick={() => onChange(tags.filter((x) => x !== t))}>{t}<X /></button>)}
      {adding
        ? <input className="dtag__input" autoFocus value={v} placeholder="감정/설렘" aria-label="태그 더하기" onChange={(e) => setV(e.target.value)} onBlur={add}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add() } if (e.key === 'Escape') { e.stopPropagation(); setV(''); setAdding(false) } }} />
        : <button className="dtag is-add" onClick={() => setAdding(true)}><Plus />태그</button>}
    </div>
  )
}
