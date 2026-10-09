// AI 프록시: 앱 → (JWT) → 여기(대기열·상한) → 백엔드(ai-backend.ts: 직접 URL 또는 Mac mini 워커) → Ollama. PRD "AI 사용 원칙"
//   GET  /ai/status                       → 쓸 수 있는지·모델·대기열·내 사용량
//   POST /ai/assistant|classify|map|diary|kpi-draft|weekly-report|breakdown|tag
//        {messages, format?, model?, stream?, options?: {temperature}}
//   POST /ai/diary {mode} — 28 §8(사용자 스킬 conversational-journal-to-wiki를 따름, 지시문은 packages/schema/src/diaryPrompts.ts 한 곳):
//        mode 없음·'reply' = 예전 답(데스크톱) — 지시 끝에 "들은 말만"(DIARY_GROUNDING)
//        'chat'    = 캐릭터와 이야기 한 턴: 용도 diary-chat, 하루 30번. 지시에 대화 규칙(COMPANION_RULES)·들은 말만을 꼭 넣는다
//        'distill' = 대화를 1인칭 일기 + 제목 + 감정/사건/영역 태그(JSON)로 옮기기: 용도 diary-distill, 하루 5번('polish' = 다시 옮기기, 같은 용도).
//                    지시문·형식은 서버 것만(앱 system은 버림, 마지막 user = <conversation>)
//        stream=false → {model, message:{role,content}, done, ...숫자}
//        stream=true  → NDJSON: 대기 중 {"queue":{"position":n,"waiting":m}} → Ollama 줄 그대로 → 오류면 {"error","code"}
// 우선순위: 용도별 기본 갈래(interactive | background, BACKGROUND_DEFAULT) — 앱은 `X-Sprout-Priority: background`로 낮출 수만 있다(올릴 수 없음).
//   대기열은 interactive 먼저 → 같은 갈래 안에서는 사용자별 돌아가며. background는 사용자당 1개, 대기 상한 따로, 줄이 차면 밀려난다(bg_deferred + Retry-After)
// 규칙: 동시 실행 수 + 대기열(공용), 사용자별 분·일 상한, 성장 주간 AI(kpi-draft·weekly-report) 주 1+1, 용도별 하루 상한(breakdown 10 · tag 40 · diary-chat 30 · diary-distill 5),
//       용도별 출력 상한(tag 1600 — 할 일 40개 답이 700토큰을 넘는다, 33 §9),
//       컨텍스트 6144(모든 용도 같게 — 바뀌면 모델을 다시 올림)·출력 700 토큰·제한 시간, 클라우드·원격 모델 금지. 요청·응답 원문은 저장도 기록도 하지 않는다(숫자만).
// 47 AI 비서 B안(자유 대화 + 앱 도구): POST /ai/assistant {mode:'agent', messages, tools, stream} + 헤더 X-Sprout-Turn: <턴 id>
//   tools = 도구 이름(또는 {function:{name}}) — packages/schema/src/assistantTools.ts TOOL_NAMES의 부분집합. 정의는 서버 것(TOOL_SPECS)만 Ollama로 보낸다
//   messages = system(앱 칸: 오늘·날짜표·이름 — 서버가 이번 질문 앞에 [앱 정보]로 붙임, system은 AGENT_SYSTEM 고정 = 캐시, 앱 지시는 버림) · user · assistant(+tool_calls) · tool(tool_name). 끝은 user 또는 tool
//   상한은 턴 단위(47 §9·§15 ①): 같은 턴 id의 첫 호출만 분·일·용도(assistant 하루 40) 상한에서 센다. 2~4번째는 세지 않고(requests 0, 토큰·시간만)
//     대기열 맨 앞(front 갈래)으로. 5번째는 turn_limit, 턴 시작 150초 뒤는 timeout, 3분 지나면 잊는다. 첫 호출이 실패하면 턴도 지운다(다시 시도 = 새 턴)
//   num_ctx 6144(AI_AGENT_NUM_CTX) · 출력 도구 있음 300 / 답 450 [임시] · 호출당 60초. 스트림은 Ollama 줄 그대로(tool_calls도 message 안에).
//   mode 없음 = 예전 의도 JSON 경로 그대로. /ai/status features에 'agent'가 있으면 앱이 이 경로를 쓴다(없으면 예전 경로)
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AiBackend } from './ai-backend.ts'
import { COMPANION_RULES, DIARY_GROUNDING, DISTILL_SCHEMA, DISTILL_SYSTEM } from '../../../packages/schema/src/diaryPrompts.ts'
import { AGENT_CONTEXT_MAX, AGENT_SYSTEM, isToolName, NUDGE, TOOL_SPECS, type ToolName } from '../../../packages/schema/src/assistantTools.ts'
export { COMPANION_RULES, DIARY_GROUNDING, DISTILL_SYSTEM }

export const ENDPOINTS = ['assistant', 'classify', 'map', 'diary', 'kpi-draft', 'weekly-report', 'breakdown', 'tag', 'diary-chat', 'diary-distill'] as const
export type Endpoint = (typeof ENDPOINTS)[number]
const isEndpoint = (s: string): s is Endpoint => (ENDPOINTS as readonly string[]).includes(s)
/** 사람이 기다리지 않는 용도(앱이 저절로 부르는 뒷일): 33 자동 태그, 30 §B.3 새 할 일 리스트 분류.
 *  classify는 수집함 자동 분류(뒷일)와 밀린 일 정리(사람이 누름)가 같이 써서 기본은 interactive — 수집함은 앱이 헤더로 낮춘다 */
export const BACKGROUND_DEFAULT: readonly Endpoint[] = ['tag', 'map']
export const PRIORITY_HEADER = 'x-sprout-priority'
/** 용도 기본값과 앱 헤더 중 낮은 쪽. 헤더로 background → interactive로 올릴 수는 없다 */
export function priorityOf(endpoint: Endpoint, header: string | string[] | undefined, background: readonly Endpoint[] = BACKGROUND_DEFAULT): Priority {
  if (background.includes(endpoint)) return 'background'
  const h = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase()
  return h === 'background' ? 'background' : 'interactive'
}

// ── 설정 (상한 숫자는 [임시] — Mac mini 부하 측정 뒤 정한다) ──
export type AiConfig = {
  defaultModel: string
  allowModels: string[] // 비면 Ollama에 설치된 로컬 모델 전부
  concurrency: number
  queueMax: number
  queueWaitMs: number
  timeoutMs: number
  /** interactive 사용자당 동시(대기+실행) */
  userConcurrent: number
  /** background 대기 상한(전체 queueMax 안에서) */
  queueMaxBg: number
  /** background가 동시에 쓸 수 있는 실행 자리(기본 concurrency-1, 최소 1) */
  bgConcurrency: number
  /** background 사용자당 동시(대기+실행) */
  userBgConcurrent: number
  /** background를 부하로 거절·밀어낼 때 Retry-After(초) */
  bgRetryAfter: number
  /** 기본이 background인 용도 */
  background: Endpoint[]
  perMinute: number
  perDay: number
  weekly: Partial<Record<Endpoint, number>>
  /** 용도별 하루 상한(전체 공용 perDay와 별도) — 31 작업 지도 AI 쪼개기 */
  daily: Partial<Record<Endpoint, number>>
  /** 용도별 출력 토큰 상한(없으면 numPredict) — 33 자동 태그는 한 번에 할 일 40개라 답이 길다 */
  predict?: Partial<Record<Endpoint, number>>
  numCtx: number
  numPredict: number
  keepAlive: string
  tzOffsetMin: number
  maxMessages: number
  maxMessageChars: number
  maxTotalChars: number
  maxBodyBytes: number
  /** 47 agent: 컨텍스트 · 출력(도구 있음 / 답) · 호출당 시간 · 턴 */
  agentNumCtx: number
  agentPredictTools: number
  agentPredictAnswer: number
  agentCallTimeoutMs: number
  agentMaxMessages: number
  turnMaxCalls: number
  turnMaxMs: number
  turnTtlMs: number
}

export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig {
  const n = (k: string, d: number) => {
    const v = Number(env[k])
    return env[k] !== undefined && env[k] !== '' && Number.isFinite(v) && v >= 0 ? v : d
  }
  return {
    defaultModel: env.AI_MODEL || 'qwen3.5:9b',
    allowModels: (env.AI_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    concurrency: Math.max(1, n('AI_CONCURRENCY', 1)),
    queueMax: n('AI_QUEUE_MAX', 20),
    queueWaitMs: n('AI_QUEUE_WAIT_MS', 180_000),
    timeoutMs: n('AI_TIMEOUT_MS', 120_000),
    userConcurrent: Math.max(1, n('AI_USER_CONCURRENT', 2)),
    queueMaxBg: n('AI_QUEUE_MAX_BG', 10),
    bgConcurrency: Math.max(1, n('AI_BG_CONCURRENCY', Math.max(1, n('AI_CONCURRENCY', 1) - 1))),
    userBgConcurrent: Math.max(1, n('AI_USER_BG_CONCURRENT', 1)),
    bgRetryAfter: Math.max(1, n('AI_BG_RETRY_AFTER', 60)),
    background: env.AI_BACKGROUND_PURPOSES !== undefined
      ? env.AI_BACKGROUND_PURPOSES.split(',').map((s) => s.trim()).filter(isEndpoint)
      : [...BACKGROUND_DEFAULT],
    perMinute: n('AI_USER_PER_MINUTE', 6),
    perDay: n('AI_USER_PER_DAY', 100),
    weekly: { 'kpi-draft': n('AI_WEEKLY_KPI_DRAFT', 1), 'weekly-report': n('AI_WEEKLY_REPORT', 1) },
    daily: { assistant: n('AI_DAILY_ASSISTANT', 40), breakdown: n('AI_DAILY_BREAKDOWN', 10), tag: n('AI_DAILY_TAG', 40), 'diary-chat': n('AI_DAILY_DIARY_CHAT', 30), 'diary-distill': n('AI_DAILY_DIARY_DISTILL', 5) },
    predict: { tag: n('AI_PREDICT_TAG', 1600) },
    // 47 §9: 모든 용도 6144 — Ollama는 num_ctx가 바뀌면 모델을 다시 올린다(약 13초). 비서만 6144면 다른 용도와 번갈아 다시 올림
    numCtx: n('AI_NUM_CTX', 6144),
    numPredict: n('AI_NUM_PREDICT', 700),
    keepAlive: env.AI_KEEP_ALIVE || '5m',
    tzOffsetMin: n('AI_TZ_OFFSET_MIN', 540), // 한국 시각. 날짜·주(월요일 시작) 경계
    maxMessages: n('AI_MAX_MESSAGES', 30),
    maxMessageChars: n('AI_MAX_MESSAGE_CHARS', 30_000),
    maxTotalChars: n('AI_MAX_TOTAL_CHARS', 60_000),
    maxBodyBytes: n('AI_MAX_BODY_BYTES', 256 * 1024),
    agentNumCtx: n('AI_AGENT_NUM_CTX', n('AI_NUM_CTX', 6144)),
    agentPredictTools: n('AI_PREDICT_AGENT_TOOLS', 300), // [임시] 47 §9는 200 — 도구를 줘도 바로 답하는 일이 있어 잘리지 않게
    agentPredictAnswer: n('AI_PREDICT_AGENT_ANSWER', 450),
    agentCallTimeoutMs: n('AI_AGENT_CALL_TIMEOUT_MS', 60_000),
    agentMaxMessages: n('AI_AGENT_MAX_MESSAGES', 40),
    turnMaxCalls: n('AI_TURN_MAX_CALLS', 4),
    turnMaxMs: n('AI_TURN_MAX_MS', 150_000),
    turnTtlMs: n('AI_TURN_TTL_MS', 180_000)
  }
}

// ── 오류: 한국어 한 가지 문구 + 코드 ──
const MESSAGES = {
  unauthorized: [401, '로그인이 필요해요.'],
  not_found: [404, '없는 AI 기능이에요.'],
  bad_request: [400, '요청 형식이 올바르지 않아요.'],
  turn_limit: [429, '한 번에 너무 많이 찾았어요. 더 좁혀서 물어봐 주세요.'],
  model: [400, '쓸 수 있는 모델이 아니에요.'],
  too_large: [413, '요청이 너무 커요. 내용을 줄여 주세요.'],
  user_busy: [429, '이미 처리 중인 AI 요청이 있어요. 끝난 뒤 다시 시도해 주세요.'],
  rate_minute: [429, 'AI 요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.'],
  rate_day: [429, '오늘 AI 사용 한도를 다 썼어요. 내일 다시 시도해 주세요.'],
  weekly: [429, '이번 주에는 이미 사용했어요. 다음 주 월요일에 다시 쓸 수 있어요.'],
  daily: [429, '오늘은 이 AI 기능을 다 썼어요. 내일 다시 쓸 수 있어요.'],
  queue_full: [503, '지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.'],
  queue_timeout: [503, '지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.'],
  // background(앱이 저절로 부르는 뒷일)만 받는다 — 앱은 조용히 Retry-After 뒤에 다시
  bg_busy: [429, '자동 AI 작업이 이미 돌고 있어요. 잠시 뒤 다시 시도해 주세요.'],
  bg_deferred: [503, '지금은 AI가 바빠서 자동 작업을 미뤘어요. 잠시 뒤 다시 시도해 주세요.'],
  unavailable: [503, '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.'],
  timeout: [504, 'AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.'],
  aborted: [499, '요청이 취소됐어요.'],
  server: [500, '서버 오류가 났어요. 잠시 뒤 다시 시도해 주세요.']
} as const
export type AiCode = keyof typeof MESSAGES
/** 서버 부하로 못 한 것(분 상한에서 되돌린다) */
const LOAD_CODES = new Set<AiCode>(['queue_full', 'queue_timeout', 'bg_deferred'])

export class AiError extends Error {
  code: AiCode
  status: number
  retryAfter?: number
  constructor(code: AiCode, retryAfter?: number) {
    super(MESSAGES[code][1])
    this.code = code
    this.status = MESSAGES[code][0]
    if (retryAfter !== undefined) this.retryAfter = Math.max(1, Math.ceil(retryAfter))
  }
}

// ── 날짜(설정한 시간대 기준) ──
const DAY = 86_400_000
export function dayKey(ms: number, offMin: number) { return new Date(ms + offMin * 60_000).toISOString().slice(0, 10) }
/** 이번 주 월요일 날짜 */
export function weekKey(ms: number, offMin: number) {
  const dow = (new Date(ms + offMin * 60_000).getUTCDay() + 6) % 7
  return dayKey(ms - dow * DAY, offMin)
}
const localMidnight = (ms: number, offMin: number) => Math.floor((ms + offMin * 60_000) / DAY) * DAY - offMin * 60_000
const secsToNextDay = (ms: number, off: number) => (localMidnight(ms, off) + DAY - ms) / 1000
const secsToNextWeek = (ms: number, off: number) => {
  const dow = (new Date(ms + off * 60_000).getUTCDay() + 6) % 7
  return (localMidnight(ms, off) + (7 - dow) * DAY - ms) / 1000
}

// ── 사용량 저장: 숫자만. 원문을 받는 자리가 아예 없다 ──
export type UsageDelta = { requests?: number; failures?: number; prompt_tokens?: number; output_tokens?: number; duration_ms?: number }
export interface UsageStore {
  /** fromDay(포함) 이후 requests 합. endpoint를 주면 그것만 */
  count(userId: string, fromDay: string, endpoint?: Endpoint): Promise<number>
  add(userId: string, endpoint: Endpoint, day: string, delta: UsageDelta): Promise<void>
}

type Query = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>
export function pgUsageStore(query: Query): UsageStore {
  const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0)
  return {
    async count(userId, fromDay, endpoint) {
      const r = endpoint
        ? await query('SELECT COALESCE(SUM(requests), 0)::int AS n FROM ai_usage WHERE user_id = $1 AND day >= $2 AND endpoint = $3', [userId, fromDay, endpoint])
        : await query('SELECT COALESCE(SUM(requests), 0)::int AS n FROM ai_usage WHERE user_id = $1 AND day >= $2', [userId, fromDay])
      return Number(r.rows[0]?.n ?? 0)
    },
    async add(userId, endpoint, day, d) {
      await query(
        `INSERT INTO ai_usage (user_id, endpoint, day, requests, failures, prompt_tokens, output_tokens, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, endpoint, day) DO UPDATE SET
           requests = GREATEST(0, ai_usage.requests + EXCLUDED.requests),
           failures = ai_usage.failures + EXCLUDED.failures,
           prompt_tokens = ai_usage.prompt_tokens + EXCLUDED.prompt_tokens,
           output_tokens = ai_usage.output_tokens + EXCLUDED.output_tokens,
           duration_ms = ai_usage.duration_ms + EXCLUDED.duration_ms,
           updated_at = now()`,
        [userId, endpoint, day, int(d.requests), int(d.failures), int(d.prompt_tokens), int(d.output_tokens), int(d.duration_ms)]
      )
    }
  }
}

/** 시험·개발용 */
export function memoryUsageStore() {
  const rows = new Map<string, Required<UsageDelta> & { userId: string; endpoint: Endpoint; day: string }>()
  const calls: unknown[] = []
  const store: UsageStore & { rows: typeof rows; calls: unknown[] } = {
    rows,
    calls,
    async count(userId, fromDay, endpoint) {
      calls.push(['count', userId, fromDay, endpoint])
      let n = 0
      for (const r of rows.values()) if (r.userId === userId && r.day >= fromDay && (!endpoint || r.endpoint === endpoint)) n += r.requests
      return n
    },
    async add(userId, endpoint, day, d) {
      calls.push(['add', userId, endpoint, day, d])
      const k = `${userId}|${endpoint}|${day}`
      const r = rows.get(k) ?? { userId, endpoint, day, requests: 0, failures: 0, prompt_tokens: 0, output_tokens: 0, duration_ms: 0 }
      r.requests = Math.max(0, r.requests + (d.requests ?? 0))
      r.failures += d.failures ?? 0
      r.prompt_tokens += d.prompt_tokens ?? 0
      r.output_tokens += d.output_tokens ?? 0
      r.duration_ms += d.duration_ms ?? 0
      rows.set(k, r)
    }
  }
  return store
}

// ── 대기열: 모든 사용자가 같은 Mac mini를 나눠 쓴다 ──
// 두 갈래(Priority): interactive(사람이 기다리는 요청) 먼저, background(자동 태그·분류 같은 뒷일)는 남는 자리에서만.
// 같은 갈래 안에서는 사용자별 돌아가며(라운드 로빈) — 한 사람이 줄을 길게 세워도 다른 사람은 한 바퀴 안에 차례가 온다.
// background는 동시에 bgConcurrency개까지만 돌고(기본: 전체-1, 최소 1), 사용자당 bgPerUser개까지만 돈다.
// 줄이 꽉 찼을 때 interactive가 오면 가장 늦게 들어온 background를 밀어낸다(bg_deferred + Retry-After, 앱이 나중에 다시).
export type Priority = 'interactive' | 'background'
/** 갈래: front = 같은 턴의 이어 받기(47 §9 — 사용자 차례가 이미 시작됨), interactive, background */
type LaneKey = 'front' | Priority
type Waiter = {
  seq: number
  user: string
  cls: Priority
  lane: LaneKey
  start: () => void
  reject: (e: unknown) => void
  onPosition?: (position: number, waiting: number) => void
  shown?: number
}
export type QueueOptions = { maxBg?: number; bgConcurrency?: number; bgPerUser?: number; bgRetryAfter?: number }
type Lane = { ring: string[]; byUser: Map<string, Waiter[]>; size: number }
const lane = (): Lane => ({ ring: [], byUser: new Map(), size: 0 })

export class AiQueue {
  running = 0
  runningBg = 0
  private bgByUser = new Map<string, number>()
  private lanes: Record<LaneKey, Lane> = { front: lane(), interactive: lane(), background: lane() }
  private seq = 0
  concurrency: number
  /** 대기 전체 상한(두 갈래 합) */
  max: number
  /** background 대기 상한 */
  maxBg: number
  bgConcurrency: number
  bgPerUser: number
  bgRetryAfter: number
  constructor(concurrency: number, max: number, opts: QueueOptions = {}) {
    this.concurrency = concurrency
    this.max = max
    this.maxBg = Math.min(max, opts.maxBg ?? max)
    this.bgConcurrency = Math.max(1, Math.min(concurrency, opts.bgConcurrency ?? Math.max(1, concurrency - 1)))
    this.bgPerUser = Math.max(1, opts.bgPerUser ?? 1)
    this.bgRetryAfter = opts.bgRetryAfter ?? 60
  }
  /** 차례 순서대로 늘어선 대기 목록(사용자 정보는 밖으로 내보내지 않는다 — 길이·순서 확인용) */
  get waiting(): Waiter[] { return this.order() }
  waitingOf(cls: LaneKey) { return this.lanes[cls].size }
  private get total() { return this.lanes.front.size + this.lanes.interactive.size + this.lanes.background.size }
  /** interactive도 더 받을 수 없다(밀어낼 background도 없다) */
  get full() { return this.admitError('interactive') !== null }

  /** 지금 이 갈래 요청을 줄에 세울 수 있는지(못 세우면 그 오류). 바로 돌 수 있으면 언제나 null */
  admitError(cls: Priority): AiError | null {
    const total = this.total
    if (cls === 'interactive') {
      if (total < this.max || this.lanes.background.size > 0) return null
      return new AiError('queue_full', 10)
    }
    if (this.lanes.background.size >= this.maxBg || total >= this.max) return new AiError('bg_deferred', this.bgRetryAfter)
    return null
  }

  /** 차례가 오면 release 함수를 돌려준다. signal이 끊기면 줄에서 빠진다 */
  /** front = 같은 턴 이어 받기: 줄 맨 앞, 꽉 차도 받는다 */
  acquire(signal: AbortSignal, onPosition?: Waiter['onPosition'], opts: { user?: string; priority?: Priority; front?: boolean } = {}): Promise<() => void> {
    if (signal.aborted) return Promise.reject(signal.reason)
    const cls = opts.priority ?? 'interactive'
    const user = opts.user ?? ''
    const laneKey: LaneKey = opts.front && cls === 'interactive' ? 'front' : cls
    if (laneKey !== 'front') {
      const err = this.admitError(cls)
      // 꽉 찼어도 바로 돌 수 있으면 받는다(대기 0)
      if (err && !this.runnableNow(laneKey, user)) return Promise.reject(err)
      if (cls === 'interactive' && this.total >= this.max && !this.runnableNow(laneKey, user)) this.evictNewestBg()
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this.remove(entry)) { reject(signal.reason); this.notify() }
      }
      const entry: Waiter = {
        seq: this.seq++, user, cls, lane: laneKey, onPosition,
        start: () => {
          signal.removeEventListener('abort', onAbort)
          this.running++
          if (cls === 'background') { this.runningBg++; this.bgByUser.set(user, (this.bgByUser.get(user) ?? 0) + 1) }
          resolve(this.releaser(cls, user))
        },
        reject: (e) => { signal.removeEventListener('abort', onAbort); reject(e) }
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.push(entry)
      this.pump()
      this.notify()
    })
  }

  /** 운영 상태(사용자 정보 없음) */
  stats() {
    return {
      running: this.running, waiting: this.total, concurrency: this.concurrency, max: this.max,
      front: { waiting: this.lanes.front.size },
      interactive: { running: this.running - this.runningBg, waiting: this.lanes.interactive.size },
      background: { running: this.runningBg, waiting: this.lanes.background.size, concurrency: this.bgConcurrency, max: this.maxBg }
    }
  }

  private runnableNow(laneKey: LaneKey, user: string) {
    if (this.running >= this.concurrency) return false
    if (laneKey === 'front') return this.lanes.front.size === 0
    if (laneKey === 'interactive') return this.lanes.front.size === 0 && this.lanes.interactive.size === 0
    return this.total === 0 && this.bgCanRun(user)
  }
  private bgCanRun(user: string) { return this.runningBg < this.bgConcurrency && (this.bgByUser.get(user) ?? 0) < this.bgPerUser }
  private push(w: Waiter) {
    const l = this.lanes[w.lane]
    const list = l.byUser.get(w.user)
    if (list) list.push(w)
    else { l.byUser.set(w.user, [w]); l.ring.push(w.user) }
    l.size++
  }
  private remove(w: Waiter): boolean {
    const l = this.lanes[w.lane]
    const list = l.byUser.get(w.user)
    const i = list ? list.indexOf(w) : -1
    if (!list || i < 0) return false
    list.splice(i, 1)
    l.size--
    if (!list.length) { l.byUser.delete(w.user); l.ring.splice(l.ring.indexOf(w.user), 1) }
    return true
  }
  /** 이 갈래에서 다음 차례(라운드 로빈). 돌 수 있는 사람이 없으면 undefined */
  private take(cls: LaneKey): Waiter | undefined {
    const l = this.lanes[cls]
    for (let i = 0; i < l.ring.length; i++) {
      const user = l.ring[i]
      if (cls === 'background' && !this.bgCanRun(user)) continue
      const list = l.byUser.get(user)!
      const w = list.shift()!
      l.size--
      l.ring.splice(i, 1)
      if (list.length) l.ring.push(user) // 남은 요청이 있으면 한 바퀴 뒤로
      else l.byUser.delete(user)
      return w
    }
    return undefined
  }
  private pump() {
    while (this.running < this.concurrency) {
      const w = this.take('front') ?? this.take('interactive') ?? (this.lanes.front.size || this.lanes.interactive.size ? undefined : this.take('background'))
      if (!w) break
      w.start()
    }
  }
  private evictNewestBg() {
    let newest: Waiter | undefined
    for (const list of this.lanes.background.byUser.values()) for (const w of list) if (!newest || w.seq > newest.seq) newest = w
    if (!newest) return
    this.remove(newest)
    newest.reject(new AiError('bg_deferred', this.bgRetryAfter))
  }
  /** 지금 상태에서 차례가 올 순서(흉내만, 바꾸지 않는다) */
  private order(): Waiter[] {
    const out: Waiter[] = []
    for (const cls of ['front', 'interactive', 'background'] as const) {
      const l = this.lanes[cls]
      const ring = [...l.ring]
      const lists = new Map([...l.byUser].map(([u, ws]) => [u, [...ws]]))
      while (ring.length) {
        const user = ring.shift()!
        const list = lists.get(user)!
        out.push(list.shift()!)
        if (list.length) ring.push(user)
      }
    }
    return out
  }
  private releaser(cls: Priority, user: string) {
    let done = false
    return () => {
      if (done) return
      done = true
      this.running--
      if (cls === 'background') {
        this.runningBg--
        const n = (this.bgByUser.get(user) ?? 1) - 1
        if (n > 0) this.bgByUser.set(user, n)
        else this.bgByUser.delete(user)
      }
      this.pump()
      this.notify()
    }
  }
  /** 앞 순서가 바뀐 사람에게만 알린다 */
  private notify() {
    const all = this.order()
    all.forEach((w, i) => {
      if (w.shown === i + 1) return
      w.shown = i + 1
      w.onPosition?.(i + 1, all.length)
    })
  }
}

// ── 요청 검사 ──
type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

/** qwen3.5 + think:false(Ollama 0.31 실측, 2026-10-05)는 format 스키마를 강제하지 않고 그냥 문장으로 답한다.
 *  생각을 켜면 형식은 지키지만 700토큰을 생각에 다 써서 빈 답이 된다 → 생각은 끈 채로 지시문에 모양을 직접 적는다(format도 그대로 넘긴다) */
export function withFormatHint(messages: Msg[], format: AiInput['format']): Msg[] {
  if (format === undefined) return messages
  const hint = format === 'json'
    ? 'Reply with ONE JSON value only. No prose, no markdown code fences, no explanation.'
    : `Reply with ONE JSON value only. No prose, no markdown code fences, no explanation. It must match this JSON Schema exactly (all required keys, allowed enum values only):\n${JSON.stringify(format)}`
  const [first, ...rest] = messages
  return first?.role === 'system' ? [{ ...first, content: `${first.content}\n\n${hint}` }, ...rest] : [{ role: 'system', content: hint }, ...messages]
}
export type AiInput = { messages: Msg[]; format?: 'json' | Record<string, unknown>; model?: string; stream: boolean; temperature: number }
const ROLES = new Set(['system', 'user', 'assistant'])
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function validateInput(body: unknown, cfg: AiConfig): AiInput {
  if (!isObj(body) || !Array.isArray(body.messages) || !body.messages.length) throw new AiError('bad_request')
  if (body.messages.length > cfg.maxMessages) throw new AiError('too_large')
  let total = 0
  const messages: Msg[] = body.messages.map((m: unknown) => {
    if (!isObj(m) || typeof m.role !== 'string' || !ROLES.has(m.role) || typeof m.content !== 'string') throw new AiError('bad_request')
    if (m.content.length > cfg.maxMessageChars) throw new AiError('too_large')
    total += m.content.length
    return { role: m.role as Msg['role'], content: m.content } // images 등 다른 칸은 버린다
  })
  if (total > cfg.maxTotalChars) throw new AiError('too_large')
  let format: AiInput['format']
  if (body.format !== undefined && body.format !== null) {
    if (body.format !== 'json' && !isObj(body.format)) throw new AiError('bad_request')
    if (JSON.stringify(body.format).length > 20_000) throw new AiError('too_large')
    format = body.format as AiInput['format']
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || !body.model || body.model.length > 200)) throw new AiError('bad_request')
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new AiError('bad_request')
  let temperature = 0
  if (body.options !== undefined) {
    if (!isObj(body.options)) throw new AiError('bad_request')
    const t = body.options.temperature
    if (t !== undefined && (typeof t !== 'number' || !(t >= 0 && t <= 2))) throw new AiError('bad_request')
    if (typeof t === 'number') temperature = t
  }
  return { messages, format, model: body.model as string | undefined, stream: body.stream === true, temperature }
}

// ── 47 AI 비서 agent: 도구·tool 메시지 검사 ──
export type AgentMsg = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { function: { name: ToolName; arguments: Record<string, unknown> } }[]
  tool_name?: ToolName
}
export type AgentInput = { messages: AgentMsg[]; tools: ToolName[]; model?: string; stream: boolean; temperature: number }
/** body.mode — 'agent'만 새 경로, 없으면 예전 경로, 그 밖은 잘못된 요청 */
export function assistantModeOf(body: unknown): 'agent' | null {
  const mode = isObj(body) ? body.mode : undefined
  if (mode === undefined || mode === null) return null
  if (mode === 'agent') return 'agent'
  throw new AiError('bad_request')
}
export const TURN_HEADER = 'x-sprout-turn'
export function turnIdOf(header: string | string[] | undefined): string {
  const v = Array.isArray(header) ? header[0] : header
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) throw new AiError('bad_request')
  return v
}
/** 앱이 보낸 도구 목록(이름 또는 {function:{name}}) → 이름. 서버 목록의 부분집합·중복 없음·10개까지 */
export function toolNamesOf(tools: unknown): ToolName[] {
  if (tools === undefined || tools === null) return []
  if (!Array.isArray(tools) || tools.length > 10) throw new AiError('bad_request')
  const names = tools.map((t) => (typeof t === 'string' ? t : isObj(t) && isObj(t.function) ? t.function.name : undefined))
  if (names.some((n) => !isToolName(n)) || new Set(names).size !== names.length) throw new AiError('bad_request')
  return names as ToolName[]
}
export function validateAgentInput(body: unknown, cfg: AiConfig): AgentInput {
  if (!isObj(body) || !Array.isArray(body.messages) || !body.messages.length) throw new AiError('bad_request')
  if (body.messages.length > cfg.agentMaxMessages) throw new AiError('too_large')
  if (body.format !== undefined && body.format !== null) throw new AiError('bad_request')
  const tools = toolNamesOf(body.tools)
  let total = 0
  const messages: AgentMsg[] = body.messages.map((m: unknown) => {
    if (!isObj(m) || typeof m.role !== 'string' || !['system', 'user', 'assistant', 'tool'].includes(m.role)) throw new AiError('bad_request')
    const role = m.role as AgentMsg['role']
    const content = m.content === undefined && role === 'assistant' ? '' : m.content
    if (typeof content !== 'string') throw new AiError('bad_request')
    if (content.length > cfg.maxMessageChars) throw new AiError('too_large')
    total += content.length
    const out: AgentMsg = { role, content } // 다른 칸(images 등)은 버린다
    if (role === 'assistant' && m.tool_calls !== undefined && m.tool_calls !== null) {
      if (!Array.isArray(m.tool_calls) || m.tool_calls.length > 3) throw new AiError('bad_request')
      out.tool_calls = m.tool_calls.map((c: unknown) => {
        const f = isObj(c) && isObj(c.function) ? c.function : null
        if (!f || !isToolName(f.name)) throw new AiError('bad_request')
        let args: unknown = f.arguments ?? {}
        if (typeof args === 'string') { try { args = JSON.parse(args) } catch { throw new AiError('bad_request') } }
        if (!isObj(args)) throw new AiError('bad_request')
        total += JSON.stringify(args).length
        return { function: { name: f.name, arguments: args } }
      })
    }
    // 앞 라운드 결과는 이번 호출 도구 목록(답만 쓰는 마지막 호출은 비어 있음)과 상관없이 서버 도구 이름이면 된다
    if (role === 'tool') {
      if (!isToolName(m.tool_name)) throw new AiError('bad_request')
      out.tool_name = m.tool_name
    }
    return out
  })
  if (total > cfg.maxTotalChars) throw new AiError('too_large')
  if (body.model !== undefined && (typeof body.model !== 'string' || !body.model || body.model.length > 200)) throw new AiError('bad_request')
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new AiError('bad_request')
  let temperature = 0
  if (body.options !== undefined) {
    if (!isObj(body.options)) throw new AiError('bad_request')
    const t = body.options.temperature
    if (t !== undefined && (typeof t !== 'number' || !(t >= 0 && t <= 2))) throw new AiError('bad_request')
    if (typeof t === 'number') temperature = t
  }
  return { messages: prepareAgentMessages(messages), tools, model: body.model as string | undefined, stream: body.stream === true, temperature }
}
/** 지시문은 서버 것만: 앱 system을 모두 버리고 system = AGENT_SYSTEM(고정). 앱 칸(오늘·날짜표·이름·이어 받을 것 — 규칙이 아닌 사실, 자름)은
 *  이번 질문(재촉 줄이 아닌 마지막 user) 앞에 붙인다 — system + 도구 정의가 늘 같아야 Ollama가 그 앞부분(약 1,000토큰)을 캐시에서 읽는다(47 §14, 실측 research 39 §8). 끝은 user 또는 tool */
export function prepareAgentMessages(messages: AgentMsg[]): AgentMsg[] {
  const ctx = (messages.find((m) => m.role === 'system')?.content ?? '').trim().slice(0, AGENT_CONTEXT_MAX)
  const rest = messages.filter((m) => m.role !== 'system')
  const last = rest.at(-1)?.role
  if (last !== 'user' && last !== 'tool') throw new AiError('bad_request')
  if (ctx) {
    let i = rest.length - 1
    while (i >= 0 && !(rest[i].role === 'user' && rest[i].content !== NUDGE)) i--
    if (i >= 0) rest[i] = { ...rest[i], content: `[앱 정보]\n${ctx}\n\n[질문]\n${rest[i].content}` }
  }
  return [{ role: 'system', content: AGENT_SYSTEM }, ...rest]
}

// ── 일기(28 §8): 서버가 정하는 지시 ──
/** 용도별 메시지 손보기: diary = 지시 끝에 들은 말만, diary-chat = 대화 규칙·들은 말만이 없으면 덧붙임, diary-distill = 서버 지시 + <conversation> 하나 */
export function prepareMessages(endpoint: Endpoint, messages: Msg[]): Msg[] {
  const ensure = (rules: string[]) => {
    const [first, ...rest] = messages
    if (first?.role !== 'system') return [{ role: 'system' as const, content: rules.join('\n\n') }, ...messages]
    const add = rules.filter((r) => !first.content.includes(r))
    return add.length ? [{ ...first, content: `${first.content}\n\n${add.join('\n\n')}` }, ...rest] : messages
  }
  if (endpoint === 'diary') return ensure([DIARY_GROUNDING])
  if (endpoint === 'diary-chat') {
    if (messages.at(-1)?.role !== 'user') throw new AiError('bad_request')
    return ensure([COMPANION_RULES, DIARY_GROUNDING])
  }
  if (endpoint === 'diary-distill') {
    const talk = [...messages].reverse().find((m) => m.role === 'user')
    if (!talk || !talk.content.trim()) throw new AiError('bad_request')
    return [{ role: 'system', content: DISTILL_SYSTEM }, { role: 'user', content: talk.content }]
  }
  return messages
}
/** 용도별 형식: 옮기기는 언제나 서버 스키마 */
export const formatFor = (endpoint: Endpoint, format: AiInput['format']): AiInput['format'] => (endpoint === 'diary-distill' ? (DISTILL_SCHEMA as unknown as Record<string, unknown>) : format)
/** /ai/diary 몸의 mode → 실제 용도. 없으면 reply(예전 앱 그대로) */
export function diaryEndpointOf(body: unknown): Endpoint {
  const mode = isObj(body) ? body.mode : undefined
  if (mode === undefined || mode === null || mode === 'reply') return 'diary'
  if (mode === 'chat') return 'diary-chat'
  if (mode === 'distill' || mode === 'polish') return 'diary-distill'
  throw new AiError('bad_request')
}

/** Ollama /api/tags에서 쓸 수 있는 로컬 모델만(데스크톱 localModels와 같은 기준) */
export function localModelNames(tags: any, allow: string[] = []): string[] {
  const list = Array.isArray(tags?.models) ? tags.models : []
  return list
    .filter((m: any) => typeof m?.name === 'string' && !m.remote_host && !m.remote_model && !/cloud/i.test(m.name) && (!m.capabilities || m.capabilities.includes('completion')) && !/bert/i.test(m.details?.family ?? ''))
    .map((m: any) => m.name as string)
    .filter((name: string) => !allow.length || allow.includes(name))
}

async function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  if (Number(req.headers['content-length'] ?? 0) > limit) throw new AiError('too_large')
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new AiError('too_large')
    chunks.push(c)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new AiError('bad_request') }
}

// ── 본체 ──
export type AiDeps = {
  config: AiConfig
  store: UsageStore
  /** Ollama까지 나르는 방법(ai-backend.ts: direct | worker) */
  backend: AiBackend
  /** JWT 확인 → 사용자 id. 실패하면 던진다 */
  auth: (req: IncomingMessage) => Promise<string>
  now?: () => number
  log?: (line: string) => void
}

export function createAi(deps: AiDeps) {
  const cfg = deps.config
  const now = deps.now ?? Date.now
  const log = deps.log ?? ((l: string) => console.error(l))
  const queue = new AiQueue(cfg.concurrency, cfg.queueMax, {
    maxBg: cfg.queueMaxBg, bgConcurrency: cfg.bgConcurrency, bgPerUser: cfg.userBgConcurrent, bgRetryAfter: cfg.bgRetryAfter
  })
  const minute = new Map<string, number[]>()
  const inflight = new Map<string, number>() // interactive
  const bgInflight = new Map<string, number>()
  const counter = (cls: Priority) => (cls === 'background' ? bgInflight : inflight)
  const locks = new Map<string, Promise<unknown>>()
  /** 47 §9 턴 셈: `${사용자}:${턴 id}` → 호출 수·첫 호출 시각(숫자만) */
  const turns = new Map<string, { calls: number; firstAt: number }>()
  const sweepTurns = (t: number) => { for (const [k, v] of turns) if (t - v.firstAt > cfg.turnTtlMs) turns.delete(k) }

  // 같은 사용자의 상한 확인 + 예약을 한 번에 하나씩(동시 요청으로 주간 상한을 넘지 못하게)
  async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (locks.get(key) ?? Promise.resolve()).then(fn, fn)
    const tail = run.catch(() => {})
    locks.set(key, tail)
    try { return await run } finally { if (locks.get(key) === tail) locks.delete(key) }
  }

  async function models(): Promise<string[]> {
    try {
      return localModelNames(await deps.backend.tags(), cfg.allowModels)
    } catch {
      throw new AiError('unavailable', 30)
    }
  }

  async function reserve(userId: string, endpoint: Endpoint, cls: Priority) {
    return withLock(userId, async () => {
      const t = now()
      if (cls === 'background') {
        if ((bgInflight.get(userId) ?? 0) >= cfg.userBgConcurrent) throw new AiError('bg_busy', cfg.bgRetryAfter)
      } else if ((inflight.get(userId) ?? 0) >= cfg.userConcurrent) throw new AiError('user_busy', 5)
      const recent = (minute.get(userId) ?? []).filter((x) => t - x < 60_000)
      if (recent.length >= cfg.perMinute) throw new AiError('rate_minute', (recent[0] + 60_000 - t) / 1000)
      const day = dayKey(t, cfg.tzOffsetMin)
      if ((await deps.store.count(userId, day)) >= cfg.perDay) throw new AiError('rate_day', secsToNextDay(t, cfg.tzOffsetMin))
      const weeklyCap = cfg.weekly[endpoint]
      if (weeklyCap !== undefined && (await deps.store.count(userId, weekKey(t, cfg.tzOffsetMin), endpoint)) >= weeklyCap) {
        throw new AiError('weekly', secsToNextWeek(t, cfg.tzOffsetMin))
      }
      const dailyCap = cfg.daily?.[endpoint]
      if (dailyCap !== undefined && (await deps.store.count(userId, day, endpoint)) >= dailyCap) {
        throw new AiError('daily', secsToNextDay(t, cfg.tzOffsetMin))
      }
      const full = queue.admitError(cls)
      if (full) throw full
      await deps.store.add(userId, endpoint, day, { requests: 1 })
      recent.push(t)
      minute.set(userId, recent)
      const c = counter(cls)
      c.set(userId, (c.get(userId) ?? 0) + 1)
      return { day, at: t }
    })
  }
  /** 같은 턴 2~4번째: 분·일·용도 상한은 세지 않고 동시 요청만 본다 */
  async function reserveFollowup(userId: string, cls: Priority) {
    return withLock(userId, async () => {
      if ((counter(cls).get(userId) ?? 0) >= (cls === 'background' ? cfg.userBgConcurrent : cfg.userConcurrent)) throw new AiError('user_busy', 5)
      const t = now()
      const c = counter(cls)
      c.set(userId, (c.get(userId) ?? 0) + 1)
      return { day: dayKey(t, cfg.tzOffsetMin), at: t }
    })
  }
  /** 서버가 바빠서 못 한 요청은 분 상한에서도 되돌린다(앱 잘못이 아니다) */
  function refundMinute(userId: string, at: number) {
    const list = minute.get(userId)
    const i = list?.indexOf(at) ?? -1
    if (list && i >= 0) list.splice(i, 1)
  }

  function sendError(res: ServerResponse, e: AiError) {
    if (res.destroyed || res.writableEnded) return
    if (res.headersSent) {
      res.end(JSON.stringify({ error: e.message, code: e.code, ...(e.retryAfter ? { retry_after: e.retryAfter } : {}) }) + '\n')
      return
    }
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
    if (e.retryAfter) headers['retry-after'] = String(e.retryAfter)
    res.writeHead(e.status, headers)
    res.end(JSON.stringify({ error: e.message, code: e.code, ...(e.retryAfter ? { retry_after: e.retryAfter } : {}) }))
  }

  const toAiError = (e: unknown, fallback: AiCode): AiError => {
    if (e instanceof AiError) return e
    if (e instanceof Error && e.name === 'TimeoutError') return new AiError(fallback === 'unavailable' ? 'timeout' : fallback)
    return new AiError(fallback)
  }

  async function status(req: IncomingMessage, res: ServerResponse) {
    const userId = await deps.auth(req).catch(() => { throw new AiError('unauthorized') })
    let names: string[] = []
    let available = false
    try { names = await models(); available = names.length > 0 } catch { /* 꺼짐 */ }
    const t = now()
    const week = weekKey(t, cfg.tzOffsetMin)
    const weekly: Record<string, { used: number; limit: number }> = {}
    for (const [ep, limit] of Object.entries(cfg.weekly)) weekly[ep] = { used: await deps.store.count(userId, week, ep as Endpoint), limit: limit! }
    const today = dayKey(t, cfg.tzOffsetMin)
    const daily: Record<string, { used: number; limit: number }> = {}
    for (const [ep, limit] of Object.entries(cfg.daily ?? {})) daily[ep] = { used: await deps.store.count(userId, today, ep as Endpoint), limit: limit! }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      available,
      message: available ? null : MESSAGES.unavailable[1],
      models: names,
      default_model: names.includes(cfg.defaultModel) ? cfg.defaultModel : names[0] ?? null,
      backend: deps.backend.name,
      queue: queue.stats(), // 갈래별 길이만(누가 기다리는지는 없다)
      features: ['agent'], // 47: 앱은 이게 있으면 자유 대화 + 도구 경로를 쓴다
      limits: { per_minute: cfg.perMinute, per_day: cfg.perDay, num_ctx: cfg.numCtx, num_predict: cfg.numPredict, timeout_ms: cfg.timeoutMs },
      usage: { today: await deps.store.count(userId, today), weekly, daily }
    }))
  }

  async function run(endpoint: Endpoint, req: IncomingMessage, res: ServerResponse) {
    const userId = await deps.auth(req).catch(() => { throw new AiError('unauthorized') })
    const body = await readBody(req, cfg.maxBodyBytes)
    if (endpoint === 'diary') endpoint = diaryEndpointOf(body)
    const agent = endpoint === 'assistant' ? assistantModeOf(body) === 'agent' : false
    const turnId = agent ? turnIdOf(req.headers[TURN_HEADER]) : null
    const agentInput = agent ? validateAgentInput(body, cfg) : null
    const input: AiInput = agentInput ? { messages: [], model: agentInput.model, stream: agentInput.stream, temperature: agentInput.temperature } : validateInput(body, cfg)
    const messages: (Msg | AgentMsg)[] = agentInput ? agentInput.messages : prepareMessages(endpoint, input.messages)
    const format = agentInput ? undefined : formatFor(endpoint, input.format)
    const names = await models()
    if (!names.length) throw new AiError('unavailable', 30)
    const model = input.model ?? (names.includes(cfg.defaultModel) ? cfg.defaultModel : names[0])
    if (!names.includes(model)) throw new AiError('model')
    const cls = priorityOf(endpoint, req.headers[PRIORITY_HEADER], cfg.background)
    // 47 §9 턴: 첫 호출만 상한에서 센다. 이어 받기는 줄 맨 앞, 4번 넘으면 거절, 150초 넘으면 시간 초과
    const turnKey = turnId ? `${userId}:${turnId}` : null
    let followup = false
    if (turnKey) {
      const t0 = now()
      sweepTurns(t0)
      const t = turns.get(turnKey)
      if (t) {
        if (t.calls >= cfg.turnMaxCalls) throw new AiError('turn_limit')
        if (t0 - t.firstAt > cfg.turnMaxMs) throw new AiError('timeout')
        followup = true
      }
    }
    const { day, at } = followup ? await reserveFollowup(userId, cls) : await reserve(userId, endpoint, cls)
    if (turnKey) {
      const t = turns.get(turnKey)
      if (followup && t) t.calls++
      else turns.set(turnKey, { calls: 1, firstAt: at })
    }

    // 클라이언트가 끊으면 대기열에서 빠지고 Ollama 요청도 멈춘다
    const client = new AbortController()
    res.on('close', () => { if (!res.writableFinished) client.abort(new AiError('aborted')) })
    const queuedAt = now()
    let release: (() => void) | undefined
    let ok = false
    const usage: UsageDelta = {}
    const write = (s: string) => { if (!res.destroyed && !res.writableEnded) res.write(s) }
    try {
      if (input.stream) {
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
        res.flushHeaders()
      }
      const onPosition = input.stream
        ? (position: number, waiting: number) => write(JSON.stringify({ queue: { position, waiting } }) + '\n')
        : undefined
      const waitSignal = AbortSignal.any([client.signal, AbortSignal.timeout(cfg.queueWaitMs)])
      release = await queue.acquire(waitSignal, onPosition, { user: userId, priority: cls, front: followup }).catch((e) => {
        if (e instanceof Error && e.name === 'TimeoutError') throw cls === 'background' ? new AiError('bg_deferred', cfg.bgRetryAfter) : new AiError('queue_timeout', 10)
        throw e
      })
      if (input.stream) write(JSON.stringify({ queue: { position: 0, waiting: queue.waiting.length } }) + '\n')

      const signal = AbortSignal.any([client.signal, AbortSignal.timeout(agentInput ? cfg.agentCallTimeoutMs : cfg.timeoutMs)])
      const started = now()
      // 백엔드에는 늘 stream:true로 보낸다(워커 방식도 같은 모양, 끊으면 바로 멈춤). stream:false 요청은 여기서 모아서 준다
      const upstream = await deps.backend.chat(agentInput
        ? {
            model,
            messages,
            ...(agentInput.tools.length ? { tools: agentInput.tools.map((n) => TOOL_SPECS[n]) } : {}),
            stream: true,
            think: false,
            keep_alive: cfg.keepAlive,
            options: { temperature: input.temperature, num_ctx: cfg.agentNumCtx, num_predict: agentInput.tools.length ? cfg.agentPredictTools : cfg.agentPredictAnswer }
          }
        : {
            model,
            messages: withFormatHint(messages as Msg[], format),
            ...(format !== undefined ? { format } : {}),
            stream: true,
            think: false,
            keep_alive: cfg.keepAlive,
            options: { temperature: input.temperature, num_ctx: cfg.numCtx, num_predict: cfg.predict?.[endpoint] ?? cfg.numPredict }
          }, signal).catch((e) => { throw toAiError(e, 'unavailable') })
      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel().catch(() => {})
        throw new AiError(upstream.status === 404 ? 'model' : 'unavailable', 30)
      }
      const final = (o: any) => {
        usage.prompt_tokens = Number(o?.prompt_eval_count) || 0
        usage.output_tokens = Number(o?.eval_count) || 0
        usage.duration_ms = Math.round(Number(o?.total_duration) / 1e6) || now() - started
      }

      // NDJSON을 줄 단위로 읽는다: 스트림이면 그대로 넘기고, 아니면 내용만 모은다. 마지막 줄(done)에서 숫자만 읽는다
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      let content = ''
      const toolCalls: unknown[] = []
      let totalDuration: unknown = null
      const line = (raw: string) => {
        if (!raw.trim()) return
        let item: any
        try { item = JSON.parse(raw) } catch { throw new AiError('unavailable') }
        if (item?.error) throw new AiError('unavailable', 30)
        if (input.stream) write(raw + '\n')
        else {
          if (typeof item?.message?.content === 'string') content += item.message.content
          if (Array.isArray(item?.message?.tool_calls)) toolCalls.push(...item.message.tool_calls)
        }
        if (item?.done) { done = true; totalDuration = item.total_duration ?? null; final(item) }
      }
      try {
        while (!done) {
          const chunk = await reader.read().catch((e) => { throw toAiError(e, 'unavailable') })
          if (chunk.done) { buffer += decoder.decode(); line(buffer); break }
          buffer += decoder.decode(chunk.value, { stream: true })
          let end: number
          while ((end = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1) }
        }
      } finally { await reader.cancel().catch(() => {}) }
      if (!done) throw new AiError('unavailable', 30)
      if (input.stream) res.end()
      else {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({
          model, message: { role: 'assistant', content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, done: true,
          prompt_eval_count: usage.prompt_tokens, eval_count: usage.output_tokens, total_duration: totalDuration, queue_wait_ms: started - queuedAt
        }))
      }
      ok = true
    } catch (e) {
      if (turnKey && !followup) turns.delete(turnKey) // 첫 호출 실패 = 턴도 없던 일(다시 시도는 새 턴)
      if (client.signal.aborted) throw new AiError('aborted')
      const err = toAiError(e, 'server')
      if (!release && LOAD_CODES.has(err.code)) refundMinute(userId, at)
      throw err
    } finally {
      release?.()
      const c = counter(cls)
      c.set(userId, Math.max(0, (c.get(userId) ?? 1) - 1))
      if (!c.get(userId)) c.delete(userId)
      // 실패·중단은 상한에서 되돌린다(주간 1회를 날리지 않게). 숫자만 남긴다
      // 이어 받기(같은 턴 2번째~)는 처음부터 세지 않았으니 되돌릴 것도 없다
      const delta: UsageDelta = ok ? usage : followup ? { failures: 1 } : { requests: -1, failures: 1 }
      await deps.store.add(userId, endpoint, day, delta).catch(() => log(`ai usage write failed (${endpoint})`))
    }
  }

  /** /ai/* 이면 처리하고 true. 그 밖의 경로는 false */
  async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (path !== '/ai' && !path.startsWith('/ai/')) return false
    try {
      if (path.startsWith('/ai/worker/')) {
        if (!(await deps.backend.handle?.(req, res, path))) throw new AiError('not_found')
        return true
      }
      const name = path.slice(4)
      if (name === 'status' && req.method === 'GET') await status(req, res)
      else if (req.method === 'POST' && isEndpoint(name) && !name.startsWith('diary-')) await run(name, req, res) // 일기 용도는 /ai/diary {mode}로만
      else throw new AiError('not_found')
    } catch (e) {
      const err = toAiError(e, 'server')
      if (err.code === 'server') log(`ai ${path} error: ${e instanceof Error ? e.name : 'unknown'}`) // 원문·메시지는 남기지 않는다
      sendError(res, err)
    }
    return true
  }

  return { handle, queue, models }
}
