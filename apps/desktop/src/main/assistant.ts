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
    throw new Error(typeof json?.error === 'string' ? json.error : res.status >= 500 ? UNAVAILABLE : `AI 요청 실패 (${res.status})`)
  }
  return res
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
    chat: async (input: ChatInput, signal: AbortSignal, onDelta?: (text: string) => void) => {
      const purpose = input.purpose && PURPOSES.includes(input.purpose) ? input.purpose : 'assistant'
      const body = JSON.stringify({ model: input.model, messages: input.messages, format: input.format, stream: true })
      const res = await server(`/ai/${purpose}`, { method: 'POST', body, signal })
      return readChatStream(res, onDelta ?? (() => {}), signal)
    }
  }
}

export function registerAssistant() {
  const remote = process.env.SPROUT_AI_SSH === '1' ? createRemoteOllama() : undefined
  const ai = remote ?? createServerAi()
  app.on('before-quit', () => remote?.close())
  const requests = new Map<string, AbortController>()
  ipcMain.handle('assistant:models', () => ai.models())
  ipcMain.handle('assistant:chat', async (event, id: string, input: ChatInput) => {
    if (typeof id !== 'string' || id.length > 100) throw new Error('잘못된 요청')
    const key = `${event.sender.id}:${id}`
    if (requests.has(key)) throw new Error('중복 요청')
    const abort = new AbortController(); requests.set(key, abort)
    // 서버 대기열을 기다리는 시간까지 넉넉히(서버 대기 180초 + 생성 120초)
    const timer = setTimeout(() => abort.abort(), remote ? 120000 : 320000)
    try { return await ai.chat(input, abort.signal, (text) => { if (!event.sender.isDestroyed()) event.sender.send('assistant:delta', { id, text }) }) }
    finally { clearTimeout(timer); requests.delete(key) }
  })
  ipcMain.on('assistant:cancel', (event, id: string) => requests.get(`${event.sender.id}:${id}`)?.abort())
}
