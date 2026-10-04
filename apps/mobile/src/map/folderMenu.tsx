// 폴더·리스트 ⋯ 메뉴(29 §4 — 2026-10-05 결정: 폴더 › 리스트 구조, 사용자가 직접 고친다)
// 폴더: 이름 바꾸기 · 새 리스트 · 그룹 해제(리스트는 맨 위로) / 리스트: 이름 바꾸기 · 보관. 쓰기는 공용 organization.ts(데스크톱과 같은 규칙).
import { run } from '../data/db'
import { archiveList, saveFolder, saveList, ungroupFolder } from '../data/organization'
import { update } from '../data/tasks'
import type { MenuItem } from '../ui/Menu'
import { useToast } from '../ui/Toast'
import type { DialogSpec } from './Dialog'
import type { MapFolder, MapList } from './logic'

export function useFolderMenu(setDialog: (d: DialogSpec | null) => void) {
  const toast = useToast()
  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : '바꾸지 못했어요', { error: true })
  const newList = (folderId: string | null, title = '새로운 리스트') => setDialog({
    title, input: { placeholder: '리스트 이름' }, confirm: '만들기',
    onConfirm: async (v) => { try { await saveList(null, { name: v, emoji: null, color: null, folder_id: folderId, show_in_smart: 'all' }) } catch (e) { fail(e) } }
  })
  const newFolder = () => setDialog({
    title: '새 폴더', input: { placeholder: '폴더 이름' }, confirm: '만들기',
    onConfirm: async (v) => { try { await saveFolder(null, v) } catch (e) { fail(e) } }
  })
  const folder = (f: MapFolder): MenuItem[] => [
    { key: 'rename', label: '이름 바꾸기', onPress: () => setDialog({ title: '폴더 이름', input: { initial: f.name, placeholder: '폴더 이름' }, confirm: '저장', onConfirm: async (v) => { try { await saveFolder(f.id, v) } catch (e) { fail(e) } } }) },
    { key: 'list', label: '새 리스트', onPress: () => newList(f.id, `'${f.name}'에 새 리스트`) },
    { key: 'ungroup', label: '그룹 해제', danger: true, onPress: () => setDialog({ title: `'${f.name}' 폴더를 풀까요?`, message: '안의 리스트는 그대로 두고 폴더만 없어져요.', confirm: '그룹 해제', danger: true, onConfirm: async () => { await ungroupFolder(f.id); toast.show('폴더를 풀었어요') } }) }
  ]
  const list = (l: MapList, after?: () => void): MenuItem[] => l.kind === 'inbox' ? [] : [
    { key: 'rename', label: '이름 바꾸기', onPress: () => setDialog({ title: '리스트 이름', input: { initial: l.name, placeholder: '리스트 이름' }, confirm: '저장', onConfirm: async (v) => { const name = v.trim(); if (!name) return; await run([update('lists', l.id, { name })]) } }) },
    { key: 'archive', label: '보관', onPress: () => void archiveList(l.id, true).then(() => { toast.show('리스트를 보관했어요'); after?.() }, fail) }
  ]
  return { folder, list, newList, newFolder }
}
