// 일정 시트(20 §7.1 — 06 §14.4.4 팝오버의 휴대폰판): 할 일 상세와 같은 formSheet(0.6 / 1).
// 위 줄 "● 내 일정" · ⋯(할 일로 바꾸기 · 복제 · 삭제) / 🕐 날짜 줄(→ 날짜 시트, 날짜·기간·종일·알림·반복) / 제목 / 📍 장소 / 설명.
// 저장 버튼 없음 — 0.6초 쉬거나 닫으면 저장. 제목을 비우고 닫으면 원래 제목. 반복 일정은 늘 전체를 고친다(v1).
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { parseReminders } from '@sprout/schema/events'
import { ArrowRightLeft, Bell, ChevronLeft, Clock, Copy, Ellipsis, MapPin, Repeat, Trash2 } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { updateEvent, useEvent, useMyCalColor } from '../data/calEvents'
import { eventColor, eventSheetLabel } from '../data/eventsModel'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { useEventActions } from '../ui/EventMenu'
import { GlassButton } from '../ui/Glass'
import { CloseButton } from '../ui/SheetHead'
import { PopMenu, useAnchor } from '../ui/Menu'
import { PF } from '../calendars/device'
import { linkLabel } from '../calendars/items'
import { myLinkAccount, useDeviceCal } from '../calendars/store'

export default function EventSheet() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const p = usePalette()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const e = useEvent(id)
  const myColor = useMyCalColor()
  const act = useEventActions()
  // 38 §5.5 연결된 일정: 위 줄 = 그 캘린더 이름, 맨 아래 = 올리기 오류 / 아직 못 올림
  const devCal = useDeviceCal()
  const [myAccount, setMyAccount] = useState<string | null>(null)
  useEffect(() => { void myLinkAccount().then(setMyAccount).catch(() => {}) }, [])
  const more = useAnchor()
  const [full, setFull] = useState(false)
  useEffect(() => navigation.addListener('sheetDetentChange' as never, ((ev: { data: { index: number } }) => setFull(ev.data.index === 1)) as never), [navigation])

  // 입력 중에는 로컬 값, 0.6초 뒤 저장(02 §13)
  const [draft, setDraft] = useState<{ title?: string; location?: string; notes?: string }>({})
  const pending = useRef<Record<string, unknown>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTitle = useRef('')
  if (e?.title) lastTitle.current = e.title
  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length && id) void updateEvent(id, patch)
  }
  const edit = (k: 'title' | 'location' | 'notes', v: string) => {
    setDraft((d) => ({ ...d, [k]: v }))
    pending.current[k] = k === 'title' ? v : v.trim() ? v : null
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }
  useEffect(() => () => {
    if (pending.current.title === '') pending.current.title = lastTitle.current
    flush()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!e) return <View style={{ flex: 1, backgroundColor: p.sheetBg }} />
  const color = eventColor(e, myColor)
  const calName = linkLabel(e, devCal.calendars, myAccount, PF) ?? '내 일정'
  const reminders = parseReminders(e.reminders).length
  const close = () => router.back()
  const after = (fn: () => Promise<void>) => { flush(); close(); void fn() }

  return (
    <View style={{ flex: 1, backgroundColor: p.sheetBg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}>
        <View style={[s.top, { marginTop: full ? insets.top : 10 }]}>
          {full ? <GlassButton label="닫기" onPress={close}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton> : <CloseButton onPress={close} />}
          <View style={s.cal} accessibilityLabel={`캘린더: ${calName}`}>
            <View style={[s.dot, { backgroundColor: color }]} />
            <Text style={[s.calText, { color: p.textSecondary }]} numberOfLines={1}>{calName}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View ref={more.ref} collapsable={false}>
            <GlassButton label="더보기" onPress={more.open}><Ellipsis size={22} color={p.textPrimary} /></GlassButton>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={`날짜: ${eventSheetLabel(e.start_at, e.end_at)}`} onPress={() => { flush(); router.push({ pathname: '/date', params: { event: e.id } }) }} style={s.dateRow}>
          <Clock size={18} color={p.textTertiary} />
          <Text style={[FONT.body, { fontSize: 15, color: p.accent, flexShrink: 1 }]}>{eventSheetLabel(e.start_at, e.end_at)}</Text>
          {e.repeat_rule ? <Repeat size={15} color={p.accent} /> : null}
          {reminders ? <Bell size={15} color={p.accent} /> : null}
        </Pressable>

        <TextInput
          value={draft.title ?? e.title ?? ''}
          onChangeText={(t) => edit('title', t)}
          onBlur={() => { if (!(draft.title ?? e.title ?? '').trim()) edit('title', lastTitle.current) }}
          placeholder="일정 제목"
          placeholderTextColor={p.textQuaternary}
          multiline
          blurOnSubmit
          returnKeyType="done"
          style={[FONT.detailTitle, s.title, { color: p.textPrimary }]}
          accessibilityLabel="일정 제목"
        />
        <View style={s.line}>
          <MapPin size={18} color={p.textTertiary} />
          <TextInput
            value={draft.location ?? e.location ?? ''}
            onChangeText={(t) => edit('location', t)}
            placeholder="장소"
            placeholderTextColor={p.textQuaternary}
            returnKeyType="done"
            style={[FONT.body, s.input, { color: p.textPrimary }]}
            accessibilityLabel="장소"
          />
        </View>
        <TextInput
          value={draft.notes ?? e.notes ?? ''}
          onChangeText={(t) => edit('notes', t)}
          placeholder="설명"
          placeholderTextColor={p.textQuaternary}
          multiline
          style={[FONT.body, s.body, { color: p.textSecondary }]}
          accessibilityLabel="설명"
        />
        {e.repeat_rule ? <Text style={[FONT.meta, { color: p.textQuaternary, paddingHorizontal: 16, paddingTop: 12 }]}>반복 일정은 모든 회차가 함께 바뀌어요</Text> : null}
        {e.ext_error ? <Text accessibilityRole="alert" style={[FONT.meta, { color: p.danger, paddingHorizontal: 16, paddingTop: 12 }]}>{e.ext_error}</Text>
          : e.ext_provider && !e.ext_id && !e.deleted_at ? <Text style={[FONT.meta, { color: p.textQuaternary, paddingHorizontal: 16, paddingTop: 12 }]}>연결한 캘린더에 아직 올리지 않았어요</Text> : null}
      </ScrollView>

      <PopMenu
        anchor={more.rect}
        onClose={more.close}
        width={220}
        items={[
          { key: 'toTask', label: '할 일로 바꾸기', icon: <ArrowRightLeft size={18} color={p.textSecondary} />, onPress: () => after(() => act.toTask(e.id)) },
          { key: 'dup', label: '복제', icon: <Copy size={18} color={p.textSecondary} />, onPress: () => after(() => act.duplicate(e.id)) },
          { key: 'del', label: '삭제', danger: true, icon: <Trash2 size={18} color={p.danger} />, onPress: () => after(() => act.remove(e.id)) }
        ]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  top: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12 },
  cal: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  calText: { fontSize: 15, lineHeight: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 40 },
  title: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 40 },
  input: { flex: 1, paddingVertical: 8 },
  body: { paddingHorizontal: 16, paddingTop: 8, minHeight: 80, textAlignVertical: 'top' }
})
