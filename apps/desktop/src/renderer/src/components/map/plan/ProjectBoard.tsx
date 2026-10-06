// 31 §12.2 프로젝트 보드 + §12.9.0 차분한 카드(아이콘·이름·자동 / N개 중 M개 완료 · 마감 / 진행 막대 / 다음 할 일 행) +
// §12.9.1 손으로 만들기(＋ 새 프로젝트 · 이름 바꾸기 · 합치기 · 삭제 · 끌어 넣기).
import { Check, MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { daysBetween, projectTitle, type Proposal } from '@sprout/schema/projects'
import { projectCardLine } from '@sprout/schema/planView'
import { addToProject, createProjectFrom, dismissSuggestion, notProject } from '../../../data/projects'
import { createProject, deleteProject, linkTeam, mergeProject, renameProject, setCategory, setFocus } from '../../../data/projectEdit'
import { splitPeople } from '@sprout/schema/projectScore'
import { ProjectAskBubble } from './ProjectAsk'
import { categoryOf, CATEGORY_WORDS } from '@sprout/schema/projects'
import { projectStore } from '../../../data/projects'
import { planCandidates } from '../../../data/planActions'
import { openTarget } from '../../../data/wiki'
import { dayKey } from '../../../lib/dates'
import { checkboxColor } from '../../../lib/priority'
import type { TaskActions } from '../../../lib/taskActions'
import { EmojiPicker } from '../../EmojiPicker'
import { MenuItem, Popover, SubMenu } from '../../Popover'
import { useToast } from '../../Toast'
import { BuddyAvatar, useBuddy } from '../PlanChat'
import type { PlanData, ProjectView, PTaskRow } from './useProjects'

export type PlanOpen = (opts?: { taskId?: string; project?: { id: string; name: string }; makeProject?: boolean }) => void
/** 끌어 넣기(HTML 끌기) 자료 형식 — 값 = 할 일 id */
export const TASK_DND = 'application/x-sprout-task'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
export const dLabel = (day: string, today: string) => { const n = daysBetween(today, day); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}` }
/** 이름 앞 이모지(사람이 고른 아이콘). 없으면 null — 🚀(폴더 그림은 폴더에만, 30 §A.5) */
export const iconOf = (name: string) => { const t = projectTitle(name); return t !== name.trim() ? name.trim().slice(0, name.trim().length - t.length).trim() : null }
export function ProjectIcon({ name, size = 16 }: { name: string; size?: number }) {
  const e = iconOf(name)
  return <span className="pc-icon" style={{ fontSize: size }}>{e ?? '🚀'}</span>
}
/** `N개 중 M개 완료 · 제출 10/10` (급하면 마감만 빨강) */
export function CardLine({ p, today }: { p: ProjectView; today: string }) {
  const c = projectCardLine(p, today)
  const base = c.deadline ? c.text.slice(0, c.text.length - c.deadline.length) : c.text
  return <span className="pc-line">{base}{c.deadline && <b className={c.hot ? 'is-hot' : ''}>{c.deadline}</b>}</span>
}

export function PlanBubble({ text, children, size = 28 }: { text: string; children?: React.ReactNode; size?: number }) {
  const { buddy, stage } = useBuddy()
  return (
    <div className="plan-bub" role="status">
      <BuddyAvatar buddy={buddy} stage={stage} size={size} />
      <div className="plan-bub__msg">{text}</div>
      {children && <div className="plan-bub__reps">{children}</div>}
    </div>
  )
}

export function ProjectBoard({ data, onOpen, onPlan, actions, autoOn }: { data: PlanData; onOpen: (tagId: string) => void; onPlan: PlanOpen; actions: TaskActions; autoOn: boolean }) {
  const toast = useToast()
  const today = dayKey()
  const live = data.projects.filter((p) => !p.finished)
  const done = data.projects.filter((p) => p.finished)
  const [showDone, setShowDone] = useState(false)
  const [menu, setMenu] = useState<{ p: ProjectView; point: { x: number; y: number } }>()
  const [naming, setNaming] = useState<{ anchor: HTMLElement; p?: ProjectView }>()
  const [busy, setBusy] = useState(false)
  const [loose, setLoose] = useState<{ anchor: HTMLElement; word: string }>()

  const make = async (s: Proposal) => {
    setBusy(true)
    try {
      const r = await createProjectFrom(s)
      toast.show(`'${s.name}' 프로젝트를 만들었어요`, r.undo)
    } finally { setBusy(false) }
  }
  const openMenu = (p: ProjectView, e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ p, point: { x: e.clientX, y: e.clientY } }) }
  const drop = async (p: ProjectView, id: string) => {
    if (p.members.some((m) => m.id === id)) { toast.show('이미 이 프로젝트에 있어요'); return }
    toast.show(`'${p.title}'에 넣었어요`, await addToProject([id], p.tag.id))
  }
  const newBtn = (e: MouseEvent<HTMLElement>) => setNaming({ anchor: e.currentTarget })

  if (!live.length && !done.length && !data.suggestion) return (
    <>
      <PlanEmpty onPlan={onPlan} onNew={newBtn} autoOn={autoOn} />
      {naming && <NameDialog anchor={naming.anchor} cats={data.categories.map((c) => c.word)} onClose={() => setNaming(undefined)} onDone={(id) => onOpen(id)} />}
    </>
  )

  // §12.10 분류 묶음: 분류 없는 프로젝트 먼저, 그다음 분류마다(가까운 마감 순)
  const groups: { key: string; word: string | null; items: ProjectView[]; loose: PlanData['categories'][number]['loose'] }[] = []
  const plain = live.filter((p) => !p.category)
  if (plain.length) groups.push({ key: '-', word: null, items: plain, loose: [] })
  for (const c of data.categories) { const items = c.projects.filter((p) => !p.finished); if (items.length || c.loose.length) groups.push({ key: c.word, word: c.word, items, loose: c.loose }) }
  const near = live.find((p) => p.deadline && p.deadline.day >= today)
  const head = live.length ? `프로젝트 ${live.length}개` : '프로젝트'
  const tail = near?.deadline ? ` · 가장 가까운 마감은 ${near.title} ${near.deadline.word} ${md(near.deadline.day)}` : ''

  return (
    <div className="plan-board">
      <div className="plan-board__head">
        <span className="plan-board__sum">{head}{tail}</span>
        <button className="map-btn" onClick={newBtn}><Plus />새 프로젝트</button>
      </div>
      <ProjectAskBubble />
      {groups.map((g) => (
        <section key={g.key} className="plan-cat">
          {(groups.length > 1 || g.word) && (
            <header className="plan-cat__h">
              <span>{g.word ?? '프로젝트'}</span><small>{g.items.length}개</small>
              {g.loose.length > 0 && <button className="plan-cat__loose" onClick={(e) => setLoose({ anchor: e.currentTarget, word: g.word! })}>어느 {g.word}? {g.loose.length} ›</button>}
            </header>
          )}
          <div className="plan-grid">
            {g.items.map((p) => <ProjectCard key={p.tag.id} p={p} today={today} actions={actions} onOpen={() => onOpen(p.tag.id)} onMenu={(e) => openMenu(p, e)} onDrop={(id) => void drop(p, id)} />)}
          </div>
        </section>
      ))}
      <div className="plan-grid plan-grid--extra">
        {data.suggestion && (
          <div className="pc-card pc-card--sugg">
            <div className="pc-card__t">'{data.suggestion.name}' 관련 일이 {data.suggestion.taskIds.length}개 보여요. 프로젝트로 만들까요?</div>
            <div className="pc-line">{suggestWhy(data.suggestion, data)}</div>
            <div className="pc-card__acts">
              <button className="map-btn map-btn--primary" disabled={busy} onClick={() => void make(data.suggestion!)}>만들기</button>
              <button className="map-btn" onClick={() => dismissSuggestion(data.suggestion!.key)}>아니</button>
            </div>
          </div>
        )}
        <button className="pc-card pc-card--new" onClick={() => onPlan({ makeProject: true })}>
          <b>같이 계획 짜기</b>
          <span>새 큰 일을 말해 주면 프로젝트로 만들고 단계도 나눠 줄게요</span>
        </button>
      </div>
      {loose && <LoosePicker anchor={loose.anchor} group={data.categories.find((c) => c.word === loose.word)} data={data} onClose={() => setLoose(undefined)} />}
      {done.length > 0 && (
        <div className="plan-done">
          <button className="map-btn map-btn--text" onClick={() => setShowDone((s) => !s)}>끝난 프로젝트 {done.length} {showDone ? '▾' : '›'}</button>
          {showDone && <div className="plan-grid">{done.map((p) => <ProjectCard key={p.tag.id} p={p} today={today} actions={actions} onOpen={() => onOpen(p.tag.id)} onMenu={(e) => openMenu(p, e)} onDrop={(id) => void drop(p, id)} />)}</div>}
        </div>
      )}
      {menu && (
        <ProjectMenu p={menu.p} all={data.projects} point={menu.point} onClose={() => setMenu(undefined)} onOpen={() => onOpen(menu.p.tag.id)} onPlan={onPlan}
          onRename={() => { const el = document.querySelector<HTMLElement>(`[data-project="${menu.p.tag.id}"]`); if (el) setNaming({ anchor: el, p: menu.p }) }} />
      )}
      {naming && <NameDialog anchor={naming.anchor} p={naming.p} cats={data.categories.map((c) => c.word)} onClose={() => setNaming(undefined)} onDone={(id) => { if (!naming.p) onOpen(id) }} />}
    </div>
  )
}

/** 카드·프로젝트 머리 ⋯ 메뉴(§12.9.1) */
export function ProjectMenu({ p, all, point, anchor, onClose, onOpen, onPlan, onRename, onGone }: {
  p: ProjectView; all: ProjectView[]; point?: { x: number; y: number }; anchor?: HTMLElement; onClose: () => void; onOpen?: () => void; onPlan: PlanOpen; onRename: () => void; onGone?: () => void
}) {
  const toast = useToast()
  const go = (f: () => unknown) => () => { onClose(); void f() }
  const others = all.filter((o) => o.tag.id !== p.tag.id)
  return (
    <Popover point={point} anchor={anchor} align="end" onClose={onClose} className="menu" width={210}>
      {/* 31 §12.13.7 지금 집중 — 한 번에 하나 */}
      <MenuItem label={p.focus ? '집중 끄기' : '지금 집중'} onClick={go(async () => {
        const u = await setFocus(p.focus ? null : p.tag.id)
        toast.show(p.focus ? '집중을 껐어요' : `지금 '${p.title}'에 집중해요 · 빠른 추가에 붙여 둘게요`, u)
      })} />
      <div className="menu__divider" />
      {onOpen && <MenuItem label="열기" onClick={go(onOpen)} />}
      <MenuItem label="이름 바꾸기" onClick={go(onRename)} />
      <SubMenu label="다른 프로젝트와 합치기" disabled={!others.length} width={230}>
        {others.map((o) => <MenuItem key={o.tag.id} label={`${o.title} (으)로 합치기`} onClick={go(async () => { const u = await mergeProject(p.tag.id, o.tag.id); onGone?.(); toast.show(`'${p.title}'을 '${o.title}'에 합쳤어요`, u) })} />)}
      </SubMenu>
      <MenuItem label="다음 단계 같이 짜기" onClick={go(() => onPlan({ project: { id: p.tag.id, name: p.title } }))} />
      <MenuItem label="태그 페이지" onClick={go(() => openTarget({ view: `tag:${p.tag.id}` }))} />
      <div className="menu__divider" />
      <MenuItem label="프로젝트 아님" onClick={go(async () => { const u = await notProject(p.tag); onGone?.(); toast.show(`'${p.title}'을 프로젝트에서 뺐어요. 태그는 그대로예요`, u) })} />
      <MenuItem label="프로젝트 삭제" danger onClick={go(async () => { const u = await deleteProject(p.tag.id); onGone?.(); toast.show(`'${p.title}' 프로젝트를 지웠어요. 할 일은 그대로예요`, u) })} />
    </Popover>
  )
}

/** `＋ 새 프로젝트`·이름 바꾸기 창: 아이콘(이모지, 비우면 폴더) + 이름 20자 */
const COMMON_CATS = ['공모전', '해커톤', '창업', '시험', '논문']
export function NameDialog({ anchor, p, cats = [], onClose, onDone }: { anchor: HTMLElement; p?: ProjectView; cats?: string[]; onClose: () => void; onDone?: (tagId: string) => void }) {
  const toast = useToast()
  const [name, setName] = useState(p ? p.title : '')
  const [emoji, setEmoji] = useState<string | null>(p ? iconOf(p.tag.name) : null)
  // §12.10.4 분류: 고르지 않으면 이름에서(이름에 분류 낱말이 있으면 그것이 미리 골라짐)
  const [cat, setCat] = useState<string | null | undefined>(p ? p.category : undefined)
  const auto = categoryOf(name)
  const shownCat = cat === undefined ? auto : cat
  const catList = [...new Set([...cats, ...COMMON_CATS, ...(shownCat ? [shownCat] : [])])].filter((c) => c === '시험' || CATEGORY_WORDS.includes(c) || cats.includes(c))
  const [picking, setPicking] = useState(false)
  const [err, setErr] = useState('')
  const [team, setTeam] = useState('') // 31 §12.13.2 팀원(새 프로젝트만)
  const btn = useRef<HTMLButtonElement>(null)
  const save = async () => {
    if (!name.trim()) { setErr('이름을 입력해 주세요'); return }
    // 이름에서 읽히는 분류와 다르게 골랐을 때만 기록('' = 없음으로 고름)
    const want = shownCat ?? ''
    const keepCat = async (tagId: string) => (want !== (categoryOf(name) ?? '') ? setCategory(tagId, want) : setCategory(tagId, null))
    if (p) { const u = await renameProject(p.tag.id, name, emoji); const c = await keepCat(p.tag.id); toast.show('이름을 바꿨어요', async () => { await c(); await u() }); onClose(); return }
    const r = await createProject(name, emoji)
    const c = await keepCat(r.tagId)
    const people = splitPeople(team)
    const t = people.length ? await linkTeam(r.tagId, people) : async () => {}
    toast.show(`'${name.trim()}' 프로젝트를 만들었어요${people.length ? ` · 팀원 ${people.length}명` : ''}`, async () => { await t(); await c(); await r.undo() })
    onClose()
    onDone?.(r.tagId)
  }
  return (
    <Popover anchor={anchor} onClose={() => { if (!picking) onClose() }} width={300} className="plan-name">
      <div className="plan-name__h">{p ? '프로젝트 이름 바꾸기' : '새 프로젝트'}</div>
      <div className="plan-name__row">
        <button ref={btn} className="plan-name__icon" aria-label="아이콘 고르기" onClick={() => setPicking(true)}>{emoji ?? '🚀'}</button>
        <input autoFocus className="plan-add__q" maxLength={20} placeholder="프로젝트 이름" value={name} aria-label="프로젝트 이름"
          onChange={(e) => { setName(e.target.value); setErr('') }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save() }} />
      </div>
      {err && <p className="plan-name__err">{err}</p>}
      {!p && (
        <label className="plan-name__team">
          <span>팀원</span>
          <input className="plan-add__q" placeholder="예: 민수, 지은" value={team} aria-label="팀원" onChange={(e) => setTeam(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save() }} />
        </label>
      )}
      <div className="plan-name__cat" role="radiogroup" aria-label="분류">
        <span>분류</span>
        {catList.map((c) => <button key={c} role="radio" aria-checked={shownCat === c} className={shownCat === c ? 'is-on' : ''} onClick={() => setCat(shownCat === c ? null : c)}>{c}</button>)}
        <button role="radio" aria-checked={!shownCat} className={!shownCat ? 'is-on' : ''} onClick={() => setCat(null)}>없음</button>
      </div>
      <div className="plan-name__acts">
        <button className="map-btn" onClick={onClose}>취소</button>
        <button className="map-btn map-btn--primary" onClick={() => void save()}>{p ? '저장' : '만들기'}</button>
      </div>
      {picking && <EmojiPicker anchor={btn.current} onPick={(e) => setEmoji(e)} onClose={() => setPicking(false)} />}
    </Popover>
  )
}

function suggestWhy(s: Proposal, data: PlanData) {
  if (s.reason === 'tag') return `#${s.name} 태그가 붙은 일 ${s.taskIds.length}개를 프로젝트로 볼까요?`
  const names = [...new Set(s.taskIds.map((id) => data.listName(data.byId.get(id)?.list_id ?? null)).filter(Boolean))]
  const where = names.length > 1 ? `${names.slice(0, 3).join('·')}${names.length > 3 ? ` 외 ${names.length - 3}곳` : ''}에 흩어져 있어요.` : `${names[0] ?? '한 곳'}에 모여 있어요.`
  return `“${s.word}” 들어간 일이 ${where}`
}

function ProjectCard({ p, today, actions, onOpen, onMenu, onDrop }: { p: ProjectView; today: string; actions: TaskActions; onOpen: () => void; onMenu: (e: MouseEvent) => void; onDrop: (taskId: string) => void }) {
  const [over, setOver] = useState(false)
  const key = (e: KeyboardEvent) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }
  const c = projectCardLine(p, today)
  const next = p.next[0]
  const dnd = (e: DragEvent) => { if (e.dataTransfer.types.includes(TASK_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true) } }
  return (
    <div className={`pc-card${p.finished ? ' is-finished' : ''}${over ? ' is-drop' : ''}`} role="button" tabIndex={0} data-project={p.tag.id}
      onClick={onOpen} onKeyDown={key} onContextMenu={onMenu} aria-label={`${p.title} 프로젝트 열기`}
      onDragOver={dnd} onDragEnter={dnd} onDragLeave={() => setOver(false)}
      onDrop={(e) => { const id = e.dataTransfer.getData(TASK_DND); setOver(false); if (id) { e.preventDefault(); onDrop(id) } }}>
      <div className="pc-card__top">
        <ProjectIcon name={p.tag.name} />
        <div className="pc-card__t">{p.title}</div>
        {p.focus && <span className="pc-focus">집중</span>}
        {p.auto && <span className="pc-auto">자동</span>}
        <button className="icon-btn pc-card__more" aria-label="프로젝트 메뉴" onClick={onMenu}><MoreHorizontal /></button>
      </div>
      <CardLine p={p} today={today} />
      <div className="pc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress * 100)}><i style={{ width: `${c.progress * 100}%` }} /></div>
      {next ? <NextRow t={next} today={today} actions={actions} /> : <div className="pc-next pc-next--none">{p.open ? '다음 할 일 없음' : '다 끝냈어요'}</div>}
      <span className="pc-open" aria-hidden="true">{over ? '여기에 넣기' : '열기 ›'}</span>
    </div>
  )
}

/** 다음 할 일 = 진짜 할 일 행(체크 = 완료) */
function NextRow({ t, today, actions }: { t: PTaskRow; today: string; actions: TaskActions }) {
  const [on, setOn] = useState(false)
  const d = t.due_at?.slice(0, 10) ?? t.start_at?.slice(0, 10)
  return (
    <div className={`pc-next${on ? ' is-leaving' : ''}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button className={`checkbox${on ? ' is-checked' : ''}`} style={{ ['--checkbox-color' as string]: checkboxColor(t.priority ?? 0) }} aria-label={`'${t.title}' 완료`}
        onClick={() => { if (on) return; setOn(true); window.setTimeout(() => { void actions.complete([t.id]).finally(() => setOn(false)) }, 350) }}>{on && <Check strokeWidth={3} />}</button>
      <span className="pc-next__t" title={t.title}>{t.title}</span>
      {d && <small className={d < today ? 'is-late' : ''}>{md(d)}</small>}
    </div>
  )
}

/** 빈 상태(시안 ④) */
function PlanEmpty({ onPlan, onNew, autoOn }: { onPlan: PlanOpen; onNew: (e: MouseEvent<HTMLElement>) => void; autoOn: boolean }) {
  const [cands, setCands] = useState<{ id: string; title: string }[]>([])
  useEffect(() => { let on = true; void planCandidates(dayKey(), 4).then((c) => { if (on) setCands(c) }).catch(() => {}); return () => { on = false } }, [])
  const { buddy, stage } = useBuddy()
  return (
    <div className="plan-empty">
      <BuddyAvatar buddy={buddy} stage={stage} size={96} />
      <h3>아직 프로젝트가 없어요</h3>
      <p>{autoOn ? '관련된 일이 생기면 알아서 묶어 드려요. 직접 만들어도 돼요.' : '자동으로 만들기가 꺼져 있어요. 직접 만들어 보세요.'}</p>
      {cands.length > 0 && <div className="plan-empty__chips">{cands.map((c) => <button key={c.id} onClick={() => onPlan({ taskId: c.id, makeProject: true })}>{c.title}</button>)}</div>}
      <div className="plan-empty__acts">
        <button className="map-btn map-btn--primary plan-empty__go" onClick={onNew}><Plus />새 프로젝트</button>
        <button className="map-btn plan-empty__go" onClick={() => onPlan({ makeProject: true })}>같이 계획 짜기</button>
      </div>
    </div>
  )
}

/** §12.10.3 어느 공모전? — 막연한 할 일마다 그 분류 프로젝트 알약(가까운 순). 한 번 누르면 넣기(user) · 아니 = 다시 안 묻기 */
function LoosePicker({ anchor, group, data, onClose }: { anchor: HTMLElement; group?: PlanData['categories'][number]; data: PlanData; onClose: () => void }) {
  const toast = useToast()
  if (!group) return null
  const title = (id: string) => data.projects.find((p) => p.tag.id === id)?.title ?? ''
  const md2 = (t: PTaskRow) => { const d = t.due_at ?? t.start_at; return d ? md(d.slice(0, 10)) : '' }
  return (
    <Popover anchor={anchor} onClose={onClose} align="end" width={420} className="plan-loose">
      <div className="plan-loose__h">어느 {group.word}인지 골라 주세요</div>
      <div className="plan-loose__list">
        {group.loose.length ? group.loose.map(({ task, choices }) => (
          <div key={task.id} className="plan-loose__row">
            <div className="plan-loose__t"><span>{task.title}</span><small>{md2(task)}</small></div>
            <div className="plan-loose__pick">
              {choices.slice(0, 4).map((id) => <button key={id} onClick={async () => toast.show(`'${title(id)}'에 넣었어요`, await addToProject([task.id], id))}>{title(id)}</button>)}
              <button className="is-quiet" onClick={() => { const sk = projectStore.get().skip ?? []; projectStore.set({ skip: [...sk, task.id] }); toast.show('이 할 일은 다시 묻지 않을게요', () => projectStore.set({ skip: (projectStore.get().skip ?? []).filter((x) => x !== task.id) })) }}>아니</button>
            </div>
          </div>
        )) : <p className="plan-add__none">다 골랐어요</p>}
      </div>
    </Popover>
  )
}
