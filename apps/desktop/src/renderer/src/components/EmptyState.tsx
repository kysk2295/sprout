// 02 §12 빈 상태 — 44 §4: 말랑 아이콘 88 + 제목 + 회색 한 줄(배치는 그대로). 틱틱 일러스트는 쓰지 않고 직접 그린 그림(@sprout/tokens/softIcons).
// variant: 'empty'(할 일 없음) · 'done'(모두 완료 — 다른 그림). icon으로 그림을 고른다(휴지통·태그·캘린더 등).
import type { SoftIconName } from '@sprout/tokens/softIcons'
import { SoftIcon } from './SoftIcon'
import { CharacterArt } from './growth/CharacterArt'
import { useCompanion } from './companion/CompanionFace'
import { useMotionReduced } from '../data/growth'

export function EmptyState({ title, hint, variant = 'empty', icon, character }: { title: string; hint?: string; variant?: 'empty' | 'done'; icon?: SoftIconName; character?: boolean }) {
  if (character) return <CharacterEmpty title={title} hint={hint} />
  return (
    <div className="empty">
      <SoftIcon name={icon ?? (variant === 'done' ? 'done' : 'list')} size={88} className="empty__art" />
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
    </div>
  )
}

/** 49 §8.2 그림 빈 상태(은은하게): 3D 캐릭터 170(내 캐릭터 — 없으면 씨앗) + 기존 문구 */
function CharacterEmpty({ title, hint }: { title: string; hint?: string }) {
  const me = useCompanion()
  const reduced = useMotionReduced()
  return (
    <div className="empty is-character">
      <CharacterArt species={me.species} stage={me.stage} size={170} crop="full" motion={reduced ? 'still' : 'idle'} />
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
    </div>
  )
}

/** 02 §12 상세 패널 빈 상태: 말랑 노트 그림(옅게) */
export function DetailEmptyArt() {
  return <SoftIcon name="note" size={72} className="detail__empty-art" />
}
