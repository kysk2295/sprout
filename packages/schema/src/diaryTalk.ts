// 28 §8 일기 v2 — 캐릭터와 대화로 쓰기: 정해진 말(AI 없음)과 그 순서. 순수 계산 — 휴대폰·데스크톱이 같이 쓴다(15 §10.8, 시험: 휴대폰 talk.test.ts · diaryTalk.test.ts).
// 인사(시간대 + 그날 할 일 수) → 기분 빠른 답 → 반응 → 질문 3개(칩 = 그날 끝낸 할 일·다음 날 할 일 제목) → 초안(내 말 그대로) → 저장 뒤 한 줄.
// 저장: 정해진 말과 그 답은 diary_messages에 safety = SCRIPTED(2)로 남긴다(스키마 그대로) — 데스크톱은 safety≠0 행을 보이지도, AI에 보내지도 않는다.
//   AI 답·이어서 이야기는 safety 0. 그래서 AI 입력은 "일기 글 + AI 대화"뿐이다(정해진 질문·답은 일기 글에 이미 들어 있다 — 환각 줄이기 §8.1-7).
// 대화 단계는 저장된 내 답(정해진 행 role 'me') 개수로 다시 만든다: 0 = 기분, 1 = 질문 1, 2 = 질문 2, 3 = 질문 3, 4 = 초안.
import { josa, MOODS, moodOf, parseBuddyReply } from './diary.ts'

export const SCRIPTED = 2
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
export const timeOfDay = (hour: number): TimeOfDay => (hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 22 ? 'evening' : 'night')
export const TIME_LABEL: Record<TimeOfDay, string> = { morning: '아침', day: '낮', evening: '저녁', night: '밤' }

/** 그날 할 일(기기 안 tasks에서 읽음): total = 그날 마감인 열린 할 일 + 그날 끝낸 할 일, done = 그날 끝낸 할 일 */
export type DayStats = { total: number; done: number; doneTitles: string[]; nextTitles: string[] }
export const EMPTY_STATS: DayStats = { total: 0, done: 0, doneTitles: [], nextTitles: [] }

const md = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`

/** 처음 쓰는 사람에게만(그 기기에서 대화 일기를 한 번도 저장하지 않았을 때) */
export const introLine = (name: string) => `안녕, 나는 ${josa(name, '야', '이야')}. 오늘 하루를 편하게 이야기해 줘. 같이 일기로 남겨 줄게.`

/** 1 인사: 시간대 머리말 + 그날 데이터. 지난 날은 `10월 4일 이야기구나. …` */
export function greetingOf(o: { date: string; today: string; hour: number; stats: DayStats }): string {
  const { total, done } = o.stats
  if (o.date !== o.today) return `${md(o.date)} 이야기구나. ${total ? (done ? `그날 할 일 ${total}개 중 ${done}개 끝냈더라. 그날은 어땠어?` : `그날 할 일이 ${total}개 있었더라. 그날은 어땠어?`) : '그날은 어땠어?'}`
  const t = timeOfDay(o.hour)
  const lead = { morning: '좋은 아침!', day: '점심은 먹었어?', evening: '저녁이네.', night: '늦게까지 수고했어.' }[t]
  let data: string
  if (t === 'morning') data = total ? `오늘 할 일이 ${total}개 있어. 지금 기분은 어때?` : '오늘 기분부터 적어 둘까?'
  else if (!total) data = '오늘은 할 일 없이 지나갔네. 어떤 하루였어?'
  else if (done >= total) data = `오늘 할 일 ${total}개 다 끝냈어! 어땠어?`
  else if (!done) data = `오늘 할 일이 ${total}개 있었네. 어떤 하루였어?`
  else data = `오늘 할 일 ${total}개 중 ${done}개 끝냈네! 어땠어?`
  return `${lead} ${data}`
}

/** 2 기분 반응(기분별 고정). 기분 대신 글로 답하면 null */
export const REACT: Record<number, string> = { 1: '그랬구나. 힘든 날이었네.', 2: '음, 별로였구나.', 3: '그럭저럭이었구나.', 4: '좋았다니 나도 좋다!', 5: '최고였다니! 나도 신나.' }
export const REACT_TEXT = '그렇구나, 들려줘서 고마워.'
/** 빠른 답 얼굴 아래 짧은 이름 */
export const moodShort = (v: number) => (moodOf(v)?.label ?? '').replace('그저 그랬어요', '그저 그래').replace(/였어요$|었어요$/, '')

export type Step = 'q1' | 'q2' | 'q3'
export const SKIP = '건너뛸래'
export const NOTHING = '딱히 없었어'
const SKIPS = new Set([SKIP, NOTHING])
export const isSkip = (t: string) => SKIPS.has(t.trim())

/** 3~5 질문과 칩. 기분 1~2면 마음에 걸린 쪽, 3~5(또는 기분 없음)면 좋았던 쪽 */
export function questionOf(step: Step, o: { mood: number | null; past: boolean; stats: DayStats }): { q: string; chips: string[] } {
  const low = !!o.mood && o.mood <= 2
  if (step === 'q1') {
    if (low) return { q: '뭐가 제일 마음에 걸렸어?', chips: ['일이 많았어', '사람 때문에', '몸이 안 좋았어'] }
    return { q: '제일 좋았던 순간은 뭐였어?', chips: [...o.stats.doneTitles.slice(0, 2).map((t) => `${clipTitle(t)} 끝냄`), '산책했어'] }
  }
  if (step === 'q2') return low ? { q: '그래도 괜찮았던 거 하나만 꼽자면?', chips: ['밥은 맛있었어', '일찍 잤어'] } : { q: '힘들었던 건 없었어?', chips: [NOTHING] }
  if (o.past) return { q: '그다음 날 하고 싶었던 건 뭐였어?', chips: ['일찍 자기'] }
  return { q: '내일 하나만 정한다면 뭐 할래?', chips: [...o.stats.nextTitles.slice(0, 2).map(clipTitle), '일찍 자기'] }
}
const clipTitle = (t: string) => { const s = t.trim().replace(/\s+/g, ' '); return s.length > 24 ? `${s.slice(0, 23)}…` : s }

/** 문장 끝: 마침표·물음표·느낌표·~·다·요로 끝나지 않으면 마침표 */
export function endLine(s: string): string {
  const t = s.trim()
  return /[.!?。~…다요]$/.test(t) ? t : `${t}.`
}

/** 정해진 행에서 다시 만든 대화 상태 */
export type Answers = { mood: number | null; lead: string | null; q1?: string; q2?: string; q3?: string }
export type Replayed = { answers: Answers; step: 'mood' | Step | 'draft'; count: number }
/** 내 정해진 답(role 'me', safety SCRIPTED)을 순서대로 → 단계·답. 첫 답이 기분 이름이면 기분, 아니면 글로 한 답(lead) */
export function replay(mine: string[]): Replayed {
  const answers: Answers = { mood: null, lead: null }
  const [first, ...rest] = mine
  if (first !== undefined) {
    const m = MOODS.find((x) => x.label === first.trim())
    if (m) answers.mood = m.value
    else answers.lead = first.trim() || null
  }
  const steps: Step[] = ['q1', 'q2', 'q3']
  rest.slice(0, 3).forEach((a, i) => { answers[steps[i]] = a })
  const n = Math.min(mine.length, 4)
  return { answers, step: n === 0 ? 'mood' : n === 4 ? 'draft' : steps[n - 1], count: n }
}

/** 6 초안: 답을 **그대로** 줄마다. 앱이 넣는 말은 질문 3 앞 `내일은 `(지난 날은 `다음 날은 `)과 끝 마침표뿐. 건너뛴 답은 빠짐 */
export function composeDraft(a: Answers, opts: { past?: boolean } = {}): string {
  const out: string[] = []
  if (a.lead) out.push(endLine(a.lead))
  for (const k of ['q1', 'q2'] as const) { const v = a[k]; if (v && v.trim() && !isSkip(v)) out.push(endLine(v)) }
  const q3 = a.q3?.trim()
  if (q3 && !isSkip(q3)) {
    const body = q3.replace(/^(내일은?|다음\s?날은?|그다음\s?날은?)\s*/, '')
    out.push(`${opts.past ? '다음 날은' : '내일은'} ${endLine(body)}`)
  }
  return out.join('\n')
}
export const DRAFT_LINE = '좋아, 네 말 그대로 일기로 묶어 봤어. 고칠 데 있으면 눌러서 고쳐 줘.'
export const DRAFT_LINE_EMPTY = '오늘은 기분만 남겨도 충분해. 저장할까?'
export const draftLineOf = (draft: string) => (draft.trim() ? DRAFT_LINE : DRAFT_LINE_EMPTY)

/** 7 저장 뒤 한 줄 */
export function warmLineOf(o: { mood: number | null; past: boolean; done: number }): string {
  if (o.mood && o.mood <= 2) return o.past ? '잘 남겼어. 그날도 버텨 줘서 고마워.' : '잘 남겼어. 오늘은 푹 쉬자.'
  if (o.past) return '잘 남겼어. 그날 이야기 들려줘서 고마워.'
  return o.done ? `잘 남겼어. 오늘 ${o.done}개나 해낸 거 잊지 마.` : '잘 남겼어. 내일 또 이야기해.'
}
export const SOLO_LINE = '알겠어. 정해진 말만 할게. 일기는 너만 봐.'
export const BYE_ME = '오늘은 여기까지'
export const BYE_BUDDY = '응, 잘 자. 내일 또 와.'

/** 대화 다음 단계에서 남길 정해진 행(내 답 + 캐릭터 말). 저장은 한 번에, 화면은 캐릭터 말을 잠깐 뒤에 보인다 */
export type Line = { role: 'me' | 'buddy'; content: string }
/** 기분 뒤 이어지는 말: q1 = 정해진 질문(혼자 쓰기·나만 보기), open = 편하게 말해 달라는 한 줄(AI와 이야기), none = 동의 카드를 먼저 */
export type Follow = 'q1' | 'open' | 'none'
export const OPEN_LINE = '무슨 일 있었어? 편하게 말해 줘. 한 줄도 괜찮아.'
export const MORE_LINE = '응, 더 들려줘.'
export function nextLines(o: { mine: string[]; answer: { mood?: number; text?: string }; date: string; today: string; hour: number; stats: DayStats; name: string; intro: boolean; follow?: Follow; greet?: boolean }): Line[] {
  const r = replay(o.mine)
  const past = o.date !== o.today
  const out: Line[] = []
  if (r.step === 'draft') return out
  if (r.step === 'mood') {
    if (o.intro && o.greet !== false) out.push({ role: 'buddy', content: introLine(o.name) })
    if (o.greet !== false) out.push({ role: 'buddy', content: greetingOf(o) })
    const mood = o.answer.mood && moodOf(o.answer.mood) ? o.answer.mood : null
    const text = (o.answer.text ?? '').trim()
    if (!mood && !text) return []
    out.push({ role: 'me', content: mood ? moodOf(mood)!.label : text })
    out.push({ role: 'buddy', content: mood ? REACT[mood] : REACT_TEXT })
    const follow = o.follow ?? 'q1'
    if (follow === 'q1') out.push({ role: 'buddy', content: questionOf('q1', { mood, past, stats: o.stats }).q })
    else if (follow === 'open') out.push({ role: 'buddy', content: OPEN_LINE })
    return out
  }
  const text = (o.answer.text ?? '').trim()
  if (!text) return []
  out.push({ role: 'me', content: text.slice(0, 1000) })
  if (r.step === 'q1' || r.step === 'q2') out.push({ role: 'buddy', content: questionOf(r.step === 'q1' ? 'q2' : 'q3', { mood: r.answers.mood, past, stats: o.stats }).q })
  else {
    const answers = replay([...o.mine, text]).answers
    out.push({ role: 'buddy', content: draftLineOf(composeDraft(answers, { past })) })
  }
  return out
}

/** 이번 주 돌아보기 한 줄(AI 없음): 남긴 날·좋았던 날 + (데이터가 있으면) 할 일과 기분 */
export function weekLineOf(week: { date: string; mood: number | null; written: boolean; done: number }[]): string {
  const n = week.filter((d) => d.written).length
  if (!n) return '이번 주는 아직 비어 있어. 오늘 한 줄부터 남겨 볼까?'
  const good = week.filter((d) => d.mood && d.mood >= 4).length
  const low = week.filter((d) => d.mood && d.mood <= 2).length
  let tail = ''
  const moods = week.filter((d) => d.mood)
  const busy = moods.filter((d) => d.done >= 3)
  const calm = moods.filter((d) => d.done < 3)
  if (busy.length && calm.length) {
    const avg = (xs: typeof moods) => xs.reduce((s, d) => s + (d.mood ?? 0), 0) / xs.length
    const gap = avg(busy) - avg(calm)
    if (gap >= 0.5) tail = ' 할 일을 많이 끝낸 날 기분이 좋았네.'
    else if (gap <= -0.5) tail = ' 바쁜 날엔 조금 지쳤던 것 같아.'
  }
  return `이번 주는 ${n}일 남겼고, 좋았던 날이 ${good}번${low ? `, 힘들었던 날이 ${low}번` : ''}이었어.${tail}`
}

// ── 28 §8.10 대화로 쓰기(사용자 스킬 conversational-journal-to-wiki): 자유 대화 → 일기로 옮기기 ──
/** 저장 뒤 정해진 한 줄(= 한 편의 끝). 모두 "잘 남겼어."로 시작한다 */
export const isWarm = (content: string) => content.startsWith('잘 남겼어.')
type Row = { role: string; content: string; safety: number | null; created_at: string }
/** 이번 편 = 마지막 저장 한 줄 뒤의 행들. boundaries = 저장 한 줄 개수(저장한 편 수) */
export function sessionOf<T extends Row>(rows: T[]): { rows: T[]; boundaries: number } {
  let last = -1
  let n = 0
  rows.forEach((r, i) => { if (r.safety === SCRIPTED && r.role === 'buddy' && isWarm(r.content)) { last = i; n++ } })
  return { rows: rows.slice(last + 1), boundaries: n }
}
/** 머뭇거릴 때만 꺼내는 질문(정해진 질문 3개 = 살짝 미는 말). 이미 물은 것은 건너뛰고, 다 물었으면 null */
export function nudgeOf(asked: string[], o: { mood: number | null; past: boolean; stats: DayStats }): { q: string; chips: string[] } | null {
  for (const step of ['q1', 'q2', 'q3'] as const) {
    const q = questionOf(step, o)
    if (!asked.includes(q.q)) return q
  }
  return null
}
/** AI 없이 옮길 때(옮기기 실패·한도): 내가 한 말만 줄마다(기분 이름·건너뛴 답·정리해 달라는 말은 빠짐) */
export function ownWords(texts: string[]): string {
  return texts.map((t) => t.trim()).filter((t) => t && !isSkip(t) && !MOODS.some((m) => m.label === t) && !asksDistill(t) && t !== BYE_ME).map(endLine).join('\n')
}
/** 직접 "일기로 정리해 줘·저장해 줘"라고 쓰면 옮기기 */
export const asksDistill = (t: string) => /(일기로?\s*(정리|써|만들|남겨)|정리해\s*(줘|주라|줄래)|저장해\s*(줘|주라|줄래))/.test(t.replace(/\s+/g, ' '))
/** 이야기 한 턴의 AI 입력: system + 이번 편 행(나 = user, 캐릭터 = assistant, 같은 쪽은 합침). 마지막은 꼭 사용자 말 */
export function chatTurns(system: string, rows: { role: string; content: string }[], max = 16): { role: 'system' | 'user' | 'assistant'; content: string }[] | null {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const r of rows.slice(-max)) {
    const role = r.role === 'me' ? 'user' : 'assistant'
    const text = r.content.length > 1500 ? `${r.content.slice(0, 1500)}…` : r.content
    const last = out[out.length - 1]
    if (last && last.role === role) last.content += `\n${text}`
    else out.push({ role, content: text })
  }
  if (out.at(-1)?.role !== 'user') return null
  return [{ role: 'system', content: system }, ...out]
}
/** 시각 머리 HH:MM(기기 시각) */
export const clock = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`


// ── 15 §10 데스크톱도 같이 쓰는 대화 상태(휴대폰 Conversation.tsx와 같은 계산) ──
type TalkRow = { id?: string; role: string; content: string; safety: number | null; created_at: string }
/** 그날 대화 행 → 이번 편 상태. safety 1(예전 위기 카드)은 버린다 */
export function talkStateOf<T extends TalkRow>(messages: T[]) {
  const all = messages.filter((m) => m.safety !== 1)
  const session = sessionOf(all)
  const S = session.rows
  const scriptedMine = S.filter((m) => m.safety === SCRIPTED && m.role === 'me' && m.content !== BYE_ME).map((m) => m.content)
  const r = replay(scriptedMine)
  const myTalk = S.filter((m) => m.role === 'me' && !m.safety)
  const started = scriptedMine.length > 0 || S.some((m) => m.role === 'buddy' && m.content === MORE_LINE) || myTalk.length > 0
  const bye = S.some((m) => m.role === 'buddy' && m.content === BYE_BUDDY)
  const asked = S.filter((m) => m.role === 'buddy' && m.safety === SCRIPTED).map((m) => m.content)
  return { all, S, boundaries: session.boundaries, scriptedMine, r, myTalk, started, bye, asked, mood: r.answers.mood ?? null }
}
export type Phase = 'mood' | 'consent' | 'talk' | 'q1' | 'q2' | 'q3' | 'draft' | 'after' | 'end'
/** 지금 단계: 초안 → 시작 전(끝·저장 뒤·기분) → 동의 카드 → 이야기(AI) / 정해진 질문 */
export function talkPhase(o: { draft: boolean; started: boolean; bye: boolean; boundaries: number; sections: number; again: boolean; consentPending: boolean; aiFlow: boolean; step: Replayed['step'] }): Phase {
  if (o.draft) return 'draft'
  if (!o.started) return o.bye ? 'end' : (o.boundaries || o.sections) && !o.again ? 'after' : 'mood'
  if (o.consentPending) return 'consent'
  if (o.aiFlow) return 'talk'
  return o.step === 'draft' ? 'draft' : o.step === 'mood' ? 'q1' : o.step
}
/** 이번 편 → 옮기기 입력 줄(마침 인사 빼고, 캐릭터 답의 할 일 줄은 뺌) */
export function sessionLinesOf(rows: TalkRow[]): { who: 'me' | 'buddy'; text: string }[] {
  return rows.filter((m) => m.content !== BYE_ME).map((m) => ({ who: (m.role === 'me' ? 'me' : 'buddy') as 'me' | 'buddy', text: m.safety ? m.content : parseBuddyReply(m.content).text }))
}
/** 대화 없이 쓴 편 수(저장 한 줄보다 편이 많으면 그만큼 맨 위에) */
export const leadingSections = (sections: number, warmLines: number) => Math.max(0, sections - warmLines)
/** 저장 한 줄 수 */
export const warmCountOf = (rows: TalkRow[]) => rows.filter((m) => m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)).length
