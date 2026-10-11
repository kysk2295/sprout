// Experimental Jev routing policy. Classification is supplied by the caller;
// the decision model cannot execute tools or approve confirmation cards.
import { PROPOSE_TOOLS, type ToolName } from './assistantTools.ts'
import type { Routed } from './assistantRouter.ts'

export type DecisionIntent = 'chat' | 'read' | 'write' | 'clarify'
export type TargetKind = 'explicit' | 'unique' | 'ambiguous' | 'missing' | 'na'
export type RouteDecision = { intent: DecisionIntent; confidence: number; source?: 'self_reference_guard' | 'routing_fallback' | 'low_confidence' | 'conversation_context'; resolution?: 'lookup'; target?: { kind: TargetKind; confidence: number } }

const certain = (n: number) => Number.isFinite(n) && n >= 0.65 && n <= 1
/** v6 is opt-in via target. Uncertainty must not reopen the legacy write path. */
export function effectiveIntent(decision: RouteDecision): DecisionIntent | undefined {
  if (decision.resolution === 'lookup') return certain(decision.confidence) ? decision.intent : 'chat'
  if (!decision.target) return certain(decision.confidence) ? decision.intent : undefined
  if (!certain(decision.confidence)) return 'clarify'
  if (decision.intent !== 'write') return decision.intent
  return certain(decision.target.confidence) && ['explicit', 'unique'].includes(decision.target.kind) ? 'write' : 'clarify'
}

export function decisionPolicy(legacy: Routed, decision?: RouteDecision) {
  const protectedRoute = ['confirm', 'cancel', 'fixed'].includes(legacy.route.kind)
  let intent = decision && !protectedRoute ? effectiveIntent(decision) : undefined
  // 길잡이가 규칙으로 찾은 기록 조회(마지막으로 한 날·기간 — prefetch)는 Jev 'chat'보다 우선한다.
  // 실측(2026-10-11): '미용실 간지 얼마나 됐어'(띄어쓰기 없음)를 Jev가 chat 0.90으로 봐서 도구 없이 "확인할 수 없어"
  if ((intent === 'chat' || intent === 'clarify') && legacy.route.kind === 'prefetch') intent = 'read'
  let routed = legacy
  if (intent === 'chat') routed = { ...legacy, route: { kind: 'model' }, dataQuestion: false }
  if (intent === 'read') routed = { ...legacy, route: legacy.route.kind === 'prefetch' ? legacy.route : { kind: 'model' }, dataQuestion: true }
  if (intent === 'write') routed = { ...legacy, route: ['create', 'update'].includes(legacy.route.kind) ? legacy.route : { kind: 'model' }, dataQuestion: false }
  if (intent === 'clarify') routed = { ...legacy, route: { kind: 'fixed', text: '어떤 일을 어떻게 처리할지 조금만 더 알려 줄래?' }, dataQuestion: false }
  return {
    routed,
    requireUniqueTarget: (!!decision?.target || decision?.resolution === 'lookup') && intent === 'write',
    // Undefined preserves the baseline's original retry predicate exactly.
    nudge: intent === undefined ? undefined : intent === 'read',
    allows: (name: ToolName) => intent === 'chat' || intent === 'clarify' ? false : intent === 'read' ? !PROPOSE_TOOLS.includes(name) : true,
  }
}

/** Bounded wire input shared by app clients and the authenticated AI API. */
export function routeRequest(text: string, history: { user: string; assistant: string }[], name?: string) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('Invalid routing text')
  if (name !== undefined && (typeof name !== 'string' || name.length > 40)) throw new Error('Invalid character name')
  return { mode: 'route' as const, text, ...(name !== undefined ? { name } : {}), history: history.slice(-2).map(h => ({ user: h.user.slice(0, 300), assistant: h.assistant.slice(0, 300) })), stream: false }
}
export function parseRouteDecision(value: unknown): RouteDecision {
  const d = value as Partial<RouteDecision> | null
  if (!d || !['chat', 'read', 'write', 'clarify'].includes(d.intent as string) || typeof d.confidence !== 'number' || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1 || d.resolution !== 'lookup') throw new Error('Invalid routing response')
  return { intent: d.intent as DecisionIntent, confidence: d.confidence, resolution: 'lookup', ...(['self_reference_guard', 'routing_fallback', 'low_confidence', 'conversation_context'].includes(d.source ?? '') ? { source: d.source } : {}) }
}

/** Explicit questions about the assistant never require the user's records.
 * This is an application guard, not a learned-model prediction. Compound app
 * actions are excluded so an actual task request keeps the normal route. */
export function assistantSelfQuestion(text: string, name?: string): boolean {
  if (/(할\s*일|일정|메모|통계|기록|추가|등록|생성|완료|삭제|지워|찾아|조회|보여|옮겨|미뤄)/.test(text)) return false
  // 50 §5.4: 지금 이름(사용자가 지은 별명) + 종·마스코트 이름(옛 '수달' 대신). 앞 글자에 붙은 니·네(어머니·친구네)는 다른 사람이라 뺀다
  const escaped = (name ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const kinds = '달팽이|꿀벌|벌|애벌레|나비|올챙이|개구리|꿈틀이'
  const named = escaped ? `(?:${escaped})(?:는|의|가|도)?\\s*` : ''
  const who = `(?:너|네|니)(?:는|의|가|도)?\\s*(?:(?:${escaped ? `${escaped}|` : ''}${kinds})(?:는|의|가|도)?\\s*)?`
  return new RegExp(`(?:^|[\\s,.!?~])(?:${who}${named ? `|${named}` : ''})(?:취미|취향|이름|정체)`).test(text)
}

/** Recent dialogue facts are not stored task/note data. Keep this guard narrow:
 * an explicit app operation always wins, and a mentioned person needs user evidence. */
export function conversationFactQuestion(text: string, history: { user: string; assistant: string }[]): boolean {
  if (!history.length || /(할\s*일|일정|메모|통계|기록|추가|등록|저장|생성|완료|삭제|지워|찾아|조회|보여|옮겨|미뤄)/.test(text)) return false
  if (/(아까|방금|앞서).*(말한|말했던|얘기한|이야기한|대화)/.test(text)) return true
  if (!/(이름|취미|취향|좋아|싫어)/.test(text)) return false
  const people = [/(엄마|어머니)/, /(아빠|아버지)/, /(할머니)/, /(할아버지)/, /(친구)/]
  return people.some(person => person.test(text) && history.some(h => person.test(h.user)))
}

/** Confidence is retained for fallbacks; guards are labeled separately from model output. */
export function conversationalDecision(d: RouteDecision, text: string, name?: string, history: { user: string; assistant: string }[] = []): RouteDecision {
  if (assistantSelfQuestion(text, name)) return { intent: 'chat', confidence: 1, resolution: 'lookup', source: 'self_reference_guard' }
  if (conversationFactQuestion(text, history)) return { intent: 'chat', confidence: 1, resolution: 'lookup', source: 'conversation_context' }
  if (d.resolution === 'lookup' && !certain(d.confidence)) return { ...d, intent: 'chat', source: 'low_confidence' }
  return d
}
