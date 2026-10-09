// 49 §7.1 휴대폰 흔들기 → 캐릭터 어지러움(DIZZY). 성장 탭이 보이고 앱이 앞에 있을 때만 가속도계를 켠다(그 밖엔 구독 없음 — 배터리).
// 판정은 공용 charPlay onAccel(세 번 흔들기 · 10초 쉼). 움직임 줄이기는 PlayableCharacter가 맥박 + 생각 얼굴로 바꾼다.
// expo-sensors는 네이티브 모듈이다: 이 JS가 그 모듈이 없는 옛 빌드에서 돌면(prebuild 전) 조용히 꺼진다.
import { newShakeState, onAccel, SHAKE } from '@sprout/schema/charPlay'
import { requireOptionalNativeModule } from 'expo'
import { useEffect, useRef } from 'react'

type Sub = { remove: () => void }
type AccelT = { isAvailableAsync: () => Promise<boolean>; setUpdateInterval: (ms: number) => void; addListener: (fn: (m: { x: number; y: number; z: number }) => void) => Sub }
let Accel: AccelT | null | undefined
function accel(): AccelT | null {
  if (Accel !== undefined) return Accel
  // 네이티브 모듈이 없으면 expo-sensors를 아예 부르지 않는다 — 부르면 모듈 초기화(Pedometer 등)가 앱을 멈추는 JS 오류를 낸다(시뮬레이터 Release에서 확인)
  if (!requireOptionalNativeModule('ExponentAccelerometer')) { Accel = null; return null }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Accel = (require('expo-sensors') as { Accelerometer: AccelT }).Accelerometer
  } catch { Accel = null }
  return Accel
}

export function useShake(enabled: boolean, onShake: () => void) {
  const cb = useRef(onShake)
  cb.current = onShake
  useEffect(() => {
    if (!enabled) return
    const A = accel()
    if (!A) return
    let sub: Sub | null = null
    let dead = false
    const s = newShakeState()
    A.isAvailableAsync().then((ok) => {
      if (!ok || dead) return
      A.setUpdateInterval(SHAKE.intervalMs)
      sub = A.addListener(({ x, y, z }) => { if (onAccel(s, x, y, z, Date.now())) cb.current() })
    }).catch(() => {})
    return () => { dead = true; sub?.remove() }
  }, [enabled])
}
