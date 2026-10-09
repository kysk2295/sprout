// 48 만료 2주 지난 할 일 자동 정리 — 앱을 열 때 알림 토스트(한 묶음에 한 번, [보기]·⟲) + 설정 › 할 일 칸
import { useEffect, useRef, useState } from 'react'
import { lastBatch, noticeText, parseAutoTrashSettings, pendingNotice, SETTING_HINT, SETTING_LABEL, undoneText } from '@sprout/schema/autoTrash'
import { BATCHES_SQL, markBatchesSeen, saveAutoTrash, SETTINGS_SQL, undoBatches, type VsRow } from '../../data/autoTrash'
import { useQuery } from '../../data/useQuery'
import { useToast } from '../Toast'

/** App에 한 번: 아직 안 본 묶음이 오면(앱을 열 때·동기화로 내려올 때) 토스트 한 번 */
export function AutoTrashNotice({ onOpenTrash }: { onOpenTrash: () => void }) {
  const rows = useQuery<VsRow>(BATCHES_SQL)
  const toast = useToast()
  const shown = useRef(new Set<string>())
  useEffect(() => {
    if (!rows) return
    const n = pendingNotice(rows.filter((r) => !shown.current.has(r.id)))
    if (!n) return
    n.batchIds.forEach((id) => shown.current.add(id))
    void markBatchesSeen(n.batchIds)
    toast.show(noticeText(n.count), () => undoBatches(n.batchIds), { action: { label: '보기', run: onOpenTrash }, ms: 8000 })
  }, [rows, toast, onOpenTrash])
  return null
}

/** 설정 › 할 일: 스위치 + 마지막 자동 정리 되돌리기 */
export function AutoTrashSettingRows() {
  const settings = parseAutoTrashSettings(useQuery<VsRow>(SETTINGS_SQL)?.[0]?.options_json)
  const last = lastBatch(useQuery<VsRow>(BATCHES_SQL) ?? [])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const lastText = last ? `${Number(last.day.slice(5, 7))}월 ${Number(last.day.slice(8, 10))}일 · ${last.count}개` : '아직 옮긴 할 일이 없어요'
  return (
    <>
      <div className="settings-row"><span>{SETTING_LABEL}<small className="od-set__hint">{SETTING_HINT}</small></span>
        <button className={`dp__switch${settings.on ? ' is-on' : ''}`} role="switch" aria-checked={settings.on} aria-label={SETTING_LABEL} onClick={() => void saveAutoTrash(!settings.on)}><span /></button></div>
      <div className="settings-row"><span>마지막 자동 정리<small className="od-set__hint">{msg || lastText}</small></span>
        <button className="od-set__btn" disabled={!last || busy} onClick={async () => { setBusy(true); try { const k = await undoBatches([last!.id]); setMsg(undoneText(k)) } finally { setBusy(false) } }}>되돌리기</button></div>
    </>
  )
}
