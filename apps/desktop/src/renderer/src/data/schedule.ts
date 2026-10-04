import type { Schedule } from '../lib/taskActions'
import { getDb } from './db'

/** 태스크 행 + 알림 행 → 날짜 선택기 초기값 */
export async function loadSchedule(id: string): Promise<Schedule> {
  const db = await getDb()
  const t = await db.get<{ start_at: string | null; due_at: string | null; is_all_day: number | null; repeat_rule: string | null; repeat_from: string | null }>(
    'SELECT start_at, due_at, is_all_day, repeat_rule, repeat_from FROM tasks WHERE id = ?', [id]
  )
  const reminders = await db.getAll<{ trigger: string }>('SELECT trigger FROM reminders WHERE task_id = ? ORDER BY created_at', [id])
  return {
    start_at: t?.start_at ?? null, due_at: t?.due_at ?? null, is_all_day: t?.is_all_day ?? 1,
    repeat_rule: t?.repeat_rule ?? null, repeat_from: t?.repeat_from ?? null, reminders: reminders.map((r) => r.trigger)
  }
}
