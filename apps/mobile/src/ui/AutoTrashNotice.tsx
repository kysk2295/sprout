// 48 만료 2주 지난 할 일 자동 정리 — 앱을 열 때(또는 동기화로 묶음이 내려올 때) 토스트 한 번: [보기] = 할 일 탭 휴지통 · [되돌리기] = 그 묶음만
import { noticeText, pendingNotice } from '@sprout/schema/autoTrash'
import { router } from 'expo-router'
import { useEffect, useRef } from 'react'
import { BATCHES_SQL, markBatchesSeen, undoBatches, type VsRow } from '../data/autoTrash'
import { useLiveQuery } from '../data/rows'
import { setTasksView } from '../state/tasksView'
import { useToast } from './Toast'

export function useAutoTrashNotice(signedIn: boolean) {
  const rows = useLiveQuery<VsRow>(signedIn ? BATCHES_SQL : 'SELECT NULL AS id, NULL AS options_json WHERE 0').data
  const toast = useToast()
  const shown = useRef(new Set<string>())
  useEffect(() => {
    if (!signedIn) return
    const n = pendingNotice(rows.filter((r) => !shown.current.has(r.id)))
    if (!n) return
    n.batchIds.forEach((id) => shown.current.add(id))
    void markBatchesSeen(n.batchIds)
    toast.show(noticeText(n.count), {
      icon: false,
      duration: 6000,
      undo: async () => { await undoBatches(n.batchIds) },
      action: { label: '보기', onPress: () => { setTasksView('smart:trash'); router.navigate('/') } }
    })
  }, [rows, signedIn, toast])
}
