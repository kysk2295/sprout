// 31 작업 지도 v3 §3 목표 노드(그래프 1층 · 보드 열 머리)와 목표 우클릭 메뉴 — 성장 탭 목표 행과 같은 동작(setGoalProgress · XP 규칙 그대로)
import { ArrowRight, Check, Pencil, Sprout, Trash2, Unlink } from 'lucide-react'
import { useState } from 'react'
import { XP } from '@sprout/schema/growth'
import { carryOver, removeGoal, setGoalProgress, type GoalRow } from '../../data/growth'
import { unlinkGoal } from '../../data/mapGoals'
import { pathLabel } from '../../data/mapNow'
import { run, update } from '../../data/mutations'
import type { MapGoal } from '../../data/map'
import { MenuItem, Popover } from '../Popover'
import { NameInput, Ring } from './parts'
import type { MapData } from './useMapData'

/** 10 §3.2.8 보상 표시: `+30` 회색 / `+30 ✓` 강조 / `보상 없음` */
export function GoalReward({ goal, data }: { goal: MapGoal; data: MapData }) {
  const slotsLeft = data.xpIds.size < XP.kpiXpLimit
  if (goal.status === 'achieved') return data.xpIds.has(goal.id) ? <span className="map-reward is-got">+{XP.kpi} ✓</span> : <span className="map-reward is-none">보상 없음</span>
  return slotsLeft ? <span className="map-reward">+{XP.kpi}</span> : <span className="map-reward is-none" title={`XP는 한 주 ${XP.kpiXpLimit}개까지`}>보상 없음</span>
}

/** 목표 달성 표시(체크): 횟수 목표면 목표 수까지, 이미 달성이면 취소. 달성 순간 체크박스에서 캐릭터로 방울(10 §3.2.5) */
export async function toggleGoal(goal: MapGoal, from?: HTMLElement | null) {
  const reaching = goal.status !== 'achieved'
  if (reaching && from) { const r = from.getBoundingClientRect(); window.dispatchEvent(new CustomEvent('sprout:growth-feed', { detail: { x: r.left + r.width / 2, y: r.top + r.height / 2 } })) }
  await setGoalProgress(goal as GoalRow, reaching ? goal.target : 0)
}

export function goalPathText(goal: MapGoal, data: MapData): string | null {
  if (!data.goalLinks.has(goal.id)) return null
  return pathLabel(data.paths.get(goal.id) ?? null, (id) => data.byId.get(id)?.title)
}

/** 목표 노드 몸통: 체크 · 🎯 제목 · 남은 길 · 진행 고리(연결 할 일) · 횟수 점 · 보상 */
export function GoalHead({ goal, data, editing, onRename, onCancel, compact }: { goal: MapGoal; data: MapData; editing?: boolean; onRename?: (v: string) => Promise<boolean>; onCancel?: () => void; compact?: boolean }) {
  const done = goal.status === 'achieved'
  const link = data.goalLinks.get(goal.id) ?? { done: 0, total: 0 }
  const path = goalPathText(goal, data)
  return (
    <>
      <button className={`checkbox map-goal__check nodrag${done ? ' is-checked' : ''}`} aria-label={done ? '달성 취소' : '달성으로 표시'} title={done ? '달성 취소' : '달성으로 표시'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); void toggleGoal(goal, e.currentTarget) }}>
        {done && <Check strokeWidth={3} />}
      </button>
      <span className="map-goal__body">
        {editing && onRename && onCancel
          ? <NameInput initial={goal.title} onSave={onRename} onCancel={onCancel} />
          : <span className="map-goal__title">🎯 {goal.title}</span>}
        {path && !compact && <span className="map-goal__path">{path}</span>}
      </span>
      <span className="map-goal__side">
        {goal.target > 1 && goal.target <= 7
          ? <span className="map-goal__dots" title={`${goal.progress}/${goal.target}`}>{Array.from({ length: goal.target }, (_, i) => (i < goal.progress ? '●' : '○')).join('')}</span>
          : goal.target > 7 ? <span className="map-goal__dots">{goal.progress}/{goal.target}</span> : null}
        {link.total > 0 && <span className="map-goal__ring" title="연결된 할 일 완료/전체"><Ring done={link.done} total={link.total} />{link.done}/{link.total}</span>}
        <GoalReward goal={goal} data={data} />
      </span>
    </>
  )
}

/** 목표 우클릭(31 §3.3): 성장 탭에서 보기 · 달성 표시/취소 · 이름 바꾸기 · 다음 주로 넘기기 · 연결 모두 끊기 · 목표 삭제 */
export function GoalMenu({ goal, point, onClose, onRename, onGrowth, say }: { goal: MapGoal; point: { x: number; y: number }; onClose: () => void; onRename: () => void; onGrowth?: () => void; say: (text: string) => void }) {
  const [confirm, setConfirm] = useState(false)
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  if (confirm) {
    return (
      <Popover point={point} onClose={onClose} width={240} className="menu map-pop-confirm">
        <p>'{goal.title}' 목표를 삭제할까요? 이 목표로 받은 XP는 되돌려요.</p>
        <div className="map-pop-confirm__acts">
          <button className="map-btn" onClick={onClose}>취소</button>
          <button className="map-btn map-btn--danger" onClick={done(async () => { await removeGoal(goal.id); say('목표를 삭제했어요') })}>삭제</button>
        </div>
      </Popover>
    )
  }
  return (
    <Popover point={point} onClose={onClose} width={200} className="menu">
      {onGrowth && <MenuItem icon={<Sprout />} label="성장 탭에서 보기" onClick={done(onGrowth)} />}
      <MenuItem icon={<Check />} label={goal.status === 'achieved' ? '달성 취소' : '달성으로 표시'} onClick={done(() => toggleGoal(goal))} />
      <MenuItem icon={<Pencil />} label="이름 바꾸기" onClick={done(onRename)} />
      <MenuItem icon={<ArrowRight />} label="다음 주로 넘기기" disabled={goal.status === 'achieved'} onClick={done(async () => { await carryOver(goal as GoalRow); say('다음 주로 넘겼어요') })} />
      <div className="menu__divider" />
      <MenuItem icon={<Unlink />} label="연결 모두 끊기" onClick={done(() => unlinkGoal(goal.id))} />
      <MenuItem icon={<Trash2 />} label="목표 삭제" danger onClick={() => setConfirm(true)} />
    </Popover>
  )
}

export async function renameGoal(goal: MapGoal, raw: string): Promise<boolean> {
  const title = raw.replace(/\s+/g, ' ').trim()
  if (!title || title.length > 100) return false
  if (title !== goal.title) await run(update('kpis', goal.id, { title }))
  return true
}
