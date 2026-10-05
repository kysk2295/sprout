// 33 §7 자동 태그 v1.0 — 사용자 손이 들지 않게(2026-10-05 사용자 결정). 계산 규칙은 @sprout/schema/autoTag(순수), 여기는 읽기·쓰기·대기열.
//  · 새 할 일·제목 바뀐 할 일: tagTasks(ids) — ① 사전 검사(AI 없음) → ② 남은 것만 /ai/tag → 85점 이상만 자동, 새 이름은 후보 → 문턱 넘으면 태그 자동 생성
//  · 기존 할 일: 처음 한 번 뒤에서 runBackfill() — 열린 것 + 최근 90일 완료, 25개씩, 하루 상한이면 다음 날, 24시간 undoBackfill()
//  · 조용한 요약: weeklySummary() · undoWeek() · undoBackfill() — 화면은 data/wiki.ts autoTag()(setAutoTagApi로 여기 것을 끼움) / 상세 ✕ = wiki.ts removeTaskTag
// 무엇을 했는지는 task_tags.source('rule'|'ai')·confidence·run_id와 tags.source='ai'·run_id에 남는다. 후보·진행은 기기에만(sprout.autoTag.v1).
import {
  AUTO_TAG, aiTagId, addCandidates, candidateKind, autoTagRowId, buildTagPayload, dictionaryPass, findSynonym, planAiMerges, planAssign,
  parseTagItemsLoose, readyCandidates, TAG_SCHEMA, TAG_SYSTEM, tagKey, titlePrint, validateTagAnswer, withAlias,
  type Assign, type AtFolder, type AtLink, type AtList, type AtTag, type AtTask, type Candidates, type Ctx
} from '@sprout/schema/autoTag'
import { getDb, type Stmt } from './db'
import { insert, now, remove, run, update } from './mutations'
import { aiChat, isUnavailable } from './ai'
import { serial } from './listSuggest'
import { setAutoTagApi, type AutoTagApi } from './wiki'

// ── 설정(설정 › 할 일, 기본 켬) ──
const ENABLED_KEY = 'sprout.autoTag.enabled'
const PERSON_KEY = 'sprout.autoTag.person'
const flag = (k: string) => { try { return localStorage.getItem(k) !== '0' } catch { return true } }
const setFlag = (k: string, on: boolean) => { try { localStorage.setItem(k, on ? '1' : '0') } catch { /* 기억만 못 한다 */ } subs.forEach((f) => f()) }
export const autoTagEnabled = () => flag(ENABLED_KEY)
export const setAutoTagEnabled = (on: boolean) => setFlag(ENABLED_KEY, on)
export const autoTagPerson = () => flag(PERSON_KEY)
export const setAutoTagPerson = (on: boolean) => setFlag(PERSON_KEY, on)

// ── 기기 저장 ──
export type BackfillState = {
  state: 'idle' | 'running' | 'paused' | 'done' | 'undone'
  runId?: string
  queue?: string[] // AI에 아직 안 물은 할 일 id
  total?: number
  startedAt?: string
  finishedAt?: string
  /** 하루 상한·AI 없음으로 멈췄을 때 이 시각 뒤에 이어 감 */
  resumeAfter?: string
  /** 이 일괄에서 만든 새 태그 수(25개까지) */
  created?: number
  /** 이 일괄에서 모은 후보(끝날 때 한 번 만든다) */
  candidates?: Candidates
}
export type AutoTagState = {
  /** 살펴본 할 일 → 제목 지문(제목이 바뀌면 다시) */
  seen: Record<string, string>
  /** AI에 물어본 할 일 → 제목 지문 */
  asked: Record<string, string>
  candidates: Candidates
  /** 되돌린 새 태그 이름 열쇠 — 다시 만들지 않는다 */
  blocked: Record<string, true>
  /** 새 할 일 경로에서 새 태그를 만든 시각들(7일 10개) */
  created: string[]
  /** 사전 검사를 끝낸 태그 이름·별칭 열쇠(새 열쇠가 생기면 그 태그로 다시 훑는다) */
  dictKeys: string[] | null
  backfill: BackfillState
  /** 이 시각 뒤에 만들거나 고친 할 일만 "새 할 일"로 본다(그 전 것은 일괄) */
  since?: string
  introShown?: boolean
}
const KEY = 'sprout.autoTag.v1'
const empty = (): AutoTagState => ({ seen: {}, asked: {}, candidates: {}, blocked: {}, created: [], dictKeys: null, backfill: { state: 'idle' } })
let state: AutoTagState | undefined
const subs = new Set<() => void>()
export const autoTagStore = {
  get(): AutoTagState {
    if (state) return state
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); state = s && typeof s === 'object' ? { ...empty(), ...s } : empty() } catch { state = empty() }
    return state!
  },
  set(patch: Partial<AutoTagState> | ((s: AutoTagState) => Partial<AutoTagState>)) {
    const cur = autoTagStore.get()
    state = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 기억만 못 한다 */ }
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
  /** 시험용 */
  reset() { state = undefined; try { localStorage.removeItem(KEY) } catch { /* */ } }
}
/** 새 할 일 기준 시각(처음 부를 때 정한다) */
export function autoTagSince(): string {
  const s = autoTagStore.get()
  if (s.since) return s.since
  const t = now()
  autoTagStore.set({ since: t })
  return t
}

// ── 읽기 ──
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',') || 'NULL'
export async function readTagContext(at = new Date()): Promise<Ctx> {
  const db = await getDb()
  const cutoff = new Date(at.getTime() - AUTO_TAG.doneDays * 86_400_000).toISOString()
  const [tags, lists, folders, tasks, links] = await Promise.all([
    // 최근 쓴 순(AI에 보낼 때 앞 80개)
    db.getAll<AtTag>(`SELECT g.id, g.name, g.kind, g.aliases, g.source, g.home_type, g.home_id, g.created_at, g.run_id,
      (SELECT max(tt.created_at) FROM task_tags tt WHERE tt.tag_id = g.id) AS used FROM tags g WHERE g.name IS NOT NULL AND g.name != ''
      ORDER BY used IS NULL, used DESC, g.sort_order`),
    db.getAll<AtList>('SELECT id, name, folder_id, kind FROM lists'),
    db.getAll<AtFolder>('SELECT id, name FROM folders'),
    db.getAll<AtTask>(`SELECT id, title, list_id, status FROM tasks WHERE deleted_at IS NULL AND title IS NOT NULL AND title != ''
      AND (status = 0 OR completed_at >= ?) ORDER BY created_at`, [cutoff]),
    db.getAll<AtLink>('SELECT id, task_id, tag_id, source, state, created_at, run_id FROM task_tags')
  ])
  return { tags, lists, folders, tasks, links, person: autoTagPerson() }
}

// ── 쓰기 ──
/** 붙일 것 → 행. ctx.links에도 더해 이어지는 계산이 보게 한다 */
export function assignStmts(plan: Assign[], ctx: Ctx, runId: string | null, at = now()): Stmt[] {
  return plan.map((a) => {
    const id = autoTagRowId(a.taskId, a.tagId)
    ctx.links.push({ id, task_id: a.taskId, tag_id: a.tagId, source: a.source, state: 'accepted', created_at: at, run_id: runId })
    return insert('task_tags', { id, task_id: a.taskId, tag_id: a.tagId, source: a.source, state: 'accepted', confidence: a.confidence, run_id: runId, created_at: at, modified_at: at })
  })
}
/** 새 태그 만들기 + 그 후보 할 일과 사전으로 찾은 할 일에 붙이기. 같은 이름 태그가 이미 있으면(다른 기기) 그 태그를 쓴다 */
export function createTagStmts(ready: { name: string; kind: string; taskIds: string[]; tasks: Record<string, number> }[], ctx: Ctx, runId: string | null, at = now()): { stmts: Stmt[]; created: AtTag[] } {
  const stmts: Stmt[] = []
  const created: AtTag[] = []
  let order = Date.now()
  for (const r of ready) {
    const syn = findSynonym(r.name, ctx.tags)
    let tag = syn?.tag
    if (!tag) {
      tag = { id: aiTagId(r.name), name: r.name, kind: r.kind, aliases: null, source: 'ai', home_type: null, home_id: null, created_at: at, run_id: runId }
      ctx.tags.push(tag)
      created.push(tag)
      stmts.push(insert('tags', { id: tag.id, name: r.name, color: null, parent_id: null, sort_order: order++, pinned: 0, kind: r.kind, source: 'ai', run_id: runId, created_at: at, modified_at: at }))
    }
    const tagId = tag.id
    const fromCandidates: Assign[] = r.taskIds.map((taskId) => ({ taskId, tagId, source: 'ai', confidence: r.tasks[taskId] ?? AUTO_TAG.newScore }))
    const fromDict = dictionaryPass(ctx.tasks.map((t) => t.id), ctx, { onlyTags: new Set([tagId]) })
    stmts.push(...assignStmts(planAssign([...fromCandidates, ...fromDict], ctx), ctx, runId, at))
  }
  return { stmts, created }
}
/** AI가 만든 태그끼리 같은 뜻이면 합치기(할 일 많은 쪽으로, 진 쪽 이름은 별칭). relations의 태그 id도 옮긴다 */
export async function aiMergeStmts(ctx: Ctx): Promise<Stmt[]> {
  const counts = new Map<string, number>()
  for (const l of ctx.links) if ((l.state ?? 'accepted') === 'accepted') counts.set(l.tag_id, (counts.get(l.tag_id) ?? 0) + 1)
  const merges = planAiMerges(ctx.tags, counts)
  if (!merges.length) return []
  const db = await getDb()
  const stmts: Stmt[] = []
  for (const { from, into } of merges) {
    const intoHas = new Set(ctx.links.filter((l) => l.tag_id === into.id).map((l) => l.task_id))
    const dropped = new Set<string>()
    for (const l of ctx.links.filter((x) => x.tag_id === from.id)) {
      if (intoHas.has(l.task_id)) { stmts.push(remove('task_tags', l.id)); dropped.add(l.id) }
      else { stmts.push(update('task_tags', l.id, { tag_id: into.id })); l.tag_id = into.id; intoHas.add(l.task_id) }
    }
    ctx.links = ctx.links.filter((l) => !dropped.has(l.id))
    const aliases = withAlias(into.aliases, from.name, into.name)
    if (aliases) { stmts.push(update('tags', into.id, { aliases })); into.aliases = aliases }
    for (const r of await db.getAll<{ id: string; from_id: string; to_id: string }>('SELECT id, from_id, to_id FROM relations WHERE from_id = ? OR to_id = ?', [from.id, from.id]))
      stmts.push(update('relations', r.id, r.to_id === from.id ? { to_id: into.id } : { from_id: into.id }))
    stmts.push(remove('tags', from.id))
    ctx.tags = ctx.tags.filter((t) => t.id !== from.id)
  }
  return stmts
}

// ── AI ──
type Chat = typeof aiChat
/** AI에 한 묶음 묻기 → 검증된 결과 */
export async function askTagAi(tasks: AtTask[], ctx: Ctx, opts: { signal: AbortSignal; chat?: Chat }) {
  const listName = new Map(ctx.lists.map((l) => [l.id, l.kind === 'inbox' ? null : l.name]))
  const { payload, tagKeys, taskKeys } = buildTagPayload(ctx.tags, tasks.map((t) => ({ id: t.id, title: t.title, listName: t.list_id ? listName.get(t.list_id) ?? null : null })))
  const raw = await (opts.chat ?? aiChat)({ purpose: 'tag', priority: 'background', format: TAG_SCHEMA as unknown as Record<string, unknown>, messages: [{ role: 'system', content: TAG_SYSTEM }, { role: 'user', content: JSON.stringify(payload) }] }, opts.signal)
  opts.signal.throwIfAborted()
  return validateTagAnswer(parseTagItemsLoose(raw), taskKeys, tagKeys, ctx)
}

const accepted = (l: AtLink) => (l.state ?? 'accepted') === 'accepted'
/** AI에 물을 할 일: 자동 태그든 무엇이든 붙은 태그가 없고, 이 제목으로 아직 안 물은 것 */
function needsAi(t: AtTask, ctx: Ctx, asked: Record<string, string>) {
  return asked[t.id] !== titlePrint(t.title) && !ctx.links.some((l) => l.task_id === t.id && accepted(l))
}
const weekAgo = (at: string) => new Date(Date.parse(at) - 7 * 86_400_000).toISOString()

export type PassResult = { applied: number; created: number; aiError?: unknown }
/**
 * 새 할 일·제목 바뀐 할 일 태그 붙이기(최대 20개씩). 대기열은 30 §B와 같은 줄(serial).
 * AI가 안 되면 사전 결과만 쓰고 aiError를 돌려준다(그 할 일들은 나중에 다시).
 */
export function tagTasks(taskIds: string[], opts: { signal?: AbortSignal; chat?: Chat; at?: string } = {}): Promise<PassResult> {
  return serial(async () => {
    if (!autoTagEnabled() || !taskIds.length) return { applied: 0, created: 0 }
    const at = opts.at ?? now()
    const ctx = await readTagContext(new Date(at))
    const ids = new Set(taskIds)
    const targets = ctx.tasks.filter((t) => ids.has(t.id))
    const stmts: Stmt[] = assignStmts(planAssign(dictionaryPass(targets.map((t) => t.id), ctx), ctx), ctx, null, at)
    let applied = stmts.length, created = 0, aiError: unknown
    const s = autoTagStore.get()
    const ask = targets.filter((t) => needsAi(t, ctx, s.asked)).slice(0, AUTO_TAG.batchLive)
    let candidates = s.candidates
    const asked = { ...s.asked }
    if (ask.length) {
      try {
        const res = await askTagAi(ask, ctx, { signal: opts.signal ?? new AbortController().signal, chat: opts.chat })
        const plan = planAssign(res.assign, ctx)
        stmts.push(...assignStmts(plan, ctx, null, at), ...aliasStmts(res.alias, ctx))
        applied += plan.length
        candidates = addCandidates(candidates, res.fresh, at)
        for (const t of ask) asked[t.id] = titlePrint(t.title)
      } catch (e) { aiError = e }
    }
    // 새 태그: 7일 10개, 태그 60개 미만, 막은 이름 제외
    const recent = s.created.filter((x) => x > weekAgo(at))
    const ready = readyCandidates(candidates, { tagCount: ctx.tags.length, room: AUTO_TAG.newPerWeek - recent.length, backfill: false, blocked: new Set(Object.keys(s.blocked)), person: ctx.person, liveTaskIds: new Set(ctx.tasks.map((t) => t.id)) })
    if (ready.length) {
      const r = createTagStmts(ready, ctx, null, at)
      stmts.push(...r.stmts)
      created = r.created.length
      applied += r.stmts.filter((x) => x.sql.startsWith('INSERT INTO task_tags')).length
      for (const c of ready) delete candidates[c.key]
      stmts.push(...(await aiMergeStmts(ctx)))
      autoTagStore.set({ created: [...recent, ...r.created.map(() => at)] })
    }
    await run(...stmts)
    const seen = { ...autoTagStore.get().seen }
    for (const t of targets) if (!aiError || !ask.includes(t)) seen[t.id] = titlePrint(t.title)
    autoTagStore.set({ seen, asked, candidates })
    return { applied, created, aiError }
  })
}
function aliasStmts(alias: { tagId: string; name: string }[], ctx: Ctx): Stmt[] {
  const out: Stmt[] = []
  for (const a of alias) {
    const tag = ctx.tags.find((t) => t.id === a.tagId)
    if (!tag) continue
    const next = withAlias(tag.aliases, a.name, tag.name)
    if (next) { tag.aliases = next; out.push(update('tags', tag.id, { aliases: next })) }
  }
  return out
}

/** 태그 이름·별칭이 새로 생기면(사용자가 #로 만들었거나 별칭을 더함) 그 태그로 열린·최근 할 일을 사전 검사(AI 없음) */
export function rescanNewTagKeys(opts: { at?: string } = {}): Promise<number> {
  return serial(async () => {
    if (!autoTagEnabled()) return 0
    const at = opts.at ?? now()
    const ctx = await readTagContext(new Date(at))
    const keysOf = (t: AtTag) => [t.name, ...(t.aliases ? safeAliases(t.aliases) : [])].map((n) => `${t.id}:${tagKey(n)}`)
    const all = ctx.tags.flatMap(keysOf)
    const prev = autoTagStore.get().dictKeys
    if (prev === null) { autoTagStore.set({ dictKeys: all }); return 0 } // 처음: 기준만 잡는다(기존 할 일은 일괄이 맡음)
    const old = new Set(prev)
    const changed = new Set(ctx.tags.filter((t) => keysOf(t).some((k) => !old.has(k))).map((t) => t.id))
    let n = 0
    if (changed.size) {
      const stmts = assignStmts(planAssign(dictionaryPass(ctx.tasks.map((t) => t.id), ctx, { onlyTags: changed }), ctx), ctx, null, at)
      n = stmts.length
      await run(...stmts)
    }
    autoTagStore.set({ dictKeys: all })
    return n
  })
}
const safeAliases = (raw: string) => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] } }

// ── 처음 한 번 일괄 ──
const BACKFILL_GAP = 5000
const nextDay = (at: string) => { const d = new Date(at); d.setHours(24, 5, 0, 0); return d.toISOString() }
const isDailyCap = (e: unknown) => /오늘은 이 AI 기능을 다 썼|사용 한도를 다 썼/.test(e instanceof Error ? e.message : String(e))

/**
 * 기존 할 일 일괄(§7.5): 처음이면 ① 사전 검사 전부를 한 번에 쓰고 AI 대기 목록을 저장 → ② 25개씩 묻고 5초 쉼.
 * AI가 안 되거나 하루 상한이면 멈추고(resumeAfter) 나중에 이어 감. 끝나면 모은 후보로 새 태그(25개까지)를 한 번에 만든다.
 */
export async function runBackfill(opts: { signal: AbortSignal; chat?: Chat; gapMs?: number; at?: () => string; onProgress?: (done: number, total: number) => void }): Promise<BackfillState> {
  const clock = opts.at ?? now
  const b0 = autoTagStore.get().backfill
  if (!autoTagEnabled() || b0.state === 'done' || b0.state === 'undone') return b0
  if (b0.resumeAfter && clock() < b0.resumeAfter) return b0
  // ① 시작
  if (b0.state === 'idle') {
    await serial(async () => {
      const at = clock()
      const runId = `tagrun-${at}`
      const ctx = await readTagContext(new Date(at))
      const ids = ctx.tasks.map((t) => t.id)
      await run(...assignStmts(planAssign(dictionaryPass(ids, ctx), ctx), ctx, runId, at))
      const asked = autoTagStore.get().asked
      const queue = ctx.tasks.filter((t) => needsAi(t, ctx, asked)).map((t) => t.id)
      autoTagStore.set({ backfill: { state: 'running', runId, queue, total: queue.length, startedAt: at, created: 0, candidates: {} }, dictKeys: ctx.tags.flatMap((t) => [t.name, ...(t.aliases ? safeAliases(t.aliases) : [])].map((n) => `${t.id}:${tagKey(n)}`)) })
    })
  } else autoTagStore.set((s) => ({ backfill: { ...s.backfill, state: 'running', resumeAfter: undefined } }))
  // ② AI 묶음
  for (;;) {
    if (opts.signal.aborted || !autoTagEnabled()) { autoTagStore.set((s) => ({ backfill: { ...s.backfill, state: 'paused' } })); return autoTagStore.get().backfill }
    const b = autoTagStore.get().backfill
    if (b.state !== 'running') return b
    const queue = b.queue ?? []
    opts.onProgress?.((b.total ?? 0) - queue.length, b.total ?? 0)
    if (!queue.length) break
    const step = await serial(async () => {
      const at = clock()
      const ctx = await readTagContext(new Date(at))
      const live = new Map(ctx.tasks.map((t) => [t.id, t]))
      const asked = autoTagStore.get().asked
      const part = queue.slice(0, AUTO_TAG.batchBackfill).map((id) => live.get(id)).filter((t): t is AtTask => !!t && needsAi(t, ctx, asked))
      if (!part.length) return { ok: true, n: Math.min(queue.length, AUTO_TAG.batchBackfill) }
      try {
        const res = await askTagAi(part, ctx, { signal: opts.signal, chat: opts.chat })
        await run(...assignStmts(planAssign(res.assign, ctx), ctx, b.runId ?? null, at), ...aliasStmts(res.alias, ctx))
        const s = autoTagStore.get()
        const nextAsked = { ...s.asked }
        for (const t of part) nextAsked[t.id] = titlePrint(t.title)
        autoTagStore.set({ asked: nextAsked, backfill: { ...s.backfill, candidates: addCandidates(s.backfill.candidates ?? {}, res.fresh, at) } })
        return { ok: true, n: Math.min(queue.length, AUTO_TAG.batchBackfill) }
      } catch (e) {
        if (opts.signal.aborted) { autoTagStore.set((s) => ({ backfill: { ...s.backfill, state: 'paused' } })); return { ok: false, paused: true } }
        if (isDailyCap(e) || isUnavailable(e)) {
          autoTagStore.set((s) => ({ backfill: { ...s.backfill, state: 'paused', resumeAfter: isDailyCap(e) ? nextDay(at) : new Date(Date.parse(at) + 10 * 60_000).toISOString() } }))
          return { ok: false, paused: true }
        }
        // 이 묶음의 답이 깨짐 → 건너뛰고 계속(이 할 일들은 새 할 일 경로가 제목이 바뀔 때 다시)
        console.warn('[autoTag] 일괄 묶음 건너뜀', e)
        return { ok: true, n: Math.min(queue.length, AUTO_TAG.batchBackfill) }
      }
    })
    if (!step.ok) return autoTagStore.get().backfill
    autoTagStore.set((s) => ({ backfill: { ...s.backfill, queue: (s.backfill.queue ?? []).slice(step.n) } }))
    if ((autoTagStore.get().backfill.queue ?? []).length) await sleep(opts.gapMs ?? BACKFILL_GAP, opts.signal)
  }
  // ③ 끝: 모은 후보로 새 태그(25개까지) + AI 태그끼리 합치기
  await serial(async () => {
    const at = clock()
    const s = autoTagStore.get()
    const b = s.backfill
    const ctx = await readTagContext(new Date(at))
    const ready = readyCandidates(b.candidates ?? {}, { tagCount: ctx.tags.length, room: AUTO_TAG.newPerBackfill - (b.created ?? 0), backfill: true, blocked: new Set(Object.keys(s.blocked)), person: ctx.person, liveTaskIds: new Set(ctx.tasks.map((t) => t.id)) })
    const r = createTagStmts(ready, ctx, b.runId ?? null, at)
    await run(...r.stmts, ...(await aiMergeStmts(ctx)))
    // 문턱을 못 넘은 후보는 새 할 일 경로 후보로 넘긴다(증거가 더 쌓이면 그때)
    const left = { ...(b.candidates ?? {}) }
    for (const c of ready) delete left[c.key]
    let candidates = s.candidates
    for (const [, v] of Object.entries(left)) candidates = addCandidates(candidates, Object.entries(v.tasks).map(([taskId, confidence]) => ({ taskId, name: v.name, kind: candidateKind(v), confidence })), v.at)
    autoTagStore.set({ candidates, backfill: { ...b, state: 'done', queue: [], finishedAt: at, created: (b.created ?? 0) + r.created.length, candidates: undefined } })
  })
  return autoTagStore.get().backfill
}
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((r) => { const t = setTimeout(r, ms); signal.addEventListener('abort', () => { clearTimeout(t); r() }, { once: true }) })

/** 일괄 "모두 되돌리기"가 아직 되는가(진행 중이거나 끝난 뒤 24시간) */
export function canUndoBackfill(at = now()): boolean {
  const b = autoTagStore.get().backfill
  if (!b.runId || b.state === 'undone' || b.state === 'idle') return false
  if (b.state !== 'done') return true
  return !!b.finishedAt && Date.parse(at) - Date.parse(b.finishedAt) < AUTO_TAG.undoHours * 3600_000
}
/** 일괄 모두 되돌리기: 그 run 행 중 사용자가 손대지 않은 것(아직 rule/ai·accepted)을 지우고, 그 run이 만든 AI 태그는 비었으면 지운다 */
export async function undoBackfill(at = now()): Promise<{ removed: number; tags: number }> {
  if (!canUndoBackfill(at)) return { removed: 0, tags: 0 }
  const runId = autoTagStore.get().backfill.runId!
  return serial(async () => {
    const db = await getDb()
    const rows = await db.getAll<{ id: string }>(`SELECT id FROM task_tags WHERE run_id = ? AND source IN ('rule','ai') AND COALESCE(state,'accepted') = 'accepted'`, [runId])
    const stmts: Stmt[] = rows.map((r) => remove('task_tags', r.id))
    const tags = await db.getAll<{ id: string; name: string }>(`SELECT g.id, g.name FROM tags g WHERE g.run_id = ? AND g.source = 'ai'
      AND NOT EXISTS (SELECT 1 FROM task_tags tt WHERE tt.tag_id = g.id AND COALESCE(tt.state,'accepted') = 'accepted'
        AND NOT (tt.run_id = ? AND tt.source IN ('rule','ai')))`, [runId, runId])
    for (const g of tags) {
      for (const r of await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE tag_id = ?', [g.id])) if (!rows.some((x) => x.id === r.id)) stmts.push(remove('task_tags', r.id))
      stmts.push(remove('tags', g.id))
    }
    await run(...stmts)
    autoTagStore.set((s) => ({ backfill: { ...s.backfill, state: 'undone', queue: [] }, blocked: { ...s.blocked, ...Object.fromEntries(tags.map((g) => [tagKey(g.name), true as const])) } }))
    return { removed: rows.length, tags: tags.length }
  })
}

// ── 조용한 요약 · 이번 주 되돌리기 ──
export type WeeklySummary = { count: number; tasks: number; tags: number; createdTags: number }
/** 최근 7일 자동 연결(rule·ai, accepted) 수 · 그 태그 수 · AI가 만든 태그 수 */
export async function weeklySummary(at = now()): Promise<WeeklySummary> {
  const db = await getDb()
  const since = weekAgo(at)
  const r = await db.get<{ c: number; g: number; k: number }>(`SELECT count(*) AS c, count(DISTINCT tag_id) AS g, count(DISTINCT task_id) AS k FROM task_tags WHERE source IN ('rule','ai') AND COALESCE(state,'accepted') = 'accepted' AND created_at > ?`, [since])
  const t = await db.get<{ c: number }>(`SELECT count(*) AS c FROM tags WHERE source = 'ai' AND created_at > ?`, [since])
  return { count: Number(r?.c ?? 0), tasks: Number(r?.k ?? 0), tags: Number(r?.g ?? 0), createdTags: Number(t?.c ?? 0) }
}
/** 최근 7일 자동 연결을 dismissed로(그 할 일엔 다시 안 붙음) + 그 기간 AI가 만든 태그 중 사람·링크 연결이 없는 것은 지우고 이름을 막는다 */
export async function undoWeek(at = now()): Promise<{ dismissed: number; tags: number }> {
  return serial(async () => {
    const db = await getDb()
    const since = weekAgo(at)
    const rows = await db.getAll<{ id: string }>(`SELECT id FROM task_tags WHERE source IN ('rule','ai') AND COALESCE(state,'accepted') = 'accepted' AND created_at > ?`, [since])
    const tags = await db.getAll<{ id: string; name: string }>(`SELECT g.id, g.name FROM tags g WHERE g.source = 'ai' AND g.created_at > ?
      AND NOT EXISTS (SELECT 1 FROM task_tags tt WHERE tt.tag_id = g.id AND COALESCE(tt.state,'accepted') = 'accepted' AND COALESCE(tt.source,'user') NOT IN ('rule','ai'))`, [since])
    const gone = new Set(tags.map((g) => g.id))
    const stmts: Stmt[] = []
    for (const g of tags) {
      for (const r of await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE tag_id = ?', [g.id])) stmts.push(remove('task_tags', r.id))
      stmts.push(remove('tags', g.id))
    }
    const keep = rows.length ? await db.getAll<{ id: string; tag_id: string }>(`SELECT id, tag_id FROM task_tags WHERE id IN (${marks(rows.length)})`, rows.map((r) => r.id)) : []
    for (const r of keep) if (!gone.has(r.tag_id)) stmts.push(update('task_tags', r.id, { state: 'dismissed' }))
    await run(...stmts)
    autoTagStore.set((s) => ({ blocked: { ...s.blocked, ...Object.fromEntries(tags.map((g) => [tagKey(g.name), true as const])) } }))
    return { dismissed: keep.filter((r) => !gone.has(r.tag_id)).length, tags: tags.length }
  })
}

// ── 화면 경계(data/wiki.ts AutoTagApi): 요약 = 이번 주, 되돌리기 = 일괄(24시간 안이면) 아니면 이번 주 ──
export const pipelineAutoTagApi: AutoTagApi = {
  async summary() {
    const w = await weeklySummary()
    const b = autoTagStore.get().backfill
    const lastRun = canUndoBackfill() && b.runId ? { id: b.runId, at: b.finishedAt ?? b.startedAt ?? now(), count: await runCount(b.runId) } : undefined
    return { count: w.count, tasks: w.tasks, lastRun }
  },
  async undoLastRun() {
    if (canUndoBackfill()) return (await undoBackfill()).removed
    return (await undoWeek()).dismissed
  }
}
async function runCount(runId: string) {
  const r = await (await getDb()).get<{ c: number }>(`SELECT count(*) AS c FROM task_tags WHERE run_id = ? AND source IN ('rule','ai') AND COALESCE(state,'accepted') = 'accepted'`, [runId])
  return Number(r?.c ?? 0)
}
setAutoTagApi(pipelineAutoTagApi)

/** 시험용 */
export const _test = { nextDay, isDailyCap }
