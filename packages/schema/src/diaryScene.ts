// 28 §10.2 그날의 장면 카드 — 기기에서 계산(AI 없음, 저장하지 않음). 두 앱이 같이 쓴다. 시험: diaryScene.test.ts
import { parseSections } from './diaryPrompts.ts'

export type SceneInput = {
  date: string
  mood: number | null
  content: string | null
  /** 그날 사진(sort_order 순) */
  photos: { media_id: string; width?: number | null; height?: number | null }[]
  /** 그날 끝낸 할 일 제목(끝낸 순서) */
  doneTitles: string[]
  /** 그날 일정 제목(시작 순서) */
  eventTitles: string[]
  /** 그날 캐릭터의 마지막 저장 한 줄(없으면 기분별 정해진 말) */
  buddyLine?: string | null
}
export type SceneCard = {
  date: string
  title: string
  /** 제목이 어디서 왔나: 장 제목 · 본문 첫 문장 · 할 일·일정 · 빈 날 */
  titleFrom: 'section' | 'body' | 'tasks' | 'quiet'
  mood: number | null
  photo: SceneInput['photos'][number] | null
  photoCount: number
  done: number
  firstEvent: string | null
  buddyLine: string
  /** 사진이 없을 때 깔 장면(기분별 — 시간대가 아니다) */
  sceneKey: string
  /** 장 수(대화·혼자 쓰기) */
  pages: number
}

const clip = (s: string, n: number) => { const t = s.trim().replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const firstSentence = (s: string) => (s.trim().match(/[^.!?。？\n]+[.!?。？]?/) ?? [''])[0].trim()
/** 할 일 제목을 "○○하고"에 맞게 다듬기: 끝의 마침표·괄호 뒤 메모 뺌 */
const short = (s: string) => clip(s.replace(/\s*[([].*$/, '').replace(/[.。]+$/, ''), 12)

export const MOOD_LINE: Record<number, string> = { 1: '오늘도 버텼다, 그걸로 충분해', 2: '그런 날도 있지', 3: '무난하게 지나간 하루', 4: '좋은 하루였네', 5: '최고의 하루!' }
export const sceneKeyForMood = (mood: number | null, dark = false) => {
  const k = mood === 1 || mood === 2 ? 'scene-rain' : mood === 4 ? 'scene-sunset' : mood === 5 ? 'scene-flowers' : 'scene-day'
  return dark ? ({ 'scene-rain': 'scene-rain-n', 'scene-flowers': 'scene-flowers-n', 'scene-sunset': 'scene-dusk', 'scene-day': 'scene-moon' } as Record<string, string>)[k] : k
}

/** 재료가 하나도 없으면 null(앨범 칸은 빗금) */
export function sceneCardOf(i: SceneInput, o: { dark?: boolean } = {}): SceneCard | null {
  const sections = parseSections(i.content)
  const hasText = sections.some((s) => s.body.trim() && s.body.trim() !== '(기분만 남겼어요)')
  if (!i.mood && !hasText && !i.photos.length && !i.doneTitles.length && !i.eventTitles.length) return null
  let title = ''
  let titleFrom: SceneCard['titleFrom'] = 'quiet'
  const sec = sections.find((s) => s.title.trim())
  if (sec) { title = clip(sec.title, 24); titleFrom = 'section' }
  else if (hasText) {
    const body = sections.map((s) => s.body).find((b) => b.trim() && b.trim() !== '(기분만 남겼어요)') ?? ''
    title = clip(firstSentence(body), 24); titleFrom = 'body'
  } else if (i.doneTitles.length || i.eventTitles.length) {
    const parts = [...i.doneTitles.slice(0, 2).map(short), ...i.eventTitles.slice(0, i.doneTitles.length >= 2 ? 0 : 1).map(short)].filter(Boolean)
    title = parts.length === 1 ? `${parts[0]} 한 날` : `${parts.slice(0, -1).join(', ')}하고 ${parts.at(-1)} 한 날`
    titleFrom = 'tasks'
  } else title = '조용히 지나간 하루'
  return {
    date: i.date,
    title,
    titleFrom,
    mood: i.mood,
    photo: i.photos[0] ?? null,
    photoCount: i.photos.length,
    done: i.doneTitles.length,
    firstEvent: i.eventTitles[0] ? clip(i.eventTitles[0], 14) : null,
    buddyLine: clip(i.buddyLine?.trim() || (i.mood ? MOOD_LINE[i.mood] : '오늘도 수고했어'), 18),
    sceneKey: sceneKeyForMood(i.mood, o.dark),
    pages: sections.filter((s) => s.body.trim() || s.title.trim()).length
  }
}

/** 1년 전·한 달 전 오늘(있는 것만, 1년 전 먼저) */
export function lookbackDates(today: string): { label: string; date: string }[] {
  const d = new Date(`${today}T12:00:00`)
  const y = new Date(d); y.setFullYear(d.getFullYear() - 1)
  const m = new Date(d); m.setMonth(d.getMonth() - 1)
  const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  // 31일 → 한 달 전이 없는 달(예: 3월 31일 → 2월 31일 = 3월 3일)은 건너뛴다
  const out: { label: string; date: string }[] = [{ label: '1년 전 오늘', date: key(y) }]
  if (m.getDate() === d.getDate()) out.push({ label: '한 달 전 오늘', date: key(m) })
  return out
}

/** 이번 달 많이 쓴 말(2글자 이상 명사 비슷한 낱말, 흔한 말 뺌) — 기기에서 */
const STOP = new Set(['오늘', '그냥', '정말', '진짜', '너무', '조금', '그래서', '그리고', '하지만', '근데', '했다', '있었다', '없었다', '같다', '생각', '하루', '나는', '내가', '것이', '때문', '이번', '그런', '이런', '어제', '내일', '기분'])
export function topWords(texts: string[], n = 3): string[] {
  const c = new Map<string, number>()
  for (const t of texts) {
    for (const w of t.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/)) {
      const base = w.replace(/(이랑|에서|으로|까지|부터|처럼|이라|이다|이고|에게|한테|이를|을|를|이|가|은|는|에|와|과|도|만|의|로|랑|고)$/, '')
      if (base.length < 2 || STOP.has(base) || /^\d+$/.test(base) || /(했|었|았|겠|하다|한다|된다|있다|없다)$/.test(base)) continue
      c.set(base, (c.get(base) ?? 0) + 1)
    }
  }
  return [...c.entries()].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w)
}
