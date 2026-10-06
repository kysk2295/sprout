// 31 §12.9 프로젝트 편집 공용 — 타임라인·관계도가 같이 쓰는 동작(토스트 + Cmd+Z 되돌리기)과 할 일 우클릭 메뉴.
import { useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { WORK_KINDS, WORK_LABEL, type WorkKind } from '@sprout/schema/projects'
import { NO_LANE, projectTaskInput, shiftDates, takeDayRange } from '@sprout/schema/planView'
import { addLane, moveToLane } from '../../../data/projectDirect'
import { addToProject, removeFromProject } from '../../../data/projects'
import {
  addProjectTask, flipOrder, moveToProject, linkNote, linkOrder, linkPerson, linkPersonToProject, linkRelated, orderToRelated, relatedToOrder, renameTask, setWorkKind,
  unlinkAllOrders, unlinkNote, unlinkOrder, unlinkPerson, unlinkRelation, type LinkResult, type Undo
} from '../../../data/projectEdit'
import { now, snapshot, updateTasks, withDescendants } from '../../../data/mutations'
import { useQuery } from '../../../data/useQuery'
export { pickNext } from '../../../lib/projectEdit'
import { parseAdd } from '../../../lib/addParse'
import { PriorityRow } from '../../Pickers'
import { dayKey } from '../../../lib/dates'
import { eulReul } from '../../../lib/josa'
import type { DragChange } from '../../../lib/calendarDrag'
import type { Schedule, TaskActions } from '../../../lib/taskActions'
import { MenuItem, Popover, SubMenu } from '../../Popover'
import { useToast } from '../../Toast'
import type { ProjectView, PTaskRow } from './useProjects'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const obj = (t: string) => `'${t.length > 18 ? `${t.slice(0, 18)}…` : t}'${eulReul(t).slice(t.length)}`
const LINK_MSG: Record<LinkResult['result'], string> = { ok: '순서를 이었어요', cycle: '순서가 돌고 돌아서 이을 수 없어요', exists: '이미 이어져 있어요', self: '' }

/** 프로젝트 편집 동작 — 모두 토스트(되돌리기)·Cmd+Z */
const LISTS_SQL = "SELECT id, name, kind FROM lists WHERE archived_at IS NULL"
const TAGS_SQL = "SELECT id, name FROM tags WHERE name IS NOT NULL AND name != ''"
/** 31 §12.12 빠른 추가 인식에 쓰는 리스트·태그 이름 */
export function useQuickSources() {
  const lists = useQuery<{ id: string; name: string; kind: string | null }>(LISTS_SQL)
  const tags = useQuery<{ id: string; name: string }>(TAGS_SQL)
  return useMemo(() => ({
    lists: (lists ?? []).map((l) => ({ id: l.id, name: l.kind === 'inbox' ? '기본함' : l.name })),
    tags: tags ?? []
  }), [lists, tags])
}
/** 빠른 추가 인식(입력 강조·제목) — 날짜 문구는 제목에서 뺀다(02 빠른 추가와 같음) */
export const quickParse = (raw: string, src: ReturnType<typeof useQuickSources>) => parseAdd(raw, src.lists, src.tags, { keepDate: false })

export function useProjectEdit(p: ProjectView, actions: TaskActions) {
  const toast = useToast()
  const src = useQuickSources()
  return useMemo(() => {
    const say = (msg: string, undo?: Undo) => { if (msg) toast.show(msg, undo) }
    const laneName = (id: string) => p.tagLanes.lanes.find((l) => l.id === id)?.name ?? ''
    const linkSay = (r: LinkResult) => say(LINK_MSG[r.result], r.result === 'ok' ? r.undo : undefined)
    const api = {
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
      /** 41 §5·§6 칩(또는 고른 칩 모두) 끌기: 날짜(같은 날 수) + 줄(종류 덮어쓰기 · 태그 바꾸기) — 되돌리기 하나 */
      async moveMany(ts: PTaskRow[], changes: DragChange[], lane: { kind?: WorkKind | null; tag?: string | null }) {
        const undos: Undo[] = []
        if (changes.length) {
          undos.push(await snapshot(changes.map((c) => c.id), ['start_at', 'due_at', 'is_all_day']))
          await actions.reschedule(changes)
        }
        if (lane.kind) for (const t of ts) if (p.kindOf.get(t.id) !== lane.kind) undos.push(await setWorkKind(t.id, lane.kind))
        let laneMsg = ''
        if (lane.tag) {
          const moves = ts.filter((t) => (p.tagLanes.laneOf.get(t.id) ?? NO_LANE) !== lane.tag).map((t) => ({ id: t.id, tags: p.tagLanes.tagsOf.get(t.id) ?? [], from: p.tagLanes.laneOf.get(t.id) ?? NO_LANE }))
          if (moves.length) { undos.push(await moveToLane(moves, lane.tag)); laneMsg = lane.tag === NO_LANE ? '줄 태그를 뗐어요' : `'#${laneName(lane.tag)}' 태그를 붙였어요` }
        }
        if (!undos.length) return
        const n = ts.length > 1 ? `${ts.length}개 ` : ''
        const dateMsg = changes.length ? (changes.length === 1 && ts.length === 1 ? (changes[0].due_at ? `날짜를 ${md(changes[0].due_at)}로 바꿨어요` : '날짜를 지웠어요') : `${n}날짜를 옮겼어요`) : ''
        const kindMsg = lane.kind ? `${n}${WORK_LABEL[lane.kind]} 줄로 옮겼어요` : ''
        say([dateMsg, kindMsg, laneMsg].filter(Boolean).join(' · ') || '옮겼어요', async () => { for (const u of undos.reverse()) await u() })
      },
      /** 41 §5 칩 끝 끌기(기간) */
      async resize(change: DragChange) {
        const restore = await snapshot([change.id], ['start_at', 'due_at', 'is_all_day'])
        await actions.reschedule([change])
        say(change.start_at ? `${md(change.start_at)}–${md(change.due_at!)}로 바꿨어요` : `${md(change.due_at!)} 하루로 바꿨어요`, restore)
      },
      /** 41 §6 미루기·날짜 고르기(간격 그대로) */
      async shift(ts: PTaskRow[], how: { days: number } | { anchor: string }) {
        const ch = shiftDates(ts, how)
        if (!ch.length) { say('옮길 날짜가 있는 열린 일이 없어요'); return }
        const restore = await snapshot(ch.map((c) => c.id), ['start_at', 'due_at', 'is_all_day'])
        await actions.reschedule(ch)
        say('days' in how ? `${ch.length}개를 ${how.days === 7 ? '일주일' : how.days === 1 ? '하루' : `${how.days}일`} 미뤘어요` : `${ch.length}개를 옮겼어요 · 간격은 그대로예요`, restore)
      },
      /** 41 §6 태그 › · §4.3 줄로 보내기 */
      async toLane(ts: PTaskRow[], to: string) { await api.moveMany(ts, [], { tag: to }) },
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
      async out(t: PTaskRow) { say(`${obj(t.title)} 프로젝트에서 뺐어요 · 리스트엔 그대로예요`, await removeFromProject(t.id, p.tag.id)) },
      /** 31 §12.12.2 여러 개 프로젝트에서 빼기(연결만 끊음) — 되돌리기 하나 */
      async outMany(ts: PTaskRow[]) {
        if (ts.length === 1) { say(`${obj(ts[0].title)} 프로젝트에서 뺐어요 · 리스트엔 그대로예요`, await removeFromProject(ts[0].id, p.tag.id)); return }
        const undos: Undo[] = []
        for (const t of ts) undos.push(await removeFromProject(t.id, p.tag.id))
        say(`${ts.length}개를 프로젝트에서 뺐어요 · 리스트엔 그대로예요`, async () => { for (const u of undos.reverse()) await u() })
      },
      /** 31 §12.12.2 삭제 = 휴지통(하위 함께, 목록 삭제와 같음) + 되돌리기. 확인 창 없음 */
      async trash(ts: PTaskRow[]) {
        if (!ts.length) return
        const all = await withDescendants(ts.map((t) => t.id))
        const restore = await snapshot(all, ['deleted_at'])
        await updateTasks(all, { deleted_at: now() })
        say(ts.length > 1 ? `${ts.length}개를 휴지통으로 옮겼어요` : '휴지통으로 옮겼어요', restore)
      },
      async priority(ts: PTaskRow[], v: number) { await actions.setPriority(ts.map((t) => t.id), v) },
      async completeMany(ts: PTaskRow[]) { const open = ts.filter((t) => t.status === 0).map((t) => t.id); if (open.length) await actions.complete(open); else await actions.reopen(ts.map((t) => t.id)) },
      async dateMany(ts: PTaskRow[], day: string | null) { await actions.moveDates(ts.map((t) => t.id), day, day ? `날짜를 ${md(day)}로 바꿨어요` : '날짜를 지웠어요') },
      /** 31 §12.12.1 빠른 추가: 인식(날짜·시각·반복·!·#·~) + 자리 기본값(날짜·줄·부모) → 프로젝트에 새 할 일(주 리스트, 없으면 기본함) */
      async quick(raw: string, at: { day?: string | null; kind?: WorkKind | null; parentId?: string | null; laneTag?: string | null } = {}) {
        // 41 §5 `1회독 10/12~10/18`(기간) · `세제 암기 카드 10/20`(M/D)은 빠른 추가 인식 앞에서 떼어 둔다
        const range = takeDayRange(raw, dayKey())
        const parsed = quickParse(range ? range.rest : raw, src)
        const undos: Undo[] = []
        let laneTag = at.laneTag ?? null
        // 41 §4.3 없는 `#새태그`: 줄 안이면 그 줄이 생기고 그 줄로 간다(태그 줄 보기). 그 밖엔 보통 태그로 만들어 붙인다
        const tagIds = [...(parsed.tag_ids ?? [])]
        for (const name of parsed.newTags ?? []) {
          const made = await addLane(p.tag.id, name, { lane: at.laneTag !== undefined })
          if (!made) continue
          undos.push(made.undo)
          if (at.laneTag !== undefined && !tagIds.length) laneTag = made.tagId
          else tagIds.push(made.tagId)
        }
        parsed.tag_ids = tagIds
        const input = projectTaskInput({ ...parsed, due_at: range ? (parsed.due_at && parsed.due_at.includes('T') ? `${range.end}${parsed.due_at.slice(10)}` : range.end) : parsed.due_at, start_at: range?.start ?? null },
          { day: at.day ?? null, kind: at.kind ?? null, mainList: p.mainList, laneTag })
        if (!input) return null
        const r = await addProjectTask({ title: input.title, projectTagId: p.tag.id, listId: input.list_id, day: input.due_at, startAt: input.start_at, kind: input.kind, parentId: at.parentId ?? null, priority: input.priority, repeatRule: input.repeat_rule, tagIds: input.tag_ids })
          .catch((e) => { toast.show('할 일을 저장하지 못했어요. 다시 시도해 주세요.'); throw e })
        say(`${obj(input.title)} 넣었어요`, async () => { await r.undo(); for (const u of undos.reverse()) await u() })
        return r.id
      },
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
      async date(t: PTaskRow, day: string | null) { await actions.moveDates([t.id], day, day ? `날짜를 ${md(day)}로 바꿨어요` : '날짜를 지웠어요') },
      /** 날짜 팝오버 `시각·반복 ›`(03 날짜 고르기 그대로) */
      async schedule(t: PTaskRow, s: Schedule) { await actions.applySchedule([t.id], s) }
    }
    return api
  }, [p, actions, toast, src])
}
export type ProjectEdit = ReturnType<typeof useProjectEdit>

const nextMonday = () => { const d = new Date(); const n = ((8 - d.getDay()) % 7) || 7; return dayKey(n) }

/** 할 일 우클릭·⋯ 메뉴(세 보기 같음, §12.9.4 · §12.12.2). 여러 개를 고른 채 열면 `many`에 고른 것 전체 */
export function ProjectTaskMenu({ t, p, edit, point, onOpen, onClose, onRename, all = [], many, extra }: {
  t: PTaskRow; p: ProjectView; edit: ProjectEdit; point: { x: number; y: number }; onOpen: () => void; onClose: () => void; onRename?: () => void
  /** 같은 분류 다른 프로젝트로 옮기기(§12.10.3) */
  all?: ProjectView[]
  /** 고른 것(2개 이상이면 메뉴가 전체에) */
  many?: PTaskRow[]
  /** 보기마다 더하는 항목(단계 보드 `단계에서 빼기`) — 빼기·삭제 위에 */
  extra?: React.ReactNode
}) {
  const ts = many && many.length > 1 && many.some((m) => m.id === t.id) ? many : [t]
  const multi = ts.length > 1
  const siblings = all.filter((o) => o.tag.id !== p.tag.id && !o.finished && (p.category ? o.category === p.category : true))
  const go = (f: () => unknown) => () => { onClose(); void f() }
  const kind = p.kindOf.get(t.id)
  const manual = p.kindSet.has(t.id)
  const allDone = ts.every((x) => x.status !== 0)
  return (
    <Popover point={point} onClose={onClose} className="menu" width={230}>
      {multi && <div className="menu__caption">{ts.length}개 고름</div>}
      {!multi && <MenuItem label="열기" onClick={go(onOpen)} />}
      {!multi && onRename && <MenuItem label="이름 바꾸기" onClick={go(onRename)} />}
      <MenuItem label={allDone ? '완료 취소' : '완료'} onClick={go(() => edit.completeMany(ts))} />
      <SubMenu label="날짜" width={170}>
        <MenuItem label="오늘" onClick={go(() => edit.dateMany(ts, dayKey()))} />
        <MenuItem label="내일" onClick={go(() => edit.dateMany(ts, dayKey(1)))} />
        <MenuItem label="다음 주 월요일" onClick={go(() => edit.dateMany(ts, nextMonday()))} />
        <div className="menu__divider" />
        <MenuItem label="날짜 지우기" onClick={go(() => edit.dateMany(ts, null))} disabled={ts.every((x) => !x.due_at && !x.start_at)} />
      </SubMenu>
      <PriorityRow value={multi ? undefined : (t.priority ?? 0)} onPick={(v) => { onClose(); void edit.priority(ts, v) }} />
      <div className="menu__divider" />
      {!multi && <SubMenu label="일의 종류" width={170}>
        {WORK_KINDS.map((k) => <MenuItem key={k} label={WORK_LABEL[k]} active={kind === k} onClick={go(() => edit.setKind(t, k))} />)}
        <div className="menu__divider" />
        <MenuItem label="자동으로" disabled={!manual} onClick={go(() => edit.setKind(t, null))} />
      </SubMenu>}
      {!multi && <MenuItem label="관계 끊기" onClick={go(() => edit.unorderAll(t))} />}
      {!multi && siblings.length > 0 && (
        <SubMenu label={p.category ? `다른 ${p.category}(으)로 옮기기` : '다른 프로젝트로 옮기기'} width={240}>
          {siblings.slice(0, 12).map((o) => <MenuItem key={o.tag.id} label={o.title} onClick={go(() => edit.moveTo(t, o))} />)}
        </SubMenu>
      )}
      {!multi && p.via.get(t.id) === 'auto' && <MenuItem label="✓ 맞아(프로젝트에 둠)" onClick={go(() => edit.confirm(t))} />}
      {extra}
      <div className="menu__divider" />
      <MenuItem label={multi ? `${ts.length}개 프로젝트에서 빼기` : '프로젝트에서 빼기'} trail={<small className="plan-mnote">리스트엔 남아요</small>} onClick={go(() => edit.outMany(ts))} />
      <MenuItem label={multi ? `${ts.length}개 삭제` : '삭제'} danger trail={<small className="plan-mnote">휴지통으로</small>} onClick={go(() => edit.trash(ts))} />
    </Popover>
  )
}

/** 31 §12.12.1 프로젝트 빠른 추가 입력칸 — Enter = 만들고 비운 채 남음(틱틱 빠른 추가), Esc·빈 채로 벗어나기 = 닫기.
 * 인식한 날짜·#·~·! 를 입력 아래 회색 알약으로 보여 준다 */
export function QuickAddInput({ placeholder, onSubmit, onClose, className = '', autoFocus = true, style }: {
  placeholder: string; onSubmit: (raw: string) => Promise<unknown>; onClose: () => void; className?: string; autoFocus?: boolean; style?: React.CSSProperties
}) {
  const [raw, setRaw] = useState('')
  const busy = useRef(false)
  const src = useQuickSources()
  const parsed = raw.trim() ? quickParse(raw, src) : null
  const chips = parsed ? parsed.tokens.filter(Boolean) : []
  const submit = async () => {
    const v = raw.trim()
    if (!v) { onClose(); return }
    if (busy.current) return
    busy.current = true
    try { await onSubmit(v); setRaw('') } finally { busy.current = false }
  }
  return (
    <div className={`plan-qa ${className}`} style={style} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <Plus className="plan-qa__ic" />
      <input autoFocus={autoFocus} value={raw} placeholder={placeholder} aria-label={placeholder} spellCheck={false}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') { e.preventDefault(); void submit() }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
        }}
        onBlur={() => { if (!raw.trim() && !busy.current) onClose() }} />
      {chips.length > 0 && <span className="plan-qa__chips">{chips.slice(0, 3).map((c) => <em key={c}>{c}</em>)}</span>}
    </div>
  )
}
