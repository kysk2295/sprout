import { useRef } from 'react'

// 영역 경계를 끌어 폭을 바꾼다. 더블클릭하면 기본 폭(01-app-shell §2).
export function Resizer(props: { width: number; min: number; max: number; defaultWidth: number; side: 'left' | 'right'; onChange: (w: number) => void }) {
  const { width, min, max, defaultWidth, side, onChange } = props
  const start = useRef<{ x: number; w: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, w: width }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const next = start.current.w + (side === 'right' ? dx : -dx)
    onChange(Math.min(max, Math.max(min, next)))
  }
  const onPointerUp = () => (start.current = null)
  return (
    <div
      className="resizer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onChange(defaultWidth)}
      role="separator"
      aria-orientation="vertical"
    />
  )
}
