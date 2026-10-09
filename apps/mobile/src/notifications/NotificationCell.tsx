// 설정 › "소리와 알림" 칸(20 §4.4, 32 §7.1): 켜짐/꺼짐 표시. 누르면 소리와 알림 화면으로(아직 안 물었으면 먼저 권한을 묻는다).
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { AppState } from 'react-native'
import { Cell } from '../ui/Cells'
import { ensurePermission, permissionState, rescheduleNow, type PermissionState } from './index'

export function NotificationCell({ first }: { first?: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<PermissionState | null>(null)
  const refresh = useCallback(() => { void permissionState().then(setState).catch(() => setState(null)) }, [])
  useFocusEffect(useCallback(() => {
    refresh()
    // 시스템 설정에서 돌아오면 다시 확인
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { refresh(); void rescheduleNow() } })
    return () => sub.remove()
  }, [refresh]))
  const value = state === 'granted' ? '켜짐' : state === 'denied' ? '알림이 꺼져 있어요 · 설정 열기' : state === 'undetermined' ? '꺼짐' : undefined
  return (
    <Cell
      first={first}
      label="소리와 알림"
      value={value}
      soft="bell"
      tone="sun"
      onPress={async () => {
        if (state === 'undetermined') { await ensurePermission(); refresh() }
        router.push('/settings/notifications')
      }}
    />
  )
}
