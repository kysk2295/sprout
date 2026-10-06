import { useAssistant } from './components/AssistantBody'
import { WorkspaceView, AssistantLauncher } from './components/WorkspaceViews'
import { NotesView } from './components/NotesView'
import { WorkMapView } from './components/map/WorkMapView'
import { isMapMode, openMap, OPEN_MAP, OPEN_SCREEN, openTidy, takeScreen, type SideScreen } from './data/mapMoments'
import { TidyScreen } from './components/map/modes'
import { DiaryView } from './components/diary/DiaryView'
import { TickTickImportHost, openTickTickImport } from './components/TickTickImport'
import { OnboardingHost } from './components/onboarding/OnboardingHost'
import { openOnboarding } from './data/onboarding'
import { useCollector } from './data/collector'
import { ListSuggestHost } from './components/listSuggest/ListSuggest'
import { GrowthView } from './components/growth/GrowthView'
import { SurveyDialog } from './components/growth/SurveyDialog'
import { LevelUpWatcher } from './components/growth/GrowthBits'
import { ensureCharacter } from './data/growth'
import { useEffect, useRef, useState } from 'react'
import '@sprout/tokens/tokens.css'
import './styles/app.css'
import { Rail, SYNC_NOW_EVENT, type RailView } from './components/Rail'
import { panelEsc } from './components/PanelClose'
import { useReportNotices, type NoticeTarget } from './data/notices'
import { Sidebar } from './components/Sidebar'
import { TaskListView } from './components/TaskListView'
import { DetailPane } from './components/DetailPane'
import { Resizer } from './components/Resizer'
import { ToastProvider } from './components/Toast'
import { BatchPanel } from './components/BatchPanel'
import { ReminderCards } from './components/ReminderCard'
import { CalendarView } from './components/calendar/CalendarView'
import { useTaskActions } from './lib/taskActions'
import { useQuery } from './data/useQuery'
import type { ListRow, TagRow } from './data/types'
import { viewTitle } from './data/views'
import { useLocalState, usePreferences } from './data/preferences'
import { CommandMenu, SearchDialog, QuickAdd, type Command } from './components/DesktopEntry'
import { useAuth, type AuthState } from './data/auth'
import { LoginScreen } from './components/LoginScreen'
import { CompanionErrorBoundary } from './components/companion/CompanionStates'
import { MiniWindow } from './components/MiniWindow'
import { DesktopSettings } from './components/DesktopSettings'
import { ExtAgenda } from './components/calendars/ExtSidebar'
import { CalendarConnectHost } from './components/calendars/ConnectHost'
import { OverdueHost, openOverdueCleanup } from './components/overdue/OverdueBits'
import { useLinkSync } from './components/wiki/LinkText'
import type { OpenTarget } from './data/wiki'
import { isEventKey, openEventById, requestCalendarDate, requestOpenEvent } from './data/events'
import { dayKey } from './lib/dates'
import { guideTabOf, OPEN_QUICK_ADD, OPEN_SHORTCUTS, requestGuide } from './components/guide/core'

const SIDEBAR = { def: 261, min: 200, max: 400 } // 실측 261
const DETAIL = { def: 298, min: 260, max: 560 } // 02 §0 실측 298
// 01 §2 창이 좁아질 때: 1100 미만이면 상세가 서랍, 900 미만이면 사이드바 자동 접힘
const DRAWER_BELOW = 1100
const NARROW_BELOW = 900

export function App() {
  const auth = useAuth()
  if (new URLSearchParams(location.search).get('window') === 'settings') return <DesktopSettings onClose={() => window.close()} />
  if (new URLSearchParams(location.search).get('window') === 'mini') return auth.state ? <ThemedMini signedIn={!!auth.state.user} /> : null
  // 08 §2 A안: 데스크톱은 로그아웃 상태면 로그인 화면이 먼저 (웹 미리보기는 서버가 없어 건너뛴다)
  if (auth.enabled && !auth.state) return null
  if (auth.enabled && !auth.state?.user) return <ThemedLogin />
  return (
    <ToastProvider>
      {/* 40 §2.2 앱 전체 오류 = puzzled 캐릭터 + [다시 시도] */}
      <CompanionErrorBoundary><Shell key={auth.state?.user?.email ?? 'preview'} sync={auth.state?.sync} email={auth.state?.user?.email} /></CompanionErrorBoundary>
    </ToastProvider>
  )
}

/** 설정의 테마(시스템 다크 따르기 포함)를 문서에 적용 — 로그인 화면·미니 창용 */
function useApplyTheme() {
  const prefs = usePreferences()
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => { const m = matchMedia('(prefers-color-scheme: dark)'); const change = () => setSystemDark(m.matches); m.addEventListener('change', change); return () => m.removeEventListener('change', change) }, [])
  useEffect(() => { document.documentElement.dataset.theme = prefs.followDark && systemDark ? 'dark' : prefs.theme }, [prefs.theme, prefs.followDark, systemDark])
}
function ThemedLogin() {
  useApplyTheme()
  return <LoginScreen />
}
function ThemedMini({ signedIn }: { signedIn: boolean }) {
  useApplyTheme()
  return <ToastProvider><MiniWindow signedIn={signedIn} /></ToastProvider>
}

function Shell({ sync, email }: { sync?: AuthState['sync']; email?: string }) {
  const assistant = useAssistant(email ?? 'preview')
  const [assistantDraft,setAssistantDraft] = useLocalState(`sprout.assistant.draft.${email ?? 'preview'}`,'')
  const [view, setView] = useLocalState<RailView>('sprout.view', 'tasks')
  const [selected, setSelected] = useLocalState('sprout.selected', 'smart:today')
  const [selection, setSelection] = useState<string[]>([])
  // 10 §2.2: 첫 로그인 뒤 한 번 성향 조사를 권한다(나중에 눌러도 성장 화면에 남는다)
  const [survey, setSurvey] = useState(false)
  // 로그인 직후 서버 데이터가 내려오기 전에 만들면 빈 캐릭터가 계정에 쌓인다 → 첫 동기화가 끝난 뒤(웹 미리보기는 바로)
  const synced = !sync || !!sync.lastSyncedAt
  const surveyKey = `sprout.survey.prompted.${email ?? 'preview'}` // 같은 기기의 다른 계정도 한 번씩 권한다
  useEffect(() => {
    if (!synced) return
    void ensureCharacter().then((c) => {
      let prompted = false
      try { prompted = localStorage.getItem(surveyKey) === '1' } catch { /* */ }
      if (!c.species && !prompted) setSurvey(true)
    })
  }, [synced, surveyKey])
  const actions = useTaskActions()
  const [sidebarW, setSidebarW] = useLocalState('sprout.sidebar.width', SIDEBAR.def)
  const [detailW, setDetailW] = useLocalState('sprout.detail.width', DETAIL.def)
  const [sidebarOpen, setSidebarOpen] = useLocalState('sprout.sidebar.open', true)
  const prefs = usePreferences()
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches)
  const theme = new URLSearchParams(location.search).get('theme') ?? (prefs.followDark && systemDark ? 'dark' : prefs.theme)
  const [overlay, setOverlay] = useState<'command' | 'search' | 'quick' | 'settings' | 'shortcuts'>()
  const [searchQuery, setSearchQuery] = useState('')
  useEffect(() => { const m = matchMedia('(prefers-color-scheme: dark)'); const change = () => setSystemDark(m.matches); m.addEventListener('change', change); return () => m.removeEventListener('change', change) }, [])
  const lists = useQuery<ListRow>('SELECT id, name, emoji, color, kind, sort_order FROM lists WHERE archived_at IS NULL ORDER BY sort_order, created_at, id') ?? []
  // 기본함은 사이드바에서 스마트 목록으로 보이므로 list:<기본함 id> 대신 smart:inbox로(선택 표시가 맞게)
  const listView = (listId: string) => (listId === inboxId ? 'smart:inbox' : `list:${listId}`)
  const openTask = (id: string) => { setView('tasks'); setSelected('smart:all'); setSelection([id]) }
  // 뒤에서 도는 정리: 수집함 AI 분류·링크 제목(11 v3-3), 새 할 일 영역 분류(14 §0.3)
  useCollector(lists)
  useLinkSync() // 33 §6.4 [[링크]] 글 ↔ 관계
  useReportNotices() // 01 §3.3 주간 리포트 도착 → 레일 종 알림
  const tags = useQuery<TagRow>('SELECT id, name, color FROM tags ORDER BY sort_order') ?? []
  const folder = useQuery<{name:string}>('SELECT name FROM folders WHERE id = ?', [selected.startsWith('folder:') ? selected.slice(7) : ''])?.[0]
  const selectedFilter = useQuery<{name:string}>('SELECT name FROM filters WHERE id=?',[selected.startsWith('filter:')?selected.slice(7):''])?.[0]
  const selectedList = useQuery<ListRow>('SELECT id,name,emoji,color,kind,sort_order FROM lists WHERE id=?',[selected.startsWith('list:')?selected.slice(5):''])?.[0]
  // 기본함은 언제나 하나 있다(02 §14.1). 혹시 둘이면 가장 오래된 것(위 쿼리가 sort_order·created_at 순) — 없으면 할 일을 만들 때 만든다(mutations run)
  const inboxId = lists.find((l) => l.kind === 'inbox')?.id

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.platform = window.sprout?.platform ?? 'web'
  }, [theme])

  const toggleRef = useRef(() => {})
  const viewRef = useRef(view)
  viewRef.current = view
  // 01-app-shell §7: ⌘\ 사이드바 접기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role=dialog], .popover')) return
      if ((e.metaKey || e.ctrlKey) && e.key === '\\' && viewRef.current !== 'calendar') toggleRef.current()

    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [winW, setWinW] = useState(window.innerWidth)
  const [sidebarPeek, setSidebarPeek] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const drawer = winW < DRAWER_BELOW
  // 01 §2.1 상세 닫기(✕ · Esc, 2026-10-05 사용자 요청): 닫으면 선택을 풀고 패널 자리를 비워 목록이 넓어진다. 할 일을 다시 고르면 열린다(기억하지 않음 — 틱틱은 상세가 늘 보여 닫는 동작이 없다)
  const [detailHidden, setDetailHidden] = useState(false)
  useEffect(() => { if (selection.length) setDetailHidden(false) }, [selection.length])
  const hideDetail = () => { setSelection([]); setDetailHidden(true) }
  const detailShown = selection.length > 0 || (!drawer && !detailHidden)
  const narrow = winW < NARROW_BELOW
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { if (!narrow) setSidebarPeek(false) }, [narrow])
  // 서랍: 바깥을 누르면 닫힌다(다른 태스크 행·메뉴를 누를 때는 그대로)
  useEffect(() => {
    if (!drawer || !selection.length) return
    const down = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (drawerRef.current?.contains(el) || el.closest('.row, .popover, .toast')) return
      setSelection([])
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [drawer, selection.length])

  const selectView = (v: string) => {
    setSelected(v)
    setSelection([])
    setSidebarPeek(false)
  }
  // 03 §7 알림: 누르면 그 태스크 상세를 열고, 완료 버튼은 반복 규칙까지 따르는 완료 동작을 쓴다
  useEffect(() => {
    const r = window.sprout?.reminders
    if (!r) return
    const offOpen = r.onOpen((id) => { if (isEventKey(id)) { setView('calendar'); void openEventById(id); return } setView('tasks'); setSelection([id]) }) // 알림·미니 창에서 열기 (06 §14.4.7 일정은 캘린더에서)
    const offDone = r.onComplete((id) => { if (!isEventKey(id)) void actions.complete([id]) })
    return () => { offOpen(); offDone() }
  }, [actions])

  const settings = () => window.sprout?.desktop ? window.sprout.desktop.openSettings() : setOverlay('settings')
  useEffect(() => {
    let prefix = 0
    const keys: Record<string,string> = {a:'all',t:'today',r:'tomorrow',n:'next7',i:'inbox',c:'completed',w:'wontdo',g:'trash'}
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || document.querySelector('[role=dialog], .popover')) return
      const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey
      if(e.ctrlKey && e.shiftKey && k==='a'){e.preventDefault();setOverlay('quick');return}
      if(mod && !e.shiftKey && !e.altKey && k==='s'){e.preventDefault();prefix=0;window.dispatchEvent(new Event(SYNC_NOW_EVENT));return} // 01 §7 ⌘S 지금 동기화 [틱틱]
      if (mod && ['k','f','n',','].includes(k)) {
        e.preventDefault(); prefix=0
        if(k===',')settings()
        else { if(k==='f')setSearchQuery(''); setOverlay(k==='k'?'command':k==='f'?'search':'quick') }
        return
      }
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]') || mod || e.altKey) { prefix=0;return }
      if (prefix && Date.now()-prefix<1000) {
        prefix=0
        if(k==='s'){e.preventDefault();settings()}
        else if(keys[k]){e.preventDefault();setView('tasks');selectView(`smart:${keys[k]}`)}
      } else if(k==='g')prefix=Date.now()
      else if(k==='?'){e.preventDefault();setOverlay('shortcuts')}
    }
    window.addEventListener('keydown',key)
    return ()=>window.removeEventListener('keydown',key)
  })
  useEffect(() => window.sprout?.desktop?.onQuickAdd(() => setOverlay('quick')), [])
  // 37 사용법 창의 `빠른 추가 열기` · `단축키 모음`
  useEffect(() => {
    const quick = () => setOverlay('quick'), keys = () => setOverlay('shortcuts')
    window.addEventListener(OPEN_QUICK_ADD, quick)
    window.addEventListener(OPEN_SHORTCUTS, keys)
    return () => { window.removeEventListener(OPEN_QUICK_ADD, quick); window.removeEventListener(OPEN_SHORTCUTS, keys) }
  }, [])
  // 37 §3 레일 도움말 = 지금 탭 사용법 창(머리 `?`가 없는 화면 — 정리 화면·주간 점검 등 — 은 예전처럼 단축키 시트)
  const openHelp = () => { if (tidyOpen || !requestGuide(guideTabOf(view))) setOverlay('shortcuts') }
  // 25 §14·§15: 위젯 딥 링크(sprout://today·growth·calendar/<날짜>·event/<id>) — 다시 불러오지 않고 보기만 바꾼다
  useEffect(() => window.sprout?.desktop?.onNavigate?.((to) => {
    const views: RailView[] = ['tasks', 'calendar', 'growth', 'notes', 'watch', 'wiki', 'diary', 'assistant', 'map']
    if (!views.includes(to.view as RailView)) return
    if (to.view === 'map' && (to.mode === 'review' || to.mode === 'tidy')) { openMap({ mode: to.mode }); return } // 예전 sprout://map?mode=review·tidy → 성장 › 주간 점검 · 정리 화면(2026-10-05)
    setView(to.view as RailView)
    if (to.view === 'map') { if (to.mode || to.task) openMap({ ...(isMapMode(to.mode) ? { mode: to.mode } : {}), ...(to.task ? { task: to.task } : {}) }); return } // 31 §10.4 sprout://map?mode=
    if (to.view === 'calendar') { if (to.event) void openEventById(to.event); else if (to.date) requestCalendarDate(to.date); return } // 25 §15 월 캘린더 위젯
    if (to.selected) { setSelected(to.selected); setSelection([]) }
  }), [setView, setSelected])
  // 31 §10.4 순간 ①~④가 지도를 부르면 지도 보기로(요청은 지도가 뜰 때 적용)
  useEffect(() => {
    const go = () => setView('map')
    window.addEventListener(OPEN_MAP, go)
    return () => window.removeEventListener(OPEN_MAP, go)
  }, [setView])
  // 사용자 결정 2026-10-05: 점검 = 성장 탭(GrowthView가 요청을 받는다), 정리 = 본문 자리 정리 화면(다른 보기로 가면 닫힘)
  const [tidyOpen, setTidyOpen] = useState(false)
  useEffect(() => {
    const on = (e: Event) => {
      const s = (e as CustomEvent<SideScreen>).detail
      if (s === 'review') setView('growth')
      else if (s === 'tidy' && takeScreen('tidy')) setTidyOpen(true)
    }
    window.addEventListener(OPEN_SCREEN, on)
    return () => window.removeEventListener(OPEN_SCREEN, on)
  }, [setView])
  useEffect(() => { setTidyOpen(false) }, [view])
  const onRailView = (v: RailView) => { setTidyOpen(false); setView(v) }
  // 01 §3.3 알림 줄 누르기 → 할 일 상세 · 캘린더 일정 · 성장 · 작업 지도
  const openNotice = (t: NoticeTarget) => {
    setTidyOpen(false)
    if (t.view === 'tasks') openTask(t.task)
    else if (t.view === 'calendar') { setView('calendar'); void openEventById(t.event) }
    else setView(t.view)
  }
  // 33: 행 [[링크]]·페이지 머리 알약 → 태그·리스트 페이지, 할 일, 수집함 위키
  useEffect(() => {
    const go = (e: Event) => {
      const t = (e as CustomEvent<OpenTarget>).detail
      if (t.view === 'notes') { setView('notes'); return }
      setView('tasks')
      const v = t.view.startsWith('list:') ? listView(t.view.slice(5)) : t.view
      setSelected(v); setSelection(t.taskId ? [t.taskId] : []); setSidebarPeek(false)
    }
    const wiki = () => setView('wiki')
    window.addEventListener('sprout:open-target', go)
    window.addEventListener('sprout:open-wiki', wiki)
    return () => { window.removeEventListener('sprout:open-target', go); window.removeEventListener('sprout:open-wiki', wiki) }
  })
  // 25 §14: 위젯 체크로 메인 프로세스가 준 XP도 앱 안 완료처럼 "+1"(data/growth.ts announce와 같은 이벤트)
  useEffect(() => window.sprout?.desktop?.onXp?.((amount) => { if (amount > 0) window.dispatchEvent(new CustomEvent('sprout:xp', { detail: amount })) }), [])
  const commands:Command[] = [
    {id:'new',label:'할 일 추가',key:'⌘N',group:'공통 작업',run:()=>setOverlay('quick')},
    {id:'ticktick-import',label:'틱틱에서 가져오기',group:'공통 작업',run:openTickTickImport},
    {id:'overdue-cleanup',label:'밀린 일 정리',group:'공통 작업',run:()=>openOverdueCleanup()},
    {id:'tidy',label:'기본함 정리하기',group:'공통 작업',run:()=>openTidy()}, // 정리 화면(분류 책상) — 19 밀린 일 정리 대화 상자와 따로
    {id:'tasks',label:'할일',group:'내비게이션',run:()=>setView('tasks')},
    {id:'calendar',label:'달력',group:'내비게이션',run:()=>setView('calendar')},
    {id:'search',label:'검색창 열기',key:'⌘F',group:'내비게이션',run:()=>{setSearchQuery('');setOverlay('search')}},
    {id:'settings',label:'설정',key:'⌘,',group:'내비게이션',run:settings},
    {id:'sync',label:'지금 동기화',key:'⌘S',group:'공통 작업',run:()=>window.dispatchEvent(new Event(SYNC_NOW_EVENT))},
    ...Object.entries({all:'전체',today:'오늘',tomorrow:'내일',next7:'다음 7일',inbox:'기본함',completed:'완료',wontdo:'계획 취소',trash:'휴지통'}).map(([id,label])=>({id,label:`${label}${['기본함','휴지통'].includes(label)?'으로':'로'} 이동`,group:'내비게이션',run:()=>{setView('tasks');selectView(`smart:${id}`)}})),
    {id:'onboarding',label:'시작 안내',group:'지원',run:openOnboarding},
    {id:'guide',label:'이 화면 사용법',group:'지원',run:openHelp},
    {id:'shortcuts',label:'단축키',key:'?',group:'지원',run:()=>setOverlay('shortcuts')}
  ]
  const toggleSidebar = () => (narrow ? setSidebarPeek((o) => !o) : setSidebarOpen((o) => !o))
  const showSidebar = narrow ? sidebarPeek : sidebarOpen
  toggleRef.current = toggleSidebar
  return (
      <div className="app">
        {survey && <SurveyDialog onClose={() => { setSurvey(false); try { localStorage.setItem(surveyKey, '1') } catch { /* */ } }} />}
        <OnboardingHost onOpenCalendar={() => setView('calendar')} />
        <LevelUpWatcher />
        <CalendarConnectHost />
        <ListSuggestHost />{/* 30 §B AI 리스트 제안: 새 할 일 자동 분류 + 기본함 정리 창 */}
        <TickTickImportHost onOpenMap={() => setView('map')} onOpenCalendar={() => setView('calendar')} />
        <OverdueHost />
        <AssistantLauncher view={view} onView={setView} draft={assistantDraft} onDraft={setAssistantDraft} assistant={assistant} onOpen={id=>{setView('tasks');setSelected('smart:all');setSelection([id])}} offset={view === 'tasks' && detailShown ? detailW : undefined}/>
        <ReminderCards onOpen={(id) => { if (isEventKey(id)) { setView('calendar'); void openEventById(id) } else setSelection([id]) }} onComplete={(id) => void actions.complete([id])} />
        <Rail view={view} onView={onRailView} sync={sync} email={email} onSettings={settings} onHelp={openHelp} onNotice={openNotice} />
        {overlay==='command' && <CommandMenu commands={commands} onClose={()=>setOverlay(undefined)} onSearch={(q)=>{setSearchQuery(q);setOverlay('search')}}/>}
        {overlay==='search' && <SearchDialog initial={searchQuery} onClose={()=>setOverlay(undefined)} onPick={(r)=>{if(r.kind==='event'){setView('calendar');requestOpenEvent(r.id,r.list_id??dayKey());return}setView('tasks');if(r.kind==='task'){setSelected(r.list_id?listView(r.list_id):'smart:all');setSelection([r.id])}else selectView(`${r.kind}:${r.id}`)}}/>}
        {overlay==='quick' && <QuickAdd lists={lists} tags={tags} inboxId={inboxId} onClose={()=>setOverlay(undefined)} onCreated={(id,listId)=>{setView('tasks');setSelected(listView(listId));setSelection([id])}}/>}
        {(overlay==='settings'||overlay==='shortcuts') && <DesktopSettings initial={overlay==='shortcuts'?'shortcuts':'smart'} onClose={()=>setOverlay(undefined)}/> }
        {tidyOpen ? <TidyScreen lists={lists} onClose={() => setTidyOpen(false)} /> : view === 'growth' ? <GrowthView lists={lists} onSurvey={() => setSurvey(true)} /> : view === 'map' ? <WorkMapView lists={lists} onOpen={openTask} onTasks={() => setView('tasks')} onGrowth={() => setView('growth')}/> : view === 'diary' ? <DiaryView onOpen={openTask}/> : view === 'assistant' ? <WorkspaceView view={view} onView={setView} draft={assistantDraft} onDraft={setAssistantDraft} assistant={assistant} onOpen={openTask}/> : (view === 'notes' || view === 'watch' || view === 'wiki') ? <NotesView section={view} onSection={setView} lists={lists} onOpen={id=>{setView('tasks');setSelected('smart:all');setSelection([id])}}/> : view === 'calendar' ? (
          <CalendarView lists={lists} tags={tags} inboxId={inboxId} actions={actions} />
        ) : (
          <>
        {showSidebar && (
          <div className={`app__sidebar${narrow ? ' is-overlay' : ''}`} style={{ width: sidebarW }}>
            <Sidebar selected={selected} onSelect={selectView} lists={lists} tags={tags} onGrowth={() => setView('growth')} />
            <Resizer side="right" width={sidebarW} min={SIDEBAR.min} max={SIDEBAR.max} defaultWidth={SIDEBAR.def} onChange={setSidebarW} />
          </div>
        )}
        {selected.startsWith('ext:') ? <ExtAgenda accountId={selected.slice(4)} onToggleSidebar={toggleSidebar} detailWidth={detailW} /> : <>
        <TaskListView
          view={selected}
          title={selected.startsWith('folder:') ? folder?.name ?? '' : selectedFilter?.name ?? selectedList?.name ?? viewTitle(selected, lists, tags)}
          lists={lists}
          tags={tags}
          inboxId={inboxId}
          selection={selection}
          onSelectionChange={setSelection}
          actions={actions}
          onToggleSidebar={toggleSidebar}
        />
        {detailShown && (
        <div ref={drawerRef} className={`app__detail${drawer ? ' is-drawer' : ''}`} style={{ width: detailW }} onKeyDown={panelEsc(hideDetail)}>
          <Resizer side="left" width={detailW} min={DETAIL.min} max={DETAIL.max} defaultWidth={DETAIL.def} onChange={setDetailW} />
          {selection.length > 1 ? (
            <BatchPanel ids={selection} lists={lists} tags={tags} actions={actions} onClear={hideDetail} />
          ) : (
            <DetailPane taskId={selection[0]} lists={lists} tags={tags} actions={actions} onSelect={(id) => setSelection([id])} onClose={() => setSelection([])} onHide={hideDetail} />
          )}
        </div>
        )}
        </>}
          </>
        )}
      </div>
  )
}
