// 38 §2.6 서랍 `캘린더 구독` › `내장 캘린더`: 앞으로 3개월 휴대폰 캘린더 일정(켜 둔 캘린더만, 읽기만).
// 서랍 숫자와 가운데 목록(보기 `ext:device`)이 같이 쓴다.
import { useMemo } from 'react'
import { addDays } from '@sprout/schema/time'
import type { EventCalItem } from '../data/eventsModel'
import { dayKey } from '../lib/dates'
import { PF } from './device'
import { deviceItems } from './items'
import { isActive, useDeviceCal, useDeviceEvents } from './store'

export const EXT_DEVICE_VIEW = 'ext:device'
export const EXT_DEVICE_TITLE = '내장 캘린더'
const NONE = new Set<string>()

export function useDeviceUpcoming(today = dayKey()): { active: boolean; items: EventCalItem[] } {
  const s = useDeviceCal()
  const to = addDays(today, 90)
  const dev = useDeviceEvents(today, to)
  const items = useMemo(
    () => deviceItems(dev.events, dev.calendars, PF, { myExtIds: NONE, linked: [], from: today, to }).sort((a, b) => a.start.localeCompare(b.start)),
    [dev.events, dev.calendars, today, to]
  )
  return { active: isActive(s), items }
}

/** 오늘 / 다음 7일 / 나중에 (16 §2.4와 같은 묶음) */
export function upcomingGroups(items: EventCalItem[], today: string): { id: string; title: string; items: EventCalItem[] }[] {
  const week = addDays(today, 7)
  const g = { today: [] as EventCalItem[], week: [] as EventCalItem[], later: [] as EventCalItem[] }
  for (const it of items) {
    const d = it.start.slice(0, 10)
    if (d <= today) g.today.push(it)
    else if (d <= week) g.week.push(it)
    else g.later.push(it)
  }
  return [
    { id: 'today', title: '오늘', items: g.today },
    { id: 'week', title: '다음 7일', items: g.week },
    { id: 'later', title: '나중에', items: g.later }
  ].filter((x) => x.items.length)
}
