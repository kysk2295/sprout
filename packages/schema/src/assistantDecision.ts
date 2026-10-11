// Experimental Jev routing policy. Classification is supplied by the caller;
// the decision model cannot execute tools or approve confirmation cards.
import { PROPOSE_TOOLS, type ToolName } from './assistantTools.ts'
import type { Routed } from './assistantRouter.ts'

export type DecisionIntent = 'chat' | 'read' | 'write' | 'clarify'
export type TargetKind = 'explicit' | 'unique' | 'ambiguous' | 'missing' | 'na'
export type RouteDecision = { intent: DecisionIntent; confidence: number; source?: 'self_reference_guard'; resolution?: 'lookup'; target?: { kind: TargetKind; confidence: number } }

const certain = (n: number) => Number.isFinite(n) && n >= 0.65 && n <= 1
/** v6 is opt-in via target. Uncertainty must not reopen the legacy write path. */
export function effectiveIntent(decision: RouteDecision): DecisionIntent | undefined {
  if (decision.resolution === 'lookup') return certain(decision.confidence) ? decision.intent : 'clarify'
  if (!decision.target) return certain(decision.confidence) ? decision.intent : undefined
  if (!certain(decision.confidence)) return 'clarify'
  if (decision.intent !== 'write') return decision.intent
  return certain(decision.target.confidence) && ['explicit', 'unique'].includes(decision.target.kind) ? 'write' : 'clarify'
}

export function decisionPolicy(legacy: Routed, decision?: RouteDecision) {
  const protectedRoute = ['confirm', 'cancel', 'fixed'].includes(legacy.route.kind)
  const intent = decision && !protectedRoute ? effectiveIntent(decision) : undefined
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
export function routeRequest(text: string, history: { user: string; assistant: string }[]) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('Invalid routing text')
  return { mode: 'route' as const, text, history: history.slice(-2).map(h => ({ user: h.user.slice(0, 300), assistant: h.assistant.slice(0, 300) })), stream: false }
}
export function parseRouteDecision(value: unknown): RouteDecision {
  const d = value as Partial<RouteDecision> | null
  if (!d || !['chat', 'read', 'write', 'clarify'].includes(d.intent as string) || typeof d.confidence !== 'number' || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1 || d.resolution !== 'lookup') throw new Error('Invalid routing response')
  return { intent: d.intent as DecisionIntent, confidence: d.confidence, resolution: 'lookup', ...(d.source === 'self_reference_guard' ? { source: d.source } : {}) }
}

/** Explicit questions about the assistant never require the user's records.
 * This is an application guard, not a learned-model prediction. Compound app
 * actions are excluded so an actual task request keeps the normal route. */
export function assistantSelfQuestion(text: string): boolean {
  if (/(할\s*일|일정|메모|통계|기록|추가|등록|생성|완료|삭제|지워|찾아|조회|보여|옮겨|미뤄)/.test(text)) return false
  return /(?:너|네|니)(?:는|의|가|도)?\s*(?:수달(?:의)?\s*)?(?:취미|취향|이름|정체)/.test(text)
}
