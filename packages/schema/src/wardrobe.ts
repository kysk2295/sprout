// 43 캐릭터 키우기 — 옷장(5칸 · 옷 23개) · 해금 규칙 · 트로피 · 하루 장면 · 성장 막대 문구.
// 데스크톱·휴대폰이 같이 쓰는 순수 데이터·함수. 아이템 목록은 데이터베이스가 아니라 여기(코드)에 둔다 —
// 받은 것은 character_items(동기화 표)에 남아서 규칙을 바꿔도 이미 받은 것은 잃지 않는다(43 §6 · §10).
// 원칙(43 §1·§12): 보상의 원천은 실제로 한 일뿐(레벨·한 날 누적·주간 점검·끝낸 프로젝트·계절 기간의 할 일),
// 만지기·입히기로는 아무것도 주지 않는다. 연속 기록은 세지 않는다(누적만). 받은 것은 줄지 않는다.
import { STAGES, stageOf, type Species } from './growth.ts'
import { solarOfLunar } from './holidays.ts'

// ── 칸 · 옷 ────────────────────────────────────────────────────
/** 입는 칸. bg = 방(무대 배경) */
export type Slot = 'hat' | 'neck' | 'hand' | 'back' | 'bg'
/** 옷장 탭(방 탭 = 배경 + 장식) */
export type WardTab = 'hat' | 'neck' | 'hand' | 'back' | 'room'
export const SLOTS: [WardTab, string][] = [['hat', '모자'], ['neck', '목'], ['hand', '손'], ['back', '등'], ['room', '배경']]
export const SLOT_NAME: Record<Slot, string> = { hat: '모자', neck: '목', hand: '손', back: '등', bg: '방 · 배경' }

export type SeasonKey = 'chuseok' | 'xmas' | 'seollal'
export type ItemRule = { lv: number } | { days: number } | { reviews: number } | { projects: number } | { season: SeasonKey }
export type ItemSource = 'level' | 'days' | 'review' | 'project' | 'season'
export type Item = { id: string; slot: Slot; name: string; rule: ItemRule; why?: string }

/** 43 §6 해금표 — 처음 옷 23개 */
export const ITEMS: Item[] = [
  { id: 'auto', slot: 'bg', name: '자동 · 시간 따라', rule: { days: 0 }, why: '아침엔 새벽, 낮엔 정원, 저녁엔 노을, 밤엔 별밤' },
  { id: 'grass', slot: 'bg', name: '정원 낮', rule: { lv: 1 } },
  { id: 'dawn', slot: 'bg', name: '정원 새벽', rule: { days: 0 } },
  { id: 'acorn-cap', slot: 'hat', name: '도토리 모자', rule: { lv: 2 } },
  { id: 'ribbon', slot: 'neck', name: '빨간 리본', rule: { lv: 3 }, why: '꼬마 진화 선물' },
  { id: 'pencil', slot: 'hand', name: '몽당연필', rule: { lv: 4 } },
  { id: 'leaf-hat', slot: 'hat', name: '잎사귀 모자', rule: { lv: 5 } },
  { id: 'sunset', slot: 'bg', name: '노을 언덕', rule: { lv: 6 }, why: '친구 진화 선물' },
  { id: 'bandana', slot: 'neck', name: '노랑 반다나', rule: { lv: 7 } },
  { id: 'straw', slot: 'hat', name: '밀짚모자', rule: { lv: 8 } },
  { id: 'backpack', slot: 'back', name: '작은 배낭', rule: { lv: 9 } },
  { id: 'night', slot: 'bg', name: '정원 밤', rule: { lv: 10 }, why: '단짝 진화 선물' },
  { id: 'pond', slot: 'bg', name: '연못', rule: { days: 45 } },
  { id: 'rain', slot: 'bg', name: '비 오는 정원', rule: { days: 14 } },
  { id: 'flowers', slot: 'bg', name: '꽃밭', rule: { days: 21 } },
  { id: 'study', slot: 'bg', name: '서재 · 책상', rule: { reviews: 2 }, why: '공부할 때' },
  { id: 'bowtie', slot: 'neck', name: '나비넥타이', rule: { lv: 11 } },
  { id: 'beanie', slot: 'hat', name: '방울 털모자', rule: { lv: 12 } },
  { id: 'balloon', slot: 'hand', name: '풍선', rule: { lv: 13 } },
  { id: 'wings', slot: 'back', name: '잎 날개', rule: { lv: 15 }, why: '전설 진화 선물' },
  { id: 'mug', slot: 'hand', name: '머그컵', rule: { days: 7 } },
  { id: 'lantern', slot: 'back', name: '초롱', rule: { days: 30 } },
  { id: 'lei', slot: 'neck', name: '꽃목걸이', rule: { reviews: 4 } },
  { id: 'flag', slot: 'hand', name: '작은 깃발', rule: { projects: 1 } },
  { id: 'songpyeon', slot: 'hand', name: '송편', rule: { season: 'chuseok' } },
  { id: 'moon', slot: 'bg', name: '보름달 밤', rule: { season: 'chuseok' } },
  { id: 'santa', slot: 'hat', name: '산타 모자', rule: { season: 'xmas' } },
  { id: 'snow', slot: 'bg', name: '눈 오는 날', rule: { season: 'xmas' } },
  { id: 'bok', slot: 'hand', name: '복주머니', rule: { season: 'seollal' } }
]
export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))
export const itemsOfTab = (tab: WardTab) => ITEMS.filter((i) => (tab === 'room' ? i.slot === 'bg' : i.slot === tab))
export const BG_IDS = ITEMS.filter((i) => i.slot === 'bg').map((i) => i.id)

/** 10 §3.2.7 방 장식 9개(레벨로 열림 — 받은 것 표에 넣지 않고 레벨에서 바로 계산한다) */
export const DECOR = [
  { id: 'pot', name: '꽃 화분', lv: 2 }, { id: 'fence', name: '나무 울타리', lv: 3 }, { id: 'mushlamp', name: '버섯 등', lv: 4 },
  { id: 'butterfly', name: '나비', lv: 5 }, { id: 'ball', name: '공', lv: 6 }, { id: 'bunting', name: '깃발 줄', lv: 8 },
  { id: 'tent', name: '작은 텐트', lv: 10 }, { id: 'firefly', name: '반딧불', lv: 12 }, { id: 'arch', name: '꽃 아치', lv: 15 }
] as const

// ── 계절 (43 §6 원천 규칙) ───────────────────────────────────────
export const SEASON_LABEL: Record<SeasonKey, string> = { chuseok: '추석 앞뒤 7일', xmas: '12/18–12/31', seollal: '설 앞뒤 7일' }
const addDay = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** 그해의 계절 기간(로컬 날짜, 끝 포함). 설·추석은 음력 표(holidays.ts) 범위 밖이면 null */
export function seasonWindow(key: SeasonKey, year: number): { from: string; to: string } | null {
  if (key === 'xmas') return { from: `${year}-12-18`, to: `${year}-12-31` }
  const center = key === 'chuseok' ? solarOfLunar(year, 8, 15) : solarOfLunar(year, 1, 1)
  return center ? { from: addDay(center, -7), to: addDay(center, 7) } : null
}
/** 이 날짜가 든 계절들 */
export function seasonsOn(day: string): SeasonKey[] {
  const y = Number(day.slice(0, 4))
  return (['chuseok', 'xmas', 'seollal'] as SeasonKey[]).filter((k) => {
    const w = seasonWindow(k, y)
    return !!w && day >= w.from && day <= w.to
  })
}

// ── 원장 → 해금 상태 ────────────────────────────────────────────
export type XpLedgerRow = { kind: string; amount: number; day: string }
/** 한 날 = 할 일 XP(되돌림 반영)가 1 이상 남은 로컬 날짜(43 §6). 연속이 아니라 누적 */
export function activeDayList(xp: XpLedgerRow[]): string[] {
  const m = new Map<string, number>()
  for (const e of xp) if (e.kind === 'task' || e.kind === 'task_revoke') m.set(e.day, (m.get(e.day) ?? 0) + e.amount)
  return [...m].filter(([, n]) => n >= 1).map(([d]) => d).sort()
}
/** 주간 점검 누적 수 */
export const reviewCount = (xp: XpLedgerRow[]) => xp.filter((e) => e.kind === 'review' && e.amount > 0).length

/** 31 프로젝트가 끝났나(43 §6 [임시]): 열린 할 일 0 + 끝낸 할 일 3개 이상. day = 마지막으로 끝낸 날 */
export type ProjectMember = { status?: number | null; completed_at?: string | null; deleted_at?: string | null }
export function projectFinished(members: ProjectMember[]): { done: boolean; day: string | null } {
  const live = members.filter((m) => !m.deleted_at)
  const open = live.filter((m) => !m.status).length
  const done = live.filter((m) => m.status === 1)
  if (open > 0 || done.length < 3) return { done: false, day: null }
  const day = done.map((m) => (m.completed_at ?? '').slice(0, 10)).filter(Boolean).sort().at(-1) ?? null
  return { done: true, day }
}
export type FinishedProject = { id: string; title: string; day: string | null }

export type RaiseState = {
  level: number
  /** 한 날 누적 수 */
  days: number
  reviews: number
  projects: FinishedProject[]
  /** 기간 안에 할 일 XP를 받은 적 있는 계절(어느 해든) */
  seasons: SeasonKey[]
}
export function raiseStateFrom(level: number, xp: XpLedgerRow[], projects: FinishedProject[] = []): RaiseState {
  const days = activeDayList(xp)
  const seasons = new Set<SeasonKey>()
  for (const d of days) for (const k of seasonsOn(d)) seasons.add(k)
  return { level, days: days.length, reviews: reviewCount(xp), projects, seasons: [...seasons] }
}

export function ruleMet(rule: ItemRule, s: RaiseState): boolean {
  if ('lv' in rule) return s.level >= rule.lv
  if ('days' in rule) return s.days >= rule.days
  if ('reviews' in rule) return s.reviews >= rule.reviews
  if ('projects' in rule) return s.projects.length >= rule.projects
  return s.seasons.includes(rule.season)
}
export const ruleSource = (rule: ItemRule): ItemSource => ('lv' in rule ? 'level' : 'days' in rule ? 'days' : 'reviews' in rule ? 'review' : 'projects' in rule ? 'project' : 'season')

/** 트로피(43 §7): 끝낸 프로젝트 = 금색 컵, 한 날 7·30·100 = 메달, 주간 점검 4·12·26 = 도장 */
export const TROPHY_STEPS = { days: [7, 30, 100], reviews: [4, 12, 26] } as const
export type TrophyKind = 'cup' | 'medal' | 'stamp'

/** character_items 행(동기화). id를 사건에서 만든다 — 두 기기가 같이 넣어도 하나로 합쳐진다(43 §10) */
export type CharacterItemRow = {
  id: string
  character_id: string
  item_id: string
  kind: 'item' | 'trophy'
  source: ItemSource
  ref_id: string | null
  title: string
}
export const itemRowId = (characterId: string, itemId: string) => `item:${characterId}:${itemId}`
export const trophyRowId = {
  project: (characterId: string, projectId: string) => `trophy:${characterId}:project:${projectId}`,
  days: (characterId: string, n: number) => `trophy:${characterId}:days:${n}`,
  review: (characterId: string, n: number) => `trophy:${characterId}:review:${n}`
}

/** 지금 상태에서 있어야 할 행 전부(옷 + 트로피). 넣을 때는 이미 있는 id를 빼고 넣는다(newUnlocks) */
export function unlocksFor(characterId: string, s: RaiseState): CharacterItemRow[] {
  const out: CharacterItemRow[] = []
  for (const it of ITEMS) if (ruleMet(it.rule, s)) out.push({ id: itemRowId(characterId, it.id), character_id: characterId, item_id: it.id, kind: 'item', source: ruleSource(it.rule), ref_id: null, title: it.name })
  for (const p of s.projects) out.push({ id: trophyRowId.project(characterId, p.id), character_id: characterId, item_id: 'cup', kind: 'trophy', source: 'project', ref_id: p.id, title: p.title })
  for (const n of TROPHY_STEPS.days) if (s.days >= n) out.push({ id: trophyRowId.days(characterId, n), character_id: characterId, item_id: `medal-${n}`, kind: 'trophy', source: 'days', ref_id: null, title: `한 날 ${n}일` })
  for (const n of TROPHY_STEPS.reviews) if (s.reviews >= n) out.push({ id: trophyRowId.review(characterId, n), character_id: characterId, item_id: `stamp-${n}`, kind: 'trophy', source: 'review', ref_id: null, title: `주간 점검 ${n}번` })
  return out
}
/** 새로 넣을 것만. 받은 것은 지우지 않으므로 조건 아래로 내려가도(완료 취소) 그대로 남는다 */
export const newUnlocks = (characterId: string, s: RaiseState, existing: Iterable<string>) => {
  const have = new Set(existing)
  return unlocksFor(characterId, s).filter((r) => !have.has(r.id))
}

/** 받은 옷 id 집합(character_items 행 → 옷만). 행이 아직 안 왔어도 규칙으로 열린 것은 보이게 합친다 */
export function ownedItems(rows: { item_id: string; kind: string }[], s?: RaiseState): Set<string> {
  const own = new Set(rows.filter((r) => r.kind === 'item').map((r) => r.item_id))
  if (s) for (const it of ITEMS) if (ruleMet(it.rule, s)) own.add(it.id)
  own.add('grass'); own.add('auto') // 정원·자동은 늘 있다(배경 하나는 늘 깔린다)
  return own
}

/** 선반·도감에 쓰는 트로피 모양 */
export function trophyShape(row: { item_id: string; source: string }): { k: TrophyKind; n?: number } {
  if (row.source === 'project' || row.item_id === 'cup') return { k: 'cup' }
  const n = Number(row.item_id.split('-')[1]) || undefined
  return row.source === 'days' || row.item_id.startsWith('medal') ? { k: 'medal', n } : { k: 'stamp', n }
}
/** 트로피를 누르면 캐릭터가 하는 말(43 §4.1) */
export function trophyLine(row: { title: string; source: string }): string {
  if (row.source === 'project') return `${row.title} 끝낸 기념이야!`
  if (row.source === 'days') return `${row.title}! 같이 쌓았지`
  return `${row.title}. 꼼꼼했어`
}
/** 도감 트로피 줄 아래 글 */
export function trophySub(row: { source: string; earned_at?: string | null }): string {
  const d = row.earned_at ? `${Number(row.earned_at.slice(5, 7))}/${Number(row.earned_at.slice(8, 10))}에 ` : ''
  return row.source === 'project' ? `${d}끝낸 프로젝트` : row.source === 'days' ? `${d}받은 메달` : `${d}받은 도장`
}

/** 잠긴 칸 조건 글(43 §5.4). 남은 날 수로 재촉하지 않는다 */
export function conditionText(item: Item, s?: RaiseState): string {
  const r = item.rule
  if ('lv' in r) return `Lv ${r.lv}`
  if ('days' in r) return `한 날 ${r.days}일${s ? ` · 지금 ${s.days}일` : ''}`
  if ('reviews' in r) return `주간 점검 ${r.reviews}번${s ? ` · 지금 ${s.reviews}번` : ''}`
  if ('projects' in r) return '프로젝트 하나 끝내기'
  return `${SEASON_LABEL[r.season]}에 할 일 하나`
}

// ── 입힌 모습(characters.look_json, 동기화) ────────────────────────
export type Path = 'a' | 'b'
export type Equip = { hat: string | null; neck: string | null; hand: string | null; back: string | null; bg: string }
/** seed = 만들기 흐름에서 고른 씨앗 껍질(0~3, 49 §5.2 — 아기 단계 그릇 색·도감 첫 칸). 없으면 0 */
export type Look = { path: Path; eq: Equip; decorOff: string[]; seed?: number }
export const DEFAULT_LOOK: Look = { path: 'a', eq: { hat: null, neck: null, hand: null, back: null, bg: 'auto' }, decorOff: [] }
const slotOk = (id: unknown, slot: Slot) => (typeof id === 'string' && ITEM_BY_ID[id]?.slot === slot ? id : null)
/** look_json 읽기 — 깨졌거나 모르는 아이템은 기본으로(겉모습뿐이라 막을 것 없음, 43 §10) */
export function parseLook(raw: string | null | undefined): Look {
  if (!raw) return { ...DEFAULT_LOOK, eq: { ...DEFAULT_LOOK.eq }, decorOff: [] }
  let v: any
  try { v = JSON.parse(raw) } catch { v = null }
  if (!v || typeof v !== 'object') return parseLook(null)
  const eq = v.eq && typeof v.eq === 'object' ? v.eq : {}
  return {
    path: v.path === 'b' ? 'b' : 'a',
    eq: { hat: slotOk(eq.hat, 'hat'), neck: slotOk(eq.neck, 'neck'), hand: slotOk(eq.hand, 'hand'), back: slotOk(eq.back, 'back'), bg: slotOk(eq.bg, 'bg') ?? 'auto' },
    decorOff: Array.isArray(v.decorOff) ? v.decorOff.filter((d: unknown) => typeof d === 'string' && DECOR.some((x) => x.id === d)) : [],
    ...(Number.isInteger(v.seed) && v.seed >= 0 && v.seed <= 3 ? { seed: v.seed as number } : {})
  }
}
export const serializeLook = (l: Look) => JSON.stringify({ path: l.path, eq: l.eq, decorOff: l.decorOff, ...(l.seed !== undefined ? { seed: l.seed } : {}) })
/** 씨앗 껍질 고르기(49 §5.2) — 모습의 다른 칸은 그대로 */
export const setSeed = (l: Look, seed: number): Look => ({ ...l, seed: Math.max(0, Math.min(3, Math.round(seed))) })
/** 누르면 입고, 입은 칸을 다시 누르면 벗는다. 배경은 늘 하나 깔려 있다(43 §5.4) */
export function equipItem(l: Look, itemId: string): Look {
  const it = ITEM_BY_ID[itemId]
  if (!it) return l
  const eq = { ...l.eq }
  if (it.slot === 'bg') eq.bg = it.id
  else eq[it.slot] = eq[it.slot] === it.id ? null : it.id
  return { ...l, eq }
}
/** `기본` 칸 = 그 칸 비우기(진화 소품이 돌아온다) */
export const unequipSlot = (l: Look, slot: Exclude<Slot, 'bg'>): Look => ({ ...l, eq: { ...l.eq, [slot]: null } })
export const setPath = (l: Look, path: Path): Look => ({ ...l, path })
export const toggleDecor = (l: Look, id: string): Look => ({ ...l, decorOff: l.decorOff.includes(id) ? l.decorOff.filter((x) => x !== id) : [...l.decorOff, id] })
/** 받지 않은 옷은 입은 것으로 치지 않는다(다른 기기 규칙이 달라도 안전하게) */
export function wornEquip(l: Look, owned: Set<string>): Equip {
  const ok = (id: string | null) => (id && owned.has(id) ? id : null)
  return { hat: ok(l.eq.hat), neck: ok(l.eq.neck), hand: ok(l.eq.hand), back: ok(l.eq.back), bg: owned.has(l.eq.bg) ? l.eq.bg : 'auto' }
}
/** 켜진 장식(레벨로 열린 것 − 치운 것) */
export const decorOn = (level: number, l: Look) => DECOR.filter((d) => level >= d.lv && !l.decorOff.includes(d.id)).map((d) => d.id)
/** 위젯 PNG 캐시 이름에 붙일 짧은 열쇠(갈래 + 입은 옷). 모습이 같으면 같은 글 */
export function lookKey(l: Pick<Look, 'path' | 'eq'> & { seed?: number }): string {
  const s = [l.path, l.eq.hat, l.eq.neck, l.eq.hand, l.eq.back, l.seed ? `s${l.seed}` : ''].map((x) => x ?? '').join('|')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ── 성장 막대 · 레벨 안 성장(43 §3 · §18.5) ────────────────────────
/** 무대 상자 크기(px) — 레벨·단계와 상관없이 늘 같다(2026-10-09 사용자 결정 "캐릭터 크기는 동일하게 항상").
 *  그림이 단계마다 같은 상자를 채우므로(characterArt FILL) 화면 크기도 같다. 성장은 모양·소품·새싹 잎·무늬로 보인다 */
export const STAGE_BOX = 260
export const stageBoxSize = (_level?: number) => STAGE_BOX
/** 단계 안에서 레벨마다 새싹 잎눈(0~3) */
export const budsOf = (level: number) => Math.min(3, level - STAGES[stageOf(level) - 1].from)
/** 짝수 레벨마다 무늬 한 점(최대 6) */
export const marksOf = (level: number) => Math.min(6, Math.floor(level / 2))
export const MARK_NAME: Record<Species, string> = { snail: '주근깨', bee: '주근깨', worm: '노란 점', frog: '물방울 점' }
/** 이 레벨이 되면 바뀌는 것(막대 태그·레벨 줄) */
export function growthTags(level: number, sp: Species): string[] {
  // 키(크기)는 자라지 않는다 — 새싹 잎·무늬·진화만(같은 단계 안 Lv 14·19·20처럼 바뀌는 게 없으면 빈 줄)
  const out: string[] = []
  if (stageOf(level) !== stageOf(level - 1)) out.push(`${STAGES[stageOf(level) - 1].name}${stageOf(level) === 4 ? '으로' : '로'} 진화`)
  else {
    if (budsOf(level) > budsOf(level - 1)) out.push('새싹 잎 +1')
    if (marksOf(level) > marksOf(level - 1)) out.push(`${MARK_NAME[sp]} +1`)
  }
  return out
}
/** 그 레벨에 열리는 옷 */
export const giftsAt = (level: number) => ITEMS.filter((i) => 'lv' in i.rule && i.rule.lv === level)
/** 진화 선물(그 단계 시작 레벨의 옷) */
export const evolutionGift = (stage: number) => (stage > 1 ? giftsAt(STAGES[stage - 1].from)[0] ?? null : null)
/** HUD 둘째 줄: `단짝까지 2레벨` · `다음 레벨에 진화!` · `전설` */
export function evolutionHint(level: number): string {
  const st = stageOf(level)
  if (st >= 5) return '전설'
  if (stageOf(level + 1) !== st) return '다음 레벨에 진화!'
  const next = STAGES.find((x) => x.stage === st + 1)!
  return `${next.name}까지 ${next.from - level}레벨`
}

/** 옷장 `기본` 칸 설명(43 §18.5 — 그 칸의 진화 소품) */
export function baseName(slot: Exclude<Slot, 'bg'>, sp: Species, st: number): string {
  if (slot === 'hat') return st >= 5 || (sp === 'bee' && st === 4) ? '진화 관' : sp === 'frog' && st >= 1 && st <= 4 ? '잎 모자' : '없음'
  if (slot === 'neck') return ({ snail: '없음', bee: st >= 2 ? '솜털 목도리' : '없음', worm: '없음', frog: st >= 3 ? '목걸이' : '없음' } as Record<Species, string>)[sp]
  if (slot === 'hand') return (sp === 'snail' && st === 4) || (sp === 'bee' && st >= 3) || (sp === 'frog' && st >= 4) ? '진화 소품' : '없음'
  return ({ snail: '껍데기(그대로 남음)', bee: st >= 2 ? '날개(그대로 남음)' : '없음', worm: st === 3 ? '잎 가방' : st >= 4 ? '날개(그대로 남음)' : '없음', frog: st === 5 ? '망토' : '없음' } as Record<Species, string>)[sp]
}
/** 아기 단계는 씨앗 껍질 안이라 모자·손만 보인다(43 §5.1) */
export const babyHidesSlot = (slot: Slot, st: number) => st === 1 && (slot === 'neck' || slot === 'back')

// ── 하루 장면 · 말풍선(43 §4) ───────────────────────────────────
export type DayMoment = 'morning' | 'busy' | 'deadline' | 'dayDone' | 'night'
export type DayCtx = {
  /** 기기 로컬 시(0~23) */
  hour: number
  /** 오늘 마감 미완료 할 일 수 */
  dueOpen: number
  /** 오늘 마감 할 일 전체(완료 포함) */
  dueTotal: number
  /** 오늘 일정 합(분) */
  eventMinutes: number
  /** 오늘이 프로젝트 마감인 날 */
  projectDeadline: boolean
  /** 오늘 장면을 이미 보였나(sprout.dayMoment.<날짜>) */
  shownToday: boolean
}
export const isNight = (hour: number) => hour >= 23 || hour < 6
/** 바쁜 날 [임시]: 오늘 마감 ≥ 8 또는 일정 합 ≥ 6시간 */
export const isBusy = (c: Pick<DayCtx, 'dueTotal' | 'eventMinutes'>) => c.dueTotal >= 8 || c.eventMinutes >= 360
/** 성장 화면을 열 때 한 번 보일 장면. 우선순위 마감 날 > 바쁜 날 > 아침 인사. 하루 한 번 */
export function pickDayMoment(c: DayCtx): Exclude<DayMoment, 'dayDone' | 'night'> | null {
  if (c.shownToday || isNight(c.hour)) return null
  if (c.projectDeadline) return 'deadline'
  if (isBusy(c)) return 'busy'
  if (c.hour >= 6 && c.hour < 11) return 'morning'
  return null
}
/** 하루 다 함: 오늘 마감이 1개 이상이었고 방금 모두 끝냈을 때(0개인 날은 장면 없음 — 재촉 금지) */
export const dayJustDone = (before: { dueOpen: number; dueTotal: number }, after: { dueOpen: number }) => before.dueTotal > 0 && before.dueOpen > 0 && after.dueOpen === 0
export function momentLine(m: DayMoment, c: { dueOpen: number }): string {
  if (m === 'morning') return c.dueOpen ? `좋은 아침! 오늘 할 일 ${c.dueOpen}개야` : '좋은 아침! 오늘도 같이 가자'
  if (m === 'busy') return '많은 날이네. 하나씩 같이 가자'
  if (m === 'deadline') return '오늘 제출이야! 끝나면 같이 축하하자'
  if (m === 'dayDone') return '오늘 할 일 다 했다!'
  return '으음… 안 잤어!'
}
/** 누르기 말풍선 후보(43 §3.2 · 10 §3.2.4). 바쁜 날엔 재촉 문장을 뺀다 */
export function tapLines(c: { level: number; dueOpen: number; xpLeft: number; busy?: boolean }): string[] {
  const nx = giftsAt(c.level + 1)[0]
  const out: string[] = []
  if (c.dueOpen && !c.busy) out.push(`오늘 ${c.dueOpen}개 남았어. 하나만 같이 할까?`)
  else if (!c.dueOpen) out.push('네가 끝낸 만큼 자라')
  out.push(c.xpLeft <= 10 ? `레벨업까지 ${c.xpLeft} XP!` : `벌써 Lv ${c.level}이야!`)
  if (nx) out.push(`Lv ${c.level + 1}엔 ${nx.name} 받아`)
  out.push('천천히 가도 괜찮아')
  return out
}
/** 만지기 대사(보상 없음, 43 §4.1) */
export const TOUCH_LINES = {
  pet: '헤헤, 고마워',
  tickle: '히히, 간지러워!',
  dropFar: '와아! 한 번 더!',
  drop: '으쌰',
  call: '응? 불렀어?',
  wake: '으음… 안 잤어!',
  wear: '어때? 잘 어울려?',
  bg: '여기 좋다!',
  dizzy: '어지러워… 빙글빙글',
  trophy: '트로피가 선반에 올라갔어!'
} as const
/** 만지기 숫자(43 §4.1) */
export const TOUCH = { petMs: 600, tickleTaps: 4, tickleWindowMs: 1200, tickleCooldownMs: 8000, dragStartPx: 6, dragRadius: 90, dragDown: 14, dropFarPx: 50, callMs: 2100, sayMs: 2600, wakeMs: 5000 } as const
