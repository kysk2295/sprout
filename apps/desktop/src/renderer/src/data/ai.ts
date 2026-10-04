// 수집함 분류·작업 지도 분류·일기 대화가 같이 쓰는 AI 호출. 경로는 AI 비서와 같다(PRD AI 원칙):
// 데스크톱 = 메인 프로세스 → sprout API AI 프록시(/ai/<용도>) → Mac mini Ollama (SPROUT_AI_SSH=1이면 SSH 직결), 웹 미리보기 = /api/assistant 프록시
import { localChat, localModels, type ChatInput } from '../../../shared/assistant'

const MODEL_KEY = 'sprout.assistant.model'
let cached: string | undefined

/** AI 비서에서 고른 모델 → 없으면 qwen3.5:9b → 첫 모델 */
export async function pickModel(signal?: AbortSignal): Promise<string> {
  let saved = ''
  try { saved = localStorage.getItem(MODEL_KEY) ?? '' } catch { /* 저장소를 못 써도 목록에서 고른다 */ }
  if (saved) return saved
  if (cached) return cached
  const models = window.sprout?.assistant ? await window.sprout.assistant.models() : await localModels(signal)
  const model = models.find((m) => /qwen3\.5:9b/.test(m)) ?? models[0]
  if (!model) throw new Error('설치된 로컬 모델이 없어요.')
  return (cached = model)
}

let seq = 0
/** 한 번 묻고 전체 답을 받는다. signal로 멈춘다 */
export async function aiChat(input: Omit<ChatInput, 'model'> & { model?: string }, signal: AbortSignal, onDelta?: (text: string) => void): Promise<string> {
  const full: ChatInput = { ...input, model: input.model ?? (await pickModel(signal)) }
  signal.throwIfAborted()
  const api = window.sprout?.assistant
  if (!api) return localChat(full, signal, undefined, onDelta)
  const id = `bg-${Date.now().toString(36)}-${seq++}`
  const cancel = () => api.cancel(id)
  signal.addEventListener('abort', cancel, { once: true })
  const off = onDelta ? api.onDelta((e) => { if (e.id === id) onDelta(e.text) }) : undefined
  try { return await api.chat(id, full) } finally { off?.(); signal.removeEventListener('abort', cancel) }
}

/** 연결이 안 되는 오류(맥미니 꺼짐·SSH 실패)는 "AI 없음" — 항목 실패가 아니다 */
// 서버 프록시의 503(쓸 수 없음)·429(상한)·로그인 필요도 같은 취급 — 나중에 다시
export const isUnavailable = (e: unknown) => /연결|connect|fetch|ECONN|timed? ?out|모델|Ollama|abort|쓸 수 없|상한|너무 많|잠시|로그인/i.test(e instanceof Error ? e.message : String(e))
