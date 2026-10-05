import { CalendarDays, ChevronLeft, ChevronRight, ChevronsUpDown, CircleHelp, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CalOptions, ColorBy, ItemStyle } from '../../lib/calendar'
import { listLabel, type ListRow, type TagRow } from '../../data/types'
import { run, update } from '../../data/mutations'
import { ORG_COLORS } from '../../lib/orgColors'

// 06 §8 옵션 보기(실측 research 17 §1·§15.1): 색상 · 스타일 · 주말 표시 / 완료된 할일 보기 · 하위 할일 보기 · 반복 주기 표시
const COLORS: [ColorBy, string][] = [['list', '목록'], ['tag', '태그'], ['priority', '우선순위']]
const STYLES: [ItemStyle, string][] = [['simple', '간결한'], ['detailed', '상세한']]

export function ViewOptions({ opts, lists, tags, onChange, onClose }: { opts: CalOptions; lists: ListRow[]; tags: TagRow[]; onChange: (p: Partial<CalOptions>) => void; onClose: () => void }) {
  const [page, setPage] = useState<'main' | 'style'>('main')
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (page === 'style' ? setPage('main') : onClose())
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, page])
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal vo" role="dialog" aria-label="옵션 보기">
        <button className="vo__close" aria-label="닫기" onClick={onClose}><X /></button>
        {page === 'main' ? (
          <>
            <div className="vo__title">옵션 보기</div>
            <div className="modal__card">
              <div className="modal__row">
                <span className="vo__label">색상 <CircleHelp className="vo__help" aria-label="태스크 막대를 무엇의 색으로 칠할지" /></span>
                <label className="vo__select">
                  <select value={opts.color} onChange={(e) => onChange({ color: e.target.value as ColorBy })}>
                    {COLORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <span>{COLORS.find(([v]) => v === opts.color)?.[1]}</span>
                  <ChevronsUpDown />
                </label>
              </div>
              <button className="modal__row vo__link" onClick={() => setPage('style')}>
                <span>스타일</span>
                <span className="vo__value">{STYLES.find(([v]) => v === opts.style)?.[1]}<ChevronRight /></span>
              </button>
              {/* 06 §8 틱틱 Show Weekends(영상 EUB f0069 — 색상·스타일 아래 같은 카드). 끄면 주·월 보기에서 토·일 열을 숨긴다 */}
              <Toggle label="주말 표시" on={opts.weekends !== 0} onChange={(v) => onChange({ weekends: v ? 1 : 0 })} />
            </div>
            {opts.color !== 'priority' && (
              <ColorCard
                rows={opts.color === 'tag' ? tags.map((t) => ({ id: t.id, label: `#${t.name}`, color: t.color })) : lists.map((l) => ({ id: l.id, label: listLabel(l), color: l.color }))}
                table={opts.color === 'tag' ? 'tags' : 'lists'}
              />
            )}
            <div className="modal__card">
              <Toggle label="완료된 할일 보기" on={!!opts.completed} onChange={(v) => onChange({ completed: v ? 1 : 0 })} />
              <Toggle label="하위 할일 보기" on={false} disabled onChange={() => {}} />
              <Toggle label="반복 주기 표시" on={!!opts.repeats} onChange={(v) => onChange({ repeats: v ? 1 : 0 })} />
            </div>
          </>
        ) : (
          <>
            <button className="vo__back" aria-label="뒤로" onClick={() => setPage('main')}><ChevronLeft /></button>
            <div className="vo__title">스타일</div>
            <p className="vo__desc">"상세" 스타일을 선택하면, 작업을 표시된 체크박스를 클릭하여 빠르게 완료할 수 있습니다.</p>
            <div className="vo__subhead">항목 아이콘 표시</div>
            <div className="modal__card vo__icons">
              <Toggle label="할 일" on={opts.icons !== 0} onChange={(v) => onChange({ icons: v ? 1 : 0 })} />
              <Toggle label="캘린더" on={opts.calIcons !== 0} onChange={(v) => onChange({ calIcons: v ? 1 : 0 })} />
            </div>
            <p className="vo__desc">종류별로 아이콘을 켜고 끄면 할 일과 일정을 한눈에 나눌 수 있어요. 할 일 체크박스를 누르면 바로 완료되고, 자리가 좁으면 아이콘은 숨겨져요. 꺼 두어도 ⌥ 키를 누르고 있는 동안 보입니다.</p>
            <div className="vo__styles">
              {STYLES.map(([v, l]) => (
                <button key={v} className={`vo__style${opts.style === v ? ' is-on' : ''}`} onClick={() => onChange({ style: v })}>
                  <span className="vo__sample">
                    <span className="vo__times"><i>9:00</i><i>10:00</i><i>11:00</i></span>
                    <span className="vo__blocks">
                      <span className="vo__block is-a">{(v === 'detailed' || opts.icons !== 0) && <b className="vo__cb" />}할 일<small>9:00 - 10:00</small></span>
                      <span className="vo__block is-b">{(v === 'detailed' || opts.calIcons !== 0) && <CalendarDays className="vo__cal" aria-hidden />}일정<small>10:00 - 11:00</small></span>
                    </span>
                  </span>
                  <span className="vo__style-name">{l}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

/** 06 §14.2: 색상 기준이 목록·태그면 그 아래에서 리스트·태그 색을 바로 바꾼다(틱틱 도움말 Task Color) */
function ColorCard({ rows, table }: { rows: { id: string; label: string; color: string | null }[]; table: 'lists' | 'tags' }) {
  const [open, setOpen] = useState<string>()
  if (!rows.length) return null
  return (
    <div className="modal__card vo__colors">
      {rows.map((r) => (
        <div key={r.id}>
          <div className="vo__color-row">
            <span className="vo__color-name">{r.label}</span>
            <button className={`vo__color-dot${r.color ? '' : ' is-none'}`} style={{ background: r.color || undefined }} aria-label={`${r.label} 색 바꾸기`} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? undefined : r.id)} />
          </div>
          {open === r.id && (
            <div className="vo__palette" role="radiogroup" aria-label={`${r.label} 색`}>
              {ORG_COLORS.map((c) => (
                <button key={c || 'none'} role="radio" aria-checked={(r.color || '') === c} aria-label={c || '색상 없음'} className={(r.color || '') === c ? 'is-selected' : ''} style={{ background: c || 'transparent' }}
                  onClick={() => { void run(update(table, r.id, { color: c || null })); setOpen(undefined) }}>{c ? '' : '∅'}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Toggle({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`modal__row${disabled ? ' is-disabled' : ''}`}>
      <span>{label}</span>
      <button className={`dp__switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}><span /></button>
    </div>
  )
}
