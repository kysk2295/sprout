import { useEffect, useState } from 'react'
import { CircleUser, Keyboard, ListFilter, Palette, X } from 'lucide-react'
import { authApi, useAuth } from '../data/auth'
import { savePreferences, usePreferences, type Visibility } from '../data/preferences'
import { Dialog } from './Dialog'
import { ThemePicker } from './ThemePicker'
export const SHORTCUTS = [
  ['명령 메뉴', '⌘K'], ['검색', '⌘F'], ['할 일 추가', '⌘N'], ['설정', '⌘, · G → S'],
  ['전체', 'G → A'], ['오늘', 'G → T'], ['내일', 'G → R'], ['다음 7일', 'G → N'], ['기본함', 'G → I'],
  ['완료', 'G → C'], ['계획 취소', 'G → W'], ['휴지통', 'G → G'], ['실행 취소', '⌘Z'],
  ['일 / 주 / 월', 'D / W / M'], ['캘린더 오늘', 'T'], ['사이드바 접기', '⌘\\']
]
const SMART = [['all','전체'],['today','오늘'],['tomorrow','내일'],['next7','다음 7일'],['inbox','기본함'],['filters','필터'],['tags','태그'],['completed','완료'],['wontdo','계획 취소'],['trash','휴지통']]
export function DesktopSettings({ onClose, initial = authApi() ? 'account' : 'smart' }: { onClose: () => void; initial?: string }) {
  useEffect(()=>{if(new URLSearchParams(location.search).get('window')==='settings'){document.documentElement.dataset.settingsWindow='true';document.title='설정'}},[])
  const [tab, setTab] = useState(initial)
  const prefs = usePreferences()
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const apply = () => { document.documentElement.dataset.theme = prefs.followDark && media.matches ? 'dark' : prefs.theme }; apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply) }, [prefs.theme, prefs.followDark])
  const [error, setError] = useState('')
  const save = async (patch: Parameters<typeof savePreferences>[0]) => { try { await savePreferences(patch); setError('') } catch { setError('설정을 저장하지 못했어요. 다시 시도해 주세요.') } }
  return <Dialog label="설정" className="settings-dialog" onClose={onClose}>
    <nav className="settings-nav" aria-label="설정 항목">
      <button className="icon-btn" aria-label="설정 닫기" onClick={onClose}><X /></button><h2>설정</h2>
      {([...(authApi() ? [['account','계정',CircleUser]] as const : []),['smart','스마트 목록',ListFilter],['appearance','외관',Palette],['shortcuts','단축키',Keyboard]] as const).map(([id,label,Icon]) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}><Icon />{label}</button>)}
    </nav>
    <section className="settings-content">
      {error && <p role="alert" className="form-error">{error}</p>}
      {tab === 'account' && <AccountPane />}
      {tab === 'smart' && <><h2>스마트 목록</h2><div className="settings-card">{SMART.map(([id,label]) => <label className="settings-row" key={id}><span>{label}</span><select aria-label={`${label} 표시`} disabled={id === 'inbox' || !prefs.ready} value={id === 'inbox' ? 'show' : prefs.visibility[id] ?? 'show'} onChange={(e) => void save({smart_list_visibility: JSON.stringify({...prefs.visibility,[id]:e.target.value as Visibility})})}><option value="show">보이기</option><option value="hide">숨기기</option><option value="auto">비어있지 않으면 표시</option></select></label>)}</div></>}
      {tab === 'appearance' && <><h2>테마</h2><ThemePicker save={save} /></>}
      {tab === 'shortcuts' && <><h2>단축키</h2><div className="settings-card">{SHORTCUTS.map(([label,key]) => <div className="settings-row" key={label}><span>{label}</span><kbd>{window.sprout?.platform === 'win32' ? key.replaceAll('⌘','Ctrl+') : key}</kbd></div>)}</div></>}
    </section>
  </Dialog>
}

/** 08 §7 계정: 이메일 · 동기화 상태 · 로그아웃(확인 후 이 기기 데이터 삭제) */
function AccountPane() {
  const { state } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const sync = state?.sync
  const status = !sync ? '' : !sync.connected ? '오프라인 — 연결되면 자동으로 올라가요' : sync.error ? '동기화에 실패했어요 — 다시 시도하는 중'
    : sync.lastSyncedAt ? `마지막 동기화 ${new Date(sync.lastSyncedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '동기화 중'
  // 로그아웃한 뒤(설정 창이 열려 있을 때)에는 "?"·오프라인 문구·로그아웃 버튼 대신 안내만
  if (state && !state.user) return <div className="account"><span className="account__sync">로그인되어 있지 않아요. 앱 창에서 로그인하면 계정 정보가 여기에 보여요.</span></div>
  if (!state) return <div className="account" />
  return <>
    <div className="account">
      <span className="account__avatar">{(state?.user?.email?.[0] ?? '?').toUpperCase()}</span>
      <strong className="account__email">{state?.user?.email}</strong>
      <span className="account__sync">{status}</span>
      <button className="account__logout" disabled={busy} onClick={() => setConfirm(true)}>로그아웃</button>
    </div>
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
