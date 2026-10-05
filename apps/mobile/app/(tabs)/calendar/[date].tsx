// 36 §6 · 25 §15: 위젯 날짜 칸 링크의 경로형 sprout://calendar/<YYYY-MM-DD>(맥 위젯 형식)도 받는다 → 캘린더 탭 그날(쿼리형 ?date=와 같은 처리)
import { Redirect, useLocalSearchParams } from 'expo-router'
import { isWidgetDate } from '@sprout/schema/widget'

export default function CalendarDateLink() {
  const { date } = useLocalSearchParams<{ date?: string }>()
  return <Redirect href={isWidgetDate(date) ? { pathname: '/calendar', params: { date } } : '/calendar'} />
}
