// 28 §10.2 그날의 장면 — 재료를 모아 schema sceneCardOf로(기기 계산, AI 없음, 저장 안 함). 하루 · 한 달.
import { useMemo } from 'react'
import { sceneCardOf, type SceneCard } from '@sprout/schema/diaryScene'
import { isWarm, SCRIPTED } from '@sprout/schema/diaryTalk'
import { addDays } from '@sprout/schema/time'
import { useLiveQuery, useRows, COUNT_THROTTLE } from '../data/rows'
import { usePalette } from '../theme/ThemeProvider'
import { useDayStats, useEntries, useEntry } from './data'
import { dayRange, type DiaryEntry } from './logic'
import { usePhotos, usePhotosBetween } from './photos'

const EVENTS_DAY = "SELECT title FROM events WHERE deleted_at IS NULL AND substr(start_at, 1, 10) <= ? AND substr(COALESCE(end_at, start_at), 1, 10) >= ? ORDER BY start_at LIMIT 3"
const WARM_DAY = `SELECT m.content FROM diary_messages m JOIN diary_entries e ON e.id = m.entry_id WHERE e.date = ? AND m.role = 'buddy' AND m.safety = ${SCRIPTED} ORDER BY m.created_at DESC LIMIT 12`
/** "잘 남겼어. 오늘 4개나 해낸 거 잊지 마." → "오늘 4개나 해낸 거 잊지 마." */
export const buddyLineOf = (rows: { content: string }[]) => {
  const w = rows.find((r) => isWarm(r.content))
  return w ? w.content.replace(/^잘 남겼어\.\s*/, '').trim() || null : null
}

export function useSceneCard(date: string): SceneCard | null {
  const p = usePalette()
  const entry = useEntry(date)
  const photos = usePhotos(date)
  const stats = useDayStats(date)
  const events = useRows<{ title: string }>(EVENTS_DAY, [date, date], COUNT_THROTTLE).data
  const warm = useLiveQuery<{ content: string }>(WARM_DAY, [date]).data
  return useMemo(() => sceneCardOf({
    date, mood: entry?.mood ?? null, content: entry?.content ?? null, photos,
    doneTitles: stats.doneTitles, eventTitles: events.map((e) => e.title).filter(Boolean), buddyLine: buddyLineOf(warm)
  }, { dark: p.dark }), [date, entry?.mood, entry?.content, photos, stats.doneTitles, events, warm, p.dark])
}

/** 한 달 장면 카드(앨범) — 날짜 → 카드(없으면 없음) */
export function useMonthScenes(month: string): Map<string, SceneCard> {
  const p = usePalette()
  const entries = useEntries()
  const from = `${month}-01`
  const to = addDays(`${addDays(from, 40).slice(0, 7)}-01`, -1)
  const photos = usePhotosBetween(from, to)
  const [a] = dayRange(from)
  const [, b] = dayRange(to)
  const done = useLiveQuery<{ title: string; completed_at: string }>('SELECT title, completed_at FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ? ORDER BY completed_at', [a, b]).data
  const events = useLiveQuery<{ title: string; start_at: string }>("SELECT title, start_at FROM events WHERE deleted_at IS NULL AND substr(start_at, 1, 10) >= ? AND substr(start_at, 1, 10) <= ? ORDER BY start_at", [from, to]).data
  return useMemo(() => {
    const byDay = <T,>(rows: T[], key: (r: T) => string) => { const m = new Map<string, T[]>(); for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]) } return m }
    const local = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    const e = new Map<string, DiaryEntry>(entries.filter((x) => x.date >= from && x.date <= to).map((x) => [x.date, x]))
    const ph = byDay(photos, (r) => r.date)
    const dn = byDay(done, (r) => local(r.completed_at))
    const ev = byDay(events, (r) => r.start_at.slice(0, 10))
    const out = new Map<string, SceneCard>()
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const c = sceneCardOf({ date: d, mood: e.get(d)?.mood ?? null, content: e.get(d)?.content ?? null, photos: ph.get(d) ?? [], doneTitles: (dn.get(d) ?? []).map((r) => r.title), eventTitles: (ev.get(d) ?? []).map((r) => r.title) }, { dark: p.dark })
      if (c) out.set(d, c)
    }
    return out
  }, [entries, photos, done, events, from, to, p.dark])
}
