import { useEffect, useState } from 'react'
import { Keyboard, ListFilter, Palette, X } from 'lucide-react'
import { savePreferences, usePreferences, type Visibility } from '../data/preferences'
import { Dialog } from './Dialog'
export const SHORTCUTS = [
  ['명령 메뉴', '⌘K'], ['검색', '⌘F'], ['할 일 추가', '⌘N'], ['설정', '⌘, · G → S'],
  ['전체', 'G → A'], ['오늘', 'G → T'], ['내일', 'G → R'], ['다음 7일', 'G → N'], ['기본함', 'G → I'],
  ['완료', 'G → C'], ['계획 취소', 'G → W'], ['휴지통', 'G → G'], ['실행 취소', '⌘Z'],
  ['일 / 주 / 월', 'D / W / M'], ['캘린더 오늘', 'T'], ['사이드바 접기', '⌘\\']
]
const SMART = [['all','전체'],['today','오늘'],['tomorrow','내일'],['next7','다음 7일'],['inbox','기본함'],['filters','필터'],['tags','태그'],['completed','완료'],['wontdo','계획 취소'],['trash','휴지통']]
export function DesktopSettings({ onClose, initial = 'smart' }: { onClose: () => void; initial?: string }) {
  useEffect(()=>{if(new URLSearchParams(location.search).get('window')==='settings'){document.documentElement.dataset.settingsWindow='true';document.title='설정'}},[])
  const [tab, setTab] = useState(initial)
  const prefs = usePreferences()
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const apply = () => { document.documentElement.dataset.theme = prefs.followDark && media.matches ? 'dark' : prefs.theme }; apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply) }, [prefs.theme, prefs.followDark])
  const [error, setError] = useState('')
  const save = async (patch: Parameters<typeof savePreferences>[0]) => { try { await savePreferences(patch); setError('') } catch { setError('설정을 저장하지 못했어요. 다시 시도해 주세요.') } }
  return <Dialog label="설정" className="settings-dialog" onClose={onClose}>
    <nav className="settings-nav" aria-label="설정 항목">
      <button className="icon-btn" aria-label="설정 닫기" onClick={onClose}><X /></button><h2>설정</h2>
      {([['smart','스마트 목록',ListFilter],['appearance','외관',Palette],['shortcuts','단축키',Keyboard]] as const).map(([id,label,Icon]) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}><Icon />{label}</button>)}
    </nav>
    <section className="settings-content">
      {error && <p role="alert" className="form-error">{error}</p>}
      {tab === 'smart' && <><h2>스마트 목록</h2><div className="settings-card">{SMART.map(([id,label]) => <label className="settings-row" key={id}><span>{label}</span><select aria-label={`${label} 표시`} disabled={id === 'inbox' || !prefs.ready} value={id === 'inbox' ? 'show' : prefs.visibility[id] ?? 'show'} onChange={(e) => void save({smart_list_visibility: JSON.stringify({...prefs.visibility,[id]:e.target.value as Visibility})})}><option value="show">보이기</option><option value="hide">숨기기</option><option value="auto">비어있지 않으면 표시</option></select></label>)}</div></>}
      {tab === 'appearance' && <><h2>테마</h2><p className="settings-caption">색상 시리즈</p><div className="theme-grid">{[['default','기본값'],['sky','Sky'],['dark','Dark']].map(([id,label]) => <button key={id} aria-pressed={prefs.theme === id} onClick={() => void save({theme:id})}><span className={`theme-swatch theme-swatch--${id}`}>{prefs.theme === id && '✓'}</span>{label}</button>)}</div><label className="settings-row settings-card"><span>시스템 외관에 따라 다크 테마 자동 전환</span><input type="checkbox" checked={prefs.followDark} onChange={(e) => void save({follow_system_dark:e.target.checked ? 1 : 0})} /></label></>}
      {tab === 'shortcuts' && <><h2>단축키</h2><div className="settings-card">{SHORTCUTS.map(([label,key]) => <div className="settings-row" key={label}><span>{label}</span><kbd>{window.sprout?.platform === 'win32' ? key.replaceAll('⌘','Ctrl+') : key}</kbd></div>)}</div></>}
    </section>
  </Dialog>
}
