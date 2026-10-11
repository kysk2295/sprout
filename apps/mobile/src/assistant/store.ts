// 27 AI 비서 대화 상태 — 한 곳(모듈)에 둔다: 오늘 ✦ 반 시트와 전체 화면이 같은 대화·같은 초안을 본다(27 §2.2).
// 화면이 닫혀도 요청은 계속되고 돌아오면 이어서 보인다(M-A4). 기록은 기기·계정별 파일(M-A5, 최근 100개).
import { useEffect, useSyncExternalStore } from 'react'
import { currentUserId } from '../data/auth'
import { readJson, writeJson } from '../collect/localStore'
import { humanize, isLimit, STOPPED, TOO_LONG, agentHistory, type AssistantProgress, type AssistantResult } from './core'
import { agentWrites, aiStatus, askAgent, askAssistant, reportGround, undoAssistant } from './data'
import { AgentUnsupportedError, pendingCard, saveCard, undoCard, type TurnEvent } from '@sprout/schema/assistantAgent'
import { emptyMemory, type AgentMemory, type Band } from '@sprout/schema/assistantRouter'
import { isConfirm, savedLine, type Card, type Chip, type ConfirmCard } from '@sprout/schema/assistantExec'
import { createTextStream } from '@sprout/schema/diaryTalk'

/** sent = 모델에게 실제로 보낸 말(빠른 답 칩: 말풍선은 칩 글, 보낸 말은 앞 요청과 합친 글 — 40 §3.3) · undone = 등록을 되돌림(40 §3.2) */
export type Message = { id: string; role: 'user' | 'assistant'; text: string; sent?: string; result?: AssistantResult; undone?: boolean; agent?: AgentAnswer }
/** 47 B안 답: 칩·카드·띠·안내(기기에만 — 13 §5). 오래된 기록엔 없다(예전 카드로 그린다) */
export type AgentAnswer = { chips: Chip[]; cards: Card[]; bands: Band[]; hint?: string; action?: 'diary' | 'settings'; error?: string; stopped?: boolean; busy?: boolean; calls?: number; ms?: number; hits?: number; mood?: 'happy' | 'smile' }
/** 받는 중(47): 칩·카드는 오는 대로, 글은 liveText 저장소에만(말풍선 하나만 다시 그림) */
export type Live = { chips: { chip: Chip; state: 'running' | 'done' | 'failed' }[]; cards: Card[]; text: boolean }
export const liveText = createTextStream()
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
  /** 다시 시도 때 보낼 말(빠른 답 칩이면 합친 글) */
  lastPrompt: string
  /** 상한(429)·혼잡(503) 뒤 다시 시도를 막는 끝 시각 */
  cooldownUntil: number
  /** 서버가 47 agent를 안다(/ai/status features) — 모르면 13 의도 경로 */
  agent: boolean
  /** 오늘 AI 비서 사용(턴) */
  daily: { used: number; limit: number } | null
  /** 이어 받을 것(§10) — 새 대화면 비움 */
  memory: AgentMemory
  live: Live | null
}

const historyKey = (account: string) => `sprout.assistant.history.${account}`
const MODEL_KEY = 'sprout.assistant.model'
const memoryKey = (account: string) => `sprout.assistant.memory.${account}`
const fresh = (account: string): AssistantState => ({
  account, messages: readJson<Message[]>(historyKey(account), []), draft: '', models: [], model: readJson<string>(MODEL_KEY, ''),
  connecting: false, busy: false, error: '', progress: { phase: 'connecting' }, started: 0, lastRequest: '', lastPrompt: '', cooldownUntil: 0,
  agent: false, daily: null, memory: readJson<AgentMemory>(memoryKey(account), emptyMemory()), live: null
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
  if (next.memory !== s.memory) writeJson(memoryKey(next.account), next.memory)
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
      error: s.available ? '' : '지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.',
      agent: s.agent, daily: s.assistantDaily
    }))
  } catch (e) {
    set({ models: [], model: '', error: humanize(e) })
  } finally {
    set({ connecting: false })
  }
}

/** 보내기(다시 시도 포함). 같은 말을 답 없이 다시 보내면 말풍선을 또 쌓지 않는다(13 §4). 서버가 agent를 알면 47 B안, 아니면 13 의도 경로 */
export async function send(text: string, prompt?: string) {
  const s = current()
  if (request || !text.trim() || !s.model || s.busy) return false
  const abort = new AbortController()
  request = abort
  const id = crypto.randomUUID()
  // 서버 대기열(최대 180초) + 생성(120초) — 데스크톱과 같은 330초
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; abort.abort() }, 330_000)
  const ask = prompt?.trim() || text
  const history = s.messages.slice(-8).map((m) => ({ role: m.role, content: m.sent ?? m.text }))
  set((o) => ({
    busy: true, error: '', lastRequest: text, lastPrompt: ask, started: Date.now(), progress: { phase: 'connecting' }, live: null,
    messages: o.messages.at(-1)?.role === 'user' && o.messages.at(-1)?.text === text ? o.messages : [...o.messages, { id: id + 'user', role: 'user', text, ...(ask !== text ? { sent: ask } : {}) }]
  }))
  const legacy = async () => {
    const result = await askAssistant(ask, s.model, id, abort.signal, history, (progress) => { if (request === abort) set({ progress }) })
    if (request === abort) set((o) => ({ messages: [...o.messages, { id, role: 'assistant', text: result.text, result }] }))
  }
  try {
    if (!s.agent) await legacy()
    else {
      try { await agentTurn(ask, id, abort) } catch (e) {
        if (!(e instanceof AgentUnsupportedError)) throw e
        set({ agent: false, live: null })
        await legacy()
      }
    }
    return true
  } catch (e) {
    if (request === abort) set({ live: null, error: timedOut ? TOO_LONG : abort.signal.aborted ? STOPPED : humanize(e), ...(isLimit(e) ? { cooldownUntil: Date.now() + 30_000 } : {}) })
    return false
  } finally {
    clearTimeout(timer)
    if (request === abort) { request = null; set({ busy: false, live: null }) }
  }
}

/** 47 한 턴: 칩·카드는 받는 대로, 글은 liveText에. 끝나면 근거 검사한 글로 바꿔 기록 */
async function agentTurn(ask: string, id: string, abort: AbortController) {
  const s = current()
  liveText.reset()
  let text = ''
  const live: Live = { chips: [], cards: [], text: false }
  set({ live: { ...live } })
  const onEvent = (e: TurnEvent) => {
    if (request !== abort) return
    if (e.type === 'delta') { text += e.text; liveText.set(text); if (!live.text) { live.text = true; set({ live: { ...live } }) } return }
    if (e.type === 'reset') { text = ''; liveText.reset(); live.text = false; set({ live: { ...live } }); return }
    if (e.type === 'queue') { set((o) => ({ progress: { ...o.progress, queue: e.position } })); return }
    if (e.type === 'phase') { set({ progress: { phase: e.phase === 'answer' ? 'generating' : e.phase === 'tools' ? 'querying' : 'connecting' } }); return }
    if (e.type === 'chip') { live.chips = [...live.chips]; live.chips[e.index] = { chip: e.chip, state: e.state }; set({ live: { ...live } }); return }
    if (e.type === 'card') { live.cards = [...live.cards, e.card]; set({ live: { ...live } }) }
  }
  const r = await askAgent({
    text: ask, model: s.model, turn: id.replace(/[^A-Za-z0-9_-]/g, ''), signal: abort.signal, history: agentHistory(s.messages.filter((m) => !m.agent?.error)),
    memory: s.memory, pending: pendingCard(s.messages.map((m) => m.agent?.cards ?? [])), name: buddyName, onEvent
  })
  if (request !== abort) return
  // 말로 확인(결정 ②): 떠 있는 카드의 넣기/취소를 누른 것과 같다
  if (r.confirm) {
    const owner = current().messages.find((m) => m.agent?.cards.some((c) => isConfirm(c) && c.key === r.confirm!.key))
    if (owner) {
      if (r.confirm.action === 'save') {
        const line = await saveAgentCard(owner.id, r.confirm.key)
        set((o) => ({ messages: [...o.messages, { id, role: 'assistant', text: line ?? '저장하지 못했어.', agent: { chips: [], cards: [], bands: [], mood: line ? 'happy' : 'smile' } }], memory: r.memory }))
      } else {
        cancelAgentCard(owner.id, r.confirm.key)
        set((o) => ({ messages: [...o.messages, { id, role: 'assistant', text: r.text, agent: { chips: [], cards: [], bands: [] } }], memory: r.memory }))
      }
      return
    }
  }
  if (text) await liveText.whenShown(1200)
  if (request !== abort) return
  if (r.grounding.hits > 0) reportGround(r.grounding.hits) // 47 §19.4 숫자만
  const agent: AgentAnswer = { chips: r.chips, cards: r.cards, bands: r.bands, calls: r.calls, ms: r.ms, hits: r.grounding.hits, ...(r.hint ? { hint: r.hint } : {}), ...(r.action ? { action: r.action } : {}), ...(r.error ? { error: r.error } : {}), ...(r.stopped ? { stopped: true } : {}), ...(r.busyFallback ? { busy: true } : {}) }
  set((o) => ({ live: null, memory: r.memory, ...(r.error ? { error: r.error } : {}), messages: [...o.messages, { id, role: 'assistant', text: r.text, agent }] }))
  void aiStatus().then((st) => set({ daily: st.assistantDaily })).catch(() => {})
}
let buddyName = ''
/** 캐릭터 이름(지시문 칸) — 화면이 알려 준다 */
export const setBuddyName = (n: string) => { buddyName = n }

const patchCard = (msgId: string, key: string, f: (c: ConfirmCard) => ConfirmCard) =>
  set((o) => ({ messages: o.messages.map((m) => (m.id === msgId && m.agent ? { ...m, agent: { ...m.agent, cards: m.agent.cards.map((c) => (isConfirm(c) && c.key === key ? f(c) : c)) } } : m)) }))
const findCard = (msgId: string, key: string) => current().messages.find((m) => m.id === msgId)?.agent?.cards.find((c): c is ConfirmCard => isConfirm(c) && c.key === key)
/** 확인 카드 넣기(완료·옮기기·지우기). 캐릭터 한 줄(§5.3)을 돌려준다. 실패하면 null */
// 저장이 끝날 때까지 카드는 'pending'이라 두 번 누르면 두 줄이 생긴다 → 카드마다 잠근다(두 번째는 무시)
const savingCards = new Set<string>()
export async function saveAgentCard(msgId: string, key: string): Promise<string | null> {
  const card = findCard(msgId, key)
  const lock = `${msgId}\n${key}`
  if (!card || card.state !== 'pending' || savingCards.has(lock)) return null
  savingCards.add(lock)
  try {
    const saved = await saveCard(card, agentWrites)
    patchCard(msgId, key, () => saved)
    return savedLine(saved, new Date())
  } catch (e) { set({ error: humanize(e) }); return null } finally { savingCards.delete(lock) }
}
/** 단추로 넣은 뒤: 그 답의 한 줄을 캐릭터 말로 바꾸고 깡충(§5.3) */
export function setAgentLine(msgId: string, text: string, mood: 'happy' | 'smile' = 'happy') {
  set((o) => ({ messages: o.messages.map((m) => (m.id === msgId && m.agent ? { ...m, text, agent: { ...m.agent, mood } } : m)) }))
}
export function cancelAgentCard(msgId: string, key: string) { patchCard(msgId, key, (c) => (c.state === 'pending' ? { ...c, state: 'cancelled' } : c)) }
export async function undoAgentCard(msgId: string, key: string) {
  const card = findCard(msgId, key)
  if (!card) return
  const undone = await undoCard(card, agentWrites)
  patchCard(msgId, key, () => undone)
}
/** 여러 후보 중 고르기(체크 켜고 끄기) */
export function toggleTarget(msgId: string, key: string, targetId: string) {
  patchCard(msgId, key, (c) => (c.state === 'pending' && c.targets ? { ...c, targets: c.targets.map((t) => (t.id === targetId ? { ...t, picked: !t.picked } : t)) } : c))
}
export const cancel = () => request?.abort()
/** 새 대화(⌘N 자리): 처리 중이면 막는다 */
export function clear() {
  if (request) return
  set({ messages: [], error: '', lastRequest: '', lastPrompt: '', memory: emptyMemory(), live: null })
}
export const setDraft = (draft: string) => set({ draft })
export async function undo(messageId: string) {
  const m = current().messages.find((x) => x.id === messageId)
  if (!m?.result?.created) return
  await undoAssistant(m.result.created)
  set((o) => ({ messages: o.messages.map((x) => (x.id === messageId ? { ...x, text: '등록을 되돌렸어요.', undone: true } : x)) }))
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
