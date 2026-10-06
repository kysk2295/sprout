// 41 §8 휴대폰 프로젝트 직접 고치기 — 화면 글 계산(순수 함수, 시험: projectDirectModel.test.ts). 규칙 자체는 공용 @sprout/schema/planView.
import { dDay, dDayHot, mdWeek, NO_LANE, starterFor, type ProjectLine, type TagLanes } from '@sprout/schema/planView'
import { PROJECT, projectEmoji, projectTitle } from '@sprout/schema/projects'

/** §2.5 `이럴 때 써요`(휴대폰 짧은 글) — 누르면 입력칸을 이 글로 채우고 커서는 끝 */
export const PROJECT_EXAMPLES: { label: string; fill: string }[] = [
  { label: '자격증 시험', fill: '투자자산운용사 시험 ' },
  { label: '공모전·해커톤', fill: 'K 데이터 공모전 ' },
  { label: '팀 과제·졸업작품', fill: '졸업작품 ' },
  { label: '장학금·지원사업', fill: '창업지원장학금 ' },
  { label: '취업', fill: '하반기 취업 ' },
  { label: '행사', fill: '신제품 런칭 행사 ' },
  { label: '이사·여행', fill: '부산 이사 ' }
]
export const PROJECT_NOT_FOR = '한 번 하고 끝 → 리스트 · 습관 → 반복 · 막연한 주제 → 태그'

/** 새 프로젝트 시트 미리보기 줄: `📜 투자자산운용사 시험 · ⚑ 시험 11/23(월) · D-48` */
export type LinePreview = { empty: true; text: string } | { empty: false; head: string; key: string | null; dday: string | null; note: string | null }
export function linePreview(line: ProjectLine, today: string, emoji?: string | null): LinePreview {
  if (!line.name) return { empty: true, text: '이름을 적어 주세요' }
  const head = `${emoji || line.icon} ${line.name}`
  if (!line.day) return { empty: false, head, key: null, dday: null, note: '날짜 없이 만들어도 돼요' }
  return { empty: false, head, key: `⚑ ${line.word} ${mdWeek(line.day)}`, dday: dDay(line.day, today), note: null }
}

/** 머리 ⚑ 알약: `⚑ 시험 11/23` + `D-48`(3일 안이거나 지나면 hot = 빨강, 지난 뒤 `D+3`). 핵심 날짜가 없으면 null(→ `＋ 핵심 날짜`) */
export function keyPill(deadline: { day: string; word: string } | null, hasKeyTask: boolean, today: string): { text: string; dday: string; hot: boolean } | null {
  if (!deadline || !hasKeyTask) return null
  const md = `${Number(deadline.day.slice(5, 7))}/${Number(deadline.day.slice(8, 10))}`
  return { text: `⚑ ${deadline.word} ${md}`, dday: dDay(deadline.day, today), hot: dDayHot(deadline.day, today) }
}

/** 큰 제목 고치기: 이름 20자, 원래 이름 앞 이모지는 그대로(새 이름에 이모지를 적었으면 그것) */
export function nameWithEmoji(oldName: string, typed: string): string {
  const own = typed.trim().match(/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u)?.[0] ?? null
  const name = [...projectTitle(typed)].slice(0, PROJECT.nameMax).join('').trim()
  if (!name) return ''
  const oldHead = oldName.trim().match(/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u)?.[0] ?? null
  const head = own ?? oldHead
  return head ? `${head} ${name}` : name
}
/** 카드·머리 아이콘: 이름 앞 이모지가 있으면 그것, 없으면 🚀(30 §A.5) */
export const projectIcon = (tagName: string) => (/^\p{Extended_Pictographic}/u.test(tagName.trim()) ? projectEmoji(tagName) : '🚀')

/** 묶음(줄) 이름: 앞 `#` 떼고 30자 */
export const laneName = (raw: string) => [...projectTitle(raw.trim().replace(/^#+/, '').trim())].slice(0, 30).join('').trim()

/** 휴대폰 묶음(태그): 순서 그대로, `태그 없음`은 비면 숨김 */
export const visibleLanes = (t: TagLanes) => t.lanes.filter((l) => l.id !== NO_LANE || l.items.length > 0)

/** §2.4 줄 나누기 제안: 묶기 태그 · 아직 안 봄 · 이름 낱말 표에 제안이 있을 때만 */
export function starterAsk(p: { title: string; laneBy: 'tag' | 'kind'; settings: { starterSeen?: boolean } }) {
  if (p.laneBy !== 'tag' || p.settings.starterSeen) return null
  return starterFor(p.title).ask
}
