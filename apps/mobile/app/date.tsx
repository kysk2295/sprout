// 날짜 시트 경로(22 §3.3): 상세 날짜 줄 · 스와이프 "날짜" · 길게 누름/만료됨 "날짜 지정"이 ids로 연다.
// 첫 할 일의 지금 값으로 열고, ✓·빠른 날짜는 고른 할 일 모두에 저장(데스크톱 applySchedule과 같음) → 토스트 되돌리기.
// 알림이 새로 생기면 그때 알림 권한을 묻는다(20 §4.4).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { applySchedule, getSchedule } from '../src/data/tasks'
import { dayKey } from '../src/lib/dates'
import { ensurePermission } from '../src/notifications'
import { usePalette } from '../src/theme/ThemeProvider'
import { DateSheet } from '../src/ui/DateSheet'
import { addsReminder, chipLabel, EMPTY_SCHEDULE, type Schedule } from '../src/ui/dateSheetModel'
import { useToast } from '../src/ui/Toast'

export default function DateRoute() {
  const { ids: raw } = useLocalSearchParams<{ ids: string }>()
  const ids = (raw ?? '').split(',').filter(Boolean)
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const [initial, setInitial] = useState<Schedule | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const s = ids[0] ? await getSchedule(ids[0]) : null
      if (alive) setInitial(s ?? EMPTY_SCHEDULE)
    })()
    return () => { alive = false }
  }, [raw]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = async (s: Schedule) => {
    const undo = await applySchedule(ids, s)
    router.back()
    const label = chipLabel(s, dayKey())
    toast.show(ids.length > 1 ? `${ids.length}개 할 일의 날짜를 바꿨어요` : label ? `${label} · 날짜를 바꿨어요` : '날짜를 지웠어요', { undo })
    if (initial && addsReminder(initial.reminders, s.due_at ? s.reminders : [])) void ensurePermission()
  }
  return (
    <View style={{ flex: 1, backgroundColor: p.sheetBg }}>
      {initial ? <DateSheet initial={initial} onDone={(s) => void done(s)} onClose={() => router.back()} /> : null}
    </View>
  )
}
