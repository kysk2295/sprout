import { app, ipcMain } from 'electron'
import { AGENT_UNSUPPORTED, readAgentStream, readChatStream, type AgentInput, type AiPurpose, type ChatInput } from '../shared/assistant'
import { createRemoteOllama } from './remoteOllama'
import { serverAccess } from './sync'

// AI 경로(PRD AI 사용 원칙): 기본 = sprout API의 AI 프록시(/ai/<용도>, 로그인 토큰, 서버 대기열·상한).
// SPROUT_AI_SSH=1이면 오너 개발용으로 예전처럼 SSH → Mac mini Ollama에 바로 붙는다.
const PURPOSES: AiPurpose[] = ['assistant', 'classify', 'map', 'diary', 'kpi-draft', 'weekly-report', 'breakdown', 'tag']
const UNAVAILABLE = '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.'

async function server(path: string, init: RequestInit & { signal?: AbortSignal } = {}) {
  const { url: apiUrl, token } = await serverAccess()
  // 개발 전용: SPROUT_AI_URL이면 /ai/*만 그 주소로(배포 전 시험 — server/scripts/ai-local.ts). 로그인·동기화는 그대로
  const url = path.startsWith('/ai/') && process.env.SPROUT_AI_URL ? process.env.SPROUT_AI_URL.replace(/\/+$/, '') : apiUrl
  if (!token) throw new Error('로그인하면 AI를 쓸 수 있어요.')
  let res: Response
  try {
    res = await fetch(`${url}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init.headers } })
  } catch (e) {
    if (init.signal?.aborted) throw e
    throw new Error(UNAVAILABLE)
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    // 47: 서버가 agent를 모르면(배포 전 400) 렌더러가 13 의도 경로로
    if (res.status === 400 && (init as { agentFirst?: boolean }).agentFirst) throw new Error(AGENT_UNSUPPORTED)
    let message = typeof json?.error === 'string' ? json.error : res.status >= 500 ? UNAVAILABLE : 'AI 요청을 처리하지 못했어요. 다시 시도해 주세요.'
    // 13 §6 상한(429): "잠시 뒤 다시 시도해 주세요. (오늘 남은 요청 N회)" + 다시 시도는 Retry-After 뒤에
    if (res.status === 429 && json?.code !== 'weekly' && json?.code !== 'daily' && json?.code !== 'bg_busy') {
      const left = await remainingToday().catch(() => undefined)
      if (left !== undefined) message += ` (오늘 남은 요청 ${left}회)`
    }
    throw new Error(message)
  }
  return res
}

async function remainingToday() {
  const status = await (await server('/ai/status', { signal: AbortSignal.timeout(5000) })).json()
  const limit = Number(status?.limits?.per_day), used = Number(status?.usage?.today)
  return Number.isFinite(limit) && Number.isFinite(used) ? Math.max(0, limit - used) : undefined
}

function createServerAi() {
  return {
    /** 용도별 하루 사용량(/ai/status usage.daily) — 예전 서버·연결 실패면 null */
    daily: async (key: string): Promise<{ used: number; limit: number } | null> => {
      try {
        const status = await (await server('/ai/status', { signal: AbortSignal.timeout(8000) })).json()
        const q = status?.usage?.daily?.[key]
        return status?.available && q && typeof q.limit === 'number' ? { used: Number(q.used) || 0, limit: q.limit } : null
      } catch { return null }
    },
    /** 47: 서버 기능(features)·AI 비서 하루 턴 사용량 */
    features: async (): Promise<{ agent: boolean; daily: { used: number; limit: number } | null }> => {
      try {
        const status = await (await server('/ai/status', { signal: AbortSignal.timeout(8000) })).json()
        const q = status?.usage?.daily?.assistant
        return { agent: !!status?.available && Array.isArray(status?.features) && status.features.includes('agent'), daily: q && typeof q.limit === 'number' ? { used: Number(q.used) || 0, limit: q.limit } : null }
      } catch { return { agent: false, daily: null } }
    },
    /** 47 §19.4 근거 검사가 뺀 문장 수만(POST /ai/ground {hits}). 실패·예전 서버(404)는 조용히 버린다 */
    ground: async (hits: number) => {
      await server('/ai/ground', { method: 'POST', body: JSON.stringify({ hits }), signal: AbortSignal.timeout(8000) }).then((r) => r.body?.cancel()).catch(() => {})
    },
    /** 47 agent 한 번(같은 턴 id). 글 조각·대기열은 IPC로, 끝나면 {content, tool_calls} */
    agent: async (input: AgentInput & { model?: string; call?: number }, signal: AbortSignal, onDelta: (text: string) => void, onQueue: (position: number) => void) => {
      const body = JSON.stringify({ mode: 'agent', ...(input.model ? { model: input.model } : {}), messages: input.messages, tools: input.tools, stream: true })
      const init = { method: 'POST', body, signal, headers: { 'x-sprout-turn': input.turn }, agentFirst: input.call === 1 } as RequestInit & { signal: AbortSignal }
      const res = await server('/ai/assistant', init)
      return readAgentStream(res, onDelta, signal, (q) => onQueue(q.position))
    },
    models: async () => {
      const status = await (await server('/ai/status', { signal: AbortSignal.timeout(15000) })).json()
      if (!status.available) throw new Error(UNAVAILABLE)
      const models: string[] = Array.isArray(status.models) ? status.models : []
      // 서버 기본 모델을 맨 앞에 — 앱이 고른 모델이 없을 때 그걸 쓴다
      return status.default_model ? [status.default_model, ...models.filter((m) => m !== status.default_model)] : models
    },
    chat: async (input: ChatInput, signal: AbortSignal, onDelta?: (text: string) => void, onQueue?: (position: number) => void) => {
      const purpose = input.purpose && PURPOSES.includes(input.purpose) ? input.purpose : 'assistant'
      // 일기 갈래(15 §10.8 · 28 §8.10): mode·temperature를 몸에 싣는다 — 서버가 용도(diary-chat·diary-distill)와 하루 상한을 정한다
      const diary = purpose === 'diary' && input.mode ? { mode: input.mode } : {}
      const options = typeof input.temperature === 'number' ? { options: { temperature: input.temperature } } : {}
      const body = JSON.stringify({ model: input.model, messages: input.messages, format: input.format, stream: true, ...diary, ...options })
      // 뒷일(자동 태그·분류)은 서버 대기열에서 사람이 기다리는 요청 뒤로. 서버가 바쁘면 503/429 + "잠시 뒤" → 부른 쪽이 조용히 나중에(isUnavailable)
      const headers: Record<string, string> = input.priority === 'background' ? { 'x-sprout-priority': 'background' } : {}
      const res = await server(`/ai/${purpose}`, { method: 'POST', body, signal, headers })
      return readChatStream(res, onDelta ?? (() => {}), signal, (q) => onQueue?.(q.position))
    }
  }
}

export function registerAssistant() {
  const remote = process.env.SPROUT_AI_SSH === '1' ? createRemoteOllama() : undefined
  type Ai = Omit<ReturnType<typeof createServerAi>, 'daily' | 'features' | 'agent' | 'ground'> & Partial<Pick<ReturnType<typeof createServerAi>, 'daily' | 'features' | 'agent' | 'ground'>>
  const ai: Ai = remote ?? createServerAi()
  app.on('before-quit', () => remote?.close())
  const requests = new Map<string, AbortController>()
  const cancelled = new Set<string>() // 사용자가 멈춘 요청(시간 초과와 구분)
  ipcMain.handle('assistant:models', () => ai.models())
  ipcMain.handle('assistant:daily', (_e, key: string) => (typeof key === 'string' && key.length < 40 && ai.daily ? ai.daily(key) : null))
  ipcMain.handle('assistant:chat', async (event, id: string, input: ChatInput) => {
    if (typeof id !== 'string' || id.length > 100) throw new Error('잘못된 요청')
    const key = `${event.sender.id}:${id}`
    if (requests.has(key)) throw new Error('중복 요청')
    const abort = new AbortController(); requests.set(key, abort)
    // 창이 닫히거나 새로 불러와지면 그 요청은 아무도 받지 않는다 → 서버 호출도 멈춰 상한(주 1회 등)을 날리지 않게
    const drop = () => abort.abort()
    const navigate = (_e: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => { if (mainFrame && !inPlace) drop() } // 같은 문서 안 이동(#)은 무시
    event.sender.once('destroyed', drop)
    event.sender.on('did-start-navigation', navigate)
    // 서버 대기열을 기다리는 시간까지 넉넉히(서버 대기 180초 + 생성 120초)
    const timer = setTimeout(() => abort.abort(), remote ? 120000 : 320000)
    const send = (payload: { id: string; text: string; queue?: number }) => { if (!event.sender.isDestroyed()) event.sender.send('assistant:delta', payload) }
    // 대기열 위치는 같은 통로로 text 없이 보낸다(queue = 앞에 있는 요청 수, 0이면 내 차례) — 13 §6
    try { return await ai.chat(input, abort.signal, (text) => send({ id, text }), (queue) => send({ id, text: '', queue })) }
    catch (e) { if (abort.signal.aborted && !cancelled.has(key)) throw new Error('AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.'); throw e }
    finally { clearTimeout(timer); requests.delete(key); cancelled.delete(key); if (!event.sender.isDestroyed()) { event.sender.off('destroyed', drop); event.sender.off('did-start-navigation', navigate) } }
  })
  // 47: SSH 직결(SPROUT_AI_SSH)은 agent 없음 → 13 의도 경로
  ipcMain.handle('assistant:features', () => (ai.features ? ai.features() : { agent: false, daily: null }))
  ipcMain.handle('assistant:agent', async (event, id: string, input: AgentInput & { model?: string; call?: number }) => {
    if (typeof id !== 'string' || id.length > 100 || !ai.agent) throw new Error(AGENT_UNSUPPORTED)
    if (!input || !Array.isArray(input.messages) || !Array.isArray(input.tools) || typeof input.turn !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(input.turn)) throw new Error('잘못된 요청')
    const key = `${event.sender.id}:${id}`
    if (requests.has(key)) throw new Error('중복 요청')
    const abort = new AbortController(); requests.set(key, abort)
    const drop = () => abort.abort()
    event.sender.once('destroyed', drop)
    // 호출 하나 = 대기열(180초) + 생성(60초). 턴 전체 150초는 렌더러가 센다
    const timer = setTimeout(() => abort.abort(), 260000)
    const send = (payload: { id: string; text: string; queue?: number }) => { if (!event.sender.isDestroyed()) event.sender.send('assistant:delta', payload) }
    try { return await ai.agent(input, abort.signal, (text) => send({ id, text }), (queue) => send({ id, text: '', queue })) }
    catch (e) { if (abort.signal.aborted && !cancelled.has(key)) throw new Error('AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.'); throw e }
    finally { clearTimeout(timer); requests.delete(key); cancelled.delete(key); if (!event.sender.isDestroyed()) event.sender.off('destroyed', drop) }
  })
  ipcMain.on('assistant:ground', (_e, hits: unknown) => { if (typeof hits === 'number' && Number.isInteger(hits) && hits >= 1 && hits <= 20) void ai.ground?.(hits) })
  ipcMain.on('assistant:cancel', (event, id: string) => { const key = `${event.sender.id}:${id}`; const r = requests.get(key); if (r) { cancelled.add(key); r.abort() } })
}
