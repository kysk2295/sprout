import { Bell, CalendarDays, CircleCheckBig, CircleHelp, RefreshCw, Sprout, NotebookPen, Bot, Network, BookHeart, Smile, Settings, ChartColumn, LogOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { authApi, SYNC_MIN_SPIN_MS, syncResultToast, type AuthState, type SyncNowResult } from '../data/auth'
import { useNotices, type NoticeTarget } from '../data/notices'
import { NoticePanel } from './NoticePanel'
import { useToast } from './Toast'
import { useAvatar } from '../data/avatar'
import { AvatarPicker } from './avatar/AvatarPicker'
import { ProfileAvatar } from './avatar/ProfileAvatar'
import { Dialog } from './Dialog'
import { MenuItem, Popover } from './Popover'

export type RailView = 'tasks' | 'calendar' | 'growth' | 'notes' | 'watch' | 'wiki' | 'diary' | 'assistant' | 'map'

// 01-app-shell §3: 아바타 · 태스크 · 캘린더 · 성장 · … / 동기화 · 알림 · 도움말 (검색 버튼은 2026-10-05 뺌 — ⌘F로 연다)
/** ⌘S(App 단축키)가 레일 ⟳과 같은 동작을 부르는 이벤트 */
export const SYNC_NOW_EVENT = 'sprout:sync-now'
export function Rail({ view, onView, onSettings, onHelp, onNotice, sync, email }: { view: RailView; onView: (v: RailView) => void; onSettings: () => void; onHelp: () => void; onNotice: (t: NoticeTarget) => void; sync?: AuthState['sync']; email?: string }) {
  const toast = useToast()
  // 01 §3.2.1: 누르면 최소 0.8초 돌고, 끝나면 결과 토스트(실패·오프라인은 다시 시도). 도는 동안은 다시 누를 수 없다
  const [manual, setManual] = useState(false)
  const running = useRef(false)
  const runSync = useCallback(async () => {
    if (running.current) return
    const api = authApi()
    if (!api) { toast.show('웹 미리보기는 동기화하지 않아요'); return }
    running.current = true
    setManual(true)
    const t0 = Date.now()
    let r: SyncNowResult
    try { r = await api.syncNow() } catch (e) { r = { ok: false, reason: 'error', message: String(e) } }
    const left = SYNC_MIN_SPIN_MS - (Date.now() - t0)
    if (left > 0) await new Promise((res) => window.setTimeout(res, left))
    running.current = false
    setManual(false)
    const t = syncResultToast(r)
    toast.show(t.text, undefined, t.retry ? { action: { label: '다시 시도', run: () => void runSync() } } : undefined)
  }, [toast])
  useEffect(() => {
    const on = () => void runSync()
    window.addEventListener(SYNC_NOW_EVENT, on)
    return () => window.removeEventListener(SYNC_NOW_EVENT, on)
  }, [runSync])
  // 08 §6: 동기화 중이면 회전, 끊김·오류면 빨간 점
  const busy = manual || (!!sync && (sync.uploading || sync.downloading))
  const problem = !manual && !!sync && (!sync.connected || !!sync.error)
  const syncLabel = manual ? '동기화 중…' : !sync ? '동기화' : !sync.connected ? '오프라인 — 연결되면 자동으로 올라가요' : sync.error ? '동기화에 실패했어요 — 다시 시도하는 중'
    : sync.lastSyncedAt ? `마지막 동기화: ${new Date(sync.lastSyncedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}` : '동기화 중'
  // 01 §3.3 알림 패널
  const notices = useNotices()
  const unread = notices.filter((n) => !n.read).length
  const bellRef = useRef<HTMLButtonElement>(null)
  const [bellOpen, setBellOpen] = useState(false)
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
      <RailButton label={syncLabel} className={`rail__sync${busy ? ' is-busy' : ''}${problem ? ' has-problem' : ''}`} disabled={manual} onClick={() => void runSync()} icon={<RefreshCw />} />
      <RailButton btnRef={bellRef} label={unread ? `알림 ${unread}개 안 읽음` : '알림'} active={bellOpen} className={`rail__bell${unread ? ' has-unread' : ''}`} onClick={() => setBellOpen((o) => !o)} icon={<Bell />} expanded={bellOpen} />
      <RailButton label="도움말" onClick={onHelp} icon={<CircleHelp />} />
      {bellOpen && <NoticePanel anchor={bellRef.current} items={notices} onClose={() => setBellOpen(false)} onOpen={onNotice} />}
    </nav>
  )
}

function RailButton({ label, icon, active, onClick, className, disabled, btnRef, expanded }: { label: string; icon: ReactNode; active?: boolean; onClick?: () => void; className?: string; disabled?: boolean; btnRef?: React.Ref<HTMLButtonElement>; expanded?: boolean }) {
  return (
    <button ref={btnRef} className={`rail__btn${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`} onClick={onClick} disabled={disabled} aria-label={label} aria-current={active && expanded === undefined ? 'page' : undefined} aria-expanded={expanded} data-tooltip={label}>
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
