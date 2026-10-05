// 38 §2.1 설정 › 캘린더 연동 — 휴대폰 캘린더(OS 권한). 틱틱 Settings › Import & Integration › Local Calendars + 캘린더별 켜고 끄기.
// 연결 전: 설명 + 연결 버튼(누를 때만 OS 권한 창) / 거부: 설정 열기 / 연결 뒤: 출처별 캘린더 목록(색 점·이름·보기만·스위치) + 연결 끊기.
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useEffect, useMemo } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { openAppSettings } from '../../../src/calendars/device'
import { judgeDevice, type DevCalendar } from '../../../src/calendars/link'
import { connectDeviceCal, disconnectDeviceCal, refreshDeviceCal, setCalendarShown, sourceName, useDeviceCal } from '../../../src/calendars/store'
import { FONT, M } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useToast } from '../../../src/ui/Toast'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'

const CAPTION = '꿈틀에서 만들거나 고친 일정은 고른 휴대폰 캘린더에도 저장돼요. 휴대폰 캘린더에서 만든 일정은 이 휴대폰에서만 보이고 꿈틀 서버나 AI로 보내지 않아요.'

export default function CalendarSettings() {
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const toast = useToast()
  const st = useDeviceCal()
  useEffect(() => { void refreshDeviceCal() }, [])
  const granted = st.perm?.state === 'granted'
  const denied = st.perm?.state === 'denied'
  const connected = st.prefs.connected && granted
  const groups = useMemo(() => {
    const m = new Map<string, DevCalendar[]>()
    for (const c of st.calendars) { const k = sourceName(c); m.set(k, [...(m.get(k) ?? []), c]) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [st.calendars])

  const connect = async () => {
    if (denied && st.perm && !st.perm.canAskAgain) return void openAppSettings()
    const r = await connectDeviceCal()
    if (r.state === 'granted') toast.show('휴대폰 캘린더를 연결했어요')
  }
  const disconnect = () =>
    Alert.alert('휴대폰 캘린더 연결을 끊을까요?', '휴대폰 캘린더 일정이 꿈틀에서 보이지 않아요. 휴대폰 캘린더의 일정은 지워지지 않아요.', [
      { text: '취소', style: 'cancel' },
      { text: '연결 끊기', style: 'destructive', onPress: () => disconnectDeviceCal() }
    ])

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="캘린더 연동" left={<GlassButton label="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/settings'))}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} right={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: space.pad }}>
        <Text style={[s.head, { color: p.textTertiary }]}>휴대폰 캘린더</Text>
        {!connected ? (
          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            <Text style={[FONT.body, { color: p.textPrimary, textAlign: 'center' }]}>
              {denied ? '캘린더 접근이 꺼져 있어요. 설정에서 꿈틀의 캘린더 접근을 허용해 주세요.' : '휴대폰에 추가한 구글·iCloud 캘린더를 할 일과 함께 보고, 꿈틀에서 만든 일정을 그 캘린더에도 저장해요.'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void (denied && !st.perm?.canAskAgain ? openAppSettings() : connect())} style={({ pressed }) => [s.btn, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={[FONT.bodyStrong, { color: '#fff' }]}>{denied && !st.perm?.canAskAgain ? '설정 열기' : '휴대폰 캘린더 연결'}</Text>
            </Pressable>
            {denied && st.perm?.canAskAgain ? (
              <Pressable accessibilityRole="button" onPress={() => void openAppSettings()} style={s.link}>
                <Text style={[FONT.sub, { color: p.accent }]}>설정 열기</Text>
              </Pressable>
            ) : null}
          </View>
        ) : st.loading && !st.calendars.length ? (
          <Text style={[FONT.sub, s.note, { color: p.textTertiary }]}>불러오는 중…</Text>
        ) : !st.calendars.length ? (
          <Text style={[FONT.sub, s.note, { color: p.textTertiary }]}>휴대폰에 캘린더가 없어요. 휴대폰 설정에서 계정을 추가해 주세요.</Text>
        ) : (
          groups.map(([name, cals]) => (
            <Cells key={name} title={name}>
              {cals.map((c, i) => {
                const shown = !st.prefs.hidden.includes(c.id)
                const ro = !judgeDevice(c).writable
                return (
                  <Cell
                    key={c.id}
                    first={i === 0}
                    label={c.title}
                    icon={<View style={[s.dot, { backgroundColor: c.color }]} />}
                    iconBg="transparent"
                    value={ro ? '보기만' : undefined}
                    chevron={false}
                    right={<Switch accessibilityLabel={`${c.title} 보기`} value={shown} onValueChange={(v) => setCalendarShown(c.id, v)} trackColor={{ true: p.accent }} />}
                  />
                )
              })}
            </Cells>
          ))
        )}
        {connected ? (
          <Cells>
            <Cell first label="연결 끊기" danger chevron={false} onPress={disconnect} />
          </Cells>
        ) : null}
        <Text style={[FONT.sub, s.note, { color: p.textTertiary }]}>{CAPTION}</Text>
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  head: { fontSize: 13, lineHeight: 18, paddingTop: 12, paddingBottom: 6, paddingHorizontal: M.cardInset + 14 },
  card: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: M.radiusCard, padding: 18, gap: 14, alignItems: 'stretch' },
  btn: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  link: { alignItems: 'center', paddingVertical: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  note: { marginHorizontal: 26, marginTop: 4, fontSize: 12, lineHeight: 17 }
})
