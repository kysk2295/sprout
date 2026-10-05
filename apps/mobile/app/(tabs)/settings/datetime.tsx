// 설정 › 날짜와 시간(06 §16 / 20 §7.2 — 틱틱 모바일 Date & Time: 주 시작 · 추가 달력 · 주 번호 표시(W) · 휴일 표시, 도움말 FAQ-Calendar 그림).
// 값은 동기화되는 view_settings('calendar').options_json — 데스크톱 설정 › 날짜 & 시간과 같다. 시간 형식·시간대는 v1 범위 밖.
import { HOLIDAY_YEARS } from '@sprout/schema/holidays'
import { useRouter } from 'expo-router'
import { Check, ChevronLeft } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, Switch, Text, View } from 'react-native'
import { saveMarkPrefs, useMarkPrefs } from '../../../src/data/calendarPrefs'
import { FONT } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'

const CALENDARS: [number, string][] = [[0, '없음'], [1, '한국 음력']]

export default function DateTimeSettings() {
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const prefs = useMarkPrefs()
  const [pick, setPick] = useState(false)
  const sw = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: p.accent }} />
  )
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="날짜와 시간" left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} right={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: space.pad }}>
        <Cells>
          <Cell first label="주 시작" value="월요일" chevron={false} />
        </Cells>
        <Cells>
          <Cell first label="추가 달력" value={CALENDARS.find(([v]) => v === (prefs.lunar ? 1 : 0))?.[1]} onPress={() => setPick(!pick)} />
          {pick ? CALENDARS.map(([v, label]) => (
            <Cell key={v} label={`   ${label}`} onPress={() => { void saveMarkPrefs({ lunar: v }); setPick(false) }} chevron={false}
              right={(prefs.lunar ? 1 : 0) === v ? <Check size={18} color={p.accent} /> : undefined} />
          )) : null}
          <Cell label="주 번호 표시(W)" right={sw(prefs.weekNumbers, (v) => void saveMarkPrefs({ weekNumbers: v ? 1 : 0 }), '주 번호 표시')} />
          <Cell label="휴일 표시" right={sw(prefs.holidays, (v) => void saveMarkPrefs({ holidays: v ? 1 : 0 }), '휴일 표시')} />
        </Cells>
        <Text style={[FONT.sub, { color: p.textTertiary, marginHorizontal: 30, marginTop: -6 }]}>
          캘린더에 대한민국 공휴일·대체공휴일을 표시해요({HOLIDAY_YEARS.from}~{HOLIDAY_YEARS.to}년). 컴퓨터와 같은 설정이에요.
        </Text>
      </ScrollView>
    </View>
  )
}
