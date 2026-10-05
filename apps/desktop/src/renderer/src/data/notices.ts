// 01 §3.3 레일 종 알림 패널 — 화면 쪽. 데스크톱은 메인 프로세스 기록(window.sprout.notices), 웹 미리보기는 localStorage.
import { useEffect, useState } from 'react'
import { markRead, markUndone, mergeNotice, type Notice, type NoticeInput } from '../../../shared/notices'
import { addDays } from '@sprout/schema/time'
import { thisWeek } from './growth'
import { useQuery } from './useQuery'

export type { Notice, NoticeInput, NoticeTarget } from '../../../shared/notices'

type Api = { list: () => Promise<Notice[]>; add: (i: NoticeInput) => Promise<void>; read: (id?: string) => Promise<void>; undone: (id: string) => Promise<void>; onChanged: (cb: (items: Notice[]) => void) => () => void }

// 웹 미리보기: 같은 규칙으로 localStorage에
const LS_KEY = 'sprout.notices'
const listeners = new Set<(items: Notice[]) => void>()
const lsRead = (): Notice[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] } }
const lsWrite = (items: Notice[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch { /* storage off */ } listeners.forEach((l) => l(items)) }
const localApi: Api = {
  list: async () => lsRead(),
  add: async (i) => lsWrite(mergeNotice(lsRead(), i, new Date().toISOString(), crypto.randomUUID())),
  read: async (id) => lsWrite(markRead(lsRead(), id)),
  undone: async (id) => lsWrite(markUndone(lsRead(), id)),
  onChanged: (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }
}
const api = (): Api => window.sprout?.notices ?? localApi

/** 알림 한 줄 넣기(같은 key는 한 번만 — autotag는 합친다). 실패해도 화면 흐름은 막지 않는다 */
export function addNotice(input: NoticeInput) {
  void api().add(input).catch((e) => console.warn('[notices] add failed', e))
}
export const readNotice = (id?: string) => api().read(id)
export const markNoticeUndone = (id: string) => api().undone(id)

export function useNotices(): Notice[] {
  const [items, setItems] = useState<Notice[]>([])
  useEffect(() => {
    let alive = true
    void api().list().then((l) => alive && setItems(l)).catch(() => {})
    const off = api().onChanged((l) => setItems(l))
    return () => { alive = false; off() }
  }, [])
  return items
}

/** §3.3 주간 리포트: 새 주에 지난주 리포트가 생기면 한 줄(지난주 것만 — 처음 설치 때 예전 리포트가 쏟아지지 않게). 리포트를 이미 열었으면 읽음 */
export function useReportNotices() {
  const lastWeek = addDays(thisWeek(), -7)
  const row = useQuery<{ week_start: string; xp_total: number; seen_at: string | null }>('SELECT week_start, xp_total, seen_at FROM weekly_reports WHERE week_start = ? ORDER BY created_at, id LIMIT 1', [lastWeek])?.[0]
  useEffect(() => {
    if (!row) return
    const [, m, d] = row.week_start.split('-').map(Number)
    addNotice({ kind: 'report', key: `report:${row.week_start}`, title: '주간 리포트가 도착했어요', body: `${m}월 ${d}일 주${row.xp_total ? ` · +${row.xp_total} XP` : ''}`, target: { view: 'growth' }, read: !!row.seen_at })
  }, [row?.week_start]) // eslint-disable-line react-hooks/exhaustive-deps
  // 성장 화면에서 리포트를 열면(seen_at) 알림 줄도 읽음으로
  useEffect(() => {
    if (!row?.seen_at) return
    void api().list().then((l) => { const n = l.find((x) => x.key === `report:${row.week_start}` && !x.read); if (n) void readNotice(n.id) }).catch(() => {})
  }, [row?.week_start, row?.seen_at])
}

