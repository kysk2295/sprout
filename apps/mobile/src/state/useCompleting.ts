// 체크 → 잠깐 머문 뒤 완료(39 §4.1, 결정 ① 0.35초).
// 누르면 그 행은 바로 완료 모양(pending)으로 그리고, HOLD.complete 뒤에 실제로 쓴다. 그 사이 다시 누르면 취소(쓰지 않음).
// 화면을 떠나거나(언마운트) 앱이 뒤로 가면 남은 것을 바로 쓴다 — 누른 완료를 잃지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { HOLD } from '../ui/motion'

export function useCompleting(commit: (id: string) => void | Promise<void>) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const commitRef = useRef(commit)
  commitRef.current = commit
  const drop = (id: string) => setPending((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n })
  const fire = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    // 쓰기가 목록에 닿기 전에 빈 상자로 돌아가 깜빡이지 않게, 쓴 뒤 잠깐 더 완료 모양으로 둔다(그 사이 행이 빠진다)
    void Promise.resolve(commitRef.current(id)).finally(() => setTimeout(() => drop(id), 700))
  }, [])
  const flush = useCallback(() => { for (const id of [...timers.current.keys()]) fire(id) }, [fire])
  /** 체크를 누름: 머무는 중이면 취소, 아니면 완료 모양으로 머무르기 시작 */
  const toggle = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
      drop(id)
      return false
    }
    setPending((s) => new Set(s).add(id))
    timers.current.set(id, setTimeout(() => fire(id), HOLD.complete))
    return true
  }, [fire])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active') flush() })
    return () => { sub.remove(); flush() }
  }, [flush])
  return { pending, toggle, flush }
}
