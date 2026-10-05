// 31 §10.2 모드가 덧붙이는 것 — 점검 띠(목표 고리 · 이번 주 7칸 · 밀린 일 다음 주로) · 정리 모드 옮길 곳 제안 패널.
import { Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useQuery } from '../../data/useQuery'
import { dayKey } from '../../lib/dates'
import { thisWeek } from '../../data/growth'
import { MAP_MODES, MODE_LABEL, nextMonday, overdueOf, weekColumns, type MapMode } from '../../data/mapMoments'
import { acceptSuggestions, chipFor, LISTS_SQL, type SuggestList } from '../../data/listSuggest'
import { openInboxOrganize, openSuggestReview, useInboxTasks, useSuggestState } from '../listSuggest/ListSuggest'
import type { TaskActions } from '../../lib/taskActions'
import { useToast } from '../Toast'
import { addDays } from '@sprout/schema/time'
import { Ring } from './parts'
import { PartnerLine } from './PlanChat'
import type { MapData } from './useMapData'
import './moments.css'

const DAY = ['월', '화', '수', '목', '금', '토', '일']
const batchim = (w: string) => { const c = w.trim().charCodeAt(w.trim().length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0 }

/** 머리 모드 세그먼트 `계획 · 점검 · 정리` */
/** 정리 탭 옆 작은 수 = 기본함이 정리 카드 기준(>20)을 넘었을 때만 — 큰 배너 대신(2026-10-05 정리) */
export function ModeSeg({ mode, onMode, tidyCount = 0 }: { mode: MapMode; onMode: (m: MapMode) => void; tidyCount?: number }) {
  return (
    <span className="map-seg map-mode" role="tablist" aria-label="모드">
      {MAP_MODES.map((m) => (
        <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => onMode(m)}
          title={m === 'tidy' && tidyCount ? `기본함에 ${tidyCount}개 — 정리할까요?` : undefined}>
          {MODE_LABEL[m]}{m === 'tidy' && tidyCount > 0 && <span className="map-mode__n">{tidyCount}</span>}
        </button>
      ))}
    </span>
  )
}

type WeekRow = { id: string; title: string; status: number; due_at: string | null; parent_id: string | null }
export function ReviewBand({ data, actions, onOpen, onGrowth }: { data: MapData; actions: TaskActions; onOpen: (id: string) => void; onGrowth?: () => void }) {
  const today = dayKey()
  const week = thisWeek()
  const rows = useQuery<WeekRow>(`SELECT t.id, t.title, t.status, t.due_at, t.parent_id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
    WHERE t.deleted_at IS NULL AND t.title != '' AND l.archived_at IS NULL AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) >= ? AND substr(t.due_at, 1, 10) < ?
    ORDER BY t.due_at, t.sort_order`, [week, addDays(week, 7)])
  const late = useQuery<WeekRow>(`SELECT t.id, t.title, t.status, t.due_at, t.parent_id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
    WHERE t.deleted_at IS NULL AND t.status = 0 AND t.parent_id IS NULL AND l.archived_at IS NULL AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) < ?
    ORDER BY t.due_at`, [today])
  const cols = useMemo(() => weekColumns(rows ?? [], week, today), [rows, week, today])
  const overdue = useMemo(() => overdueOf(late ?? [], today), [late, today])
  const goals = data.goals
  // 31 §11.9 같은 목소리 한 줄: 덜 찬 목표(가장 많이 남은 것) → 연결된 열린 할 일을 일요일에 · 다음 주로. 칩은 아래 컨트롤과 같은 moveDates
  const partner = useMemo(() => {
    const open = goals.filter((g) => g.status !== 'achieved' && g.progress < g.target).sort((a, b) => (b.target - b.progress) - (a.target - a.progress))[0]
    if (open) {
      const ids = data.links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.from_id === open.id && l.to_status === 0).map((l) => l.to_id)
      const n = Math.min(open.progress, open.target)
      if (!ids.length) return { text: `이번 주 ${open.title}${batchim(open.title) ? '은' : '는'} ${n}/${open.target} 했네. 남은 것도 할 수 있어!`, chips: [] }
      const sunday = addDays(week, 6) < today ? today : addDays(week, 6)
      return {
        text: `이번 주 ${open.title}${batchim(open.title) ? '은' : '는'} ${n}/${open.target} 했네, 남은 건 일요일에 할까?`,
        chips: [
          { label: '응, 일요일에', run: () => void actions.moveDates(ids, sunday, `남은 ${ids.length}개를 일요일로 옮겼어요`) },
          { label: '다음 주로 미룰래', run: () => void actions.moveDates(ids, nextMonday(today), `남은 ${ids.length}개를 다음 주로 옮겼어요`) }
        ]
      }
    }
    if (!goals.length && overdue.length) return { text: `밀린 게 ${overdue.length}개 있네. 다음 주로 넘길까?`, chips: [{ label: '다음 주로', run: () => void actions.moveDates(overdue.map((t) => t.id), nextMonday(today), `밀린 ${overdue.length}개를 다음 주로 옮겼어요`) }] }
    if (goals.length && goals.every((g) => g.status === 'achieved' || g.progress >= g.target)) return { text: '이번 주 목표 다 채웠어! 🎉', chips: [] }
    return { text: '이번 주 잘 가고 있어!', chips: [] }
  }, [goals, data.links, overdue, week, today, actions])
  return (
    <div className="mm-band" aria-label="이번 주 점검">
      <PartnerLine text={partner.text} chips={partner.chips} />
      <div className="mm-goals">
        {goals.length ? goals.slice(0, 5).map((g) => (
          <div key={g.id} className={`mm-goal${g.status === 'achieved' ? ' is-done' : ''}`} title={g.title}>
            <Ring done={Math.min(g.progress, g.target)} total={g.target} />
            <span className="mm-goal__t">{g.title}</span>
            <span className="mm-goal__n">{Math.min(g.progress, g.target)}/{g.target}</span>
          </div>
        )) : (
          <div className="mm-goals__empty">이번 주 목표가 없어요 {onGrowth && <button className="map-btn map-btn--text" onClick={onGrowth}>목표 정하기</button>}</div>
        )}
      </div>
      <div className="mm-week">
        {cols.map((c, i) => (
          <div key={c.day} className={`mm-day${c.day === today ? ' is-today' : ''}`}>
            <span className="mm-day__n">{DAY[i]} {Number(c.day.slice(8))}</span>
            {c.bars.slice(0, 3).map((b) => (
              <button key={b.id} className={`mm-bar is-${b.tone}`} title={b.title} onClick={() => onOpen(b.id)}>{b.title}</button>
            ))}
            {c.bars.length > 3 && <span className="mm-day__more">+{c.bars.length - 3}</span>}
          </div>
        ))}
      </div>
      {overdue.length > 0 && (
        <div className="mm-late">
          <span className="mm-late__t">밀린 {overdue.length}개를 다음 주로 옮길까요? <span className="mm-late__names">{overdue.slice(0, 3).map((t) => t.title).join(' · ')}{overdue.length > 3 ? ` 외 ${overdue.length - 3}개` : ''}</span></span>
          <button className="map-btn map-btn--primary" onClick={() => void actions.moveDates(overdue.map((t) => t.id), nextMonday(today), `밀린 ${overdue.length}개를 다음 주로 옮겼어요`)}>다음 주로</button>
        </div>
      )}
    </div>
  )
}

/** 정리 모드: 기본함 할 일의 옮길 곳 제안(30 §B.3 칩) — n개 옮기기 · 하나씩 · (제안 없음) 기본함 정리 */
export function TidyPanel({ aiOk, onOpen }: { aiOk: boolean | null; onOpen: (id: string) => void }) {
  const s = useSuggestState()
  const lists = useQuery<SuggestList>(LISTS_SQL) ?? []
  const inbox = useInboxTasks()
  const toast = useToast()
  const [closed, setClosed] = useState(false)
  const sure = useMemo(() => inbox.map((t) => ({ t, list: chipFor(s, t.id, lists) })).filter((x) => x.list) as { t: { id: string; title: string }; list: SuggestList }[], [inbox, s, lists])
  if (closed) return null
  const apply = async () => {
    const r = await acceptSuggestions(sure.map((x) => ({ taskId: x.t.id, listId: x.list.id })))
    if (r.moved) toast.show(`할 일 ${r.moved}개를 리스트로 옮겼어요`, r.undo)
  }
  const label = (l: SuggestList) => `${l.emoji ? `${l.emoji} ` : ''}${l.name}`
  return (
    <aside className="mm-tidy" aria-label="옮길 곳 제안">
      <header className="mm-tidy__head">
        <Sparkles className="mm-tidy__spark" /><b>옮길 곳 제안</b><span className="mm-tidy__count">기본함 {inbox.length}</span>
        <button className="icon-btn mm-tidy__x" aria-label="닫기" onClick={() => setClosed(true)}><X /></button>
      </header>
      {/* 31 §11.9 같은 목소리 한 줄 — 칩은 아래 단추와 같은 동작 */}
      {inbox.length === 0
        ? <PartnerLine stacked text="기본함이 깨끗해! ✓" chips={[]} />
        : sure.length > 0
          ? <PartnerLine stacked text={`이 ${inbox.length}개, 이렇게 나눠 볼게. 괜찮아?`} chips={[{ label: '좋아', run: () => void apply() }, { label: '하나씩 볼래', run: openSuggestReview }]} />
          : <PartnerLine stacked text="어디에 둘지 같이 정해 볼까?" chips={aiOk === false ? [] : [{ label: '좋아', run: openInboxOrganize }]} />}
      {inbox.length === 0 ? null : (
        <>
          <p className="mm-tidy__note">{sure.length}개 확실, {inbox.length - sure.length}개는 직접</p>
          <div className="mm-tidy__rows">
            {sure.slice(0, 6).map(({ t, list }) => (
              <button key={t.id} className="mm-tidy__row" onClick={() => onOpen(t.id)} title={t.title}>
                <span className="mm-tidy__task">{t.title}</span><span className="mm-tidy__to">→ {label(list)}</span>
              </button>
            ))}
            {sure.length > 6 && <span className="mm-tidy__more">외 {sure.length - 6}개</span>}
          </div>
          {aiOk === false && <p className="mm-tidy__note">지금은 AI를 쓸 수 없어요. 끌어서 직접 옮길 수 있어요.</p>}
          <footer className="mm-tidy__acts">
            {sure.length > 0 && <button className="map-btn" onClick={openSuggestReview}>하나씩 보기</button>}
            {sure.length > 0
              ? <button className="map-btn map-btn--primary" onClick={() => void apply()}>{sure.length}개 옮기기</button>
              : <button className="map-btn map-btn--primary" disabled={aiOk === false} onClick={openInboxOrganize}>기본함 정리</button>}
          </footer>
        </>
      )}
    </aside>
  )
}
