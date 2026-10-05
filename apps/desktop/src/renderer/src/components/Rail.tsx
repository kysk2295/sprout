import { Bell, CalendarDays, CircleCheckBig, CircleHelp, RefreshCw, Sprout, NotebookPen, Bot, Network, BookHeart, Smile, Settings, ChartColumn, LogOut } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { authApi, type AuthState } from '../data/auth'
import { useAvatar } from '../data/avatar'
import { AvatarPicker } from './avatar/AvatarPicker'
import { ProfileAvatar } from './avatar/ProfileAvatar'
import { Dialog } from './Dialog'
import { MenuItem, Popover } from './Popover'

export type RailView = 'tasks' | 'calendar' | 'growth' | 'notes' | 'watch' | 'wiki' | 'diary' | 'assistant' | 'map'

// 01-app-shell §3: 아바타 · 태스크 · 캘린더 · 성장 · … / 동기화 · 알림 · 도움말 (검색 버튼은 2026-10-05 뺌 — ⌘F로 연다)
export function Rail({ view, onView, onSettings, onHelp, sync, email }: { view: RailView; onView: (v: RailView) => void; onSettings: () => void; onHelp: () => void; sync?: AuthState['sync']; email?: string }) {
  // 08 §6: 동기화 중이면 회전, 끊김·오류면 빨간 점, 누르면 바로 다시 동기화
  const busy = !!sync && (sync.uploading || sync.downloading)
  const problem = !!sync && (!sync.connected || !!sync.error)
  const syncLabel = !sync ? '동기화' : !sync.connected ? '오프라인 — 연결되면 자동으로 올라가요' : sync.error ? '동기화에 실패했어요 — 다시 시도하는 중'
    : sync.lastSyncedAt ? `마지막 동기화: ${new Date(sync.lastSyncedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}` : '동기화 중'
  return (
    <nav className="rail" aria-label="주 메뉴">
      <div className="rail__drag" />
      <RailAvatar email={email} onSettings={onSettings} onGrowth={() => onView('growth')} />
      <RailButton label="태스크" active={view === 'tasks'} onClick={() => onView('tasks')} icon={<CircleCheckBig />} />
      <RailButton label="캘린더" active={view === 'calendar'} onClick={() => onView('calendar')} icon={<CalendarDays />} />
      <RailButton label="성장" active={view === 'growth'} onClick={() => onView('growth')} icon={<Sprout />} />
      <RailButton label="AI 비서" active={view === 'assistant'} onClick={() => onView('assistant')} icon={<Bot />} />
      <RailButton label="수집함" active={view === 'notes' || view === 'watch' || view === 'wiki'} onClick={() => onView('notes')} icon={<NotebookPen />} />
      <RailButton label="일기" active={view === 'diary'} onClick={() => onView('diary')} icon={<BookHeart />} />
      <RailButton label="작업 지도" active={view === 'map'} onClick={() => onView('map')} icon={<Network />} />
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

/** 35 §3.1 레일 아바타 메뉴(틱틱: 설정 · 통계 · 로그아웃 — 2026-10-05 앱에서 확인) + 맨 위 "프로필 이미지 바꾸기" */
function RailAvatar({ email, onSettings, onGrowth }: { email?: string; onSettings: () => void; onGrowth: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<'menu' | 'picker' | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const { resolved } = useAvatar()
  const letter = (email?.[0] ?? 'S').toUpperCase()
  const close = () => setOpen(null)
  return <>
    <button ref={ref} className={`rail__avatar${open ? ' is-open' : ''}`} title={email ?? '설정'} aria-label="계정 메뉴" aria-haspopup="menu" aria-expanded={!!open}
      onClick={() => setOpen((o) => (o ? null : 'menu'))}>
      <ProfileAvatar avatar={resolved} size={34} letter={letter} />
    </button>
    {open === 'menu' && <Popover anchor={ref.current} onClose={close} width={200} className="menu">
      <MenuItem icon={<Smile />} label="프로필 이미지 바꾸기" onClick={() => setOpen('picker')} />
      <div className="menu__divider" />
      <MenuItem icon={<Settings />} label="설정" trail={<span className="menu__key">⌘,</span>} onClick={() => { close(); onSettings() }} />
      <MenuItem icon={<ChartColumn />} label="통계" onClick={() => { close(); onGrowth() }} />
      {email && <MenuItem icon={<LogOut />} label="로그아웃" onClick={() => { close(); setConfirm(true) }} />}
    </Popover>}
    {open === 'picker' && <AvatarPicker anchor={ref.current} letter={letter} onClose={close} />}
    {confirm && <Dialog label="로그아웃" className="organization-dialog" onClose={() => { if (!busy) setConfirm(false) }}>
      <h2>로그아웃할까요?</h2>
      <p>로그아웃하면 이 기기의 데이터가 지워지고 서버에만 남아요.</p>
      <footer>
        <button disabled={busy} onClick={() => setConfirm(false)}>취소</button>
        <button disabled={busy} onClick={async () => { setBusy(true); await authApi()?.logout(); setBusy(false); setConfirm(false) }}>로그아웃</button>
      </footer>
    </Dialog>}
  </>
}
