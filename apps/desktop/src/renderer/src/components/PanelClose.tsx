import { X } from 'lucide-react'
import type { KeyboardEvent } from 'react'

// 01 §2.1 오른쪽 패널 닫기(2026-10-05 사용자 요청): 모든 오른쪽 패널 머리 오른쪽 끝에 같은 ✕(작업 지도 같이 계획 짜기 패널과 같은 모양).
// 툴팁에 Esc를 함께 알린다 — 패널 안에 포커스가 있고 글을 쓰는 중이 아니면 Esc로도 닫힌다(panelEsc).
export function PanelClose({ onClose, label = '닫기', className }: { onClose: () => void; label?: string; className?: string }) {
  return (
    <button className={`icon-btn panel-close${className ? ` ${className}` : ''}`} aria-label={label} title={`${label} (Esc)`} onClick={onClose}>
      <X />
    </button>
  )
}

/** 패널 감싸개 onKeyDown: Esc → 닫기. 안쪽 팝오버·입력 칸이 먼저 처리했거나(defaultPrevented) 글 입력 중이면 건드리지 않는다 */
export function panelEsc(onClose: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
    if (document.querySelector('[role=dialog]')) return
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }
}
