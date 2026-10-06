// 40 캐릭터 동행 — 자리마다 같은 규칙으로 쓰는 캐릭터 한 명(크기 · 얼굴 · 반복/한 번 움직임 · 누르기 · 움직임 줄이기).
// 움직임은 transform·opacity만(CSS 키프레임). 창이 안 보이면 반복 움직임을 멈춘다. 그림은 growth/CharacterArt 그대로.
import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { companionLabel, companionName, levelLine, type CompanionMood, type CompanionMove } from '@sprout/schema/companion'
import type { Species } from '@sprout/schema/growth'
import { useGrowth, useMotionReduced } from '../../data/growth'
import { buddyOf } from '../../data/diary'
import { CharacterArt } from '../growth/CharacterArt'
import './companion.css'

// 창이 가려지면(최소화·다른 데스크톱) 반복 움직임을 멈춘다 — 문서 하나에 한 번만 건다
if (typeof document !== 'undefined' && !document.documentElement.dataset.companionVis) {
  document.documentElement.dataset.companionVis = '1'
  const sync = () => { document.documentElement.toggleAttribute('data-hidden', document.visibilityState === 'hidden') }
  document.addEventListener('visibilitychange', sync)
  sync()
}

/** 내 캐릭터(성향 조사 전이면 알) — 이름 · 종 · 레벨 · 단계 */
export function useCompanion() {
  const { character, progress } = useGrowth()
  const buddy = buddyOf(character ?? undefined)
  const species = buddy.species
  return {
    species, stage: progress.stage, level: progress.level, egg: !species,
    name: companionName(species, buddy.name),
    levelLine: levelLine(species, progress.level, progress.stage),
    label: companionLabel(species, buddy.name, progress.level, progress.stage)
  }
}

export type CompanionLoop = 'breathe' | 'think' | 'wiggle' | null
/** play: 값(n)이 바뀔 때마다 그 움직임을 한 번 */
export type CompanionPlay = { move: Exclude<CompanionMove, null>; n: number } | null

export function CompanionFace({ species, stage, size, mood = 'smile', loop = null, play = null, dim, onPress, label, className, children }: {
  species: Species | null; stage: number; size: number; mood?: CompanionMood; loop?: CompanionLoop; play?: CompanionPlay; dim?: boolean
  onPress?: () => void; label?: string; className?: string; children?: ReactNode
}) {
  const reduced = useMotionReduced()
  const [shot, setShot] = useState<{ move: string; n: number } | null>(null)
  const seen = useRef<number | undefined>(undefined) // 처음 붙을 때 받은 움직임도 한 번 한다
  useEffect(() => {
    if (!play || play.n === seen.current) return
    seen.current = play.n
    if (!reduced) setShot({ move: play.move, n: play.n })
  }, [play, reduced])
  const style = { width: size, height: size } as CSSProperties
  const cls = `companion${dim ? ' is-dim' : ''}${reduced ? ' is-still' : ''}${className ? ` ${className}` : ''}`
  const body = (
    <span key={shot?.n ?? 0} className={`companion__shot${shot ? ` is-${shot.move}` : ''}`} onAnimationEnd={() => setShot(null)}>
      <span className={`companion__loop${loop && !reduced ? ` is-${loop}` : ''}`}>
        <CharacterArt species={species} stage={stage} size={size} mood={mood} tight={size <= 30} />
      </span>
    </span>
  )
  if (onPress) return <button type="button" className={`${cls} is-button`} style={style} aria-label={label} onClick={onPress}>{body}{children}</button>
  return <span className={cls} style={style} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>{body}{children}</span>
}

/** 지난 답의 얼굴: 움직임 없이 그 답의 얼굴로 멈춘 그림(다시 그리지 않게 메모) */
export const StillFace = memo(function StillFace({ species, stage, size, mood, dim }: { species: Species | null; stage: number; size: number; mood: CompanionMood; dim?: boolean }) {
  return <span className={`companion${dim ? ' is-dim' : ''}`} style={{ width: size, height: size }} aria-hidden><CharacterArt species={species} stage={stage} size={size} mood={mood} tight={size <= 30} /></span>
})

/** 말풍선 한 줄(2.6초, 페이드 — 줄이기에서도 같다). key를 바꾸면 새로 뜬다 */
export function CompanionSay({ text }: { text: string }) {
  return <span className="companion-say" role="status" aria-live="polite">{text}</span>
}
/** XP +1(0.9초 위로 떠오르며 사라짐 · 줄이기면 제자리 페이드) */
export function CompanionXp({ text = '+1' }: { text?: string }) {
  const reduced = useMotionReduced()
  return <span className={`companion-xp${reduced ? ' is-still' : ''}`} aria-live="polite">{text}</span>
}
