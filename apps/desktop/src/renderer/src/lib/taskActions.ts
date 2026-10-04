import { grantTaskXp, revokeTaskXp } from '../data/growth'
import { useMemo } from 'react'
import { addDays, datePart, daysBetween, nextOccurrence, parseRule, stringifyRule } from '@sprout/schema/time'
import { useToast } from '../components/Toast'
import { getDb, type Row, type Stmt } from '../data/db'
import {
  createTask, deleteTasksHard, insert, now, remove, run, setTag, snapshot, update, updateTasks, uuid, withDescendants
} from '../data/mutations'
import { dayKey, moveToDate, shiftSpan, withRo, type Span } from './dates'
import { playCompleteSound } from './sound'

// 태스크에 하는 동작 모음. 목록·우클릭 메뉴·일괄 편집·상세·단축키·날짜 선택기가 모두 이것을 쓴다.
// 되돌릴 수 있는 동작은 토스트 ⟲ 와 Cmd+Z로 되돌린다(02 §7·§12).
const DATE_FIELDS = ['start_at', 'due_at', 'is_all_day', 'repeat_rule', 'repeat_from']
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')

/** 날짜 선택기가 저장하는 값(03 §3·§4) */
export interface Schedule {
  start_at: string | null
  due_at: string | null
  is_all_day: number
  repeat_rule: string | null
  repeat_from: string | null
  reminders: string[]
}

/** 날짜·반복 필드와 알림 행을 함께 떠 두고 되돌린다 */
async function snapshotSchedule(ids: string[]): Promise<() => Promise<void>> {
  const db = await getDb()
  const restoreTasks = await snapshot(ids, DATE_FIELDS)
  const reminders = await db.getAll<Row>(`SELECT id, task_id, trigger FROM reminders WHERE task_id IN (${marks(ids.length)})`, ids)
  return async () => {
    await restoreTasks()
    const now = await db.getAll<{ id: string }>(`SELECT id FROM reminders WHERE task_id IN (${marks(ids.length)})`, ids)
    await run(...now.map((r) => remove('reminders', r.id)), ...reminders.map((r) => insert('reminders', { id: r.id, task_id: r.task_id, trigger: r.trigger })))
  }
}

export function useTaskActions() {
  const toast = useToast()
  return useMemo(() => {
    const undoable = async (ids: string[], fields: string[], apply: () => Promise<unknown>, message?: string) => {
      const restore = await snapshot(ids, fields)
      await apply()
      if (message) toast.show(message, restore)
    }
    const spans = async (ids: string[]) =>
      (await getDb()).getAll<Span & { id: string }>(`SELECT id, start_at, due_at FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
    const a = {
      /** 완료. 반복 태스크는 완료 기록을 남기고 다음 회차로 옮긴다(03 §8) */
      async complete(ids: string[]) {
        if (!ids.length) return
        const db = await getDb()
        const rows = await db.getAll<Row>(`SELECT * FROM tasks WHERE id IN (${marks(ids.length)}) AND status = 0`, ids)
        const repeating = rows.filter((r) => r.repeat_rule && r.due_at)
        const plainTop = rows.filter((r) => !repeating.includes(r)).map((r) => r.id as string)
        const all = await withDescendants(plainTop)
        const open = all.length ? (await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE status = 0 AND id IN (${marks(all.length)})`, all)).map((r) => r.id) : []
        playCompleteSound()
        const repIds = repeating.map((r) => r.id as string)
        const restoreRep = await snapshot(repIds, [...DATE_FIELDS, 'status', 'completed_at'])
        const restorePlain = await snapshot(open, ['status', 'completed_at'])
        const checks = repIds.length ? await db.getAll<Row>(`SELECT id, done, completed_at FROM check_items WHERE task_id IN (${marks(repIds.length)})`, repIds) : []
        const created: string[] = []
        const stmts: Stmt[] = open.map((id) => update('tasks', id, { status: 1, completed_at: now() }))
        for (const t of repeating) {
          const rule = parseRule(t.repeat_rule as string)!
          const start = (t.start_at ?? t.due_at) as string
          const mode = t.repeat_from === 'completion' ? 'completion' : 'due'
          const next = nextOccurrence(rule, mode === 'completion' ? dayKey() : datePart(start), mode)
          if (!next) {
            // 마지막 회차: 반복 없이 끝난다
            stmts.push(update('tasks', t.id as string, { status: 1, completed_at: now() }))
            continue
          }
          // 이번 회차 → 완료 기록 태스크(03 §8: 제목·본문·우선순위·리스트·태그 복사, 알림·반복 없음)
          const rec = uuid()
          created.push(rec)
          stmts.push(insert('tasks', {
            id: rec, list_id: t.list_id, parent_id: t.parent_id, title: t.title, content: t.content, content_mode: 'text', status: 1, priority: t.priority,
            start_at: t.start_at, due_at: t.due_at, is_all_day: t.is_all_day, time_zone: t.time_zone, repeat_origin_id: t.id, sort_order: t.sort_order, completed_at: now()
          }))
          for (const tag of await db.getAll<{ tag_id: string }>('SELECT tag_id FROM task_tags WHERE task_id = ?', [t.id])) stmts.push(insert('task_tags', { id: uuid(), task_id: rec, tag_id: tag.tag_id }))
          // 원래 태스크 → 다음 회차(시각·기간 유지), 남은 횟수 1 줄임, 체크 항목 초기화
          const shift = daysBetween(datePart(start), next)
          const nextRule = rule.count ? stringifyRule({ ...rule, count: rule.count - 1 }) : t.repeat_rule
          stmts.push(update('tasks', t.id as string, {
            start_at: t.start_at ? addDays(t.start_at as string, shift) : null, due_at: addDays(t.due_at as string, shift), repeat_rule: nextRule
          }))
          checks.filter((c) => c.done).forEach((c) => stmts.push(update('check_items', c.id as string, { done: 0, completed_at: null })))
        }
        await run(...stmts)
        void grantTaskXp(ids) // 10 성장: 완료 +1 XP(하루 10까지)
        toast.show('작업이 완료되었습니다.', async () => {
          void revokeTaskXp(ids)
          await restoreRep()
          await restorePlain()
          await run(...checks.map((c) => update('check_items', c.id as string, { done: c.done, completed_at: c.completed_at })))
          await deleteTasksHard(created)
        })
      },
      /** 완료 취소. 반복의 완료 기록이면 기록을 지우고 원래 태스크를 그 회차로 되돌린다(03 §8) */
      async reopen(ids: string[]) {
        const db = await getDb()
        const rows = await db.getAll<Row>(`SELECT id, repeat_origin_id, start_at, due_at FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
        const records = rows.filter((r) => r.repeat_origin_id)
        const plain = rows.filter((r) => !r.repeat_origin_id).map((r) => r.id as string)
        const stmts: Stmt[] = plain.map((id) => update('tasks', id, { status: 0, completed_at: null }))
        for (const rec of records) {
          const origin = await db.get<Row>('SELECT id, start_at, due_at, repeat_rule FROM tasks WHERE id = ?', [rec.repeat_origin_id])
          if (origin?.due_at && origin.repeat_rule) {
            const rule = parseRule(origin.repeat_rule as string)
            const back = moveToDate(origin as Span, datePart((rec.start_at ?? rec.due_at) as string))
            stmts.push(update('tasks', origin.id as string, { ...back, repeat_rule: rule?.count ? stringifyRule({ ...rule, count: rule.count + 1 }) : origin.repeat_rule }))
          }
        }
        await run(...stmts)
        void revokeTaskXp([...ids, ...records.map((r) => r.repeat_origin_id as string)]) // 같은 날 취소면 XP 되돌림
        if (records.length) await deleteTasksHard(records.map((r) => r.id as string))
      },
      async wontDo(ids: string[], on: boolean) {
        await undoable(ids, ['status', 'completed_at'], () => updateTasks(ids, on ? { status: 2, completed_at: now() } : { status: 0, completed_at: null }), on ? '하지 않음으로 표시했어요' : undefined)
      },
      async trash(ids: string[]) {
        const all = await withDescendants(ids)
        await undoable(all, ['deleted_at'], () => updateTasks(all, { deleted_at: now() }), '휴지통으로 옮겼어요')
      },
      async restore(ids: string[]) {
        const all = await withDescendants(ids)
        await updateTasks(all, { deleted_at: null })
      },
      deleteForever: (ids: string[]) => deleteTasksHard(ids),
      /** 날짜만 바꾼다(시각·기간 유지). null이면 날짜·반복·알림을 지운다(03 §5) */
      async moveDates(ids: string[], date: string | null, message?: string) {
        const restore = await snapshotSchedule(ids)
        const rows = await spans(ids)
        const stmts: Stmt[] = rows.map((r) => update('tasks', r.id, { ...moveToDate(r, date), ...(date === null ? { repeat_rule: null, repeat_from: null } : {}) }))
        if (date === null) {
          const rem = await (await getDb()).getAll<{ id: string }>(`SELECT id FROM reminders WHERE task_id IN (${marks(ids.length)})`, ids)
          rem.forEach((r) => stmts.push(remove('reminders', r.id)))
        }
        await run(...stmts)
        if (message) toast.show(message, restore)
        else toast.show(date === null ? '날짜를 지웠어요' : '날짜를 바꿨어요', restore)
      },
      async postpone(ids: string[], opt: { minutes?: number; days?: number }) {
        const restore = await snapshotSchedule(ids)
        const rows = await spans(ids)
        await run(...rows.flatMap((r) => { const p = shiftSpan(r, opt); return p ? [update('tasks', r.id, p)] : [] }))
        toast.show('미뤘어요', restore)
      },
      /**
       * 캘린더에서 끌어 옮기기·길이 바꾸기(06 §7.2). 토스트 없이 저장하고 Cmd+Z로 되돌린다.
       * 종일 ↔ 시각이 바뀌면 알림도 맞춘다: 시각 → 종일은 알림 지움, 종일 → 시각은 "정각에"(03 §3.1)
       */
      async reschedule(changes: { id: string; start_at: string | null; due_at: string | null }[], opts: { duplicate?: boolean } = {}) {
        if (!changes.length) return
        const db = await getDb()
        const ids = changes.map((c) => c.id)
        if (opts.duplicate) {
          const stmts: Stmt[] = []
          const copies: string[] = []
          for (const c of changes) {
            const t = await db.get<Row>('SELECT * FROM tasks WHERE id = ?', [c.id])
            if (!t) continue
            const copy = uuid()
            copies.push(copy)
            const { id: _i, created_at: _c, modified_at: _m, ...rest } = t
            stmts.push(insert('tasks', { ...rest, id: copy, start_at: c.start_at, due_at: c.due_at, is_all_day: c.due_at && c.due_at.includes('T') ? 0 : 1, repeat_rule: null }))
            for (const tag of await db.getAll<{ tag_id: string }>('SELECT tag_id FROM task_tags WHERE task_id = ?', [c.id])) stmts.push(insert('task_tags', { id: uuid(), task_id: copy, tag_id: tag.tag_id }))
          }
          await run(...stmts)
          toast.show('복제했어요', () => deleteTasksHard(copies))
          return
        }
        const restore = await snapshotSchedule(ids)
        const before = await db.getAll<{ id: string; due_at: string | null; n: number }>(
          `SELECT id, due_at, (SELECT count(*) FROM reminders r WHERE r.task_id = tasks.id) AS n FROM tasks WHERE id IN (${marks(ids.length)})`, ids
        )
        const stmts: Stmt[] = []
        for (const c of changes) {
          const old = before.find((b) => b.id === c.id)
          const wasTimed = !!old?.due_at?.includes('T')
          const nowTimed = !!c.due_at?.includes('T')
          stmts.push(update('tasks', c.id, { start_at: c.start_at, due_at: c.due_at, is_all_day: nowTimed ? 0 : 1 }))
          if (wasTimed && !nowTimed) {
            const rem = await db.getAll<{ id: string }>('SELECT id FROM reminders WHERE task_id = ?', [c.id])
            rem.forEach((r) => stmts.push(remove('reminders', r.id)))
          }
          if (!wasTimed && nowTimed && !old?.n) stmts.push(insert('reminders', { id: uuid(), task_id: c.id, trigger: '-PT0M' }))
        }
        await run(...stmts)
        toast.registerUndo(restore)
      },
      /** 날짜 선택기 OK(03 §2): 날짜·기간·시각·반복과 알림 목록을 통째로 저장 */
      async applySchedule(ids: string[], s: Schedule) {
        const restore = await snapshotSchedule(ids)
        const db = await getDb()
        const old = await db.getAll<{ id: string }>(`SELECT id FROM reminders WHERE task_id IN (${marks(ids.length)})`, ids)
        await run(
          ...ids.map((id) => update('tasks', id, { start_at: s.start_at, due_at: s.due_at, is_all_day: s.is_all_day, repeat_rule: s.repeat_rule, repeat_from: s.repeat_from })),
          ...old.map((r) => remove('reminders', r.id)),
          ...ids.flatMap((id) => s.reminders.map((trigger) => insert('reminders', { id: uuid(), task_id: id, trigger })))
        )
        if (ids.length > 1) toast.show(`${ids.length}개 태스크의 날짜를 바꿨어요`, restore)
        else toast.registerUndo(restore)
      },
      async setPriority(ids: string[], priority: number) {
        await undoable(ids, ['priority'], () => updateTasks(ids, { priority }))
      },
      async move(ids: string[], list: { id: string; name: string; kind: string }) {
        const all = await withDescendants(ids)
        const top = new Set(ids)
        await undoable(all, ['list_id', 'parent_id'], async () => {
          // 다른 리스트로 옮긴 하위 태스크는 부모와의 연결이 풀린다
          const db = await getDb()
          const rows = await db.getAll<{ id: string; parent_id: string | null }>(`SELECT id, parent_id FROM tasks WHERE id IN (${all.map(() => '?').join(',')})`, all)
          const moving = new Set(all)
          await run(...rows.map((r) => update('tasks', r.id, top.has(r.id) && r.parent_id && !moving.has(r.parent_id) ? { list_id: list.id, parent_id: null } : { list_id: list.id })))
        }, `${withRo(list.kind === 'inbox' ? '기본함' : list.name)} 옮겼어요`)
      },
      async toggleTag(ids: string[], tagId: string, on: boolean) {
        await setTag(ids, tagId, on)
      },
      async pin(ids: string[], on: boolean) {
        await undoable(ids, ['pinned_at'], () => updateTasks(ids, { pinned_at: on ? now() : null }), on ? '고정했어요' : '고정을 풀었어요')
      },
      async setParent(ids: string[], parentId: string | null) {
        const db = await getDb()
        const parent = parentId ? await db.get<{ list_id: string }>('SELECT list_id FROM tasks WHERE id = ?', [parentId]) : null
        const all = await withDescendants(ids)
        await undoable(all, ['parent_id', 'list_id', 'sort_order'], () =>
          run(...ids.map((id, i) => update('tasks', id, { parent_id: parentId, sort_order: Date.now() + i, ...(parent ? { list_id: parent.list_id } : {}) })),
            ...(parent ? all.filter((id) => !ids.includes(id)).map((id) => update('tasks', id, { list_id: parent.list_id })) : [])),
        parentId ? '하위 태스크로 옮겼어요' : '부모 연결을 풀었어요')
      },
      /** 빈 하위 태스크를 만들고 그 id를 돌려준다(목록에서 바로 제목 입력) */
      async addSubtask(parentId: string) {
        const db = await getDb()
        const p = await db.get<{ list_id: string }>('SELECT list_id FROM tasks WHERE id = ?', [parentId])
        return createTask({ title: '', list_id: p!.list_id, parent_id: parentId, sort_order: Date.now() })
      },
      async duplicate(ids: string[]) {
        const db = await getDb()
        const stmts: Stmt[] = []
        for (const id of ids) {
          const t = await db.get<Record<string, unknown>>('SELECT * FROM tasks WHERE id = ?', [id])
          if (!t) continue
          const copy = uuid()
          const { id: _old, created_at: _c, modified_at: _m, ...rest } = t
          stmts.push(insert('tasks', { ...rest, id: copy, sort_order: Number(t.sort_order ?? 0) + 0.001 }))
          for (const tag of await db.getAll<{ tag_id: string }>('SELECT tag_id FROM task_tags WHERE task_id = ?', [id])) stmts.push(insert('task_tags', { id: uuid(), task_id: copy, tag_id: tag.tag_id }))
          for (const c of await db.getAll<{ title: string; done: number; sort_order: number }>('SELECT title, done, sort_order FROM check_items WHERE task_id = ?', [id])) {
            stmts.push(insert('check_items', { id: uuid(), task_id: copy, title: c.title, done: c.done, sort_order: c.sort_order }))
          }
        }
        await run(...stmts)
        toast.show('복제했어요')
      },
      async copyLink(id: string) {
        await navigator.clipboard.writeText(`sprout://task/${id}`)
        toast.show('링크를 복사했어요')
      }
    }
    return a
  }, [toast])
}
export type TaskActions = ReturnType<typeof useTaskActions>
