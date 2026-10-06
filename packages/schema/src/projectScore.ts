// 31 §12.13 프로젝트 넣기 점수(순수, 데스크톱·모바일 공용). 프로젝트는 사람이 만들고, 할 일을 넣는 것만 점수로 정한다.
//  · scoreTask: 할 일 하나 × 프로젝트들 → 가장 높은 프로젝트와 점수·이유
//  · projectCandidates: 열린 할 일 전부 → 붙일 것(auto, 70↑) · 물을 것(ask, 40~69). 같은 때 입력이 이어지게 두 바퀴
//  · focusApplies: 지금 집중 칩을 빠른 추가에 붙일까
//  · splitPeople: 팀원 이름 읽기(`민수, 지은` · `민수랑 지은이`)
// DB 읽기·쓰기는 앱(apps/desktop/.../data/projects.ts).
import { distinctWords, STOP_WORDS, tagKey, type AtLink, type AtList, type AtTag } from './autoTag.ts'
import { displayTitle, parseAliases } from './wikiLink.ts'
import { daysBetween, PROJECT_STOP, projectDeadline, projectMembers, projectSpan, projectTitle, taskDay, workKind, type PTask } from './projects.ts'

/** 점수표(§12.13.3). 합은 0~100으로 자른다 */
export const PSCORE = {
  /** 이 점수 이상이면 붙인다 */
  auto: 70,
  /** 이 점수 이상이면 묻는다(그 아래는 없음) */
  ask: 40,
  /** 두 프로젝트가 이 점수 안이면 70을 넘어도 묻는다 */
  tie: 10,
  // 증거(하나는 있어야 센다)
  name: 70,
  team: 45,
  memberPerson: 20,
  series: 45,
  hint: 50,
  burst: 25,
  similar: 10,
  similarMax: 20,
  // 문맥
  period: 15,
  far: -30,
  only: 15,
  list: 10,
  other: -10,
  /** 기간 안 = 기간 ±이 일 수 */
  periodDays: 7,
  /** 기간에서 이 일 수 넘게 떨어지면 감점 */
  farDays: 30,
  /** 배운 낱말이 먹는 범위(기간 ±) */
  hintDays: 14,
  /** 같은 때 입력 = 만든 시각이 이 분 안 */
  burstMin: 5,
  /** 하루에 묻는 수 */
  askPerDay: 3,
  /** 이 일 수 안에 만든 할 일만 말풍선으로 묻는다 */
  askFreshDays: 7
} as const

export type Why = 'name' | 'team' | 'person' | 'series' | 'hint' | 'burst' | 'similar' | 'period' | 'far' | 'only' | 'list' | 'other'
const EVIDENCE: Why[] = ['name', 'team', 'person', 'series', 'hint', 'burst', 'similar']
const STRONG: Why[] = ['name', 'team', 'series', 'hint']
export type Reason = { why: Why; points: number; label: string }
export type ScoreTask = PTask & { status?: number | null; created_at?: string | null }
export type ScoreRel = { from_type: string; from_id: string; to_type: string; to_id: string; field?: string | null; state?: string | null }

/** 생활 낱말 — 프로젝트 일이 아니다(넣지도 묻지도, 집중 칩도 안 붙임) */
export const LIFE_WORDS = ['장보기', '장봐', '빨래', '청소', '설거지', '분리수거', '쓰레기', '세탁', '택배', '마트', '미용실', '이발', '다이소', '반찬', '집안일', '빨래방']
export const isLifeTask = (title: string) => { const c = tagKey(displayTitle(title)).replace(/\s+/g, ''); return LIFE_WORDS.some((w) => c.includes(w)) }

// ── 이어지는 이름(1차 회의 → 2차 회의) ──
const ORD = /(\d+)\s*(회차|차|주차|번째|편|부|단계|회(?![의식사계]))|(?:part|파트|pt\.?)\s*(\d+)/i
const STEM_JOSA = /(에서|으로|에게|까지|부터|이랑|랑|을|를|은|는|에|로|와|과)$/
/** 제목 → 이어지는 이름 열쇠 `줄기|단위`(숫자를 뺀 나머지 + 단위). 숫자 단위가 없거나 줄기가 2글자 미만이면 null */
export function seriesKey(title: string): string | null {
  const t = displayTitle(title).toLowerCase()
  const m = t.match(ORD)
  if (!m || m.index === undefined) return null
  const unit = m[2] ? (m[2] === '회차' ? '회' : m[2]) : 'part'
  const rest = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`
  const stem = rest.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => { const x = w.replace(STEM_JOSA, ''); return [...x].length >= 2 ? x : w }).join('')
  if ([...stem].length < 2) return null
  return `${stem}|${unit}`
}

// ── 팀원 이름 읽기 ──
const NOBODY = new Set(['혼자', '혼자해', '혼자할게', '없어', '없음', '나', '저', '아무도', '나혼자', '없어요', '아니', '건너뛰기'])
const NAME_TAIL = /(이랑|랑|하고|이하고|와|과|이가|이도|도|이)$/u
/** `민수, 지은` · `민수랑 지은이` · `민수 지은 교수님` → ['민수', '지은', '교수님'] (최대 8명, 1~10자) */
export function splitPeople(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[,，、·/\n;]|\s+/u)) {
    let w = raw.trim().replace(/^👤\s*/u, '').replace(/^@/, '').replace(/[.!?~]+$/u, '')
    if (!w) continue
    const cut = w.replace(NAME_TAIL, '')
    if ([...cut].length >= 2) w = cut
    if (NOBODY.has(w) || ['같이', '함께', '팀', '팀원', '랑', '하고', '그리고', '요', '해요', '해'].includes(w) || [...w].length > 10) continue
    if (!out.includes(w)) out.push(w)
  }
  return out.slice(0, 8)
}

// ── 프로젝트 모양 ──
export type ScoreProject = {
  id: string
  name: string
  /** 이름·별칭(공백 뺀 열쇠) */
  keys: string[]
  members: ScoreTask[]
  ids: Set<string>
  ended: boolean
  span: { from: string; to: string } | null
  mainList: string | null
  /** 팀원(relations tag→tag field project): 사람 태그 id → 이름 열쇠들 */
  team: { id: string; name: string; keys: string[] }[]
  /** 구성원에 붙은 사람 태그(팀원 아님) */
  people: { id: string; name: string; keys: string[] }[]
  hints: string[]
  series: Set<string>
  words: Set<string>
}
const compact = (s: string) => tagKey(projectTitle(displayTitle(s))).replace(/\s+/g, '')
const keysOf = (t: Pick<AtTag, 'name' | 'aliases'>) => [...new Set([t.name, ...parseAliases(t.aliases)].map(compact).filter((k) => [...k].length >= 2))]
const accepted = (state: string | null | undefined) => (state ?? 'accepted') === 'accepted'
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** 할 일 날짜: 마감·시작(끝낸 일은 끝낸 날) → 만든 날 → 오늘 */
const dayOf = (t: ScoreTask, today: string) => taskDay(t) ?? t.created_at?.slice(0, 10) ?? today
/** 점수용 낱말: 뚜렷한 낱말 − 막연한 말(프로젝트·계획…) */
const wordsOf = (title: string) => distinctWords(title).filter((w) => !PROJECT_STOP.has(w) && !STOP_WORDS.has(w))

/**
 * 끝난 프로젝트(planView projectEnded와 같은 규칙 — 여기는 구성원만으로): 다 끝났고 마감 7일 지남 · 집 리스트 보관 · 구성원이 다 끝남 ·
 * 마감 지남 · 남은 열린 일이 모두 지난 날짜. 구성원이 없으면 끝나지 않음.
 */
export function membersEnded(members: ScoreTask[], today: string, archived = false): boolean {
  if (archived) return true
  if (!members.length) return false
  const open = members.filter((m) => (m.status ?? 0) === 0)
  if (!open.length) return true
  const dl = projectDeadline(members)
  if (dl && dl.day < today) return true
  return open.every((m) => { const d = taskDay(m); return !!d && d < today })
}

export type ScoreInput = {
  tags: AtTag[]
  /** 지운 것 뺀 할 일(열린 것 + 최근 끝낸 것) */
  tasks: ScoreTask[]
  links: AtLink[]
  lists: AtList[]
  /** relations 행 — 팀원(tag→tag project) · 배운 낱말(tag→hint) */
  relations: ScoreRel[]
  today: string
}
/** 프로젝트 태그마다 점수에 쓰는 모양 */
export function buildScoreProjects(i: ScoreInput): ScoreProject[] {
  const listOf = new Map(i.lists.map((l) => [l.id, l]))
  const byId = new Map(i.tasks.map((t) => [t.id, t]))
  const tagById = new Map(i.tags.map((t) => [t.id, t]))
  const personKeys = (id: string) => { const t = tagById.get(id); return t ? keysOf(t) : [] }
  const out: ScoreProject[] = []
  for (const tag of i.tags) {
    if (tag.kind !== 'project') continue
    const ids = projectMembers(tag, i.tasks, i.links, i.lists)
    const members = [...ids].map((id) => byId.get(id)!).filter(Boolean)
    const archived = tag.home_type === 'list' && !!tag.home_id && !listOf.has(tag.home_id)
    const dl = projectDeadline(members)
    const team = i.relations.filter((r) => r.from_type === 'tag' && r.from_id === tag.id && r.to_type === 'tag' && r.field === 'project' && accepted(r.state) && tagById.get(r.to_id)?.kind === 'person')
      .map((r) => ({ id: r.to_id, name: tagById.get(r.to_id)!.name, keys: personKeys(r.to_id) }))
    const teamIds = new Set(team.map((t) => t.id))
    const peopleIds = new Set(i.links.filter((l) => ids.has(l.task_id) && accepted(l.state) && tagById.get(l.tag_id)?.kind === 'person' && !teamIds.has(l.tag_id)).map((l) => l.tag_id))
    const counts = new Map<string, number>()
    for (const m of members) if (m.list_id && listOf.get(m.list_id)?.kind !== 'inbox') counts.set(m.list_id, (counts.get(m.list_id) ?? 0) + 1)
    out.push({
      id: tag.id, name: projectTitle(tag.name), keys: keysOf(tag), members, ids,
      ended: membersEnded(members, i.today, archived),
      span: projectSpan(members, dl?.day),
      mainList: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
      team, people: [...peopleIds].map((id) => ({ id, name: tagById.get(id)!.name, keys: personKeys(id) })),
      hints: i.relations.filter((r) => r.from_type === 'tag' && r.from_id === tag.id && r.to_type === 'hint' && accepted(r.state)).map((r) => r.to_id),
      series: new Set(members.map((m) => seriesKey(m.title)).filter((k): k is string => !!k)),
      words: new Set(members.flatMap((m) => wordsOf(m.title)))
    })
  }
  return out
}

export type Scored = { tagId: string; score: number; reasons: Reason[] }
type Env = { today: string; projects: ScoreProject[]; personOf: Map<string, Set<string>> }
/** 할 일 하나 × 프로젝트 하나 점수(증거가 없으면 0) */
function scoreOne(t: ScoreTask, p: ScoreProject, env: Env): Scored {
  const reasons: Reason[] = []
  const add = (why: Why, points: number, label: string) => { if (points) reasons.push({ why, points, label }) }
  const c = compact(t.title)
  const day = dayOf(t, env.today)
  // 증거
  const nameHit = p.keys.find((k) => c.includes(k))
  if (nameHit) add('name', PSCORE.name, '이름')
  const has = env.personOf.get(t.id) ?? new Set<string>()
  const mate = p.team.find((m) => has.has(m.id) || m.keys.some((k) => c.includes(k)))
  if (mate) add('team', PSCORE.team, `팀원 ${mate.name}`)
  else { const pp = p.people.find((m) => has.has(m.id) || m.keys.some((k) => c.includes(k))); if (pp) add('person', PSCORE.memberPerson, `함께한 ${pp.name}`) }
  const sk = seriesKey(t.title)
  if (sk && p.series.has(sk)) add('series', PSCORE.series, '이어지는 이름')
  const words = wordsOf(t.title)
  const inSpan = (d: number) => !!p.span && day >= addDays(p.span.from, -d) && day <= addDays(p.span.to, d)
  const hint = p.hints.find((h) => words.includes(h) || ([...h].length >= 2 && c.includes(h)))
  if (hint && (inSpan(PSCORE.hintDays) || !p.span)) add('hint', PSCORE.hint, `'${hint}'`)
  const created = t.created_at ? Date.parse(t.created_at) : NaN
  if (!Number.isNaN(created) && p.members.some((m) => m.id !== t.id && m.created_at && Math.abs(Date.parse(m.created_at) - created) <= PSCORE.burstMin * 60_000)) add('burst', PSCORE.burst, '같은 때 입력')
  const shared = words.filter((w) => p.words.has(w))
  if (shared.length && !nameHit) add('similar', Math.min(PSCORE.similarMax, shared.length * PSCORE.similar), `비슷한 일 '${shared[0]}'`)
  if (!reasons.some((r) => EVIDENCE.includes(r.why))) return { tagId: p.id, score: 0, reasons: [] }
  // 문맥
  if (p.span) {
    if (inSpan(PSCORE.periodDays)) add('period', PSCORE.period, '기간 안')
    else if (day < addDays(p.span.from, -PSCORE.farDays) || day > addDays(p.span.to, PSCORE.farDays)) add('far', PSCORE.far, '기간에서 멂')
  }
  const covering = env.projects.filter((q) => !q.ended && q.span && day >= addDays(q.span.from, -PSCORE.periodDays) && day <= addDays(q.span.to, PSCORE.periodDays))
  if (covering.length === 1 && covering[0].id === p.id) add('only', PSCORE.only, '지금 하는 프로젝트')
  if (p.mainList && t.list_id === p.mainList) add('list', PSCORE.list, '같은 리스트')
  if (workKind(t.title) === 'other') add('other', PSCORE.other, '일이 아님')
  // 강한 신호(이름·팀원·이어지는 이름·배운 낱말)가 없으면 붙이지 않고 묻기까지만 — 중간 신호를 쌓아 붙지 않게(2026-10-06 실측: 같은 때 + 같은 리스트로 '회의'가 붙음)
  const strong = reasons.some((r) => STRONG.includes(r.why))
  const score = Math.max(0, Math.min(strong ? 100 : PSCORE.auto - 1, reasons.reduce((s, r) => s + r.points, 0)))
  return { tagId: p.id, score, reasons: reasons.sort((a, b) => b.points - a.points) }
}

export type Cand = Scored & { taskId: string; /** 두 번째로 높은 프로젝트와 차이 */ margin: number }
/**
 * 할 일 하나의 가장 높은 프로젝트. 안 보는 것: 끝난 프로젝트 · 이미 어느 프로젝트 구성원 · 그 프로젝트에 행이 있음(뗀 것 포함) · 하위 할 일 · 생활 낱말 · 끝낸 일.
 */
export function scoreTask(t: ScoreTask, projects: ScoreProject[], env: { today: string; links: AtLink[]; personOf?: Map<string, Set<string>> }): Cand | null {
  if ((t.status ?? 0) !== 0 || t.deleted_at || t.parent_id || isLifeTask(t.title)) return null
  if (projects.some((p) => p.ids.has(t.id))) return null
  const touched = new Set(env.links.filter((l) => l.task_id === t.id).map((l) => l.tag_id))
  const e: Env = { today: env.today, projects, personOf: env.personOf ?? new Map() }
  const all = projects.filter((p) => !p.ended && !touched.has(p.id)).map((p) => scoreOne(t, p, e)).filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.tagId.localeCompare(b.tagId))
  if (!all.length) return null
  return { ...all[0], taskId: t.id, margin: all[0].score - (all[1]?.score ?? 0) }
}
/** 사람 태그 연결: 할 일 → 사람 태그 id들 */
export function personLinksOf(tags: AtTag[], links: AtLink[]): Map<string, Set<string>> {
  const person = new Set(tags.filter((t) => t.kind === 'person').map((t) => t.id))
  const out = new Map<string, Set<string>>()
  for (const l of links) if (person.has(l.tag_id) && accepted(l.state)) (out.get(l.task_id) ?? out.set(l.task_id, new Set()).get(l.task_id)!).add(l.tag_id)
  return out
}

/**
 * 열린 할 일 전부 → 붙일 것(70↑, 다음 프로젝트와 10점 넘게 차이) · 물을 것(40~69, 또는 70↑인데 차이가 작음). 점수 높은 순.
 * 두 바퀴: 첫 바퀴에서 붙은 일을 구성원으로 더해 다시 본다(같은 때 입력·이어지는 이름이 이어지게).
 */
export function projectCandidates(i: ScoreInput, opts: { taskIds?: Set<string> } = {}): { auto: Cand[]; ask: Cand[]; projects: ScoreProject[] } {
  const projects = buildScoreProjects(i)
  const personOf = personLinksOf(i.tags, i.links)
  const pool = i.tasks.filter((t) => (!opts.taskIds || opts.taskIds.has(t.id)))
  const auto: Cand[] = []
  let ask: Cand[] = []
  const taken = new Set<string>()
  for (let round = 0; round < 2; round++) {
    ask = []
    let grew = false
    for (const t of pool) {
      if (taken.has(t.id)) continue
      const c = scoreTask(t, projects, { today: i.today, links: i.links, personOf })
      if (!c || c.score < PSCORE.ask) continue
      if (c.score >= PSCORE.auto && c.margin > PSCORE.tie) {
        auto.push(c); taken.add(t.id); grew = true
        const p = projects.find((x) => x.id === c.tagId)!
        p.members.push(t); p.ids.add(t.id)
        const sk = seriesKey(t.title); if (sk) p.series.add(sk)
        for (const w of wordsOf(t.title)) p.words.add(w)
      } else ask.push(c)
    }
    if (!grew) break
  }
  const by = (a: Cand, b: Cand) => b.score - a.score || a.taskId.localeCompare(b.taskId)
  return { auto: auto.sort(by), ask: ask.sort(by), projects }
}

/** 말풍선 이유 한 줄(점수 높은 증거 두 개): `팀원 민수 · 같은 때 입력` */
export const reasonLine = (c: Pick<Scored, 'reasons'>) => c.reasons.filter((r) => r.points > 0 && r.why !== 'period' && r.why !== 'only' && r.why !== 'list').slice(0, 2).map((r) => r.label).join(' · ')

/** 배운 낱말로 남길 낱말(§12.13.5 ⓑ): 제목의 가장 긴 뚜렷한 낱말(이어지는 이름 숫자·생활 낱말 뺌). 없으면 null */
export function hintWord(title: string): string | null {
  const ws = wordsOf(title).filter((w) => !/\d/.test(w))
  return ws.sort((a, b) => [...b].length - [...a].length || a.localeCompare(b))[0] ?? null
}
/** 제목에 이름이 든 사람 태그(팀원 잇기용, §12.13.5 ⓐ) */
export function personInTitle(title: string, persons: Pick<AtTag, 'id' | 'name' | 'aliases'>[]): string | null {
  const c = compact(title)
  return persons.find((p) => keysOf(p).some((k) => c.includes(k)))?.id ?? null
}

// ── 지금 집중(§12.13.7) ──
export type FocusInfo = { id: string; name: string; ended: boolean; /** 구성원이 있는 리스트 + 집 리스트 */ lists: string[] }
/**
 * 빠른 추가에 집중 칩을 붙일까: 집중이 켜져 있고 끝나지 않았음 · 제목이 있음 · 다른 프로젝트 #태그 없음 ·
 * ~리스트가 상관없는 리스트가 아님 · 제목에 다른 (끝나지 않은) 프로젝트 이름 없음 · 생활 낱말 아님.
 */
export function focusApplies(focus: FocusInfo | null | undefined, q: { title: string; tag_ids?: string[]; list_id?: string | null }, others: { id: string; name: string; aliases?: string | null; ended?: boolean }[]): boolean {
  if (!focus || focus.ended || !q.title.trim()) return false
  if (isLifeTask(q.title)) return false
  const rest = others.filter((o) => o.id !== focus.id)
  if ((q.tag_ids ?? []).some((id) => rest.some((o) => o.id === id))) return false
  if (q.list_id && !focus.lists.includes(q.list_id)) return false
  const c = compact(q.title)
  if (rest.some((o) => !o.ended && keysOf(o).some((k) => c.includes(k)))) return false
  return true
}
