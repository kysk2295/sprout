// 14 §0.3 새 할 일 자동 분류. App에 항상 붙어 있다.
// 새 할 일(분류 행이 없는 것)을 5초 모아 한 번에(최대 20개) 분류하고 토스트로 알린다.
// AI를 못 쓰면 미분류로 두고 앱 포커스·10분마다 다시 시도한다. 영역이 하나도 없으면(처음 상태) 건드리지 않는다.
import { useEffect, useRef } from 'react'
import { useToast } from '../components/Toast'
import { eulReul } from '../lib/josa'
import { useQuery } from './useQuery'
import { classifierBaseline, classifyTasks, LIMITS, placeTaskStmts, readMap, serial } from './map'
import { run, uuid } from './mutations'

const WAIT = 5000
const RETRY = 10 * 60 * 1000
const PENDING_SQL = `SELECT t.id FROM tasks t LEFT JOIN task_areas ta ON ta.task_id = t.id
  WHERE ta.id IS NULL AND t.deleted_at IS NULL AND t.status = 0 AND t.title != '' AND t.created_at > ?
    AND EXISTS (SELECT 1 FROM map_areas) ORDER BY t.created_at LIMIT 100`

export function useMapClassifier(): void {
  const toast = useToast()
  const since = useRef(classifierBaseline()).current
  const pending = useQuery<{ id: string }>(PENDING_SQL, [since])
  const timer = useRef<number>(undefined)
  const blockedUntil = useRef(0)
  const running = useRef(false)
  const tick = useRef<() => void>(() => {})
  const latest = useRef(pending)
  latest.current = pending
  // 답을 받았는데도 행이 안 생긴 할 일(AI가 빠뜨림)은 다음 재시도 때까지 묻지 않는다
  const skip = useRef(new Set<string>())
  const waiting = () => (latest.current ?? []).map((r) => r.id).filter((id) => !skip.current.has(id))

  tick.current = () => {
    const ids = waiting()
    if (!ids.length || running.current || timer.current || Date.now() < blockedUntil.current) return
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      running.current = true
      const ctrl = new AbortController()
      const batch = waiting().slice(0, LIMITS.batch)
      batch.forEach((id) => skip.current.add(id))
      void serial(() => classifyTasks(batch, { signal: ctrl.signal, runId: uuid() }))
        .then(async (r) => {
          if (r.assigned.length === 1 && !r.review) {
            const a = r.assigned[0]
            toast.show(`AI가 '${a.title.length > 20 ? `${a.title.slice(0, 20)}…` : a.title}'${eulReul(a.title).slice(a.title.length)} ${a.path}에 넣었어요`, async () => {
              // 바꾸기(되돌리기): 미분류로 두고 직접 고른 것으로 친다 → 다시 자동으로 넣지 않는다
              const { taskAreas } = await readMap()
              await run(...placeTaskStmts(taskAreas, a.taskId, null))
            })
          } else if (r.assigned.length + r.review > 0) {
            toast.show(`새 할 일 ${r.assigned.length + r.review}개를 정리했어요${r.review ? ` · 확인 필요 ${r.review}개` : ''}`)
          }
        })
        .catch((e) => {
          // AI 없음·형식 오류 모두 미분류로 두고 나중에 다시
          console.warn('[map] 자동 분류 보류', e)
          blockedUntil.current = Date.now() + RETRY
          batch.forEach((id) => skip.current.delete(id))
        })
        .finally(() => { running.current = false; tick.current() })
    }, WAIT)
  }
  useEffect(() => { tick.current() }, [pending])
  useEffect(() => {
    const retry = () => { blockedUntil.current = 0; skip.current.clear(); tick.current() }
    const every = window.setInterval(retry, RETRY)
    window.addEventListener('focus', retry)
    return () => { window.clearInterval(every); window.removeEventListener('focus', retry); window.clearTimeout(timer.current); timer.current = undefined }
  }, [])
}
