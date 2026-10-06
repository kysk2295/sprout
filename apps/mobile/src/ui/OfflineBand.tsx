// 40 §2.2 오프라인 띠: 30초 넘게 끊겨 있을 때만 목록 머리 아래 회색 띠 한 줄(캐릭터 S 24 sleepy, 08 §6 문구 그대로).
// 다시 연결되면 사라진다. 짧게 끊겼다 붙는 건 보이지 않는다(⋯ 배지·메뉴 머리 문구는 그대로).
import { COMPANION_SIZE, OFFLINE_BANNER_AFTER_MS, OFFLINE_BANNER_TEXT } from '@sprout/schema/companion'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'
import { useBuddy } from '../diary/data'
import { StaticFace } from './CompanionFace'

export function OfflineBand({ offline }: { offline: boolean }) {
  const p = usePalette()
  const buddy = useBuddy()
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!offline) { setShow(false); return }
    const t = setTimeout(() => setShow(true), OFFLINE_BANNER_AFTER_MS)
    return () => clearTimeout(t)
  }, [offline])
  if (!show) return null
  return (
    <View style={[s.band, { backgroundColor: p.dark ? '#2a2a2c' : '#f2f2f5' }]} accessibilityRole="text" accessibilityLiveRegion="polite">
      <StaticFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.banner} mood="sleepy" />
      <Text style={[s.text, { color: p.textSecondary }]} numberOfLines={2}>{OFFLINE_BANNER_TEXT}</Text>
    </View>
  )
}
const s = StyleSheet.create({
  band: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  text: { flex: 1, fontSize: 13.5, lineHeight: 18 }
})
