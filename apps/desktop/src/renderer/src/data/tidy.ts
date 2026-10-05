// 31 §12 v2 정리 모드 = 분류 책상. 왼쪽 더미(기본함 · 기한 지난 일 · 프로젝트 밖 · 태그 없음)를 오른쪽 상자(프로젝트 = 태그만 · 폴더 › 리스트 = 옮김)에 넣는다.
// 순수 계산은 공용 @sprout/schema/tidy(모바일과 같은 코드, 시험: tests/tidy.test.ts), 여기는 기기 기억과 로컬 DB에 쓰는 동작(되돌리기 함수를 돌려준다).
import { targetKey, type Proposal } from '@sprout/schema/tidy'
import { getDb } from './db'
import { run, update, withDescendants } from './mutations'
import { addToProject } from './projects'
export * from '@sprout/schema/tidy'

// ── 기기 기억: 프로젝트 제안 "아니" ──
const NO_KEY = 'sprout.map.tidy.no'
export const tidyNo = {
  get(): Record<string, string> { try { return JSON.parse(localStorage.getItem(NO_KEY) ?? '{}') ?? {} } catch { return {} } },
  add(pairs: Record<string, string>) { try { localStorage.setItem(NO_KEY, JSON.stringify({ ...tidyNo.get(), ...pairs })) } catch { /* 기억만 못 한다 */ } }
}

// ── DB 동작(되돌리기 함수를 돌려준다) ──
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
type Undo = () => Promise<void>

/** 리스트로 옮기기(하위 함께, 02 §6 — taskActions.move와 같은 규칙: 함께 가지 않는 부모와는 연결이 풀린다) */
export async function moveToList(ids: string[], listId: string): Promise<{ moved: number; undo: Undo }> {
  if (!ids.length) return { moved: 0, undo: async () => {} }
  const all = await withDescendants(ids)
  const db = await getDb()
  const rows = await db.getAll<{ id: string; list_id: string | null; parent_id: string | null }>(`SELECT id, list_id, parent_id FROM tasks WHERE id IN (${marks(all.length)})`, all)
  const moving = new Set(all), top = new Set(ids)
  const change = rows.filter((r) => r.list_id !== listId || (top.has(r.id) && r.parent_id && !moving.has(r.parent_id)))
  await run(...change.map((r) => update('tasks', r.id, top.has(r.id) && r.parent_id && !moving.has(r.parent_id) ? { list_id: listId, parent_id: null } : { list_id: listId })))
  return {
    moved: ids.filter((id) => change.some((r) => r.id === id)).length,
    undo: () => run(...change.map((r) => update('tasks', r.id, { list_id: r.list_id, parent_id: r.parent_id }))).then(() => {})
  }
}

/** 프로젝트에 묶기 = 태그만 붙임(리스트 그대로). 31 §12.1 addToProject 그대로(사람이 넣음 user·accepted, 뗀 행은 다시 켬) */
export async function addProjectTag(ids: string[], tagId: string): Promise<{ added: number; undo: Undo }> {
  if (!ids.length) return { added: 0, undo: async () => {} }
  const undo = await addToProject(ids, tagId)
  return { added: ids.length, undo }
}

/** 제안 여러 개 한 번에(제안 N개 모두 옮기기): 리스트로 · 프로젝트로 묶어 각각, 되돌리기는 한 번에(거꾸로) */
export async function applyProposals(ps: Proposal[]): Promise<{ lists: number; projects: number; undo: Undo }> {
  const undos: Undo[] = []
  let lists = 0, projects = 0
  const groups = new Map<string, Proposal[]>()
  for (const p of ps) { const k = targetKey(p.to); groups.set(k, [...(groups.get(k) ?? []), p]) }
  for (const g of groups.values()) {
    const to = g[0].to, ids = g.map((p) => p.taskId)
    if (to.kind === 'list') { const r = await moveToList(ids, to.id); lists += r.moved; undos.push(r.undo) }
    else { const r = await addProjectTag(ids, to.id); projects += r.added; undos.push(r.undo) }
  }
  return { lists, projects, undo: async () => { for (const u of undos.reverse()) await u() } }
}

/** 기한 지난 일 한꺼번에(19 applyCleanup 그대로 — 완료 = XP 없음 planCompleteNoXp). 이 동작만 되돌리는 스냅숏을 따로 뜬다 */
export const LATE_FIELDS = ['status', 'due_at', 'start_at', 'is_all_day', 'repeat_rule', 'repeat_from', 'completed_at', 'deleted_at'] as const
export async function snapshotLate(ids: string[], withKids: boolean): Promise<Undo> {
  const all = withKids ? await withDescendants(ids) : ids
  if (!all.length) return async () => {}
  const rows = await (await getDb()).getAll<Record<string, unknown> & { id: string }>(`SELECT id, ${LATE_FIELDS.join(', ')} FROM tasks WHERE id IN (${marks(all.length)})`, all)
  return () => run(...rows.map(({ id, ...rest }) => update('tasks', id, rest))).then(() => {})
}
