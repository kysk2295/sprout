// 02 §12 빈 상태. 틱틱 일러스트는 쓰지 않고 직접 그린 단순 선화.
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
        <circle cx="48" cy="48" r="40" fill="var(--color-bg-input)" />
        <rect x="30" y="24" width="32" height="42" rx="4" fill="var(--color-bg-app)" stroke="var(--color-text-quaternary)" strokeWidth="2" />
        <rect x="36" y="34" width="6" height="6" rx="1.5" stroke="var(--color-text-quaternary)" strokeWidth="2" />
        <path d="M46 37h10M36 48h20M36 56h14" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinecap="round" />
        <path d="M68 30l4 4-14 14-5 1 1-5z" fill="var(--color-bg-app)" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
    </div>
  )
}
