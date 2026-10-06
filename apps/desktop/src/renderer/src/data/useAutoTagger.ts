// 33 §7 자동 태그 — App에 늘 붙어 있다(ListSuggest 옆). 사용자에게 묻지 않는다.
//  · 새로 만들거나 제목을 고친 할 일(기준 시각 뒤)을 5초 모아 한 번에(최대 20개) tagTasks
//  · 태그 이름·별칭이 새로 생기면 그 태그로 사전 검사(AI 없음)
//  · 기존 할 일 일괄: 앱 시작 30초 뒤 한 번 시작, 멈췄으면 포커스·10분마다 이어 감(하루 상한이면 다음 날)
// AI를 못 쓰면 사전 결과만 쓰고 그 할 일은 10분 뒤 다시.
import { useEffect, useRef } from 'react'
import { titlePrint } from '@sprout/schema/autoTag'
import { useToast } from '../components/Toast'
import { useQuery } from './useQuery'
import { autoTagEnabled, autoTagSince, autoTagStore, rescanNewTagKeys, runBackfill, tagTasks } from './autoTag'
import { runProjectPass } from './projects'
import { addNotice } from './notices'
import { getDb } from './db'
import { autoTagTitle } from '../../../shared/notices'
import { dayKey } from '../lib/dates'

const WAIT = 5000
const RETRY = 10 * 60 * 1000
const BACKFILL_DELAY = 30_000
const PENDING_SQL = `SELECT id, title FROM tasks WHERE deleted_at IS NULL AND title IS NOT NULL AND title != '' AND modified_at > ?
  ORDER BY modified_at DESC LIMIT 200`
const TAGS_SQL = 'SELECT id, name, aliases FROM tags ORDER BY id'
const INTRO = '할 일 제목으로 태그를 저절로 붙여요 · ✦ 표시는 AI가 붙인 것'

export function useAutoTagger(): void {
  const toast = useToast()
  const since = useRef(autoTagSince()).current
  const pending = useQuery<{ id: string; title: string }>(PENDING_SQL, [since])
  const tags = useQuery<{ id: string; name: string; aliases: string | null }>(TAGS_SQL)
  const latest = useRef(pending)
  latest.current = pending
  const timer = useRef<number>(undefined)
  const running = useRef(false)
  const blockedUntil = useRef(0)
  const skip = useRef(new Set<string>())
  const tick = useRef<() => void>(() => {})
  const backfill = useRef<AbortController | null>(null)

  const intro = (applied: number) => {
    if (applied <= 0 || autoTagStore.get().introShown) return
    autoTagStore.set({ introShown: true })
    toast.show(INTRO)
  }
  const projects = (force = false) => {
    void runProjectPass({ force })
      .then(async (r) => {
        if (!r.created) return
        // 01 §3.3 알림 패널: 자동 프로젝트가 새로 생겼다
        const db = await getDb()
        const rows = await db.getAll<{ id: string; name: string }>("SELECT id, name FROM tags WHERE kind = 'project' AND source = 'ai' ORDER BY created_at DESC LIMIT ?", [r.created])
        if (rows.length) addNotice({ kind: 'project', key: `project:${rows.map((x) => x.id).sort().join(',')}`, title: rows.length > 1 ? `프로젝트 ${rows.length}개를 만들었어요` : '프로젝트를 만들었어요', body: rows.map((x) => x.name).join(' · '), target: { view: 'map' } })
      })
      .catch((e) => console.warn('[project] 자동 프로젝트 보류', e))
  }
  const waiting = () => {
    const seen = autoTagStore.get().seen
    return (latest.current ?? []).filter((t) => !skip.current.has(t.id) && seen[t.id] !== titlePrint(t.title)).map((t) => t.id)
  }

  tick.current = () => {
    if (!autoTagEnabled() || running.current || timer.current || Date.now() < blockedUntil.current || !waiting().length) return
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      running.current = true
      const batch = waiting().slice(0, 20)
      batch.forEach((id) => skip.current.add(id))
      void tagTasks(batch)
        .then((r) => {
          intro(r.applied)
          // 01 §3.3 알림 패널: 하루 한 줄로 합친다(되돌리기 = 그 묶음들)
          if (r.applied > 0 && r.at) addNotice({ kind: 'autotag', key: `autotag:${dayKey()}`, title: autoTagTitle(r.applied), body: '✦ 표시가 AI가 붙인 태그예요', count: r.applied, undo: [r.at] })
          if (r.aiError) { console.warn('[autoTag] AI 보류', r.aiError); blockedUntil.current = Date.now() + RETRY }
          else batch.forEach((id) => skip.current.delete(id)) // 다음에 제목이 바뀌면 다시(seen 지문으로 거른다)
          projects(true) // 31 §12.13 새 할 일 묶음마다 점수로 넣기(60초 기다림 없이 — 같은 때 입력이 이어지게)
        })
        .catch((e) => { console.warn('[autoTag] 새 할 일 태그 보류', e); blockedUntil.current = Date.now() + RETRY })
        .finally(() => { running.current = false; tick.current() })
    }, WAIT)
  }
  useEffect(() => { tick.current() }, [pending])

  // 태그 이름·별칭이 바뀌면 사전 검사
  const tagSig = (tags ?? []).map((t) => `${t.id}:${t.name}:${t.aliases ?? ''}`).join('|')
  useEffect(() => {
    if (!tags) return
    const t = window.setTimeout(() => { void rescanNewTagKeys().then(intro).catch((e) => console.warn('[autoTag] 사전 검사 보류', e)) }, 1500)
    return () => window.clearTimeout(t)
  }, [tagSig]) // eslint-disable-line react-hooks/exhaustive-deps

  // 기존 할 일 일괄(처음 한 번)
  useEffect(() => {
    const go = () => {
      if (backfill.current || !autoTagEnabled()) return
      const st = autoTagStore.get().backfill.state
      if (st === 'done' || st === 'undone') return
      const ac = new AbortController()
      backfill.current = ac
      void runBackfill({ signal: ac.signal })
        .then((b) => { if (b.state === 'done') intro(1); projects(true) })
        .catch((e) => console.warn('[autoTag] 일괄 보류', e))
        .finally(() => { if (backfill.current === ac) backfill.current = null })
    }
    const first = window.setTimeout(go, BACKFILL_DELAY)
    // 31 §12.1 자동 프로젝트는 AI 없이 돈다 — 일괄 사전 검사가 끝날 즈음 한 번
    const proj = window.setTimeout(() => projects(true), BACKFILL_DELAY + 5000)
    const retry = () => { blockedUntil.current = 0; skip.current.clear(); tick.current(); go(); projects() }
    const every = window.setInterval(retry, RETRY)
    window.addEventListener('focus', retry)
    const off = autoTagStore.subscribe(() => { if (!autoTagEnabled()) backfill.current?.abort() })
    return () => {
      window.clearTimeout(first); window.clearTimeout(proj); window.clearInterval(every); window.removeEventListener('focus', retry); off()
      backfill.current?.abort(); backfill.current = null
      window.clearTimeout(timer.current); timer.current = undefined
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
