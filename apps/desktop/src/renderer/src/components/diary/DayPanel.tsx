import { CheckSquare, ChevronDown, ChevronRight, Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { parseSections } from '@sprout/schema/diaryPrompts'
import { moodOf } from '../../data/diary'
import { hhmm } from './dates'
import { MoodFace } from './MoodFace'
import { DraftCard, SavedCard, SectionView } from './Sections'
import { DistillCard } from './Stream'
import type { TalkState } from './Talk'

// 15 §10.1 오른쪽 `오늘 일기` 340 — 저장한 편 카드(시각·제목·태그·본문, 고치기) · 지금 쓰는 편(내 말이 모이는 중 / 초안 카드) · 그날 끝낸 할 일(XP 없음).

export function DayPanel({ t, onPrivate, onOpenTask }: { t: TalkState; onPrivate: () => void; onOpenTask: (id: string) => void }) {
  const isPrivate = !!t.entry?.private
  const m = moodOf(t.entry?.mood)
  return (
    <aside className="dpanel" aria-label={t.past ? '그날 일기' : '오늘 일기'}>
      <div className="dpanel__head">
        <b>{t.past ? '그날 일기' : '오늘 일기'}</b>
        {m && <span className="dpanel__mood"><MoodFace mood={m.value} size={20} />{m.label}</span>}
        <button className={`icon-btn dpanel__lock${isPrivate ? ' is-on' : ''}`} aria-pressed={isPrivate} aria-label="나만 보기" title={isPrivate ? `나만 보기 켜짐 — ${t.name}에게 보내지 않아요` : '나만 보기'} onClick={onPrivate}>{isPrivate ? <Lock /> : <LockOpen />}</button>
      </div>
      <div className="dpanel__scroll">
        {t.sections.map((sec, k) => (
          <SavedCard key={`${k}-${sec.time}-${sec.title}`} section={sec} date={t.date} past={t.past} editing={t.editAt === k}
            onEdit={() => t.setEditAt(k)} onCancel={() => t.setEditAt(null)} onSave={(s) => void t.editSaved(k, s)} />
        ))}
        {t.distilling ? (
          <DistillCard stream={t.dstream} buddy={t.buddy} name={t.name} again={t.distillTry > 1} reduced={t.reduced} onStop={t.stop} />
        ) : t.draft ? (
          <DraftCard draft={t.draft} date={t.date} past={t.past} name={t.name} mood={t.sessionMood ?? t.entry?.mood ?? null} aiFlow={t.aiFlow} distilling={t.distilling}
            left={t.quota ? Math.max(0, t.quota.limit - t.quota.used) : null} canTranscript={t.canTranscript}
            onChange={(d) => t.setDraft({ ...t.draft!, ...d })} onRedo={() => void t.distill(true)} onTranscript={t.makeTranscript} onSave={() => void t.save()} onBack={t.aiFlow ? () => t.setDraft(null) : undefined} />
        ) : t.forming.trim() && (t.phase === 'talk' || t.phase === 'q1' || t.phase === 'q2' || t.phase === 'q3') ? (
          <section className="dforming" aria-label="지금 쓰는 편">
            <div className="dforming__head">지금 쓰는 편 <small>내 말이 모이는 중</small></div>
            <p>{t.forming}</p>
            <small>{t.aiFlow ? `다 이야기했으면 "일기로 정리해 줘" — ${t.name}의 말은 빼고 내 말로 옮겨요` : '질문에 다 답하면 내 말 그대로 초안이 돼요'}</small>
          </section>
        ) : !t.sections.length ? (
          <div className="dpanel__empty">
            <p>{t.past ? '이 날은 비어 있어요' : '아직 남긴 편이 없어요'}</p>
            <small>{josaHint(t)}</small>
          </div>
        ) : null}
        <DoneList t={t} onOpenTask={onOpenTask} />
      </div>
    </aside>
  )
}
const josaHint = (t: TalkState) => (t.aiFlow ? `${t.name}에게 편하게 이야기하면 내 말로 일기를 정리해 줘요` : '기분을 고르고 질문에 답하면 일기가 돼요')

/** 그날 끝낸 할 일(접힘) — 항목 클릭 = 할 일 열기. XP는 보이지 않는다(28 §8.1-8) */
export function DoneList({ t, onOpenTask }: { t: TalkState; onOpenTask: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const rows = t.stats.rows
  if (!rows.length) return null
  return (
    <div className="ddone">
      <button className="ddone__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <CheckSquare />{t.past ? '그날' : '오늘'} 끝낸 할 일 <span>{rows.length}개</span>{open ? <ChevronDown /> : <ChevronRight />}
      </button>
      {open && (
        <ul>
          {rows.map((r) => <li key={r.id}><time>{hhmm(r.completed_at)}</time><button onClick={() => onOpenTask(r.id)}>{r.title || '제목 없음'}</button></li>)}
        </ul>
      )}
    </div>
  )
}

/** 편 미리보기(그냥 쓰기 옆 열) — 지금 글을 편으로 나눠 보여 준다 */
export function SectionsPreview({ content }: { content: string }) {
  const ss = parseSections(content)
  if (!ss.length) return null
  return <div className="dpreview">{ss.map((s, i) => <section key={i} className="ddraft is-saved"><SectionView section={s} /></section>)}</div>
}
