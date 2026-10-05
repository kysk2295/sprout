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
/** 낱말 하나가 프로젝트 이름 같은가: 공모전·창업 같은 말을 품음 · 시험 이름 · 대소문자 섞인 영문 고유 이름(UniPort) */
export function projectish(word: string): boolean {
  const raw = word.trim()
  const k = tagKey(raw)
  if ([...k].length < 2) return false
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

const DEADLINE_WORDS = ['제출', '마감', '시험', '접수', '발표', '본선', '결선', '면접', '심사']
/** 마감(§12.3): 열린 구성원 중 마감 말이 든 일의 가장 늦은 마감. 없으면 열린 구성원 전부의 마감이 아니라 null */
export function projectDeadline(members: PTask[]): { day: string; word: string; taskId: string } | null {
  let best: { day: string; word: string; taskId: string } | null = null
  for (const t of members) {
    if ((t.status ?? 0) !== 0 || !t.due_at) continue
    const c = displayTitle(t.title).replace(/\s+/g, '')
    const word = DEADLINE_WORDS.find((w) => c.includes(w))
    if (!word) continue
    const day = t.due_at.slice(0, 10)
    if (!best || day > best.day) best = { day, word, taskId: t.id }
  }
  return best
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
  reason: 'project' | 'home' | 'plain' | 'tag'
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
 * 태그 이름: 그 낱말 앞에 붙어 나오는 가장 긴 이름(앞 낱말 최대 5개, 20자). 영문 한 글자는 대문자.
 * `k 인공지능 제조 데이터 공모전 신청` → `K 인공지능 제조 데이터 공모전`
 */
export function fullProjectName(word: string, titles: string[]): string {
  const key = tagKey(word)
  let best = word
  for (const title of titles) {
    const parts = displayTitle(title).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    const at = parts.findIndex((p) => tagKey(p).startsWith(key))
    if (at < 0) continue
    const head = parts[at].slice(0, [...parts[at]].length - ([...tagKey(parts[at])].length - [...key].length))
    for (let from = Math.max(0, at - 5); from <= at; from++) {
      const before = parts.slice(from, at).filter((p) => !STOP_WORDS.has(p.toLowerCase()) && !/^\d/.test(p))
      if (before.length !== at - from) continue // 사이에 흔한 낱말이 끼면 그 앞은 이름이 아니다
      const name = [...before, head].map((p) => (/^[a-z]$/.test(p) ? p.toUpperCase() : p)).join(' ')
      if ([...name].length <= PROJECT.nameMax && [...name].length > [...best].length) best = name
      break
    }
  }
  return best
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
  for (const [w, ids] of hits) {
    if (STOP_WORDS.has(w) || isWorkWord(w) || tagKeys.has(w) || blocked.has(w) || [...w].length < 2) continue
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
    if (home && outside.length >= PROJECT.homeMentions) { auto.push(p('home')); continue }
    const free = tasks.filter((t) => !taken.has(t.id))
    const freeLists = new Set(free.map((t) => t.list_id ?? '')).size
    if (projectish(word)) {
      if (tasks.length >= PROJECT.autoMin) auto.push(p('project'))
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
  const a = dedupe(auto)
  const s = dedupe(suggest).filter((x) => !a.some((y) => y.taskIds.filter((id) => x.taskIds.includes(id)).length >= x.taskIds.length * 0.6))
  return { auto: a, suggest: s }
}

/** AI가 만든 topic 태그 중 프로젝트 같은 이름 → project로 바꿀 id */
export const upgradeToProject = (tags: AtTag[]) => tags.filter((t) => t.source === 'ai' && !isProject(t) && (t.kind ?? 'topic') === 'topic' && projectish(projectTitle(t.name))).map((t) => t.id)

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
