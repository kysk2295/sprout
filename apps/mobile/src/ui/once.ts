// 같은 순간 두 번 불려도 한 번만 — 끝날 때까지 다시 부르지 않는다(안드로이드 키보드 엔터가 제출을 두 번 보내는 일, 빠른 두 번 누르기).
// state로 잠그면 다시 그리기 전의 두 번째 호출이 통과하므로 ref로 잠근다(2026-10-25 UX 점검 P1).
import { useCallback, useRef } from 'react'

export function useOnce<A extends unknown[]>(fn: (...a: A) => unknown): (...a: A) => Promise<void> {
  const busy = useRef(false)
  const f = useRef(fn)
  f.current = fn
  return useCallback(async (...a: A) => {
    if (busy.current) return
    busy.current = true
    try { await f.current(...a) } finally { busy.current = false }
  }, [])
}
