import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SPECIES, STAGES } from '@sprout/schema/growth'
import { useGrowth, useWeeklyClose } from '../../data/growth'
import { CharacterArt } from './CharacterArt'
import { iGa, ro } from '../../lib/josa'

// 10 §2.3 사이드바 맨 아래 작은 캐릭터 카드 — 누르면 성장 화면
export function SidebarCharacter({ onOpen }: { onOpen: () => void }) {
  const { character, progress } = useGrowth()
  const [pop, setPop] = useState(0)
  useEffect(() => {
    const on = (e: Event) => setPop((e as CustomEvent<number>).detail)
    window.addEventListener('sprout:xp', on)
    return () => window.removeEventListener('sprout:xp', on)
  }, [])
  useEffect(() => { if (!pop) return; const t = window.setTimeout(() => setPop(0), 900); return () => window.clearTimeout(t) }, [pop])
  const species = character?.species ?? null
  const name = species ? (character?.name || SPECIES[species].name) : '아직 모르는 알'
  return (
    <button className="side-character" onClick={onOpen} title="성장">
      <CharacterArt species={species} stage={progress.stage} size={36} mood={pop ? 'happy' : 'default'} />
      <span className="side-character__text">
        <span className="side-character__name">Lv {progress.level} {name}</span>
        <span className="xpbar xpbar--thin"><span style={{ width: `${(progress.into / progress.toNext) * 100}%` }} /></span>
      </span>
      {pop > 0 && <span className="xp-pop" key={Date.now()}>+{pop}</span>}
    </button>
  )
}

/** 10 §2.4 레벨업·진화 화면. 본 레벨은 기기에 기억(처음엔 보여주지 않고 기준만 잡는다) */
export function LevelUpWatcher() {
  const { character, progress } = useGrowth()
  // 10 §5 새 주 첫 실행 때 지난주 마감(앱에 늘 붙어 있는 이 감시자에서 부른다)
  useWeeklyClose()
  const [shown, setShown] = useState<{ level: number; stage: number; prevStage: number }>()
  const seenKey = character ? `sprout.seenLevel.${character.id}` : ''
  const ready = useRef(false)
  useEffect(() => {
    if (!character || !progress) return
    let seen = 0
    try { seen = Number(localStorage.getItem(seenKey) ?? 0) } catch { /* storage off */ }
    if (!seen) { try { localStorage.setItem(seenKey, String(progress.level)) } catch { /* */ } ready.current = true; return }
    if (progress.level > seen) {
      const prevStage = STAGES.filter((s) => seen >= s.from).pop()!.stage
      setShown({ level: progress.level, stage: progress.stage, prevStage })
      try { localStorage.setItem(seenKey, String(progress.level)) } catch { /* */ }
    }
  }, [character, progress.level, progress.stage, seenKey, progress])
  if (!shown || !character) return null
  const species = character.species
  const evolved = shown.stage > shown.prevStage
  const stageName = STAGES.find((s) => s.stage === shown.stage)!.name
  const prevName = STAGES.find((s) => s.stage === shown.prevStage)!.name
  const who = species ? (character.name || SPECIES[species].name) : '알'
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setShown(undefined)}>
      <div className="levelup" role="dialog" aria-label="레벨업">
        <div className={`levelup__art${evolved ? ' is-evolve' : ''}`}><CharacterArt species={species} stage={shown.stage} size={150} mood="happy" /></div>
        <h2>{evolved ? `${iGa(who)} ${prevName}에서 ${ro(stageName)} 자랐어요` : `레벨 ${iGa(String(shown.level))} 됐어요`}</h2>
        <p>Lv {shown.level} · {stageName}</p>
        <button className="survey__primary" onClick={() => setShown(undefined)}>좋아요</button>
      </div>
    </div>,
    document.body
  )
}
