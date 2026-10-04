// 움직임 줄이기(23 §4 끝, 10 §3.2.11): OS "동작 줄이기"가 켜져 있거나 성장 ⋯ 메뉴 스위치(기기별)면 숨쉬기·색종이·차오르기·
// 진화 애니메이션 없이 값만 바꾼다. 말풍선·배너는 0.2초 페이드만.
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { KEY, onChange, read, write } from './store'

export const readMotionPref = () => read(KEY.motion) === 'reduce'
export const writeMotionPref = (reduce: boolean) => write(KEY.motion, reduce ? 'reduce' : 'full')

export function useMotionReduced(): boolean {
  const [os, setOs] = useState(false)
  const [pref, setPref] = useState(readMotionPref)
  useEffect(() => {
    let alive = true
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setOs(v) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOs)
    const off = onChange(() => setPref(readMotionPref()))
    return () => { alive = false; sub.remove(); off() }
  }, [])
  return os || pref
}
