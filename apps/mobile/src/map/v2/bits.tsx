// 29 §9 작은 부품: 캐릭터 한 줄 말풍선 · 카드 · 날짜 말
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useBuddy } from '../../diary/data'
import { BuddyArt } from '../../diary/parts'
import type { Mood } from '../../growth/logic'
import { usePalette } from '../../theme/ThemeProvider'

/** 캐릭터(없으면 새싹) */
export function Buddy({ size = 28, still, mood }: { size?: number; still?: boolean; mood?: Mood }) {
  const b = useBuddy()
  return <BuddyArt buddy={b} stage={b.stage} size={size} still={still} mood={mood} />
}
export const useBuddyName = () => useBuddy().name

/** 31 §11.9 같은 목소리 한 줄: 아바타 + 말풍선 + 칩 */
export function PartnerLine({ text, chips, style }: { text: string; chips?: { key: string; label: string; onPress: () => void; primary?: boolean }[]; style?: object }) {
  const p = usePalette()
  return (
    <View style={[s.line, style]}>
      <Buddy size={30} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[s.bubble, { backgroundColor: p.cardBg }]}>
          <Text style={{ color: p.textPrimary, fontSize: 14, lineHeight: 20 }} accessibilityLiveRegion="polite">{text}</Text>
        </View>
        {chips?.length ? (
          <View style={s.chips}>
            {chips.map((c) => (
              <Pressable key={c.key} onPress={c.onPress} accessibilityRole="button" style={[s.chip, { backgroundColor: c.primary === false ? p.bgSelected : p.accentSubtle }]}>
                <Text style={{ color: c.primary === false ? p.textSecondary : p.accent, fontSize: 13, fontWeight: '600' }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const p = usePalette()
  return <View style={[s.card, { backgroundColor: p.cardBg }, style]}>{children}</View>
}

const WD = ['일', '월', '화', '수', '목', '금', '토']
export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
export const mdw = (d: string) => `${md(d)} (${WD[new Date(`${d}T12:00:00`).getDay()]})`
export const dDay = (d: string, today: string) => {
  const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginBottom: 12 },
  bubble: { borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden' }
})
