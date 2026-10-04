import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronRight, Eye, EyeOff, Gauge, MoreHorizontal, Pencil, Plus, RefreshCw, X } from 'lucide-react'
import { usageProviders, usageInfo, quotaIsStale, type UsageProvider, type UsageSnapshot, type QuotaAccount, type UsageLogin } from '../../../shared/usage'
import { readUsage, startUsageLogin, usageLoginStatus, cancelUsageLogin, submitUsageLoginCode, usageAvailable } from '../data/usage'
import { useLocalState } from '../data/preferences'
import { MenuItem, Popover } from './Popover'
import './usage.css'

// 10-ai-usage v2: 틱틱 목록 머리(아이콘 버튼) + 서비스별 접는 그룹 + 계정 카드 격자. 조회·로그인 로직은 v1 그대로.
type Preferences = Record<string, { alias?: string; hidden?: boolean }>
const statusLabel = { fresh: '최신', stale: '마지막 확인값', auth_required: '다시 로그인 필요', unavailable: '조회 불가', unsupported: '미지원', error: '조회 오류' }
const statusTone = { fresh: 'ok', stale: 'muted', auth_required: 'warn', unavailable: 'muted', unsupported: 'muted', error: 'warn' } as const

function resetLabel(value: string | null, now: number) {
  if (!value) return '초기화 시각 미제공'
  const ms = Date.parse(value) - now
  if (ms <= 0) return '초기화 시각이 지났어요 · 다시 확인 필요'
  const minutes = Math.ceil(ms / 60000)
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60
  const left = d ? `${d}일 ${h}시간` : h ? `${h}시간 ${m}분` : `${m}분`
  const at = new Date(value)
  const sameDay = at.toDateString() === new Date(now).toDateString()
  const when = sameDay ? at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : at.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return `${left} 뒤 초기화 · ${when}`
}
const timeKo = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
const dateTimeKo = (iso: string, now: number) => new Date(iso).toDateString() === new Date(now).toDateString() ? timeKo(iso) : new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
function ago(iso: string | undefined, now: number) {
  if (!iso) return '아직 확인 전'
  const min = Math.floor((now - Date.parse(iso)) / 60000)
  return min < 1 ? '방금 확인' : min < 60 ? `${min}분 전 확인` : `${timeKo(iso)} 확인`
}

export function UsageView() {
  const available = usageAvailable()
  const [snapshots, setSnapshots] = useState<Partial<Record<UsageProvider, UsageSnapshot>>>({})
  const [busy, setBusy] = useState<Partial<Record<UsageProvider, boolean>>>({})
  const [errors, setErrors] = useState<Partial<Record<UsageProvider, boolean>>>({})
  const [showHidden, setShowHidden] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [preferences, setPreferences] = useLocalState<Preferences>('sprout.usage.display', {})
  const [collapsed, setCollapsed] = useLocalState<UsageProvider[]>('sprout.usage.collapsed', [])
  const [pop, setPop] = useState<'connect' | 'more'>()
  const connectBtn = useRef<HTMLButtonElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const queued = useRef(new Set<UsageProvider>())
  const active = useRef(new Set<UsageProvider>())
  const mounted = useRef(false)
  const refresh = useCallback(async (provider: UsageProvider, force = false) => {
    if (active.current.has(provider)) { if (force) queued.current.add(provider); return }
    active.current.add(provider)
    setBusy((old) => ({ ...old, [provider]: true }))
    try {
      const data = await readUsage(provider, force)
      if (mounted.current) { setSnapshots((old) => ({ ...old, [provider]: data })); setErrors((old) => ({ ...old, [provider]: false })) }
    } catch (e) {
      console.warn('[usage]', provider, e) // 원문 오류는 개발 로그로만(10 §4)
      if (mounted.current) setErrors((old) => ({ ...old, [provider]: true }))
    } finally {
      active.current.delete(provider)
      if (mounted.current) setBusy((old) => ({ ...old, [provider]: false }))
      if (mounted.current && queued.current.delete(provider)) void refresh(provider, true)
    }
  }, [])
  useEffect(() => {
    if (!available) return
    mounted.current = true
    const update = () => { if (!document.hidden) usageProviders.forEach((p) => void refresh(p)) }
    usageProviders.forEach((p) => void refresh(p)) // 처음 열 때는 창이 가려져 있어도 조회
    const timer = setInterval(update, 300000)
    const clock = setInterval(() => setNow(Date.now()), 30000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => { mounted.current = false; clearInterval(timer); clearInterval(clock); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update) }
  }, [refresh, available])
  // 초기화 시각이 지난 값은 다시 조회
  useEffect(() => {
    for (const p of usageProviders) {
      const s = snapshots[p]
      if (s?.accounts.some((a) => a.windows.some((w) => w.resetsAt && Date.parse(w.resetsAt) <= now && Date.parse(s.checkedAt) < Date.parse(w.resetsAt)))) void refresh(p)
    }
  }, [now, snapshots, refresh])

  const anyBusy = Object.values(busy).some(Boolean)
  const lastChecked = Object.values(snapshots).map((s) => s?.checkedAt).filter(Boolean).sort().pop()
  const patch = (id: string, value: { alias?: string; hidden?: boolean }) => setPreferences({ ...preferences, [id]: { ...preferences[id], ...value } })
  const toggle = (p: UsageProvider) => setCollapsed(collapsed.includes(p) ? collapsed.filter((x) => x !== p) : [...collapsed, p])
  const installed = Object.values(snapshots).every((s) => s?.installed !== false)
  const total = Object.values(snapshots).flatMap((s) => s?.accounts ?? []).length

  return (
    <main className="usage-view">
      <header className="pane-header">
        <h1 className="pane-header__title usage-view__title">AI 사용량</h1>
        {available && (
          <div className="pane-header__actions">
            <span className="usage-view__checked">{ago(lastChecked, now)} · 5분마다 자동</span>
            <button className="icon-btn" aria-label="전체 갱신" disabled={anyBusy} onClick={() => usageProviders.forEach((p) => void refresh(p, true))}><RefreshCw className={anyBusy ? 'usage-spin' : ''} /></button>
            <button ref={connectBtn} className="icon-btn" aria-label="계정 연결" onClick={() => setPop(pop === 'connect' ? undefined : 'connect')}><Plus /></button>
            <button ref={moreBtn} className="icon-btn" aria-label="AI 사용량 메뉴" onClick={() => setPop(pop === 'more' ? undefined : 'more')}><MoreHorizontal /></button>
          </div>
        )}
      </header>
      {!available ? (
        <div className="empty"><Gauge className="usage-empty-icon" /><p className="empty__title">AI 사용량은 데스크톱 앱에서만 볼 수 있어요</p></div>
      ) : (
        <div className="usage-scroll">
          {!installed && <div className="usage-banner"><AlertTriangle />한도 조회 도구(CodexBar)가 설치되어 있지 않아요.<a href="https://github.com/steipete/CodexBar" target="_blank" rel="noreferrer">설치 안내</a></div>}
          {Object.keys(snapshots).length === usageProviders.length && total === 0 && !anyBusy && (
            <div className="empty"><Gauge className="usage-empty-icon" /><p className="empty__title">AI 구독 한도를 한곳에서 보세요</p><button className="usage-btn is-primary" onClick={() => setPop('connect')}>계정 연결</button></div>
          )}
          {usageProviders.map((provider) => {
            const data = snapshots[provider]
            const all = data?.accounts ?? []
            const visible = all.filter((a) => showHidden || !preferences[a.id]?.hidden)
            const closed = collapsed.includes(provider)
            const best = all.flatMap((a) => (a.status === 'fresh' ? a.windows : [])).filter((w) => w.remainingPercent !== null).sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0))[0]
            const summary = provider === 'gemini' && !all.length ? '앱에서 계정 추가 미지원' : best ? `${best.label} ${Math.round(best.remainingPercent!)}% 남음` : ''
            return (
              <section key={provider} className="usage-group">
                <div className="group__header usage-group__header" onClick={() => toggle(provider)}>
                  <ChevronDown className={`group__chevron${closed ? ' is-collapsed' : ''}`} />
                  <span className="group__name">{usageInfo[provider].name}</span>
                  <span className="group__count">{all.length}</span>
                  {closed && summary && <span className="usage-group__summary">{summary}</span>}
                  {busy[provider] && <RefreshCw className="usage-group__busy usage-spin" />}
                </div>
                {!closed && (
                  <>
                    {errors[provider] && (
                      <div className="usage-error" role="alert">
                        <AlertTriangle />
                        <span>{usageInfo[provider].name} 한도를 가져오지 못했어요. 잠시 뒤 자동으로 다시 시도해요.</span>
                        <button className="usage-btn" disabled={busy[provider]} onClick={() => void refresh(provider, true)}>지금 다시 시도</button>
                      </div>
                    )}
                    <div className="usage-grid">
                      {!data ? <article className="usage-card is-loading"><span /><span /><span /></article>
                        : !visible.length ? (
                          <article className="usage-card is-empty">
                            <span className="usage-card__muted">{all.length ? '숨긴 계정만 있어요' : `연결된 ${usageInfo[provider].name} 계정이 없어요`}</span>
                            {all.length ? <button className="usage-link" onClick={() => setShowHidden(true)}><Eye />숨긴 계정 보기</button>
                              : provider !== 'gemini' && <button className="usage-link" onClick={() => setPop('connect')}><Plus />{usageInfo[provider].name} 계정 연결</button>}
                          </article>
                        ) : visible.map((account) => (
                          <AccountCard key={account.id} account={account} preference={preferences[account.id]} onPatch={(v) => patch(account.id, v)} now={now} failed={!!errors[provider]} busy={!!busy[provider]} onRefresh={() => void refresh(provider, true)} onReconnect={() => setPop('connect')} />
                        ))}
                    </div>
                  </>
                )}
              </section>
            )
          })}
          <p className="usage-footnote">이 화면에서 연결한 계정과 기존 CodexBar 계정을 함께 보여줘요. 서비스 사이의 한도는 합치지 않아요. ‘숨기기’는 로그인 상태를 바꾸지 않아요.</p>
        </div>
      )}
      {pop === 'more' && (
        <Popover anchor={moreBtn.current} align="end" width={200} onClose={() => setPop(undefined)} className="menu">
          <MenuItem icon={showHidden ? <EyeOff /> : <Eye />} label={showHidden ? '숨긴 계정 감추기' : '숨긴 계정 보기'} onClick={() => { setShowHidden(!showHidden); setPop(undefined) }} />
          <MenuItem icon={<ArrowUpRight />} label="CodexBar 안내" onClick={() => { window.open('https://github.com/steipete/CodexBar', '_blank'); setPop(undefined) }} />
        </Popover>
      )}
      {pop === 'connect' && <ConnectPopover anchor={connectBtn.current} onClose={() => setPop(undefined)} onConnected={(p) => void refresh(p, true)} />}
    </main>
  )
}

/** 계정 연결 팝오버(폭 320): 서비스 고르기 → 공식 로그인 대기(인증 코드 칸) → 완료. 진행 중엔 닫히지 않는다 — 10 §5 */
function ConnectPopover({ anchor, onClose, onConnected }: { anchor: HTMLElement | null; onClose: () => void; onConnected: (p: UsageProvider) => void }) {
  const [login, setLogin] = useState<UsageLogin | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [code, setCode] = useState('')
  const ref = useRef<UsageLogin | null>(null)
  const waiting = login?.status === 'waiting'
  const begin = async (provider: UsageProvider) => {
    setNotice(''); setCode(''); setBusy(true)
    try { const s = await startUsageLogin(provider); ref.current = s; setLogin(s) } catch { setNotice('로그인을 시작하지 못했어요. 다시 시도해 주세요.') } finally { setBusy(false) }
  }
  const cancel = async () => {
    setCode('')
    if (!ref.current) return
    try { const s = await cancelUsageLogin(ref.current.id); ref.current = s; setLogin(s) } catch { setNotice('로그인을 취소하지 못했어요. 다시 시도해 주세요.') }
  }
  const send = async () => {
    if (!login) return
    setBusy(true)
    try { const s = await submitUsageLoginCode(login.id, code.trim()); setCode(''); ref.current = s; setLogin(s) } catch { setNotice('인증 코드를 확인하지 못했어요.') } finally { setBusy(false) }
  }
  useEffect(() => {
    if (login?.status !== 'waiting') return
    let stopped = false, inFlight = false
    const timer = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        const s = await usageLoginStatus(login.id)
        if (stopped) return
        ref.current = s; setLogin(s)
        if (s.status === 'connected') onConnected(s.provider)
      } catch { if (!stopped) setNotice('로그인 상태를 확인하지 못했어요. 계속 확인하고 있어요.') } finally { inFlight = false }
    }, 1500)
    return () => { stopped = true; clearInterval(timer) }
  }, [login?.id, login?.status, onConnected])
  useEffect(() => () => { if (ref.current?.status === 'waiting') void cancelUsageLogin(ref.current.id).catch(() => {}) }, [])
  const close = () => { if (busy || waiting) { setNotice('진행 중인 로그인을 먼저 취소해 주세요.'); return } onClose() }
  return (
    <Popover anchor={anchor} align="end" width={320} onClose={close} className="menu usage-connect">
      <div className="usage-connect__head"><strong>AI 계정 연결</strong><button className="icon-btn" aria-label="닫기" onClick={close}><X /></button></div>
      {!login || login.status === 'cancelled' || login.status === 'error' ? (
        <>
          <p className="usage-connect__text">서비스를 고르면 공식 로그인 페이지가 열려요.</p>
          {usageProviders.map((p) => (
            <button key={p} className="usage-connect__row" disabled={p === 'gemini' || busy} onClick={() => void begin(p)}>
              <span>{usageInfo[p].name}</span>
              {p === 'gemini' ? <small>앱에서 계정 추가 미지원</small> : <ChevronRight />}
            </button>
          ))}
          {login && <p className="usage-connect__status">{usageInfo[login.provider].name} · {login.status === 'cancelled' ? '취소됨' : '연결 실패'} — {login.message}</p>}
          <small className="usage-connect__foot">계정마다 로그인을 따로 보관해요. 기존 CLI 계정은 바꾸지 않아요.</small>
        </>
      ) : login.status === 'connected' ? (
        <div className="usage-connect__done"><p>{usageInfo[login.provider].name} 계정을 연결했어요.</p><button className="usage-btn is-primary" onClick={onClose}>확인</button></div>
      ) : (
        <div className="usage-connect__wait" role="status">
          <p><strong>{usageInfo[login.provider].name}</strong> · 브라우저에서 로그인해 주세요.</p>
          <p className="usage-connect__text">{login.message}</p>
          {login.requiresCode && (
            <form className="usage-connect__code" onSubmit={(e) => { e.preventDefault(); void send() }}>
              <input type="password" autoComplete="off" aria-label="공식 페이지의 인증 코드" value={code} maxLength={4096} onChange={(e) => setCode(e.target.value)} placeholder="인증 코드 붙여넣기" />
              <button className="usage-btn is-primary" disabled={!code.trim() || busy}>연결</button>
            </form>
          )}
          <div className="usage-connect__actions">
            {login.url && <a href={login.url} target="_blank" rel="noreferrer">로그인 페이지 다시 열기<ArrowUpRight /></a>}
            <button className="usage-btn" onClick={() => void cancel()}>로그인 취소</button>
          </div>
        </div>
      )}
      {notice && <p className="usage-connect__notice" role="status">{notice}</p>}
    </Popover>
  )
}

function AccountCard({ account: a, preference, onPatch, now, failed, busy, onRefresh, onReconnect }: { account: QuotaAccount; preference?: Preferences[string]; onPatch: (p: Preferences[string]) => void; now: number; failed: boolean; busy: boolean; onRefresh: () => void; onReconnect: () => void }) {
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const stale = failed || quotaIsStale(a, now)
  const status = a.status === 'fresh' && stale ? 'stale' : a.status
  const exhausted = a.status === 'fresh' && !stale && a.windows.some((w) => w.remainingPercent === 0)
  const hasIdentity = !!a.identity || a.label !== '현재 로그인'
  const title = preference?.alias || (hasIdentity ? a.label : '현재 로그인 계정')
  const plan = [usageInfo[a.provider].scope, a.plan].filter(Boolean).join(' · ')
  const dim = status !== 'fresh'
  return (
    <article className={`usage-card${preference?.hidden ? ' is-hidden' : ''}`}>
      <div className="usage-card__head">
        <div>
          {editing ? (
            <input className="usage-card__alias" aria-label="계정 별칭" defaultValue={title} maxLength={50} autoFocus
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { onPatch({ alias: e.currentTarget.value.trim() }); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
              onBlur={() => setEditing(false)} />
          ) : <strong title={a.identity ?? undefined}>{title}</strong>}
          <span className="usage-card__muted">{preference?.alias && a.identity ? `${a.identity} · ` : ''}{plan}</span>
        </div>
        <span className={`usage-badge is-${exhausted ? 'danger' : statusTone[status]}`}>{exhausted ? '한도 도달' : statusLabel[status]}</span>
      </div>
      {a.windows.length > 0 && (
        <div className={`usage-windows${dim ? ' is-dim' : ''}`}>
          {a.windows.map((w) => (
            <div key={w.id} className="usage-window">
              <div className="usage-window__line"><span>{w.label}{dim ? ' · 마지막 확인값' : ''}</span><strong>{w.remainingPercent === null ? '조회 불가' : `${Math.round(w.remainingPercent)}% 남음`}</strong></div>
              {w.remainingPercent !== null && (
                <div className={`usage-meter${w.remainingPercent <= 10 ? ' is-low' : ''}`} role="meter" aria-label={`${w.label} 남은 한도`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.remainingPercent}><i style={{ width: `${w.remainingPercent}%` }} /></div>
              )}
              <span className="usage-card__muted">{w.remainingPercent === 0 && !dim ? '확인 시점에 한도 도달 · ' : ''}{resetLabel(w.resetsAt, now)}</span>
            </div>
          ))}
          {dim && a.observedAt && <span className="usage-card__muted">{dateTimeKo(a.observedAt, now)} 확인 — 지금 값은 다를 수 있어요</span>}
        </div>
      )}
      {!a.windows.length && a.reason && <p className="usage-card__muted">{a.reason}</p>}
      <div className="usage-card__foot">
        <span className="usage-card__muted">{status === 'auth_required' ? '로그인이 만료됐어요' : a.observedAt ? `${dateTimeKo(a.observedAt, now)} 확인` : '성공한 조회 없음'}</span>
        {status === 'auth_required' && a.provider !== 'gemini' ? <button className="usage-btn is-primary" onClick={onReconnect}>다시 로그인</button>
          : <button ref={moreRef} className="icon-btn" aria-label={`${title} 메뉴`} onClick={() => setMenu(!menu)}><MoreHorizontal /></button>}
      </div>
      {menu && (
        <Popover anchor={moreRef.current} align="end" width={180} onClose={() => setMenu(false)} className="menu">
          {hasIdentity && <MenuItem icon={<Pencil />} label="별칭 바꾸기" onClick={() => { setMenu(false); setEditing(true) }} />}
          <MenuItem icon={<RefreshCw />} label="이 서비스 갱신" disabled={busy} onClick={() => { setMenu(false); onRefresh() }} />
          {hasIdentity && <MenuItem icon={preference?.hidden ? <Eye /> : <EyeOff />} label={preference?.hidden ? '다시 표시' : '숨기기'} onClick={() => { setMenu(false); onPatch({ hidden: !preference?.hidden }) }} />}
          <MenuItem icon={<ArrowUpRight />} label="원본 페이지 열기" onClick={() => { setMenu(false); window.open(usageInfo[a.provider].url, '_blank') }} />
        </Popover>
      )}
    </article>
  )
}
