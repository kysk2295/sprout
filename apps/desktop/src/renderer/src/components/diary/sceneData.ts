// 28 §10.2 그날의 장면 — 재료를 모아 schema sceneCardOf로(기기 계산, AI 없음, 저장 안 함). 휴대폰 src/diary/sceneData.ts와 같은 재료·같은 순서.
import { useMemo } from 'react'
import { sceneCardOf, type SceneCard } from '@sprout/schema/diaryScene'
import { isWarm } from '@sprout/schema/diaryTalk'
import { addDays } from '@sprout/schema/time'
import { useQuery } from '../../data/useQuery'
import { dayRange, EVENTS_DAY_SQL, PHOTOS_BETWEEN_SQL, usePhotos, useDayStats, WARM_DAY_SQL, type DiaryEntry, type DiaryPhoto } from '../../data/diary'
import { useDocDark } from '../growth/MakeFlow'

/** "잘 남겼어. 오늘 4개나 해낸 거 잊지 마." → "오늘 4개나 해낸 거 잊지 마." */
export const buddyLineOf = (rows: { content: string }[]) => {
  const w = rows.find((r) => isWarm(r.content))
  return w ? w.content.replace(/^잘 남겼어\.\s*/, '').trim() || null : null
}

export function useSceneCard(date: string, entry: DiaryEntry | undefined): SceneCard | null {
  const dark = useDocDark()
  const photos = usePhotos(date)
  const stats = useDayStats(date)
  const events = useQuery<{ title: string }>(EVENTS_DAY_SQL, [date, date])
  const warm = useQuery<{ content: string }>(WARM_DAY_SQL, [date])
  return useMemo(() => sceneCardOf({
    date, mood: entry?.mood ?? null, content: entry?.content ?? null, photos,
    doneTitles: stats.doneTitles, eventTitles: (events ?? []).map((e) => e.title).filter(Boolean), buddyLine: buddyLineOf(warm ?? [])
  }, { dark }), [date, entry?.mood, entry?.content, photos, stats.doneTitles, events, warm, dark])
}

const local = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const byDay = <T,>(rows: T[], key: (r: T) => string) => { const m = new Map<string, T[]>(); for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]) } return m }

/** 한 달 장면 카드(앨범) — 날짜 → 카드(재료 없는 날은 없음) + 그 달 끝낸 할 일 제목(좋았던 날 자주 한 일) */
export function useMonthScenes(month: string, entries: DiaryEntry[] | undefined): { scenes: Map<string, SceneCard>; doneByDay: Map<string, string[]> } {
  const dark = useDocDark()
  const from = `${month}-01`
  const to = addDays(`${addDays(from, 40).slice(0, 7)}-01`, -1)
  const photos = useQuery<DiaryPhoto>(PHOTOS_BETWEEN_SQL, [from, to])
  const [a] = dayRange(from)
  const [, b] = dayRange(to)
  const done = useQuery<{ title: string; completed_at: string }>('SELECT title, completed_at FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ? ORDER BY completed_at', [a, b])
  const events = useQuery<{ title: string; start_at: string }>('SELECT title, start_at FROM events WHERE deleted_at IS NULL AND substr(start_at, 1, 10) >= ? AND substr(start_at, 1, 10) <= ? ORDER BY start_at', [from, to])
  return useMemo(() => {
    const e = new Map<string, DiaryEntry>((entries ?? []).filter((x) => x.date >= from && x.date <= to).map((x) => [x.date, x]))
    const ph = byDay(photos ?? [], (r) => r.date)
    const dn = byDay(done ?? [], (r) => local(r.completed_at))
    const ev = byDay(events ?? [], (r) => r.start_at.slice(0, 10))
    const scenes = new Map<string, SceneCard>()
    const doneByDay = new Map<string, string[]>()
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const titles = (dn.get(d) ?? []).map((r) => r.title).filter(Boolean)
      if (titles.length) doneByDay.set(d, titles)
      const c = sceneCardOf({ date: d, mood: e.get(d)?.mood ?? null, content: e.get(d)?.content ?? null, photos: ph.get(d) ?? [], doneTitles: titles, eventTitles: (ev.get(d) ?? []).map((r) => r.title) }, { dark })
      if (c) scenes.set(d, c)
    }
    return { scenes, doneByDay }
  }, [entries, photos, done, events, from, to, dark])
}
