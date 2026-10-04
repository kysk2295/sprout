import { Bell, CalendarDays, CircleCheckBig, CircleHelp, RefreshCw, Search, Sprout } from 'lucide-react'
import type { ReactNode } from 'react'

export type RailView = 'tasks' | 'calendar' | 'growth'

// 01-app-shell §3: 아바타 · 태스크 · 캘린더 · 성장 · 검색 / 동기화 · 알림 · 도움말
export function Rail({ view, onView, onSearch, onSettings, onHelp }: { view: RailView; onView: (v: RailView) => void; onSearch: () => void; onSettings: () => void; onHelp: () => void }) {
  return (
    <nav className="rail" aria-label="주 메뉴">
      <div className="rail__drag" />
      <button className="rail__avatar" title="설정" onClick={onSettings}>S</button>
      <RailButton label="태스크" active={view === 'tasks'} onClick={() => onView('tasks')} icon={<CircleCheckBig />} />
      <RailButton label="캘린더" active={view === 'calendar'} onClick={() => onView('calendar')} icon={<CalendarDays />} />
      <RailButton label="성장" active={view === 'growth'} onClick={() => onView('growth')} icon={<Sprout />} />
      <RailButton label="검색" onClick={onSearch} icon={<Search />} />
      <div className="rail__spacer" />
      <RailButton label="동기화" icon={<RefreshCw />} />
      <RailButton label="알림" icon={<Bell />} />
      <RailButton label="도움말" onClick={onHelp} icon={<CircleHelp />} />
    </nav>
  )
}

function RailButton({ label, icon, active, onClick }: { label: string; icon: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`rail__btn${active ? ' is-active' : ''}`} onClick={onClick} aria-label={label} data-tooltip={label}>
      {icon}
    </button>
  )
}
