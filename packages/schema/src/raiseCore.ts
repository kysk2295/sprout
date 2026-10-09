// 43 캐릭터 키우기 — DB를 읽고 쓸 문을 만드는 순수 함수(데스크톱·휴대폰 공용, 실행은 각 앱). 시험: raiseCore.test.ts
// 해금 판정은 앱이 한다(43 §10): XP 원장이 바뀔 때·프로젝트 상태가 바뀔 때·앱을 열 때 planUnlocks를 돌려 새 것만 character_items에 넣는다.
import { LEGACY_SPECIES, progressFromEvents } from './growth.ts'
import { projectDeadline, projectMembers, projectTitle, type PTask } from './projects.ts'
import type { AtLink, AtList, AtTag } from './autoTag.ts'
import { insertStmt, updateStmt, type CoreDb, type Stmt } from './taskCore.ts'
import { newUnlocks, projectFinished, raiseStateFrom, serializeLook, type CharacterItemRow, type FinishedProject, type Look, type RaiseState } from './wardrobe.ts'

export type RaiseEnv = { owner: string; now?: () => string }
const nowOf = (env: RaiseEnv) => (env.now ?? (() => new Date().toISOString()))()

// ── 옛 종 id 한 번 옮기기(클라이언트 쪽 — 서버 마이그레이션 20261013-character-raising.sql과 같은 표) ──
/** 이 기기 DB에 옛 종 id(turtle·squirrel·cat·otter)가 남아 있으면 새 id로 바꾸는 문. 서버가 먼저 옮겼으면 빈 목록 */
export async function planLegacySpeciesFix(db: CoreDb, env: RaiseEnv): Promise<Stmt[]> {
  const at = nowOf(env)
  const out: Stmt[] = []
  const olds = Object.keys(LEGACY_SPECIES)
  const rows = await db.getAll<{ id: string; species: string }>(`SELECT id, species FROM characters WHERE species IN (${olds.map(() => '?').join(',')})`, olds)
  for (const r of rows) out.push(updateStmt('characters', r.id, { species: LEGACY_SPECIES[r.species] }, at))
  const prefs = await db.getAll<{ id: string; avatar_json: string | null }>(`SELECT id, avatar_json FROM user_prefs WHERE avatar_json LIKE '%"char"%'`)
  for (const p of prefs) {
    const fixed = fixAvatarJson(p.avatar_json)
    if (fixed !== p.avatar_json) out.push(updateStmt('user_prefs', p.id, { avatar_json: fixed }, at))
  }
  return out
}
/** avatar_json 안 캐릭터 id만 새 종으로('{"kind":"char","id":"otter-3"}' → 'frog-3') */
export function fixAvatarJson(raw: string | null): string | null {
  if (!raw) return raw
  return raw.replace(/"id"\s*:\s*"(turtle|squirrel|cat|otter)-([1-5])"/, (_m, sp: string, st: string) => `"id":"${LEGACY_SPECIES[sp]}-${st}"`)
}

// ── 해금 상태 읽기 ──
/** 끝낸 프로젝트(31 프로젝트 = tags.kind 'project', 구성원 = projectMembers) — 열린 0 + 끝낸 3 이상 */
export async function loadFinishedProjects(db: CoreDb): Promise<FinishedProject[]> {
  const tags = await db.getAll<AtTag>(`SELECT id, name, kind, home_type, home_id FROM tags WHERE kind = 'project'`)
  if (!tags.length) return []
  const tasks = await db.getAll<PTask>('SELECT id, title, list_id, parent_id, status, due_at, start_at, completed_at, created_at, deleted_at FROM tasks WHERE deleted_at IS NULL')
  const links = await db.getAll<AtLink>('SELECT id, task_id, tag_id, source, state FROM task_tags')
  const lists = await db.getAll<AtList>('SELECT id, name, folder_id, kind FROM lists')
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out: FinishedProject[] = []
  for (const tag of tags) {
    const members = [...projectMembers(tag, tasks, links, lists)].map((id) => byId.get(id)!).filter(Boolean)
    const fin = projectFinished(members)
    if (fin.done) out.push({ id: tag.id, title: projectTitle(tag.name) || tag.name, day: fin.day })
  }
  return out
}
/** 오늘이 어느 프로젝트의 마감인가(하루 장면 "마감 날" — 31 projectDeadline) */
export async function loadProjectDeadlineToday(db: CoreDb, today: string): Promise<boolean> {
  const tags = await db.getAll<AtTag>(`SELECT id, name, kind, home_type, home_id FROM tags WHERE kind = 'project'`)
  if (!tags.length) return false
  const tasks = await db.getAll<PTask>('SELECT id, title, list_id, parent_id, status, due_at, start_at, completed_at, created_at, deleted_at FROM tasks WHERE deleted_at IS NULL')
  const links = await db.getAll<AtLink>('SELECT id, task_id, tag_id, source, state FROM task_tags')
  const lists = await db.getAll<AtList>('SELECT id, name, folder_id, kind FROM lists')
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return tags.some((tag) => {
    const members = [...projectMembers(tag, tasks, links, lists)].map((id) => byId.get(id)!).filter(Boolean)
    if (!members.some((m) => !m.status)) return false
    return projectDeadline(members)?.day === today
  })
}
/** 원장 + 프로젝트 → 해금 상태(레벨은 원장에서 계산 — 내려가지 않는다) */
export async function loadRaiseState(db: CoreDb): Promise<RaiseState> {
  const xp = await db.getAll<{ kind: string; amount: number; day: string; created_at: string }>('SELECT kind, amount, day, created_at FROM xp_events')
  const level = progressFromEvents(xp).level
  return raiseStateFrom(level, xp, await loadFinishedProjects(db))
}

// ── 쓰기 ──
/** 새로 열린 옷·트로피를 character_items에 넣는 문 + 넣은 행(새 옷 카드·트로피 말풍선용). 이미 있는 id는 건너뛴다 */
export async function planUnlocks(db: CoreDb, characterId: string, env: RaiseEnv, state?: RaiseState): Promise<{ stmts: Stmt[]; fresh: CharacterItemRow[]; state: RaiseState }> {
  const s = state ?? (await loadRaiseState(db))
  const have = await db.getAll<{ id: string }>('SELECT id FROM character_items WHERE character_id = ?', [characterId])
  const fresh = newUnlocks(characterId, s, have.map((r) => r.id))
  const at = nowOf(env)
  // 처음 열 때 이미 가진 것(Lv 1 풀밭 등)은 "새로 받음" 점 없이 넣는다: 받은 지 하루 넘은 것까지 점을 찍지 않으려고, 첫 동기화(행 0개)면 모두 본 것으로
  const first = have.length === 0
  return { stmts: fresh.map((r) => insertStmt('character_items', { ...r, owner_id: env.owner, earned_at: at, seen_at: first ? at : null }, at)), fresh: first ? [] : fresh, state: s }
}
/** 입힌 모습 저장(characters.look_json) */
export const planSaveLook = (characterId: string, look: Look, env: RaiseEnv): Stmt[] => [updateStmt('characters', characterId, { look_json: serializeLook(look) }, nowOf(env))]
/** "새로 받음" 점 지우기(옷장 탭·칸을 보면) */
export function planMarkSeen(ids: string[], env: RaiseEnv): Stmt[] {
  const at = nowOf(env)
  return ids.map((id) => updateStmt('character_items', id, { seen_at: at }, at))
}

/** 받은 것 표(옷장·도감·선반이 읽는다) */
export type CharacterItem = CharacterItemRow & { earned_at: string | null; seen_at: string | null }
export const CHARACTER_ITEMS_SQL = 'SELECT id, character_id, item_id, kind, source, ref_id, title, earned_at, seen_at FROM character_items WHERE character_id = ? ORDER BY earned_at, id'
