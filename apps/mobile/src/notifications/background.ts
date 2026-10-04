// 백그라운드 새로 고침(20 §4.4 [임시]): OS가 허락할 때 앱을 잠깐 깨워 알림 예약을 다시 계산한다.
// 48시간 창이 앞으로 밀리면서 새로 들어오는 알림, 그사이 동기화된 다른 기기 변경을 잡는다.
// 작업 정의는 모듈 맨 위에서 해야 한다(expo-task-manager가 JS를 백그라운드로 불러 실행) → 앱 뿌리가 이 파일을 일찍 불러온다.
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { startAuth, syncNow } from '../data/auth'
import { useEffect } from 'react'
import { rescheduleNow, useNotifications } from './index'

export const REFRESH_TASK = 'sprout-reminder-refresh'

if (!TaskManager.isTaskDefined(REFRESH_TASK)) {
  TaskManager.defineTask(REFRESH_TASK, async () => {
    try {
      await startAuth()
      // 붙어 있으면 잠깐 내려받기(최대 8초) → 다른 기기에서 바꾼 알림도 반영
      await syncNow().catch(() => {})
      await rescheduleNow()
      return BackgroundTask.BackgroundTaskResult.Success
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed
    }
  })
}

/** 로그인 뒤 한 번 등록(이미 있으면 그대로). 최소 간격 1시간 — 실제 간격은 OS가 정한다 */
export async function registerBackgroundRefresh() {
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return
    if (await TaskManager.isTaskRegisteredAsync(REFRESH_TASK)) return
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: 60 })
  } catch (e) {
    console.warn('[notifications] background task', e)
  }
}

/** 앱 뿌리(_layout)에서 부르는 하나: 예약·감시·알림 응답 + 백그라운드 새로 고침 등록 */
export function useReminderNotifications(signedIn: boolean) {
  useNotifications(signedIn)
  useEffect(() => { if (signedIn) void registerBackgroundRefresh() }, [signedIn])
}
