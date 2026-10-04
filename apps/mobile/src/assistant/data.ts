// 27 AI 비서 — 서버 AI 프록시(POST {API}/ai/assistant, NDJSON 스트림)와 로컬 DB 실행.
// 데스크톱 main/assistant.ts(서버 호출·오류) + renderer/data/assistant.ts(askAssistant·executeIntent·undoAssistant)와 같은 흐름.
// 스트림은 expo/fetch(ReadableStream 지원). 사용자가 직접 보낸 요청만 부른다 — 수집함 분류는 부르지 않는다(26 M-C5).
import { insertStmt } from '@sprout/schema/taskCore'
import { fetch as streamFetch } from 'expo/fetch'
import { currentUserId, serverAccess } from '../data/auth'
import { db, run } from '../data/db'
import {
  buildChatInput, interpret, parseStreamLine, querySql, queryResult, replyPreview, splitLines,
  type AssistantProgress, type AssistantResult, type Intent, type ListLite, type TaskLite
} from './core'

const UNAVAILABLE = '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.'
export class AiHttpError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code }
}

function withTimeout(ms: number, outer?: AbortSignal) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), ms)
  const forward = () => abort.abort()
  outer?.addEventListener('abort', forward, { once: true })
  return { signal: abort.signal, done: () => { clearTimeout(timer); outer?.removeEventListener('abort', forward) } }
}

async function server(path: string, init: { method?: string; body?: string; signal?: AbortSignal } = {}) {
  const { url, token } = await serverAccess()
  if (!token) throw new Error('로그인하면 AI를 쓸 수 있어요.')
  let res: Awaited<ReturnType<typeof streamFetch>>
  try {
    res = await streamFetch(`${url}${path}`, { method: init.method ?? 'GET', body: init.body, signal: init.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } })
  } catch (e) {
    if (init.signal?.aborted) throw e
    throw new Error('network request failed')
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
    let message = typeof json?.error === 'string' ? json.error : res.status >= 500 ? UNAVAILABLE : 'AI 요청을 처리하지 못했어요. 다시 시도해 주세요.'
    // 13 §6 상한(429): "(오늘 남은 요청 N회)"
    if (res.status === 429 && json?.code !== 'weekly') {
      const left = await remainingToday().catch(() => undefined)
      if (left !== undefined) message += ` (오늘 남은 요청 ${left}회)`
    }
    throw new AiHttpError(message, res.status, json?.code)
  }
  return res
}

export type AiStatus = { available: boolean; models: string[]; defaultModel: string | null; perDay?: number; usedToday?: number }
export async function aiStatus(): Promise<AiStatus> {
  const t = withTimeout(15000)
  try {
    const s = (await (await server('/ai/status', { signal: t.signal })).json()) as { available?: boolean; models?: string[]; default_model?: string | null; limits?: { per_day?: number }; usage?: { today?: number } }
    const models = Array.isArray(s.models) ? s.models : []
    return {
      available: !!s.available && models.length > 0,
      // 서버 기본 모델을 맨 앞에(데스크톱과 같음)
      models: s.default_model ? [s.default_model, ...models.filter((m) => m !== s.default_model)] : models,
      defaultModel: s.default_model ?? null,
      perDay: s.limits?.per_day,
      usedToday: s.usage?.today
    }
  } finally { t.done() }
}
async function remainingToday() {
  const s = await aiStatus()
  return s.perDay !== undefined && s.usedToday !== undefined ? Math.max(0, s.perDay - s.usedToday) : undefined
}

/** 스트림 읽기: 글자 조각 → onDelta, 대기열 줄 → onQueue. 끝(done) 없이 끊기면 결과가 아니다 */
async function chat(body: object, signal: AbortSignal, onDelta: (text: string) => void, onQueue: (position: number) => void) {
  const res = await server('/ai/assistant', { method: 'POST', body: JSON.stringify({ ...body, stream: true }), signal })
  const reader = res.body?.getReader()
  if (!reader) throw new Error('응답 스트림이 비어 있어요.')
  const decoder = new TextDecoder()
  let buffer = '', result = '', done = false
  const take = (line: string) => {
    const item = parseStreamLine(line)
    if (!item) return
    if (item.queue) { onQueue(item.queue.position); return }
    if (item.delta) { result += item.delta; onDelta(item.delta) }
    if (item.done) done = true
  }
  try {
    while (!done) {
      if (signal.aborted) throw new Error('aborted')
      const chunk = await reader.read()
      if (chunk.done) { buffer += decoder.decode(); if (buffer.trim()) take(buffer); break }
      buffer += decoder.decode(chunk.value, { stream: true })
      const { lines, rest } = splitLines(buffer)
      buffer = rest
      for (const l of lines) take(l)
    }
    if (signal.aborted) throw new Error('aborted')
    if (!done) throw new Error('응답 연결이 끊겼어요. 다시 시도해 주세요.')
    return result
  } finally {
    await reader.cancel().catch(() => {})
  }
}

async function executeIntent(intent: Intent, id: string): Promise<AssistantResult> {
  if (intent.action === 'reply') return { text: intent.message || '등록할 일정이나 조회할 기간을 알려 주세요.' }
  if (intent.action === 'create') {
    if (!intent.title.trim()) throw new Error('등록할 제목을 알려 주세요.')
    const lists = await db.getAll<ListLite & { kind: string | null }>('SELECT id, name, kind FROM lists WHERE archived_at IS NULL')
    const list = lists.find((l) => l.id === intent.listId) || (!intent.listId ? lists.find((l) => l.kind === 'inbox') : undefined)
    if (!list) throw new Error('저장할 목록을 확인해 주세요.')
    const stamp = new Date().toISOString()
    await run([insertStmt('tasks', { owner_id: currentUserId(), id, title: intent.title.trim(), list_id: list.id, content: '', content_mode: 'text', status: 0, priority: 0, sort_order: -Date.now(), start_at: intent.start || null, due_at: intent.due || null, is_all_day: intent.due.includes('T') ? 0 : 1, time_zone: 'floating', repeat_rule: intent.repeat || null, repeat_from: 'due' }, stamp)])
    return { text: `${list.kind === 'inbox' ? '기본함' : list.name}에 등록했어요.${intent.repeat ? ' 반복 일정이에요.' : ''}`, tasks: [{ id, title: intent.title, start_at: intent.start || null, due_at: intent.due || null }], created: { id, stamp } }
  }
  const { sql, args } = querySql(intent)
  const rows = await db.getAll<TaskLite>(sql, args)
  return queryResult(intent, rows)
}

/** 13 §5: 생성 직후와 수정 시각·상태가 같을 때만 되돌린다 */
export async function undoAssistant(created: { id: string; stamp: string }) {
  const t = await db.getOptional<{ modified_at: string; status: number; deleted_at: string | null }>('SELECT modified_at, status, deleted_at FROM tasks WHERE id = ?', [created.id])
  if (!t || t.modified_at !== created.stamp || t.status !== 0 || t.deleted_at) throw new Error('등록 뒤에 바뀐 항목은 되돌릴 수 없어요')
  const at = new Date().toISOString()
  await run([{ sql: 'UPDATE tasks SET deleted_at = ?, modified_at = ? WHERE id = ? AND modified_at = ? AND status = 0', params: [at, at, created.id, created.stamp] }])
}

export async function askAssistant(text: string, model: string, id: string, signal: AbortSignal, history: { role: 'user' | 'assistant'; content: string }[], onProgress: (p: AssistantProgress) => void): Promise<AssistantResult> {
  onProgress({ phase: 'connecting' })
  const lists = await db.getAll<ListLite>('SELECT id, name, kind FROM lists WHERE archived_at IS NULL')
  const now = new Date()
  const { input, conversational } = buildChatInput(text, model, lists, history, now, Intl.DateTimeFormat().resolvedOptions().timeZone)
  let partial = ''
  const raw = await chat(
    { model: input.model, messages: input.messages, format: input.format },
    signal,
    (delta) => { partial += delta; onProgress({ phase: 'generating', characters: partial.length, preview: conversational ? partial : replyPreview(partial) }) },
    (queue) => { if (!partial) onProgress({ phase: 'connecting', queue }) }
  )
  if (signal.aborted) throw new Error('aborted')
  if (conversational) return { text: raw }
  onProgress({ phase: 'validating' })
  const intent = interpret(raw, text, now)
  if ('reply' in intent) return { text: intent.reply }
  onProgress({ phase: intent.action === 'create' ? 'saving' : intent.action === 'reply' ? 'validating' : 'querying' })
  return executeIntent(intent, id)
}
