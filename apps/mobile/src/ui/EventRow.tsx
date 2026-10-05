// 일정 행(20 §7.1, 06 §14.3.1): 할 일 행과 같은 높이·자리 — 체크박스 자리 캘린더 아이콘(일정 색), 제목, 메타 줄 "● 내 일정 · 📍 장소",
// 오른쪽 시각(종일·오후 3:00-4:00) + ⟲ 반복 · 🔔 알림, 왼쪽 2pt 일정 색 줄. 끝난 일정은 글자 옅게. 누르면 일정 시트, 길게 누르면 일정 메뉴.
import { Bell, CalendarDays, MapPin, Repeat } from 'lucide-react-native'
import { memo, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { parseReminders } from '@sprout/schema/events'
import { eventTimeLabel, isPast, type EventRow } from '../data/eventsModel'
import { FONT, M, mix } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import type { Rect } from './Menu'

export const EventRowView = memo(function EventRowView(props: { evt: EventRow; start: string; end: string; color: string; onPress?: () => void; onLongPress?: (r: Rect) => void }) {
  const p = usePalette()
  const ref = useRef<View>(null)
  const e = props.evt
  const past = isPast(props.end, new Date())
  const icon = past ? p.textTertiary : mix(props.color, p.dark ? '#ffffff' : p.textSecondary, 0.7)
  const place = e.location?.trim()
  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={props.onPress}
        onLongPress={() => ref.current?.measureInWindow((x, y, width, height) => props.onLongPress?.({ x, y, width, height }))}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`일정 ${e.title || '제목 없음'}, ${eventTimeLabel(props.start, props.end)}`}
        style={({ pressed }) => [s.row, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}
      >
        <View style={[s.stripe, { backgroundColor: props.color, opacity: past ? 0.4 : 1 }]} />
        <View style={s.icon}><CalendarDays size={18} color={icon} strokeWidth={2} /></View>
        <View style={s.tx}>
          <Text style={[FONT.body, { color: past ? p.textTertiary : p.textPrimary }]} numberOfLines={1}>{e.title || '제목 없음'}</Text>
          <View style={s.sub}>
            <View style={[s.dot, { backgroundColor: props.color }]} />
            <Text style={[FONT.meta, { color: p.textTertiary }]} numberOfLines={1}>내 일정</Text>
            {place ? <MapPin size={11} color={p.textTertiary} /> : null}
            {place ? <Text style={[FONT.meta, { color: p.textTertiary, flexShrink: 1 }]} numberOfLines={1}>{place}</Text> : null}
          </View>
        </View>
        <View style={s.right}>
          <Text style={[FONT.meta, { color: past ? p.textTertiary : p.textSecondary }]} numberOfLines={1}>{eventTimeLabel(props.start, props.end)}</Text>
          {e.repeat_rule || parseReminders(e.reminders).length ? (
            <View style={s.icons}>
              {e.repeat_rule ? <Repeat size={12} color={p.textTertiary} /> : null}
              {parseReminders(e.reminders).length ? <Bell size={12} color={p.textTertiary} /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  )
})

const s = StyleSheet.create({
  row: { minHeight: M.rowH2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 14, paddingVertical: 9 },
  stripe: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 2, borderRadius: 1 },
  icon: { width: 18, alignItems: 'center', marginTop: -11 },
  tx: { flex: 1, minWidth: 0, gap: 3, justifyContent: 'center' },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 2 },
  right: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: 150 },
  icons: { flexDirection: 'row', gap: 3 }
})
