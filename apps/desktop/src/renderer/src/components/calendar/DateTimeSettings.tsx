import { useCalendarOptions } from '../../data/calendarOptions'
import { HOLIDAY_YEARS } from '@sprout/schema/holidays'

// 06 §16 설정 › 날짜 & 시간 — 틱틱 macOS 설정 같은 이름·같은 순서(live README 설정 · 실행 파일 TTFuncPreferencesDateTimeViewController):
// 일주일을 시작하는 요일 / 추가 달력 · 주 번호 표시(W) · 휴일 표시. 시간대는 sprout v1 범위 밖.
// 값은 캘린더 보기 설정(view_settings 'calendar' options_json)에 둔다 — 동기화되어 휴대폰도 같은 값.
export function DateTimeSettings() {
  const [opts, setOpts] = useCalendarOptions()
  const sw = (label: string, on: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <div className="settings-row">
      <span>{label}{hint && <small className="od-set__hint">{hint}</small>}</span>
      <button className={`dp__switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><span /></button>
    </div>
  )
  return <>
    <h2>날짜 & 시간</h2>
    <div className="settings-card">
      <label className="settings-row"><span>일주일을 시작하는 요일<small className="od-set__hint">꿈틀은 월요일로 맞춰 두었어요</small></span>
        <select aria-label="일주일을 시작하는 요일" value="mon" disabled><option value="mon">월요일</option></select></label>
    </div>
    <div className="settings-card">
      <label className="settings-row"><span>추가 달력</span>
        <select aria-label="추가 달력" value={opts.lunar === 1 ? 'korean_lunar' : 'none'} onChange={(e) => setOpts({ lunar: e.target.value === 'korean_lunar' ? 1 : 0 })}>
          <option value="none">없음</option>
          <option value="korean_lunar">한국 음력</option>
        </select></label>
      {sw('주 번호 표시(W)', opts.weekNumbers === 1, (v) => setOpts({ weekNumbers: v ? 1 : 0 }))}
      {sw('휴일 표시', opts.holidays !== 0, (v) => setOpts({ holidays: v ? 1 : 0 }), `캘린더에 대한민국 공휴일·대체공휴일을 표시해요(${HOLIDAY_YEARS.from}~${HOLIDAY_YEARS.to}년)`)}
    </div>
  </>
}
