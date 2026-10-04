import { insert, remove, run, update, uuid } from './mutations'

// 02 §0 섹션: 일반 리스트의 사용자 설정 그룹. 삭제하면 그 안의 태스크는 미분류(section_id 없음)로 간다.
export async function createSection(listId: string, name: string, sortOrder: number) {
  const id = uuid()
  await run(insert('sections', { id, list_id: listId, name, sort_order: sortOrder }))
  return id
}
export const renameSection = (id: string, name: string) => run(update('sections', id, { name }))
export async function deleteSection(id: string, taskIds: string[]) {
  await run(...taskIds.map((t) => update('tasks', t, { section_id: null })), remove('sections', id))
}
