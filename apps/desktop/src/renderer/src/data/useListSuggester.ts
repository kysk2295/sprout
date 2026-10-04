// 30 §B.3 ② 새 할 일 자동 분류 — App에 항상 붙어 있다(예전 작업 지도 자동 분류 자리).
// 기본함에 새로 들어온 할 일(기준 시각 뒤)을 5초 모아 한 번에(최대 20개) 묻는다.
// 확실 + 이미 있는 리스트 → 바로 옮기고 토스트 + 되돌리기(되돌리면 그 할 일은 다시 제안하지 않음). 애매하면 제안 칩만.
// 확실 = 낱말 검사(AI 없이, 한 리스트의 최근 할 일 3개 이상과 겹침) 또는 AI 확신 점수 85 이상(listSuggest.ts).
// AI를 못 쓰면 아무것도 하지 않고(칩 없음) 앱 포커스·10분마다 다시 시도한다.
import { useEffect, useRef } from 'react'
import { useToast } from '../components/Toast'
import { withRo } from '../lib/dates'
import { useQuery } from './useQuery'
import { acceptSuggestions, askAi, autoSortEnabled, keywordSure, readSuggestContext, serial, shouldAutoMove, suggestBaseline, suggestStore, SUGGEST, type Suggestion } from './listSuggest'

const WAIT = 5000
const RETRY = 10 * 60 * 1000
const PENDING_SQL = `SELECT t.id FROM tasks t JOIN lists l ON l.id = t.list_id
  WHERE l.kind = 'inbox' AND t.deleted_at IS NULL AND t.status = 0 AND t.title != '' AND t.parent_id IS NULL AND t.created_at > ?
  ORDER BY t.created_at LIMIT 100`

export function useListSuggester(): void {
  const toast = useToast()
  const since = useRef(suggestBaseline()).current
  const pending = useQuery<{ id: string }>(PENDING_SQL, [since])
  const timer = useRef<number>(undefined)
  const blockedUntil = useRef(0)
  const running = useRef(false)
  const tick = useRef<() => void>(() => {})
  const latest = useRef(pending)
  latest.current = pending
  const skip = useRef(new Set<string>())
  const waiting = () => {
    const s = suggestStore.get()
    return (latest.current ?? []).map((r) => r.id).filter((id) => !skip.current.has(id) && !s.items[id] && !s.dismissed[id])
  }

  tick.current = () => {
    if (!waiting().length || running.current || timer.current || Date.now() < blockedUntil.current) return
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      running.current = true
      const batch = waiting().slice(0, SUGGEST.batch)
      batch.forEach((id) => skip.current.add(id))
      void serial(async () => {
        const ctx = await readSuggestContext()
        const tasks = ctx.tasks.filter((t) => batch.includes(t.id))
        // ① 낱말 검사로 확실한 것은 AI 없이(AI가 꺼져 있어도 옮긴다) ② 나머지만 AI에
        const pre = keywordSure(tasks, ctx.lists, ctx.recent)
        const rest = tasks.filter((t) => !pre.some((p) => p.taskId === t.id))
        let aiError: unknown
        let res: Suggestion[] = pre
        try { res = [...pre, ...(await askAi(rest, ctx.lists, { signal: new AbortController().signal, recent: ctx.recent }))] } catch (e) { aiError = e }
        if (aiError && !pre.length) throw aiError
        // 기다리는 사이 사용자가 옮겼으면 건너뛴다
        const fresh = await readSuggestContext()
        const byId = new Map(fresh.tasks.map((t) => [t.id, t]))
        const s = suggestStore.get()
        const auto = res.filter((x) => fresh.inbox && shouldAutoMove(x, byId.get(x.taskId), fresh.inbox.id, { enabled: autoSortEnabled(), dismissed: s.dismissed, since }))
        suggestStore.put(res.filter((x) => !auto.includes(x)))
        if (!auto.length) { if (aiError) throw aiError; return }
        const r = await acceptSuggestions(auto.map((x) => ({ taskId: x.taskId, listId: x.listId! })))
        if (!r.moved) { if (aiError) throw aiError; return }
        const undo = async () => { await r.undo(); suggestStore.dismiss(auto.map((x) => x.taskId)) }
        if (auto.length === 1) {
          const l = fresh.lists.find((x) => x.id === auto[0].listId)!
          toast.show(`${withRo(`${l.emoji ?? ''}${l.name}`)} 옮겼어요`, undo)
        } else toast.show(`새 할 일 ${r.moved}개를 리스트로 옮겼어요`, undo)
        if (aiError) throw aiError // 낱말로 옮긴 것은 끝, 나머지는 나중에 AI로 다시
      })
        .catch((e) => {
          console.warn('[listSuggest] 새 할 일 분류 보류', e)
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
