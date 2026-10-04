import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Dialog({ label, className = '', onClose, children }: { label: string; className?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current!
    const background = document.getElementById('root')
    if (background) background.inert = true
    const controls = () => [...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter((e) => e.getClientRects().length)
    ;(root.querySelector<HTMLElement>('[data-autofocus]') ?? controls()[0] ?? root).focus()
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.popover')) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close.current() }
      if (e.key === 'Tab') {
        const items = controls()
        if (!items.length) { e.preventDefault(); return }
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)!.focus() }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => { if (background) background.inert = false; window.removeEventListener('keydown', key, true); previous?.focus() }
  }, [])
  return createPortal(<div className="dialog-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !document.querySelector('.popover')) onClose() }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`desktop-dialog ${className}`}>{children}</div>
  </div>, document.body)
}
