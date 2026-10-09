// 27 AI 비서 — 서버 AI 프록시(POST {API}/ai/assistant, NDJSON 스트림)와 로컬 DB 실행.
// 데스크톱 main/assistant.ts(서버 호출·오류) + renderer/data/assistant.ts(askAssistant·executeIntent·undoAssistant)와 같은 흐름.
// 스트림은 expo/fetch(ReadableStream 지원). 사용자가 직접 보낸 요청만 부른다 — 수집함 분류는 부르지 않는다(26 M-C5).
import { insertStmt } from '@sprout/schema/taskCore'
import { externalRange, recallAsk, recallFromModel, recallLine, recallResult, recallSql, type RecallAsk, type RecallRow } from '@sprout/schema/recall'
import { listEvents } from '../calendars/device'
import { getDeviceCal, shownCalendars } from '../calendars/store'
import { fetch as streamFetch } from 'expo/fetch'
import { currentUserId, serverAccess } from '../data/auth'
import { AI_URL } from '../config'
import { AgentUnsupportedError, runTurn, type AgentWrites, type ChatFn, type TurnEvent, type TurnResult } from '@sprout/schema/assistantAgent'
import type { AgentMemory } from '@sprout/schema/assistantRouter'
import { eventFieldsOf, type ConfirmCard } from '@sprout/schema/assistantExec'
import { dayKey } from '../lib/dates'
import { completeTasks, reopenTasks } from '../data/tasks'
import { getAssistantDiary, getConsent, preloadDiaryPrefs } from '../diary/prefs'
import { db, run } from '../data/db'
import { defaultListId } from '../data/tasks'
import {
  buildChatInput, diaryForAssistant, interpret, parseAgentLine, parseStreamLine, querySql, queryResult, replyPreview, splitLines,
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

async function server(path: string, init: { method?: string; body?: string; signal?: AbortSignal; headers?: Record<string, string> } = {}) {
  const { token } = await serverAccess()
  const url = AI_URL
  if (!token) throw new Error('로그인하면 AI를 쓸 수 있어요.')
  let res: Awaited<ReturnType<typeof streamFetch>>
  try {
    res = await streamFetch(`${url}${path}`, { method: init.method ?? 'GET', body: init.body, signal: init.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init.headers } })
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

export type AiStatus = { available: boolean; models: string[]; defaultModel: string | null; perDay?: number; usedToday?: number; agent: boolean; assistantDaily: { used: number; limit: number } | null }
export async function aiStatus(): Promise<AiStatus> {
  const t = withTimeout(15000)
  try {
    const s = (await (await server('/ai/status', { signal: t.signal })).json()) as { available?: boolean; models?: string[]; default_model?: string | null; limits?: { per_day?: number }; usage?: { today?: number; daily?: Record<string, { used?: number; limit?: number }> }; features?: string[] }
    const models = Array.isArray(s.models) ? s.models : []
    return {
      available: !!s.available && models.length > 0,
      // 서버 기본 모델을 맨 앞에(데스크톱과 같음)
      models: s.default_model ? [s.default_model, ...models.filter((m) => m !== s.default_model)] : models,
      defaultModel: s.default_model ?? null,
      perDay: s.limits?.per_day,
      usedToday: s.usage?.today,
      agent: Array.isArray(s.features) && s.features.includes('agent'),
      assistantDaily: typeof s.usage?.daily?.assistant?.limit === 'number' ? { used: Number(s.usage.daily.assistant.used) || 0, limit: s.usage.daily.assistant.limit } : null
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
  if (intent.action === 'reply') return { text: intent.message || '등록할 일정이나 조회할 기간을 알려 주세요.', kind: 'reply' }
  if (intent.action === 'create') {
    if (!intent.title.trim()) throw new Error('등록할 제목을 알려 주세요.')
    const lists = await db.getAll<ListLite & { kind: string | null }>("SELECT id, name, kind FROM lists WHERE archived_at IS NULL ORDER BY kind = 'inbox' DESC, CASE WHEN kind = 'inbox' THEN created_at END, sort_order")
    // 목록을 고르지 않았으면 기본함(02 §14.1 — 없으면 만든다. 둘이면 가장 오래된 것)
    const list = lists.find((l) => l.id === intent.listId) || (!intent.listId ? (lists.find((l) => l.kind === 'inbox') ?? { id: await defaultListId(), name: '기본함', kind: 'inbox' }) : undefined)
    if (!list) throw new Error('저장할 목록을 확인해 주세요.')
    const stamp = new Date().toISOString()
    await run([insertStmt('tasks', { owner_id: currentUserId(), id, title: intent.title.trim(), list_id: list.id, content: '', content_mode: 'text', status: 0, priority: 0, sort_order: -Date.now(), start_at: intent.start || null, due_at: intent.due || null, is_all_day: intent.due.includes('T') ? 0 : 1, time_zone: 'floating', repeat_rule: intent.repeat || null, repeat_from: 'due' }, stamp)])
    return { text: `${list.kind === 'inbox' ? '기본함' : list.name}에 등록했어요.${intent.repeat ? ' 반복 일정이에요.' : ''}`, tasks: [{ id, title: intent.title, start_at: intent.start || null, due_at: intent.due || null }], created: { id, stamp }, kind: 'create' }
  }
  const { sql, args } = querySql(intent)
  const rows = await db.getAll<TaskLite>(sql, args)
  return queryResult(intent, rows)
}

/** 13 §3.1 기록 묻기: 할 일 + 꿈틀 일정 + 켜 둔 휴대폰 캘린더에서 찾아 앱이 답 한 줄을 고른다 */
export async function executeRecall(ask: RecallAsk, now = new Date()): Promise<AssistantResult> {
  const q = recallSql(ask)
  const tasks = await db.getAll<{ id: string; title: string; status: number; completed_at: string | null; start_at: string | null; due_at: string | null }>(q.tasks.sql, q.tasks.args)
  const events = await db.getAll<{ id: string; title: string; start_at: string | null }>(q.events.sql, q.events.args).catch(() => [])
  const rows: RecallRow[] = [...tasks.map((t) => ({ ...t, source: 'task' as const })), ...events.map((e) => ({ id: e.id, title: e.title, start_at: e.start_at, source: 'event' as const, open: `ev:${e.id}` }))]
  const cals = shownCalendars(getDeviceCal()).map((c) => c.id)
  if (cals.length) {
    const { from, to } = externalRange(now)
    const [y1, m1, d1] = from.split('-').map(Number)
    const [y2, m2, d2] = to.split('-').map(Number)
    // 권한이 없거나 느리면 건너뛴다(3초)
    const dev = await Promise.race([listEvents(cals, new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2)).catch(() => []), new Promise<[]>((r) => setTimeout(() => r([]), 3000))])
    for (const e of dev) {
      if (!e.title) continue
      const start = e.startDate instanceof Date ? e.startDate : new Date(e.startDate)
      if (Number.isNaN(start.getTime())) continue
      const p2 = (n: number) => String(n).padStart(2, '0')
      const day = `${start.getFullYear()}-${p2(start.getMonth() + 1)}-${p2(start.getDate())}`
      rows.push({ id: `${e.id}|${start.toISOString()}`, title: e.title, start_at: e.allDay ? day : `${day}T${p2(start.getHours())}:${p2(start.getMinutes())}`, source: 'external', open: `dev:${e.id}|${start.toISOString()}` })
    }
  }
  const recall = recallResult(ask, rows, now)
  return { kind: 'recall', text: recallLine(ask, recall, now), recall }
}

/** 13 §5: 생성 직후와 수정 시각·상태가 같을 때만 되돌린다 */
export async function undoAssistant(created: { id: string; stamp: string }) {
  const t = await db.getOptional<{ modified_at: string; status: number; deleted_at: string | null }>('SELECT modified_at, status, deleted_at FROM tasks WHERE id = ?', [created.id])
  if (!t || t.modified_at !== created.stamp || t.status !== 0 || t.deleted_at) throw new Error('등록 뒤에 바뀐 항목은 되돌릴 수 없어요')
  const at = new Date().toISOString()
  await run([{ sql: 'UPDATE tasks SET deleted_at = ?, modified_at = ? WHERE id = ? AND modified_at = ? AND status = 0', params: [at, at, created.id, created.stamp] }])
}

export async function askAssistant(text: string, model: string, id: string, signal: AbortSignal, history: { role: 'user' | 'assistant'; content: string }[], onProgress: (p: AssistantProgress) => void): Promise<AssistantResult> {
  const now = new Date()
  // 13 §3.1 "언제 마지막으로 / 얼마나 지났지 / 몇 번 했지"는 앞 규칙으로 바로 찾는다(모델을 부르지 않음)
  const recall = recallAsk(text, now)
  if (recall) { onProgress({ phase: 'querying' }); return executeRecall(recall, now) }
  onProgress({ phase: 'connecting' })
  const lists = await db.getAll<ListLite>('SELECT id, name, kind FROM lists WHERE archived_at IS NULL')
  const { input, conversational } = buildChatInput(text, model, lists, history, now, Intl.DateTimeFormat().resolvedOptions().timeZone)
  let partial = ''
  const raw = await chat(
    { model: input.model, messages: input.messages, format: input.format },
    signal,
    (delta) => { partial += delta; onProgress({ phase: 'generating', characters: partial.length, preview: conversational ? partial : replyPreview(partial) }) },
    (queue) => { if (!partial) onProgress({ phase: 'connecting', queue }) }
  )
  if (signal.aborted) throw new Error('aborted')
  if (conversational) return { text: raw, kind: 'chat' }
  onProgress({ phase: 'validating' })
  const intent = interpret(raw, text, now)
  if ('reply' in intent) return { text: intent.reply, kind: 'reply' }
  const modelRecall = intent.action !== 'create' ? recallFromModel(intent, text, now) : null
  if (modelRecall) { onProgress({ phase: 'querying' }); return executeRecall(modelRecall, now) }
  onProgress({ phase: intent.action === 'create' ? 'saving' : intent.action === 'reply' ? 'validating' : 'querying' })
  return executeIntent(intent, id)
}

// ── 47 B안: 자유 대화 + 앱 도구(서버 /ai/assistant mode agent) ─────────────
/** 모델 한 번. 같은 턴은 같은 X-Sprout-Turn — 서버가 상한을 턴 단위로 센다(§9). 턴 첫 호출이 400이면 서버가 agent를 모름(배포 전) */
export function agentChat(model: string): ChatFn {
  return async (req, h) => {
    let res: Awaited<ReturnType<typeof server>>
    try {
      res = await server('/ai/assistant', { method: 'POST', body: JSON.stringify({ mode: 'agent', model, messages: req.messages, tools: req.tools, stream: true }), signal: h.signal, headers: { 'x-sprout-turn': req.turn } })
    } catch (e) {
      if (req.call === 1 && e instanceof AiHttpError && e.status === 400) throw new AgentUnsupportedError()
      throw e
    }
    const reader = res.body?.getReader()
    if (!reader) throw new Error('응답 스트림이 비어 있어요.')
    const decoder = new TextDecoder()
    let buffer = '', content = '', done = false
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const take = (line: string) => {
      const item = parseAgentLine(line)
      if (!item) return
      if (item.queue !== undefined) { h.onQueue(item.queue); return }
      if (item.delta) { content += item.delta; h.onDelta(item.delta) }
      if (item.toolCalls) calls.push(...item.toolCalls)
      if (item.done) done = true
    }
    try {
      while (!done) {
        if (h.signal.aborted) throw new Error('aborted')
        const chunk = await reader.read()
        if (chunk.done) { buffer += decoder.decode(); if (buffer.trim()) take(buffer); break }
        buffer += decoder.decode(chunk.value, { stream: true })
        const { lines, rest } = splitLines(buffer)
        buffer = rest
        for (const l of lines) take(l)
      }
      if (h.signal.aborted) throw new Error('aborted')
      if (!done) throw new Error('응답 연결이 끊겼어요. 다시 시도해 주세요.')
      return { content, tool_calls: calls }
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
}

/** 확인 카드 넣기·되돌리기(§6): 만들기 = executeIntent create와 같은 행, 완료 = 21 완료(XP), 되돌리기 = 완료 취소(XP 회수) */
export const agentWrites: AgentWrites = {
  newId: () => crypto.randomUUID(),
  stamp: () => new Date().toISOString(),
  async create(card: ConfirmCard, id: string, stamp: string) {
    const listId = card.listId || (await defaultListId())
    await run([insertStmt('tasks', { owner_id: currentUserId(), id, title: card.title, list_id: listId, content: '', content_mode: 'text', status: 0, priority: 0, sort_order: -Date.now(), start_at: card.start || null, due_at: card.due || null, is_all_day: card.due.includes('T') ? 0 : 1, time_zone: 'floating', repeat_rule: card.repeat || null, repeat_from: card.repeat ? 'due' : null }, stamp)])
  },
  // 47 §19.3 일정 카드 = events 한 행(꿈틀 내 일정 — 휴대폰 캘린더·알림 없음)
  async createEvent(card: ConfirmCard, id: string, stamp: string) {
    await run([insertStmt('events', { owner_id: currentUserId(), id, ...eventFieldsOf(card, dayKey()) }, stamp)])
  },
  readEvents: (ids) => (ids.length ? db.getAll(`SELECT id, modified_at, deleted_at FROM events WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : Promise.resolve([])),
  async complete(ids) { await completeTasks(ids) },
  async uncomplete(ids) { await reopenTasks(ids) },
  run: (stmts) => run(stmts),
  read: (ids) => (ids.length ? db.getAll(`SELECT id, modified_at, status, deleted_at, start_at, due_at FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : Promise.resolve([]))
}

/** 47 §19.4 근거 검사가 뺀 문장 수만 서버로(POST /ai/ground {hits}). 기다리지 않고, 실패·예전 서버(404)는 버린다 */
export function reportGround(hits: number) {
  const n = Math.min(20, Math.max(1, Math.round(hits)))
  void server('/ai/ground', { method: 'POST', body: JSON.stringify({ hits: n }), signal: AbortSignal.timeout?.(8000) }).then((r) => r.body?.cancel?.()).catch(() => {})
}

/** 이 기기에서 일기 보기(§8.4: 설정 + 일기 AI 동의) */
export async function assistantDiaryOn() {
  await preloadDiaryPrefs().catch(() => {})
  return diaryForAssistant(getAssistantDiary(), getConsent())
}

export async function askAgent(o: { text: string; model: string; turn: string; signal: AbortSignal; history: { user: string; assistant: string }[]; memory: AgentMemory; pending: ConfirmCard | null; name: string; onEvent: (e: TurnEvent) => void }): Promise<TurnResult> {
  return runTurn({
    text: o.text, history: o.history, memory: o.memory, pending: o.pending, diary: await assistantDiaryOn(), name: o.name,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, db: { getAll: (sql, args) => db.getAll(sql, args ?? []) }, chat: agentChat(o.model),
    turn: o.turn, signal: o.signal, onEvent: o.onEvent
  })
}
