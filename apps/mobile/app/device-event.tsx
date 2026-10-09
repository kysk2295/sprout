// 38 §2.3 휴대폰 캘린더 일정 시트(캐시 전용 — 휴대폰 캘린더에서 직접 만든 일정). 일정 시트(EventSheet)와 같은 줄 구성.
// 쓸 수 있으면 바로 고친다(0.6초 쉬거나 닫으면 저장 — 반복 회차면 범위 대화). 읽기 전용이면 글자만 + 맨 아래 이유.
import { eventSpan } from '@sprout/schema/events'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { ChevronLeft, Clock, Ellipsis, ExternalLink, MapPin, Repeat, Trash2 } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDeviceActions, type DevPatch } from '../src/calendars/actions'
import { deviceDatePick } from '../src/calendars/datePick'
import { deviceRef } from '../src/calendars/items'
import { eventSheetLabel } from '../src/data/eventsModel'
import { FONT } from '../src/theme/palette'
import { usePalette } from '../src/theme/ThemeProvider'
import { GlassButton } from '../src/ui/Glass'
import { PopMenu, useAnchor } from '../src/ui/Menu'
import { CloseButton } from '../src/ui/SheetHead'

export default function DeviceEventSheet() {
  const { key = '' } = useLocalSearchParams<{ key: string }>()
  const p = usePalette()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const act = useDeviceActions()
  const more = useAnchor()
  const [full, setFull] = useState(false)
  useEffect(() => navigation.addListener('sheetDetentChange' as never, ((ev: { data: { index: number } }) => setFull(ev.data.index === 1)) as never), [navigation])
  const [ref, setRef] = useState(() => deviceRef(key))
  const [draft, setDraft] = useState<{ title?: string; location?: string; notes?: string; span?: { start_at: string; end_at: string; is_all_day: number } }>({})

  // 입력은 0.6초 뒤 한 번에(반복이면 범위 대화가 한 번만 뜨게 — 닫을 때 저장)
  const pending = useRef<DevPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flush = async () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (!Object.keys(patch).length || !ref) return
    if (patch.title !== undefined && !patch.title.trim()) delete patch.title
    if (!Object.keys(patch).length) return
    await act.save(key, patch)
  }
  const edit = (k: 'title' | 'location' | 'notes', v: string) => {
    setDraft((d) => ({ ...d, [k]: v }))
    if (k === 'title') pending.current.title = v
    else pending.current[k] = v.trim() ? v : null
    clearTimeout(timer.current)
    if (!ref?.recurring) timer.current = setTimeout(() => void flush(), 600)
  }
  // 닫을 때 저장(반복 회차는 칸을 벗어날 때 이미 저장 — 닫힌 뒤에는 범위 대화를 띄울 수 없다)
  useEffect(() => () => { if (!ref?.recurring) void flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 날짜 시트에서 고른 값
  useEffect(() => {
    deviceDatePick.fn = (s) => {
      if (!s.due_at) return
      const span = eventSpan(s.start_at, s.due_at)
      void act.save(key, span, { toast: '날짜를 바꿨어요' }).then((ok) => { if (ok) setDraft((d) => ({ ...d, span })); setRef(deviceRef(key)) })
    }
    return () => { deviceDatePick.fn = null }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ref) return <View style={{ flex: 1, backgroundColor: p.sheetBg }} />
  const ev = ref.ev
  const span = draft.span ?? ref
  const w = ref.writable
  const close = () => router.back()
  const title = draft.title ?? ev.title ?? ''
  const location = draft.location ?? ev.location ?? ''
  const notes = draft.notes ?? ev.notes ?? ''

  return (
    <View style={{ flex: 1, backgroundColor: p.sheetBg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}>
        <View style={[s.top, { marginTop: full ? insets.top : 10 }]}>
          {full ? <GlassButton label="닫기" onPress={close}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton> : <CloseButton onPress={close} />}
          <View style={s.cal} accessibilityLabel={`캘린더: ${ref.cal.title}`}>
            <View style={[s.dot, { backgroundColor: ref.cal.color }]} />
            <Text style={[s.calText, { color: p.textSecondary }]} numberOfLines={1}>{ref.cal.title}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View ref={more.ref} collapsable={false}>
            <GlassButton label="더보기" onPress={more.open}><Ellipsis size={22} color={p.textPrimary} /></GlassButton>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`날짜: ${eventSheetLabel(span.start_at, span.end_at)}`}
          disabled={!w}
          onPress={() => { void flush(); router.push({ pathname: '/date', params: { device: key } }) }}
          style={s.dateRow}
        >
          <Clock size={18} color={p.textTertiary} />
          <Text style={[FONT.body, { fontSize: 15, color: w ? p.accentInk : p.textSecondary, flexShrink: 1 }]}>{eventSheetLabel(span.start_at, span.end_at)}</Text>
          {ref.recurring ? <Repeat size={15} color={w ? p.accent : p.textTertiary} /> : null}
        </Pressable>

        {w ? (
          <>
            <TextInput value={title} onChangeText={(t) => edit('title', t)} placeholder="일정 제목" placeholderTextColor={p.textQuaternary} multiline blurOnSubmit returnKeyType="done" onBlur={() => { if (ref.recurring) void flush() }} style={[FONT.detailTitle, s.title, { color: p.textPrimary }]} accessibilityLabel="일정 제목" />
            <View style={s.line}>
              <MapPin size={18} color={p.textTertiary} />
              <TextInput value={location} onChangeText={(t) => edit('location', t)} onBlur={() => { if (ref.recurring) void flush() }} placeholder="장소" placeholderTextColor={p.textQuaternary} returnKeyType="done" style={[FONT.body, s.input, { color: p.textPrimary }]} accessibilityLabel="장소" />
            </View>
            <TextInput value={notes} onChangeText={(t) => edit('notes', t)} onBlur={() => { if (ref.recurring) void flush() }} placeholder="설명" placeholderTextColor={p.textQuaternary} multiline style={[FONT.body, s.body, { color: p.textSecondary }]} accessibilityLabel="설명" />
          </>
        ) : (
          <>
            <Text style={[FONT.detailTitle, s.title, { color: p.textPrimary }]} selectable>{title || '제목 없음'}</Text>
            {location ? <View style={s.line}><MapPin size={18} color={p.textTertiary} /><Text style={[FONT.body, s.input, { color: p.textPrimary }]} selectable>{location}</Text></View> : null}
            {notes ? <Text style={[FONT.body, s.body, { color: p.textSecondary }]} selectable>{notes}</Text> : null}
            <Text style={[FONT.meta, { color: p.textQuaternary, paddingHorizontal: 16, paddingTop: 16 }]}>{ref.reason}</Text>
          </>
        )}
      </ScrollView>
      <PopMenu
        anchor={more.rect}
        onClose={more.close}
        width={220}
        items={[
          { key: 'app', label: '캘린더 앱에서 열기', icon: <ExternalLink size={18} color={p.textSecondary} />, onPress: () => act.openInApp(key) },
          ...(w ? [{ key: 'del', label: '삭제', danger: true, icon: <Trash2 size={18} color={p.danger} />, onPress: () => { pending.current = {}; void act.remove(key).then((ok) => { if (ok) close() }) } }] : [])
        ]}
      />
      {act.element}
    </View>
  )
}

const s = StyleSheet.create({
  top: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12 },
  cal: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, flexShrink: 1 },
  calText: { fontSize: 15, lineHeight: 20, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 40 },
  title: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 40 },
  input: { flex: 1, paddingVertical: 8 },
  body: { paddingHorizontal: 16, paddingTop: 8, minHeight: 80, textAlignVertical: 'top' }
})
