// 14 작업 지도 v2.0 + 31 v3 — 머리(그래프·보드·타임라인 · 기간 · ⚡ 지금 · ✦ 기본함 정리 · 거름틀 · ⋯), AI 제안 카드, 지금 띠, 보기, 상세 패널(02와 같은 컴포넌트).
// 내 폴더 › 리스트 › 할 일을 틱틱처럼 직접 고친다. AI는 기본함 할 일에 대한 제안만(30 §B).
import { Check, Filter, FolderPlus, HelpCircle, ListPlus, MoreHorizontal, Network, RotateCcw, Sparkles, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { localModels } from '../../../../shared/assistant'
import { setGoalProgress, type GoalRow } from '../../data/growth'
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
import { InboxSuggestCard, openInboxOrganize } from '../listSuggest/ListSuggest'
import { OrganizationEditor } from '../OrganizationEditor'
import { MenuItem, Popover, SubMenu } from '../Popover'
import { Resizer } from '../Resizer'
import { useToast } from '../Toast'
import { MapBoard } from './MapBoard'
import { MapGraph, type LinkActions } from './MapGraph'
import { TimelineHeadControls, TimelineMoreItems, TimelineOptionItems, useTimelineNav } from './TimelineControls'
import { TimelineView } from './TimelineView'
import { BreakdownDialog } from './BreakdownDialog'
import { NowStrip } from './NowStrip'
import { CardMenu } from './parts'
import type { MapTask } from '../../data/map'
import type { MapActions } from './parts'
import { DEFAULT_OPTIONS, useMapData, useStored, useStoredValue, type MapOptions } from './useMapData'
import './map.css'

const DETAIL = { def: 298, min: 260, max: 560 }
type Notice = { id: number; text: string; action?: { label: string; run: () => void }; sticky?: boolean }
type Confirm = { kind: 'list'; list: MapList } | { kind: 'folder'; folder: MapFolder }

export function WorkMapView({ lists, onTasks, onGrowth }: { lists: ListRow[]; onOpen: (taskId: string) => void; onTasks: () => void; onGrowth?: () => void }) {
  const toast = useToast()
  const taskActions = useTaskActions()
  const tags = useQuery<TagRow>('SELECT id, name, color FROM tags ORDER BY sort_order') ?? []
  const [view, setView] = useStoredValue<'graph' | 'board' | 'timeline'>('view', 'graph')
  const [opts, setOpts] = useStored<MapOptions>('options', DEFAULT_OPTIONS)
  const data = useMapData(opts, view)
  const tl = useTimelineNav() // 31 §2 타임라인 배율·막대 색·할일 정렬 칸(기기 기억 sprout.map.timeline)
  const [selected, setSelected] = useState<string | null>(null)
  const [detailW, setDetailW] = useState(DETAIL.def)
  const [editing, setEditing] = useState<string | null>(null)
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<Set<string>>(new Set())
  // 31 §1 지금 할 일: ⚡ 집중(기기 기억 안 함 — 지도를 다시 열면 꺼짐) · 띠 접기(기기 기억 sprout.map.nowStrip) · 알약 클릭 이동
  const [focusNow, setFocusNow] = useState(false)
  const [stripFolded, setStripFolded] = useStoredValue<0 | 1>('nowStrip', 0)
  const [reveal, setReveal] = useState<{ id: string; n: number }>()
  const [stripMenu, setStripMenu] = useState<{ task: MapTask; point: { x: number; y: number } }>()
  const [breakdownId, setBreakdownId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>()
  const [editor, setEditor] = useState<{ kind: 'list' | 'folder'; item?: OrganizationItem; folderId?: string }>()
  const [pop, setPop] = useState<{ kind: 'filter' | 'more'; anchor: HTMLElement }>()
  const [help, setHelp] = useState(false)
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
    breakdown: (id) => setBreakdownId(id),
    linkGoal: async (taskId, goalId) => {
      const undo = await moveGoalLink(taskId, goalId)
      if (!undo) return
      const t = data.byId.get(taskId)
      const g = goalId ? data.goals.find((x) => x.id === goalId) : undefined
      toast.show(g ? `'${t?.title ?? ''}'${eulReul(t?.title ?? '').slice((t?.title ?? '').length)} '${g.title}'에 연결했어요` : '목표 연결을 끊었어요', undo)
    }
  }), [data, taskActions, toast, say, editing, checking, selected, flash, focusNow])

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

  const aiTitle = aiOk === false ? '지금은 AI를 쓸 수 없어요. 리스트는 직접 만들어 옮길 수 있어요.' : '기본함 정리 — AI가 리스트를 제안해요'
  const noTasks = data.loaded && data.allOpen === 0 && data.tasks.length === 0 && data.lists.filter((l) => l.kind !== 'inbox' && !l.archived_at).length === 0
  const setOpt = <K extends keyof MapOptions>(k: K, v: MapOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))
  const undoSnap = pop?.kind === 'more' ? loadApplySnapshot() : null
  const breakdownSnap = pop?.kind === 'more' ? loadBreakdownUndo() : null
  const revealTask = (id: string) => { setSelected(id); setReveal((r) => ({ id, n: (r?.n ?? 0) + 1 })) }
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
    <main className="workspace map">
      <div className="map__main">
        <header className="pane-header map-head">
          <h1 className="pane-header__title map-head__title">
            작업 지도
            <span className="map-seg" role="tablist" aria-label="보기">
              <button role="tab" aria-selected={view === 'graph'} className={view === 'graph' ? 'is-on' : ''} onClick={() => setView('graph')}>그래프</button>
              <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')}>보드</button>
              <button role="tab" aria-selected={view === 'timeline'} className={view === 'timeline' ? 'is-on' : ''} onClick={() => setView('timeline')}>타임라인</button>
            </span>
          </h1>
          {view === 'graph' && opts.groupBy === 'goal' && (
            <span className="map-seg map-seg--period" aria-label="목표 주">
              <button className={opts.goalWeek !== 'next' ? 'is-on' : ''} onClick={() => setOpt('goalWeek', 'this')}>이번 주</button>
              <button className={opts.goalWeek === 'next' ? 'is-on' : ''} onClick={() => setOpt('goalWeek', 'next')}>다음 주</button>
            </span>
          )}
          {view === 'graph' && opts.groupBy !== 'goal' && (
            <span className="map-seg map-seg--period" aria-label="기간">
              <button className={opts.period === 'week' ? 'is-on' : ''} onClick={() => setOpt('period', 'week')}>이번 주</button>
              <button className={opts.period === 'all' ? 'is-on' : ''} onClick={() => setOpt('period', 'all')}>전체</button>
            </span>
          )}
          {view === 'timeline' && <TimelineHeadControls nav={tl} />}
          <span className="map-tip" data-tip={`지금 할 수 있는 일만 밝게 (${data.strip.total}) · N`}>
            <button className={`icon-btn map-now-btn${focusNow ? ' is-on' : ''}`} aria-pressed={focusNow} aria-label="지금 할 수 있는 일만 밝게" onClick={() => setFocusNow((f) => !f)}>
              <Zap />{stripFolded && data.strip.total > 0 ? <span className="map-now-btn__dot" /> : null}
            </button>
          </span>
          <span className="map-tip" data-tip={aiTitle}>
            <button className="icon-btn" aria-label={aiTitle} disabled={aiOk === false} onClick={openInboxOrganize}><Sparkles /></button>
          </span>
          <button className="icon-btn" aria-label="보기 옵션" onClick={(e) => setPop({ kind: 'filter', anchor: e.currentTarget })}><Filter /></button>
          <button className="icon-btn" aria-label="더 보기" onClick={(e) => setPop({ kind: 'more', anchor: e.currentTarget })}><MoreHorizontal /></button>
        </header>

        <div className="map-suggest"><InboxSuggestCard compact /></div>
        {data.loaded && !stripFolded && (
          <NowStrip data={data} actions={actions} onReveal={revealTask} onMore={() => setFocusNow(true)} onFold={() => setStripFolded(1)}
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

        {notice && (
          <div className="map-notice" key={notice.id} role="status">
            <Sparkles className="map-banner__icon" /><span>{notice.text}</span>
            {notice.action && <button className="map-btn map-btn--text" onClick={() => { notice.action!.run(); setNotice(undefined) }}>{notice.action.label}</button>}
            <button className="icon-btn map-notice__close" aria-label="닫기" onClick={() => setNotice(undefined)}><X /></button>
          </div>
        )}
      </div>

      {selected && (
        <div className="app__detail map__detail" style={{ width: detailW }}>
          <Resizer side="left" width={detailW} min={DETAIL.min} max={DETAIL.max} defaultWidth={DETAIL.def} onChange={setDetailW} />
          <DetailPane taskId={selected} lists={lists} tags={tags} actions={taskActions} onSelect={setSelected} onClose={() => setSelected(null)} />
        </div>
      )}

      {pop?.kind === 'filter' && (
        <Popover anchor={pop.anchor} align="end" width={230} onClose={() => setPop(undefined)} className="menu">
          <MenuItem label="묶기: 리스트" onClick={() => setOpt('groupBy', 'list')} trail={opts.groupBy !== 'goal' ? <Check className="map-check" /> : undefined} />
          <MenuItem label="묶기: 목표" onClick={() => setOpt('groupBy', 'goal')} trail={opts.groupBy === 'goal' ? <Check className="map-check" /> : undefined} />
          <div className="menu__divider" />
          <MenuItem label="완료한 항목 보이기" onClick={() => setOpt('showDone', !opts.showDone)} trail={opts.showDone ? <Check className="map-check" /> : undefined} />
          <MenuItem label="날짜 없는 항목 보이기" onClick={() => setOpt('showNoDate', !opts.showNoDate)} trail={opts.showNoDate ? <Check className="map-check" /> : undefined} />
          {view === 'timeline' && <TimelineOptionItems nav={tl} />}
          {view === 'graph' && <MenuItem label="메모 보이기" onClick={() => setOpt('showMemos', !opts.showMemos)} trail={opts.showMemos ? <Check className="map-check" /> : undefined} />}
          <div className="menu__divider" />
          <MenuItem label="범위: 모든 리스트" onClick={() => setOpt('lists', null)} trail={!opts.lists ? <Check className="map-check" /> : undefined} />
          <SubMenu label="범위: 고른 리스트" trail={opts.lists ? `${opts.lists.length}개` : undefined} width={220}>
            {lists.map((l) => {
              const on = !!opts.lists?.includes(l.id)
              return <MenuItem key={l.id} label={listLabel(l)} onClick={() => {
                const cur = opts.lists ?? []
                const next = on ? cur.filter((x) => x !== l.id) : [...cur, l.id]
                setOpt('lists', next.length ? next : null)
              }} trail={on ? <Check className="map-check" /> : undefined} />
            })}
          </SubMenu>
        </Popover>
      )}
      {pop?.kind === 'more' && (
        <Popover anchor={pop.anchor} align="end" width={230} onClose={() => setPop(undefined)} className="menu">
          <MenuItem icon={<ListPlus />} label="새 리스트" onClick={() => { setPop(undefined); actions.editList() }} />
          <MenuItem icon={<FolderPlus />} label="새 폴더" onClick={() => { setPop(undefined); actions.editFolder() }} />
          <div className="menu__divider" />
          <MenuItem icon={<Sparkles />} label="기본함 정리" disabled={aiOk === false} onClick={() => { setPop(undefined); openInboxOrganize() }} />
          <MenuItem icon={<RotateCcw />} label="기본함 정리 되돌리기" disabled={!undoSnap} onClick={() => { setPop(undefined); void undoApply().then((ok) => toast.show(ok ? '기본함 정리를 되돌렸어요' : '되돌릴 정리가 없어요')) }} />
          <MenuItem icon={<RotateCcw />} label="AI 쪼개기 되돌리기" disabled={!breakdownSnap} onClick={() => { setPop(undefined); undoBreak() }} />
          <div className="menu__divider" />
          {view === 'timeline' && <TimelineMoreItems nav={tl} close={() => setPop(undefined)} />}
          <MenuItem icon={<HelpCircle />} label="작업 지도 도움말" onClick={() => { setPop(undefined); setHelp(true) }} />
        </Popover>
      )}
      {stripMenu && <CardMenu task={stripMenu.task} data={data} actions={actions} point={stripMenu.point} onClose={() => setStripMenu(undefined)} />}
      {breakdownId && (
        <BreakdownDialog taskId={breakdownId} lists={data.lists} aiOk={aiOk} onClose={() => setBreakdownId(null)}
          onAddSubtask={(pid) => void taskActions.addSubtask(pid).then(() => setSelected(pid))}
          onDone={(snap, n) => {
            setBreakdownId(null)
            setSelected(snap.parentId)
            toast.show(`'${snap.parentTitle}'${eulReul(snap.parentTitle).slice(snap.parentTitle.length)} ${n}단계로 쪼갰어요`, async () => { await undoBreakdown(snap) })
          }} />
      )}
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
      {help && (
        <Dialog label="작업 지도 도움말" className="map-dialog" onClose={() => setHelp(false)}>
          <h2>작업 지도 도움말</h2>
          <ul>
            <li>내 폴더 › 리스트 › 할 일을 한눈에 봐요. 사이드바의 리스트와 같은 것이에요.</li>
            <li>할 일 카드를 다른 리스트로 끌면 그 리스트로 옮겨져요. 리스트를 폴더에 끌어 넣거나 뿌리(나의 할 일)에 놓으면 폴더 밖으로 나와요.</li>
            <li>이름을 두 번 누르면 바로 고칠 수 있어요. ⋯ 메뉴에서 편집(아이콘·색)·폴더로 옮기기·삭제.</li>
            <li>✦ 기본함 정리: AI가 기본함 할 일을 보고 리스트를 제안해요. 확인하고 [이대로 만들기]를 눌러야 만들어져요.</li>
            <li>그래프에서 할 일 아래 점을 끌어 다른 할 일에 놓으면 '먼저 해야 함' 선, 목표(🎯) 위 점을 끌어 할 일에 놓으면 목표 연결.</li>
          </ul>
          <footer><button className="map-btn map-btn--primary" data-autofocus onClick={() => setHelp(false)}>확인</button></footer>
        </Dialog>
      )}
    </main>
  )
}
