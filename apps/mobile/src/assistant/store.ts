// 27 AI 비서 대화 상태 — 한 곳(모듈)에 둔다: 오늘 ✦ 반 시트와 전체 화면이 같은 대화·같은 초안을 본다(27 §2.2).
// 화면이 닫혀도 요청은 계속되고 돌아오면 이어서 보인다(M-A4). 기록은 기기·계정별 파일(M-A5, 최근 100개).
import { useEffect, useSyncExternalStore } from 'react'
import { currentUserId } from '../data/auth'
import { readJson, writeJson } from '../collect/localStore'
import { humanize, isLimit, STOPPED, TOO_LONG, type AssistantProgress, type AssistantResult } from './core'
import { aiStatus, askAssistant, undoAssistant } from './data'

export type Message = { id: string; role: 'user' | 'assistant'; text: string; result?: AssistantResult }
export type AssistantState = {
  account: string
  messages: Message[]
  draft: string
  models: string[]
  model: string
  connecting: boolean
  busy: boolean
  error: string
  progress: AssistantProgress
  started: number
  lastRequest: string
  /** 상한(429)·혼잡(503) 뒤 다시 시도를 막는 끝 시각 */
  cooldownUntil: number
}

const historyKey = (account: string) => `sprout.assistant.history.${account}`
const MODEL_KEY = 'sprout.assistant.model'
const fresh = (account: string): AssistantState => ({
  account, messages: readJson<Message[]>(historyKey(account), []), draft: '', models: [], model: readJson<string>(MODEL_KEY, ''),
  connecting: false, busy: false, error: '', progress: { phase: 'connecting' }, started: 0, lastRequest: '', cooldownUntil: 0
})

let state: AssistantState | null = null
let request: AbortController | null = null
const listeners = new Set<() => void>()
function current(): AssistantState {
  const account = currentUserId()
  if (!state || state.account !== account) { request?.abort(); request = null; state = fresh(account) }
  return state
}
function set(patch: Partial<AssistantState> | ((s: AssistantState) => Partial<AssistantState>)) {
  const s = current()
  const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) }
  if (next.messages !== s.messages) writeJson(historyKey(next.account), next.messages.slice(-100))
  if (next.model !== s.model) writeJson(MODEL_KEY, next.model)
  state = next
  listeners.forEach((l) => l())
}

export async function refresh() {
  if (current().connecting) return
  set({ connecting: true, error: '' })
  try {
    const s = await aiStatus()
    set((old) => ({
      models: s.available ? s.models : [],
      model: s.available ? (s.models.includes(old.model) ? old.model : s.models[0] ?? '') : '',
      error: s.available ? '' : '지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.'
    }))
  } catch (e) {
    set({ models: [], model: '', error: humanize(e) })
  } finally {
    set({ connecting: false })
  }
}

/** 보내기(다시 시도 포함). 같은 말을 답 없이 다시 보내면 말풍선을 또 쌓지 않는다(13 §4) */
export async function send(text: string) {
  const s = current()
  if (request || !text.trim() || !s.model || s.busy) return false
  const abort = new AbortController()
  request = abort
  const id = crypto.randomUUID()
  // 서버 대기열(최대 180초) + 생성(120초) — 데스크톱과 같은 330초
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; abort.abort() }, 330_000)
  const history = s.messages.slice(-8).map((m) => ({ role: m.role, content: m.text }))
  set((o) => ({
    busy: true, error: '', lastRequest: text, started: Date.now(), progress: { phase: 'connecting' },
    messages: o.messages.at(-1)?.role === 'user' && o.messages.at(-1)?.text === text ? o.messages : [...o.messages, { id: id + 'user', role: 'user', text }]
  }))
  try {
    const result = await askAssistant(text, s.model, id, abort.signal, history, (progress) => { if (request === abort) set({ progress }) })
    if (request === abort) set((o) => ({ messages: [...o.messages, { id, role: 'assistant', text: result.text, result }] }))
    return true
  } catch (e) {
    if (request === abort) set({ error: timedOut ? TOO_LONG : abort.signal.aborted ? STOPPED : humanize(e), ...(isLimit(e) ? { cooldownUntil: Date.now() + 30_000 } : {}) })
    return false
  } finally {
    clearTimeout(timer)
    if (request === abort) { request = null; set({ busy: false }) }
  }
}
export const cancel = () => request?.abort()
/** 새 대화(⌘N 자리): 처리 중이면 막는다 */
export function clear() {
  if (request) return
  set({ messages: [], error: '', lastRequest: '' })
}
export const setDraft = (draft: string) => set({ draft })
export async function undo(messageId: string) {
  const m = current().messages.find((x) => x.id === messageId)
  if (!m?.result?.created) return
  await undoAssistant(m.result.created)
  set((o) => ({ messages: o.messages.map((x) => (x.id === messageId ? { ...x, text: '등록을 되돌렸어요.', result: undefined } : x)) }))
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
/** 화면이 쓰는 상태. 처음 붙을 때 연결 확인, 쓸 수 없으면 1분 뒤 저절로 다시 확인(13 §6) */
export function useAssistant(): AssistantState {
  const s = useSyncExternalStore(subscribe, current)
  useEffect(() => { if (!current().models.length && !current().connecting) void refresh() }, [s.account])
  useEffect(() => {
    if (s.connecting || s.busy || s.models.length) return
    const t = setTimeout(() => void refresh(), 60_000)
    return () => clearTimeout(t)
  }, [s.connecting, s.busy, s.models.length])
  useEffect(() => {
    if (s.cooldownUntil <= Date.now()) return
    const t = setTimeout(() => set({ cooldownUntil: 0 }), s.cooldownUntil - Date.now())
    return () => clearTimeout(t)
  }, [s.cooldownUntil])
  return s
}
