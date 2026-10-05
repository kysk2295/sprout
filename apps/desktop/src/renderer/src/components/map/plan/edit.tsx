// 31 §12.9 프로젝트 편집 공용 — 타임라인·관계도가 같이 쓰는 동작(토스트 + Cmd+Z 되돌리기)과 할 일 우클릭 메뉴.
import { useMemo } from 'react'
import { WORK_KINDS, WORK_LABEL, type WorkKind } from '@sprout/schema/projects'
import { addToProject, removeFromProject } from '../../../data/projects'
import {
  addProjectTask, flipOrder, moveToProject, linkNote, linkOrder, linkPerson, linkPersonToProject, linkRelated, orderToRelated, relatedToOrder, renameTask, setWorkKind,
  unlinkAllOrders, unlinkNote, unlinkOrder, unlinkPerson, unlinkRelation, type LinkResult, type Undo
} from '../../../data/projectEdit'
import { snapshot } from '../../../data/mutations'
import { dayKey } from '../../../lib/dates'
import { eulReul } from '../../../lib/josa'
import type { DragChange } from '../../../lib/calendarDrag'
import type { TaskActions } from '../../../lib/taskActions'
import { MenuItem, Popover, SubMenu } from '../../Popover'
import { useToast } from '../../Toast'
import type { ProjectView, PTaskRow } from './useProjects'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const obj = (t: string) => `'${t.length > 18 ? `${t.slice(0, 18)}…` : t}'${eulReul(t).slice(t.length)}`
const LINK_MSG: Record<LinkResult['result'], string> = { ok: '순서를 이었어요', cycle: '순서가 돌고 돌아서 이을 수 없어요', exists: '이미 이어져 있어요', self: '' }

/** 프로젝트 편집 동작 — 모두 토스트(되돌리기)·Cmd+Z */
export function useProjectEdit(p: ProjectView, actions: TaskActions) {
  const toast = useToast()
  return useMemo(() => {
    const say = (msg: string, undo?: Undo) => { if (msg) toast.show(msg, undo) }
    const linkSay = (r: LinkResult) => say(LINK_MSG[r.result], r.result === 'ok' ? r.undo : undefined)
    return {
      /** 칩 끌기: 날짜(캘린더 reschedule 같은 길) + 일의 종류 — 한 번의 되돌리기 */
      async move(t: PTaskRow, change: DragChange | null, kind: WorkKind | null) {
        if (!change && !kind) return
        const undos: Undo[] = []
        if (change) {
          undos.push(await snapshot([t.id], ['start_at', 'due_at', 'is_all_day']))
          await actions.reschedule([change])
        }
        if (kind) undos.push(await setWorkKind(t.id, kind))
        const parts = [change ? (change.due_at ? `날짜를 ${md(change.due_at)}로` : '날짜를 지우고') : '', kind ? `${WORK_LABEL[kind]} 줄로` : ''].filter(Boolean)
        say(`${parts.join(' ')} ${change && !kind ? '바꿨어요' : '옮겼어요'}`.replace('지우고 바꿨어요', '지웠어요'), async () => { for (const u of undos.reverse()) await u() })
      },
      async setKind(t: PTaskRow, kind: WorkKind | null) { say(kind ? `${WORK_LABEL[kind]} 줄로 옮겼어요` : '일의 종류를 자동으로 돌렸어요', await setWorkKind(t.id, kind)) },
      async order(from: string, to: string) { linkSay(await linkOrder(from, to)) },
      async unorder(linkId: string) { say('순서를 끊었어요', await unlinkOrder(linkId)) },
      async flip(linkId: string) { const r = await flipOrder(linkId); say(r.result === 'ok' ? '방향을 바꿨어요' : LINK_MSG[r.result], r.result === 'ok' ? r.undo : undefined) },
      async related(a: string, b: string) { const r = await linkRelated(a, b); say(r.result === 'ok' ? '관련으로 이었어요' : r.result === 'exists' ? '이미 이어져 있어요' : '', r.undo) },
      async unrelate(relId: string) { say('관계를 끊었어요', await unlinkRelation(relId)) },
      async toRelated(linkId: string, from: string, to: string) { say('관련 선으로 바꿨어요', await orderToRelated(linkId, from, to)) },
      async toOrder(relId: string, from: string, to: string) { const r = await relatedToOrder(relId, from, to); say(r.result === 'ok' ? '먼저 해야 함으로 바꿨어요' : LINK_MSG[r.result], r.result === 'ok' ? r.undo : undefined) },
      async unorderAll(t: PTaskRow) { const r = await unlinkAllOrders(t.id); say(r.n ? `순서 선 ${r.n}개를 끊었어요` : '끊을 순서 선이 없어요', r.n ? r.undo : undefined) },
      async person(taskId: string, personId: string, name: string) { say(`👤 ${name}${eulReul(name).slice(name.length)} 붙였어요`, await linkPerson(taskId, personId)) },
      async unperson(taskId: string, personId: string) { say('사람 연결을 끊었어요', await unlinkPerson(taskId, personId)) },
      async projectPerson(personId: string, name: string) { say(`👤 ${name}${eulReul(name).slice(name.length)} 프로젝트에 이었어요`, await linkPersonToProject(p.tag.id, personId)) },
      async note(noteId: string, to: { type: 'task' | 'tag'; id: string }) { say('메모를 이었어요', await linkNote(noteId, to)) },
      async unnote(noteId: string, toId: string) { say('메모 연결을 끊었어요', await unlinkNote(noteId, toId)) },
      async out(t: PTaskRow) { say(`${obj(t.title)} 프로젝트에서 뺐어요`, await removeFromProject(t.id, p.tag.id)) },
      async add(ids: string[]) { if (ids.length) say(`${ids.length}개를 '${p.title}'에 넣었어요`, await addToProject(ids, p.tag.id)) },
      async moveTo(t: PTaskRow, to: ProjectView) { say(`${obj(t.title)} '${to.title}'(으)로 옮겼어요`, await moveToProject(t.id, p.tag.id, to.tag.id)) },
      async confirm(t: PTaskRow) { say(`${obj(t.title)} 확인했어요`, await addToProject([t.id], p.tag.id)) },
      async create(title: string, day: string | null, kind: WorkKind | null, parentId: string | null = null) {
        if (!title.trim()) return null
        const r = await addProjectTask({ title, projectTagId: p.tag.id, listId: p.mainList, day, kind, parentId })
        say('새 할 일을 넣었어요', r.undo)
        return r.id
      },
      async rename(t: PTaskRow, title: string) { if (title.trim() && title.trim() !== t.title) { const u = await renameTask(t.id, title); toast.registerUndo(u) } },
      async complete(t: PTaskRow) { if (t.status === 0) await actions.complete([t.id]); else await actions.reopen([t.id]) },
      async date(t: PTaskRow, day: string | null) { await actions.moveDates([t.id], day, day ? `날짜를 ${md(day)}로 바꿨어요` : '날짜를 지웠어요') }
    }
  }, [p, actions, toast])
}
export type ProjectEdit = ReturnType<typeof useProjectEdit>

const nextMonday = () => { const d = new Date(); const n = ((8 - d.getDay()) % 7) || 7; return dayKey(n) }

/** 할 일 우클릭 메뉴(타임라인·관계도 같음, §12.9.4) */
export function ProjectTaskMenu({ t, p, edit, point, onOpen, onClose, onRename, all = [] }: {
  t: PTaskRow; p: ProjectView; edit: ProjectEdit; point: { x: number; y: number }; onOpen: () => void; onClose: () => void; onRename?: () => void
  /** 같은 분류 다른 프로젝트로 옮기기(§12.10.3) */
  all?: ProjectView[]
}) {
  const siblings = all.filter((o) => o.tag.id !== p.tag.id && !o.finished && (p.category ? o.category === p.category : true))
  const go = (f: () => unknown) => () => { onClose(); void f() }
  const kind = p.kindOf.get(t.id)
  const manual = p.kindSet.has(t.id)
  return (
    <Popover point={point} onClose={onClose} className="menu" width={200}>
      <MenuItem label="열기" onClick={go(onOpen)} />
      {onRename && <MenuItem label="이름 바꾸기" onClick={go(onRename)} />}
      <MenuItem label={t.status === 0 ? '완료' : '완료 취소'} onClick={go(() => edit.complete(t))} />
      <SubMenu label="날짜" width={170}>
        <MenuItem label="오늘" onClick={go(() => edit.date(t, dayKey()))} />
        <MenuItem label="내일" onClick={go(() => edit.date(t, dayKey(1)))} />
        <MenuItem label="다음 주 월요일" onClick={go(() => edit.date(t, nextMonday()))} />
        <div className="menu__divider" />
        <MenuItem label="날짜 지우기" onClick={go(() => edit.date(t, null))} disabled={!t.due_at && !t.start_at} />
      </SubMenu>
      <SubMenu label="일의 종류" width={170}>
        {WORK_KINDS.map((k) => <MenuItem key={k} label={WORK_LABEL[k]} active={kind === k} onClick={go(() => edit.setKind(t, k))} />)}
        <div className="menu__divider" />
        <MenuItem label="자동으로" disabled={!manual} onClick={go(() => edit.setKind(t, null))} />
      </SubMenu>
      <MenuItem label="관계 끊기" onClick={go(() => edit.unorderAll(t))} />
      {siblings.length > 0 && (
        <SubMenu label={p.category ? `다른 ${p.category}(으)로 옮기기` : '다른 프로젝트로 옮기기'} width={240}>
          {siblings.slice(0, 12).map((o) => <MenuItem key={o.tag.id} label={o.title} onClick={go(() => edit.moveTo(t, o))} />)}
        </SubMenu>
      )}
      {p.via.get(t.id) === 'auto' && <MenuItem label="✓ 맞아(프로젝트에 둠)" onClick={go(() => edit.confirm(t))} />}
      <div className="menu__divider" />
      <MenuItem label="프로젝트에서 빼기" danger onClick={go(() => edit.out(t))} />
    </Popover>
  )
}
