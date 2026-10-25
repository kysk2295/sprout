import { CheckSquare, ChevronDown, ChevronRight, MessageCircle, PenLine, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { parseSections } from '@sprout/schema/diaryPrompts'
import { BYE_ME, END_ME, sessionOf } from '@sprout/schema/diaryTalk'
import { useQuery } from '../../data/useQuery'
import { josa, MESSAGES_BY_DATE_SQL, useDayStats, type DiaryEntry, type DiaryMessage } from '../../data/diary'
import { hhmm } from './dates'
import type { usePhotoAdd } from './Photos'
import { PhotoStrip } from './Photos'
import { SceneCardView } from './SceneCard'
import { useSceneCard } from './sceneData'
import { Tags } from './Sections'

// 15 §11 오른쪽 칸 330 — 오늘의 장면(저절로, sceneCardOf) + 사진 줄(＋ 사진) + 그날 장들(💬 대화로 만든 장 / ✎ 혼자 쓴 장, 고치기 = 혼자 쓰기 메모장으로)
// + `혼자 이어 쓰기` + 그날 끝낸 할 일(접힘, XP 없음). 빈 오른쪽 칸 없음 — 아무것도 없는 날도 장면 자리 안내가 있다.

export function DayPanel({ date, today, entry, name, photo, onSolo, onOpenTask, onOpenDay, head }: {
  date: string; today: string; entry: DiaryEntry | undefined; name: string
  photo: ReturnType<typeof usePhotoAdd>
  onSolo: (index: number | null) => void
  onOpenTask: (id: string) => void
  /** 앨범에서 고른 날 → 기록으로 열기 */
  onOpenDay?: () => void
  head?: React.ReactNode
}) {
  const past = date !== today
  const card = useSceneCard(date, entry)
  const sections = useMemo(() => parseSections(entry?.content), [entry?.content])
  const rows = useQuery<DiaryMessage>(MESSAGES_BY_DATE_SQL, [date])
  // 지금 이야기 중인 편(아직 장이 안 됨) — 끝나면 여기에 한 장
  const talking = useMemo(() => sessionOf((rows ?? []).filter((m) => m.safety !== 1)).rows.some((m) => m.role === 'me' && !m.safety && m.content !== END_ME && m.content !== BYE_ME), [rows])
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  // 장면이 바뀌면(저장·사진) 카드가 다시 생긴다(뒤집힘 → 사진 → 칩)
  const cardKey = card ? `${card.title}|${card.photo?.media_id ?? ''}|${card.mood ?? ''}` : ''
  const [firstKey] = useState(cardKey)
  return (
    <aside className="dpanel" aria-label={past ? '그날의 장면' : '오늘의 장면'}>
      <div className="dpanel__head">
        <b>{head ?? (past ? '그날의 장면' : '오늘의 장면')}</b>
        <small>{onOpenDay ? '누른 날' : '저절로 채워져요'}</small>
      </div>
      <div className="dpanel__scroll">
        {card
          ? <SceneCardView key={cardKey} card={card} variant="side" appear={cardKey !== firstKey || !past} />
          : <div className="dscene-empty"><b>{past ? '이 날은 비어 있어요' : '아직 장면이 없어요'}</b><small>기분 하나, 사진 한 장, 끝낸 할 일만 있어도 {past ? '그날' : '오늘'}의 장면이 저절로 생겨요</small></div>}
        <PhotoStrip photos={photo.photos} pending={photo.pending} onAdd={() => void photo.pick()} busy={photo.busy} />
        {onOpenDay && <button className="dbtn is-soft is-block" onClick={onOpenDay}>이 날 일기 열기</button>}
        {sections.map((sec, i) => {
          const big = open.has(i)
          return (
            <section key={`${i}-${sec.time}-${sec.title}`} className="dpg" aria-label={sec.title || '그날의 장'}>
              <div className="dpg__m">
                {sec.solo ? <PenLine /> : <MessageCircle />}
                <span>{[sec.time, sec.solo ? '혼자 쓰기' : sec.time ? `${josa(name, '와', '과')} 이야기` : null].filter(Boolean).join(' · ') || '일기'}</span>
              </div>
              {sec.title && <b className="dpg__t">{sec.title}</b>}
              {sec.tags.length > 0 && <Tags tags={sec.tags} />}
              <p className={`dpg__b${big ? '' : ' is-clamp'}`} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n })}>{sec.body || '(기분만 남겼어요)'}</p>
              {!onOpenDay && <div className="dpg__acts"><button onClick={() => onSolo(i)}>고치기</button></div>}
            </section>
          )
        })}
        {talking && !onOpenDay && (
          <section className="dpg is-forming"><div className="dpg__m"><MessageCircle /><span>{josa(name, '와', '과')} 이야기 중</span></div><b className="dpg__t">끝나면 여기에 한 장</b><p className="dpg__b">여기까지 ✓ 또는 5분 멈추면 저절로 일기가 돼요</p></section>
        )}
        {!onOpenDay && <button className="dpg-add" onClick={() => onSolo(null)}><Plus />{sections.length ? '혼자 이어 쓰기' : '혼자 쓰기'}<kbd>⌘N</kbd></button>}
        <DoneList date={date} past={past} onOpenTask={onOpenTask} />
      </div>
    </aside>
  )
}

/** 그날 끝낸 할 일(접힘) — 항목 클릭 = 할 일 열기. XP는 보이지 않는다(28 §8.1-8) */
export function DoneList({ date, past, onOpenTask }: { date: string; past: boolean; onOpenTask: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const rows = useDayStats(date).rows
  if (!rows.length) return null
  return (
    <div className="ddone">
      <button className="ddone__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <CheckSquare />{past ? '그날' : '오늘'} 끝낸 할 일 <span>{rows.length}개</span>{open ? <ChevronDown /> : <ChevronRight />}
      </button>
      {open && (
        <ul>
          {rows.map((r) => <li key={r.id}><time>{hhmm(r.completed_at)}</time><button onClick={() => onOpenTask(r.id)}>{r.title || '제목 없음'}</button></li>)}
        </ul>
      )}
    </div>
  )
}
