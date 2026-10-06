// 행 길게 누름(21 §4.1): 행이 떠오르고 뒤가 흐려진 채 아래에 메뉴 —
// 날짜 줄(오늘 · 내일 · 다음 주 · 날짜…) · 우선순위 깃발 4개 · 상단 고정/고정 해제 · 이동 · 태그 · 일정으로 바꾸기 · 삭제(빨강)
// [다음] 길게 누른 채 움직여 끌어서 순서 바꾸기
import { ArrowRightLeft, Calendar, CalendarArrowUp, Flag, FolderInput, FolderMinus, Pin, Sun, Sunrise, Tag, Trash2 } from 'lucide-react-native'
import { useEffect, useRef, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated'
import { hx } from './haptics'
import { usePresence } from './Menu'
import { priorityColor } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import type { Rect } from './Menu'

export type LongPressAction = 'today' | 'tomorrow' | 'nextWeek' | 'pickDate' | 'pin' | 'move' | 'tag' | 'toEvent' | 'out' | 'delete' | `p${0 | 1 | 2 | 3}`

export function LongPressMenu(props: {
  rect: Rect | null; row: ReactNode; pinned: boolean; priority: number; onClose: () => void; onAction: (a: LongPressAction) => void
  /** 아래 항목 고르기(기본: 고정·이동·태그·일정으로·삭제). 29 §9.2 프로젝트 화면은 ['out', 'delete'] */
  only?: LongPressAction[]
}) {
  const p = usePalette()
  const win = useWindowDimensions()
  // 39 §4.3: 열릴 때 흔들림(중간) · 행은 제자리에서 1.03배로 떠오르고 · 메뉴는 행 쪽 모서리에서 커짐, 닫힐 때도 줄며 사라진 뒤 내림
  useEffect(() => { if (props.rect) hx.lift() }, [props.rect])
  const lastRow = useRef(props.row)
  if (props.rect) lastRow.current = props.row
  const { shown: r, k, reduce, closing } = usePresence(props.rect)
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, k.value) }))
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ scale: reduce ? 1 : interpolate(k.value, [0, 1], [1, 1.03]) }] }), [reduce])
  const menuStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, k.value * 1.6),
    transform: [{ translateX: -135 }, { translateY: -150 }, { scale: reduce ? 1 : 0.6 + 0.4 * k.value }, { translateX: 135 }, { translateY: 150 }]
  }), [reduce])
  if (!r) return null
  const act = (a: LongPressAction) => { props.onClose(); props.onAction(a) }
  const dates: [LongPressAction, string, ReactNode][] = [
    ['today', '오늘', <Sun key="i" size={24} color={p.textPrimary} />],
    ['tomorrow', '내일', <Sunrise key="i" size={24} color={p.textPrimary} />],
    ['nextWeek', '다음 주', <CalendarArrowUp key="i" size={24} color={p.textPrimary} />],
    ['pickDate', '날짜…', <Calendar key="i" size={24} color={p.textPrimary} />]
  ]
  const all: [LongPressAction, string, ReactNode, boolean?][] = [
    ['pin', props.pinned ? '고정 해제' : '상단 고정', <Pin key="i" size={20} color={p.textSecondary} />],
    ['move', '이동', <FolderInput key="i" size={20} color={p.textSecondary} />],
    ['tag', '태그', <Tag key="i" size={20} color={p.textSecondary} />],
    // 20 §7.1 · 06 §14.4.6: 할 일 → 일정(데스크톱 우클릭 메뉴와 같은 줄)
    ['toEvent', '일정으로 바꾸기', <ArrowRightLeft key="i" size={20} color={p.textSecondary} />],
    // 29 §9.2 · 31 §12.12.2: 프로젝트 연결만 끊음(리스트엔 남음)
    ['out', '프로젝트에서 빼기', <FolderMinus key="i" size={20} color={p.textSecondary} />],
    ['delete', '삭제', <Trash2 key="i" size={20} color={p.danger} />, true]
  ]
  const items = all.filter(([a]) => (props.only ? props.only.includes(a) : a !== 'out'))
  const menuH = 74 + 46 + 44 * items.length
  const top = r.y + r.height + 10 + menuH > win.height - 30 ? Math.max(70, win.height - 30 - menuH - r.height - 10) : r.y
  return (
    <Modal transparent visible animationType="none" onRequestClose={props.onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.12)' }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} accessibilityLabel="메뉴 닫기" />
      </Animated.View>
      <View style={[s.wrap, { top }]} pointerEvents={closing ? 'none' : 'box-none'}>
        <Animated.View style={[s.lift, { backgroundColor: p.cardBg }, liftStyle]} pointerEvents="none">{lastRow.current}</Animated.View>
        <Animated.View style={[s.menu, { backgroundColor: p.bgPopover, borderColor: p.borderPopover }, menuStyle]}>
          <View style={[s.bar, { borderBottomColor: p.borderDivider }]}>
            {dates.map(([a, label, icon]) => (
              <Pressable key={a} accessibilityRole="button" accessibilityLabel={label} onPress={() => act(a)} style={s.dateBtn}>
                {icon}
                <Text style={[s.dateText, { color: p.textSecondary }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[s.bar, s.pri, { borderBottomColor: p.borderDivider }]}>
            {[3, 2, 1, 0].map((n) => (
              <Pressable key={n} accessibilityRole="button" accessibilityLabel={['우선순위 없음', '낮음', '중간', '높음'][n]} onPress={() => act(`p${n}` as LongPressAction)} style={[s.flag, props.priority === n && { backgroundColor: p.bgSelected }]}>
                <Flag size={22} color={priorityColor(p, n)} fill={n ? priorityColor(p, n) : 'transparent'} />
              </Pressable>
            ))}
          </View>
          {items.map(([a, label, icon, danger], i) => (
            <Pressable key={a} accessibilityRole="menuitem" onPress={() => act(a)} style={({ pressed }) => [s.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
              <Text style={[s.label, { color: danger ? p.danger : p.textPrimary }]}>{label}</Text>
              {icon}
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </Modal>
  )
}
const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  lift: { borderRadius: 14, overflow: 'hidden', marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  menu: { width: 270, borderRadius: 16, overflow: 'hidden', borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 16 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  pri: { paddingVertical: 6 },
  dateBtn: { alignItems: 'center', gap: 4, minWidth: 56 },
  dateText: { fontSize: 11, lineHeight: 14 },
  flag: { width: 44, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  item: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  label: { flex: 1, fontSize: 16, lineHeight: 22 }
})
