// 28 모바일 일기 — DB 읽기·쓰기와 캐릭터 대화(데스크톱 data/diary.ts와 같은 순서·같은 규칙).
// 위기 검사 순서: 앱 단어 검사(AI 부르기 전) → 걸리면 AI 없이 위기 카드(safety=1) / 모델이 [[SAFETY]] → 받던 것 멈추고 위기 카드.
// 동의 전·나만 보기·오늘은 혼자에서는 /ai/diary를 부르지 않는다. 일기로 XP 없음(15 §4).
import { useQuery } from '@powersync/react-native'
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
  buddyOf, buildBuddyMessages, buildSummaryMessages, chipTitle, cleanSummary, CRISIS_CARD, crisisTarget, dayRange, detectCrisis, DONE_SQL, entryId,
  MEMORY_SQL, mayCallAi, parseBuddyReply, XP_SQL, type Buddy, type DiaryEntry, type DiaryMessage
} from './logic'
import { getConsent, getMemory, isSolo } from './prefs'

const uuid = () => crypto.randomUUID()
const ENTRY_BY_DATE = 'SELECT * FROM diary_entries WHERE date = ? ORDER BY created_at, id LIMIT 1'
export const findEntry = (date: string) => db.getOptional<DiaryEntry>(ENTRY_BY_DATE, [date])

// ── 읽기(useQuery = 동기화로 바뀌면 다시 그림) ──
export function useEntry(date: string): DiaryEntry | undefined {
  return useQuery<DiaryEntry>(ENTRY_BY_DATE, [date]).data[0]
}
export const ENTRIES_SQL = 'SELECT id, date, mood, content, prompt, private, summary, created_at, modified_at FROM diary_entries ORDER BY date DESC'
export function useEntries(): DiaryEntry[] {
  return useQuery<DiaryEntry>(ENTRIES_SQL).data
}
export function useMessages(date: string): DiaryMessage[] {
  return useQuery<DiaryMessage>('SELECT m.* FROM diary_messages m JOIN diary_entries e ON e.id = m.entry_id WHERE e.date = ? ORDER BY m.created_at, m.id', [date]).data
}
export type DoneRow = { id: string; title: string; completed_at: string }
export function useDone(date: string): { rows: DoneRow[]; xp: number } {
  const [a, b] = dayRange(date)
  const rows = useQuery<DoneRow>(DONE_SQL, [a, b]).data
  const xp = useQuery<{ xp: number }>(XP_SQL, [date]).data[0]?.xp ?? 0
  return { rows, xp }
}
/** 한 줄 발견용: 날짜별 완료 수(그 달) */
export function useDoneByDay(month: string): Map<string, number> {
  const from = new Date(`${month}-01T00:00:00`).toISOString()
  const to = new Date(`${addDays(`${month}-01`, 40).slice(0, 7)}-01T00:00:00`).toISOString()
  const rows = useQuery<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ?', [from, to]).data
  const m = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.completed_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return m
}
/** 대화 상대 = 내 성장 캐릭터(이름·종·단계) */
export function useBuddy(): Buddy & { stage: number } {
  const c = useQuery<CharacterRow>(CHARACTER_SQL).data[0]
  const total = useQuery<{ xp: number }>('SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events').data[0]?.xp ?? 0
  return { ...buddyOf(c), stage: stageOf(levelOfTotal(total).level) }
}
/** 할 일로 칩: 같은 제목 할 일이 이미 있는가(앱을 다시 켜도 두 번 만들지 않게) */
export function useExistingTitles(titles: string[]): Set<string> {
  const list = titles.length ? titles : ['']
  const rows = useQuery<{ title: string }>(`SELECT title FROM tasks WHERE deleted_at IS NULL AND title IN (${list.map(() => '?').join(',')})`, list).data
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
async function addMessage(date: string, role: 'me' | 'buddy', content: string, safety = 0) {
  const entryRef = await saveEntry(date, {})
  const at = new Date(Math.max(Date.now(), lastAt + 1))
  lastAt = at.getTime()
  await run([insert('diary_messages', { id: uuid(), entry_id: entryRef, role, content, safety, created_at: at.toISOString(), modified_at: new Date().toISOString() })])
}

// ── 대화 ──
export type ReplyResult = 'reply' | 'crisis' | 'blocked'
export type ReplyOpts = { buddy: Buddy; signal: AbortSignal; onDelta?: (visible: string) => void; onQueue?: (position: number) => void }

/** 캐릭터가 한 번 답한다. 검사 대상(마지막 내 말, 없으면 일기 글)을 먼저 단어 검사하고 걸리면 AI를 부르지 않는다 */
export async function buddyReply(date: string, opts: ReplyOpts): Promise<ReplyResult> {
  const entry = await findEntry(date)
  if (!entry || !mayCallAi({ consent: getConsent(), private: entry.private, solo: isSolo(date) })) return 'blocked'
  const messages = await db.getAll<DiaryMessage>('SELECT * FROM diary_messages WHERE entry_id = ? ORDER BY created_at, id', [entry.id])
  if (detectCrisis(crisisTarget(entry, messages))) { await addMessage(date, 'buddy', CRISIS_CARD.title, 1); return 'crisis' }
  const memory = getMemory() ? await db.getAll<{ date: string; summary: string }>(MEMORY_SQL, [addDays(date, -7), date]) : []
  const chat = buildBuddyMessages({ buddy: opts.buddy, entry, messages, memory })
  if (!chat) return 'blocked'
  const inner = new AbortController()
  const stop = () => inner.abort()
  opts.signal.addEventListener('abort', stop, { once: true })
  let raw = ''
  let flagged = false
  try {
    raw = await diaryChat(chat, inner.signal, (d) => {
      raw += d
      const p = parseBuddyReply(raw)
      if (p.safety) { flagged = true; inner.abort(); return }
      opts.onDelta?.(p.text)
    }, opts.onQueue)
  } catch (e) {
    if (!flagged) throw e
  } finally { opts.signal.removeEventListener('abort', stop) }
  const parsed = parseBuddyReply(raw)
  if (flagged || parsed.safety) { await addMessage(date, 'buddy', CRISIS_CARD.title, 1); return 'crisis' }
  if (!parsed.text) throw new Error('답이 비어 있어요')
  // 그 사이 나만 보기로 바뀌었으면 남기지 않는다
  const again = await findEntry(date)
  if (again?.private) return 'blocked'
  await addMessage(date, 'buddy', parsed.task ? `${parsed.text}\n할 일: ${parsed.task}` : parsed.text)
  return 'reply'
}
/** 내 말을 남기고 캐릭터 답을 받는다(내 말도 먼저 검사 — buddyReply 안에서) */
export async function sendMessage(date: string, text: string, opts: ReplyOpts): Promise<ReplyResult> {
  const t = text.trim()
  if (!t) return 'blocked'
  await addMessage(date, 'me', t.slice(0, 2000))
  return buddyReply(date, opts)
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
  const inbox = await db.getOptional<{ id: string }>("SELECT id FROM lists WHERE kind = 'inbox' ORDER BY created_at LIMIT 1")
  if (!inbox) throw new Error('기본함을 찾지 못했어요')
  const t = chipTitle(title)
  const same = await db.getOptional<{ id: string }>('SELECT id FROM tasks WHERE deleted_at IS NULL AND title = ? LIMIT 1', [t])
  if (same) return same.id
  return createTask({ title: t, list_id: inbox.id })
}
