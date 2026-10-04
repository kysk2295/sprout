// 02 §12 빈 상태. 틱틱 일러스트는 쓰지 않고 직접 그린 단순 선화.
// variant: 'empty'(체크리스트 종이 + 연필) · 'done'(모두 완료 — 다른 그림, task-list NOTES)
export function EmptyState({ title, hint, variant = 'empty' }: { title: string; hint?: string; variant?: 'empty' | 'done' }) {
  return (
    <div className="empty">
      {variant === 'done' ? (
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
          <circle cx="48" cy="48" r="40" fill="var(--color-bg-input)" />
          <circle cx="48" cy="46" r="20" fill="var(--color-bg-app)" stroke="var(--color-text-quaternary)" strokeWidth="2" />
          <path d="M39 46l6 6 12-12" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M70 24v6M67 27h6M26 66v4M24 68h4" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
          <circle cx="48" cy="48" r="40" fill="var(--color-bg-input)" />
          <rect x="30" y="24" width="32" height="42" rx="4" fill="var(--color-bg-app)" stroke="var(--color-text-quaternary)" strokeWidth="2" />
          <rect x="36" y="34" width="6" height="6" rx="1.5" stroke="var(--color-text-quaternary)" strokeWidth="2" />
          <path d="M46 37h10M36 48h20M36 56h14" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinecap="round" />
          <path d="M68 30l4 4-14 14-5 1 1-5z" fill="var(--color-bg-app)" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )}
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
    </div>
  )
}

/** 02 §12 상세 패널 빈 상태: 옅은 선화(책상 소품 — 컵·메모) */
export function DetailEmptyArt() {
  return (
    <svg className="detail__empty-art" width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden>
      <path d="M10 80h100" stroke="var(--color-border-divider)" strokeWidth="2" strokeLinecap="round" />
      <rect x="22" y="34" width="40" height="46" rx="4" stroke="var(--color-text-quaternary)" strokeWidth="2" />
      <path d="M30 46h24M30 55h24M30 64h14" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinecap="round" />
      <path d="M72 52h22v20a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M94 57h4a5 5 0 0 1 0 10h-4" stroke="var(--color-text-quaternary)" strokeWidth="2" />
      <path d="M79 44c0-4 4-4 4-8M87 44c0-4 4-4 4-8" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
