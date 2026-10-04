// 14 작업 지도 v1.2 — 머리(그래프·보드 · 기간 · ✦ · 거름틀 · ⋯), 알림 띠, 그래프/보드, 상세 패널(02와 같은 컴포넌트)
import { Check, Filter, HelpCircle, MoreHorizontal, Network, Sparkles, Square, Trash2, Unlock, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { localModels } from '../../../../shared/assistant'
import { isUnavailable } from '../../data/ai'
import { setGoalProgress, type GoalRow } from '../../data/growth'
import {
  acceptLink, clearAiClassification, connect, createAreaStmts, deleteAreaStmts, dropLink, mergeAreaStmts, placeTaskStmts,
  readMap, releaseUserPlacements, renameAreaStmts, reorganize, undoReorganize, type MapArea
} from '../../data/map'
import { createTask, run, update } from '../../data/mutations'
import { useQuery } from '../../data/useQuery'
import type { ListRow, TagRow } from '../../data/types'
import { listLabel } from '../../data/types'
import { useTaskActions } from '../../lib/taskActions'
import { eulReul } from '../../lib/josa'
import { DetailPane } from '../DetailPane'
import { Dialog } from '../Dialog'
import { MenuItem, Popover, SubMenu } from '../Popover'
import { Resizer } from '../Resizer'
import { useToast } from '../Toast'
import { MapBoard } from './MapBoard'
import { MapGraph, type LinkActions } from './MapGraph'
import type { MapActions } from './parts'
import { DEFAULT_OPTIONS, useMapData, useStored, useStoredValue, type MapOptions } from './useMapData'
import './map.css'

const DETAIL = { def: 298, min: 260, max: 560 }
type Banner = { kind: 'done'; count: number; runId: string; stopped?: boolean } | { kind: 'running'; done: number; total: number }
type Notice = { id: number; text: string; action?: { label: string; run: () => void }; sticky?: boolean }
// ✦ 다시 정리는 화면을 떠나도 계속 돈다 → 진행 띠·멈추기를 화면 밖(모듈)에 둬서 돌아와도 보이게(안 그러면 ✦를 또 눌러 겹쳐 돌고 되돌리기 기준이 바뀐다)
const organizing: { banner?: Banner; stop?: AbortController; subs: Set<(b: Banner | undefined) => void> } = { subs: new Set() }
const setOrganizing = (b: Banner | undefined) => { organizing.banner = b; organizing.subs.forEach((f) => f(b)) }

export function WorkMapView({ lists, onTasks }: { lists: ListRow[]; onOpen: (taskId: string) => void; onTasks: () => void }) {
  const toast = useToast()
  const taskActions = useTaskActions()
  const tags = useQuery<TagRow>('SELECT id, name, color FROM tags ORDER BY sort_order') ?? []
  const [view, setView] = useStoredValue<'graph' | 'board'>('view', 'graph')
  const [opts, setOpts] = useStored<MapOptions>('options', DEFAULT_OPTIONS)
  const data = useMapData(opts, view)
  const [selected, setSelected] = useState<string | null>(null)
  const [detailW, setDetailW] = useState(DETAIL.def)
  const [editing, setEditing] = useState<string | null>(null)
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [banner, setBannerState] = useState<Banner | undefined>(organizing.banner)
  useEffect(() => { organizing.subs.add(setBannerState); return () => { organizing.subs.delete(setBannerState) } }, [])
  const setBanner = setOrganizing
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<MapArea>()
  const [pop, setPop] = useState<{ kind: 'filter' | 'more'; anchor: HTMLElement }>()
  const [help, setHelp] = useState(false)
  const [notice, setNotice] = useState<Notice>()
  const [aiOk, setAiOk] = useState<boolean | null>(null)
  const [skipIntro, setSkipIntro] = useState(false)
  const [newAreaKey, setNewAreaKey] = useState(0)
  const stop = { get current() { return organizing.stop }, set current(c: AbortController | undefined) { organizing.stop = c } }

  // AI를 쓸 수 있는지(맥미니 Ollama) — 처음·앱 포커스 때 확인
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

  const changed = useMemo(() => {
    if (banner?.kind !== 'done') return new Set<string>()
    return new Set(data.taskAreas.filter((r) => r.run_id === banner.runId).map((r) => r.task_id))
  }, [banner, data.taskAreas])

  const actions: MapActions = useMemo(() => ({
    open: (id) => setSelected(id),
    complete: (id) => {
      setChecking((s) => new Set(s).add(id))
      // 체크 후 0.4초 뒤 사라진다(14 §3)
      window.setTimeout(async () => {
        await taskActions.complete([id])
        setChecking((s) => { const n = new Set(s); n.delete(id); return n })
        // 앞 할 일을 끝내면 뒤 할 일 안내
        const { links } = await readMap()
        const next = links.filter((l) => l.kind === 'sequence' && l.state === 'accepted' && l.from_id === id)
        for (const l of next) {
          const others = links.filter((x) => x.kind === 'sequence' && x.state === 'accepted' && x.to_id === l.to_id && x.from_id !== id)
          const openOthers = others.filter((x) => data.byId.get(x.from_id)?.status === 0)
          const t = data.byId.get(l.to_id)
          if (t && t.status === 0 && !openOthers.length) { say(`이제 '${t.title}'${eulReul(t.title).slice(t.title.length)} 시작할 수 있어요`); break }
        }
      }, 400)
    },
    place: async (taskId, areaId) => { await run(...placeTaskStmts(data.taskAreas, taskId, areaId)) },
    createArea: async (name, parentId = null) => {
      const r = createAreaStmts(data.areas, name, parentId)
      if (!r) return null
      await run(...r.stmts)
      setSkipIntro(true)
      return r.id
    },
    rename: async (id, name) => {
      const s = renameAreaStmts(id, name)
      if (!s) return false
      await run(...s)
      setEditing(null)
      return true
    },
    merge: async (fromId, intoId) => {
      const from = data.areas.find((a) => a.id === fromId)
      const into = data.areas.find((a) => a.id === intoId)
      await run(...mergeAreaStmts(data.areas, data.taskAreas, fromId, intoId))
      if (from && into) toast.show(`'${from.name}'${eulReul(from.name).slice(from.name.length)} '${into.name}'에 합쳤어요`)
    },
    remove: (area) => {
      if (!area.parent_id) { setConfirm(area); return }
      void run(...deleteAreaStmts(data.areas, data.taskAreas, area.id)).then(() => toast.show('주제를 지웠어요. 할 일은 영역 바로 아래로 옮겼어요'))
    },
    archive: async (id, on) => { await run(update('map_areas', id, { archived_at: on ? new Date().toISOString() : null })); if (on) toast.show('주제를 보관했어요. 거름틀에서 다시 볼 수 있어요') },
    addTask: async (areaId, title) => {
      const list = lists.find((l) => l.kind === 'inbox') ?? lists[0]
      if (!list) return
      const id = await createTask({ title, list_id: list.id })
      const { taskAreas } = await readMap()
      await run(...placeTaskStmts(taskAreas, id, areaId))
    },
    trash: (id) => taskActions.trash([id]).then(() => { if (selected === id) setSelected(null) }),
    editing, setEditing, checking, selected, changed, flash
  }), [data, taskActions, lists, toast, say, editing, checking, selected, changed, flash])

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
      if (g.status === 'achieved' || skipGoals.has(g.id)) continue
      const linked = data.links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.from_id === g.id)
      if (linked.length && linked.every((l) => l.to_status === 1)) {
        setSkipGoals((s) => new Set(s).add(g.id))
        say(`'${g.title}'에 연결된 할 일을 다 끝냈어요`, { label: '달성으로 표시', run: () => void setGoalProgress(g as GoalRow, g.target) }, true)
        break
      }
    }
  }, [data.goals, data.links, skipGoals, notice, say])

  // ✦ AI로 다시 정리
  const organize = async () => {
    if (banner?.kind === 'running') return
    const ctrl = new AbortController()
    stop.current = ctrl
    setBanner({ kind: 'running', done: 0, total: 0 })
    try {
      const r = await reorganize({ signal: ctrl.signal, onProgress: (done, total) => setBanner({ kind: 'running', done, total }) })
      setBanner({ kind: 'done', count: r.count, runId: r.runId, stopped: ctrl.signal.aborted })
      setSkipIntro(true)
    } catch (e) {
      if (ctrl.signal.aborted) { setBanner(undefined); return }
      setBanner(undefined)
      if (isUnavailable(e)) { setAiOk(false); toast.show('지금은 AI를 쓸 수 없어요. 직접 영역을 만들어 정리할 수 있어요.') }
      else toast.show('AI 정리에 실패했어요. 잠시 뒤 다시 시도해 주세요.')
    }
  }
  const undo = async () => {
    setBanner(undefined)
    if (await undoReorganize()) toast.show('정리 전으로 되돌렸어요')
  }
  const showChanged = () => {
    setFlash(new Set(changed))
    window.setTimeout(() => setFlash(new Set()), 2000)
  }

  const aiTitle = aiOk === false ? '지금은 AI를 쓸 수 없어요. 직접 영역을 만들어 정리할 수 있어요.' : 'AI로 다시 정리'
  const firstRun = data.loaded && !skipIntro && data.areas.length === 0 && data.allOpen > 0
  const noTasks = data.loaded && data.allOpen === 0 && data.tasks.length === 0 && data.areas.length === 0
  const setOpt = <K extends keyof MapOptions>(k: K, v: MapOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))

  return (
    <main className="workspace map">
      <div className="map__main">
        <header className="pane-header map-head">
          <h1 className="pane-header__title map-head__title">
            작업 지도
            <span className="map-seg" role="tablist" aria-label="보기">
              <button role="tab" aria-selected={view === 'graph'} className={view === 'graph' ? 'is-on' : ''} onClick={() => setView('graph')}>그래프</button>
              <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')}>보드</button>
            </span>
          </h1>
          {view === 'graph' && (
            <span className="map-seg map-seg--period" aria-label="기간">
              <button className={opts.period === 'week' ? 'is-on' : ''} onClick={() => setOpt('period', 'week')}>이번 주</button>
              <button className={opts.period === 'all' ? 'is-on' : ''} onClick={() => setOpt('period', 'all')}>전체</button>
            </span>
          )}
          <span className="map-tip" data-tip={aiTitle}>
            <button className={`icon-btn${banner?.kind === 'running' ? ' is-spinning' : ''}`} aria-label={aiTitle} disabled={aiOk === false || banner?.kind === 'running'} onClick={() => void organize()}><Sparkles /></button>
          </span>
          <button className="icon-btn" aria-label="보기 옵션" onClick={(e) => setPop({ kind: 'filter', anchor: e.currentTarget })}><Filter /></button>
          <button className="icon-btn" aria-label="더 보기" onClick={(e) => setPop({ kind: 'more', anchor: e.currentTarget })}><MoreHorizontal /></button>
        </header>

        {banner?.kind === 'running' && (
          <div className="map-banner"><Sparkles className="map-banner__icon" />{banner.total ? `할 일 ${banner.total}개를 정리하는 중…` : '정리할 할 일을 모으는 중…'}{banner.total > 0 && <span className="map-banner__meta">{banner.done}/{banner.total}</span>}
            <span className="map-banner__acts"><button className="map-btn" onClick={() => stop.current?.abort()}><Square />멈추기</button></span></div>
        )}
        {banner?.kind === 'done' && (
          <div className="map-banner"><Sparkles className="map-banner__icon" />{banner.stopped ? `멈췄어요. 할 일 ${banner.count}개까지 분류했어요.` : `할 일 ${banner.count}개를 분류했어요.`} 직접 옮긴 항목은 그대로 뒀어요.
            <span className="map-banner__acts">
              <button className="map-btn map-btn--text" onClick={showChanged} disabled={!changed.size}>바뀐 것 보기</button>
              <button className="map-btn" onClick={() => void undo()}>되돌리기</button>
              <button className="icon-btn map-banner__close" aria-label="닫기" onClick={() => setBanner(undefined)}><X /></button>
            </span>
          </div>
        )}

        {!data.loaded ? <div className="map-fill" /> : noTasks ? (
          <div className="map-empty">
            <Network className="map-empty__icon" />
            <p className="map-empty__title">정리할 할 일이 없어요</p>
            <div className="map-empty__acts"><button className="map-btn" onClick={onTasks}>할 일 목록 열기</button></div>
          </div>
        ) : firstRun ? (
          <div className="map-empty">
            <Network className="map-empty__icon" />
            <p className="map-empty__title">할 일을 영역별로 한눈에 보여 드려요</p>
            <p className="map-empty__hint">학교·회사·개인처럼 AI가 나눠 드리고, 직접 고칠 수도 있어요</p>
            <div className="map-empty__acts">
              <span className="map-tip" data-tip={aiOk === false ? aiTitle : undefined}><button className="map-btn map-btn--primary" disabled={aiOk === false || banner?.kind === 'running'} onClick={() => void organize()}>AI로 정리하기</button></span>
              <button className="map-btn" onClick={() => { setSkipIntro(true); setView('board'); setNewAreaKey((k) => k + 1) }}>직접 영역 만들기</button>
            </div>
          </div>
        ) : view === 'graph' ? (
          <MapGraph data={data} actions={actions} links={linkActions} onBlank={() => setEditing(null)} />
        ) : (
          <MapBoard key={newAreaKey} data={data} actions={actions} autoNewArea={newAreaKey > 0} onReorder={(ids) => void run(...ids.map((id, i) => update('map_areas', id, { sort_order: i + 1 })))} />
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
          <MenuItem label="완료한 항목 보이기" onClick={() => setOpt('showDone', !opts.showDone)} trail={opts.showDone ? <Check className="map-check" /> : undefined} />
          <MenuItem label="날짜 없는 항목 보이기" onClick={() => setOpt('showNoDate', !opts.showNoDate)} trail={opts.showNoDate ? <Check className="map-check" /> : undefined} />
          <MenuItem label="보관한 주제 보이기" onClick={() => setOpt('showArchived', !opts.showArchived)} trail={opts.showArchived ? <Check className="map-check" /> : undefined} />
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
          <MenuItem icon={<Trash2 />} label="AI 분류 모두 지우기" onClick={() => { setPop(undefined); void clearAiClassification().then(() => toast.show('AI 분류를 지웠어요. 직접 옮긴 것은 남겨 뒀어요')) }} />
          <MenuItem icon={<Unlock />} label="직접 옮긴 것도 AI에 맡기기" onClick={() => { setPop(undefined); void releaseUserPlacements().then(() => toast.show('다음 정리부터 AI가 함께 정리해요')) }} />
          <div className="menu__divider" />
          <MenuItem icon={<HelpCircle />} label="작업 지도 도움말" onClick={() => { setPop(undefined); setHelp(true) }} />
        </Popover>
      )}
      {confirm && (
        <Dialog label="영역 삭제" className="map-dialog" onClose={() => setConfirm(undefined)}>
          <h2>'{confirm.name}' 영역을 삭제할까요?</h2>
          <p>안의 세부 주제도 함께 지워져요. 할 일은 지우지 않고 미분류로 옮겨요.</p>
          <footer>
            <button className="map-btn" onClick={() => setConfirm(undefined)}>취소</button>
            <button className="map-btn map-btn--danger" data-autofocus onClick={() => { const a = confirm; setConfirm(undefined); void run(...deleteAreaStmts(data.areas, data.taskAreas, a.id)).then(() => toast.show('영역을 삭제했어요. 할 일은 미분류로 옮겼어요')) }}>삭제</button>
          </footer>
        </Dialog>
      )}
      {help && (
        <Dialog label="작업 지도 도움말" className="map-dialog" onClose={() => setHelp(false)}>
          <h2>작업 지도 도움말</h2>
          <ul>
            <li>새 할 일은 AI가 영역 › 세부 주제로 자동으로 나눠요. 애매하면 미분류에 두고 '확인 필요'를 붙여요.</li>
            <li>카드를 끌어 다른 영역·주제로 옮기면 📌 직접 옮긴 항목이 되고, AI가 다시 정리해도 그대로예요.</li>
            <li>그래프에서 할 일 아래 점을 끌어 다른 할 일에 놓으면 '먼저 해야 함' 선이 생겨요. 선을 누르고 Delete = 끊기.</li>
            <li>목표(🎯) 위의 점을 끌어 할 일에 놓으면 목표 연결. 연결된 할 일을 다 끝내면 달성을 제안해요.</li>
            <li>영역을 두 번 누르면 그 영역만 크게 봐요. Esc = 전체.</li>
          </ul>
          <footer><button className="map-btn map-btn--primary" data-autofocus onClick={() => setHelp(false)}>확인</button></footer>
        </Dialog>
      )}
    </main>
  )
}
