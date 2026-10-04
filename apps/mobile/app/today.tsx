// 딥 링크 sprout://today(20 §2) → 할 일 탭 오늘. 알림·공유 뒤 열기에 쓴다.
import { Redirect } from 'expo-router'
import { useEffect } from 'react'
import { useTasksViewSetter } from '../src/state/tasksView'

export default function TodayLink() {
  const setView = useTasksViewSetter()
  useEffect(() => { setView('smart:today') }, [setView])
  return <Redirect href="/" />
}
