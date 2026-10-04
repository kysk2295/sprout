// 00 §3 우선순위 색. 체크박스(없음 = 회색)와 깃발(없음 = 옅은 글자색)이 다르다.
export const PRIORITIES = [
  { value: 3, label: '높은 우선순위', color: 'var(--color-priority-high)' },
  { value: 2, label: '중간 우선순위', color: 'var(--color-priority-medium)' },
  { value: 1, label: '낮은 우선순위', color: 'var(--color-priority-low)' },
  { value: 0, label: '우선순위 없음', color: 'var(--color-priority-none)' }
] as const
export const checkboxColor = (p: number) => PRIORITIES.find((x) => x.value === p)?.color ?? 'var(--color-priority-none)'
export const flagColor = (p: number) => (p ? checkboxColor(p) : 'var(--color-text-tertiary)')
