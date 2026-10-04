import { useAssistant } from './components/AssistantBody'
import { WorkspaceView, AssistantLauncher } from './components/WorkspaceViews'
import { NotesView } from './components/NotesView'
import { GrowthView } from './components/growth/GrowthView'
import { SurveyDialog } from './components/growth/SurveyDialog'
import { LevelUpWatcher } from './components/growth/GrowthBits'
import { ensureCharacter } from './data/growth'
import { useEffect, useRef, useState } from 'react'
import '@sprout/tokens/tokens.css'
import './styles/app.css'
import { Rail, type RailView } from './components/Rail'
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
import { MiniWindow } from './components/MiniWindow'
import { DesktopSettings } from './components/DesktopSettings'

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
      <Shell key={auth.state?.user?.email ?? 'preview'} sync={auth.state?.sync} email={auth.state?.user?.email} />
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
  useEffect(() => {
    void ensureCharacter().then((c) => {
      let prompted = false
      try { prompted = localStorage.getItem('sprout.survey.prompted') === '1' } catch { /* */ }
      if (!c.species && !prompted) setSurvey(true)
    })
  }, [])
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
  const lists = useQuery<ListRow>('SELECT id, name, emoji, color, kind, sort_order FROM lists WHERE archived_at IS NULL ORDER BY sort_order') ?? []
  const tags = useQuery<TagRow>('SELECT id, name, color FROM tags ORDER BY sort_order') ?? []
  const folder = useQuery<{name:string}>('SELECT name FROM folders WHERE id = ?', [selected.startsWith('folder:') ? selected.slice(7) : ''])?.[0]
  const selectedFilter = useQuery<{name:string}>('SELECT name FROM filters WHERE id=?',[selected.startsWith('filter:')?selected.slice(7):''])?.[0]
  const selectedList = useQuery<ListRow>('SELECT id,name,emoji,color,kind,sort_order FROM lists WHERE id=?',[selected.startsWith('list:')?selected.slice(5):''])?.[0]
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
    const offOpen = r.onOpen((id) => { setView('tasks'); setSelection([id]) }) // 알림·미니 창에서 열기
    const offDone = r.onComplete((id) => void actions.complete([id]))
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
  const commands:Command[] = [
    {id:'new',label:'할 일 추가',key:'⌘N',group:'공통 작업',run:()=>setOverlay('quick')},
    {id:'tasks',label:'할일',group:'내비게이션',run:()=>setView('tasks')},
    {id:'calendar',label:'달력',group:'내비게이션',run:()=>setView('calendar')},
    {id:'search',label:'검색창 열기',key:'⌘F',group:'내비게이션',run:()=>{setSearchQuery('');setOverlay('search')}},
    {id:'settings',label:'설정',key:'⌘,',group:'내비게이션',run:settings},
    ...Object.entries({all:'전체',today:'오늘',tomorrow:'내일',next7:'다음 7일',inbox:'기본함',completed:'완료',wontdo:'계획 취소',trash:'휴지통'}).map(([id,label])=>({id,label:`${label}${['기본함','휴지통'].includes(label)?'으로':'로'} 이동`,group:'내비게이션',run:()=>{setView('tasks');selectView(`smart:${id}`)}})),
    {id:'shortcuts',label:'단축키',key:'?',group:'지원',run:()=>setOverlay('shortcuts')}
  ]
  const toggleSidebar = () => (narrow ? setSidebarPeek((o) => !o) : setSidebarOpen((o) => !o))
  const showSidebar = narrow ? sidebarPeek : sidebarOpen
  toggleRef.current = toggleSidebar
  return (
      <div className="app">
        {survey && <SurveyDialog onClose={() => { setSurvey(false); try { localStorage.setItem('sprout.survey.prompted', '1') } catch { /* */ } }} />}
        <LevelUpWatcher />
        <AssistantLauncher view={view} onView={setView} draft={assistantDraft} onDraft={setAssistantDraft} assistant={assistant} onOpen={id=>{setView('tasks');setSelected('smart:all');setSelection([id])}}/>
        <ReminderCards onOpen={(id) => setSelection([id])} onComplete={(id) => void actions.complete([id])} />
        <Rail view={view} onView={setView} sync={sync} email={email} onSearch={()=>{setSearchQuery('');setOverlay('search')}} onSettings={settings} onHelp={()=>setOverlay('shortcuts')} />
        {overlay==='command' && <CommandMenu commands={commands} onClose={()=>setOverlay(undefined)} onSearch={(q)=>{setSearchQuery(q);setOverlay('search')}}/>}
        {overlay==='search' && <SearchDialog initial={searchQuery} onClose={()=>setOverlay(undefined)} onPick={(r)=>{setView('tasks');if(r.kind==='task'){setSelected(r.list_id?`list:${r.list_id}`:'smart:all');setSelection([r.id])}else selectView(`${r.kind}:${r.id}`)}}/>}
        {overlay==='quick' && <QuickAdd lists={lists} tags={tags} inboxId={inboxId} onClose={()=>setOverlay(undefined)} onCreated={(id,listId)=>{setView('tasks');setSelected(`list:${listId}`);setSelection([id])}}/>}
        {(overlay==='settings'||overlay==='shortcuts') && <DesktopSettings initial={overlay==='shortcuts'?'shortcuts':'smart'} onClose={()=>setOverlay(undefined)}/> }
        {view === 'growth' ? <GrowthView onSurvey={() => setSurvey(true)} /> : ['assistant','map','usage'].includes(view) ? <WorkspaceView view={view} onView={setView} draft={assistantDraft} onDraft={setAssistantDraft} assistant={assistant} onOpen={id=>{setView('tasks');setSelected('smart:all');setSelection([id])}}/> : (view === 'notes' || view === 'wiki') ? <NotesView section={view} onSection={setView} lists={lists} onOpen={id=>{setView('tasks');setSelected('smart:all');setSelection([id])}}/> : view === 'calendar' ? (
          <CalendarView lists={lists} tags={tags} inboxId={inboxId} actions={actions} />
        ) : (
          <>
        {showSidebar && (
          <div className={`app__sidebar${narrow ? ' is-overlay' : ''}`} style={{ width: sidebarW }}>
            <Sidebar selected={selected} onSelect={selectView} lists={lists} tags={tags} onGrowth={() => setView('growth')} />
            <Resizer side="right" width={sidebarW} min={SIDEBAR.min} max={SIDEBAR.max} defaultWidth={SIDEBAR.def} onChange={setSidebarW} />
          </div>
        )}
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
        {(!drawer || selection.length > 0) && (
        <div ref={drawerRef} className={`app__detail${drawer ? ' is-drawer' : ''}`} style={{ width: detailW }}>
          <Resizer side="left" width={detailW} min={DETAIL.min} max={DETAIL.max} defaultWidth={DETAIL.def} onChange={setDetailW} />
          {selection.length > 1 ? (
            <BatchPanel ids={selection} lists={lists} tags={tags} actions={actions} onClear={() => setSelection([])} />
          ) : (
            <DetailPane taskId={selection[0]} lists={lists} tags={tags} actions={actions} onSelect={(id) => setSelection([id])} onClose={() => setSelection([])} />
          )}
        </div>
        )}
          </>
        )}
      </div>
  )
}
