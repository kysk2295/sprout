// 15 일기 — 날짜별 일기(결정적 id), 성장 캐릭터와의 대화, 동의·나만 보기. v2(§10): 캐릭터와 이야기하고 일기로 옮기기(28 §8.10과 같은 흐름).
// 순수 계산(기분·말투·AI 입력·달력·정해진 말·초안·편 나누기)은 휴대폰과 같이 packages/schema/src/diary.ts·diaryTalk.ts·diaryPrompts.ts에 있다.
import { useMemo } from 'react'
import { addDays } from '@sprout/schema/time'
import {
  buildBuddyMessages, buildSummaryMessages, chipTitle, cleanSummary, DAY_NEXT_SQL, DAY_OPEN_SQL, dayRange, DONE_SQL, entryId, mayCallAi,
  MEMORY_SQL, moodOf, parseBuddyReply, toneOf, type Buddy, type DiaryEntry, type DiaryMessage, type Memory
} from '@sprout/schema/diary'
import { chatTurns, sessionOf, SCRIPTED, type DayStats, type Line } from '@sprout/schema/diaryTalk'
import { appendSection, chatSystem, DISTILL_SCHEMA, distillMessages, formatSection, parseDistill, parseSections, type Distilled, type Section } from '@sprout/schema/diaryPrompts'
import { aiChat } from './ai'
import { getDb } from './db'
import { useQuery } from './useQuery'
import { createTask, insert, now, remove, run, taskListId, update, uuid } from './mutations'

export * from '@sprout/schema/diary'

const ownerId = async () => {
  try { return (await window.sprout?.auth?.state())?.user?.id ?? null } catch { return null }
}
const ENTRY_BY_DATE = 'SELECT * FROM diary_entries WHERE date = ? ORDER BY created_at, id LIMIT 1'
/** 그날 일기 행(로컬 DB에는 내 행만 있다) */
export const findEntry = async (date: string) => (await getDb()).get<DiaryEntry>(ENTRY_BY_DATE, [date])
/** 그날 대화 — 일기 행 id를 몰라도 날짜로 찾는다 */
export const MESSAGES_BY_DATE_SQL = 'SELECT m.* FROM diary_messages m JOIN diary_entries e ON e.id = m.entry_id WHERE e.date = ? ORDER BY m.created_at, m.id'

// ── 저장 ──
type Patch = Partial<Pick<DiaryEntry, 'mood' | 'content' | 'prompt' | 'private' | 'summary'>>
/** 그날 일기를 만들거나 고친다. id가 날짜로 정해져 두 기기에서 써도 한 행으로 모인다 */
export async function saveEntry(date: string, patch: Patch) {
  const row = await findEntry(date)
  if (row) { await run(update('diary_entries', row.id, patch)); return row.id }
  const id = entryId(date, await ownerId())
  await run(insert('diary_entries', { id, date, mood: null, content: '', prompt: null, private: 0, summary: null, ...patch }))
  return id
}
/** 나만 보기를 켜면 기억하기 요약도 지운다(AI에게 간 적 없는 날로) */
export const setPrivate = (date: string, on: boolean) => saveEntry(date, on ? { private: 1, summary: null } : { private: 0 })

export async function deleteEntry(date: string) {
  const id = (await findEntry(date))?.id
  if (!id) return
  const msgs = await (await getDb()).getAll<{ id: string }>('SELECT id FROM diary_messages WHERE entry_id = ?', [id])
  await run(...msgs.map((m) => remove('diary_messages', m.id)), remove('diary_entries', id))
}

async function addMessage(date: string, role: 'me' | 'buddy', content: string) {
  const entryRef = await saveEntry(date, {}) // 대화만 있어도 그날 행이 있어야 한다
  // 같은 밀리초에 두 개가 들어가도 순서가 지켜지게 조금씩 뒤로
  const at = new Date(Math.max(Date.now(), lastAt + 1))
  lastAt = at.getTime()
  await run(insert('diary_messages', { id: uuid(), entry_id: entryRef, role, content, safety: 0, created_at: at.toISOString(), modified_at: now() }))
}
let lastAt = 0

// ── 기기 설정(동의·기억하기·오늘은 혼자·쓰기 방식·소개 봤음) — 이 기기에만 둔다(28 §8.6 "기기에만") ──
const K = { consent: 'sprout.diary.consent', memory: 'sprout.diary.memory', solo: 'sprout.diary.solo', notice: 'sprout.diary.notice', mode: 'sprout.diary.mode', met: 'sprout.diary.met' }
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 저장소를 못 쓰면 이번 실행에서만 */ } }
/** null = 아직 묻지 않음 */
export const getConsent = (): boolean | null => (read(K.consent) === 'on' ? true : read(K.consent) === 'off' ? false : null)
export const setConsent = (on: boolean) => write(K.consent, on ? 'on' : 'off')
export const getMemory = () => read(K.memory) === 'on'
export const setMemory = (on: boolean) => write(K.memory, on ? 'on' : 'off')
export const isSolo = (date: string) => (read(K.solo) ?? '').split(',').includes(date)
export function setSolo(date: string, on: boolean) {
  const days = (read(K.solo) ?? '').split(',').filter((d) => d && d !== date).slice(-30)
  write(K.solo, (on ? [...days, date] : days).join(','))
}
/** 한계 알림은 처음 몇 번만 */
export function takeNotice(limit = 5): boolean {
  const n = Number(read(K.notice) ?? 0)
  if (n >= limit) return false
  write(K.notice, String(n + 1))
  return true
}
/** 15 §10.5 · 28 §8.7 ①: 일기를 열 때 대화(기본) / 그냥 쓰기 — `그냥 쓸래요`를 고르면 이 기기는 다음에도 그냥 쓰기로 연다 */
export type WriteMode = 'chat' | 'free'
export const getWriteMode = (): WriteMode => (read(K.mode) === 'free' ? 'free' : 'chat')
export const setWriteMode = (m: WriteMode) => write(K.mode, m)
/** 캐릭터 소개는 처음 한 번만 — 첫 답을 남기면 켠다 */
export const hasMet = () => read(K.met) === 'on'
export const setMet = () => { if (!hasMet()) write(K.met, 'on') }

// ── AI 입력(§3.1) — 나만 보기·동의 전에는 만들지 않는다 ──
/** 최근 7일, 나만 보기가 아닌 날의 요약만 */
export async function recentMemory(date: string): Promise<Memory[]> {
  return (await getDb()).getAll<Memory>(MEMORY_SQL, [addDays(date, -7), date])
}

// ── 대화 ──
export type ReplyResult = 'reply' | 'blocked'
type ReplyOpts = { buddy: Buddy; memoryOn: boolean; signal: AbortSignal; onDelta?: (visible: string) => void; onQueue?: (position: number) => void }

/** 캐릭터가 일기 글을 읽고 한 번 답한다(그냥 쓰기로 쓴 날의 `느리가 읽고 답해 주기`) — AI 입력 = 일기 글 + AI 대화(safety 0)뿐 */
export async function buddyReply(date: string, opts: ReplyOpts): Promise<ReplyResult> {
  const db = await getDb()
  const entry = await db.get<DiaryEntry>(ENTRY_BY_DATE, [date])
  if (!entry || !mayCallAi({ consent: getConsent(), private: entry.private, solo: isSolo(date) })) return 'blocked'
  const messages = await db.getAll<DiaryMessage>('SELECT * FROM diary_messages WHERE entry_id = ? ORDER BY created_at, id', [entry.id])
  const memory = opts.memoryOn ? await recentMemory(date) : []
  const chat = buildBuddyMessages({ buddy: opts.buddy, entry, messages, memory })
  if (!chat) return 'blocked'
  let raw = ''
  raw = await aiChat({ purpose: 'diary', messages: chat }, opts.signal, (d) => {
    raw += d
    opts.onDelta?.(parseBuddyReply(raw).text)
  }, opts.onQueue)
  const parsed = parseBuddyReply(raw)
  if (!parsed.text) throw new Error('답이 비어 있어요')
  await addMessage(date, 'buddy', parsed.task ? `${parsed.text}\n할 일: ${parsed.task}` : parsed.text)
  return 'reply'
}

/** 내 말을 남기고 캐릭터 답을 받는다(예전 첫 답 흐름) */
export async function sendMessage(date: string, text: string, opts: ReplyOpts): Promise<ReplyResult> {
  const t = text.trim()
  if (!t) return 'blocked'
  await addMessage(date, 'me', t.slice(0, 2000))
  return buddyReply(date, opts)
}

/** 기억하기용 짧은 요약 — 기억하기를 켠 사람의, 나만 보기가 아닌 날만. 정해진 말(safety 2)은 넣지 않는다 */
export async function summarizeEntry(date: string, signal: AbortSignal) {
  const db = await getDb()
  const entry = await db.get<DiaryEntry>(ENTRY_BY_DATE, [date])
  if (!entry || getConsent() !== true || !getMemory()) return
  const mine = await db.getAll<{ content: string }>("SELECT content FROM diary_messages WHERE entry_id = ? AND role = 'me' AND COALESCE(safety, 0) = 0 ORDER BY created_at, id", [entry.id])
  const msgs = buildSummaryMessages(entry, mine.map((m) => m.content))
  if (!msgs) return
  const summary = cleanSummary(await aiChat({ purpose: 'diary', messages: msgs }, signal))
  // 그 사이 나만 보기로 바뀌었으면 남기지 않는다
  const again = await db.get<{ private: number | null }>('SELECT private FROM diary_entries WHERE id = ?', [entry.id])
  if (summary && again && !again.private) await saveEntry(date, { summary })
}

/** 할 일로 칩 → 기본함에 새 할 일(같은 제목이 이미 있으면 그것) */
export async function taskFromChip(title: string) {
  const t = chipTitle(title)
  const same = await (await getDb()).get<{ id: string }>('SELECT id FROM tasks WHERE deleted_at IS NULL AND title = ? LIMIT 1', [t])
  if (same) return same.id
  // 기본함(가장 오래된 것). 없으면 만든다(02 §14.1)
  return createTask({ title: t, list_id: await taskListId(null) })
}

// ── 15 §10 · 28 §8.10 대화로 쓰기: 정해진 말 · 이야기 한 턴 · 일기로 옮기기 · 편 저장 ──
/** 정해진 말과 그 답을 한 번에 남긴다(safety = SCRIPTED). 화면이 캐릭터 말을 잠깐 뒤에 보이도록 만든 id를 돌려준다 */
export async function addScripted(date: string, lines: Line[]): Promise<string[]> {
  if (!lines.length) return []
  const entryRef = await saveEntry(date, {})
  const ids: string[] = []
  const at0 = now()
  const rows = lines.map((l) => {
    const at = new Date(Math.max(Date.now(), lastAt + 1))
    lastAt = at.getTime()
    const id = uuid()
    ids.push(id)
    return insert('diary_messages', { id, entry_id: entryRef, role: l.role, content: l.content, safety: SCRIPTED, created_at: at.toISOString(), modified_at: at0 })
  })
  await run(...rows)
  return ids
}
/** 처음부터 다시 묻기: 정해진 행만 지운다(AI 대화·일기 글은 그대로) */
export async function clearScripted(date: string) {
  const id = (await findEntry(date))?.id
  if (!id) return
  const msgs = await (await getDb()).getAll<{ id: string }>('SELECT id FROM diary_messages WHERE entry_id = ? AND safety = ?', [id, SCRIPTED])
  if (msgs.length) await run(...msgs.map((m) => remove('diary_messages', m.id)))
}
/** 하루 한도(429 daily) — 메인 프로세스가 서버 문구를 그대로 넘긴다 */
export const isDailyCap = (e: unknown) => /이 AI 기능을 다 썼|오늘은 다 썼/.test(e instanceof Error ? e.message : String(e))
/** 내 말을 남기고(safety 0) 캐릭터가 한 번 답한다 — 이번 편 행만 보낸다(정해진 말도 대화 맥락으로) */
export async function chatTurn(date: string, text: string | null, opts: Omit<ReplyOpts, 'memoryOn'>): Promise<ReplyResult> {
  if (text?.trim()) await addMessage(date, 'me', text.trim().slice(0, 2000))
  const entry = await findEntry(date)
  if (!entry || !mayCallAi({ consent: getConsent(), private: entry.private, solo: isSolo(date) })) return 'blocked'
  const rows = await (await getDb()).getAll<DiaryMessage>('SELECT * FROM diary_messages WHERE entry_id = ? AND COALESCE(safety, 0) != 1 ORDER BY created_at, id', [entry.id])
  const system = chatSystem({ name: opts.buddy.name, tone: toneOf(opts.buddy.species), date, diary: entry.content })
  const msgs = chatTurns(system, sessionOf(rows).rows)
  if (!msgs) return 'blocked'
  let raw = ''
  raw = await aiChat({ purpose: 'diary', mode: 'chat', messages: msgs }, opts.signal, (d) => { raw += d; opts.onDelta?.(parseBuddyReply(raw).text) }, opts.onQueue)
  const parsed = parseBuddyReply(raw)
  if (!parsed.text) throw new Error('답이 비어 있어요')
  const again = await findEntry(date)
  if (again?.private) return 'blocked'
  await addMessage(date, 'buddy', parsed.task ? `${parsed.text}\n할 일: ${parsed.task}` : parsed.text)
  return 'reply'
}
/** 이번 편 대화 → 1인칭 일기 + 제목 + 태그(서버 옮기기). 모양이 틀리면 던진다(화면은 내 말 그대로로) */
export async function distillSession(date: string, lines: { who: 'me' | 'buddy'; text: string }[], mood: number | null, signal: AbortSignal): Promise<Distilled> {
  const entry = await findEntry(date)
  if (entry?.private || isSolo(date) || getConsent() !== true) throw new Error('나만 보기 날은 옮기지 않아요')
  const ask = () => aiChat({ purpose: 'diary', mode: 'distill', temperature: 0.2, format: DISTILL_SCHEMA as unknown as Record<string, unknown>, messages: distillMessages(lines, { date, mood: moodOf(mood)?.label ?? null }) }, signal)
  // 한 번은 다시: Mac mini가 잠깐 바쁘거나 모양이 틀린 답(작은 모델) — 한도(429)는 다시 하지 않는다
  let d: Distilled | null = null
  try { d = parseDistill(await ask()) } catch (e) { if (isDailyCap(e) || signal.aborted) throw e }
  if (!d && !signal.aborted) d = parseDistill(await ask())
  if (!d) throw new Error('일기로 옮기지 못했어요')
  return d
}
/** 한 편 저장: 그날 글 끝에 이어 붙인다(앞 편을 덮지 않음) */
export async function saveSection(date: string, s: Section, mood: number | null) {
  const entry = await findEntry(date)
  await saveEntry(date, { content: appendSection(entry?.content, s), ...(mood ? { mood } : {}) })
}
/** 저장한 편 고치기: 그 편만 바꾼다 */
export async function replaceSection(date: string, index: number, s: Section) {
  const entry = await findEntry(date)
  const ss = parseSections(entry?.content)
  if (index < 0 || index >= ss.length) return
  ss[index] = s
  await saveEntry(date, { content: ss.map(formatSection).join('\n\n') })
}
/** 오늘 남은 옮기기 횟수(예전 서버·웹 미리보기면 null — 그래도 옮기기는 된다) */
export async function distillQuota(): Promise<{ used: number; limit: number } | null> {
  try { return (await window.sprout?.assistant?.daily?.('diary-distill')) ?? null } catch { return null }
}

// ── 그날 할 일(읽기만): 인사·칩 · 오른쪽 열 `그날 끝낸 할 일` ──
export type DoneRow = { id: string; title: string; completed_at: string }
export function useDayStats(date: string): DayStats & { rows: DoneRow[] } {
  const range = useMemo(() => dayRange(date), [date])
  const done = useQuery<DoneRow>(DONE_SQL, range)
  const open = useQuery<{ n: number }>(DAY_OPEN_SQL, [date, date])?.[0]?.n ?? 0
  const next = addDays(date, 1)
  const nextRows = useQuery<{ id: string; title: string }>(DAY_NEXT_SQL, [next, next])
  return useMemo(() => {
    const rows = done ?? []
    return { total: open + rows.length, done: rows.length, doneTitles: rows.slice().reverse().map((r) => r.title).filter(Boolean), nextTitles: (nextRows ?? []).map((r) => r.title).filter(Boolean), rows }
  }, [open, done, nextRows])
}
