// 19 밀린 일 정리 — 들어가는 곳(§3.1)과 예방 장치(§4): 앱 호스트 · 만료됨 위 카드 · 오늘 접기 줄 · 어제 못 한 일 띠 · 주간 리포트 줄 · 가져오기 버튼 · 설정
import { X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../Toast'
import { useQuery } from '../../data/useQuery'
import { dayKey } from '../../lib/dates'
import { weekStart } from '../../lib/calendar'
import {
  bandDismissed, cardHidden, dismissBand, hideCard, KEYS, OVERDUE, readSnapshot, restoreRows, runAutoNoDate, snapshotValid, undoCleanup
} from '../../data/overdue'
import { now } from '../../data/mutations'
import { AutoTrashSettingRows } from './AutoTrash'
import { CleanupDialog } from './CleanupDialog'
import { openOverdueCleanup, useDeviceFlag, useOpenRequests, useOverdueCount, type OpenOptions } from './hooks'
import './overdue.css'

export { openOverdueCleanup }

/** App에 한 번: 정리 대화 상자 열기(⌘K·설정 창·카드) + 자동 규칙(하루 한 번, 기본 꺼짐) */
export function OverdueHost() {
  const [open, setOpen] = useState<OpenOptions>()
  const toast = useToast()
  useOpenRequests(useCallback((o: OpenOptions) => setOpen(o), []))
  useEffect(() => {
    const tick = async () => {
      const r = await runAutoNoDate(dayKey())
      if (r.ids.length) toast.show(`만료 ${OVERDUE.autoDays}일이 지난 ${r.ids.length}개의 날짜를 뺐어요`, () => restoreRows(r.snapshot))
    }
    void tick()
    const id = window.setInterval(() => void tick(), 30 * 60_000) // 자정을 넘겨 켜 둔 경우
    return () => window.clearInterval(id)
  }, [toast])
  return open ? <CleanupDialog only={open.ids} onClose={() => setOpen(undefined)} /> : null
}

/** §3.1 만료됨 묶음 맨 위 카드(만료 20개 초과, "나중에" = 7일 숨김) */
export function OverdueCard({ today }: { today: string }) {
  const count = useOverdueCount(today) ?? 0
  const [, bump] = useState(0)
  if (count <= OVERDUE.cardMin || cardHidden(today)) return null
  return (
    <div className="od-banner" role="note">
      <span className="od-banner__text">밀린 할 일 <b>{count.toLocaleString('ko-KR')}개</b> — 3분이면 정리할 수 있어요</span>
      <button className="od-banner__go" onClick={() => openOverdueCleanup()}>정리하기</button>
      <button className="od-banner__later" onClick={() => { hideCard(today); bump((x) => x + 1) }}>나중에</button>
    </div>
  )
}

/** §4 오늘 화면: 7일 넘은 만료를 접은 한 줄 */
export function FoldRow({ count }: { count: number }) {
  return (
    <button className="od-fold" onClick={() => openOverdueCleanup()}>
      <span>오래된 만료 {count.toLocaleString('ko-KR')}개</span><span className="od-fold__go">— 정리하기</span>
    </button>
  )
}
export const useFoldSetting = () => useDeviceFlag(KEYS.fold, true)

/** §4 아침 첫 실행: 어제 못 한 일 띠(그날 닫으면 다시 안 뜸) */
export function YesterdayBand({ today, onMove }: { today: string; onMove: (ids: string[]) => void }) {
  const yesterday = dayKey(-1, new Date(`${today}T00:00`))
  const rows = useQuery<{ id: string }>(
    `SELECT t.id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
      WHERE t.status = 0 AND t.deleted_at IS NULL AND l.archived_at IS NULL AND substr(t.due_at, 1, 10) = ?
        AND (t.parent_id IS NULL OR t.parent_id NOT IN (SELECT id FROM tasks WHERE status = 0 AND substr(due_at, 1, 10) = ?))`, [yesterday, yesterday]
  ) ?? []
  const [closed, setClosed] = useState(() => bandDismissed(today))
  if (closed || !rows.length) return null
  const close = () => { dismissBand(today); setClosed(true) }
  const ids = rows.map((r) => r.id)
  return (
    <div className="od-band" role="note">
      <span className="od-band__text">어제 못 한 {rows.length}개 — 오늘로 옮길까요?</span>
      <button className="od-band__go" onClick={() => { onMove(ids); close() }}>옮기기</button>
      <button className="od-band__btn" onClick={() => { openOverdueCleanup({ ids }); close() }}>하나씩</button>
      <button className="od-band__x" aria-label="닫기" onClick={close}><X /></button>
    </div>
  )
}

/** §4 주간 리포트 줄: 이번 주 만료 N개 [정리하기] */
export function OverdueWeekLine({ voice }: { voice?: boolean }) {
  const today = dayKey()
  // 어제가 든 주(월요일 시작)의 만료: 월요일에는 막 끝난 지난주(주간 리포트가 나오는 때), 다른 날에는 이번 주 월요일~어제
  const from = weekStart(dayKey(-1, new Date(`${today}T00:00`)))
  const lastWeek = from < weekStart(today)
  const n = useQuery<{ n: number }>(
    `SELECT count(*) AS n FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
      WHERE t.status = 0 AND t.deleted_at IS NULL AND l.archived_at IS NULL AND substr(t.due_at, 1, 10) >= ? AND substr(t.due_at, 1, 10) < ?`, [from, today]
  )?.[0]?.n ?? 0
  if (!n) return null
  return (
    <p className="od-week">
      <span>{lastWeek ? '지난주' : '이번 주'} 만료 {n}개{voice ? ` — ${lastWeek ? '이번 주' : '다음 주'}로 넘길 건 넘기자` : ''}</span>
      <button className="od__link" onClick={() => openOverdueCleanup()}>정리하기</button>
    </p>
  )
}

/** 17 가져오기 끝 화면: 가져온 뒤 만료가 많으면 정리 버튼 */
export function OverdueImportButton({ onOpen }: { onOpen?: () => void }) {
  const count = useOverdueCount(dayKey()) ?? 0
  if (count <= OVERDUE.cardMin) return null
  return <button type="button" onClick={() => { onOpen?.(); openOverdueCleanup() }}>밀린 일 {count.toLocaleString('ko-KR')}개 정리</button>
}

/** 설정 › 할 일 */
export function OverdueSettings() {
  const [fold, setFold] = useDeviceFlag(KEYS.fold, true)
  const [auto, setAuto] = useDeviceFlag(KEYS.auto, false)
  const [snap, setSnap] = useState(() => readSnapshot())
  const [msg, setMsg] = useState('')
  const canUndo = snapshotValid(snap, now())
  const sw = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button className={`dp__switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)}><span /></button>
  )
  return (
    <>
      <h2>할 일</h2>
      <div className="settings-card">
        <div className="settings-row"><span>밀린 일 정리<small className="od-set__hint">만료된 할 일을 묶음·같은 일·하나씩으로 다시 정해요</small></span>
          <button className="od-set__btn" onClick={() => openOverdueCleanup()}>열기</button></div>
        <AutoTrashSettingRows />
        <div className="settings-row"><span>오늘에서 오래된 만료 접기<small className="od-set__hint">{OVERDUE.foldDays}일 넘은 만료를 한 줄로 접어요</small></span>{sw(fold, setFold, '오늘에서 오래된 만료 접기')}</div>
        <div className="settings-row"><span>만료 {OVERDUE.autoDays}일이 지나면 자동으로 날짜 빼기<small className="od-set__hint">켜면 하루에 한 번, 토스트로 알려요</small></span>{sw(auto, setAuto, '자동으로 날짜 빼기')}</div>
        <div className="settings-row"><span>마지막 정리 되돌리기<small className="od-set__hint">{msg || (canUndo ? `${snap!.rows.length}개 · 정리 뒤 ${OVERDUE.undoHours}시간 안` : '되돌릴 정리가 없어요')}</small></span>
          <button className="od-set__btn" disabled={!canUndo} onClick={async () => { const k = await undoCleanup(); setSnap(readSnapshot()); setMsg(k ? `${k}개를 되돌렸어요` : '되돌릴 정리가 없어요') }}>되돌리기</button></div>
      </div>
    </>
  )
}
