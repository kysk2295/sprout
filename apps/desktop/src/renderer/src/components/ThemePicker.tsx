// 01 §9.1 설정 › 외관 › 테마 고르기 — 틱틱 Color Series 견본 격자 + 시스템 다크 따르기(어느 다크 테마를 쓸지까지)
import { useRef, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { usePreferences, type savePreferences } from '../data/preferences'
import { DARK_THEMES, THEMES, encodeTheme, themeAttrs, type ThemeDef } from '../data/theme'
import './ThemePicker.css'

type Save = (patch: Parameters<typeof savePreferences>[0]) => Promise<void> | void
const GROUPS = [['color', '색상 시리즈'], ['dark', '다크 시리즈']] as const

export function ThemePicker({ save }: { save: Save }) {
  const prefs = usePreferences()
  const pick = (id: string) => { if (id !== prefs.themeId) void save({ theme: encodeTheme(id, prefs.darkThemeId) }) }
  const pickDark = (id: string) => { if (id !== prefs.darkThemeId) void save({ theme: encodeTheme(prefs.themeId, id) }) }
  return <div className="theme-picker">
    <SwatchGroup label="테마" value={prefs.themeId} disabled={!prefs.ready} onPick={pick}
      sections={GROUPS.map(([g, title]) => ({ title, items: THEMES.filter((t) => t.group === g) }))} />
    <label className="settings-row settings-card theme-picker__follow">
      <span>시스템 외관에 따라 다크 테마 자동 전환</span>
      <input type="checkbox" checked={prefs.followDark} disabled={!prefs.ready} onChange={(e) => void save({ follow_system_dark: e.target.checked ? 1 : 0 })} />
    </label>
    {prefs.followDark && <div className="theme-picker__dark">
      <p className="settings-caption">시스템이 다크일 때</p>
      <SwatchGroup label="시스템이 다크일 때 쓸 테마" value={prefs.darkThemeId} disabled={!prefs.ready} onPick={pickDark} small
        sections={[{ items: DARK_THEMES }]} />
    </div>}
  </div>
}

/** 라디오 묶음 하나(묶음 안에 소제목이 여러 개여도 화살표로 한 줄처럼 움직인다) */
function SwatchGroup({ label, sections, value, onPick, disabled, small }: {
  label: string; sections: { title?: string; items: readonly ThemeDef[] }[]; value: string; onPick: (id: string) => void; disabled?: boolean; small?: boolean
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const flat = sections.flatMap((s) => s.items)
  const onKey = (e: KeyboardEvent, index: number) => {
    const last = flat.length - 1
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
    if (next < 0) return
    e.preventDefault()
    const id = flat[next].id
    refs.current[id]?.focus()
    onPick(id) // 라디오 관례: 고르는 칸이 곧 선택
  }
  // 선택이 없으면(모르는 값) 첫 칸이 탭 자리
  const tabId = flat.some((t) => t.id === value) ? value : flat[0]?.id
  return <div role="radiogroup" aria-label={label} className={`theme-picker__group${small ? ' is-small' : ''}`}>
    {sections.map((s, si) => <div key={s.title ?? si} className="theme-picker__section">
      {s.title && <p className="settings-caption">{s.title}</p>}
      <div className="theme-picker__grid">
        {s.items.map((t) => {
          const index = flat.indexOf(t)
          const checked = t.id === value
          return <button key={t.id} ref={(el) => { refs.current[t.id] = el }} type="button" role="radio" aria-checked={checked}
            tabIndex={t.id === tabId ? 0 : -1} disabled={disabled} className="theme-option"
            onClick={() => onPick(t.id)} onKeyDown={(e) => onKey(e, index)}>
            <ThemePreview id={t.id} />
            {checked && <span className="theme-option__check" aria-hidden><Check /></span>}
            <span className="theme-option__name">{t.name}</span>
          </button>
        })}
      </div>
    </div>)}
  </div>
}

/** 미니 창 견본: 레일 + 사이드바(선택 줄) + 목록(강조 점). 색은 그 테마의 변수에서 바로 읽는다 */
export function ThemePreview({ id }: { id: string }) {
  const { theme, variant } = themeAttrs(id)
  // 바깥 default로 지금 페이지 테마를 끊고, 안쪽에서 그 테마 변수만 덮는다
  return <span className="theme-preview" data-theme="default" aria-hidden>
    <span className="theme-preview__win" data-theme={theme} data-theme-variant={variant}>
      <span className="theme-preview__rail"><i className="is-on" /><i /><i /></span>
      <span className="theme-preview__side"><i className="is-sel" /><i /><i /></span>
      <span className="theme-preview__main"><b /><i /><i /><i /></span>
    </span>
  </span>
}
