// 31 §12.13.4 넣을지 묻기(보드 말풍선, 한 번에 하나, 하루 3개) · §12.13.6 주간 점검 끝 남은 후보([모두 넣기] [하나씩]).
// 점수는 @sprout/schema/projectScore(useProjectCandidates), 답은 data/projectEdit answerProjectQuestion(배운 규칙으로 남음).
import { useMemo, useState, useSyncExternalStore } from 'react'
import { PSCORE, reasonLine } from '@sprout/schema/projectScore'
import { eulReul } from '../../../lib/josa'
import { addToProject, askedToday, projectStore } from '../../../data/projects'
import { answerProjectQuestion } from '../../../data/projectEdit'
import { useToast } from '../../Toast'
import { PlanBubble } from './ProjectBoard'
import { freshAsk, useProjectCandidates, type AskItem } from './useProjects'
import './ask.css'

const short = (t: string) => ([...t].length > 18 ? `${[...t].slice(0, 17).join('')}…` : t)
const q = (t: string) => `'${short(t)}'`
/** '회의'를 */
const qe = (t: string) => `${q(t)}${eulReul(t).slice(t.length)}`

/** 보드 머리 아래 말풍선: `'회의'도 K 데이터 공모전 일이야?` [응] [아니] */
export function ProjectAskBubble() {
  const toast = useToast()
  const { ask } = useProjectCandidates()
  useSyncExternalStore(projectStore.subscribe, projectStore.get) // 물은 수가 바뀌면 다시
  const [busy, setBusy] = useState(false)
  const [gone, setGone] = useState<Set<string>>(new Set()) // 답한 직후(쿼리가 따라오기 전) 다시 안 뜨게
  const item = useMemo(() => freshAsk(ask).find((x) => !gone.has(x.taskId)), [ask, gone])
  if (!item || askedToday() >= PSCORE.askPerDay) return null
  const answer = async (yes: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      setGone((g) => new Set(g).add(item.taskId))
      const undo = await answerProjectQuestion(item, yes)
      toast.show(yes ? `${qe(item.title)} ${item.project}에 넣었어요` : '다시 묻지 않을게요', async () => {
        await undo()
        setGone((g) => { const n = new Set(g); n.delete(item.taskId); return n })
      })
    } finally { setBusy(false) }
  }
  const why = reasonLine(item)
  return (
    <div className="plan-ask" onKeyDown={(e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const bs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
      const i = bs.indexOf(document.activeElement as HTMLButtonElement)
      bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]?.focus()
    }}>
      <PlanBubble text={`${q(item.title)}도 ${item.project} 일이야?`}>
        <button className="map-btn map-btn--primary" disabled={busy} onClick={() => void answer(true)}>응</button>
        <button className="map-btn" disabled={busy} onClick={() => void answer(false)}>아니</button>
        {why && <small className="plan-ask__why">{why}</small>}
      </PlanBubble>
    </div>
  )
}

/** 주간 점검 끝(§12.13.6): 프로젝트마다 `K 공모전에 들어갈 것 같은 일 N개` [모두 넣기] [하나씩] */
export function ReviewProjectLeftovers() {
  const toast = useToast()
  const { ask } = useProjectCandidates()
  const [open, setOpen] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const groups = useMemo(() => {
    const m = new Map<string, { tagId: string; project: string; items: AskItem[] }>()
    for (const a of ask) if (!gone.has(a.taskId)) (m.get(a.tagId) ?? m.set(a.tagId, { tagId: a.tagId, project: a.project, items: [] }).get(a.tagId)!).items.push(a)
    return [...m.values()].sort((a, b) => b.items.length - a.items.length)
  }, [ask, gone])
  if (!groups.length) return null
  const hide = (ids: string[]) => setGone((g) => { const n = new Set(g); ids.forEach((id) => n.add(id)); return n })
  const unhide = (ids: string[]) => setGone((g) => { const n = new Set(g); ids.forEach((id) => n.delete(id)); return n })
  return (
    <div className="rv-left" role="region" aria-label="프로젝트에 들어갈 것 같은 일">
      {groups.map((g) => (
        <div key={g.tagId} className="rv-left__g">
          <div className="rv-left__h">
            <span>{g.project}에 들어갈 것 같은 일 <b>{g.items.length}</b>개</span>
            <button className="map-btn map-btn--primary" onClick={async () => {
              const ids = g.items.map((x) => x.taskId)
              hide(ids)
              const undo = await addToProject(ids, g.tagId)
              toast.show(`${ids.length}개를 ${g.project}에 넣었어요`, async () => { await undo(); unhide(ids) })
            }}>모두 넣기</button>
            <button className="map-btn" aria-expanded={open === g.tagId} onClick={() => setOpen(open === g.tagId ? null : g.tagId)}>하나씩</button>
          </div>
          {open === g.tagId && (
            <ul className="rv-left__list">
              {g.items.map((x) => (
                <li key={x.taskId}>
                  <span className="rv-left__t" title={x.title}>{x.title}</span>
                  <small>{reasonLine(x)}</small>
                  <button className="map-btn map-btn--primary" onClick={async () => { hide([x.taskId]); const u = await answerProjectQuestion(x, true, { count: false }); toast.show(`${qe(x.title)} 넣었어요`, async () => { await u(); unhide([x.taskId]) }) }}>응</button>
                  <button className="map-btn" onClick={async () => { hide([x.taskId]); const u = await answerProjectQuestion(x, false, { count: false }); toast.show('다시 묻지 않을게요', async () => { await u(); unhide([x.taskId]) }) }}>아니</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
