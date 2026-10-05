// 설정 › 소리와 알림(32 §7 — 틱틱 Sounds & Notifications + sprout 칸): 알림 권한 · 알람 및 리마인더(Android 12+, §17.6) · 할 일 알림·제목 숨기기 · 하루 요약(시각·주말) ·
// 성장 소식 · 시험 알림 · 배터리 안내 · 서버 알림 상태 줄. 값은 동기화되는 user_prefs.notify_json(데스크톱 설정 › 알림과 같음).
// 이 휴대폰의 권한·등록(push_reminders)은 서버 device_tokens에만 — 바꾸면 push.ts가 다시 등록한다.
import { formatTimeKo } from '@sprout/schema/time'
import { SNOOZE_MINUTES, snoozeLabel } from '@sprout/schema/notify'
import { useFocusEffect, useRouter } from 'expo-router'
import { AlarmClock, Bell, Check, ChevronLeft } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { AppState, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { saveNotifyPrefs, useNotifyPrefs } from '../../../src/data/notifyPrefs'
import { ensurePermission, openSystemSettings, permissionState, rescheduleNow, type PermissionState } from '../../../src/notifications/index'
import { exactAlarmState, openExactAlarmSettings, type ExactAlarmState } from '../../../src/notifications/exactAlarm'
import { PUSH_SUPPORTED, registerDevice, sendTestPush, usePushStatus } from '../../../src/notifications/push'
import { M } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { fromWheel, toWheel } from '../../../src/ui/dateSheetModel'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useToast } from '../../../src/ui/Toast'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'
import { Wheel } from '../../../src/ui/Wheel'

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const NOT_READY = '할 일 알림은 이 휴대폰에서 울려요'

function ago(ms: number | null): string {
  if (!ms) return ''
  const m = Math.round((Date.now() - ms) / 60000)
  return m < 1 ? '방금 확인' : m < 60 ? `${m}분 전 확인` : `${Math.round(m / 60)}시간 전 확인`
}

export default function NotificationSettings() {
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const toast = useToast()
  const prefs = useNotifyPrefs()
  const push = usePushStatus()
  const [perm, setPerm] = useState<PermissionState | null>(null)
  const [exact, setExact] = useState<ExactAlarmState>(() => exactAlarmState())
  const [wheel, setWheel] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [testing, setTesting] = useState(false)

  const refresh = useCallback(() => {
    void permissionState().then(setPerm).catch(() => setPerm(null))
    setExact(exactAlarmState())
  }, [])
  useFocusEffect(useCallback(() => {
    refresh()
    void registerDevice()
    // 시스템 설정에서 돌아오면 권한을 다시 보고, 바뀌었으면 다시 계산 → 등록(push_reminders)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { refresh(); void rescheduleNow() } })
    return () => sub.remove()
  }, [refresh]))

  const denied = perm === 'denied'
  const serverOff = push.state === 'disabled'
  const showServer = PUSH_SUPPORTED // iOS(§11 전)·Firebase 설정 없이 만든 빌드: 하루 요약·성장 소식·시험 알림 숨김
  const dim = denied ? 0.5 : 1

  const askPermission = async () => {
    if (perm === 'denied') return void openSystemSettings()
    if (perm !== 'granted') { await ensurePermission(); refresh(); void rescheduleNow() }
  }
  /** §7.3 ②: 하루 요약·성장 소식 스위치를 처음 켤 때 권한을 묻는다 */
  const serverSwitch = async (on: boolean, apply: () => Promise<unknown>) => {
    if (serverOff) return toast.show(NOT_READY)
    await apply()
    if (on && perm !== 'granted') { await ensurePermission(); refresh() }
  }
  const sendTest = async () => {
    if (testing) return
    if (serverOff) return toast.show(NOT_READY)
    setTesting(true)
    try {
      const r = await sendTestPush()
      toast.show(r === 'sent' ? '시험 알림을 보냈어요' : r === 'limited' ? '잠시 뒤에 다시 해 주세요' : r === 'disabled' ? NOT_READY : '인터넷에 연결되면 알림을 켜요')
    } finally { setTesting(false) }
  }
  const openBattery = () =>
    void Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => openSystemSettings())

  const sw = (value: boolean, onChange: (v: boolean) => void, label: string, faded = false) => (
    <View style={{ opacity: faded ? 0.5 : 1 }}>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: p.accent }} />
    </View>
  )
  const permValue = perm === 'granted' ? '켜짐' : perm === 'denied' ? undefined : perm === 'undetermined' ? '꺼짐' : undefined
  const status = !showServer ? null
    : serverOff ? NOT_READY
    : push.state === 'ok' ? `알림 켜짐${push.checkedAt ? ` · ${ago(push.checkedAt)}` : ''}`
    : push.state === 'offline' ? '인터넷에 연결되면 알림을 켜요'
    : '알림 확인 중…'

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="소리와 알림" left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} right={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: space.pad }}>
        <Cells>
          <Cell
            first
            label="알림 권한"
            value={permValue}
            icon={<Bell size={18} color="#fff" />}
            iconBg="#f0464a"
            onPress={perm === 'granted' ? () => void openSystemSettings() : () => void askPermission()}
            right={denied ? <Text style={{ color: p.danger, fontSize: 14 }} numberOfLines={1}>알림이 꺼져 있어요 · 설정 열기</Text> : undefined}
          />
          {/* §17.6 ⓐ Android 12+: 정확한 알람. 시스템 화면에서 돌아오면(앞으로 올 때) 다시 읽고 예약을 다시 넣는다 */}
          {exact !== 'na' ? (
            <Cell
              label="알람 및 리마인더"
              icon={<AlarmClock size={18} color="#fff" />}
              iconBg="#f29a1f"
              value={exact === 'allowed' ? '허용됨' : undefined}
              onPress={() => void openExactAlarmSettings()}
              right={exact === 'denied' ? <Text style={{ color: p.danger, fontSize: 14 }} numberOfLines={1}>허용 안 됨 · 설정 열기</Text> : undefined}
            />
          ) : null}
        </Cells>
        {exact === 'denied' ? (
          <Text style={[s.foot, { color: p.textTertiary }]}>허용하면 인터넷이 없어도 할 일 알림이 제시간에 울려요</Text>
        ) : null}

        <View style={{ opacity: dim }}>
          <Cells>
            <Cell first label="할 일 알림" right={sw(prefs.reminders, (v) => void saveNotifyPrefs({ reminders: v }), '할 일 알림')} />
            <Cell label="알림에 제목 숨기기" right={sw(prefs.hideTitles, (v) => void saveNotifyPrefs({ hideTitles: v }), '알림에 제목 숨기기')} />
          </Cells>
          <Text style={[s.foot, { color: p.textTertiary }]}>잠금 화면 알림에 할 일 제목을 보이지 않아요</Text>

          {/* 32 §4.4: 알림의 `다시 알림` 버튼이 미루는 시간(틱틱 설정의 다시 알림 시간, research 30 §6). 누르면 아래에 고르기 칸 */}
          <Cells>
            <Cell first label="다시 알림 시간" value={snoozeLabel(prefs.snoozeMinutes)} chevron={false} onPress={() => setSnoozeOpen((o) => !o)} />
            {snoozeOpen ? SNOOZE_MINUTES.map((m) => (
              <Cell key={m} label={snoozeLabel(m)} chevron={false}
                onPress={() => { void saveNotifyPrefs({ snoozeMinutes: m }); setSnoozeOpen(false) }}
                right={prefs.snoozeMinutes === m ? <Check size={18} color={p.accent} /> : undefined} />
            )) : null}
          </Cells>
          <Text style={[s.foot, { color: p.textTertiary }]}>알림의 다시 알림 버튼을 누르면 이만큼 뒤에 다시 울려요</Text>

          {showServer ? (
            <>
              <Cells>
                <Cell first label="하루 요약" right={sw(prefs.daily.on, (v) => void serverSwitch(v, () => saveNotifyPrefs({ daily: { on: v } })), '하루 요약', serverOff)} />
                {/* 하루 요약이 꺼져 있으면 두 줄 흐림·잠금(데스크톱 §16과 같음) */}
                <View style={{ opacity: prefs.daily.on ? 1 : 0.4 }} pointerEvents={prefs.daily.on ? 'auto' : 'none'}>
                <Cell
                  label="받을 시각"
                  value={formatTimeKo(prefs.daily.time)}
                  chevron={false}
                  onPress={() => (serverOff ? toast.show(NOT_READY) : setWheel((w) => !w))}
                />
                {wheel && !serverOff && prefs.daily.on ? (() => {
                  const w = toWheel(prefs.daily.time)
                  const set = (next: typeof w) => void saveNotifyPrefs({ daily: { time: fromWheel(next) } })
                  return (
                    <Wheel columns={[
                      { label: '오전 오후', items: ['오전', '오후'], index: w.pm ? 1 : 0, onChange: (i) => set({ ...w, pm: i === 1 }) },
                      { label: '시', items: HOURS, index: w.hour12 - 1, onChange: (i) => set({ ...w, hour12: i + 1 }) },
                      { label: '분', items: MINUTES, index: Math.round(w.minute / 5) % 12, onChange: (i) => set({ ...w, minute: i * 5 }) }
                    ]} />
                  )
                })() : null}
                <Cell label="주말 건너뛰기" right={sw(prefs.daily.skipWeekends, (v) => void serverSwitch(false, () => saveNotifyPrefs({ daily: { skipWeekends: v } })), '주말 건너뛰기', serverOff)} />
                </View>
              </Cells>

              <Cells title="성장 소식">
                <Cell first label="캐릭터 진화" right={sw(prefs.growth.evolve, (v) => void serverSwitch(v, () => saveNotifyPrefs({ growth: { evolve: v } })), '캐릭터 진화', serverOff)} />
                <Cell label="주간 리포트 도착" right={sw(prefs.growth.report, (v) => void serverSwitch(v, () => saveNotifyPrefs({ growth: { report: v } })), '주간 리포트 도착', serverOff)} />
                <Cell label="이번 주 목표 마감 알림" right={sw(prefs.growth.goalDue, (v) => void serverSwitch(v, () => saveNotifyPrefs({ growth: { goalDue: v } })), '이번 주 목표 마감 알림', serverOff)} />
              </Cells>
              <Text style={[s.foot, { color: p.textTertiary }]}>목표 마감 알림은 일요일 저녁 8시, 남은 목표가 있을 때 와요</Text>
            </>
          ) : null}
        </View>

        {showServer ? (
          <Cells>
            <Cell first label={testing ? '보내는 중…' : '시험 알림 보내기'} onPress={() => void sendTest()} />
            {Platform.OS === 'android' ? <Cell label="알림이 늦게 오거나 안 와요" onPress={openBattery} /> : null}
          </Cells>
        ) : null}
        {status ? <Text style={[s.status, { color: p.textTertiary }]}>{status}</Text> : null}
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  foot: { fontSize: 12.5, lineHeight: 17, marginTop: -4, marginBottom: M.cardGap, paddingHorizontal: M.cardInset + 14 },
  status: { fontSize: 12.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: M.cardInset + 14, marginTop: 4 }
})
