import { useEffect, useState } from 'react'
import { useAuth } from '../../data/auth'
import { initialState, loadState, OPEN_EVENT, reopen, saveState, shouldOpen, type OnboardingState } from '../../data/onboarding'
import { Onboarding } from './Onboarding'

// 18 첫 실행 안내를 띄우는 자리. App.tsx의 Shell 안에 한 번 둔다(로그인 뒤에만 그려지는 곳).
// - 새 계정이면(가입·구글·애플 첫 로그인) 한 번 연다. 끝내거나 건너뛰면 다시 저절로 열지 않는다.
// - 중간에 앱을 끄면 다음 실행에 그 단계부터 이어 연다. Esc·✕는 이번 실행 동안만 닫는다(다음 실행에 이어서).
// - ⌘K·설정에서 openOnboarding()으로 다시 연다.
export function OnboardingHost({ onOpenCalendar }: { onOpenCalendar?: () => void }) {
  const { state: auth, enabled } = useAuth()
  const userId = enabled ? auth?.user?.id ?? null : 'preview'
  const email = auth?.user?.email ?? 'preview'
  const newAccount = !!auth?.newAccount
  const [st, setSt] = useState<OnboardingState | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!userId) return
    const stored = loadState(userId)
    const decision = shouldOpen(stored, newAccount)
    if (!decision) return
    const s = stored ?? initialState()
    saveState(userId, s)
    // 10 §2.2의 "첫 로그인 뒤 성향 조사 권하기"는 이 안내의 한 단계가 된다 → 따로 한 번 더 뜨지 않게
    try { localStorage.setItem(`sprout.survey.prompted.${email}`, '1') } catch { /* */ }
    setSt(s)
    setOpen(true)
  }, [userId, newAccount, email])

  useEffect(() => {
    if (!userId) return
    const on = () => {
      const s = reopen(loadState(userId))
      saveState(userId, s)
      setSt(s)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [userId])

  if (!open || !st || !userId) return null
  const ready = !enabled || !!auth?.sync.lastSyncedAt // 첫 동기화 전에는 캐릭터·할 일을 만들지 않는다(10 §2.2와 같은 이유)
  return (
    <Onboarding
      state={st}
      ready={ready}
      onChange={(s) => { setSt(s); saveState(userId, s); if (s.done) setOpen(false) }}
      onHide={() => setOpen(false)}
      onOpenCalendar={onOpenCalendar}
    />
  )
}
