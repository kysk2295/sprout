import { ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// 팝오버·메뉴. 기준 요소 아래 또는 커서 위치(우클릭)에 뜬다. 바깥 클릭·Esc로 닫힌다. 모양: radius.lg + shadow.popover(00 §8)
type PopoverProps = {
  anchor?: HTMLElement | null
  point?: { x: number; y: number }
  /** 기준 사각형(캘린더 블록 등). placement='side'면 옆에, 아니면 아래에 */
  rect?: { left: number; top: number; right: number; bottom: number }
  placement?: 'below' | 'side'
  onClose: () => void
  children: ReactNode
  align?: 'start' | 'end'
  width?: number
  className?: string
  /** Esc를 바깥 클릭과 다르게 다룰 때(날짜 선택기: 바깥 = 저장, Esc = 취소) */
  onEscape?: () => void
}
export function Popover({ anchor, point, rect, placement = 'below', onClose, children, align = 'start', width, className, onEscape }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const place = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      let left: number
      let top: number
      const a = rect ?? anchor?.getBoundingClientRect()
      if (a && placement === 'side') {
        // 06 §7.3: 블록 오른쪽(공간이 없으면 왼쪽)에, 위쪽을 맞춰서
        left = a.right - a.left > w ? (a.left + a.right - w) / 2 : a.right + 8 + w > window.innerWidth - 8 ? a.left - w - 8 : a.right + 8
        top = Math.min(Math.max(8, a.top), window.innerHeight - h - 8)
      } else if (point) {
        left = point.x
        top = point.y
        if (top + h > window.innerHeight - 8) top = Math.max(8, point.y - h)
      } else if (a) {
        left = align === 'end' ? a.right - w : a.left
        top = a.bottom + 6
        if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 6)
      } else return
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }))
    }
    place()
    // 06 §7.5: 내용이 늦게 차서 높이가 바뀌면(태스크 팝오버 등) 화면 밖으로 넘치지 않게 다시 맞춘다
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => place())
    ro.observe(el)
    return () => ro.disconnect()
  }, [anchor, point, rect, placement, align])
  useEffect(() => {
    // 겹친 팝오버: 안쪽 팝오버를 누른 것은 바깥이 아니고, Esc는 맨 위 팝오버만 닫는다
    const isTop = () => {
      const all = document.querySelectorAll('.popover:not(.submenu__panel)')
      return all[all.length - 1] === ref.current
    }
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      if (t.closest?.('.popover') && !isTop()) return
      onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTop()) {
        e.stopPropagation()
        if (onEscape) onEscape()
        else onClose()
      }
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key, true)
    }
  }, [anchor, onClose, onEscape])
  return createPortal(
    <div
      ref={ref}
      className={`popover${className ? ` ${className}` : ''}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body
  )
}

export function MenuItem(props: { icon?: ReactNode; label: string; danger?: boolean; onClick: () => void; active?: boolean; disabled?: boolean; trail?: ReactNode }) {
  return (
    <button
      className={`menu__item${props.danger ? ' is-danger' : ''}${props.active ? ' is-active' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.icon && <span className="menu__icon">{props.icon}</span>}
      <span className="menu__label">{props.label}</span>
      {props.trail}
    </button>
  )
}

/** 마우스를 올리면 오른쪽(공간이 없으면 왼쪽)에 펼쳐지는 하위 메뉴 */
export function SubMenu({ icon, label, trail, children, disabled, width = 220 }: { icon?: ReactNode; label: string; trail?: ReactNode; children: ReactNode; disabled?: boolean; width?: number }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'right' | 'left'>('right')
  const [shiftUp, setShiftUp] = useState(0)
  const item = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<number>(undefined)
  useLayoutEffect(() => {
    if (!open || !item.current || !panel.current) return
    const r = item.current.getBoundingClientRect()
    setSide(r.right + width + 8 > window.innerWidth ? 'left' : 'right')
    const overflow = r.top + panel.current.offsetHeight - (window.innerHeight - 8)
    setShiftUp(overflow > 0 ? overflow : 0)
  }, [open, width])
  return (
    <div
      ref={item}
      className="submenu"
      onMouseEnter={() => { window.clearTimeout(timer.current); if (!disabled) setOpen(true) }}
      onMouseLeave={() => { timer.current = window.setTimeout(() => setOpen(false), 150) }}
    >
      <button className={`menu__item${open ? ' is-hover' : ''}`} disabled={disabled} onClick={() => setOpen(true)}>
        {icon && <span className="menu__icon">{icon}</span>}
        <span className="menu__label">{label}</span>
        {trail && <span className="menu__trail">{trail}</span>}
        <ChevronRight className="menu__chevron" />
      </button>
      {open && (
        <div ref={panel} className={`popover submenu__panel is-${side}`} style={{ width, top: -6 - shiftUp }}>
          {children}
        </div>
      )}
    </div>
  )
}
