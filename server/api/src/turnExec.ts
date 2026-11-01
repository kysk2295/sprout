// 47 §20 서버 턴 한 번 실행 — runTurn을 서버 DB(사용자 범위)와 자기 /ai/assistant(루프백)로 돌리고, 줄(payload)을 내보낸다.
// 날짜 계산(오늘·이번 주)은 프로세스 현지 시간대를 쓰므로, 사용자 시간대와 다르면 그 시간대로 띄운 자식 프로세스(turnWorker.ts)에서 부른다.
import { runTurn, type ChatFn } from '../../../packages/schema/src/assistantAgent.ts'
import { parseRouteDecision, routeRequest } from '../../../packages/schema/src/assistantDecision.ts'
import type { AssistantDb } from '../../../packages/schema/src/assistantExec.ts'
import type { TurnStart } from '../../../packages/schema/src/assistantTurn.ts'

export type TurnSpec = { userId: string; authorization: string; body: TurnStart }
export type ExecDeps = { db: (userId: string) => AssistantDb; self: string; routing: boolean; fetch?: typeof fetch; log?: (line: string) => void }

const FALLBACK = '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.'
/** 루프백 응답 오류 → runTurn·앱이 아는 모양(status·code·한국어 문구) */
async function httpError(r: Response): Promise<Error> {
  const j = await r.json().catch(() => null) as { error?: string; code?: string } | null
  return Object.assign(new Error(typeof j?.error === 'string' ? j.error : FALLBACK), { status: r.status, code: j?.code })
}

/** 모델 한 번 = /ai/assistant mode agent(앱이 보내던 것과 같은 몸통·턴 머리) */
export const chatVia = (f: typeof fetch, self: string, authorization: string, model: string | undefined): ChatFn => async (req, h) => {
  const r = await f(`${self}/ai/assistant`, {
    method: 'POST', signal: h.signal,
    headers: { 'content-type': 'application/json', authorization, 'x-sprout-turn': req.turn },
    body: JSON.stringify({ mode: 'agent', ...(model ? { model } : {}), ...(req.persona ? { persona: req.persona } : {}), messages: req.messages, tools: req.tools, stream: true })
  })
  if (!r.ok || !r.body) throw await httpError(r)
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', content = '', done = false, promptTokens: number | undefined
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const take = (raw: string) => {
    if (!raw.trim()) return
    const item = JSON.parse(raw)
    if (item.error) throw Object.assign(new Error(String(item.error)), { code: item.code, status: 503 })
    if (item.queue && typeof item.queue.position === 'number') { h.onQueue(item.queue.position); return }
    const c = item.message?.content
    if (typeof c === 'string' && c) { content += c; h.onDelta(c) }
    for (const t of Array.isArray(item.message?.tool_calls) ? item.message.tool_calls : []) {
      let args: unknown = t.function?.arguments ?? {}
      if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = {} } }
      const name = String(t.function?.name ?? '')
      if (name) calls.push({ name, args: args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {} })
    }
    if (item.done) { done = true; if (typeof item.prompt_eval_count === 'number') promptTokens = item.prompt_eval_count }
  }
  try {
    while (!done) {
      const chunk = await reader.read()
      if (chunk.done) { buffer += decoder.decode(); take(buffer); break }
      buffer += decoder.decode(chunk.value, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) { take(buffer.slice(0, end)); buffer = buffer.slice(end + 1) }
    }
  } finally { await reader.cancel().catch(() => {}) }
  if (!done) throw Object.assign(new Error('응답 연결이 끊겼어요. 다시 시도해 주세요.'), { status: 503 })
  return { content, tool_calls: calls, ...(promptTokens !== undefined ? { prompt_tokens: promptTokens } : {}) }
}

/** Jev 판단 = /ai/assistant mode route(같은 턴 id) */
export const classifyVia = (f: typeof fetch, self: string, authorization: string, turn: string, name: string) => async (text: string, history: { user: string; assistant: string }[], signal: AbortSignal) => {
  const r = await f(`${self}/ai/assistant`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization, 'x-sprout-turn': turn },
    body: JSON.stringify(routeRequest(text, history, name.slice(0, 40)))
  })
  if (!r.ok) throw await httpError(r)
  return parseRouteDecision(JSON.parse((await r.json()).message.content))
}

/** 턴 하나. emit은 {event}·{result}·{error} 중 하나씩(seq는 부르는 쪽이 붙임). 던지지 않는다 */
export async function execTurn(spec: TurnSpec, deps: ExecDeps, signal: AbortSignal, emit: (payload: Record<string, unknown>) => void): Promise<void> {
  const f = deps.fetch ?? fetch
  const { body, authorization } = spec
  try {
    const result = await runTurn({
      text: body.text, history: body.history, memory: body.memory, pending: body.pending, diary: body.diary, name: body.name,
      ...(body.persona ? { persona: body.persona } : {}), ...(body.timeZone ? { timeZone: body.timeZone } : {}),
      db: deps.db(spec.userId), chat: chatVia(f, deps.self, authorization, body.model),
      ...(deps.routing ? { classify: classifyVia(f, deps.self, authorization, body.turn, body.name) } : {}),
      turn: body.turn, signal,
      onEvent: (event) => { if (event.type !== 'delta') emit({ event }) } // 글 조각은 runTurn도 내보내지 않는다(최종 답만)
    })
    const { raw: _raw, ...rest } = result // 근거 검사 전 글은 보내지 않는다
    emit({ result: rest })
    if (result.grounding.hits > 0) {
      void f(`${deps.self}/ai/ground`, { method: 'POST', headers: { 'content-type': 'application/json', authorization }, body: JSON.stringify({ hits: result.grounding.hits }) })
        .then((r) => r.body?.cancel()).catch(() => {})
    }
  } catch (e) {
    const err = e as { message?: string; code?: string; status?: number; name?: string }
    const stopped = signal.aborted || err.name === 'AbortError'
    emit({ error: typeof err.message === 'string' && err.message ? err.message : FALLBACK, ...(err.code ? { code: err.code } : {}), status: typeof err.status === 'number' ? err.status : stopped ? 499 : 500 })
    if (typeof err.status !== 'number' && !stopped) deps.log?.(`ai turn error: ${err.name ?? 'unknown'}`) // 원문은 남기지 않는다
  }
}
