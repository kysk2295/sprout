// 47 §20 서버에서 도는 턴 — 서버와 앱(휴대폰·데스크톱)이 함께 쓰는 약속: 시작 요청 모양, NDJSON 줄({seq, event|result|error}),
// 끊겼다 다시 붙어 받아 오기(followTurn). 서버는 runTurn을 끝까지 돌리고 사건을 seq로 쌓아 두며(끝난 뒤 10분, 메모리만),
// 앱은 마지막으로 받은 seq 다음부터 GET으로 이어 받는다. 쓰기(넣기·완료·되돌리기)는 여기 없다 — 앱이 기기 DB로 한다.
import type { TurnEvent, TurnResult } from './assistantAgent.ts'
import type { ConfirmCard } from './assistantExec.ts'
import type { AgentMemory } from './assistantRouter.ts'
import { isPersonaId, type PersonaId } from './persona.ts'

export type TurnStart = {
  turn: string
  text: string
  history: { user: string; assistant: string }[]
  memory: AgentMemory
  pending: ConfirmCard | null
  diary: boolean
  name: string
  persona?: PersonaId
  timeZone?: string
  model?: string
}
export type TurnLine =
  | { seq: number; event: TurnEvent }
  | { seq: number; result: TurnResult }
  | { seq: number; error: string; code?: string; status?: number }

/** 끝난 턴을 서버가 들고 있는 시간(받아 가기용) */
export const TURN_KEEP_MS = 10 * 60_000
export const TURN_ID = /^[A-Za-z0-9_-]{8,64}$/
const MEMORY_MAX = 60_000
const PENDING_MAX = 20_000

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
/** 서버: 시작 요청 검사. 틀리면 null(400) */
export function parseTurnStart(body: unknown): TurnStart | null {
  if (!isObj(body)) return null
  const { turn, text, history, memory, pending, diary, name, persona, timeZone, model } = body
  if (typeof turn !== 'string' || !TURN_ID.test(turn)) return null
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) return null
  if (!Array.isArray(history) || history.length > 6 || history.some((h) => !isObj(h) || !str(h.user, 4000) || !str(h.assistant, 4000))) return null
  if (!isObj(memory) || !isObj(memory.aliases) || !Array.isArray(memory.recent) || JSON.stringify(memory).length > MEMORY_MAX) return null
  if (pending !== null && pending !== undefined && (!isObj(pending) || pending.type !== 'confirm' || JSON.stringify(pending).length > PENDING_MAX)) return null
  if (typeof diary !== 'boolean' || !str(name, 40)) return null
  if (persona !== undefined && !isPersonaId(persona)) return null
  if (timeZone !== undefined && !str(timeZone, 64)) return null
  if (model !== undefined && !str(model, 100)) return null
  return {
    turn, text, diary, name: name as string,
    history: (history as { user: string; assistant: string }[]).map((h) => ({ user: h.user.slice(0, 600), assistant: h.assistant.slice(0, 600) })),
    memory: memory as unknown as AgentMemory,
    pending: (pending ?? null) as ConfirmCard | null,
    ...(persona !== undefined ? { persona: persona as PersonaId } : {}),
    ...(timeZone !== undefined ? { timeZone: timeZone as string } : {}),
    ...(model !== undefined ? { model: model as string } : {})
  }
}

// ── 앱: 받기·이어 받기 ─────────────────────────────────────────
/** 앱이 넣는 통신. 실패는 던진다 — HTTP 응답 오류는 `status` 숫자를 붙여서(그 밖은 연결 끊김으로 본다) */
export type TurnTransport = {
  start(body: TurnStart, signal: AbortSignal): Promise<AsyncIterable<string>>
  resume(turn: string, after: number, signal: AbortSignal): Promise<AsyncIterable<string>>
  cancel(turn: string): Promise<void>
}
/** 서버에 그 턴이 없다(10분 지남·서버 다시 켬) 또는 여러 번 다시 붙어도 안 됨 */
export const TURN_LOST_TEXT = '연결이 끊겨서 답을 받지 못했어요. 다시 보내 주세요.'
export class TurnLostError extends Error { constructor() { super(TURN_LOST_TEXT); this.name = 'TurnLostError' } }
export const RECONNECT_DELAYS = [2000, 5000, 10_000]
const statusOf = (e: unknown) => (typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : null)

/** NDJSON 조각 → 줄 */
export async function* ndjsonLines(chunks: AsyncIterable<Uint8Array | string>): AsyncIterable<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const c of chunks) {
    buffer += typeof c === 'string' ? c : decoder.decode(c, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (line.trim()) yield line }
  }
  buffer += decoder.decode()
  if (buffer.trim()) yield buffer
}

/**
 * 한 턴을 끝까지 받아 온다. 연결이 끊기면 onReconnecting → wait(기본: 2·5·10초, 휴대폰은 앱이 앞으로 오면 바로) → 마지막 seq 다음부터 이어 받기.
 * resumeOnly = 앱을 다시 켜서 적어 둔 턴을 받아 오기(시작 요청을 보내지 않음).
 */
export async function followTurn(o: {
  transport: TurnTransport
  body: TurnStart
  signal: AbortSignal
  onEvent: (e: TurnEvent) => void
  onReconnecting?: (attempt: number) => void
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  delays?: number[]
  resumeOnly?: boolean
}): Promise<TurnResult> {
  const delays = o.delays ?? RECONNECT_DELAYS
  const wait = o.wait ?? ((ms, signal) => new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason ?? new Error('aborted')) }, { once: true })
  }))
  let after = 0
  let accepted = !!o.resumeOnly // 서버가 이 턴을 받았다(줄을 하나라도 받음)
  let attempt = 0
  let gone = false
  const loop = async (): Promise<TurnResult> => {
    for (;;) {
      try {
        const lines = accepted || gone ? await o.transport.resume(o.body.turn, after, o.signal) : await o.transport.start(o.body, o.signal)
        for await (const raw of lines) {
          let line: Partial<TurnLine & { ping: unknown }>
          try { line = JSON.parse(raw) } catch { continue }
          if (typeof line.seq !== 'number') continue // 살아 있음 신호
          accepted = true
          if (line.seq <= after) continue
          after = line.seq
          attempt = 0
          if ('event' in line && line.event) o.onEvent(line.event)
          else if ('result' in line && line.result) return line.result
          else if ('error' in line) throw Object.assign(new Error(String(line.error)), { code: line.code, status: line.status ?? 500, fromServer: true })
        }
        throw new Error('turn stream ended')
      } catch (e) {
        if (o.signal.aborted) throw e
        if ((e as { fromServer?: boolean }).fromServer) throw e
        const status = statusOf(e)
        if (status === 404) {
          // 시작 요청이 서버에 닿지 않았다 → 다시 시작. 받았던 턴이 사라졌다 → 잃음
          if (!accepted && gone) { gone = false; continue }
          throw new TurnLostError()
        }
        if (status !== null) throw e // 상한·잘못된 요청 등은 그대로
        if (!accepted) gone = true // 시작이 닿았는지 모름 → 먼저 이어 받기로 확인
        if (attempt >= delays.length) throw new TurnLostError()
        o.onReconnecting?.(attempt + 1)
        await wait(delays[attempt++], o.signal)
      }
    }
  }
  // ■ 멈춤(또는 앱 시간 초과) = 서버 턴도 멈춘다
  const stop = () => { void o.transport.cancel(o.body.turn).catch(() => {}) }
  o.signal.addEventListener('abort', stop, { once: true })
  try { return await loop() } finally { o.signal.removeEventListener('abort', stop) }
}
