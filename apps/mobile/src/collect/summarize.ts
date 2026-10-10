// 11 v3-8 · 26 §2.3 볼 것 링크 요약 — 휴대폰도 만든다(사용자 2026-10-10 "휴대폰에서도 하게 해 줘", 26 M-C5의 예외).
// 페이지는 이 휴대폰이 읽고(내부망 금지), 요약은 꿈틀 AI(/ai/classify, background — 데스크톱 수집기와 같은 길)로.
// 제목이 아직 없으면(휴대폰만 쓰는 사람) 페이지 제목도 같이 채운다. 하루 자동 20개(이 기기).
import * as SecureStore from 'expo-secure-store'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import {
  isPublicHttpUrl, pageFromHtml, pageHasText, parseSummary, readLinkSummary, SUMMARY_DAILY_AUTO, SUMMARY_SCHEMA, summaryPrompt,
  withLinkSummary, youtubeFromHtml, type LinkPage, type LinkSummary
} from '@sprout/schema/linkSummary'
import { serverAccess } from '../data/auth'
import { db, run } from '../data/db'
import { updateStmt } from '@sprout/schema/taskCore'

const isYoutube = (u: string) => /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(u)

/** 페이지 글(못 읽으면 null) */
export async function readLinkPage(url: string, signal?: AbortSignal): Promise<LinkPage | null> {
  if (!isPublicHttpUrl(url)) return null
  try {
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000), headers: { accept: 'text/html', 'accept-language': 'ko,en;q=0.8' } })
    const final = res.url || url
    if (!res.ok || !isPublicHttpUrl(final) || !/text\/html|application\/xhtml/i.test(res.headers.get('content-type') ?? '')) return null
    const html = (await res.text()).slice(0, 768 * 1024)
    return isYoutube(final) ? youtubeFromHtml(html) : pageFromHtml(html)
  } catch { return null }
}

const dayKey = () => `sprout_link_summary_${new Date().toLocaleDateString('sv')}`
async function usedToday() { try { return Number((await SecureStore.getItemAsync(dayKey())) || 0) } catch { return 0 } }
async function bump() { try { await SecureStore.setItemAsync(dayKey(), String((await usedToday()) + 1)) } catch { /* 상한 없이 */ } }

/** 링크 하나 요약 → notes.suggestion.linkSummary (+ 제목이 없으면 link_title). 'fail' = AI가 답을 못 함(다시 시도 가능) */
export async function summarizeOnPhone(id: string, url: string, signal: AbortSignal): Promise<'done' | 'none' | 'fail'> {
  const page = await readLinkPage(url)
  const at = new Date().toISOString()
  const row = await db.getOptional<{ suggestion: string | null; link_title: string | null }>('SELECT suggestion, link_title FROM notes WHERE id = ?', [id])
  if (!row) return 'none'
  const save = (s: LinkSummary) => run([updateStmt('notes', id, { suggestion: withLinkSummary(row.suggestion, s), ...(row.link_title == null && page?.title ? { link_title: page.title.slice(0, 200) } : {}) })])
  if (!page) { await save({ none: 'blocked', at, url }); return 'none' }
  if (!pageHasText(page)) { await save({ none: 'empty', at, url }); return 'none' }
  const { url: api, token } = await serverAccess()
  if (!token) return 'fail'
  let res: Response
  try {
    res = await fetch(`${api}/ai/classify`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-sprout-priority': 'background' },
      body: JSON.stringify({ messages: [{ role: 'user', content: summaryPrompt(page) }], format: SUMMARY_SCHEMA, stream: false })
    })
  } catch { return 'fail' }
  if (!res.ok) return 'fail'
  const body = (await res.json().catch(() => null)) as { message?: { content?: string } } | null
  const { head, lines } = parseSummary(body?.message?.content ?? '')
  if (!lines.length) return 'fail'
  await save({ head, lines, from: page.from, at, url })
  return 'done'
}

/** 앱 뿌리: 앞에 있을 때 요약이 없는 볼 것을 하나씩(하루 상한). 데스크톱이 먼저 만들었으면 동기화로 받아 건너뛴다 */
export function useLinkSummarizer(signedIn: boolean) {
  const busy = useRef(false)
  const tried = useRef(new Set<string>())
  useEffect(() => {
    if (!signedIn) return
    let alive = true
    const ctl = new AbortController()
    const drain = async () => {
      if (busy.current || !alive || AppState.currentState !== 'active') return
      busy.current = true
      try {
        while (alive && (await usedToday()) < SUMMARY_DAILY_AUTO) {
          const rows = await db.getAll<{ id: string; url: string; suggestion: string | null }>("SELECT id, url, suggestion FROM notes WHERE kind = 'link' AND url IS NOT NULL ORDER BY created_at DESC LIMIT 40")
          const r = rows.find((x) => !tried.current.has(`${x.id} ${x.url}`) && !readLinkSummary(x.suggestion, x.url))
          if (!r) break
          tried.current.add(`${r.id} ${r.url}`)
          const out = await summarizeOnPhone(r.id, r.url, ctl.signal).catch(() => 'fail' as const)
          if (out === 'done') await bump()
          if (out === 'fail') break // 서버가 안 되면 다음 기회에
        }
      } finally { busy.current = false }
    }
    void drain()
    const stop = db.onChange({ onChange: () => { void drain() } }, { tables: ['notes'], throttleMs: 2000 })
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void drain() })
    return () => { alive = false; ctl.abort(); stop(); app.remove() }
  }, [signedIn])
}
