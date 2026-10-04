import { ChevronLeft, ChevronRight, ChevronsUpDown, CircleHelp, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CalOptions, ColorBy, ItemStyle } from '../../lib/calendar'

// 06 §8 옵션 보기(실측 research 17 §1): 색상 · 스타일 / 완료된 할일 보기 · 하위 할일 보기 · 반복 주기 표시
const COLORS: [ColorBy, string][] = [['list', '목록'], ['tag', '태그'], ['priority', '우선순위']]
const STYLES: [ItemStyle, string][] = [['simple', '간결한'], ['detailed', '상세한']]

export function ViewOptions({ opts, onChange, onClose }: { opts: CalOptions; onChange: (p: Partial<CalOptions>) => void; onClose: () => void }) {
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
            </div>
            <div className="modal__card">
              <Toggle label="완료된 할일 보기" on={!!opts.completed} onChange={(v) => onChange({ completed: v ? 1 : 0 })} />
              <Toggle label="하위 할일 보기" on={false} disabled onChange={() => {}} />
              <Toggle label="반복 주기 표시" on={!!opts.repeats} onChange={(v) => onChange({ repeats: v ? 1 : 0 })} />
            </div>
          </>
        ) : (
          <>
            <div className="vo__title"><button className="vo__back" aria-label="뒤로" onClick={() => setPage('main')}><ChevronLeft /></button>스타일</div>
            <p className="vo__desc">"상세" 스타일을 선택하면, 작업을 표시된 체크박스를 클릭하여 빠르게 완료할 수 있습니다.</p>
            <div className="vo__styles">
              {STYLES.map(([v, l]) => (
                <button key={v} className={`vo__style${opts.style === v ? ' is-on' : ''}`} onClick={() => onChange({ style: v })}>
                  <span className="vo__sample">
                    <span className="vo__times"><i>9:00</i><i>10:00</i><i>11:00</i></span>
                    <span className="vo__blocks">
                      <span className="vo__block is-a">{v === 'detailed' && <b className="vo__cb" />}과제<small>9:00 - 10:00</small></span>
                      <span className="vo__block is-b">{v === 'detailed' && <b className="vo__cb" />}이벤트<small>10:00 - 11:00</small></span>
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

function Toggle({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`modal__row${disabled ? ' is-disabled' : ''}`}>
      <span>{label}</span>
      <button className={`dp__switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}><span /></button>
    </div>
  )
}
