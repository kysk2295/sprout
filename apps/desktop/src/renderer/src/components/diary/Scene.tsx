import { forwardRef, useImperativeHandle, useRef } from 'react'
import { FOOT, SCENE_EDGE, SCENE_TINT, sceneLayout } from '@sprout/schema/characterArt'
import { companionLabel } from '@sprout/schema/companion'
import { normalizeSpecies } from '@sprout/schema/growth'
import { PlayableCharacter, type PlayHandle } from '../growth/PlayableCharacter'
import { SceneBackdrop, wideKey } from '../growth/Scene3D'
import type { FullBuddy } from './Talk'

// 15 §11 · 28 §9 C~H 일기 대화 무대(데스크톱): 고른 배경 장면(자동 = 시간대)을 가운데 칸 끝까지 + 받침 위 캐릭터.
// 받침이 아래 덩어리(칩·입력창) 바로 위에 오도록 장면을 위아래로 옮긴다(휴대폰 Scene.tsx와 같은 계산). 위 빈자리는 장면 맨 윗줄 색으로 잇는다.
// 몸짓: 듣기(쓰는 중) = 기울며 조금 커짐 · 생각 = 좌우 ±3° 1.8초 · 말하기 = 들썩 · 끄덕(보내자마자 2번 4px) · 깡충(저장). 움직임 줄이기면 얼굴만.
export type BuddyState = 'idle' | 'listen' | 'think' | 'talk'
export type SceneHandle = { nod: () => void; hop: () => void }

export const DiaryScene = forwardRef<SceneHandle, {
  sceneKey: string; width: number; height: number
  /** 받침이 올 칸 안 y */
  perchY: number
  size: number
  buddy: FullBuddy
  state: BuddyState; mood: string; reduced: boolean
}>(function DiaryScene({ sceneKey, width, height, perchY, size, buddy, state, mood, reduced }, ref) {
  // 넓은 칸은 가로로 구운 장면(wide-*)이 있으면 그것(성장 홈과 같은 규칙)
  const key = width > height * 0.9 ? wideKey(sceneKey) : sceneKey
  const L0 = sceneLayout(key, width, height, 'bottom')
  const shift = Math.round(perchY - L0.perchY)
  const edge = SCENE_EDGE[sceneKey] ?? (SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-day']).top
  const pc = useRef<PlayHandle>(null)
  const body = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({
    nod: () => {
      if (reduced) return
      body.current?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(4px)', offset: 0.22 }, { transform: 'translateY(0)', offset: 0.48 }, { transform: 'translateY(4px)', offset: 0.7 }, { transform: 'translateY(0)' }], { duration: 510, easing: 'ease-out' })
    },
    hop: () => { pc.current?.play('hop'); if (!reduced) window.setTimeout(() => pc.current?.play('giggle'), 420) }
  }), [reduced])
  return (
    <div className="dstage" style={{ background: edge }}>
      <div className="dstage__scene" style={{ transform: `translateY(${shift}px)` }}>
        <SceneBackdrop sceneKey={key} align="bottom" className="dstage__img" />
        <span className="dstage__edge" style={{ background: `linear-gradient(${edge}, transparent)` }} />
      </div>
      <div className="dstage__fade" style={{ background: `linear-gradient(${edge}d9 0%, ${edge}8c 40%, transparent 100%)` }} />
      <div className={`dstage__buddy is-${state}`} style={{ left: L0.perchX - size * FOOT.x, top: perchY - size * FOOT.y, width: size, height: size }}>
        <div ref={body} className="dstage__body">
          <div className="dstage__pose">
            <PlayableCharacter handle={pc} level="light" reduced={reduced} species={buddy.species} stage={buddy.stage} size={size} mood={mood} motion={state === 'idle' || state === 'listen' ? 'idle' : 'still'}
              buttonLabel={companionLabel(normalizeSpecies(buddy.species), buddy.name, buddy.level, buddy.stage)} />
          </div>
        </div>
      </div>
    </div>
  )
})
