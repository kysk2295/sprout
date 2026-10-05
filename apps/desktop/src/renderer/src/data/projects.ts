// 31 §12.1 자동 프로젝트 — 읽기·쓰기. 계산 규칙은 @sprout/schema/projects(순수), 태그 붙이기 규칙은 @sprout/schema/autoTag(33).
//  · runProjectPass(): ① 덩어리 찾기 → 프로젝트 태그 만들기(source ai) ② 사전 검사로 붙이기 ③ 넓히기(rule 75) + AI topic 태그 중 프로젝트 같은 것 → project
//    자동 태그 묶음·일괄이 끝날 때(useAutoTagger)와 계획 화면을 열 때 돈다. 자동 태그가 꺼져 있으면 안 돈다.
//  · 사람 손: 제안 카드로 만들기 · 아니 · 빠진 거 없어 · ✕ 이건 아니야 · ＋ 더 넣기 · 프로젝트 아님 — 모두 되돌리기 함수를 돌려준다.
import {
  AUTO_TAG, aiTagId, autoTagRowId, dictionaryPass, findSynonym, planAssign, tagKey, type Assign, type AtFolder, type AtLink, type AtList, type AtTag, type Ctx
} from '@sprout/schema/autoTag'
import { expandProject, findProjectClusters, INSTANCE, nearSameName, planProjectCleanup, PROJECT, projectMembers, upgradeToProject, type Proposal, type PTask } from '@sprout/schema/projects'
import { parseAliases } from '@sprout/schema/wikiLink'
import { getDb, type Stmt } from './db'
import { insert, now, remove, run, update, uuid } from './mutations'
import { assignStmts, autoTagEnabled, autoTagPerson, autoTagStore, loadTagScope, tagScope } from './autoTag'
import { serial } from './listSuggest'

// ── 기기 저장 sprout.map.projects.v1 ──
export type ProjectStore = {
  /** 제안 카드에서 `아니`한 낱말 열쇠 */
  dismissed: string[]
  /** `빠진 거 없어` — 태그 id → 그때 구성원 수(늘면 말풍선이 다시) */
  confirmed: Record<string, number>
  lastRun?: string
  /** 한 번 정리(cleanupProjects)를 한 판 — CLEANUP_VERSION과 같으면 다시 안 돈다 */
  cleanup?: number
  /** 31 §12.9.1 ⋯ › 자동으로 프로젝트 만들기(기본 켬). false면 자동 패스·제안 카드가 쉰다 */
  auto?: boolean
  /** §12.10.5 바로잡기에서 기억한, 사람이 넣었던 할 일(새 특정 프로젝트가 잡으면 user로) */
  carry?: string[]
  /** §12.10.3 고르기에서 `아니`한 할 일 */
  skip?: string[]
}
export const autoProjectsOn = () => projectStore.get().auto !== false
const KEY = 'sprout.map.projects.v1'
let mem: ProjectStore | undefined
const subs = new Set<() => void>()
export const projectStore = {
  get(): ProjectStore {
    if (mem) return mem
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); mem = { dismissed: [], confirmed: {}, ...(s && typeof s === 'object' ? s : {}) } } catch { mem = { dismissed: [], confirmed: {} } }
    return mem!
  },
  set(patch: Partial<ProjectStore>) {
    mem = { ...projectStore.get(), ...patch }
    try { localStorage.setItem(KEY, JSON.stringify(mem)) } catch { /* 기억만 못 한다 */ }
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
  reset() { mem = undefined; try { localStorage.removeItem(KEY) } catch { /* */ } }
}

// ── 읽기 ──
export type ProjectCtx = Ctx & { tasks: (PTask & { status: number })[] }
const DONE_DAYS = 120
/** 프로젝트 계산 문맥: 태그·리스트·폴더·할 일(열린 것 + 최근 120일 끝낸 것, 날짜·부모 포함)·연결 */
export async function readProjectCtx(at = new Date()): Promise<ProjectCtx> {
  await loadTagScope()
  const db = await getDb()
  const cutoff = new Date(at.getTime() - DONE_DAYS * 86_400_000).toISOString()
  const [tags, lists, folders, tasks, links] = await Promise.all([
    db.getAll<AtTag>(`SELECT id, name, kind, aliases, source, home_type, home_id, created_at, run_id FROM tags WHERE name IS NOT NULL AND name != '' ORDER BY sort_order`),
    db.getAll<AtList>('SELECT id, name, folder_id, kind FROM lists WHERE archived_at IS NULL'),
    db.getAll<AtFolder>('SELECT id, name FROM folders'),
    db.getAll<PTask & { status: number }>(`SELECT id, title, list_id, parent_id, status, due_at, start_at, completed_at, created_at FROM tasks
      WHERE deleted_at IS NULL AND title IS NOT NULL AND title != '' AND (status = 0 OR (status = 1 AND completed_at >= ?)) ORDER BY created_at`, [cutoff]),
    db.getAll<AtLink>('SELECT id, task_id, tag_id, source, state, created_at, run_id, confidence FROM task_tags')
  ])
  return { tags, lists, folders, tasks, links, person: autoTagPerson() }
}
const blockedKeys = () => new Set([...Object.keys(autoTagStore.get().blocked), ...projectStore.get().dismissed])

// ── 자동 패스 ──
export type ProjectPassResult = { created: number; attached: number; upgraded: number }
/** 마지막 실행 뒤 이 시간 안이면 화면 열기로는 다시 안 돈다 */
export const PASS_GAP = 60_000

/** 새 프로젝트 태그 행(+ ctx에 더함) */
function projectTagStmt(ctx: ProjectCtx, p: Pick<Proposal, 'name' | 'word' | 'home' | 'aliases'>, source: 'ai' | 'user', runId: string | null, at: string): { stmt: Stmt; tag: AtTag } {
  const al = [...new Set([p.word, ...(p.aliases ?? [])])].filter((a) => tagKey(a) !== tagKey(p.name))
  const aliases = al.length ? JSON.stringify(al) : null
  const tag: AtTag = { id: source === 'ai' ? aiTagId(p.name, tagScope()) : uuid(), name: p.name, kind: 'project', aliases, source, home_type: p.home?.type ?? null, home_id: p.home?.id ?? null, created_at: at, run_id: runId }
  ctx.tags.push(tag)
  return {
    tag,
    stmt: insert('tags', { id: tag.id, name: p.name, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'project', aliases, source, run_id: runId, home_type: tag.home_type, home_id: tag.home_id, created_at: at, modified_at: at })
  }
}
/** 이 프로젝트 태그로 사전 검사 + 넓히기 → 붙일 것 */
function attachPlan(ctx: ProjectCtx, tagIds: Set<string>): Assign[] {
  const dict = planAssign(dictionaryPass(ctx.tasks.map((t) => t.id), ctx, { onlyTags: tagIds }), ctx)
  return dict
}
function expandPlan(ctx: ProjectCtx, tagIds: Set<string>): Assign[] {
  const out: Assign[] = []
  // 기본함은 묶음이 아니다 — 자동 넓히기에서 뺀다(2026-10-05: 기본함 할 일이 `근무`·`adsp`에 쓸려 들어감). 정리 책상 제안(tidy)은 그대로
  const inbox = new Set(ctx.lists.filter((l) => l.kind === 'inbox').map((l) => l.id))
  const inInbox = new Set(ctx.tasks.filter((t) => !t.list_id || inbox.has(t.list_id)).map((t) => t.id))
  for (const tag of ctx.tags.filter((t) => tagIds.has(t.id))) {
    const members = projectMembers(tag, ctx.tasks, ctx.links, ctx.lists)
    for (const taskId of expandProject(tag, members, ctx)) if (!inInbox.has(taskId)) out.push({ taskId, tagId: tag.id, source: 'rule', confidence: PROJECT.expandScore })
  }
  return planAssign(out, ctx)
}

/**
 * 자동 프로젝트 한 바퀴(§12.1): AI topic 태그 → project, 덩어리 → 새 프로젝트 태그(태그 60개 미만), 모든 프로젝트 태그로 사전 검사·넓히기.
 * 결정적이라 AI 없이 돈다. 33 대기열(serial)과 같은 줄.
 */
export function runProjectPass(opts: { at?: string; force?: boolean } = {}): Promise<ProjectPassResult> {
  return serial(async () => {
    const zero = { created: 0, attached: 0, upgraded: 0 }
    const at = opts.at ?? now()
    const runId = `proj-${at}`
    await cleanupOnce(at, runId)
    if (!autoTagEnabled() || !autoProjectsOn()) return zero
    const last = projectStore.get().lastRun
    if (!opts.force && last && Date.parse(at) - Date.parse(last) < PASS_GAP && Date.parse(at) >= Date.parse(last)) return zero
    const ctx = await readProjectCtx(new Date(at))
    const stmts: Stmt[] = []
    // AI가 만든 topic 태그 중 프로젝트 같은 것 → project
    const up = upgradeToProject(ctx.tags)
    for (const id of up) { stmts.push(update('tags', id, { kind: 'project' })); ctx.tags.find((t) => t.id === id)!.kind = 'project' }
    // 덩어리 → 새 프로젝트 태그
    const { auto } = findProjectClusters(ctx, blockedKeys())
    let created = 0
    // §12.10 특정 프로젝트: 막연한 할 일(이름이 제목에 없음)은 사전 검사가 못 잡으니 덩어리가 정한 대로 붙인다(rule 90)
    const instanceAssign: Assign[] = []
    const claim = (p: Proposal, tagId: string) => { if (p.reason === 'instance') for (const taskId of p.taskIds) instanceAssign.push({ taskId, tagId, source: 'rule', confidence: INSTANCE.assignScore }) }
    for (const p of auto) {
      if (p.reason === 'instance') {
        const same = ctx.tags.find((t) => t.kind === 'project' && (tagKey(t.name) === p.key || parseAliases(t.aliases).some((a) => tagKey(a) === p.key)))
        if (same) { claim(p, same.id); continue }
      }
      if (ctx.tags.length >= AUTO_TAG.maxTags) break
      const syn = p.reason === 'instance' ? null : findSynonym(p.name, ctx.tags) ?? findSynonym(p.word, ctx.tags)
      if (!syn && ctx.tags.some((t) => t.kind === 'project' && nearSameName(t.name, p.name))) continue // 이름이 거의 같은 프로젝트가 이미 있음
      if (syn) {
        if (syn.tag.source === 'ai' && syn.tag.kind !== 'project') { stmts.push(update('tags', syn.tag.id, { kind: 'project' })); syn.tag.kind = 'project'; up.push(syn.tag.id) }
        continue
      }
      const made = projectTagStmt(ctx, p, 'ai', runId, at)
      stmts.push(made.stmt)
      claim(p, made.tag.id)
      created++
    }
    const projIds = new Set(ctx.tags.filter((t) => t.kind === 'project').map((t) => t.id))
    let attached = 0
    if (projIds.size) {
      const i0 = planAssign(instanceAssign, ctx)
      const ia = assignStmts(i0, ctx, runId, at)
      // ctx.links에 더해야 사전 검사·넓히기가 같은 할 일을 또 붙이지 않는다
      for (const x of i0) ctx.links.push({ id: autoTagRowId(x.taskId, x.tagId), task_id: x.taskId, tag_id: x.tagId, source: 'rule', state: 'accepted' } as AtLink)
      const a = assignStmts(attachPlan(ctx, projIds), ctx, runId, at)
      const b = assignStmts(expandPlan(ctx, projIds), ctx, runId, at)
      stmts.push(...ia, ...a, ...b)
      attached = ia.length + a.length + b.length
    }
    await run(...stmts)
    projectStore.set({ lastRun: at })
    await carryUserLinks(runId)
    return { created, attached, upgraded: up.length }
  })
}

// ── 한 번 정리(2026-10-05) ──
/** 판이 오르면 다시 한 번 돈다 */
// v2(31 §12.10.5): 분류(공모전·창업)에 든 AI 자동 프로젝트를 지우고 제목에서 하나하나 다시 나눈다. 기록 열쇠는 판마다 따로(v1 기록은 그대로 남는다)
export const CLEANUP_VERSION = 2
const CLEANUP_KEY = `sprout.map.projects.cleanup.v${CLEANUP_VERSION}`
type CleanupRecord = { at: string; tags: Record<string, unknown>[]; links: Record<string, unknown>[]; added: string[]; updated: Record<string, unknown>[]; carry?: string[]; passRun?: string }
export type CleanupResult = { removedTags: number; removedLinks: number; merged: number; renamed: number }
/**
 * 예전 규칙이 만든 잘못된 자동 프로젝트를 고친다(@sprout/schema/projects planProjectCleanup — 자동 태그·연결만, 사용자 태그는 그대로).
 * 바꾸기 전 행을 기기 localStorage `sprout.map.projects.cleanup.v1`에 남겨 undoProjectCleanup으로 되돌린다.
 */
export async function cleanupProjects(at = now()): Promise<CleanupResult> {
  const ctx = await readProjectCtx(new Date(at))
  const plan = planProjectCleanup(ctx)
  const zero = { removedTags: 0, removedLinks: 0, merged: 0, renamed: 0 }
  if (!plan.removeTags.length && !plan.removeLinks.length && !plan.updateTags.length && !plan.addLinks.length) return zero
  if (plan.carryUser.length) projectStore.set({ carry: [...new Set([...(projectStore.get().carry ?? []), ...plan.carryUser])] })
  const db = await getDb()
  const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
  const tagRows = plan.removeTags.length ? await db.getAll<Record<string, unknown>>(`SELECT * FROM tags WHERE id IN (${marks(plan.removeTags.length)})`, plan.removeTags) : []
  const linkRows = plan.removeLinks.length ? await db.getAll<Record<string, unknown>>(`SELECT * FROM task_tags WHERE id IN (${marks(plan.removeLinks.length)})`, plan.removeLinks) : []
  const upIds = plan.updateTags.map((u) => u.id)
  const updated = upIds.length ? await db.getAll<Record<string, unknown>>(`SELECT id, name, aliases FROM tags WHERE id IN (${marks(upIds.length)})`, upIds) : []
  const runId = `projfix-${at}`
  const added: string[] = []
  const stmts: Stmt[] = [
    ...plan.removeLinks.map((id) => remove('task_tags', id)),
    ...plan.removeTags.map((id) => remove('tags', id)),
    ...plan.updateTags.map(({ id, ...patch }) => update('tags', id, patch)),
    ...plan.addLinks.map((l) => { const id = `${autoTagRowId(l.task_id, l.tag_id)}`; added.push(id); return insert('task_tags', { id, ...l, run_id: runId, created_at: at, modified_at: at }) })
  ]
  await run(...stmts)
  const rec: CleanupRecord = { at, tags: tagRows, links: linkRows, added, updated, carry: plan.carryUser }
  try { localStorage.setItem(CLEANUP_KEY, JSON.stringify(rec)) } catch { /* 되돌리기 기억만 못 한다 */ }
  const merged = plan.addLinks.length ? new Set(plan.addLinks.map((l) => l.tag_id)).size : 0
  return { removedTags: plan.removeTags.length, removedLinks: plan.removeLinks.length, merged, renamed: plan.updateTags.filter((u) => u.name).length }
}
/** 남은 정리 기록(없으면 null) */
export function loadProjectCleanup(): CleanupRecord | null {
  try { const r = JSON.parse(localStorage.getItem(CLEANUP_KEY) ?? 'null'); return r && Array.isArray(r.tags) ? r : null } catch { return null }
}
/** 한 번 정리 되돌리기: 지운 태그·연결을 되살리고, 옮겨 만든 연결을 지우고, 이름·별칭을 돌린다. 판은 그대로(다시 저절로 안 돈다) */
export async function undoProjectCleanup(): Promise<boolean> {
  const rec = loadProjectCleanup()
  if (!rec) return false
  const strip = (r: Record<string, unknown>) => { const { id, ...rest } = r; return { id: id as string, rest } }
  // 바로잡기 뒤 첫 패스가 만든 특정 프로젝트·연결(§12.10.5)
  const db = await getDb()
  const made = rec.passRun ? await db.getAll<{ id: string }>("SELECT id FROM tags WHERE run_id = ? AND source = 'ai'", [rec.passRun]) : []
  const madeLinks = rec.passRun ? await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE run_id = ?', [rec.passRun]) : []
  const restoreIds = new Set(rec.tags.map((r) => r.id as string))
  await run(
    ...madeLinks.map((r) => remove('task_tags', r.id)),
    ...made.filter((t) => !restoreIds.has(t.id)).map((t) => remove('tags', t.id)),
    ...rec.added.map((id) => remove('task_tags', id)),
    ...rec.tags.map((r) => insert('tags', r)),
    ...rec.links.map((r) => insert('task_tags', r)),
    ...rec.updated.map((r) => { const { id, rest } = strip(r); return update('tags', id, rest) })
  )
  try { localStorage.removeItem(CLEANUP_KEY) } catch { /* */ }
  return true
}
/** 자동 패스 앞에서 한 판에 한 번(자동 태그가 꺼져 있어도 돈다 — 이미 생긴 잘못을 고치는 것) */
async function cleanupOnce(at: string, passRun: string) {
  if ((projectStore.get().cleanup ?? 0) >= CLEANUP_VERSION) return
  try {
    const r = await cleanupProjects(at)
    if (r.removedTags || r.removedLinks || r.renamed) {
      console.info('[project] 자동 프로젝트 정리', r)
      // 이어서 도는 패스가 만든 것도 되돌리기에 넣는다
      const rec = loadProjectCleanup()
      if (rec) try { localStorage.setItem(CLEANUP_KEY, JSON.stringify({ ...rec, passRun })) } catch { /* */ }
    }
  } finally { projectStore.set({ cleanup: CLEANUP_VERSION }) }
}
/** §12.10.5 지운 막연한 프로젝트에 사람이 넣었던 할 일: 새 특정 프로젝트가 잡았으면 그 연결을 user로 */
async function carryUserLinks(runId: string) {
  const carry = projectStore.get().carry
  if (!carry?.length) return
  const db = await getDb()
  const marks = carry.map(() => '?').join(',')
  const rows = await db.getAll<{ id: string; task_id: string }>(`SELECT tt.id, tt.task_id FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE g.kind = 'project' AND tt.run_id = ? AND tt.task_id IN (${marks})`, [runId, ...carry])
  await run(...rows.map((r) => update('task_tags', r.id, { source: 'user' })))
  const done = new Set(rows.map((r) => r.task_id))
  projectStore.set({ carry: carry.filter((id) => !done.has(id)) })
}

// ── 사람 손 ──
type Undo = () => Promise<void>
/** 제안 카드 `📊 … 프로젝트 만들기`: 사용자 topic 태그면 kind만 project로, 아니면 새 프로젝트 태그(source user) + 사전 검사·넓히기 */
export async function createProjectFrom(p: Proposal, at = now()): Promise<{ tagId: string; undo: Undo }> {
  return serial(async () => {
    const ctx = await readProjectCtx(new Date(at))
    const stmts: Stmt[] = []
    let tagId: string, made = false
    const prevKind = p.tagId ? ctx.tags.find((t) => t.id === p.tagId)?.kind ?? null : null
    if (p.tagId) {
      tagId = p.tagId
      stmts.push(update('tags', tagId, { kind: 'project' }))
      ctx.tags.find((t) => t.id === tagId)!.kind = 'project'
    } else {
      const syn = findSynonym(p.name, ctx.tags)
      if (syn) { tagId = syn.tag.id; stmts.push(update('tags', tagId, { kind: 'project' })); syn.tag.kind = 'project' }
      else { const r = projectTagStmt(ctx, p, 'user', null, at); stmts.push(r.stmt); tagId = r.tag.id; made = true }
    }
    const runId = `projmk-${at}`
    const one = new Set([tagId])
    // 제안에 든 할 일은 이름이 제목에 있으니 사전 검사가 잡는다. 넓히기도 같이
    const a = assignStmts(attachPlan(ctx, one), ctx, runId, at)
    const b = assignStmts(expandPlan(ctx, one), ctx, runId, at)
    await run(...stmts, ...a, ...b)
    return {
      tagId,
      undo: async () => {
        const db = await getDb()
        const rows = await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE run_id = ?', [runId])
        const back: Stmt[] = rows.map((r) => remove('task_tags', r.id))
        if (made) { for (const r of await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE tag_id = ?', [tagId])) if (!rows.some((x) => x.id === r.id)) back.push(remove('task_tags', r.id)); back.push(remove('tags', tagId)) }
        else back.push(update('tags', tagId, { kind: prevKind }))
        await run(...back)
      }
    }
  })
}
/** 제안 카드 `아니` — 그 낱말은 다시 제안·자동으로 만들지 않는다 */
export function dismissSuggestion(key: string) {
  const d = projectStore.get().dismissed
  if (!d.includes(key)) projectStore.set({ dismissed: [...d, key] })
}
/** `빠진 거 없어` */
export function confirmProject(tagId: string, count: number) { projectStore.set({ confirmed: { ...projectStore.get().confirmed, [tagId]: count } }) }

/** 카드 `⋯ › 프로젝트 아님`: kind를 topic으로(source user) + 이름을 막아 다시 안 만든다 */
export async function notProject(tag: { id: string; name: string; kind?: string | null; source?: string | null }): Promise<Undo> {
  await run(update('tags', tag.id, { kind: 'topic', source: 'user' }))
  const key = tagKey(tag.name)
  const was = !!autoTagStore.get().blocked[key]
  autoTagStore.set((s) => ({ blocked: { ...s.blocked, [key]: true } }))
  return async () => {
    await run(update('tags', tag.id, { kind: tag.kind ?? 'project', source: tag.source ?? null }))
    if (!was) autoTagStore.set((s) => { const b = { ...s.blocked }; delete b[key]; return { blocked: b } })
  }
}

/** `✕ 이건 아니야`·프로젝트에서 빼기: 태그 행은 (사람이 넣은 것도) dismissed로 남긴다 — 31 §12.9.2 손으로 뺀 것은 자동 패스가 다시 붙이지 않는다.
 * 집·하위로 들어온 할 일은 dismissed 행 하나 */
export async function removeFromProject(taskId: string, tagId: string): Promise<Undo> {
  const db = await getDb()
  const rows = await db.getAll<{ id: string; state: string | null }>('SELECT id, state FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, tagId])
  if (rows.length) {
    const prev = rows.map((r) => ({ id: r.id, state: r.state }))
    await run(...rows.map((r) => update('task_tags', r.id, { state: 'dismissed' })))
    return async () => { await run(...prev.map((r) => update('task_tags', r.id, { state: r.state }))) }
  }
  const id = autoTagRowId(taskId, tagId)
  const at = now()
  await run(insert('task_tags', { id, task_id: taskId, tag_id: tagId, source: 'rule', state: 'dismissed', confidence: null, run_id: null, created_at: at, modified_at: at }))
  return async () => { await run(remove('task_tags', id)) }
}

/** `＋ 더 넣기` · 같이 계획 짜기: 사람이 넣음(source user). 뗀 행이 있으면 다시 켠다 */
export async function addToProject(taskIds: string[], tagId: string): Promise<Undo> {
  if (!taskIds.length) return async () => {}
  const db = await getDb()
  const marks = taskIds.map(() => '?').join(',')
  const rows = await db.getAll<{ id: string; task_id: string; source: string | null; state: string | null }>(`SELECT id, task_id, source, state FROM task_tags WHERE tag_id = ? AND task_id IN (${marks})`, [tagId, ...taskIds])
  const at = now()
  const stmts: Stmt[] = []
  const made: string[] = []
  const prev: { id: string; source: string | null; state: string | null }[] = []
  for (const taskId of taskIds) {
    const r = rows.find((x) => x.task_id === taskId)
    if (r) { prev.push({ id: r.id, source: r.source, state: r.state }); stmts.push(update('task_tags', r.id, { source: 'user', state: 'accepted' })) }
    else { const id = autoTagRowId(taskId, tagId); made.push(id); stmts.push(insert('task_tags', { id, task_id: taskId, tag_id: tagId, source: 'user', state: 'accepted', confidence: null, run_id: null, created_at: at, modified_at: at })) }
  }
  await run(...stmts)
  return async () => { await run(...made.map((id) => remove('task_tags', id)), ...prev.map((p) => update('task_tags', p.id, { source: p.source, state: p.state }))) }
}

/** 보드 `＋ 같이 계획 짜기`로 정한 큰 일 → 프로젝트 태그(이름 20자, 같은 뜻 태그가 있으면 그것) + 그 일에 붙임. 태그 id */
export async function ensureProjectForGoal(goal: { id: string; title: string }): Promise<string> {
  return serial(async () => {
    const ctx = await readProjectCtx()
    const name = [...goal.title.trim()].slice(0, PROJECT.nameMax).join('').trim() || '새 프로젝트'
    const syn = findSynonym(name, ctx.tags)
    const stmts: Stmt[] = []
    let tagId: string
    if (syn) {
      tagId = syn.tag.id
      if (syn.tag.kind !== 'project') stmts.push(update('tags', tagId, { kind: 'project' }))
    } else {
      const r = projectTagStmt(ctx, { name, word: name }, 'user', null, now())
      stmts.push(r.stmt)
      tagId = r.tag.id
    }
    await run(...stmts)
    await addToProject([goal.id], tagId)
    return tagId
  })
}

/** 31 §12.4 프로젝트 안 같이 계획 짜기 ① 답 칩: 그 프로젝트의 열린 최상위 할 일(마감 가까운 순) */
export async function projectOpenTasks(tagId: string, n = 3): Promise<{ id: string; title: string }[]> {
  const db = await getDb()
  return db.getAll<{ id: string; title: string }>(`SELECT t.id, t.title FROM tasks t JOIN task_tags tt ON tt.task_id = t.id AND tt.tag_id = ?
    WHERE t.deleted_at IS NULL AND t.status = 0 AND t.parent_id IS NULL AND t.title != '' AND COALESCE(tt.state,'accepted') = 'accepted'
    ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.created_at DESC LIMIT ?`, [tagId, n])
}
