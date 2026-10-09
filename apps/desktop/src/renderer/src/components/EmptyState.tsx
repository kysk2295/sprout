// 02 §12 빈 상태 — 44 §4: 말랑 아이콘 88 + 제목 + 회색 한 줄(배치는 그대로). 틱틱 일러스트는 쓰지 않고 직접 그린 그림(@sprout/tokens/softIcons).
// variant: 'empty'(할 일 없음) · 'done'(모두 완료 — 다른 그림). icon으로 그림을 고른다(휴지통·태그·캘린더 등).
import type { SoftIconName } from '@sprout/tokens/softIcons'
import { SoftIcon } from './SoftIcon'

export function EmptyState({ title, hint, variant = 'empty', icon }: { title: string; hint?: string; variant?: 'empty' | 'done'; icon?: SoftIconName }) {
  return (
    <div className="empty">
      <SoftIcon name={icon ?? (variant === 'done' ? 'done' : 'list')} size={88} className="empty__art" />
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
    </div>
  )
}

/** 02 §12 상세 패널 빈 상태: 말랑 노트 그림(옅게) */
export function DetailEmptyArt() {
  return <SoftIcon name="note" size={72} className="detail__empty-art" />
}
