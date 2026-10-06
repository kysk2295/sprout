// PowerSync 감시 쿼리를 "바뀐 행만, 바뀔 때만" 받게(39 §11 성능 규칙).
// 라이브러리 useQuery의 두 가지 문제(2026-10-06 측정):
//  1) 테이블이 바뀔 때마다 결과 배열·행 객체를 전부 새로 준다 → 할 일 하나 체크하면 모든 행이 다시 그려진다.
//  2) 안에서 useStatus()를 불러서, 동기화 상태가 바뀔 때마다(쓰기 한 번에 올리기 시작·끝 등 4~5번) 그 훅을 쓰는 모든 화면이 다시 그려진다.
// useRows는 차등 감시(differentialWatch)를 직접 열어 결과가 같으면 아무것도 안 하고, 그대로인 행은 같은 객체를 돌려준다 → memo 행이 건너뛴다.
// 행 비교는 JSON 전체(정렬에 쓰는 칸이 행에 들어 있어야 순서 바뀜도 잡힌다 — 할 일 COLUMNS에는 sort_order·due_at 등이 있다).
import { GetAllQuery, type DifferentialWatchedQuery, type StandardWatchedQuery } from '@powersync/react-native'
import { useEffect, useRef, useState } from 'react'
import { db } from './db'

const json = (r: unknown) => JSON.stringify(r)
/** id 칸이 있으면 그것으로, 없으면 행 전체로 같은 행을 찾는다(같은 행이 둘이어도 개수는 그대로 나온다) */
const rowComparator = {
  keyBy: (r: unknown) => (r && typeof (r as { id?: unknown }).id === 'string' ? (r as { id: string }).id : json(r)),
  compareBy: json
}

type Out<T> = { data: T[]; isLoading: boolean }
type Params = unknown[]

type Watch<T> = DifferentialWatchedQuery<T> | StandardWatchedQuery<ReadonlyArray<Readonly<T>>>

/** useQuery 대신(같은 꼴) — 차등: 결과가 같으면 다시 그리지 않고 그대로인 행은 같은 객체. 돌려받은 배열·행은 고치지 않는다 */
export function useRows<T>(sql: string, params: Params = [], opts?: { throttleMs?: number }): Out<T> {
  return useWatch<T>(sql, params, opts?.throttleMs, true)
}
/** useQuery와 같은 뜻(테이블이 바뀔 때마다 새 결과)이지만 동기화 상태가 바뀔 때는 다시 그리지 않는다 — 앱 전체 기본 */
export function useLiveQuery<T>(sql: string, params: Params = []): Out<T> {
  return useWatch<T>(sql, params, undefined, false)
}

function useWatch<T>(sql: string, params: Params, throttleMs: number | undefined, diff: boolean): Out<T> {
  const key = `${sql}\u0001${json(params)}`
  const ref = useRef<{ w: Watch<T>; key: string } | null>(null)
  const make = (): Watch<T> => {
    const q = db.query<T>({ sql, parameters: params as never[] })
    const t = throttleMs !== undefined ? { throttleMs } : {}
    return diff ? q.differentialWatch({ rowComparator, ...t }) : q.watch(t)
  }
  if (!ref.current || ref.current.w.closed) ref.current = { w: make(), key }
  else if (ref.current.key !== key) {
    ref.current.key = key
    void ref.current.w.updateSettings({ query: new GetAllQuery<T>({ sql, parameters: params as never[] }), ...(throttleMs !== undefined ? { throttleMs } : {}) })
  }
  const w = ref.current.w
  const [out, setOut] = useState<Out<T>>(() => ({ data: w.state.data as T[], isLoading: w.state.isLoading }))
  useEffect(() => {
    const sync = () => setOut((o) => (o.data === w.state.data && o.isLoading === w.state.isLoading ? o : { data: w.state.data as T[], isLoading: w.state.isLoading }))
    sync()
    const off = w.registerListener({ onStateChange: sync })
    return () => { off(); void w.close() }
  }, [w])
  return out
}

/** 숫자 배지(서랍 개수 등): 한 번의 쓰기가 여러 쿼리를 차례로 깨워도 한 번에 모아 다시 그린다 — 손가락 움직임 중 JS 스레드를 덜 쓴다 */
export const COUNT_THROTTLE = { throttleMs: 250 }

/** 동기화 상태 중 화면이 쓰는 세 가지만 — useStatus()는 올리기·내려받기 진행마다 다시 그린다(쓰기 한 번에 4~5번) */
export function useSyncFlags(): { offline: boolean; syncError: boolean; hasSynced: boolean } {
  const read = () => {
    const s = db.currentStatus
    return { offline: !s.connected && !!s.lastSyncedAt, syncError: !!(s.dataFlowStatus?.uploadError ?? s.dataFlowStatus?.downloadError), hasSynced: !!s.hasSynced }
  }
  const [f, setF] = useState(read)
  useEffect(() => db.registerListener({
    statusChanged: () => setF((o) => { const n = read(); return n.offline === o.offline && n.syncError === o.syncError && n.hasSynced === o.hasSynced ? o : n })
  }), [])
  return f
}
