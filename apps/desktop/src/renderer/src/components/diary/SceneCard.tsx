import { createContext, useContext } from 'react'
import { cardPoseOf, type SceneCard } from '@sprout/schema/diaryScene'
import { moodOf, usePhotoUrl } from '../../data/diary'
import { CharacterArt } from '../growth/CharacterArt'
import { onPerch, SceneBackdrop } from '../growth/Scene3D'

// 28 §10.9 · 15 §11.3.2 그날의 장면 카드 v2(데스크톱): side(오른쪽 칸 맨 위) · row(1년·한 달 전 오늘) · cell(앨범 칸 3:4) · hero(넘겨 보기).
// 사진이 있으면 첫 사진이 카드 전체 배경(cover) + 아래 어두운 그라데이션. 없으면 기분 장면 받침 위에 내 캐릭터가 그날 기분의 표정·몸짓
// (최고 깡충 · 좋았어요 살랑 · 그저 그래 숨 · 별로 고개 숙임 · 힘들어요 우는 얼굴 웅크림 — cardPoseOf). 앨범 칸은 작아서 움직이지 않는다.
// appear = 처음 나타날 때 카드 뒤집힘 700ms → 칩 60ms 간격(28 §10.5). 움직임 줄이기면 흐려지며 나타남만, 몸짓 없음(.diary.is-reduced).

/** 장면 카드에 세울 내 캐릭터(DiaryView가 넣는다). 없으면 장면만 */
export const CardBuddy = createContext<{ species: string; stage: number } | null>(null)

const dayLabel = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getMonth() + 1}월 ${x.getDate()}일 ${'일월화수목금토'[x.getDay()]}` }

export function SceneCardView({ card, variant, appear, label, onClick }: {
  card: SceneCard; variant: 'side' | 'row' | 'cell' | 'hero'; appear?: boolean
  /** 위 작은 글(예: "1년 전 오늘") */
  label?: string
  onClick?: () => void
}) {
  const url = usePhotoUrl(card.photo?.media_id)
  const buddy = useContext(CardBuddy)
  const m = moodOf(card.mood)
  const cell = variant === 'cell'
  const pose = cardPoseOf(card.mood)
  const chips = [card.done ? `✓ 할 일 ${card.done}` : null, card.firstEvent ? `📅 ${card.firstEvent}` : null, card.photoCount > 1 ? `📷 ${card.photoCount}` : null, variant !== 'row' ? `“${card.buddyLine}”` : null].filter(Boolean) as string[]
  const Tag = onClick ? 'button' : 'div'
  // 캐릭터 크기: 카드 높이 기준(받침 위). 줄(row)은 오른쪽 아래 따로
  const art = (size: number) => buddy ? <CharacterArt species={buddy.species} stage={buddy.stage} size={size} mood={pose.face} motion="still" /> : null
  return (
    <Tag className={`dscene is-${variant}${url ? ' has-photo' : ''}${appear ? ' is-appear' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}
      aria-label={`${label ? `${label}, ` : ''}${dayLabel(card.date)}${m ? ` ${m.label}` : ''} ${card.title}`}>
      {url
        ? <img className="dscene__full" src={url} alt="" draggable={false} />
        : (
          <SceneBackdrop sceneKey={card.sceneKey} align="center" className="dscene__bg">
            {(L, sz) => {
              if (!buddy || variant === 'row') return null
              const box = Math.round(sz.h * (cell ? 0.5 : 0.46))
              const p = onPerch(L, box)
              // 아래 글(날짜·제목·칩)과 겹치지 않게 받침보다 위로 올릴 수 있다 — 글 자리 = 카드 아래 약 90px(칸은 제목 두 줄 30px)
              const top = Math.min(p.top, sz.h - (cell ? 26 : 96) - box * 0.92)
              return <span className={`dscene__buddy is-${cell ? 'still' : pose.motion}`} style={{ left: p.left, top, width: box, height: box }} aria-hidden="true">{art(box)}</span>
            }}
          </SceneBackdrop>
        )}
      {!url && buddy && variant === 'row' && <span className={`dscene__buddy is-row is-${pose.motion}`} aria-hidden="true">{art(84)}</span>}
      <span className="dscene__shade" aria-hidden="true" />
      <span className="dscene__band" style={{ background: m?.color ?? 'var(--color-accent)' }} aria-hidden="true" />
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
