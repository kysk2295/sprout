// 외관(시안 I-2, 20 M2): 시스템 다크 따라가기 · 다크일 때 테마 · 색상 시리즈 견본 격자(13종).
// 저장은 동기화되는 user_prefs.theme(데스크톱과 같은 형식) — 데스크톱에서 고른 테마가 그대로 보인다.
import { useRouter } from 'expo-router'
import { Check, ChevronLeft } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { savePrefs } from '../../../src/data/prefs'
import { DARK_THEMES, encodeTheme, THEMES } from '../../../src/theme/themes'
import { paletteOf } from '../../../src/theme/palette'
import { usePalette, useTheme } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'

export default function Appearance() {
  const p = usePalette()
  const space = useTabBarSpace()
  const { themeId, darkThemeId, followDark } = useTheme()
  const router = useRouter()
  const pickMain = (id: string) => void savePrefs({ theme: encodeTheme(id, darkThemeId), follow_system_dark: followDark ? 1 : 0 })
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="외관" left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.pad }}>
        <Cells>
          <Cell first label="시스템 다크 모드 따라가기" right={<Switch value={followDark} onValueChange={(on) => void savePrefs({ follow_system_dark: on ? 1 : 0, theme: encodeTheme(themeId, darkThemeId) })} trackColor={{ true: p.accent }} />} />
          {DARK_THEMES.map((t) => (
            <Cell
              key={t.id}
              label={`다크일 때 · ${t.name}`}
              onPress={() => void savePrefs({ theme: encodeTheme(themeId, t.id), follow_system_dark: followDark ? 1 : 0 })}
              chevron={false}
              right={darkThemeId === t.id ? <Check size={18} color={p.accent} /> : null}
            />
          ))}
        </Cells>
        <Cells title="색상 시리즈">
          <View style={s.grid}>
            {THEMES.map((t) => {
              const tp = paletteOf(t.id)
              const on = t.id === themeId
              return (
                <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t.name} onPress={() => pickMain(t.id)} style={s.sw}>
                  <View style={[s.swBox, { borderColor: on ? p.accent : p.borderDivider, borderWidth: on ? 2 : 1 }]}>
                    <View style={{ height: 30, backgroundColor: t.id === 'default' ? tp.accent : tp.bgRail }} />
                    <View style={{ flex: 1, backgroundColor: tp.pageBg, padding: 6, gap: 4 }}>
                      <View style={{ height: 10, borderRadius: 3, backgroundColor: tp.cardBg }} />
                      <View style={{ height: 10, borderRadius: 3, backgroundColor: tp.cardBg }} />
                    </View>
                    {on ? <View style={[s.ck, { backgroundColor: p.accent }]}><Check size={11} color="#fff" strokeWidth={3} /></View> : null}
                  </View>
                  <Text style={{ fontSize: 12, color: on ? p.accentInk : p.textSecondary, fontWeight: on ? '600' : '400' }}>{t.name}</Text>
                </Pressable>
              )
            })}
          </View>
        </Cells>
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 14, rowGap: 14 },
  sw: { width: '25%', alignItems: 'center', gap: 6 },
  swBox: { width: 62, height: 96, borderRadius: 12, overflow: 'hidden' },
  ck: { position: 'absolute', right: 4, bottom: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }
})
