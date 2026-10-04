// 19 밀린 일 정리 — 여러 화면이 같이 쓰는 훅·신호
import { useEffect, useState } from 'react'
import { useQuery } from '../../data/useQuery'
import { KEYS, overdueStorage, readFlag, writeFlag } from '../../data/overdue'

const OPEN_EVENT = 'sprout:overdue-cleanup'
const FLAG_EVENT = 'sprout:overdue-flag'
export type OpenOptions = { ids?: string[] }

/** 어디서든 정리 대화 상자를 연다. 설정 창(다른 창)에서 부르면 localStorage 신호로 메인 창이 연다 */
export function openOverdueCleanup(opts: OpenOptions = {}) {
  window.dispatchEvent(new CustomEvent<OpenOptions>(OPEN_EVENT, { detail: opts }))
  overdueStorage.set(KEYS.open, String(Date.now()))
}
export function useOpenRequests(on: (opts: OpenOptions) => void) {
  useEffect(() => {
    const local = (e: Event) => on((e as CustomEvent<OpenOptions>).detail ?? {})
    const other = (e: StorageEvent) => { if (e.key === KEYS.open && e.newValue) on({}) }
    window.addEventListener(OPEN_EVENT, local)
    window.addEventListener('storage', other)
    return () => { window.removeEventListener(OPEN_EVENT, local); window.removeEventListener('storage', other) }
  }, [on])
}

/** 기기 설정 스위치(설정 창에서 바꾸면 메인 창도 따라간다) */
export function useDeviceFlag(key: string, def: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => readFlag(key, def))
  useEffect(() => {
    const sync = () => setOn(readFlag(key, def))
    const storage = (e: StorageEvent) => { if (e.key === key) sync() }
    window.addEventListener('storage', storage)
    window.addEventListener(FLAG_EVENT, sync)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(FLAG_EVENT, sync) }
  }, [key, def])
  return [on, (v: boolean) => { writeFlag(key, v); setOn(v); window.dispatchEvent(new Event(FLAG_EVENT)) }]
}

/** 열린 만료 할 일 수(보관 리스트·휴지통 제외) */
export function useOverdueCount(today: string): number | undefined {
  return useQuery<{ n: number }>(
    `SELECT count(*) AS n FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
      WHERE t.status = 0 AND t.deleted_at IS NULL AND l.archived_at IS NULL AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) < ?`, [today]
  )?.[0]?.n
}
