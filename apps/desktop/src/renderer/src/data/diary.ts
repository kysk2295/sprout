// 15 일기 — 날짜별 일기(결정적 id), 성장 캐릭터와의 대화, 동의·나만 보기. v2(§10): 캐릭터와 이야기하고 일기로 옮기기(28 §8.10과 같은 흐름).
// 순수 계산(기분·말투·AI 입력·달력·정해진 말·초안·편 나누기)은 휴대폰과 같이 packages/schema/src/diary.ts·diaryTalk.ts·diaryPrompts.ts에 있다.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { addDays } from '@sprout/schema/time'
import {
  buildBuddyMessages, buildSummaryMessages, chipTitle, cleanSummary, DAY_NEXT_SQL, DAY_OPEN_SQL, dayRange, DONE_SQL, entryId, mayCallAi,
  MEMORY_SQL, moodOf, parseBuddyReply, toneOf, type Buddy, type DiaryEntry, type DiaryMessage, type Memory
} from '@sprout/schema/diary'
import { BYE_ME, chatTurns, clock, END_BUDDY, END_ME, LISTEN_SYSTEM, ownWords, replay, sessionOf, SCRIPTED, warmLineOf, type DayStats, type Line } from '@sprout/schema/diaryTalk'
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
/** 2026-10-25 사용자 결정: 대화 = 늘 AI(혼자 쓰기가 AI 없는 길) — 예전 동의 값('off' 포함)은 보지 않는다. 함수는 부르는 곳이 많아 남긴다 */
export const getConsent = (): boolean | null => true
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
/** 로그아웃: 이 기기의 일기 설정·임시 글을 지운다 — 다음 계정이 앞 사람의 AI 나누기 동의를 물려받지 않게(2026-10-25 QA) */
export function clearDiaryPrefs(): void {
  try {
    for (const k of Object.values(K)) localStorage.removeItem(k)
    for (const k of Object.keys(localStorage)) if (k.startsWith('diary-draft-')) localStorage.removeItem(k)
  } catch { /* 그만 */ }
}
/** 15 §11 · 28 §9 K: 마지막에 쓴 방식(대화 · ✎ 혼자 쓰기)으로 연다. 예전 값 'free'(그냥 쓰기)는 혼자 쓰기로 읽는다 */
export type WriteMode = 'chat' | 'solo'
export const getWriteMode = (): WriteMode => (read(K.mode) === 'solo' || read(K.mode) === 'free' ? 'solo' : 'chat')
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
type ReplyOpts = { buddy: Buddy; memoryOn: boolean; signal: AbortSignal; onDelta?: (visible: string) => void; onQueue?: (position: number) => void
  /** 다 받은 뒤 저장하기 전 — 화면이 글을 다 드러낼 때까지 기다린다(28 §8.11) */
  settle?: () => Promise<void>
  /** 28 §9 E 그냥 들어줘: 질문·조언 없이 맞장구만 */
  listen?: boolean }

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
  const system = chatSystem({ name: opts.buddy.name, tone: toneOf(opts.buddy.species), date, diary: entry.content }) + (opts.listen ? `\n\n${LISTEN_SYSTEM}` : '')
  const msgs = chatTurns(system, sessionOf(rows).rows)
  if (!msgs) return 'blocked'
  let raw = ''
  raw = await aiChat({ purpose: 'diary', mode: 'chat', messages: msgs }, opts.signal, (d) => { raw += d; opts.onDelta?.(parseBuddyReply(raw).text) }, opts.onQueue)
  const parsed = parseBuddyReply(raw)
  if (!parsed.text) throw new Error('답이 비어 있어요')
  await opts.settle?.()
  const again = await findEntry(date)
  if (again?.private) return 'blocked'
  await addMessage(date, 'buddy', parsed.task ? `${parsed.text}\n할 일: ${parsed.task}` : parsed.text)
  return 'reply'
}
/** 이번 편 대화 → 1인칭 일기 + 제목 + 태그(서버 옮기기). 모양이 틀리면 던진다(화면은 내 말 그대로로) */
/** onRaw = 받는 중인 JSON 원문(누적)과 몇 번째 물음인지 — 화면은 제목·본문 글만 뽑아 보인다(partialDistill, 28 §8.11) */
export async function distillSession(date: string, lines: { who: 'me' | 'buddy'; text: string }[], mood: number | null, signal: AbortSignal, onRaw?: (raw: string, attempt: number) => void): Promise<Distilled> {
  const entry = await findEntry(date)
  if (entry?.private || isSolo(date) || getConsent() !== true) throw new Error('나만 보기 날은 옮기지 않아요')
  let attempt = 0
  const ask = () => {
    const n = ++attempt
    let raw = ''
    onRaw?.('', n)
    return aiChat({ purpose: 'diary', mode: 'distill', temperature: 0.2, format: DISTILL_SCHEMA as unknown as Record<string, unknown>, messages: distillMessages(lines, { date, mood: moodOf(mood)?.label ?? null }) }, signal, onRaw ? (d) => { raw += d; onRaw(raw, n) } : undefined)
  }
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

// ── 28 §9 G 자동 마무리(화면 밖): 이번 편에 내 말이 있고 아직 옮기지 않았으면 일기로 옮겨 저장 + 끝·저장 한 줄 ──
// 옮기기가 안 되면(동의 없음·AI 쉼·한도) 내 말 그대로. 화면이 떠 있으면 화면이 직접 한다(같은 편을 두 번 저장하지 않게 finishing). 휴대폰 data.autoFinish와 같다
const finishing = new Set<string>()
export const isFinishing = (date: string) => finishing.has(date)
export const markFinishing = (date: string, on: boolean) => { if (on) finishing.add(date); else finishing.delete(date) }
export async function autoFinish(date: string, signal: AbortSignal): Promise<boolean> {
  if (finishing.has(date)) return false
  finishing.add(date)
  try {
    const entry = await findEntry(date)
    if (!entry) return false
    const rows = await (await getDb()).getAll<DiaryMessage>('SELECT * FROM diary_messages WHERE entry_id = ? AND COALESCE(safety, 0) != 1 ORDER BY created_at, id', [entry.id])
    const S = sessionOf(rows).rows
    const mine = S.filter((m) => m.role === 'me' && !m.safety)
    if (!mine.length) return false
    const mood = replay(S.filter((m) => m.safety === SCRIPTED && m.role === 'me' && m.content !== BYE_ME && m.content !== END_ME).map((m) => m.content)).answers.mood ?? entry.mood ?? null
    if (!S.some((m) => m.role === 'buddy' && m.content === END_BUDDY)) await addScripted(date, [{ role: 'me', content: END_ME }, { role: 'buddy', content: END_BUDDY }])
    let sec: Section = { time: clock(), title: '', tags: [], body: ownWords(mine.map((m) => m.content)) }
    if (getConsent() === true && !entry.private) {
      try {
        const lines = S.filter((m) => m.content !== BYE_ME && m.content !== END_ME).map((m) => ({ who: (m.role === 'me' ? 'me' : 'buddy') as 'me' | 'buddy', text: parseBuddyReply(m.content).text }))
        const d = await distillSession(date, lines, mood, signal)
        sec = { time: sec.time, title: d.title, tags: d.tags, body: d.entry }
      } catch { /* 내 말 그대로 */ }
    }
    if (signal.aborted) return false
    await saveSection(date, sec, mood)
    const n = await (await getDb()).get<{ n: number }>('SELECT count(*) AS n FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ?', dayRange(date))
    await addScripted(date, [{ role: 'buddy', content: warmLineOf({ mood, past: false, done: n?.n ?? 0 }) }])
    return true
  } finally { finishing.delete(date) }
}

// ── 28 §9.2 혼자 쓰기 임시 글: 이 기기에만(diary-draft-<날짜>, 동기화 안 함). 저장하면 지운다 ──
export type SoloDraft = { title: string; body: string; index: number | null }
const draftKey = (date: string) => `diary-draft-${date}`
export function readSoloDraft(date: string): SoloDraft | null {
  try { const v = JSON.parse(read(draftKey(date)) ?? 'null') as SoloDraft | null; return v && typeof v.body === 'string' ? v : null } catch { return null }
}
export const writeSoloDraft = (date: string, d: SoloDraft) => { if (d.title.trim() || d.body.trim()) write(draftKey(date), JSON.stringify(d)); else dropSoloDraft(date) }
export const dropSoloDraft = (date: string) => { try { localStorage.removeItem(draftKey(date)) } catch { /* 그만 */ } }
export const hasSoloDraft = (date: string) => { const d = readSoloDraft(date); return !!d && !!(d.title.trim() || d.body.trim()) }
/** 대화에서 넘어올 때 지금까지 내 말로 새 장을 채워 둔다(이미 쓰던 임시 글이 있으면 그대로) */
export const seedSoloDraft = (date: string, body: string) => { if (body.trim() && !hasSoloDraft(date)) writeSoloDraft(date, { title: '', body: body.trim(), index: null }) }

// ── 28 §10.2 그날의 장면 재료(읽기만): 일정 · 캐릭터 저장 한 줄 ──
export const EVENTS_DAY_SQL = "SELECT title FROM events WHERE deleted_at IS NULL AND substr(start_at, 1, 10) <= ? AND substr(COALESCE(end_at, start_at), 1, 10) >= ? ORDER BY start_at LIMIT 3"
export const WARM_DAY_SQL = `SELECT m.content FROM diary_messages m JOIN diary_entries e ON e.id = m.entry_id WHERE e.date = ? AND m.role = 'buddy' AND m.safety = ${SCRIPTED} ORDER BY m.created_at DESC LIMIT 12`

// ── 28 §10.3 사진 한 장: 기기에서 줄이기(긴 변 1600 · JPEG 0.8 — 다시 인코딩이라 EXIF 위치가 빠짐) → 메인 프로세스가 POST /media → diary_photos 행 ──
// 보기: 메인 프로세스가 GET /media/:id → 파일 캐시 → 데이터 URL. 올리다 끊기면(오프라인·서버 쉼) 이번 실행 동안 대기열에 두고 다시 붙으면 올린다.
export type DiaryPhoto = { id: string; date: string; media_id: string; width: number | null; height: number | null; sort_order: number | null }
export const PHOTOS_SQL = 'SELECT id, date, media_id, width, height, sort_order FROM diary_photos WHERE date = ? ORDER BY sort_order, created_at, id'
export const PHOTOS_BETWEEN_SQL = 'SELECT id, date, media_id, width, height, sort_order FROM diary_photos WHERE date >= ? AND date <= ? ORDER BY date, sort_order, created_at'
export const usePhotos = (date: string): DiaryPhoto[] => useQuery<DiaryPhoto>(PHOTOS_SQL, [date]) ?? EMPTY_PHOTOS
const EMPTY_PHOTOS: DiaryPhoto[] = []
type MediaApi = { upload: (bytes: Uint8Array, mime: string) => Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }>; get: (id: string) => Promise<string | null> }
const mediaApi = (): MediaApi | undefined => (window.sprout as unknown as { media?: MediaApi } | undefined)?.media
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
export const isPhotoFile = (f: { type: string; name?: string }) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name ?? '')

/** 긴 변 1600 · JPEG 0.8로 다시 그리기(EXIF 회전은 반영, 위치는 버려짐) */
export async function downscale(blob: Blob, long = 1600, quality = 0.8): Promise<{ bytes: Uint8Array; width: number; height: number; url: string }> {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  const k = Math.min(1, long / Math.max(bmp.width, bmp.height))
  const width = Math.max(1, Math.round(bmp.width * k)), height = Math.max(1, Math.round(bmp.height * k))
  const c = document.createElement('canvas')
  c.width = width; c.height = height
  const g = c.getContext('2d')
  if (!g) throw new Error('사진을 줄이지 못했어요')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, width, height)
  g.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  const out = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('사진을 줄이지 못했어요'))), 'image/jpeg', quality))
  return { bytes: new Uint8Array(await out.arrayBuffer()), width, height, url: c.toDataURL('image/jpeg', 0.6) }
}

type Pending = { localId: string; date: string; bytes: Uint8Array; width: number; height: number; sort: number; at: string; url: string }
let pending: Pending[] = []
const pendingSubs = new Set<() => void>()
const setPending = (p: Pending[]) => { pending = p; pendingSubs.forEach((f) => f()) }
export function usePendingPhotos(date: string): { localId: string; url: string }[] {
  const all = useSyncExternalStore((f) => { pendingSubs.add(f); return () => { pendingSubs.delete(f) } }, () => pending)
  return useMemo(() => all.filter((p) => p.date === date).map((p) => ({ localId: p.localId, url: p.url })), [all, date])
}
const shownUrls = new Map<string, string>() // 올린 기기: 받기 전에 줄인 그림으로 바로
let flushing: Promise<string | null> | null = null
/** 대기열을 올린다. 다시 해도 같은 결과(한도·형식)면 빼고 그 이유를 돌려준다 */
export function flushPhotos(): Promise<string | null> {
  flushing ??= (async () => {
    let err: string | null = null
    try {
      const api = mediaApi()
      if (!api) return '이 화면에선 사진을 붙일 수 없어요'
      for (const p of [...pending]) {
        const r = await api.upload(p.bytes, 'image/jpeg')
        if (!r.ok) {
          if (r.status === 0 || r.status >= 500 || r.status === 401) { err = r.error; break } // 다음에 다시
          setPending(pending.filter((x) => x.localId !== p.localId))
          err = r.error
          continue
        }
        shownUrls.set(r.id, p.url)
        await run(insert('diary_photos', { id: uuid(), date: p.date, media_id: r.id, width: p.width, height: p.height, sort_order: p.sort, created_at: p.at, modified_at: now() }))
        setPending(pending.filter((x) => x.localId !== p.localId))
      }
    } finally { flushing = null }
    return err
  })()
  return flushing
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (pending.length) void flushPhotos() })
  window.setInterval(() => { if (pending.length) void flushPhotos() }, 30_000)
}
/** 그날에 사진 붙이기(여러 장이면 차례로). 결과 = 붙인 장 수 · 안내(오류) */
export async function addPhotos(date: string, files: Blob[], count: number): Promise<{ added: number; error: string | null }> {
  let n = 0
  let error: string | null = null
  for (const f of files.slice(0, Math.max(0, 10 - count))) {
    try {
      const img = await downscale(f)
      setPending([...pending, { localId: uuid(), date, ...img, sort: count + n, at: now() }])
      n++
    } catch { error = '이 사진은 열 수 없어요' }
  }
  if (files.length > 10 - count) error = '하루에 사진은 10장까지예요'
  const e = n ? await flushPhotos() : null
  return { added: n, error: e ?? error }
}
/** 사진 지우기: 행을 지우면 서버가 하루 뒤 바이트를 정리한다 */
export const removePhoto = (id: string) => run(remove('diary_photos', id))
const urlCache = new Map<string, string>()
/** 사진 데이터 URL(받는 중이면 null) */
export function usePhotoUrl(mediaId: string | null | undefined): string | null {
  const first = mediaId ? urlCache.get(mediaId) ?? shownUrls.get(mediaId) ?? null : null
  const [url, setUrl] = useState<string | null>(first)
  useEffect(() => {
    if (!mediaId) { setUrl(null); return }
    const hit = urlCache.get(mediaId)
    if (hit) { setUrl(hit); return }
    setUrl(shownUrls.get(mediaId) ?? null)
    let live = true
    void mediaApi()?.get(mediaId).then((u) => { if (u) urlCache.set(mediaId, u); if (live && u) setUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [mediaId])
  return url
}
