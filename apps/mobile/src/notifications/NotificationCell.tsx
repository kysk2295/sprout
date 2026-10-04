// 설정 › "소리와 알림" 칸(20 §4.4): 켜짐/꺼짐 표시. 아직 안 물었으면 권한을 묻고, 꺼져 있으면 시스템 설정을 연다.
import { useFocusEffect } from 'expo-router'
import { Bell } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { AppState } from 'react-native'
import { Cell } from '../ui/Cells'
import { ensurePermission, openSystemSettings, permissionState, rescheduleNow, type PermissionState } from './index'

export function NotificationCell({ first }: { first?: boolean }) {
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
      icon={<Bell size={18} color="#fff" />}
      iconBg="#f0464a"
      onPress={async () => {
        if (state === 'undetermined') { await ensurePermission(); refresh() } else void openSystemSettings()
      }}
    />
  )
}
