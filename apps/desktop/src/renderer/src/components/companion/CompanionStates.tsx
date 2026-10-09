// 40 §2.2 · §4 캐릭터가 한 번씩 나오는 상태 화면: 오늘 비어 있음 · 모두 완료(49 §8.2: 3D 170) · 오프라인 띠(S 24) · 앱 전체 오류(M 64).
// 제목은 기존 해요체 문구, 둘째 줄만 캐릭터 말(반말, 실제 숫자). 평범한 빈 리스트·태그·필터는 EmptyState 선화 그대로(결정 ③).
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { allDoneLine, COMPANION_SIZE, OFFLINE_BANNER_AFTER_MS, OFFLINE_BANNER_TEXT, todayEmptyLines } from '@sprout/schema/companion'
import { useAuth } from '../../data/auth'
import { useQuery } from '../../data/useQuery'
import { CharacterArt } from '../growth/CharacterArt'
import { CompanionFace, useCompanion } from './CompanionFace'

/** 오늘 완료한 할 일 수(로컬 자정부터) */
function useTodayDone() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const row = useQuery<{ n: number }>('SELECT COUNT(*) AS n FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ?', [start.toISOString()])
  return row?.[0]?.n ?? 0
}

/** 49 §8.2 은은하게: 할 일 화면 빈 상태 그림은 3D 캐릭터 170 */
const EMPTY_ART = 170

/** 오늘 비어 있음: smile · 누를 때마다 깡충 + 다음 문장 */
export function TodayEmpty() {
  const me = useCompanion()
  const done = useTodayDone()
  const [i, setI] = useState(0)
  const lines = todayEmptyLines({ todayDone: done, hour: new Date().getHours(), egg: me.egg })
  return (
    <div className="empty companion-state is-character">
      <CompanionFace species={me.species} stage={me.stage} size={EMPTY_ART} mood="smile" loop={me.egg ? 'wiggle' : null} play={i ? { move: 'hop', n: i } : null} onPress={() => setI((n) => n + 1)} label={me.label} />
      <p className="companion-state__title">오늘 할 일이 없어요</p>
      <p className="companion-state__line" aria-live="polite">{lines[i % lines.length]}</p>
    </div>
  )
}

/** 모두 완료: content · 오늘 한 개수 */
export function AllDoneEmpty() {
  const me = useCompanion()
  const done = useTodayDone()
  const [n, setN] = useState(0)
  return (
    <div className="empty companion-state is-character">
      <CompanionFace species={me.species} stage={me.stage} size={EMPTY_ART} mood="content" play={n ? { move: 'hop', n } : null} onPress={() => setN((x) => x + 1)} label={me.label} />
      <p className="companion-state__title">모두 완료했어요</p>
      <p className="companion-state__line">{allDoneLine(done, me.egg)}</p>
    </div>
  )
}

/** 오프라인 띠: 30초 넘게 끊겨 있을 때만 목록 머리 아래 한 줄. 다시 연결되면 사라진다(레일 ⟳ 빨간 점은 그대로) */
export function OfflineBand() {
  const sync = useAuth().state?.sync
  const offline = !!sync && !sync.connected
  const [show, setShow] = useState(false)
  const me = useCompanion()
  useEffect(() => {
    if (!offline) { setShow(false); return }
    const t = setTimeout(() => setShow(true), OFFLINE_BANNER_AFTER_MS)
    return () => clearTimeout(t)
  }, [offline])
  if (!show) return null
  return (
    <div className="companion-band" role="status">
      <CompanionFace species={me.species} stage={me.stage} size={COMPANION_SIZE.banner} mood="sleepy" />
      <span>{OFFLINE_BANNER_TEXT}</span>
    </div>
  )
}

/** 작은 오류 울타리: 안쪽이 터지면 fallback */
class Guard extends Component<{ children: ReactNode; fallback: ReactNode; onError?: (e: unknown) => void }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  componentDidCatch(e: unknown) { this.props.onError?.(e) }
  render() { return this.state.error ? this.props.fallback : this.props.children }
}
/** 앱 전체 오류(그리다 터진 화면): puzzled + 기존 문구 + [다시 시도]. 캐릭터 말은 없다(§4) */
export function CompanionErrorBoundary({ children }: { children: ReactNode }) {
  return <Guard fallback={<AppErrorScreen />} onError={(e) => console.error('[app] 화면 오류', e)}>{children}</Guard>
}
function PuzzledFace() {
  const me = useCompanion()
  return <CompanionFace species={me.species} stage={me.stage} size={COMPANION_SIZE.m} mood="puzzled" play={{ move: 'tilt', n: 0 }} />
}
function AppErrorScreen() {
  const retry = useRef<HTMLButtonElement>(null)
  useEffect(() => { retry.current?.focus() }, [])
  return (
    <div className="companion-fatal" role="alert">
      <div className="companion-state">
        {/* 데이터를 못 읽는 오류면 캐릭터도 모르니 알 */}
        <Guard fallback={<span className="companion" style={{ width: COMPANION_SIZE.m, height: COMPANION_SIZE.m }} aria-hidden><CharacterArt species={null} size={COMPANION_SIZE.m} /></span>}><PuzzledFace /></Guard>
        <p className="companion-state__title">화면을 불러오지 못했어요. 다시 시도해 주세요.</p>
        <button ref={retry} className="companion-state__act" onClick={() => location.reload()}>다시 시도</button>
      </div>
    </div>
  )
}
