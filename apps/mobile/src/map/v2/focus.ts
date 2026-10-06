// 31 §12.13 휴대폰 — 지금 집중(카드 길게 누름 메뉴 · 빠른 입력 칩) · 팀원(같이 계획 짜기 프로젝트 만들기).
// 규칙은 공용 @sprout/schema/projectScore(focusApplies · splitPeople). 행 모양은 데스크톱 data/projectEdit와 같다(relations).
// 휴대폰은 점수로 넣기·묻기를 하지 않는다(29 §9.1 — 자동 패스는 데스크톱만).
import { tagKey } from '@sprout/schema/autoTag'
import { projectEnded } from '@sprout/schema/planView'
import { focusApplies } from '@sprout/schema/projectScore'
import { deleteStmt } from '@sprout/schema/taskCore'
import { relationId } from '@sprout/schema/wikiLink'
import { useMemo } from 'react'
import { db, run } from '../../data/db'
import { insert, update } from '../../data/tasks'
import { dayKey } from '../../lib/dates'
import { usePlanData } from './plan'

type Undo = () => Promise<void>
type Rel = Record<string, unknown> & { id: string }
export const focusRelId = (projectTagId: string) => relationId(projectTagId, 'focus', 'focus')
const snap = async (ids: string[]): Promise<Undo> => {
  if (!ids.length) return async () => {}
  const rows = await db.getAll<Rel>(`SELECT * FROM relations WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  return async () => { await run([...ids.map((id) => deleteStmt('relations', id)), ...rows.map(({ owner_id: _o, ...r }) => insert('relations', r))]) }
}

/** 지금 집중: 한 번에 하나(켜면 다른 집중 행은 지움). null = 끄기 */
export async function setFocus(projectTagId: string | null): Promise<Undo> {
  const rows = await db.getAll<{ id: string }>("SELECT id FROM relations WHERE from_type = 'tag' AND to_type = 'focus'")
  const undo = await snap([...new Set([...rows.map((r) => r.id), ...(projectTagId ? [focusRelId(projectTagId)] : [])])])
  await run([...rows.map((r) => deleteStmt('relations', r.id)),
    ...(projectTagId ? [insert('relations', { id: focusRelId(projectTagId), from_type: 'tag', from_id: projectTagId, to_type: 'focus', to_id: 'focus', source: 'manual', state: 'accepted', field: 'focus' })] : [])])
  return undo
}

/** 팀원 이름들 → 사람 태그(찾거나 만들기, source user) + 프로젝트와 잇기(relations tag→tag field project) */
export async function linkTeam(projectTagId: string, names: string[]): Promise<void> {
  if (!names.length) return
  const tags = await db.getAll<{ id: string; name: string; kind: string | null }>('SELECT id, name, kind FROM tags')
  for (const n of names) {
    const hit = tags.find((t) => tagKey(t.name) === tagKey(n))
    let id = hit?.id
    if (hit && hit.kind !== 'person') await run([update('tags', hit.id, { kind: 'person' })])
    if (!id) {
      id = crypto.randomUUID()
      await run([insert('tags', { id, name: n, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'person', aliases: null, source: 'user', run_id: null })])
      tags.push({ id, name: n, kind: 'person' })
    }
    const rid = relationId(projectTagId, id, 'project')
    await run([deleteStmt('relations', rid), insert('relations', { id: rid, from_type: 'tag', from_id: projectTagId, to_type: 'tag', to_id: id, source: 'manual', state: 'accepted', field: 'project' })])
  }
}

/** 빠른 입력 집중 칩: 붙일 프로젝트({ id, name }) 또는 null. 인식 결과(#태그 · ~리스트)로 다른 곳이 분명하면 null */
export function useFocusChip(q: { title: string; tag_ids?: string[]; list_id?: string | null }): { id: string; name: string } | null {
  const plan = usePlanData()
  const today = dayKey()
  const key = `${q.title}|${(q.tag_ids ?? []).join(',')}|${q.list_id ?? ''}`
  return useMemo(() => {
    const f = plan.projects.find((p) => p.focus)
    if (!f) return null
    const lists = [...new Set([...f.lists.map((l) => l.id), ...(f.mainList ? [f.mainList] : []), ...(f.tag.home_type === 'list' && f.tag.home_id ? [f.tag.home_id] : [])])]
    const others = plan.projects.map((p) => ({ id: p.tag.id, name: p.tag.name, aliases: p.tag.aliases, ended: projectEnded(p, today) }))
    return focusApplies({ id: f.tag.id, name: f.title, ended: projectEnded(f, today), lists }, q, others) ? { id: f.tag.id, name: f.title } : null
  }, [plan.projects, today, key]) // eslint-disable-line react-hooks/exhaustive-deps
}
