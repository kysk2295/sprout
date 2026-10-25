import type { SceneCard } from '@sprout/schema/diaryScene'
import { moodOf, usePhotoUrl } from '../../data/diary'
import { SceneBackdrop } from '../growth/Scene3D'

// 28 §10.2 · 15 §11 그날의 장면 카드(데스크톱): side(오른쪽 칸 맨 위) · row(1년·한 달 전 오늘) · cell(앨범 칸 3:4) · hero(넘겨 보기).
// 사진이 있으면 장면 위에 흰 테두리 사진이 기울어 붙고, 없으면 기분 장면 + 제목. appear = 처음 나타날 때 움직임(28 §10.5):
// 카드 뒤집힘 700ms → 사진 떨어져 붙음(−8° → 5°, 500ms spring) → 칩 60ms 간격. 움직임 줄이기면 흐려지며 나타남만(.diary.is-reduced).

const dayLabel = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getMonth() + 1}월 ${x.getDate()}일 ${'일월화수목금토'[x.getDay()]}` }

export function SceneCardView({ card, variant, appear, label, onClick }: {
  card: SceneCard; variant: 'side' | 'row' | 'cell' | 'hero'; appear?: boolean
  /** 위 작은 글(예: "1년 전 오늘") */
  label?: string
  onClick?: () => void
}) {
  const url = usePhotoUrl(card.photo?.media_id)
  const m = moodOf(card.mood)
  const cell = variant === 'cell'
  const chips = [card.done ? `✓ 할 일 ${card.done}` : null, card.firstEvent ? `📅 ${card.firstEvent}` : null, card.photoCount > 1 ? `📷 ${card.photoCount}` : null, variant !== 'row' ? `“${card.buddyLine}”` : null].filter(Boolean) as string[]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`dscene is-${variant}${appear ? ' is-appear' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}
      aria-label={`${label ? `${label}, ` : ''}${dayLabel(card.date)}${m ? ` ${m.label}` : ''} ${card.title}`}>
      <SceneBackdrop sceneKey={card.sceneKey} align="center" className="dscene__bg" />
      <span className="dscene__shade" aria-hidden="true" />
      <span className="dscene__band" style={{ background: m?.color ?? 'var(--color-accent)' }} aria-hidden="true" />
      {url && <span className="dscene__photo" aria-hidden="true"><img src={url} alt="" draggable={false} /></span>}
      {cell && <span className="dscene__day">{Number(card.date.slice(8))}</span>}
      {cell && m && <span className="dscene__dot" style={{ background: m.color }} aria-hidden="true" />}
      <span className="dscene__tx">
        {label && <em>{label}</em>}
        {!cell && <small>{dayLabel(card.date)}{m ? ` · ${m.label}` : ''}</small>}
        <b>{card.title}</b>
        {!cell && chips.length > 0 && <span className="dscene__chips">{chips.map((c, i) => <i key={c} style={{ animationDelay: `${700 + i * 60}ms` }}>{c}</i>)}</span>}
      </span>
    </Tag>
  )
}
