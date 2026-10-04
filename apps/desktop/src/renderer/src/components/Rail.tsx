import { Bell, CalendarDays, CircleCheckBig, CircleHelp, RefreshCw, Search, Sprout, NotebookPen, Bot, Network, BookOpen, Gauge } from 'lucide-react'
import type { ReactNode } from 'react'
import { authApi, type AuthState } from '../data/auth'

export type RailView = 'tasks' | 'calendar' | 'growth' | 'notes' | 'assistant' | 'map' | 'wiki' | 'usage'

// 01-app-shell §3: 아바타 · 태스크 · 캘린더 · 성장 · 검색 / 동기화 · 알림 · 도움말
export function Rail({ view, onView, onSearch, onSettings, onHelp, sync, email }: { view: RailView; onView: (v: RailView) => void; onSearch: () => void; onSettings: () => void; onHelp: () => void; sync?: AuthState['sync']; email?: string }) {
  // 08 §6: 동기화 중이면 회전, 끊김·오류면 빨간 점, 누르면 바로 다시 동기화
  const busy = !!sync && (sync.uploading || sync.downloading)
  const problem = !!sync && (!sync.connected || !!sync.error)
  const syncLabel = !sync ? '동기화' : !sync.connected ? '오프라인 — 연결되면 자동으로 올라가요' : sync.error ? '동기화에 실패했어요 — 다시 시도하는 중'
    : sync.lastSyncedAt ? `마지막 동기화: ${new Date(sync.lastSyncedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}` : '동기화 중'
  return (
    <nav className="rail" aria-label="주 메뉴">
      <div className="rail__drag" />
      <button className="rail__avatar" title={email ?? '설정'} onClick={onSettings}>{(email?.[0] ?? 'S').toUpperCase()}</button>
      <RailButton label="태스크" active={view === 'tasks'} onClick={() => onView('tasks')} icon={<CircleCheckBig />} />
      <RailButton label="캘린더" active={view === 'calendar'} onClick={() => onView('calendar')} icon={<CalendarDays />} />
      <RailButton label="성장" active={view === 'growth'} onClick={() => onView('growth')} icon={<Sprout />} />
      <RailButton label="AI 비서" active={view === 'assistant'} onClick={() => onView('assistant')} icon={<Bot />} />
      <RailButton label="메모함" active={view === 'notes'} onClick={() => onView('notes')} icon={<NotebookPen />} />
      <RailButton label="작업 지도" active={view === 'map'} onClick={() => onView('map')} icon={<Network />} />
      <RailButton label="주제 위키" active={view === 'wiki'} onClick={() => onView('wiki')} icon={<BookOpen />} />
      <RailButton label="AI 사용량" active={view === 'usage'} onClick={() => onView('usage')} icon={<Gauge />} />
      <RailButton label="검색" onClick={onSearch} icon={<Search />} />
      <div className="rail__spacer" />
      <RailButton label={syncLabel} className={`rail__sync${busy ? ' is-busy' : ''}${problem ? ' has-problem' : ''}`} onClick={() => void authApi()?.syncNow()} icon={<RefreshCw />} />
      <RailButton label="알림" icon={<Bell />} />
      <RailButton label="도움말" onClick={onHelp} icon={<CircleHelp />} />
    </nav>
  )
}

function RailButton({ label, icon, active, onClick, className }: { label: string; icon: ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button className={`rail__btn${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`} onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} data-tooltip={label}>
      {icon}
    </button>
  )
}
