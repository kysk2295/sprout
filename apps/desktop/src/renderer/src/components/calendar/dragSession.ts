// 06 §7.2 캘린더 끌기 한 번: 포인터 따라가기 · 놓기 · Esc/포인터 취소로 되돌리기 · 끄는 동안 커서 고정
export type DragPoint = { clientX: number; clientY: number; altKey: boolean }

export function dragSession(o: { cursor?: string; onMove: (ev: DragPoint) => void; onUp: (ev: PointerEvent) => void; onCancel: () => void }): () => void {
  const root = document.documentElement
  let done = false
  const end = () => {
    if (done) return
    done = true
    window.removeEventListener('pointermove', o.onMove)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    root.classList.remove('is-cal-dragging')
    root.style.cursor = ''
  }
  const up = (ev: PointerEvent) => { end(); o.onUp(ev) }
  const cancel = () => { end(); o.onCancel() }
  // Esc = 끌기 취소(원래 자리 그대로). 캘린더의 Esc(선택 해제)·팝오버 닫기까지 가지 않게 여기서 멈춘다
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return
    ev.preventDefault()
    ev.stopImmediatePropagation()
    cancel()
  }
  window.addEventListener('pointermove', o.onMove)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
  root.classList.add('is-cal-dragging')
  root.style.cursor = o.cursor ?? 'default'
  return end
}
