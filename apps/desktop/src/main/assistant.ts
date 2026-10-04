import { app, ipcMain } from 'electron'
import { readChatStream, type AiPurpose, type ChatInput } from '../shared/assistant'
import { createRemoteOllama } from './remoteOllama'
import { serverAccess } from './sync'

// AI 경로(PRD AI 사용 원칙): 기본 = sprout API의 AI 프록시(/ai/<용도>, 로그인 토큰, 서버 대기열·상한).
// SPROUT_AI_SSH=1이면 오너 개발용으로 예전처럼 SSH → Mac mini Ollama에 바로 붙는다.
const PURPOSES: AiPurpose[] = ['assistant', 'classify', 'map', 'diary', 'kpi-draft', 'weekly-report']
const UNAVAILABLE = '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.'

async function server(path: string, init: RequestInit & { signal?: AbortSignal } = {}) {
  const { url, token } = await serverAccess()
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
    let message = typeof json?.error === 'string' ? json.error : res.status >= 500 ? UNAVAILABLE : 'AI 요청을 처리하지 못했어요. 다시 시도해 주세요.'
    // 13 §6 상한(429): "잠시 뒤 다시 시도해 주세요. (오늘 남은 요청 N회)" + 다시 시도는 Retry-After 뒤에
    if (res.status === 429 && json?.code !== 'weekly') {
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
    models: async () => {
      const status = await (await server('/ai/status', { signal: AbortSignal.timeout(15000) })).json()
      if (!status.available) throw new Error(UNAVAILABLE)
      const models: string[] = Array.isArray(status.models) ? status.models : []
      // 서버 기본 모델을 맨 앞에 — 앱이 고른 모델이 없을 때 그걸 쓴다
      return status.default_model ? [status.default_model, ...models.filter((m) => m !== status.default_model)] : models
    },
    chat: async (input: ChatInput, signal: AbortSignal, onDelta?: (text: string) => void, onQueue?: (position: number) => void) => {
      const purpose = input.purpose && PURPOSES.includes(input.purpose) ? input.purpose : 'assistant'
      const body = JSON.stringify({ model: input.model, messages: input.messages, format: input.format, stream: true })
      const res = await server(`/ai/${purpose}`, { method: 'POST', body, signal })
      return readChatStream(res, onDelta ?? (() => {}), signal, (q) => onQueue?.(q.position))
    }
  }
}

export function registerAssistant() {
  const remote = process.env.SPROUT_AI_SSH === '1' ? createRemoteOllama() : undefined
  const ai: ReturnType<typeof createServerAi> = remote ?? createServerAi()
  app.on('before-quit', () => remote?.close())
  const requests = new Map<string, AbortController>()
  const cancelled = new Set<string>() // 사용자가 멈춘 요청(시간 초과와 구분)
  ipcMain.handle('assistant:models', () => ai.models())
  ipcMain.handle('assistant:chat', async (event, id: string, input: ChatInput) => {
    if (typeof id !== 'string' || id.length > 100) throw new Error('잘못된 요청')
    const key = `${event.sender.id}:${id}`
    if (requests.has(key)) throw new Error('중복 요청')
    const abort = new AbortController(); requests.set(key, abort)
    // 서버 대기열을 기다리는 시간까지 넉넉히(서버 대기 180초 + 생성 120초)
    const timer = setTimeout(() => abort.abort(), remote ? 120000 : 320000)
    const send = (payload: { id: string; text: string; queue?: number }) => { if (!event.sender.isDestroyed()) event.sender.send('assistant:delta', payload) }
    // 대기열 위치는 같은 통로로 text 없이 보낸다(queue = 앞에 있는 요청 수, 0이면 내 차례) — 13 §6
    try { return await ai.chat(input, abort.signal, (text) => send({ id, text }), (queue) => send({ id, text: '', queue })) }
    catch (e) { if (abort.signal.aborted && !cancelled.has(key)) throw new Error('AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.'); throw e }
    finally { clearTimeout(timer); requests.delete(key); cancelled.delete(key) }
  })
  ipcMain.on('assistant:cancel', (event, id: string) => { const key = `${event.sender.id}:${id}`; const r = requests.get(key); if (r) { cancelled.add(key); r.abort() } })
}
