// 47 §2.2 길잡이(정해진 규칙, 모델 앞) — 결정 ④ "추천안대로": 확인 답·쓰기(만들기·완료·옮기기·지우기)·마지막으로 한 날·기간 할 일/일정·일기·상대 날짜는
// 앱이 먼저 푼다(research 39: 모델 혼자면 쓰기 0/15, 날짜·요일 오답이 가장 흔함). 길잡이에 안 걸리는 말만 모델이 처음부터 고른다.
// 결정 ② 말로 확인: 떠 있는 확인 카드 하나에만 '응·좋아·넣어 줘', 지우기는 단추로만. 결정 ③ 일기: 기본 꺼짐(설정 + 일기 AI 동의).
import { recognize } from './recognition.ts'
import { recallAsk, periodOf } from './recall.ts'
import { dayGap, mdw, mondayOf, plusDays, weekdayOf, ymd, type ToolName } from './assistantTools.ts'
import { words, type AliasMap, type ConfirmCard, type ConfirmOp, type Facts, type ListLite } from './assistantExec.ts'

export type Band = 'noweb' | 'care'
/** 이어 받을 것(§10): 한 대화 안에서만. 별칭·최근 항목·주제·최근 도구 요약 한 줄 */
export type AgentMemory = { aliases: AliasMap; recent: { alias: string; title: string; date?: string | null }[]; subject?: string; lastTools?: string; facts?: Facts }
export const emptyMemory = (): AgentMemory => ({ aliases: {}, recent: [] })

export type Prefetch = { name: ToolName; args: Record<string, unknown> }
export type Route =
  | { kind: 'confirm'; key: string }
  | { kind: 'cancel'; key: string }
  | { kind: 'fixed'; text: string; hint?: string; action?: 'diary' | 'settings' }
  | { kind: 'create'; title: string; start: string; due: string; repeat: string; said: string; durationMin?: number; assumedPm?: boolean; basis?: string; list?: string }
  | { kind: 'update'; op: Exclude<ConfirmOp, 'create'>; query: string; moveTo?: string; said?: string }
  | { kind: 'prefetch'; calls: Prefetch[] }
  | { kind: 'model' }
export type Routed = { route: Route; bands: Band[]; notes: string[]; dataQuestion: boolean }

const END = '[.!?~…\\s]*$'
const YES = new RegExp(`^(응+|어+|웅|ㅇㅇ|ㅇ|좋아|좋아요|그래|그래요|넣어|넣어\\s*줘|넣어줘|그렇게\\s*해(\\s*줘)?|오케이|ok|okay|콜|부탁해|네|예|완료해\\s*줘|옮겨\\s*줘|해\\s*줘)${END}`, 'i')
const NO = new RegExp(`^(아니|아냐|아니야|취소|취소해(\\s*줘)?|됐어|안\\s*넣어|싫어|그만|ㄴㄴ|노|하지\\s*마)${END}`, 'i')
const CREATE_VERB = /\s*(을|를)?\s*(일정으로|할\s*일로)?\s*(잡아|넣어|추가해|등록해|예약해|만들어|적어|기록해)\s*(줘|주라|줄래|주세요|둬|놔|줄\s*수\s*있어)?\s*[.!?~]*\s*$/
const COMPLETE_VERB = /\s*(을|를)?\s*(끝냈어|끝났어|다\s*했어|했어|완료했어)?\s*[,.]?\s*(완료로|완료\s*처리|체크)\s*(해|해\s*줘|해줘|해\s*주라|해\s*줄래|좀\s*해\s*줘)?\s*[.!?~]*$|\s*(을|를)?\s*(끝냈어|다\s*했어)\s*[.!?~]*$/
const MOVE_VERB = /\s*(을|를)?\s*(\S+로|\S+으로)?\s*(옮겨|미뤄|연기해|넘겨)\s*(줘|주라|줄래|주세요)?\s*[.!?~]*$/
const DELETE_VERB = /\s*(을|를)?\s*(지워|삭제해|없애)\s*(줘|주라|줄래|주세요|버려)?\s*[.!?~]*$/
const LEAD = /^(그럼|그러면|그리고|그럼\s*이제|음+|아+|혹시|그냥)\s+/
const GENERIC = /^(예약|일정|약속|그거|그것|그\s*일|이거|그걸|거기)$/
const NOWEB = /(가격|시세|주가|환율|날씨|뉴스|속보|경기\s*결과|비트코인|이더리움|실시간|지금\s*몇\s*도)/
const CARE = /(무슨\s*약|먹는\s*약|약을|약\s*먹|약\s*추천|병원|증상|두통|복통|치통|아파|통증|열이\s*나|감기|우울|주식|코인\s*(투자|사도|살까|팔까)|투자|대출|펀드|매수|매도|종목|적금|이자율)/
const DIARY = /일기/
const DIARY_WRITE = /일기\s*(를\s*)?(쓰|적|남기)/
/** 내 데이터 질문(§8.1-2 재촉 근거 — research 39 v3) */
const DATA_Q = /(내가\s.*(했|갔|적|썼|만|샀)|내\s|나\s|나의|작년에|할\s*일|일정|메모|기록|몇\s*번|지났|레벨|프로젝트|회의록|며칠|생일|예약|완료|마감|약속|스케줄)/
const TASK_WORD = /(할\s*일|투두|해야\s*(할|하는|돼)|급해|급한|먼저\s*할|마감|남은|과제|숙제)/
const EVENT_WORD = /(일정|약속|스케줄|캘린더|미팅|회의|모임)/
const DONE_WORD = /(끝낸|끝냈|완료한|한\s*일|했던|해냈|뭐\s*했|했어|했지|했나|했더라)/
const WHAT = /(뭐\s*(있|해|하|했)|무슨\s*일|몇\s*개)/

/** 기간 말 → [from, to]. '다음 주 수요일' 같은 하루, '10월 20일' 하루, 오늘·내일·모레·이번/다음/지난 주·이번/지난 달 */
export function periodIn(text: string, now: Date): { from: string; to: string; word: string } | null {
  const t = text.replace(/\s+/g, ' ')
  const today = ymd(now), mon = mondayOf(now)
  const wd = /(다음\s*주|이번\s*주|지난\s*주|저번\s*주)?\s*([일월화수목금토])요일/.exec(t)
  if (wd) {
    const target = ['일', '월', '화', '수', '목', '금', '토'].indexOf(wd[2])
    const idx = (target + 6) % 7 // 월=0
    const base = wd[1] ? (/다음/.test(wd[1]) ? plusDays(mon, 7) : /지난|저번/.test(wd[1]) ? plusDays(mon, -7) : mon) : null
    const day = base ? plusDays(base, idx) : plusDays(today, (target - now.getDay() + 7) % 7)
    return { from: day, to: day, word: wd[0].trim() }
  }
  const md = /(\d{1,2})월\s*(\d{1,2})일/.exec(t)
  if (md) { const d = `${now.getFullYear()}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`; if (plusDays(d, 0) === d) return { from: d, to: d, word: md[0] } }
  const rel: [RegExp, number][] = [[/모레/, 2], [/내일/, 1], [/글피/, 3]]
  for (const [re, n] of rel) if (re.test(t)) { const d = plusDays(today, n); return { from: d, to: d, word: re.source } }
  if (/다음\s*주/.test(t)) return { from: plusDays(mon, 7), to: plusDays(mon, 13), word: '다음 주' }
  const p = periodOf(t, now)
  return p ? { from: p.from, to: p.to, word: p.scope } : null
}

/** 상대 날짜를 실제 날짜로 풀어 사용자 말 옆에 붙인다(§2.2): '[다음 주 수요일 = 10월 14일(수)]' */
export function dateNotes(text: string, now: Date): string[] {
  const outs: string[] = []
  const today = ymd(now), mon = mondayOf(now)
  for (const m of text.matchAll(/(다음\s*주|이번\s*주|지난\s*주|저번\s*주)\s*([일월화수목금토])요일/g)) {
    const idx = (['일', '월', '화', '수', '목', '금', '토'].indexOf(m[2]) + 6) % 7
    const base = /다음/.test(m[1]) ? plusDays(mon, 7) : /지난|저번/.test(m[1]) ? plusDays(mon, -7) : mon
    outs.push(`${m[0].replace(/\s+/g, ' ')} = ${plusDays(base, idx)}`)
  }
  for (const [w, n] of [['그제', -2], ['어제', -1], ['오늘', 0], ['내일', 1], ['모레', 2], ['글피', 3]] as const) if (text.includes(w) && !(w === '오늘' && outs.length)) outs.push(`${w} = ${plusDays(today, n)}`)
  const later = /(\d{1,3})\s*일\s*(뒤|후)/.exec(text)
  if (later) outs.push(`${later[0]} = ${plusDays(today, Number(later[1]))}`)
  if (/다음\s*주/.test(text) && !outs.some((o) => o.startsWith('다음 주'))) outs.push(`다음 주 = ${plusDays(mon, 7)}~${plusDays(mon, 13)}`)
  if (/이번\s*주/.test(text) && !outs.some((o) => o.startsWith('이번 주'))) outs.push(`이번 주 = ${mon}~${plusDays(mon, 6)}`)
  return outs.slice(0, 4).map((o) => o.replace(/(\d{4}-\d{2}-\d{2})/g, (d) => `${d}(${weekdayOf(d)})`))
}

export const bandsOf = (text: string): Band[] => [...(NOWEB.test(text) ? ['noweb' as const] : []), ...(CARE.test(text) ? ['care' as const] : [])]
export const isDataQuestion = (text: string) => DATA_Q.test(text) && !NOWEB.test(text)

/** 쓰기 말에서 제목 다듬기: 앞 접속사·끝 조사 떼기 */
const cleanTitle = (s: string) => s.replace(LEAD, '').replace(/[,，]\s*$/, '').replace(/\s*(을|를|좀|도|은|는)\s*$/, '').replace(/^(을|를)\s+/, '').trim()

export function route(text: string, ctx: { now: Date; pending?: ConfirmCard | null; diary: boolean; memory: AgentMemory; lists?: ListLite[] }): Routed {
  const t = text.trim()
  const bands = bandsOf(t)
  const notes = dateNotes(t, ctx.now)
  const dataQuestion = isDataQuestion(t)
  const r = (route: Route): Routed => ({ route, bands, notes, dataQuestion })
  // ① 확인 카드에 말로 답하기(결정 ②) — 하나만 떠 있을 때. 지우기는 단추로만
  const p = ctx.pending
  if (p && p.state === 'pending') {
    if (NO.test(t)) return r({ kind: 'cancel', key: p.key })
    if (YES.test(t)) return p.op === 'delete' ? r({ kind: 'fixed', text: '지우기는 카드의 [지우기] 단추로만 할 수 있어.' }) : r({ kind: 'confirm', key: p.key })
  }
  // ② 일기(결정 ③): 꺼져 있으면 정해진 답, 일기 쓰기는 일기 탭으로
  if (DIARY_WRITE.test(t) && !/(뭐|언제|썼|적었|했)/.test(t.replace(DIARY_WRITE, ''))) return r({ kind: 'fixed', text: '좋아, 일기 탭에서 같이 써 보자.', action: 'diary' })
  if (DIARY.test(t) && !ctx.diary) return r({ kind: 'fixed', text: '일기는 AI가 못 보게 해 뒀어.', hint: '설정 › AI › 일기 보기를 켜면 같이 볼 수 있어요', action: 'settings' })
  // ③ 쓰기: 만들기 — 빠른 입력 인식기 + 비서 규칙(시에·오후·M월 D일·길이)
  if (CREATE_VERB.test(t) && !/(어떻게|방법|알려)/.test(t)) {
    const body = cleanTitle(t.replace(CREATE_VERB, ''))
    const rec = recognize(body, ctx.lists ?? [], [], ctx.now, { assistant: true })
    let title = cleanTitle(rec.title.replace(/^(에|로|으로)\s+/, '').replace(/\s+(에|로|으로)$/, ''))
    let basis: string | undefined
    const subject = ctx.memory.subject
    if ((!title || GENERIC.test(title)) && subject) { basis = `이전 대화의 “${subject}”을 이어 받음`; title = `${subject} ${title}`.trim() }
    if (title && !GENERIC.test(title)) {
      const listWord = /(\S+)\s*리스트(에|로)?/.exec(body)?.[1]
      return r({ kind: 'create', title: title.replace(/\s*\S+\s*리스트(에|로)?\s*/, ' ').trim(), start: rec.start_at ?? '', due: rec.due_at ?? '', repeat: rec.repeat_rule ?? '', said: rec.recognized.join(' ').replace(/(에|로|으로|부터|까지|쯤에?|경에?)(?=\s|$)/g, ''), ...(rec.duration_min ? { durationMin: rec.duration_min } : {}), ...(rec.assumed_pm ? { assumedPm: true } : {}), ...(basis ? { basis } : {}), ...(listWord ? { list: listWord } : {}) })
    }
  }
  // ④ 쓰기: 완료·옮기기·지우기 → 후보를 찾아 확인 카드
  const upd = ([['complete', COMPLETE_VERB], ['delete', DELETE_VERB], ['move', MOVE_VERB]] as const).find(([, re]) => re.test(t))
  if (upd) {
    const [op, re] = upd
    const rest = t.replace(re, '')
    let moveTo: string | undefined, said: string | undefined
    let query = rest
    if (op === 'move') {
      const per = periodIn(t, ctx.now)
      if (per && per.from === per.to) { moveTo = per.from; said = per.word; query = query.replace(new RegExp(per.word.replace(/\s+/g, '\\s*') + '(로|으로|에)?'), ' ') }
      else if (/미뤄|연기/.test(t)) { moveTo = plusDays(ymd(ctx.now), 1); said = '내일' }
    }
    query = cleanTitle(query.replace(/(내일|모레|오늘)(로|으로)?/g, ' ').replace(/[,，]/g, ' '))
    if (words(query).length) return r({ kind: 'update', op, query, ...(moveTo ? { moveTo } : {}), ...(said ? { said } : {}) })
  }
  // ⑤ 마지막으로 한 날·몇 번(다른 세션의 since-last 의도 = when_last)
  const recall = recallAsk(t, ctx.now)
  if (recall) {
    // 찾을 말이 여럿이면 물음 말('몇 번'·'한 지'·'간 게') 바로 앞 낱말 하나('도구 쓰지 말고 … 운동 몇 번' → 운동)
    let q = recall.words
    if (q.length > 1) {
      const at = t.search(/(몇\s*(번|회)|\S*\s*(한|간|다녀온|본|산|먹은)\s*(지|게|건|거)|얼마나|며칠|언제)/)
      const before = (at > 0 ? t.slice(0, at) : t).split(/\s+/).reverse()
      const hit = before.map((w) => q.find((x) => w.startsWith(x))).find(Boolean)
      if (hit) q = [hit]
    }
    return r({ kind: 'prefetch', calls: [{ name: 'when_last', args: { query: q.join(' '), ...(recall.from ? { from: recall.from } : {}), ...(recall.to && recall.to < ymd(ctx.now) ? { to: recall.to } : {}) } }] })
  }
  // ⑥ 기간 + 할 일/일정 → 달력 계산으로 기간을 풀어 먼저 찾기
  const per = periodIn(t, ctx.now)
  if (DIARY.test(t) && ctx.diary) return r({ kind: 'prefetch', calls: [{ name: 'find_diary', args: { ...(per ? { from: per.from, to: per.to } : {}) } }] })
  if (per && !bands.length && (TASK_WORD.test(t) || EVENT_WORD.test(t) || WHAT.test(t))) {
    const calls: Prefetch[] = []
    const done = DONE_WORD.test(t)
    if (EVENT_WORD.test(t) && !TASK_WORD.test(t)) calls.push({ name: 'find_events', args: { from: per.from, to: per.to } })
    else if (TASK_WORD.test(t) || done) calls.push({ name: 'find_tasks', args: { status: done ? 'completed' : 'open', from: per.from, to: per.to, ...(/(급|먼저|우선)/.test(t) ? { sort: 'urgent' } : {}) } })
    else calls.push({ name: 'find_tasks', args: { status: 'open', from: per.from, to: per.to } }, { name: 'find_events', args: { from: per.from, to: per.to } })
    return r({ kind: 'prefetch', calls })
  }
  // 기간 없이 '내 할 일 목록 …' → 남은 할 일(마감 순) 먼저(실측: 모델이 status all로 끝낸 기록까지 읽음)
  if (!bands.length && /할\s*일\s*(목록|리스트|뭐|전부|다\s)/.test(t)) return r({ kind: 'prefetch', calls: [{ name: 'find_tasks', args: { status: 'open', sort: 'due' } }] })
  return r({ kind: 'model' })
}

/** 모델에게 보낼 사용자 말: 상대 날짜 풀이를 옆에 붙인다 */
export const userContent = (text: string, notes: string[]) => (notes.length ? `${text}\n[${notes.join(' · ')}]` : text)

/** 앞 턴 이어 받을 것 → 지시 칸 끝에 붙는 한 덩이(400자 안) */
export function memoryBlock(m: AgentMemory, now: Date): string {
  const parts: string[] = []
  if (m.recent.length) parts.push(`최근 항목: ${m.recent.slice(0, 5).map((x) => `${x.alias} ‘${x.title.slice(0, 30)}’${x.date ? ` ${mdw(x.date.slice(0, 10), now)}` : ''}`).join(', ')}`)
  if (m.subject) parts.push(`주제: ${m.subject}`)
  if (m.lastTools) parts.push(`찾은 것: ${m.lastTools}`)
  const s = parts.join(' / ')
  return s ? `이어 받을 것(앞 대화): ${s.slice(0, 380)}` : ''
}
/** 결과 카드의 기간 글(머리) — 오늘이 지난 날짜면 'N일 전' 같은 계산은 카드가 한다 */
export const daysAgo = (day: string, now: Date) => dayGap(day, ymd(now))
