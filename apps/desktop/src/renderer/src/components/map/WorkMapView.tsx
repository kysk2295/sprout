// 14 작업 지도 v2.0 + 31 v3 — 머리(그래프·보드·타임라인 · 기간 · ⚡ 지금 · ✦ 기본함 정리 · 거름틀 · ⋯), AI 제안 카드, 지금 띠, 보기, 상세 패널(02와 같은 컴포넌트).
// 31 §12 v2(2026-10-05): 프로젝트 화면이 기본 — plan/PlanHome(자동 프로젝트). 전체 나무(위 보기들)는 머리 ⧉ 전체 지도에서만.
// 사용자 결정 2026-10-05 "작업 지도 = 프로젝트 한 화면": 계획·점검·정리 탭 없음. 점검 = 성장 › 주간 점검, 정리 = 정리 화면(modes.tsx) — applyMode가 그쪽으로 보낸다.
// 내 폴더 › 리스트 › 할 일을 틱틱처럼 직접 고친다. AI는 기본함 할 일에 대한 제안만(30 §B).
import { Check, Columns3, FolderPlus, ListPlus, Map as MapIcon, MoreHorizontal, Network, RotateCcw, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { localModels } from '../../../../shared/assistant'
import { setGoalProgress, thisWeek, type GoalRow } from '../../data/growth'
import { loadApplySnapshot, undoApply } from '../../data/listSuggest'
import { loadBreakdownUndo, undoBreakdown } from '../../data/breakdown'
import { moveGoalLink } from '../../data/mapGoals'
import {
  acceptLink, connect, createFolderStmts, dropLink, folderView, moveListStmts, readLinks, renameFolderStmts, renameListStmts, reorderFoldersStmts, type MapFolder, type MapList
} from '../../data/map'
import { getDb } from '../../data/db'
import { createTask, run } from '../../data/mutations'
import { deleteOrganization, type OrganizationItem } from '../../data/organization'
import { useQuery } from '../../data/useQuery'
import type { ListRow, TagRow } from '../../data/types'
import { listLabel } from '../../data/types'
import { useTaskActions } from '../../lib/taskActions'
import { eulReul } from '../../lib/josa'
import { DetailPane } from '../DetailPane'
import { Dialog } from '../Dialog'
import { openInboxOrganize } from '../listSuggest/ListSuggest'
import { OrganizationEditor } from '../OrganizationEditor'
import { MenuItem, Popover, SubMenu } from '../Popover'
import { Resizer } from '../Resizer'
import { useToast } from '../Toast'
import { MapBoard } from './MapBoard'
import { MapGraph, type LinkActions } from './MapGraph'
import { TimelineMoreItems, TimelineOptionItems, TimelineScaleItems, useTimelineNav } from './TimelineControls'
import { TimelineView } from './TimelineView'
import { BuddyAvatar, PlanChat, useBuddy, useReducedMotion, type PlanRequest } from './PlanChat'
import { loadPlanUndo, savePlanUndo, undoPlanSession, type PlanJournal } from '../../data/planActions'
import { NowStrip } from './NowStrip'
import { MapGuideButton, MapGuidePanel, MapTour, useMapGuide, type Recipe } from './MapGuide'
import { CardMenu } from './parts'
import { modeGroupBy, modeView, MODE_PRESET, OPEN_MAP, openReview, openTidy, takeMapIntent, type MapIntent, type MapMode } from '../../data/mapMoments'
import type { MapTask } from '../../data/map'
import type { MapActions } from './parts'
import { DEFAULT_OPTIONS, useMapData, useStored, useStoredValue, type MapOptions } from './useMapData'
import { PlanHome } from './plan/PlanHome'
import { autoProjectsOn, projectStore } from '../../data/projects'
import type { PlanOpen } from './plan/ProjectBoard'
import './map.css'

const DETAIL = { def: 298, min: 260, max: 560 }
type Notice = { id: number; text: string; action?: { label: string; run: () => void }; sticky?: boolean }
type Confirm = { kind: 'list'; list: MapList } | { kind: 'folder'; folder: MapFolder }

export function WorkMapView({ lists, onTasks, onGrowth }: { lists: ListRow[]; onOpen: (taskId: string) => void; onTasks: () => void; onGrowth?: () => void }) {
  const toast = useToast()
  const taskActions = useTaskActions()
  const tags = useQuery<TagRow>('SELECT id, name, color FROM tags ORDER BY sort_order') ?? []
  // 31 §10 모드(계획·점검·정리)가 보기를 정한다 — 계획 = 그래프(⇄ 보드 아이콘), 점검 = 타임라인 + 목표로 묶기, 정리 = 구조 그래프.
  // 마지막 모드 기기 기억 sprout.map.mode, 계획의 그래프·보드는 sprout.map.view
  const mode = 'plan' as MapMode // 모드 탭 없음(2026-10-05) — 예전 기억 sprout.map.mode는 안 읽는다
  const [planView, setPlanView] = useStoredValue<'graph' | 'board' | 'timeline'>('view', 'graph')
  const view = modeView(mode, planView)
  // 31 §12 ⧉ 전체 지도(기기 기억 sprout.map.whole) — 꺼져 있으면 모드 화면(계획 = 프로젝트 보드)
  const [wholeN, setWholeN] = useStoredValue<number>('whole', 0)
  const whole = wholeN === 1
  const [focusProject, setFocusProject] = useState<{ id: string; n: number } | null>(null)
  const [userOpts, setOpts] = useStored<MapOptions>('options', DEFAULT_OPTIONS)
  // 묶기·기간은 모드가 정한다(2026-10-05 정리): 점검 = 목표로 묶기(이번 주 목표가 없으면 리스트), 나머지 = 리스트 · 기간 전체
  const goalCount = useQuery<{ n: number }>('SELECT count(*) AS n FROM kpis WHERE week_start = ?', [thisWeek()])?.[0]?.n ?? 0
  const [planGoal, setPlanGoal] = useState<string | null>(null)
  const opts: MapOptions = useMemo(() => ({ ...userOpts, period: 'all', goalWeek: 'this', groupBy: modeGroupBy(mode, goalCount), keepDone: planGoal }), [userOpts, mode, goalCount, planGoal])
  const data = useMapData(opts, view)
  const tl = useTimelineNav() // 31 §2 타임라인 배율·막대 색·할일 정렬 칸(기기 기억 sprout.map.timeline)
  const [selected, setSelected] = useState<string | null>(null)
  const [detailW, setDetailW] = useState(DETAIL.def)
  const [editing, setEditing] = useState<string | null>(null)
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<Set<string>>(new Set())
  // 31 §1 지금 할 일: ⚡ 집중(기기 기억 안 함 — 지도를 다시 열면 꺼짐) · 띠 접기(기기 기억 sprout.map.nowStrip) · 알약 클릭 이동
  const [focusNow, setFocusNow] = useState(false)
  const [reveal, setReveal] = useState<{ id: string; n: number }>()
  const [stripMenu, setStripMenu] = useState<{ task: MapTask; point: { x: number; y: number } }>()
  // 31 §11 같이 계획 짜기: 대화 칸(계획 모드 오른쪽) · ⚡ 첫 걸음 · 같이 짜는 큰 할 일 · 막 만든 노드·선(피어남)
  const [plan, setPlan] = useState<PlanRequest | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const [fresh, setFresh] = useState<Map<string, number>>(() => new Map())
  const { buddy, stage } = useBuddy()
  const reduced = useReducedMotion()
  const [confirm, setConfirm] = useState<Confirm>()
  const [editor, setEditor] = useState<{ kind: 'list' | 'folder'; item?: OrganizationItem; folderId?: string }>()
  const [pop, setPop] = useState<{ kind: 'filter' | 'more'; anchor: HTMLElement }>()
  const [notice, setNotice] = useState<Notice>()
  const [aiOk, setAiOk] = useState<boolean | null>(null)

  // AI를 쓸 수 있는지(서버 프록시 → Mac mini) — 처음·앱 포커스 때 확인. 없어도 지도는 그대로 쓴다(제안만 안 나옴)
  useEffect(() => {
    let alive = true
    const probe = async () => {
      try {
        const models = window.sprout?.assistant ? await window.sprout.assistant.models() : await localModels(AbortSignal.timeout(8000))
        if (alive) setAiOk(models.length > 0)
      } catch { if (alive) setAiOk(false) }
    }
    void probe()
    window.addEventListener('focus', probe)
    return () => { alive = false; window.removeEventListener('focus', probe) }
  }, [])

  const say = useCallback((text: string, action?: Notice['action'], sticky?: boolean) => setNotice({ id: Date.now(), text, action, sticky }), [])
  useEffect(() => {
    if (!notice || notice.sticky) return
    const t = window.setTimeout(() => setNotice(undefined), 4000)
    return () => window.clearTimeout(t)
  }, [notice])

  const actions: MapActions = useMemo(() => ({
    open: (id) => setSelected(id),
    complete: (id) => {
      setChecking((s) => new Set(s).add(id))
      // 체크 후 0.4초 뒤 사라진다(14 §3)
      window.setTimeout(async () => {
        await taskActions.complete([id])
        setChecking((s) => { const n = new Set(s); n.delete(id); return n })
        // 앞 할 일을 끝내면 뒤 할 일 안내
        const links = await readLinks()
        const next = links.filter((l) => l.kind === 'sequence' && l.state === 'accepted' && l.from_id === id)
        for (const l of next) {
          const others = links.filter((x) => x.kind === 'sequence' && x.state === 'accepted' && x.to_id === l.to_id && x.from_id !== id)
          const openOthers = others.filter((x) => data.byId.get(x.from_id)?.status === 0)
          const t = data.byId.get(l.to_id)
          if (t && t.status === 0 && !openOthers.length) {
            say(`이제 '${t.title}'${eulReul(t.title).slice(t.title.length)} 시작할 수 있어요`)
            // 뒤 노드가 피어나고 띠의 새 알약이 1초 반짝(31 §1.3)
            setFlash((f) => new Set(f).add(t.id))
            window.setTimeout(() => setFlash((f) => { const n = new Set(f); n.delete(t.id); return n }), 1000)
            break
          }
        }
      }, 400)
    },
    moveTask: async (taskId, listId) => {
      const l = data.lists.find((x) => x.id === listId)
      if (l) await taskActions.move([taskId], l)
    },
    moveList: async (listId, folderId, beforeId) => {
      const stmts = moveListStmts(data.lists, listId, folderId, beforeId)
      if (!stmts.length) return
      await run(...stmts)
      const l = data.lists.find((x) => x.id === listId)
      const f = folderId ? data.folders.find((x) => x.id === folderId) : undefined
      if (l && (l.folder_id ?? null) !== folderId) {
        const back = async () => { const ls = await (await getDb()).getAll<MapList>('SELECT id, name, emoji, color, folder_id, kind, sort_order, archived_at FROM lists'); await run(...moveListStmts(ls, listId, l.folder_id ?? null)) }
        toast.show(f ? `'${l.name}' 리스트를 ${folderView(f.name).name} 폴더로 옮겼어요` : `'${l.name}' 리스트를 폴더 밖으로 옮겼어요`, back)
      }
    },
    renameList: async (list, name) => {
      const s = renameListStmts(list, name)
      if (!s) return false
      await run(...s)
      setEditing(null)
      return true
    },
    renameFolder: async (folder, name) => {
      const s = renameFolderStmts(folder, name)
      if (!s) return false
      await run(...s)
      setEditing(null)
      return true
    },
    createFolder: async (name) => {
      const r = createFolderStmts(data.folders, name)
      if (!r) return false
      await run(...r.stmts)
      return true
    },
    editList: (list, folderId) => setEditor({ kind: 'list', item: list ? { ...list } : undefined, folderId: folderId ?? undefined }),
    editFolder: (folder) => setEditor({ kind: 'folder', item: folder ? { ...folder } : undefined }),
    removeList: (list) => setConfirm({ kind: 'list', list }),
    ungroup: (folder) => setConfirm({ kind: 'folder', folder }),
    addTask: async (listId, title) => { await createTask({ title, list_id: listId }) },
    trash: (id) => taskActions.trash([id]).then(() => { if (selected === id) setSelected(null) }),
    organize: openInboxOrganize,
    editing, setEditing, checking, selected, flash,
    focusNow,
    breakdown: (id) => openPlan(id),
    lit, planGoal, fresh,
    linkGoal: async (taskId, goalId) => {
      const undo = await moveGoalLink(taskId, goalId)
      if (!undo) return
      const t = data.byId.get(taskId)
      const g = goalId ? data.goals.find((x) => x.id === goalId) : undefined
      toast.show(g ? `'${t?.title ?? ''}'${eulReul(t?.title ?? '').slice((t?.title ?? '').length)} '${g.title}'에 연결했어요` : '목표 연결을 끊었어요', undo)
    }
  }), [data, taskActions, toast, say, editing, checking, selected, flash, focusNow, lit, planGoal, fresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const linkActions: LinkActions = useMemo(() => ({
    connect: (kind, from, to) => void connect(kind, from, to).then((r) => { if (r === 'cycle') toast.show('순서가 돌고 돌아서 이을 수 없어요') }),
    accept: (id) => void acceptLink(id).then((r) => { if (r === 'cycle') toast.show('순서가 돌고 돌아서 이을 수 없어요') }),
    drop: (id, state) => void dropLink(id, state)
  }), [toast])

  // 목표 선: 연결된 할 일을 모두 끝내면 달성 제안(XP는 성장 규칙 그대로 — 자동 지급 안 함)
  const [skipGoals, setSkipGoals] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (notice?.sticky) return
    for (const g of data.goals) {
      // 31 D3: 횟수 목표는 연결 할 일 완료마다 자동으로 센다 — 제안은 1회 목표만
      if (g.status === 'achieved' || g.target > 1 || skipGoals.has(g.id)) continue
      const linked = data.links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.from_id === g.id)
      if (linked.length && linked.every((l) => l.to_status === 1)) {
        setSkipGoals((s) => new Set(s).add(g.id))
        say(`'${g.title}'에 연결된 할 일을 다 끝냈어요`, { label: '달성으로 표시', run: () => void setGoalProgress(g as GoalRow, g.target) }, true)
        break
      }
    }
  }, [data.goals, data.links, skipGoals, notice, say])

  // 34 사용법: 첫 둘러보기 · 머리 ? 사용법 창
  const guide = useMapGuide(data.loaded, mode, () => setWholeN(0)) // 둘러보기는 프로젝트 화면 기준(34 §2)
  const onRecipe = (r: Recipe) => {
    if (r === 'morning') { applyMode('plan'); setFocusNow(true); return }
    applyMode(r === 'goal' ? 'review' : 'plan') // 34 §3: 해 보기 — 이번 주 확인은 성장 › 주간 점검
    if (r === 'split') openPlan(selected ?? undefined, whole ? {} : { makeProject: true }) // 31 §11·§12.4: 큰 일 = 같이 계획 짜기(모드 화면에선 프로젝트로)
  }
  const noTasks = data.loaded && data.allOpen === 0 && data.tasks.length === 0 && data.lists.filter((l) => l.kind !== 'inbox' && !l.archived_at).length === 0
  const setOpt = <K extends keyof MapOptions>(k: K, v: MapOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))
  const undoSnap = pop?.kind === 'more' ? loadApplySnapshot() : null
  const breakdownSnap = pop?.kind === 'more' ? loadBreakdownUndo() : null
  const planSnap = pop?.kind === 'more' && !plan ? loadPlanUndo() : null
  const revealTask = (id: string) => { setSelected(id); setReveal((r) => ({ id, n: (r?.n ?? 0) + 1 })) }
  /** 지도에서 그 노드로만 이동(상세는 안 연다 — 대화 칸이 옆에 있을 때) */
  const panTo = (id: string) => setReveal((r) => ({ id, n: (r?.n ?? 0) + 1 }))
  const openPlan = (taskId?: string, extra: { project?: { id: string; name: string }; makeProject?: boolean } = {}) => { setFocusNow(false); setPlan({ key: Date.now(), taskId, ...extra }) }
  const onPlanOpen: PlanOpen = (o = {}) => openPlan(o.taskId, { project: o.project, makeProject: o.makeProject })
  const [chatClose, setChatClose] = useState(0)
  const freshTimer = useRef(0)
  const addFresh = (tasks: string[], links: string[]) => {
    setFresh((m) => { const n = new Map(m); let i = 0; for (const id of tasks) n.set(id, i++); i = 0; for (const id of links) n.set(id, i++); return n })
    window.clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFresh(new Map()), 2600)
  }
  const undoPlan = (j: PlanJournal) => undoPlanSession(j, (ids) => taskActions.reopen(ids)).then((r) => toast.show(r.kept ? `계획을 되돌렸어요. 직접 고친 ${r.kept}개는 남겼어요` : '계획을 되돌렸어요'))
  const closePlan = (j: PlanJournal | null) => {
    setPlan(null); setLit(null); setPlanGoal(null)
    if (!j) return
    savePlanUndo(j)
    toast.show(j.title ? `'${j.title}' 계획을 짰어요` : '계획을 짰어요', async () => { await undoPlan(j) })
  }
  // 31 §10.2 모드를 고르면(또는 순간이 열면) 묶음을 한 번 덮어쓴다 — 그 뒤 보기·옵션은 자유
  const [todayCmd, setTodayCmd] = useState(0)
  const applyMode = useCallback((m: MapMode) => {
    if (m === 'review') { openReview(); return } // 성장 › 주간 점검
    if (m === 'tidy') { openTidy(); return } // 정리 화면
    const p = MODE_PRESET[m]
    setFocusProject(null)
    if (m !== 'plan') { setPlan(null); setLit(null); setPlanGoal(null) } // 대화 칸은 계획에서만(만든 것은 그대로)
    setOpts((o) => ({ ...o, showDone: p.showDone }))
    if (p.timeline) { tl.set('scale', p.timeline.scale); setTodayCmd((n) => n + 1) }
    setFocusNow(false)
  }, [setOpts, tl])
  useEffect(() => { if (todayCmd) tl.today() }, [todayCmd]) // eslint-disable-line react-hooks/exhaustive-deps
  // 31 §10.4 지도 열기 요청(순간 ①~④ · sprout://map 링크): 뜰 때 들고 있던 것 + 떠 있는 동안 오는 것
  const [focusReq, setFocusReq] = useState<string>()
  const applyIntent = useRef<(i: MapIntent) => void>(() => {})
  applyIntent.current = (i: MapIntent) => {
    if (i.mode) applyMode(i.mode)
    if (i.task) setFocusReq(i.task)
    if ((i.task && i.breakdown) || i.plan) openPlan(i.task)
    if (i.now) setFocusNow(true)
  }
  useEffect(() => {
    const first = takeMapIntent()
    if (first) applyIntent.current(first)
    const on = () => { const i = takeMapIntent(); if (i) applyIntent.current(i) }
    window.addEventListener(OPEN_MAP, on)
    return () => window.removeEventListener(OPEN_MAP, on)
  }, [])
  useEffect(() => {
    if (!focusReq || !data.loaded) return
    const t = window.setTimeout(() => { revealTask(focusReq); setFocusReq(undefined) }, 120) // 노드가 놓인 뒤
    return () => window.clearTimeout(t)
  }, [focusReq, data.loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  // `N` 키(지도에 초점, 입력칸 밖) = 지금 집중 켜기·끄기 [임시]
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const el = e.target as HTMLElement
      if (el.closest?.('input,textarea,select,[contenteditable],.app__detail') || document.querySelector('.popover,[aria-modal="true"]')) return
      e.preventDefault()
      setFocusNow((f) => !f)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const undoBreak = () => void undoBreakdown().then((r) => toast.show(!r ? '되돌릴 쪼개기가 없어요' : r.kept ? `쪼개기를 되돌렸어요. 직접 고친 ${r.kept}개는 남겼어요` : '쪼개기를 되돌렸어요'))

  return (
    <main className={`workspace map${reduced ? ' is-reduced' : ''}`}>
      <div className="map__main">
        {/* 2026-10-05: 제목 + 오른쪽 아이콘(⧉ 전체 지도 · 그래프⇄보드 · ? · ⋯) — 모드 탭 없음(프로젝트 한 화면) */}
        <header className="pane-header map-head">
          <h1 className="pane-header__title map-head__title">작업 지도</h1>
          <span className="map-tip" data-tip={whole ? '모드 화면으로' : '전체 지도 — 폴더 › 리스트 › 할 일 나무'}>
            <button className={`icon-btn map-whole${whole ? ' is-on' : ''}`} aria-label="전체 지도" aria-pressed={whole} onClick={() => { setWholeN(whole ? 0 : 1); setFocusProject(null) }}><MapIcon /></button>
          </span>
          {whole && mode === 'plan' && (
            <span className="map-tip" data-tip={view === 'board' ? '그래프로 보기' : '보드로 보기'}>
              <button className="icon-btn" aria-label={view === 'board' ? '그래프로 보기' : '보드로 보기'} onClick={() => setPlanView(view === 'board' ? 'graph' : 'board')}>
                {view === 'board' ? <Network /> : <Columns3 />}
              </button>
            </span>
          )}
          {whole && mode === 'plan' && !plan && (
            <span className="map-tip" data-tip="같이 계획 짜기">
              <button className="icon-btn pc-open" aria-label={`${buddy.name}와 같이 계획 짜기`} onClick={() => openPlan(selected ?? undefined)}>
                <BuddyAvatar buddy={buddy} stage={stage} size={22} />
              </button>
            </span>
          )}
          <MapGuideButton guide={guide} />
          <button className="icon-btn" aria-label="더 보기" onClick={(e) => setPop({ kind: 'more', anchor: e.currentTarget })}><MoreHorizontal /></button>
        </header>

        {!whole ? (
          <PlanHome selected={selected} onSelect={setSelected} onPlan={onPlanOpen} onTidy={openTidy} actions={taskActions} focusProject={focusProject}
            chatOpen={!!plan} onCloseChat={() => setChatClose((n) => n + 1)} />
        ) : <>
        {data.loaded && (
          <NowStrip data={data} actions={actions} focusNow={focusNow} onFocus={() => setFocusNow((f) => !f)} onReveal={revealTask}
            onMenu={(task, e) => setStripMenu({ task, point: { x: e.clientX, y: e.clientY } })} />
        )}


        {!data.loaded ? <div className="map-fill" /> : noTasks ? (
          <div className="map-empty">
            <Network className="map-empty__icon" />
            <p className="map-empty__title">정리할 할 일이 없어요</p>
            <p className="map-empty__hint">리스트를 만들고 할 일을 넣으면 폴더 › 리스트 › 할 일이 지도로 보여요</p>
            <div className="map-empty__acts">
              <button className="map-btn map-btn--primary" onClick={() => actions.editList()}>새 리스트</button>
              <button className="map-btn" onClick={onTasks}>할 일 목록 열기</button>
            </div>
          </div>
        ) : view === 'timeline' ? (
          <TimelineView data={data} actions={actions} links={linkActions} nav={tl} lists={lists} tags={tags} taskActions={taskActions} groupBy={opts.groupBy ?? 'list'} only={opts.lists} />
        ) : view === 'graph' ? (
          <MapGraph data={data} actions={actions} links={linkActions} onBlank={() => setEditing(null)} reveal={reveal} say={say} onGrowth={onGrowth} />
        ) : (
          <MapBoard data={data} actions={actions} onReorderFolders={(ids) => void run(...reorderFoldersStmts(data.folders, ids))} reveal={reveal} say={say} onGrowth={onGrowth} />
        )}

        </>}
        {notice && (
          <div className="map-notice" key={notice.id} role="status">
            <Sparkles className="map-banner__icon" /><span>{notice.text}</span>
            {notice.action && <button className="map-btn map-btn--text" onClick={() => { notice.action!.run(); setNotice(undefined) }}>{notice.action.label}</button>}
            <button className="icon-btn map-notice__close" aria-label="닫기" onClick={() => setNotice(undefined)}><X /></button>
          </div>
        )}
      </div>

      {plan && (
        <PlanChat req={plan} lists={data.lists} aiOk={aiOk} actions={taskActions} closeSignal={chatClose}
          onLight={setLit} onReveal={panTo} onFresh={addFresh} onGoal={setPlanGoal} onClose={closePlan} onProject={(id) => { if (!whole) setFocusProject((f) => ({ id, n: (f?.n ?? 0) + 1 })) }}
          onUndone={(r) => { setPlan(null); setLit(null); setPlanGoal(null); toast.show(r.kept ? `계획을 되돌렸어요. 직접 고친 ${r.kept}개는 남겼어요` : '계획을 되돌렸어요') }} />
      )}
      {selected && (
        <div className="app__detail map__detail" style={{ width: detailW }}>
          <Resizer side="left" width={detailW} min={DETAIL.min} max={DETAIL.max} defaultWidth={DETAIL.def} onChange={setDetailW} />
          <DetailPane taskId={selected} lists={lists} tags={tags} actions={taskActions} onSelect={setSelected} onClose={() => setSelected(null)} onHide={() => setSelected(null)} />
        </div>
      )}

      {pop?.kind === 'more' && (
        <Popover anchor={pop.anchor} align="end" width={230} onClose={() => setPop(undefined)} className="menu">
          <MenuItem icon={<ListPlus />} label="새 리스트" onClick={() => { setPop(undefined); actions.editList() }} />
          <MenuItem icon={<FolderPlus />} label="새 폴더" onClick={() => { setPop(undefined); actions.editFolder() }} />
          <div className="menu__divider" />
          {/* 보기 옵션(예전 거름틀) — 묶기·기간은 모드가 정해서 뺐다 */}
          {view === 'timeline' && <TimelineScaleItems nav={tl} close={() => setPop(undefined)} />}
          {!whole && <MenuItem label="자동으로 프로젝트 만들기" onClick={() => { const on = !autoProjectsOn(); projectStore.set({ auto: on }); setPop(undefined); toast.show(on ? '자동으로 프로젝트를 만들어요' : '자동으로 프로젝트를 만들지 않아요. 있는 프로젝트는 그대로예요') }} trail={autoProjectsOn() ? <Check className="map-check" /> : undefined} />}
          {!whole && <div className="menu__divider" />}
          <MenuItem label="완료한 항목 보이기" onClick={() => setOpt('showDone', !userOpts.showDone)} trail={userOpts.showDone ? <Check className="map-check" /> : undefined} />
          <MenuItem label="날짜 없는 항목 보이기" onClick={() => setOpt('showNoDate', !userOpts.showNoDate)} trail={userOpts.showNoDate ? <Check className="map-check" /> : undefined} />
          {view === 'timeline' && <TimelineOptionItems nav={tl} />}
          {view === 'graph' && <MenuItem label="메모 보이기" onClick={() => setOpt('showMemos', !userOpts.showMemos)} trail={userOpts.showMemos ? <Check className="map-check" /> : undefined} />}
          <SubMenu label="범위" trail={userOpts.lists ? `${userOpts.lists.length}개 리스트` : '모든 리스트'} width={220}>
            <MenuItem label="모든 리스트" onClick={() => setOpt('lists', null)} trail={!userOpts.lists ? <Check className="map-check" /> : undefined} />
            <div className="menu__divider" />
            {lists.map((l) => {
              const on = !!userOpts.lists?.includes(l.id)
              return <MenuItem key={l.id} label={listLabel(l)} onClick={() => {
                const cur = userOpts.lists ?? []
                const next = on ? cur.filter((x) => x !== l.id) : [...cur, l.id]
                setOpt('lists', next.length ? next : null)
              }} trail={on ? <Check className="map-check" /> : undefined} />
            })}
          </SubMenu>
          {view === 'timeline' && <TimelineMoreItems nav={tl} close={() => setPop(undefined)} />}
          {(undoSnap || breakdownSnap || planSnap) && <div className="menu__divider" />}
          {undoSnap && <MenuItem icon={<RotateCcw />} label="기본함 정리 되돌리기" onClick={() => { setPop(undefined); void undoApply().then((ok) => toast.show(ok ? '기본함 정리를 되돌렸어요' : '되돌릴 정리가 없어요')) }} />}
          {planSnap && <MenuItem icon={<RotateCcw />} label="같이 짠 계획 되돌리기" onClick={() => { setPop(undefined); void undoPlan(planSnap) }} />}
          {breakdownSnap && <MenuItem icon={<RotateCcw />} label="AI 쪼개기 되돌리기" onClick={() => { setPop(undefined); undoBreak() }} />}
        </Popover>
      )}
      {stripMenu && <CardMenu task={stripMenu.task} data={data} actions={actions} point={stripMenu.point} onClose={() => setStripMenu(undefined)} />}
      {editor && <OrganizationEditor kind={editor.kind} item={editor.item} folderId={editor.folderId} folders={data.folders} onClose={() => setEditor(undefined)} onSaved={() => setEditor(undefined)} />}
      {confirm && (
        <Dialog label={confirm.kind === 'list' ? '리스트 삭제' : '폴더 해제'} className="map-dialog" onClose={() => setConfirm(undefined)}>
          <h2>{confirm.kind === 'list' ? `'${confirm.list.name}' 리스트를 삭제할까요?` : `'${folderView(confirm.folder.name).name}' 폴더를 해제할까요?`}</h2>
          <p>{confirm.kind === 'list' ? '리스트의 할 일을 휴지통으로 옮겨요. 리스트는 보관 목록에서 복원할 수 있어요.' : '폴더만 없어지고 안의 리스트는 그대로 남아요.'}</p>
          <footer>
            <button className="map-btn" onClick={() => setConfirm(undefined)}>취소</button>
            <button className="map-btn map-btn--danger" data-autofocus onClick={() => {
              const c = confirm
              setConfirm(undefined)
              void (c.kind === 'list' ? deleteOrganization('list', c.list.id) : deleteOrganization('folder', c.folder.id))
                .then(() => toast.show(c.kind === 'list' ? '리스트를 삭제했어요' : '폴더를 해제했어요'))
                .catch((e) => toast.show(String(e instanceof Error ? e.message : e)))
            }}>{confirm.kind === 'list' ? '삭제' : '해제'}</button>
          </footer>
        </Dialog>
      )}
      <MapGuidePanel guide={guide} aiOk={aiOk} onTry={onRecipe} />
      <MapTour guide={guide} />
    </main>
  )
}
