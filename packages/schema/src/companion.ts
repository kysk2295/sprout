// 40 캐릭터 동행 — 데스크톱·휴대폰이 같이 쓰는 순수 함수: 상태 → 얼굴·한 번 움직임·한 줄(반말), 빠른 답 칩, 빈 상태 한 줄.
// 캐릭터 한 줄은 앱이 고른다(모델이 쓰지 않는다 — 같은 상황이면 늘 같은 말). 숫자는 결과에서만 가져온다.
// 사실(무슨 일이 났고 무엇을 할 수 있는지)은 늘 기존 해요체 문구로 따로 둔다 — 이 파일의 말은 그 위에 얹는 한 줄뿐(40 §0.1).
import { eunNeun, iGa, ro } from './josa.ts'
import { SPECIES, STAGES, type Species } from './growth.ts'

/** 40 §6: 캐릭터 얼굴(기존 6종 중 쓰는 것 + 새 얼굴 think·puzzled) */
export type CompanionMood = 'smile' | 'happy' | 'content' | 'think' | 'puzzled' | 'sleepy'
/** 한 번 움직임(깡충·갸웃). 반복 움직임(숨쉬기·생각 중 흔들림·알 흔들림)은 자리마다 정한다 */
export type CompanionMove = 'hop' | 'tilt' | null
export type CompanionFace = { mood: CompanionMood; move: CompanionMove; line: string | null; dim?: boolean }

/** 40 §2.1 크기 네 칸 */
export const COMPANION_SIZE = { chat: 30, quest: 18, banner: 24, m: 64, mPhone: 56, l: 96, sheet: 64 } as const

/** 성향 조사 전(알)이면 앱이 고른 한 줄 앞에 붙인다(§2.3) */
export const EGG_PREFIX = '톡톡… '
const egged = (line: string, egg?: boolean) => (egg ? EGG_PREFIX + line : line)

// ── 날짜·시각 말 ───────────────────────────────────────────────
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const hasBatchim = (w: string) => iGa(w).endsWith('이')
/** '오전 10시' · '오후 2시 30분' */
export function hourLabel(h: number, m = 0) {
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 || 12
  return `${ampm} ${h12}시${m ? ` ${m}분` : ''}`
}
const dayDiff = (day: string, now: Date) => {
  const a = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a - b) / 86400000)
}
/** 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm' → '오늘' · '내일 오후 3시' · '금요일' · '10월 20일 오전 9시' */
export function whenLabel(at: string, now: Date) {
  const day = at.slice(0, 10)
  const diff = dayDiff(day, now)
  const d = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
  const date = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === 2 ? '모레' : diff > 2 && diff < 7 ? `${WEEKDAY[d.getDay()]}요일` : `${d.getMonth() + 1}월 ${d.getDate()}일`
  if (!at.includes('T')) return date
  return `${date} ${hourLabel(Number(at.slice(11, 13)), Number(at.slice(14, 16)))}`
}
/** 말 끝 '야/이야' (받침) */
const ya = (w: string) => `${w}${hasBatchim(w) ? '이야' : '야'}`

/** 요청 글에서 기간 말 하나(오늘 · 내일 · 이번 주 …). 둘 이상이면 첫 번째 */
export function scopeOf(request: string): string | null {
  const m = /오늘|내일|모레|어제|이번\s*주|다음\s*주|지난\s*주|이번\s*달|지난\s*달/.exec(request)
  return m ? m[0].replace(/\s+/g, ' ').replace(/(이번|다음|지난)(주|달)/, '$1 $2') : null
}

// ── AI 비서 답(13 §3 결과 종류) → 얼굴·한 줄 ─────────────────────
/** recall = 기록 묻기(13 §3.1 — 한 줄은 recall.ts recallLine이 고른 글) */
export type AnswerKind = 'create' | 'query' | 'stats' | 'reply' | 'chat' | 'recall'
export type AnswerInput = {
  kind: AnswerKind
  /** 결과 행 수(조회는 total) */
  count?: number
  /** 등록한 첫 할 일의 시작·마감 */
  first?: { start_at: string | null; due_at: string | null }
  /** 조회 상태(open = 남은 것, completed = 끝낸 것) */
  status?: 'all' | 'open' | 'completed'
  /** 사용자가 보낸 말(기간 말을 찾는다) */
  request?: string
  /** 모델이 쓴 글(되묻기·안내 답) */
  text?: string
  /** 등록을 되돌렸다 */
  undone?: boolean
  egg?: boolean
  now?: Date
}
/** 되묻기인지: 물음표나 묻는 말끝 */
export const isQuestion = (text: string) => /[?？]\s*$|까요?\s*[.!]?\s*$|나요\s*[.!]?\s*$|알려\s*주(세요|어|라)|말씀해\s*주세요|어떻게 할까/.test(text.trim())

/** 이전 기록(종류 칸이 없던 답)도 결과 모양으로 종류를 짐작한다 */
export function answerKindOf(r: { kind?: AnswerKind; created?: unknown; stats?: unknown; tasks?: unknown[]; recall?: unknown } | undefined): AnswerKind {
  if (r?.kind) return r.kind
  if (r?.recall) return 'recall'
  if (r?.created) return 'create'
  if (r?.stats) return 'stats'
  if (r?.tasks) return 'query'
  return 'reply'
}

/** 40 §3.2 상태 표 */
export function answerFace(a: AnswerInput): CompanionFace {
  const now = a.now ?? new Date()
  if (a.undone) return { mood: 'smile', move: 'tilt', line: egged('알겠어, 지웠어.', a.egg) }
  const n = a.count ?? 0
  const scope = a.request ? scopeOf(a.request) : null
  if (a.kind === 'create') {
    if (n > 1) return { mood: 'happy', move: 'hop', line: egged(`${n}개 넣어 뒀어.`, a.egg) }
    const at = a.first?.start_at || a.first?.due_at
    return { mood: 'happy', move: 'hop', line: egged(at ? `넣어 뒀어. ${ya(whenLabel(at, now))}.` : '넣어 뒀어.', a.egg) }
  }
  // 기록 묻기: 앱이 고른 답 한 줄(recallLine) 그대로
  if (a.kind === 'recall') return { mood: 'smile', move: null, line: egged((a.text ?? '').trim(), a.egg) || null }
  if (a.kind === 'stats') return { mood: 'smile', move: null, line: egged(scope ? `${eunNeun(scope)} 이만큼 했어.` : '이만큼 했어.', a.egg) }
  if (a.kind === 'query') {
    const lead = scope ? `${scope} ` : ''
    const line = a.status === 'open'
      ? (n ? `${lead}남은 건 ${n}개야.` : `${scope ? eunNeun(scope) + ' ' : ''}남은 게 없어.`)
      : a.status === 'completed'
        ? (n ? `${lead}끝낸 건 ${n}개야.` : `${scope ? eunNeun(scope) + ' ' : ''}끝낸 게 아직 없어.`)
        : (n ? `${n}개 찾았어.` : '찾은 게 없어.')
    return { mood: 'smile', move: null, line: egged(line, a.egg) }
  }
  // 되묻기·안내: 모델이 쓴 글 그대로(지시문에 "반말로 짧게")
  const text = (a.text ?? '').trim()
  if (a.kind === 'reply' && isQuestion(text)) return { mood: 'puzzled', move: 'tilt', line: text || null }
  return { mood: 'smile', move: null, line: text || null }
}

/** 받는 중(대기열 · 연결 · 해석): think + 좌우 흔들림, 글은 13 단계 줄 그대로 */
export const WAITING_FACE: CompanionFace = { mood: 'think', move: null, line: null }

/** 13 §6 오류 문구 → 얼굴·한 줄. 원문 문구는 회색 상자에 그대로 둔다 */
export function errorFace(error: string, egg?: boolean): CompanionFace {
  const e = error.trim()
  const f = (mood: CompanionMood, line: string, move: CompanionMove = null, dim?: boolean): CompanionFace => ({ mood, move, line: egged(line, egg), ...(dim ? { dim } : {}) })
  if (/멈췄어요|취소됐어요/.test(e)) return f('smile', '멈췄어.')
  if (/오늘 AI 사용 한도|오늘은 이 AI 기능을 다 썼어요|남은 요청 0회/.test(e)) return f('sleepy', '오늘은 여기까지! 내일 또 불러 줘.')
  if (/^지금은 AI를 쓸 수 없어요/.test(e)) return f('sleepy', '나 지금 잠깐 쉬는 중이야.', null, true)
  if (/연결하지 못했어요|인터넷 연결/.test(e)) return f('sleepy', '연결이 끊겼어. 다시 불러 줘.', null, true)
  if (/너무 오래 걸려요/.test(e)) return f('sleepy', '생각이 너무 길어졌어.')
  if (/한 번에 너무 많이 찾았어요/.test(e)) return f('puzzled', '너무 많이 찾았어. 조금 좁혀 줄래?', 'tilt')
  if (/너무 잦아요|처리 중인 AI 요청|쓰는 사람이 많아요|이미 사용했어요|바빠서|잠시 뒤 다시 시도/.test(e)) return f('sleepy', '숨 좀 고르고 다시 할게.')
  return f('puzzled', '잘 못 알아들었어.', 'tilt')
}

// ── 되묻기 빠른 답 칩(40 §3.3) — 앱이 빠진 칸을 보고 만든다 ──────────
export type QuickReply = { label: string; send: string; ghost?: boolean }
const DATE_WORD = /(오늘|내일|모레|(?:이번\s*주\s*|다음\s*주\s*)?[월화수목금토일]요일|\d{1,2}월\s*\d{1,2}일)/
const TIME_WORD = /(오전|오후|아침|저녁|밤|\d{1,2}\s*시)/
/** 칩 글을 앞 요청과 합쳐 보낼 말을 만든다: '금요일에 치과' + '오후 2시' → '금요일에 치과 오후 2시로 등록해 줘' */
const baseOf = (request: string) => request.trim().replace(/\s*(등록|추가|저장|예약)\s*(해|해서)?\s*(줘|주세요|줄래|줘요)?[.!]?$/, '').replace(/\s*(잡아|만들어|넣어)\s*(줘|주세요|줄래)?[.!]?$/, '').trim()
export function quickReplies({ request, question, now = new Date(), lists = [] }: { request: string; question: string; now?: Date; lists?: string[] }): QuickReply[] {
  if (!request.trim() || !isQuestion(question)) return []
  const base = baseOf(request)
  const dateWord = DATE_WORD.exec(request)?.[1]?.replace(/\s+/g, ' ')
  const wantsTime = /몇\s*시|시간|시각/.test(question) && !TIME_WORD.test(request)
  const wantsDate = /언제|날짜|며칠|무슨\s*요일|어느\s*날/.test(question) && !dateWord
  const wantsList = /리스트|목록|어디에/.test(question)
  if (wantsTime) {
    const today = !dateWord || dateWord === '오늘'
    const hours = today ? [9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21].filter((h) => h > now.getHours()).slice(0, 3) : [10, 14, 18]
    const chips: QuickReply[] = hours.map((h) => ({ label: hourLabel(h), send: `${base} ${ro(hourLabel(h))} 등록해 줘` }))
    chips.push({ label: `시간 없이${dateWord ? ` ${dateWord}` : ''}`, send: `${base} 시간 없이 등록해 줘`, ghost: true })
    return chips.slice(0, 4)
  }
  if (wantsDate) {
    const wd = now.getDay()
    const third = wd === 5 || wd === 6 || wd === 0 ? '다음 주 월요일' : '이번 주 금요일'
    return [...['오늘', '내일', third].map((d) => ({ label: d, send: `${base} ${d} 등록해 줘` })), { label: '날짜 없이', send: `${base} 날짜 없이 등록해 줘`, ghost: true }]
  }
  if (wantsList) {
    const names = [...new Set(lists.filter((n) => n && n !== '기본함'))].slice(0, 3)
    return [...names, '기본함'].map((n) => ({ label: n, send: `${base} ${n} 리스트에 등록해 줘` }))
  }
  return []
}

// ── 빈 대화 · 누르기(40 §3.4) ─────────────────────────────────────
export const TAP_LINES = ['말로 적어 주면 내가 넣을게', '"내일 3시 회의"처럼 말해 봐', '오늘 할 일 물어봐도 돼', '잠깐 쉬어도 괜찮아'] as const
export const EGG_TAP_LINE = '톡톡… 성향 조사를 하면 깨어나!'
/** 바로 전 문장은 다시 고르지 않는다 */
export function pickLine(pool: readonly string[], prev: number, rand: () => number = Math.random): number {
  if (pool.length < 2) return 0
  let i = Math.floor(rand() * pool.length) % pool.length
  if (i === prev) i = (i + 1) % pool.length
  return i
}
/** 10초 안에 다섯 번을 넘게 누르면 그다음은 깡충만(말풍선 없음). 누른 시각 목록을 고쳐 가며 쓴다 */
export function tapSpeaks(times: number[], now: number): boolean {
  while (times.length && now - times[0] > 10000) times.shift()
  times.push(now)
  return times.length <= 5
}

/** 이름 · 종 · 레벨 · 단계 */
export const stageLabel = (stage: number) => STAGES.find((s) => s.stage === stage)?.name ?? ''
/** 빈 대화 둘째 줄 `차곡차곡 다람쥐 · Lv 7 친구` — 알이면 `성향 조사를 하면 깨어나요` */
export const levelLine = (species: Species | null, level: number, stage: number) => (species ? `${SPECIES[species].name} · Lv ${level} ${stageLabel(stage)}` : '성향 조사를 하면 깨어나요')
/** 대화 이름 줄 — 알이면 `아직 모르는 알` */
export const companionName = (species: Species | null, name: string) => (species ? name : '아직 모르는 알')
/** 캐릭터 버튼 이름(스크린 리더) */
export const companionLabel = (species: Species | null, name: string, level: number, stage: number) => (species ? `${name}, Lv ${level} ${stageLabel(stage)}. 눌러서 말 걸기` : '아직 모르는 알. 눌러 보기')

// ── 빈 상태 한 줄(40 §4) ─────────────────────────────────────────
const isNight = (h: number) => h >= 23 || h < 6
/** 오늘 비어 있음: 누를 때마다 다음 후보로(첫 줄이 기본) */
export function todayEmptyLines({ todayDone, hour, egg }: { todayDone: number; hour: number; egg?: boolean }): string[] {
  const out: string[] = []
  if (isNight(hour)) out.push('오늘은 이만 쉬자')
  if (todayDone > 0) out.push(`오늘 ${todayDone}개 했어. 남은 건 없어`)
  out.push('하고 싶은 일이 생기면 적어 줘')
  if (out.length < 2) out.push('잠깐 쉬어도 괜찮아')
  return out.map((l) => egged(l, egg))
}
/** 모두 완료 */
export const allDoneLine = (todayDone: number, egg?: boolean) => egged(todayDone > 0 ? `오늘 ${todayDone}개 했어. 푹 쉬어` : '다 끝났다!', egg)

/** 긴 로딩(첫 동기화) 둘째 줄 — 사실이라 해요체 */
export const LONG_LOADING_HINT = '처음 한 번만 조금 걸려요'
/** 오프라인 띠: 30초 넘게 끊겨 있을 때만 */
export const OFFLINE_BANNER_AFTER_MS = 30000
export const OFFLINE_BANNER_TEXT = '오프라인 — 연결되면 자동으로 올라가요'

// ── 성장 주 2회 한도(40 §5.2) ─────────────────────────────────────
/** 이번 주 초안을 이미 만든 주의 "○○의 제안" 줄. 성장 주는 늘 월요일 시작(10 §4) */
export const QUEST_LIMIT_LINE = '이번 주 제안은 다 만들었어. 다음 주 월요일에 또 만들게'
export const QUEST_LIMIT_NOTE = '이번 주 AI 초안을 만들 수 없어요 · 직접 적어 주세요'
