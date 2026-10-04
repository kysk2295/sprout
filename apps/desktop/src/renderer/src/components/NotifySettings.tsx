import { useState, type ReactNode } from 'react'
import { dailyTimeOptions, saveNotifyPrefs, useNotifyPrefs, type NotifyPatch } from '../data/notifyPrefs'

/** 설정 › 알림(32 §9.2, 틱틱 설정 `Sounds & Notifications`): 계정 단위 알림 설정 — 휴대폰이 받는 서버 푸시를 정한다.
 *  칸 순서는 휴대폰 설정 › 소리와 알림(32 §7.1)과 같고, 시험 알림·배터리 줄은 없다. 이 컴퓨터의 OS 알림은 늘 켜짐(03 §7) */
export function NotifySettings() {
  const { prefs, ready } = useNotifyPrefs()
  const [error, setError] = useState('')
  const save = async (patch: NotifyPatch) => {
    try { await saveNotifyPrefs(patch); setError('') } catch { setError('알림 설정을 저장하지 못했어요. 다시 시도해 주세요.') }
  }
  const sw = (on: boolean, label: string, patch: NotifyPatch, disabled = false) => (
    <button className={`dp__switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={!ready || disabled} onClick={() => void save(patch)}><span /></button>
  )
  const row = (label: string, hint: string | null, control: ReactNode, dim = false) => (
    <div className="settings-row" style={dim ? { opacity: 0.5 } : undefined}><span>{label}{hint && <small className="od-set__hint">{hint}</small>}</span>{control}</div>
  )
  const { reminders, hideTitles, daily, growth } = prefs
  const head = { font: 'var(--text-body-strong)', margin: '8px 0 8px' } as const
  return <>
    <h2>알림</h2>
    {error && <p role="alert" className="form-error">{error}</p>}
    <h3 style={head}>휴대폰으로 받는 알림</h3>
    <div className="settings-card" aria-busy={!ready}>
      {row('할 일 알림', '정한 시간에 휴대폰으로 할 일을 알려 드려요', sw(reminders, '할 일 알림', { reminders: !reminders }))}
      {row('알림에 제목 숨기기', '잠금 화면·서버 전송에 할 일 제목을 넣지 않아요', sw(hideTitles, '알림에 제목 숨기기', { hideTitles: !hideTitles }))}
    </div>
    <div className="settings-card">
      {row('하루 요약', '정한 시각에 오늘 할 일을 한 번에 알려 드려요', sw(daily.on, '하루 요약', { daily: { on: !daily.on } }))}
      {row('받을 시각', null,
        <select aria-label="하루 요약 받을 시각" disabled={!ready || !daily.on} value={daily.time} onChange={(e) => void save({ daily: { time: e.target.value } })}>
          {dailyTimeOptions(daily.time).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>, !daily.on)}
      {row('주말 건너뛰기', null, sw(daily.skipWeekends, '주말 건너뛰기', { daily: { skipWeekends: !daily.skipWeekends } }, !daily.on), !daily.on)}
    </div>
    <h3 style={head}>성장 소식</h3>
    <div className="settings-card">
      {row('캐릭터 진화', null, sw(growth.evolve, '캐릭터 진화', { growth: { evolve: !growth.evolve } }))}
      {row('주간 리포트 도착', null, sw(growth.report, '주간 리포트 도착', { growth: { report: !growth.report } }))}
      {row('이번 주 목표 마감 알림', '일요일 저녁 8시, 남은 목표가 있을 때', sw(growth.goalDue, '이번 주 목표 마감 알림', { growth: { goalDue: !growth.goalDue } }))}
    </div>
    <p className="od-set__hint" style={{ margin: '-8px 0 0' }}>휴대폰 앱에 로그인한 기기로 보내요. 이 컴퓨터의 할 일 알림은 앱이 켜져 있을 때 늘 울려요(시스템 설정 › 알림에서 끌 수 있어요).</p>
  </>
}
