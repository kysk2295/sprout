import { useEffect, useState } from 'react'
import { CircleUser, Keyboard, ListFilter, Palette, Plug, X } from 'lucide-react'
import { authApi, deleteErrorText, deleteMode, deleteReady, DELETE_WORD, providerLabel, useAuth, type DeleteMode } from '../data/auth'
import './account-delete.css'
import { savePreferences, usePreferences, type Visibility } from '../data/preferences'
import { Dialog } from './Dialog'
import { ThemePicker } from './ThemePicker'
import { IntegrationsPane } from './calendars/IntegrationsPane'
import { SETTINGS_TAB_KEY } from '../data/calendars'
/** 16: 다른 창(캘린더 `...` › 캘린더 구독)이 고른 탭 — 한 번 읽고 지운다 */
const takeTab = () => { try { const t = localStorage.getItem(SETTINGS_TAB_KEY); if (t) localStorage.removeItem(SETTINGS_TAB_KEY); return t } catch { return null } }
export const SHORTCUTS = [
  ['명령 메뉴', '⌘K'], ['검색', '⌘F'], ['할 일 추가', '⌘N'], ['설정', '⌘, · G → S'],
  ['전체', 'G → A'], ['오늘', 'G → T'], ['내일', 'G → R'], ['다음 7일', 'G → N'], ['기본함', 'G → I'],
  ['완료', 'G → C'], ['계획 취소', 'G → W'], ['휴지통', 'G → G'], ['실행 취소', '⌘Z'],
  ['일 / 주 / 월', 'D / W / M'], ['캘린더 오늘', 'T'], ['사이드바 접기', '⌘\\']
]
const SMART = [['all','전체'],['today','오늘'],['tomorrow','내일'],['next7','다음 7일'],['inbox','기본함'],['filters','필터'],['tags','태그'],['completed','완료'],['wontdo','계획 취소'],['trash','휴지통']]
export function DesktopSettings({ onClose, initial = authApi() ? 'account' : 'smart' }: { onClose: () => void; initial?: string }) {
  useEffect(()=>{if(new URLSearchParams(location.search).get('window')==='settings'){document.documentElement.dataset.settingsWindow='true';document.title='설정'}},[])
  const [tab, setTab] = useState(() => takeTab() ?? initial)
  useEffect(() => { const on = (e: StorageEvent) => { if (e.key === SETTINGS_TAB_KEY && e.newValue) { const t = takeTab(); if (t) setTab(t) } }; window.addEventListener('storage', on); return () => window.removeEventListener('storage', on) }, [])
  const prefs = usePreferences()
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const apply = () => { document.documentElement.dataset.theme = prefs.followDark && media.matches ? 'dark' : prefs.theme }; apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply) }, [prefs.theme, prefs.followDark])
  const [error, setError] = useState('')
  const save = async (patch: Parameters<typeof savePreferences>[0]) => { try { await savePreferences(patch); setError('') } catch { setError('설정을 저장하지 못했어요. 다시 시도해 주세요.') } }
  return <Dialog label="설정" className="settings-dialog" onClose={onClose}>
    <nav className="settings-nav" aria-label="설정 항목">
      <button className="icon-btn" aria-label="설정 닫기" onClick={onClose}><X /></button><h2>설정</h2>
      {([...(authApi() ? [['account','계정',CircleUser]] as const : []),['smart','스마트 목록',ListFilter],['appearance','외관',Palette],['integrations','연동',Plug],['shortcuts','단축키',Keyboard]] as const).map(([id,label,Icon]) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}><Icon />{label}</button>)}
    </nav>
    <section className="settings-content">
      {error && <p role="alert" className="form-error">{error}</p>}
      {tab === 'account' && <AccountPane />}
      {tab === 'smart' && <><h2>스마트 목록</h2><div className="settings-card">{SMART.map(([id,label]) => <label className="settings-row" key={id}><span>{label}</span><select aria-label={`${label} 표시`} disabled={id === 'inbox' || !prefs.ready} value={id === 'inbox' ? 'show' : prefs.visibility[id] ?? 'show'} onChange={(e) => void save({smart_list_visibility: JSON.stringify({...prefs.visibility,[id]:e.target.value as Visibility})})}><option value="show">보이기</option><option value="hide">숨기기</option><option value="auto">비어있지 않으면 표시</option></select></label>)}</div></>}
      {tab === 'appearance' && <><h2>테마</h2><ThemePicker save={save} /></>}
      {tab === 'integrations' && <IntegrationsPane />}
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
    <DeleteAccount />
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

/** 08 §7.1 계정 삭제: 계정 탭 맨 아래 빨간 글자 → 같은 자리 카드 안에서 확인(틱틱 설정 › 계정 맨 아래 "Delete Account", research 24) */
function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<{ mode: DeleteMode; providers: string[] } | null>(null)
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [reauthed, setReauthed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const api = authApi()
  const reset = () => { setOpen(false); setPassword(''); setConfirmText(''); setReauthed(false); setError(''); void api?.reauthEnd?.() }
  const start = async () => {
    if (!api?.account) return
    setOpen(true); setError(''); setInfo(null)
    const r = await api.account()
    if (!r.ok) return setError(deleteErrorText(r.error, r.error === 'unauthorized' ? 401 : 0))
    setInfo({ mode: deleteMode(r.hasPassword), providers: r.providers })
  }
  const reauth = async () => {
    if (!api?.social || !info) return
    setBusy(true); setError('')
    await api.reauthBegin()
    const r = await api.social(info.providers.includes('apple') && !info.providers.includes('google') ? 'apple' : 'google')
    setBusy(false)
    if (r.ok) setReauthed(true)
    else if (!('code' in r && r.code === 'cancelled')) setError(`${r.error} 삭제할 계정과 같은 계정으로 로그인하세요.`)
  }
  const submit = async () => {
    if (!api?.deleteAccount || !info || !deleteReady({ mode: info.mode, confirmText, password, reauthed, busy })) return
    setBusy(true); setError('')
    const r = await api.deleteAccount(info.mode === 'password' ? password : undefined)
    // 성공하면 메인 프로세스가 이 기기 데이터를 지우고 설정 창을 닫는다 → 로그인 화면에 "계정을 삭제했어요"
    if (r.ok) return
    setBusy(false)
    setError(deleteErrorText(r.error, r.status, info.providers))
    if (/reauth required/.test(r.error)) setReauthed(false)
  }
  if (!api?.deleteAccount) return null
  if (!open) return <div className="account-delete"><button className="account-delete__link" onClick={() => void start()}>계정 삭제</button></div>
  const ready = !!info && deleteReady({ mode: info.mode, confirmText, password, reauthed, busy })
  return <form className="account-delete settings-card account-delete--open" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
    <h3>계정을 삭제할까요?</h3>
    <p>모든 할 일·일기·수집함·캐릭터와 성장 기록이 서버와 모든 기기에서 지워져요. <strong>되돌릴 수 없어요.</strong></p>
    {!info && !error && <p className="account-delete__muted">확인하는 중…</p>}
    {info?.mode === 'password' && <label className="account-delete__field"><span>비밀번호</span>
      <input type="password" autoComplete="current-password" autoFocus value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" /></label>}
    {info?.mode === 'social' && <div className="account-delete__field"><span>본인 확인</span>
      {reauthed ? <em className="account-delete__ok">다시 로그인했어요. 10분 안에 삭제하세요.</em>
        : <button type="button" className="account-delete__btn" disabled={busy} onClick={() => void reauth()}>{providerLabel(info.providers)}로 방금 다시 로그인</button>}</div>}
    {info && <label className="account-delete__field"><span>확인하려면 "{DELETE_WORD}"를 입력하세요</span>
      <input value={confirmText} disabled={busy} onChange={(e) => setConfirmText(e.target.value)} placeholder={DELETE_WORD} /></label>}
    {error && <p role="alert" className="account-delete__error">{error}</p>}
    <footer>
      <button type="button" className="account-delete__btn" disabled={busy} onClick={reset}>취소</button>
      <button type="submit" className="account-delete__btn account-delete__btn--danger" disabled={!ready}>계정 삭제</button>
    </footer>
  </form>
}
