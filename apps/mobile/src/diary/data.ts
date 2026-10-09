// 28 모바일 일기 — DB 읽기·쓰기와 캐릭터 대화(데스크톱 data/diary.ts와 같은 순서·같은 규칙).
// 동의 전·나만 보기·오늘은 혼자에서는 /ai/diary를 부르지 않는다. 일기로 XP 없음(15 §4).
import { useMemo } from 'react'
import { COUNT_THROTTLE, useLiveQuery, useRows } from '../data/rows'
import { addDays } from '@sprout/schema/time'
import { stageOf } from '@sprout/schema/growth'
import { currentUserId } from '../data/auth'
import { db, run } from '../data/db'
import { createTask, insert, update } from '../data/tasks'
import { CHARACTER_SQL } from '../growth/goalCore'
import type { CharacterRow } from '../growth/logic'
import { levelOfTotal } from '../growth/logic'
import { diaryChat } from './ai'
import {
  buddyOf, buildBuddyMessages, buildSummaryMessages, chipTitle, cleanSummary, dayRange, DONE_SQL, entryId,
  MEMORY_SQL, mayCallAi, parseBuddyReply, XP_SQL, type Buddy, type DiaryEntry, type DiaryMessage
} from './logic'
import { getConsent, getMemory, isSolo } from './prefs'
import { SCRIPTED, type DayStats, type Line } from './talk'
import { IN_SMART } from '../data/views'

const uuid = () => crypto.randomUUID()
const ENTRY_BY_DATE = 'SELECT * FROM diary_entries WHERE date = ? ORDER BY created_at, id LIMIT 1'
export const findEntry = (date: string) => db.getOptional<DiaryEntry>(ENTRY_BY_DATE, [date])

// ── 읽기(useQuery = 동기화로 바뀌면 다시 그림) ──
export function useEntry(date: string): DiaryEntry | undefined {
  return useLiveQuery<DiaryEntry>(ENTRY_BY_DATE, [date]).data[0]
}
export const ENTRIES_SQL = 'SELECT id, date, mood, content, prompt, private, summary, created_at, modified_at FROM diary_entries ORDER BY date DESC'
export function useEntries(): DiaryEntry[] {
  return useLiveQuery<DiaryEntry>(ENTRIES_SQL).data
}
export function useMessages(date: string): DiaryMessage[] {
  return useRows<DiaryMessage>('SELECT m.* FROM diary_messages m JOIN diary_entries e ON e.id = m.entry_id WHERE e.date = ? ORDER BY m.created_at, m.id', [date]).data
}
export type DoneRow = { id: string; title: string; completed_at: string }
export function useDone(date: string): { rows: DoneRow[]; xp: number } {
  const [a, b] = dayRange(date)
  const rows = useLiveQuery<DoneRow>(DONE_SQL, [a, b]).data
  const xp = useLiveQuery<{ xp: number }>(XP_SQL, [date]).data[0]?.xp ?? 0
  return { rows, xp }
}
/** 한 줄 발견용: 날짜별 완료 수(그 달) */
export function useDoneByDay(month: string): Map<string, number> {
  const from = new Date(`${month}-01T00:00:00`).toISOString()
  const to = new Date(`${addDays(`${month}-01`, 40).slice(0, 7)}-01T00:00:00`).toISOString()
  const rows = useLiveQuery<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ?', [from, to]).data
  const m = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.completed_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return m
}
/** 28 §8.3 인사·칩: 그날 할 일(기기 안, 읽기만). total = 그날 마감인 열린 할 일 + 그날 끝낸 할 일(오늘 탭의 오늘 묶음 + 완료와 같은 기준) */
const S_DAY = 'substr(COALESCE(t.start_at, t.due_at), 1, 10)'
const E_DAY = 'substr(t.due_at, 1, 10)'
const OPEN_DUE_SQL = `SELECT count(*) AS n FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND ${IN_SMART} AND ${S_DAY} <= ? AND ${E_DAY} >= ?`
const NEXT_SQL = `SELECT t.id, t.title FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND t.parent_id IS NULL AND ${IN_SMART} AND (${E_DAY} = ? OR substr(t.start_at, 1, 10) = ?) ORDER BY t.priority DESC, t.sort_order LIMIT 2`
export function useDayStats(date: string): DayStats {
  const [a, b] = dayRange(date)
  const done = useRows<DoneRow>(DONE_SQL, [a, b], COUNT_THROTTLE).data
  const open = useRows<{ n: number }>(OPEN_DUE_SQL, [date, date], COUNT_THROTTLE).data[0]?.n ?? 0
  const next = addDays(date, 1)
  const nextRows = useRows<{ id: string; title: string }>(NEXT_SQL, [next, next], COUNT_THROTTLE).data
  return useMemo(() => ({
    total: open + done.length,
    done: done.length,
    doneTitles: done.slice().reverse().map((r) => r.title).filter(Boolean),
    nextTitles: nextRows.map((r) => r.title).filter(Boolean)
  }), [open, done, nextRows])
}
/** 대화 상대 = 내 성장 캐릭터(이름·종·단계) */
export function useBuddy(): Buddy & { stage: number; level: number } {
  const c = useLiveQuery<CharacterRow>(CHARACTER_SQL).data[0]
  const total = useLiveQuery<{ xp: number }>('SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events').data[0]?.xp ?? 0
  const level = levelOfTotal(total).level
  return { ...buddyOf(c), stage: stageOf(level), level }
}
/** 할 일로 칩: 같은 제목 할 일이 이미 있는가(앱을 다시 켜도 두 번 만들지 않게) */
export function useExistingTitles(titles: string[]): Set<string> {
  const list = titles.length ? titles : ['']
  const rows = useLiveQuery<{ title: string }>(`SELECT title FROM tasks WHERE deleted_at IS NULL AND title IN (${list.map(() => '?').join(',')})`, list).data
  return new Set(rows.map((r) => r.title))
}

// ── 쓰기 ──
type Patch = Partial<Pick<DiaryEntry, 'mood' | 'content' | 'prompt' | 'private' | 'summary'>>
export async function saveEntry(date: string, patch: Patch): Promise<string> {
  const row = await findEntry(date)
  if (row) { await run([update('diary_entries', row.id, patch)]); return row.id }
  const owner = currentUserId()
  const id = entryId(date, owner === 'local' ? null : owner)
  await run([insert('diary_entries', { id, date, mood: null, content: '', prompt: null, private: 0, summary: null, ...patch })])
  return id
}
/** 나만 보기를 켜면 기억하기 요약도 지운다 */
export const setPrivate = (date: string, on: boolean) => saveEntry(date, on ? { private: 1, summary: null } : { private: 0 })
export async function deleteEntry(date: string) {
  const id = (await findEntry(date))?.id
  if (!id) return
  const msgs = await db.getAll<{ id: string }>('SELECT id FROM diary_messages WHERE entry_id = ?', [id])
  await run([...msgs.map((m) => ({ sql: 'DELETE FROM diary_messages WHERE id = ?', params: [m.id] })), { sql: 'DELETE FROM diary_entries WHERE id = ?', params: [id] }])
}
export async function clearMessages(date: string) {
  const id = (await findEntry(date))?.id
  if (!id) return
  const msgs = await db.getAll<{ id: string }>('SELECT id FROM diary_messages WHERE entry_id = ?', [id])
  await run(msgs.map((m) => ({ sql: 'DELETE FROM diary_messages WHERE id = ?', params: [m.id] })))
}
let lastAt = 0
async function addMessage(date: string, role: 'me' | 'buddy', content: string) {
  const entryRef = await saveEntry(date, {})
  const at = new Date(Math.max(Date.now(), lastAt + 1))
  lastAt = at.getTime()
  await run([insert('diary_messages', { id: uuid(), entry_id: entryRef, role, content, safety: 0, created_at: at.toISOString(), modified_at: new Date().toISOString() })])
}

/** 정해진 말(28 §8.3)과 그 답을 한 번에 남긴다(safety = SCRIPTED). 화면이 캐릭터 말을 잠깐 뒤에 보이도록 만든 id를 돌려준다 */
export async function addScripted(date: string, lines: Line[]): Promise<string[]> {
  if (!lines.length) return []
  const entryRef = await saveEntry(date, {})
  const ids: string[] = []
  const now = new Date().toISOString()
  const rows = lines.map((l) => {
    const at = new Date(Math.max(Date.now(), lastAt + 1))
    lastAt = at.getTime()
    const id = uuid()
    ids.push(id)
    return insert('diary_messages', { id, entry_id: entryRef, role: l.role, content: l.content, safety: SCRIPTED, created_at: at.toISOString(), modified_at: now })
  })
  await run(rows)
  return ids
}
/** 처음부터 다시 묻기: 정해진 행만 지운다(AI 대화·일기 글은 그대로) */
export async function clearScripted(date: string) {
  const id = (await findEntry(date))?.id
  if (!id) return
  const msgs = await db.getAll<{ id: string }>('SELECT id FROM diary_messages WHERE entry_id = ? AND safety = ?', [id, SCRIPTED])
  await run(msgs.map((m) => ({ sql: 'DELETE FROM diary_messages WHERE id = ?', params: [m.id] })))
}
/** 다듬기(28 §8.5): 서버가 지시문을 정한다. 답에서 따옴표·머리말만 걷어 낸다 */
export async function polishDraft(text: string, signal: AbortSignal, onQueue?: (position: number) => void): Promise<string> {
  const raw = await diaryChat([{ role: 'user', content: text.slice(0, 4000) }], signal, undefined, onQueue, { mode: 'polish' })
  const out = cleanPolished(raw)
  if (!out) throw new Error('답이 비어 있어요')
  return out
}
export function cleanPolished(raw: string): string {
  return raw.trim().replace(/^```[a-z]*\n?|```$/g, '').replace(/^(다듬은 (일기|글)\s*[:：]\s*)/, '').replace(/^["“'‘]|["”'’]$/g, '').trim()
}

// ── 대화 ──
export type ReplyResult = 'reply' | 'blocked'
export type ReplyOpts = { buddy: Buddy; signal: AbortSignal; onDelta?: (visible: string) => void; onQueue?: (position: number) => void }

/** 캐릭터가 한 번 답한다 */
export async function buddyReply(date: string, opts: ReplyOpts): Promise<ReplyResult> {
  const entry = await findEntry(date)
  if (!entry || !mayCallAi({ consent: getConsent(), private: entry.private, solo: isSolo(date) })) return 'blocked'
  const messages = await db.getAll<DiaryMessage>('SELECT * FROM diary_messages WHERE entry_id = ? ORDER BY created_at, id', [entry.id])
  const memory = getMemory() ? await db.getAll<{ date: string; summary: string }>(MEMORY_SQL, [addDays(date, -7), date]) : []
  const chat = buildBuddyMessages({ buddy: opts.buddy, entry, messages, memory })
  if (!chat) return 'blocked'
  let raw = ''
  raw = await diaryChat(chat, opts.signal, (d) => {
    raw += d
    opts.onDelta?.(parseBuddyReply(raw).text)
  }, opts.onQueue)
  const parsed = parseBuddyReply(raw)
  if (!parsed.text) throw new Error('답이 비어 있어요')
  // 그 사이 나만 보기로 바뀌었으면 남기지 않는다
  const again = await findEntry(date)
  if (again?.private) return 'blocked'
  await addMessage(date, 'buddy', parsed.task ? `${parsed.text}\n할 일: ${parsed.task}` : parsed.text)
  return 'reply'
}
/** 내 말을 남기고 캐릭터 답을 받는다 */
export async function sendMessage(date: string, text: string, opts: ReplyOpts): Promise<ReplyResult> {
  const t = text.trim()
  if (!t) return 'blocked'
  await addMessage(date, 'me', t.slice(0, 2000))
  return buddyReply(date, opts)
}
/** 이번 실행에서 쓰거나 고친 날 — 화면을 떠날 때 기억하기 요약(켜 둔 사람만) */
const touched = new Set<string>()
export const touchEntry = (date: string) => { touched.add(date) }
export function flushSummaries() {
  for (const d of touched) void summarizeEntry(d, AbortSignal.timeout(180000)).catch(() => {})
  touched.clear()
}
/** 기억하기용 짧은 요약 — 기억하기를 켠 사람의, 나만 보기가 아닌 날만 */
export async function summarizeEntry(date: string, signal: AbortSignal) {
  const entry = await findEntry(date)
  if (!entry || getConsent() !== true || !getMemory()) return
  const mine = await db.getAll<{ content: string }>("SELECT content FROM diary_messages WHERE entry_id = ? AND role = 'me' AND COALESCE(safety, 0) = 0 ORDER BY created_at, id", [entry.id])
  const msgs = buildSummaryMessages(entry, mine.map((m) => m.content))
  if (!msgs) return
  const summary = cleanSummary(await diaryChat(msgs, signal))
  const again = await findEntry(date)
  if (summary && again && !again.private) await saveEntry(date, { summary })
}
/** 할 일로 칩 → 기본함 */
export async function taskFromChip(title: string): Promise<string> {
  const t = chipTitle(title)
  const same = await db.getOptional<{ id: string }>('SELECT id FROM tasks WHERE deleted_at IS NULL AND title = ? LIMIT 1', [t])
  if (same) return same.id
  return createTask({ title: t, list_id: '' }) // 빈 리스트 = 기본함(없으면 만든다, 02 §14.1)
}
