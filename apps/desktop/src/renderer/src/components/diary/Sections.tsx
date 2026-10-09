import { Check, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { normalizeTag, type Section } from '@sprout/schema/diaryPrompts'
import { moodOf } from '../../data/diary'
import { MoodFace } from './MoodFace'

// 15 §10.3·§10.4 일기 글 그리기 — 편 머리 `## 21:45 — 제목` · 태그 줄 · 본문(parseSections). 초안 카드·저장한 편 카드도 여기.

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

export type Draft = Section & { source: 'ai' | 'own' | 'transcript' }

/** 초안 카드(§10.3): 기분 · 제목 · 태그 · 본문(늘 고칠 수 있음) · 작은 줄 · [다시 정리] [대화 그대로] [더 이야기] … [저장 ⌘↵] */
export function DraftCard(props: {
  draft: Draft; date: string; past: boolean; name: string; mood: number | null; aiFlow: boolean; distilling: boolean; left: number | null; canTranscript: boolean
  onChange: (d: Partial<Draft>) => void; onRedo: () => void; onTranscript: () => void; onSave: () => void; onBack?: () => void
}) {
  const { draft } = props
  const m = moodOf(props.mood)
  const body = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = body.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 120)}px` } }, [draft.body])
  const canSave = !!draft.body.trim() || !!props.mood
  // 새 초안이 오면 카드 전체가 보이게(오른쪽 아래 떠 있는 AI 비서 단추에 저장이 가리지 않게)
  const card = useRef<HTMLElement>(null)
  useEffect(() => { card.current?.scrollIntoView({ block: 'center' }) }, [draft.source])
  const note = draft.source === 'ai' ? `내가 한 말로 정리했어요. ${props.name}의 말과 조언은 넣지 않았어요.`
    : draft.source === 'transcript' ? `대화를 그대로 남겨요(나 · ${props.name}).`
      : '내가 한 말 그대로예요.'
  return (
    <section ref={card} className="ddraft" aria-label="일기 초안">
      <div className="ddraft__meta">
        {m && <MoodFace mood={m.value} size={26} />}
        <span>{props.past ? '그날 일기' : '오늘 일기'} · {Number(props.date.slice(5, 7))}월 {Number(props.date.slice(8))}일{m ? ` · ${m.label}` : ''}</span>
      </div>
      <input className="ddraft__title" value={draft.title} maxLength={40} placeholder="제목(없어도 돼요)" aria-label="일기 제목" onChange={(e) => props.onChange({ title: e.target.value })} />
      <TagEditor tags={draft.tags} onChange={(tags) => props.onChange({ tags })} />
      <textarea ref={body} className="ddraft__body" value={draft.body} placeholder="(기분만 남겼어요)" aria-label="일기 본문" onChange={(e) => props.onChange({ body: e.target.value })} />
      <p className="ddraft__note">{note}{props.aiFlow && props.left !== null ? ` · 오늘 정리 ${props.left}번 남음` : ''}</p>
      <div className="ddraft__acts">
        {props.aiFlow && draft.source !== 'transcript' && (props.left === 0
          ? <span className="dbtn is-off">오늘은 다 썼어요</span>
          : <button className="dbtn is-soft" disabled={props.distilling} onClick={props.onRedo}>{props.distilling ? '정리하는 중…' : draft.source === 'ai' ? '다시 정리' : '다듬어 줘'}</button>)}
        {props.canTranscript && draft.source !== 'transcript' && <button className="dbtn is-ghost" onClick={props.onTranscript}>대화 그대로</button>}
        {props.onBack && <button className="dbtn is-ghost" onClick={props.onBack}>더 이야기</button>}
        <button className="dbtn is-primary" disabled={!canSave || props.distilling} onClick={props.onSave} title="저장 (⌘↵)">저장<kbd>⌘↵</kbd></button>
      </div>
    </section>
  )
}

/** 저장한 편 카드: 시각 · 제목 · 태그 · 본문 · ✓ 저장했어요 · 고치기(그 편만) */
export function SavedCard({ section, date, past, clamp, editing, onEdit, onCancel, onSave }: {
  section: Section; date: string; past: boolean; clamp?: boolean; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: (s: Section) => void
}) {
  const [d, setD] = useState(section)
  useEffect(() => { if (editing) setD(section) }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const body = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = body.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 120)}px` } }, [d.body, editing])
  if (editing) {
    return (
      <section className="ddraft is-saved" aria-label="저장한 편 고치기"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); onSave(d) } }}>
        <div className="ddraft__meta"><span>{section.time ?? (past ? '그날' : '오늘')} · {Number(date.slice(5, 7))}월 {Number(date.slice(8))}일</span></div>
        <input className="ddraft__title" value={d.title} placeholder="제목" aria-label="일기 제목" autoFocus onChange={(e) => setD({ ...d, title: e.target.value })} />
        <TagEditor tags={d.tags} onChange={(tags) => setD({ ...d, tags })} />
        <textarea ref={body} className="ddraft__body" value={d.body} aria-label="일기 고치기" onChange={(e) => setD({ ...d, body: e.target.value })} />
        <div className="ddraft__acts">
          <button className="dbtn is-ghost" onClick={onCancel}>취소</button>
          <button className="dbtn is-primary" onClick={() => onSave(d)}>저장<kbd>⌘↵</kbd></button>
        </div>
      </section>
    )
  }
  return (
    <section className="ddraft is-saved" aria-label={section.title || '저장한 편'}>
      <SectionView section={section} clamp={clamp} />
      <div className="ddraft__acts">
        <span className="ddraft__ok"><Check />저장했어요</span>
        <button className="dbtn is-ghost is-sm" onClick={onEdit}>고치기</button>
      </div>
    </section>
  )
}
