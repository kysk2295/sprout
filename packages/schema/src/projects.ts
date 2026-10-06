// 31 §12 작업 지도 v2 계획 — 자동 프로젝트(순수 계산, 데스크톱·모바일 공용). DB 읽기·쓰기는 앱(apps/desktop/.../data/projects.ts).
// 프로젝트 = tags.kind 'project'. 사람이 태그를 달지 않는다:
//  ① 덩어리 찾기: "프로젝트 같은 말"(공모전·SQLD·UniPort…)이 할 일 3개 이상 제목에 나오면 프로젝트 태그를 만든다
//  ② 붙이기는 33 사전 검사가, ③ 넓히기(같은 리스트 · 기간 안 · 단계로 보이는 일)는 여기 expandProject가
//  구성원 = 붙은 태그 ∪ 집(리스트·폴더) 안 할 일 ∪ 하위 할 일 − ✕(dismissed)
// 일의 종류(조사·분석 / 미팅·회의 / 개발 / 행정·제출 / 기타)는 낱말로 결정적으로 가른다.
import { distinctWords, STOP_WORDS, tagKey, titleTokens, type AtFolder, type AtLink, type AtList, type AtTag } from './autoTag.ts'
import { displayTitle, parseAliases } from './wikiLink.ts'

export const PROJECT = {
  /** 프로젝트 같은 말이 이 수 이상의 할 일에 나오면 자동으로 만든다 */
  autoMin: 3,
  /** 제안 카드: 프로젝트 같은 말이 2개 · 그 밖 낱말은 할 일 3개 + 리스트 2곳 */
  suggestMin: 2,
  suggestPlainMin: 3,
  suggestPlainLists: 2,
  /** 넓히기: 같은 리스트에 구성원 2개 이상 + (그 리스트 할 일의 25% 이상 또는 같은 리스트 구성원과 3일 안), 날짜가 기간 ±7일 */
  expandListMin: 2,
  expandShare: 0.25,
  expandNear: 3,
  expandDays: 7,
  expandScore: 75,
  /** 리스트·폴더 이름이 다른 리스트 할 일 제목에 이 수 이상 나오면 프로젝트(그 리스트·폴더가 집) */
  homeMentions: 2,
  /** 자동으로 만들려면 날짜(마감·시작·끝낸 날)가 서로 다른 할 일이 이 수 이상(2026-10-05: 한 날 몰린 묶음·날짜 없는 낱말 막기) */
  autoDays: 3,
  nameMax: 20
} as const

// ── 일의 종류 ──
export type WorkKind = 'research' | 'meeting' | 'dev' | 'admin' | 'other'
export const WORK_KINDS: WorkKind[] = ['research', 'meeting', 'dev', 'admin', 'other']
export const WORK_LABEL: Record<WorkKind, string> = { research: '조사·분석', meeting: '미팅·회의', dev: '개발', admin: '행정·제출', other: '기타' }
/** 낱말(제목 안에 그대로 있으면 — 한글은 붙어 써도 잡는다). 앞 종류가 이긴다: 행정·제출 > 미팅 > 개발 > 조사 */
const KIND_WORDS: [WorkKind, string[]][] = [
  ['admin', ['신청', '제출', '접수', '서류', '등록', '발표자료', '발표', '보고서', '계획서', '마감', '납부', '결제', '메일', '이메일', '증명서', '지원서', '원서', '서명', '정산']],
  ['meeting', ['미팅', '회의', '면담', '상담', '인터뷰', '세미나', '모임', '콜', '통화', '만남', '오티', '킥오프', '피드백']],
  ['dev', ['개발', '구현', '코딩', '모델', '대시보드', '배포', '버그', '테스트', '앱', '서버', 'api', '프로토타입', '디자인', '리팩터', '학습', '튜닝', '베이스라인', '크롤링', '파이프라인', '기능']],
  ['research', ['조사', '분석', '자료', '리서치', '데이터', 'eda', '공부', '기출', '강의', '읽기', '논문', '검색', '정리본', '요약', '문제', '복습', '예습', '시장']]
]
const KIND_SET = new Set(KIND_WORDS.flatMap(([, ws]) => ws))
/** 할 일 제목 → 일의 종류(결정적). 못 가르면 other */
/** 일이 아닌 모임(회식·뒤풀이…)은 기타 — 낱말 분류보다 먼저 */
const SOCIAL = ['회식', '뒤풀이', '파티', '축하', '생일', '술자리']
export function workKind(title: string): WorkKind {
  const t = displayTitle(title).toLowerCase()
  const compact = t.replace(/\s+/g, '')
  if (SOCIAL.some((w) => compact.includes(w))) return 'other'
  const toks = new Set(titleTokens(title))
  for (const [kind, words] of KIND_WORDS) for (const w of words) {
    // 영문은 낱말이 같을 때만, 한글은 붙어 있어도(데이터분석 · 교수님미팅)
    if (/^[a-z]+$/.test(w) ? toks.has(w) : compact.includes(w)) return kind
  }
  return 'other'
}
/** 일의 종류 낱말인가(덩어리 이름으로 쓰지 않는다) */
export const isWorkWord = (w: string) => KIND_SET.has(w.toLowerCase())

// ── 프로젝트 같은 말 ──
const PROJECT_PARTS = ['공모전', '경진대회', '대회', '해커톤', '프로젝트', '창업', '지원사업', '논문', '졸업작품', '캡스톤', '학회', '아이디어톤', '챌린지']
const EXAMS = ['sqld', 'sqlp', 'adsp', 'adp', '정보처리기사', '빅데이터분석기사', '정처기', '토익', 'toeic', '토플', 'toefl', '오픽', 'opic', '한국사', '컴활', 'gre', 'gmat', 'jlpt', 'hsk', '텝스', '리눅스마스터', '네트워크관리사', 'aws']
const EXAM_SET = new Set(EXAMS)
/**
 * 그 자체로는 프로젝트 이름이 아닌 막연한 말(2026-10-05 실제 데이터: `🚀 프로젝트`가 생김) — 이 말 하나뿐인 이름은 자동으로 안 만든다.
 * 생활 영역 말(근무·생활·업무…)도 여기 — 리스트·폴더 이름이 영역이면 집 프로젝트가 아니다.
 */
export const PROJECT_STOP = new Set(['프로젝트', '계획', '목표', '일정', '공부', '과제', '대회', '챌린지', '준비', '업무', '근무', '알바', '아르바이트', '생활', '개인', '일상', '회사', '학교', '집', '건강', '운동', '가족', '취미', '기타', '할일', '메모', '정리'])
/** 낱말 하나가 프로젝트 이름 같은가: 공모전·창업 같은 말을 품음 · 시험 이름 · 대소문자 섞인 영문 고유 이름(UniPort). 막연한 말(PROJECT_STOP)만으로는 아님 */
export function projectish(word: string): boolean {
  const raw = word.trim().replace(EMOJI_HEAD, '').trim()
  const k = tagKey(raw)
  if ([...k].length < 2 || PROJECT_STOP.has(k)) return false
  if (EXAM_SET.has(k)) return true
  if (PROJECT_PARTS.some((p) => k.includes(p))) return true
  return /^[A-Z][a-z]+[A-Z][A-Za-z]*$/.test(raw)
}
const EMOJI_HEAD = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u
/** 카드 이모지(이름에서): 이름이 이모지로 시작하면 그것, 공모전·대회 🏆, 시험 📜, 창업·지원사업 🌱, 논문 📄, 그 밖 🚀 */
export function projectEmoji(name: string): string {
  const head = name.trim().match(EMOJI_HEAD)?.[0]
  if (head) return head
  const k = tagKey(name)
  if (/공모전|대회|해커톤|아이디어톤|챌린지/.test(k)) return '🏆'
  if (EXAMS.some((e) => k.includes(e)) || /시험|자격증|기사$/.test(k)) return '📜'
  if (/창업|지원사업/.test(k)) return '🌱'
  if (/논문|학회/.test(k)) return '📄'
  return '🚀'
}
/** 이모지를 뗀 이름 */
export const projectTitle = (name: string) => name.trim().replace(EMOJI_HEAD, '').trim()

// ── 구성원 ──
export type PTask = { id: string; title: string; list_id: string | null; parent_id?: string | null; status?: number | null; due_at?: string | null; start_at?: string | null; completed_at?: string | null; created_at?: string | null; deleted_at?: string | null }
const accepted = (l: Pick<AtLink, 'state'>) => (l.state ?? 'accepted') === 'accepted'
const isProject = (t: Pick<AtTag, 'kind'>) => t.kind === 'project'

/**
 * 프로젝트 구성원(§12.1): 붙은 태그(accepted) ∪ 집 안 할 일 ∪ 그 하위 할 일(몇 단계든) − 이 프로젝트에서 dismissed 행이 있는 할 일.
 * tasks = 지운 것 뺀 할 일(열린 것 + 끝낸 것).
 */
export function projectMembers(tag: AtTag, tasks: PTask[], links: AtLink[], lists: AtList[]): Set<string> {
  const out = new Set<string>()
  const dismissed = new Set<string>()
  for (const l of links) if (l.tag_id === tag.id) (accepted(l) ? out : l.state === 'dismissed' ? dismissed : new Set()).add(l.task_id)
  if (tag.home_id) {
    const homeLists = new Set(tag.home_type === 'folder' ? lists.filter((l) => l.folder_id === tag.home_id).map((l) => l.id) : [tag.home_id])
    for (const t of tasks) if (t.list_id && homeLists.has(t.list_id)) out.add(t.id)
  }
  // 하위 할 일
  const kids = new Map<string, string[]>()
  for (const t of tasks) if (t.parent_id) kids.set(t.parent_id, [...(kids.get(t.parent_id) ?? []), t.id])
  const stack = [...out]
  while (stack.length) {
    const id = stack.pop()!
    for (const k of kids.get(id) ?? []) if (!out.has(k)) { out.add(k); stack.push(k) }
  }
  for (const id of dismissed) out.delete(id)
  const live = new Set(tasks.map((t) => t.id))
  for (const id of [...out]) if (!live.has(id)) out.delete(id)
  return out
}

/** 할 일 날짜(타임라인 x): 마감 → 시작 → (끝낸 일) 끝낸 날 → 없음. 하루 열쇠 YYYY-MM-DD */
export function taskDay(t: PTask): string | null {
  const d = t.due_at ?? t.start_at ?? ((t.status ?? 0) !== 0 ? t.completed_at : null)
  return d ? d.slice(0, 10) : null
}
/** 넓히기·기간용 날짜: taskDay 없으면 만든 날 */
const anyDay = (t: PTask) => taskDay(t) ?? t.created_at?.slice(0, 10) ?? null

/**
 * 31 §12.3 마감 말(강한 것만). `발표`·`시험`처럼 넓은 낱말은 `발표 자료 정리`·`시험 공부`에도 들어가서 빼고,
 * 그날 자체가 마감인 말만 둔다. 앞에서부터 찾아 처음 걸린 것이 마감 말(긴 것 먼저).
 */
const DEADLINE_WORDS: { key: string; word: string }[] = [
  { key: '신청마감', word: '마감' }, { key: '최종발표', word: '발표' }, { key: '발표회', word: '발표' }, { key: '시험일', word: '시험' },
  { key: 'd-day', word: 'D-day' }, { key: 'dday', word: 'D-day' }, { key: 'd데이', word: 'D-day' }, { key: '디데이', word: 'D-day' },
  { key: '제출', word: '제출' }, { key: '마감', word: '마감' }, { key: '본선', word: '본선' }, { key: '결선', word: '결선' }, { key: '접수', word: '접수' }
]
/** 마감 말이 있어도 그날이 마감이 아닌 일(그 앞 준비) — `발표 자료 정리`·`제출 서류 준비`·`최종 발표 연습` */
const DEADLINE_PREP = ['발표자료', '발표준비', '자료정리', '준비', '연습', '리허설', '초안']
/** 제목이 마감 말이면 그 말(`제출`·`마감`…), 아니면 null */
export function deadlineWord(title: string): string | null {
  const c = displayTitle(title).replace(/\s+/g, '').toLowerCase()
  if (DEADLINE_PREP.some((w) => c.includes(w))) return null
  return DEADLINE_WORDS.find((w) => c.includes(w.key))?.word ?? null
}
export type ProjectDeadline = { day: string; word: string; taskId: string | null }
/**
 * 마감(§12.3): ① 사람이 정한 프로젝트 마감(`explicit`, 아직 쓰는 화면 없음 — 생기면 그것이 먼저) ②
 * 구성원(끝낸 일 포함 — 낸 뒤에도 마감은 마감) 중 제목이 **강한 마감 말**(deadlineWord)인 일의 가장 늦은 마감. 없으면 null.
 * `발표 자료 정리`처럼 넓은 말만 든 일은 마감이 아니다.
 */
export function projectDeadline(members: PTask[], explicit?: string | null): ProjectDeadline | null {
  if (explicit && /^\d{4}-\d{2}-\d{2}/.test(explicit)) return { day: explicit.slice(0, 10), word: '마감', taskId: null }
  let best: ProjectDeadline | null = null
  for (const t of members) {
    if (!t.due_at || (t.status ?? 0) === 2) continue // 하지 않음(2)은 뺀다
    const word = deadlineWord(t.title)
    if (!word) continue
    const day = t.due_at.slice(0, 10)
    if (!best || day > best.day || (day === best.day && (t.status ?? 0) === 0)) best = { day, word, taskId: t.id }
  }
  return best
}
/** 끝난 뒤 이만큼 지나야 마감만으로 끝남 */
export const ENDED_GRACE_DAYS = 7
/**
 * 31 §12.10.4 끝난 프로젝트(보드·빠른 추가 알약·집중·점수 공용). 둘 다여야 끝남:
 * ⓐ 앞으로 할 열린 일이 없음 — 날짜가 오늘 이후이거나 날짜 없는 열린 일이 하나라도 있으면 진행 중
 * ⓑ 구성원이 다 끝남, 또는 마감(없으면 구성원의 가장 늦은 날짜)이 7일 넘게 지남.
 * 마감이 지났어도 오늘 이후·날짜 없는 열린 일이 있으면 끝나지 않는다. 구성원이 없으면 끝나지 않음. 집 리스트 보관은 따로(호출하는 쪽).
 */
export function membersEndedBy(members: PTask[], deadline: string | null | undefined, today: string): boolean {
  if (!members.length) return false
  const open = members.filter((m) => (m.status ?? 0) === 0)
  if (open.some((m) => { const d = taskDay(m); return !d || d >= today })) return false
  if (!open.length) return true
  const days = members.map(taskDay).filter((d): d is string => !!d)
  const end = deadline ?? days.sort()[days.length - 1] ?? null
  return !!end && end < addDays(today, -ENDED_GRACE_DAYS)
}

const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** 기간: 날짜 있는 구성원의 첫 날 ~ 끝 날(마감 포함). 없으면 null */
export function projectSpan(members: PTask[], deadline?: string | null): { from: string; to: string } | null {
  const days = members.map(taskDay).filter((d): d is string => !!d)
  if (deadline) days.push(deadline)
  if (!days.length) return null
  days.sort()
  return { from: days[0], to: days[days.length - 1] }
}


// ── 31 §12.10 분류 · 특정 프로젝트(하나하나) ──
/** 분류 낱말 — 그 자체로는 프로젝트가 아니다(`공모전`은 분류, `K 인공지능 제조 데이터 공모전`이 프로젝트) */
export const CATEGORY_WORDS = ['공모전', '경진대회', '아이디어톤', '해커톤', '챌린지', '대회', '지원사업', '창업', '졸업작품', '캡스톤', '논문', '학회']
export const EXAM_CATEGORY = '시험'
export const INSTANCE = {
  /** 막연한 할 일을 닻(이름이 든 할 일) 날짜 이 일 수 안의 프로젝트에 */
  near: 14,
  /** 같은 이름이라도 날짜가 이만큼 떨어지면 다른 회차 */
  gap: 120,
  /** 강한 이름(앞 낱말 수) — 할 일 하나여도 자동으로 만든다 */
  strongQuals: 2,
  assignScore: 90
} as const
const compactKey = (s: string) => tagKey(projectTitle(s)).replace(/\s+/g, '')
/** 이름·제목 → 분류: 가장 오른쪽(끝이 가장 뒤, 같으면 긴) 분류 낱말 · 시험 이름이면 `시험` · 없으면 null */
export function categoryOf(name: string): string | null {
  const k = compactKey(name)
  let best: { w: string; end: number } | null = null
  for (const w of CATEGORY_WORDS) {
    const i = k.lastIndexOf(w)
    if (i < 0) continue
    const end = i + w.length
    if (!best || end > best.end || (end === best.end && w.length > best.w.length)) best = { w, end }
  }
  if (best) return best.w
  return EXAMS.some((e) => k.includes(e)) ? EXAM_CATEGORY : null
}
/** 이름이 분류 낱말·막연한 말 하나뿐인가(`공모전`·`창업`·`프로젝트`) — 프로젝트 이름으로 자동으로 쓰지 않는다 */
export const isBareCategory = (name: string) => { const k = compactKey(name); return CATEGORY_WORDS.includes(k) || PROJECT_STOP.has(k) }
const QUAL_STOP = new Set(['위한', '대한', '관련', '같은', '및', '등', '최종', '본선', '예선', '결선', '팀', '우리', '이번', '다음', '올해', '내년'])
const OBJ_JOSA = /(을|를|에서|에게|으로)$/
const JOSA_TAIL = /(에서|으로|에게|까지|부터|이랑|랑|을|를|이|가|은|는|에|로|와|과|도|께)$/
/**
 * 제목 → 특정 이름(§12.10.2 ①). 분류 낱말 앞에 붙은 낱말(최대 5개, 흔한 낱말·막연한 말·숫자·목적어 조사에서 멈춤) + 분류 낱말.
 * 분류 낱말이 더 긴 낱말 안에 있으면(`창업지원장학금`) 그 낱말 통째. 앞 낱말이 없고 분류 낱말 그대로면 null(막연한 할 일).
 */
export function specificName(title: string, cat: string): { name: string; quals: number } | null {
  const parts = displayTitle(title).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  let at = -1
  for (let i = parts.length - 1; i >= 0; i--) if (tagKey(parts[i]).includes(cat)) { at = i; break }
  if (at < 0) return null
  const tok = parts[at]
  const tk = tagKey(tok)
  const core = tk.replace(JOSA_TAIL, '')
  const base = core === cat || tk === cat ? cat : tok.replace(JOSA_TAIL, '')
  const quals: string[] = []
  for (let j = at - 1; j >= 0 && quals.length < 5; j--) {
    const p = parts[j], k = tagKey(p)
    if (STOP_WORDS.has(k) || PROJECT_STOP.has(k) || QUAL_STOP.has(k) || GENERIC.has(k) || /^\d/.test(p) || OBJ_JOSA.test(p) || [...k].length < 1) break
    quals.unshift(/^[a-z]$/.test(p) ? p.toUpperCase() : p)
  }
  if (!quals.length && base === cat) return null
  while (quals.length && [...[...quals, base].join(' ')].length > PROJECT.nameMax) quals.shift()
  return { name: [...quals, base].join(' '), quals: quals.length + (base !== cat ? 1 : 0) }
}
/** 특정 이름끼리 같은 프로젝트인가: nearSameName인데 짧은 쪽이 분류 낱말 하나면 아님 */
export function sameInstance(a: string, b: string): boolean {
  if (isBareCategory(a) || isBareCategory(b)) return compactKey(a) === compactKey(b)
  const x = compactKey(a), y = compactKey(b)
  if (x === y) return true
  const [sh, lo] = x.length <= y.length ? [x, y] : [y, x]
  return [...sh].length >= 2 && lo.endsWith(sh)
}
export type Instance = { cat: string; name: string; aliases: string[]; anchors: string[]; generic: string[]; strong: boolean; days: string[] }
export type LooseTask = { taskId: string; cat: string; day: string | null; choices: number[] }
/**
 * §12.10.2: 분류 낱말이 든 할 일을 특정 프로젝트(인스턴스)로 나눈다. 막연한 할 일은 닻 날짜 14일 안 프로젝트가 하나일 때만 붙이고, 아니면 loose(고르기).
 * 결정적: 같은 입력 = 같은 결과(이름 순·날짜 순).
 */
export function findInstances(tasks: PTask[]): { instances: Instance[]; loose: LooseTask[] } {
  type A = { id: string; name: string; quals: number; day: string | null }
  const anchors = new Map<string, A[]>()
  const generics: { id: string; cat: string; day: string | null }[] = []
  for (const t of [...tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    if (t.deleted_at) continue
    const cat = categoryOf(t.title)
    if (!cat || cat === EXAM_CATEGORY) continue
    const sn = specificName(t.title, cat)
    const day = anyDay(t)
    if (sn) (anchors.get(cat) ?? anchors.set(cat, []).get(cat)!).push({ id: t.id, name: sn.name, quals: sn.quals, day })
    else generics.push({ id: t.id, cat, day })
  }
  const instances: Instance[] = []
  for (const [cat, as] of [...anchors].sort((a, b) => a[0].localeCompare(b[0]))) {
    // 이름으로 묶기(긴 이름부터 — 짧은 이름이 긴 이름의 끝이면 같은 것)
    const groups: { names: string[]; items: A[] }[] = []
    for (const a of [...as].sort((x, y) => [...y.name].length - [...x.name].length || x.name.localeCompare(y.name))) {
      const g = groups.find((x) => x.names.some((n) => sameInstance(n, a.name)))
      if (g) { g.items.push(a); if (!g.names.some((n) => compactKey(n) === compactKey(a.name))) g.names.push(a.name) }
      else groups.push({ names: [a.name], items: [a] })
    }
    for (const g of groups) {
      // 날짜로 회차 나누기(120일 넘게 떨어지면 따로)
      const dated = g.items.filter((x) => x.day).sort((x, y) => x.day!.localeCompare(y.day!))
      const runs: A[][] = []
      for (const a of dated) { const last = runs[runs.length - 1]; if (last && daysBetween(last[last.length - 1].day!, a.day!) <= INSTANCE.gap) last.push(a); else runs.push([a]) }
      const undated = g.items.filter((x) => !x.day)
      if (!runs.length) runs.push([])
      runs[runs.length - 1].push(...undated)
      const base = g.names[0]
      runs.forEach((items, k) => {
        if (!items.length) return
        let name = base
        if (runs.length > 1) {
          const d = items.find((x) => x.day)?.day
          const years = new Set(runs.map((r) => r.find((x) => x.day)?.day?.slice(0, 4)))
          if (d) name = years.size === runs.length ? `${base} ${d.slice(0, 4)}` : `${base} ${Number(d.slice(5, 7))}월`
          if (k > 0 && name === base) name = `${base} ${k + 1}`
        }
        instances.push({ cat, name, aliases: g.names.slice(1), anchors: items.map((x) => x.id), generic: [], strong: Math.max(...items.map((x) => x.quals)) >= INSTANCE.strongQuals, days: [...new Set(items.map((x) => x.day).filter((x): x is string => !!x))] })
      })
    }
  }
  const loose: LooseTask[] = []
  for (const g of generics) {
    const idx = instances.map((ins, i) => ({ i, ins })).filter((x) => x.ins.cat === g.cat)
    const dist = (ins: Instance) => (g.day && ins.days.length ? Math.min(...ins.days.map((d) => Math.abs(daysBetween(d, g.day!)))) : Infinity)
    const near = idx.filter((x) => dist(x.ins) <= INSTANCE.near)
    if (near.length === 1) { near[0].ins.generic.push(g.id); continue }
    loose.push({ taskId: g.id, cat: g.cat, day: g.day, choices: idx.sort((a, b) => dist(a.ins) - dist(b.ins) || a.i - b.i).map((x) => x.i) })
  }
  return { instances, loose }
}
/** 인스턴스를 자동으로 만들까: (닻 + 붙은 막연한 일) 2개 이상 · 날짜 2개 이상, 또는 강한 이름 */
export const instanceAuto = (ins: Instance, tasks: Map<string, PTask>) => {
  const ids = [...ins.anchors, ...ins.generic]
  const days = new Set(ids.map((id) => tasks.get(id)).filter((t): t is PTask => !!t).map(anyDay).filter(Boolean))
  return (ids.length >= 2 && days.size >= 2) || ins.strong
}

// ── ① 덩어리 찾기 ──
export type Proposal = {
  /** 낱말 열쇠(tagKey) */
  key: string
  /** 별칭이 될 낱말(제목에 나온 모양) */
  word: string
  /** 태그 이름(가장 긴 이름, 20자) */
  name: string
  taskIds: string[]
  listIds: string[]
  /** 같은 이름 리스트·폴더(프로젝트의 집) */
  home?: { type: 'list' | 'folder'; id: string }
  /** 이미 있는 사용자 topic 태그를 프로젝트로 보자는 제안 */
  tagId?: string
  reason: 'project' | 'home' | 'plain' | 'tag' | 'instance'
  /** §12.10 특정 프로젝트의 분류 낱말 */
  category?: string
  /** 이름이 거의 같아 합친 다른 제안의 낱말·이름(별칭으로) */
  aliases?: string[]
}
export type FindCtx = { tags: AtTag[]; lists: AtList[]; folders: AtFolder[]; tasks: PTask[]; links: AtLink[] }

/** 제목에 쓰인 모양 그대로의 낱말(조사 뗀 열쇠 → 원래 모양) */
function surface(title: string, key: string): string | null {
  for (const raw of displayTitle(title).split(/\s+/)) {
    const clean = raw.replace(/[^\p{L}\p{N}]/gu, '')
    if (!clean) continue
    if (tagKey(clean) === key) return clean
    if (tagKey(clean).startsWith(key) && [...key].length >= 2) return clean.slice(0, clean.length - (tagKey(clean).length - key.length))
  }
  return null
}
/**
 * 태그 이름: 그 낱말 앞에 붙어 나오는 이름(앞 낱말 최대 5개, 20자) 중 **제목 절반 넘게가 함께 쓰는 가장 긴 것**. 영문 한 글자는 대문자.
 * 제목 하나면 그 제목의 가장 긴 이름(`k 인공지능 제조 데이터 공모전 신청` → `K 인공지능 제조 데이터 공모전`).
 * 2026-10-05: 예전엔 제목 하나의 가장 긴 이름이 이겨서 공모전 할 일 20개가 모두 `신한 스퀘어브릿지 대학생 창업 공모전`이 됐다.
 */
export function fullProjectName(word: string, titles: string[]): string {
  const key = tagKey(word)
  const per = titles.map((t) => longestName(word, key, t)).filter((x): x is string[] => !!x)
  if (!per.length) return word
  if (per.length === 1) return per[0].join(' ')
  // 끝에서부터 같은 낱말 줄(접미)을 세어, 절반 넘게 같이 쓰는 가장 긴 접미
  let best = per[0].slice(-1).join(' ')
  const norm = (xs: string[]) => xs.map((x) => x.toLowerCase()).join(' ')
  for (let n = 1; n <= 6; n++) {
    const counts = new Map<string, { n: number; name: string[] }>()
    for (const p of per) if (p.length >= n) { const suf = p.slice(-n); const k = norm(suf); const c = counts.get(k) ?? { n: 0, name: suf }; c.n++; counts.set(k, c) }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0]
    if (!top || top.n * 2 <= per.length) break
    best = top.name.join(' ')
  }
  return best
}
/** 제목 하나에서 그 낱말로 끝나는 가장 긴 이름(낱말 배열) */
function longestName(word: string, key: string, title: string): string[] | null {
  const parts = displayTitle(title).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const at = parts.findIndex((p) => tagKey(p).startsWith(key))
  if (at < 0) return null
  const head = parts[at].slice(0, [...parts[at]].length - ([...tagKey(parts[at])].length - [...key].length))
  for (let from = Math.max(0, at - 5); from <= at; from++) {
    const before = parts.slice(from, at).filter((p) => !STOP_WORDS.has(p.toLowerCase()) && !/^\d/.test(p))
    if (before.length !== at - from) continue // 사이에 흔한 낱말이 끼면 그 앞은 이름이 아니다
    const name = [...before, head].map((p) => (/^[a-z]$/.test(p) ? p.toUpperCase() : p))
    if ([...name.join(' ')].length <= PROJECT.nameMax) return name
  }
  return [word]
}

/**
 * 덩어리 찾기(§12.1 ①·⑤): 자동으로 만들 것(auto) + 제안 카드 후보(suggest, 많은 순).
 * blocked = 막은 이름 열쇠(되돌림·아니), 이미 있는 태그 이름·별칭은 빼고, 사용자 topic 태그가 프로젝트 같으면 제안(tag).
 */
/** 제안 카드로도 쓰기엔 막연한 낱말(계획·목표·순서…) */
const GENERIC = new Set(['계획', '목표', '시간', '순서', '내용', '파일', '수정', '반영', '연습', '세우기', '만들기', '쓰기', '하기', '보기', '핵심', '본문', '친구', '동료', '사람', '오늘', '이번주', '주간', '월간', '일일', '매일', '루틴', '습관', '노트', '정리본', '초안', '최종', '중간', '1차', '2차'])
/**
 * taken = 이미 어느 프로젝트의 구성원인 할 일 — 제안 카드는 그 밖의 할 일로만 센다(자동 만들기는 겹쳐도 됨).
 */
export function findProjectClusters(ctx: FindCtx, blocked: Set<string> = new Set(), taken: Set<string> = new Set()): { auto: Proposal[]; suggest: Proposal[] } {
  const tagKeys = new Set<string>()
  for (const t of ctx.tags) for (const n of [t.name, ...parseAliases(t.aliases)]) tagKeys.add(tagKey(n))
  const listOf = new Map(ctx.lists.map((l) => [l.id, l]))
  // 낱말 → 할 일
  const hits = new Map<string, Set<string>>()
  const byId = new Map(ctx.tasks.map((t) => [t.id, t]))
  for (const t of ctx.tasks) {
    if (t.deleted_at) continue
    for (const w of new Set(distinctWords(t.title))) (hits.get(w) ?? hits.set(w, new Set()).get(w)!).add(t.id)
  }
  // 리스트·폴더 이름(집 후보)
  const homes = new Map<string, { type: 'list' | 'folder'; id: string; name: string }>()
  for (const l of ctx.lists) if (l.kind !== 'inbox') homes.set(tagKey(l.name), { type: 'list', id: l.id, name: l.name })
  for (const f of ctx.folders) homes.set(tagKey(f.name), { type: 'folder', id: f.id, name: f.name })
  const inHome = (t: PTask, h: { type: 'list' | 'folder'; id: string }) => h.type === 'list' ? t.list_id === h.id : listOf.get(t.list_id ?? '')?.folder_id === h.id

  const auto: Proposal[] = [], suggest: Proposal[] = []
  // §12.10 분류 낱말이 든 할 일 → 특정 프로젝트(하나하나)
  const { instances } = findInstances(ctx.tasks)
  for (const ins of instances) {
    const key = tagKey(ins.name)
    if (blocked.has(key) || isBareCategory(ins.name)) continue
    const ids = [...ins.anchors, ...ins.generic]
    const tasks = ids.map((id) => byId.get(id)!).filter(Boolean)
    const prop: Proposal = { key, word: ins.name, name: ins.name, taskIds: ids, listIds: [...new Set(tasks.map((t) => t.list_id ?? ''))].filter(Boolean), reason: 'instance', category: ins.cat, aliases: ins.aliases }
    if (instanceAuto(ins, byId)) auto.push(prop)
    else if (!tagKeys.has(key) && ids.filter((id) => !taken.has(id)).length >= 1 && ins.anchors.length >= 1 && ids.length >= PROJECT.suggestMin) suggest.push(prop)
  }
  for (const [w, ids] of hits) {
    if (STOP_WORDS.has(w) || isWorkWord(w) || tagKeys.has(w) || blocked.has(w) || [...w].length < 2) continue
    if (categoryOf(w) && categoryOf(w) !== EXAM_CATEGORY) continue // 분류 낱말이 든 낱말은 위 인스턴스가 맡는다
    const tasks = [...ids].map((id) => byId.get(id)!).filter(Boolean)
    const word = tasks.map((t) => surface(t.title, w)).find(Boolean) ?? w
    const listIds = [...new Set(tasks.map((t) => t.list_id ?? ''))].filter(Boolean)
    const home = homes.get(w)
    const outside = home ? tasks.filter((t) => !inHome(t, home)) : tasks
    const p = (reason: Proposal['reason']): Proposal => ({
      key: w, word,
      name: reason === 'home' ? home!.name.replace(EMOJI_HEAD, '').trim() : reason === 'plain' ? word : fullProjectName(word, tasks.map((t) => t.title)),
      taskIds: tasks.map((t) => t.id), listIds, home: home ? { type: home.type, id: home.id } : undefined, reason
    })
    // 집 프로젝트는 리스트·폴더 이름이 프로젝트 같을 때만 — `🏠생활 › 근무` 같은 영역 리스트는 아님(2026-10-05)
    const days = new Set(tasks.map(taskDay).filter(Boolean)).size
    const homeDays = home ? new Set([...tasks, ...ctx.tasks.filter((t) => !t.deleted_at && inHome(t, home))].map(taskDay).filter(Boolean)).size : 0
    if (home && outside.length >= PROJECT.homeMentions && projectish(home.name) && homeDays >= PROJECT.autoDays) { auto.push(p('home')); continue }
    const free = tasks.filter((t) => !taken.has(t.id))
    const freeLists = new Set(free.map((t) => t.list_id ?? '')).size
    if (projectish(word)) {
      if (tasks.length >= PROJECT.autoMin && days >= PROJECT.autoDays) auto.push(p('project'))
      else if (free.length >= PROJECT.suggestMin) suggest.push(p('project'))
      continue
    }
    if (home || GENERIC.has(w)) continue // 리스트 이름 낱말은 그 리스트 안에서만 나오면 리스트 자체가 묶음이다
    if (free.length >= PROJECT.suggestPlainMin && freeLists >= PROJECT.suggestPlainLists) suggest.push(p('plain'))
  }
  // 사용자 topic 태그 중 프로젝트 같은 것(할 일 3개 이상) → 제안
  for (const t of ctx.tags) {
    if (isProject(t) || t.source === 'ai' || blocked.has(tagKey(t.name)) || !projectish(t.name)) continue
    const n = ctx.links.filter((l) => l.tag_id === t.id && accepted(l)).length
    if (n >= PROJECT.autoMin) suggest.push({ key: tagKey(t.name), word: t.name, name: t.name, taskIds: ctx.links.filter((l) => l.tag_id === t.id && accepted(l)).map((l) => l.task_id), listIds: [], reason: 'tag', tagId: t.id })
  }
  // 한 낱말이 다른 낱말을 품으면(공모전 / 데이터공모전) 짧은 쪽 하나만 — 할 일이 같은 덩어리
  const dedupe = (xs: Proposal[]) => {
    const keep: Proposal[] = []
    for (const x of [...xs].sort((a, b) => b.taskIds.length - a.taskIds.length || a.key.length - b.key.length)) {
      const same = keep.find((k) => k.taskIds.filter((id) => x.taskIds.includes(id)).length >= Math.min(k.taskIds.length, x.taskIds.length) * 0.6)
      if (!same) keep.push(x)
    }
    return keep
  }
  const a = mergeNearNames(dedupe(auto))
  const s = dedupe(suggest).filter((x) => !a.some((y) => y.taskIds.filter((id) => x.taskIds.includes(id)).length >= x.taskIds.length * 0.6))
  return { auto: a, suggest: s }
}

/** 이름이 거의 같은가: 띄어쓰기·대소문자 무시하고 한쪽이 다른 쪽의 앞부분이거나 뒷부분(`신한 … 창업` / `신한 … 창업 공모전`) */
export function nearSameName(a: string, b: string): boolean {
  const x = tagKey(projectTitle(a)).replace(/\s+/g, ''), y = tagKey(projectTitle(b)).replace(/\s+/g, '')
  if (!x || !y) return false
  if (x === y) return true
  // §12.10: 분류 낱말 하나(`공모전`)는 특정 공모전과 같은 이름이 아니다 — 예전엔 `신한 … 공모전`이 `공모전`에 합쳐졌다
  if (isBareCategory(a) || isBareCategory(b)) return false
  const [s, l] = x.length <= y.length ? [x, y] : [y, x]
  return [...s].length >= 2 && (l.startsWith(s) || l.endsWith(s))
}
/** 이름이 거의 같은 자동 제안은 하나로(할 일 많은 쪽, 같으면 짧은 이름) — 진 쪽 낱말은 별칭으로 남는다(aliases) */
function mergeNearNames(xs: Proposal[]): Proposal[] {
  const keep: (Proposal & { aliases?: string[] })[] = []
  for (const x of [...xs].sort((a, b) => b.taskIds.length - a.taskIds.length || a.name.length - b.name.length)) {
    const k = keep.find((y) => nearSameName(y.name, x.name))
    if (!k) { keep.push({ ...x }); continue }
    k.taskIds = [...new Set([...k.taskIds, ...x.taskIds])]
    k.listIds = [...new Set([...k.listIds, ...x.listIds])]
    k.aliases = [...new Set([...(k.aliases ?? []), x.word, x.name])].filter((n) => tagKey(n) !== tagKey(k.name) && tagKey(n) !== tagKey(k.word))
  }
  return keep
}

/** AI가 만든 topic 태그 중 프로젝트 같은 이름 → project로 바꿀 id */
export const upgradeToProject = (tags: AtTag[]) => tags.filter((t) => t.source === 'ai' && !isProject(t) && (t.kind ?? 'topic') === 'topic' && projectish(projectTitle(t.name)) && !isBareCategory(t.name)).map((t) => t.id)

// ── ③ 넓히기 ──
/**
 * 이름이 제목에 없어도 붙일 할 일(§12.1 ③): 프로젝트 태그가 없는 할 일 · 같은 리스트에 구성원 2개 이상 + (그 리스트 할 일의 25% 이상 또는 같은 리스트 구성원과 날짜 3일 안) ·
 * 날짜(없으면 만든 날)가 기간 ±7일 · 일의 종류가 기타 아님. 이미 연결(어떤 상태든)이 있는 할 일은 건너뛴다.
 */
export function expandProject(tag: AtTag, members: Set<string>, ctx: FindCtx): string[] {
  const projectTags = new Set(ctx.tags.filter(isProject).map((t) => t.id))
  const hasProject = new Set(ctx.links.filter((l) => projectTags.has(l.tag_id) && accepted(l)).map((l) => l.task_id))
  const touched = new Set(ctx.links.filter((l) => l.tag_id === tag.id).map((l) => l.task_id))
  const mem = ctx.tasks.filter((t) => members.has(t.id))
  const span = projectSpan(mem)
  if (!span) return []
  const from = addDays(span.from, -PROJECT.expandDays), to = addDays(span.to, PROJECT.expandDays)
  const perList = new Map<string, { m: number; all: number }>()
  for (const t of ctx.tasks) {
    if (!t.list_id) continue
    const c = perList.get(t.list_id) ?? { m: 0, all: 0 }
    c.all++
    if (members.has(t.id)) c.m++
    perList.set(t.list_id, c)
  }
  const out: string[] = []
  for (const t of ctx.tasks) {
    if (members.has(t.id) || hasProject.has(t.id) || touched.has(t.id) || !t.list_id || t.parent_id) continue
    const c = perList.get(t.list_id)!
    if (c.m < PROJECT.expandListMin) continue
    const d = anyDay(t)
    if (!d || d < from || d > to) continue
    const near = mem.some((m) => m.list_id === t.list_id && (() => { const md = anyDay(m); return !!md && Math.abs(daysBetween(md, d)) <= PROJECT.expandNear })())
    if (c.m / c.all < PROJECT.expandShare && !near) continue
    if (workKind(t.title) === 'other') continue
    // §12.10: 분류 낱말이 든 할 일(`창업 멘토 상담`·`공모전 회의`)은 넓히기로 붙이지 않는다 — 분류 규칙(가까운 프로젝트·고르기)이 맡는다
    const tc = categoryOf(t.title)
    if (tc && tc !== EXAM_CATEGORY) continue
    out.push(t.id)
  }
  return out
}

// ── 화면 계산 ──
export type SeqLink = { from_id: string; to_id: string; kind?: string | null; state?: string | null }
/** 막힘: 들어오는 순서 선의 앞 할 일이 열려 있음 */
export function blockedSet(links: SeqLink[], open: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const l of links) if ((l.kind ?? 'sequence') === 'sequence' && (l.state ?? 'accepted') === 'accepted' && open.has(l.from_id) && l.from_id !== l.to_id) out.add(l.to_id)
  return out
}
/** ⚡ 다음(§12.2): 막히지 않은 열린 구성원, 기한 안 지난 것 먼저 마감 순 → 날짜 없는 것. 최대 n개 */
export function nextSteps<T extends PTask>(members: T[], blocked: Set<string>, today: string, n = 2): T[] {
  const open = members.filter((t) => (t.status ?? 0) === 0 && !blocked.has(t.id))
  const rank = (t: T) => { const d = t.due_at?.slice(0, 10); return d ? (d >= today ? 0 : 2) : 1 }
  return open.sort((a, b) => rank(a) - rank(b) || (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')).slice(0, n)
}

/** 추정 선(§12.3): 순서 선이 없을 때 단계 순서 조사·분석 → 개발 → 행정·제출, 앞 단계 마지막 일 → 다음 단계 첫 일(날짜가 뒤일 때만) + 행정·제출 안에서 마감 일로 */
export function inferredChain(items: { id: string; kind: WorkKind; day: string | null }[], deadlineId?: string | null): [string, string][] {
  const order: WorkKind[] = ['research', 'dev', 'admin']
  const dated = items.filter((i) => i.day).sort((a, b) => a.day!.localeCompare(b.day!))
  const phases = order.map((k) => dated.filter((i) => i.kind === k)).filter((p) => p.length)
  const out: [string, string][] = []
  for (let i = 0; i + 1 < phases.length; i++) {
    const a = phases[i][phases[i].length - 1]
    const b = phases[i + 1].find((x) => x.day! >= a.day!)
    if (b) out.push([a.id, b.id])
  }
  if (deadlineId) {
    const admin = dated.filter((i) => i.kind === 'admin' && i.id !== deadlineId)
    const dl = dated.find((i) => i.id === deadlineId)
    const prev = dl ? admin.filter((i) => i.day! <= dl.day!).pop() : undefined
    if (prev && dl && !out.some(([x, y]) => x === prev.id && y === dl.id)) out.push([prev.id, dl.id])
  }
  return out
}

/** 줄 안에서 겹치지 않게 쌓기: x(px) 순으로, 앞 칩 끝 + 간격보다 왼쪽이면 다음 줄 */
export function stackRows(xs: { id: string; x: number; w: number }[], gap = 6): Map<string, number> {
  const ends: number[] = []
  const out = new Map<string, number>()
  for (const it of [...xs].sort((a, b) => a.x - b.x)) {
    let row = ends.findIndex((e) => it.x >= e + gap)
    if (row < 0) { row = ends.length; ends.push(0) }
    ends[row] = it.x + it.w
    out.set(it.id, row)
  }
  return out
}

// ── 한 번 정리(2026-10-05 실제 데이터 버그) ──
/**
 * 예전 규칙이 만든 잘못된 자동 프로젝트를 고칠 계획(순수). 사용자 태그(source user·없음)는 건드리지 않는다 — 자동(ai·rule)만.
 *  ① 막연한 이름(`프로젝트`) · 영역 리스트·폴더가 집인 것(`근무`) → 태그와 자동 연결 지움
 *  ② 기본함에서 넓히기(rule 75)로 붙은 연결 → 지움(기본함은 묶음이 아니다)
 *  ③ 이름을 별칭 낱말 + 구성원 제목으로 다시 지음(`신한 … 공모전` → `공모전`)
 *  ④ 이름이 거의 같은 자동 프로젝트는 하나로(구성원 많은 쪽, 진 쪽 이름은 별칭, 연결은 옮김)
 *  ⑤ 자동 덩어리(run_id proj-)인데 날짜가 다른 구성원이 3개 미만 → 지움
 */
export type CleanupPlan = {
  removeTags: string[]
  removeLinks: string[]
  addLinks: { task_id: string; tag_id: string; source: string; state: string; confidence: number | null }[]
  updateTags: { id: string; name?: string; aliases?: string | null }[]
  /** §12.10.5 지운 막연한 프로젝트에 사람이 넣었던 할 일 — 새 특정 프로젝트가 잡으면 그 연결을 user로 */
  carryUser: string[]
}
export function planProjectCleanup(ctx: FindCtx): CleanupPlan {
  const out: CleanupPlan = { removeTags: [], removeLinks: [], addLinks: [], updateTags: [], carryUser: [] }
  const auto = (t: AtTag) => t.kind === 'project' && (t.source === 'ai' || t.source === 'rule')
  const autoLink = (l: AtLink) => l.source === 'ai' || l.source === 'rule'
  const tags = ctx.tags.filter(auto)
  const listOf = new Map(ctx.lists.map((l) => [l.id, l]))
  const taskOf = new Map(ctx.tasks.map((t) => [t.id, t]))
  const linksOf = (id: string) => ctx.links.filter((l) => l.tag_id === id && !out.removeLinks.includes(l.id))
  const hasUser = (id: string) => ctx.links.some((l) => l.tag_id === id && !autoLink(l) && accepted(l))
  const drop = (t: AtTag) => {
    if (hasUser(t.id)) return false // 사람이 넣은 할 일이 있으면 태그는 둔다
    out.removeTags.push(t.id)
    for (const l of ctx.links) if (l.tag_id === t.id && !out.removeLinks.includes(l.id)) out.removeLinks.push(l.id)
    return true
  }
  const homeName = (t: AtTag) => t.home_type === 'folder' ? ctx.folders.find((f) => f.id === t.home_id)?.name : listOf.get(t.home_id ?? '')?.name
  let live: AtTag[] = []
  // ①
  for (const t of tags) {
    // §12.10.5 분류(공모전·창업…)에 드는 AI 자동 프로젝트는 지우고 제목에서 다시 나눈다(findInstances가 같은 이름이면 같은 id로 다시 만든다).
    // 사람이 넣은 할 일이 있어도 — 그 할 일은 carryUser로 새 특정 프로젝트에 user로 옮긴다. 사람이 만든 태그는 건드리지 않는다
    if (t.source === 'ai' && CATEGORY_WORDS.includes(categoryOf(t.name) ?? '')) {
      out.carryUser.push(...ctx.links.filter((l) => l.tag_id === t.id && !autoLink(l) && accepted(l)).map((l) => l.task_id))
      out.removeTags.push(t.id)
      for (const l of ctx.links) if (l.tag_id === t.id && !out.removeLinks.includes(l.id)) out.removeLinks.push(l.id)
      continue
    }
    const generic = PROJECT_STOP.has(tagKey(projectTitle(t.name)))
    const areaHome = !!t.home_id && !projectish(homeName(t) ?? t.name)
    if ((generic || areaHome) && drop(t)) continue
    live.push(t)
  }
  // ②
  for (const t of live) for (const l of linksOf(t.id)) {
    const task = taskOf.get(l.task_id)
    if (l.source === 'rule' && l.confidence === PROJECT.expandScore && task?.list_id && listOf.get(task.list_id)?.kind === 'inbox') out.removeLinks.push(l.id)
  }
  // ③
  const names = new Map<string, { name: string; aliases: string[] }>()
  for (const t of live) {
    const aliases = parseAliases(t.aliases)
    let name = t.name
    if (t.run_id?.startsWith('proj-') && aliases.length) {
      const word = aliases[0]
      const titles = linksOf(t.id).filter(accepted).map((l) => taskOf.get(l.task_id)?.title ?? '').filter((x) => x && tagKey(x).includes(tagKey(word)))
      const fresh = titles.length ? fullProjectName(word, titles) : word
      if (tagKey(fresh) !== tagKey(name) && !isBareCategory(fresh) && !ctx.tags.some((o) => o.id !== t.id && tagKey(o.name) === tagKey(fresh))) name = fresh
    }
    names.set(t.id, { name, aliases })
  }
  // ④ 구성원 많은 쪽이 남는다
  const size = (t: AtTag) => linksOf(t.id).filter(accepted).length
  const order = [...live].sort((a, b) => size(b) - size(a) || names.get(a.id)!.name.length - names.get(b.id)!.name.length)
  const kept: AtTag[] = []
  for (const t of order) {
    const k = kept.find((y) => nearSameName(names.get(y.id)!.name, names.get(t.id)!.name))
    if (!k || hasUser(t.id)) { kept.push(t); continue }
    const kn = names.get(k.id)!
    kn.aliases = [...new Set([...kn.aliases, ...names.get(t.id)!.aliases, names.get(t.id)!.name, t.name])]
    const have = new Set(linksOf(k.id).map((l) => l.task_id))
    for (const l of linksOf(t.id)) {
      out.removeLinks.push(l.id)
      if (!have.has(l.task_id) && accepted(l)) { have.add(l.task_id); out.addLinks.push({ task_id: l.task_id, tag_id: k.id, source: l.source ?? 'rule', state: 'accepted', confidence: l.confidence ?? null }) }
    }
    out.removeTags.push(t.id)
  }
  live = kept
  // ⑤
  for (const t of live) {
    if (!t.run_id?.startsWith('proj-') || t.home_id) continue
    const ids = new Set([...linksOf(t.id).filter(accepted).map((l) => l.task_id), ...out.addLinks.filter((a) => a.tag_id === t.id).map((a) => a.task_id)])
    const days = new Set([...ids].map((id) => taskOf.get(id)).filter((x): x is PTask => !!x).map(taskDay).filter(Boolean)).size
    if (days < PROJECT.autoDays && drop(t)) { live = live.filter((x) => x !== t); out.addLinks = out.addLinks.filter((a) => a.tag_id !== t.id) }
  }
  for (const t of live) {
    const n = names.get(t.id)!
    const aliases = n.aliases.filter((a) => tagKey(a) !== tagKey(n.name))
    const raw = aliases.length ? JSON.stringify([...new Set(aliases)]) : null
    const patch: CleanupPlan['updateTags'][number] = { id: t.id }
    if (n.name !== t.name) patch.name = n.name
    if (raw !== (t.aliases ?? null)) patch.aliases = raw
    if (patch.name !== undefined || patch.aliases !== undefined) out.updateTags.push(patch)
  }
  out.removeLinks = [...new Set(out.removeLinks)]
  return out
}
