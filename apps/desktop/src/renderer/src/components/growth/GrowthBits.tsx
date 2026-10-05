import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cumulativeXp, SPECIES, STAGES } from '@sprout/schema/growth'
import { isGrowthStageActive, useGrowth, useWeeklyClose, type XpRow } from '../../data/growth'
import { CharacterArt } from './CharacterArt'
import { iGa, ro } from '../../lib/josa'
import { addNotice } from '../../data/notices'
import './growth-report.css'

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
  const { character, progress, events } = useGrowth()
  // 10 §5 새 주 첫 실행 때 지난주 마감(앱에 늘 붙어 있는 이 감시자에서 부른다)
  useWeeklyClose()
  const [shown, setShown] = useState<{ level: number; stage: number; prevStage: number; gained: { label: string; amount: number }[] }>()
  const seenKey = character ? `sprout.seenLevel.${character.id}` : ''
  const ready = useRef(false)
  useEffect(() => {
    if (!character || !progress) return
    let seen = 0
    try { seen = Number(localStorage.getItem(seenKey) ?? 0) } catch { /* storage off */ }
    const stamp = () => { try { localStorage.setItem(`${seenKey}.at`, new Date().toISOString()) } catch { /* */ } }
    if (!seen) { try { localStorage.setItem(seenKey, String(progress.level)) } catch { /* */ } stamp(); ready.current = true; return }
    if (progress.level > seen) {
      // 01 §3.3 알림 패널 기록(레벨업 창·무대로 바로 보니 읽음으로)
      {
        const prev = STAGES.filter((s) => seen >= s.from).pop()!.stage
        const who = character.species ? (character.name || SPECIES[character.species].name) : '알'
        const stageName = STAGES.find((s) => s.stage === progress.stage)!.name
        addNotice({ kind: 'levelup', key: `levelup:${character.id}:${progress.level}`, title: progress.stage > prev ? `${iGa(who)} ${ro(stageName)} 자랐어요` : `레벨 ${iGa(String(progress.level))} 됐어요`, body: `Lv ${progress.level} · ${stageName}`, target: { view: 'growth' }, read: true })
      }
      // 10 §3.2.6 결정: 성장 화면이 열려 있으면 창 대신 무대가 연출한다(본 레벨로 기록)
      if (isGrowthStageActive()) {
        window.dispatchEvent(new CustomEvent('sprout:growth-reveal', { detail: { prev: seen, level: progress.level } }))
        try { localStorage.setItem(seenKey, String(progress.level)) } catch { /* */ }
        stamp()
        return
      }
      const prevStage = STAGES.filter((s) => seen >= s.from).pop()!.stage
      let since: string | null = null
      try { since = localStorage.getItem(`${seenKey}.at`) } catch { /* */ }
      setShown({ level: progress.level, stage: progress.stage, prevStage, gained: gainedSince(events, seen, since) })
      try { localStorage.setItem(seenKey, String(progress.level)) } catch { /* */ }
      stamp()
    }
  }, [character, progress.level, progress.stage, seenKey, progress, events])
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
        {shown.gained.length > 0 && (
          <ul className="levelup__gained" aria-label="이번에 받은 XP">
            {shown.gained.map((g) => <li key={g.label}><span>{g.label}</span><b>+{g.amount}</b></li>)}
          </ul>
        )}
        <button className="survey__primary" onClick={() => setShown(undefined)}>좋아요</button>
      </div>
    </div>,
    document.body
  )
}

/** 10 §2.4 "이번에 받은 XP 내역": 지난번 레벨 화면(또는 기준을 잡은 때) 뒤에 들어온 XP를 종류별로 합친다(순합).
 *  그 시각을 모르면(예전 설치) 지난번에 본 레벨이 시작된 뒤부터 */
function gainedSince(events: XpRow[], seenLevel: number, since: string | null) {
  const from = cumulativeXp(seenLevel)
  let total = 0
  let start = 0
  events.forEach((e, i) => { if (total < from) start = i + 1; total += e.amount })
  if (since) { const i = events.findIndex((e) => e.created_at > since); start = i < 0 ? events.length + 1 : i + 1 }
  const label = (k: string) => (k.startsWith('task') ? '할 일 완료' : k === 'kpi_all' ? '목표 모두 달성 보너스' : k === 'review' ? '주간 점검' : k === 'tidy' ? '정리 보너스' : '주간 목표 달성')
  const sums = new Map<string, number>()
  for (const e of events.slice(Math.max(0, start - 1))) sums.set(label(e.kind), (sums.get(label(e.kind)) ?? 0) + e.amount)
  return [...sums].filter(([, n]) => n > 0).map(([l, n]) => ({ label: l, amount: n }))
}
