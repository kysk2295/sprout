// 캘린더 탭(06 데스크톱 캘린더의 휴대폰판 — 시안 G): 머리 = 왼쪽 보기 전환(목록·일·3일·월) · 가운데 달 · 오른쪽 오늘로 · ⋯
// - 월: 월요일 시작 칸, 칸 안에 리스트 색 옅은 띠 + 제목(넘치면 +n), 오늘 = 강조색 원. 날짜를 누르면 아래에 그날 목록. 위아래로 밀면 달이 바뀜
//   아래 목록을 위로 끌면 달이 고른 날의 한 주 줄로 접히고, 접힌 채 목록 맨 위에서 아래로 끌면 펼침(틱틱 목록 캘린더 — 20 §7, research 24 §10)
// - 일·3일: 위 주 줄(점 = 할 일 있음)·종일 줄·시간 칸(1시간 56). 빈 칸 누르면 그 시각으로 빠른 입력, 블록을 길게 눌러 끌면 옮김(15분 단위, 3일은 다른 날로도)
// - 목록: 오늘부터 30일 날짜별 묶음 카드
// - ⋯ → 완료 보기/숨기기 · 날짜 없는 할 일(누르면 고른 날에 일정 잡기 — 06 §9 할일 정렬 패널의 휴대폰판)
// - sprout 일정(20 §7.1, 06 §14.4): 할 일과 같은 띠·블록·행에 섞어 그린다 — 체크박스 자리 캘린더 아이콘, 누르면 일정 시트, 길게 누르면 일정 메뉴
// - 모양(06 §14.2): 취소선 없음. 완료 = 옅게 + 체크된 칸, 지난 미완료 = 옅은 채움 + 빈 칸 + 글자 한 단계 진하게, 색 = 리스트 색(없으면 강조색)
// 구글·Apple 캘린더 일정은 컴퓨터의 기기 데이터(16)라 휴대폰에는 없다.
import { useQuery } from '@powersync/react-native'
import { useRouter, useScrollToTop } from 'expo-router'
import { CalendarCheck, CalendarDays, CalendarRange, Check, Columns3, Ellipsis, List, Plus, Square } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import {
  agendaTitle, blockTime, CAL_VIEWS, cellSummary, dragTarget, floatingAt, HOUR_H, hourLabel, isBarItem, itemsOf, itemsOnDay, layoutDay, minutesAtY,
  monthDays, monthTitle, moveTo, rangeOf, shiftCursor, WEEK_HEAD, weekStart, weekdayKo, type Block, type CalItem, type MobileCalView
} from '../data/calendar'
import { rescheduleEvent, useEvents, useMyCalColor } from '../data/calEvents'
import { eventIdOf, eventItems, evtOf, isEventId, isPast } from '../data/eventsModel'
import { scheduleOn } from '../data/organization'
import { completeTasks, moveDates, reopenTasks, setPinned, setPriority, trashTasks, updateTask, type Undo } from '../data/tasks'
import { COLUMNS, type TaskRow } from '../data/views'
import { dayKey, nextMonday } from '../lib/dates'
import { alpha, FONT, M, mix, type Palette } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { useEventMenu } from '../ui/EventMenu'
import { EventRowView } from '../ui/EventRow'
import { afterMenu } from '../ui/Drawer'
import { EmptyState } from '../ui/EmptyState'
import { GlassButton } from '../ui/Glass'
import { SheetHead } from '../ui/SheetHead'
import { GroupCard } from '../ui/GroupCard'
import { LongPressMenu, type LongPressAction } from '../ui/LongPressMenu'
import { PopMenu, useAnchor, type Rect } from '../ui/Menu'
import { useToast } from '../ui/Toast'
import { Fab } from '../ui/Fab'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { TaskRowView } from '../ui/TaskRow'
import type { DayMarks } from '@sprout/schema/holidays'
import { useDayMarks, useMarkPrefs } from '../data/calendarPrefs'
import { RestBadge, SideLabel } from '../ui/DayMarks'

type Item = CalItem<TaskRow>
const VIEW_ICON: Record<MobileCalView, typeof List> = { list: List, day: Square, '3day': Columns3, month: CalendarDays }
const GUTTER = 48

/** 항목 모양(06 §14.2·§14.3): 일정 / 완료 / 지난 미완료 / 보통 */
function lookOf(p: Palette, it: Item, now: Date) {
  const ev = isEventId(it.task.id)
  const done = !ev && it.task.status !== 0
  const past = isPast(it.end, now)
  const overdue = !ev && !done && past
  const faded = done || past
  const color = it.task.list_color ?? p.accent
  return {
    ev, done, overdue, faded, color,
    text: done || (ev && past) ? p.textTertiary : overdue ? p.textSecondary : p.textPrimary,
    /** 체크박스 테두리·일정 아이콘 색: 리스트 색 70% + 글자색(다크는 흰색 쪽) */
    mark: ev && past ? p.textTertiary : mix(color.slice(0, 7), p.dark ? '#ffffff' : p.textSecondary, 0.7)
  }
}

function useToday() {
  const [today, setToday] = useState(dayKey())
  useEffect(() => {
    const t = setInterval(() => { const d = dayKey(); setToday((x) => (x === d ? x : d)) }, 30_000)
    return () => clearInterval(t)
  }, [])
  return today
}

export default function CalendarScreen() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const space = useTabBarSpace()
  const router = useRouter()
  const toast = useToast()
  const today = useToday()
  const [view, setView] = useState<MobileCalView>('month')
  const [cursor, setCursor] = useState(today)
  const [showDone, setShowDone] = useState(true)
  const [undatedOpen, setUndatedOpen] = useState(false)
  const viewMenu = useAnchor()
  const more = useAnchor()

  // 데이터: 범위에 걸친 할 일(일 보기는 주 줄 점 때문에 그 주 전체)
  const range = useMemo(() => {
    if (view === 'day') { const from = weekStart(cursor); return { from, to: dayKey(6, new Date(`${from}T00:00`)) } }
    const r = rangeOf(view, cursor)
    return { from: r.from, to: r.to }
  }, [view, cursor])
  const tasks = useQuery<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
     WHERE t.deleted_at IS NULL AND t.due_at IS NOT NULL AND (l.archived_at IS NULL) AND t.status IN (0, ?)
       AND substr(COALESCE(t.start_at, t.due_at), 1, 10) <= ? AND substr(t.due_at, 1, 10) >= ?`,
    [showDone ? 1 : 0, range.to, range.from]
  ).data
  const evRows = useEvents(range.from, range.to)
  const myColor = useMyCalColor()
  const items = useMemo<Item[]>(() => {
    const now = new Date()
    const evs = eventItems(evRows, range.from, range.to, myColor).filter((it) => showDone || !isPast(it.end, now)) // 완료 숨기기 = 지난 일정도 숨김(06 §14.3)
    return [...itemsOf(tasks, range.from, range.to), ...evs]
  }, [tasks, evRows, myColor, range, showDone])
  const evMenu = useEventMenu()
  // 06 §16 휴일·음력·주 번호(설정 › 날짜와 시간, 데스크톱과 같은 값) — 고른 해 앞뒤까지 한 번에
  const markPrefs = useMarkPrefs()
  const year = Number(cursor.slice(0, 4))
  const marks = useDayMarks(`${year - 1}-12-01`, `${year + 1}-01-31`, markPrefs)

  const withUndo = (msg: string, undo: Undo | null) => toast.show(msg, { undo: undo ?? undefined })
  const check = async (t: TaskRow) => {
    if (isEventId(t.id)) return
    if (t.status !== 0) return void reopenTasks([t.id])
    const undo = await completeTasks([t.id])
    if (undo) withUndo('작업이 완료되었습니다.', undo)
  }
  const openDetail = (t: TaskRow) => router.push(isEventId(t.id) ? `/event/${eventIdOf(t.id)}` : `/task/${t.id}`)
  const addAt = (due: string) => router.push({ pathname: '/quick-add', params: { view: `date:${due}` } })
  const openSheet = (path: '/move' | '/date' | '/tags', ids: string[]) => router.push({ pathname: path, params: { ids: ids.join(',') } })

  // 길게 누름(목록 행 · 블록): 할 일 탭과 같은 메뉴
  const [lp, setLpState] = useState<{ task: TaskRow; rect: Rect } | null>(null)
  const setLp = (v: { task: TaskRow; rect: Rect } | null) => (v && isEventId(v.task.id) ? evMenu.openMenu(v.task.id, v.rect) : setLpState(v))
  const onAction = async (a: LongPressAction) => {
    const t = lp?.task
    if (!t) return
    const ids = [t.id]
    if (a === 'today' || a === 'tomorrow' || a === 'nextWeek') {
      const date = a === 'today' ? today : a === 'tomorrow' ? dayKey(1) : nextMonday(today)
      withUndo(`${a === 'today' ? '오늘' : a === 'tomorrow' ? '내일' : '다음 주'}로 옮겼어요`, await moveDates(ids, date))
    } else if (a === 'pickDate') openSheet('/date', ids)
    else if (a === 'pin') await setPinned(ids, !t.pinned_at)
    else if (a === 'move') openSheet('/move', ids)
    else if (a === 'tag') openSheet('/tags', ids)
    else if (a === 'toEvent') await evMenu.act.fromTask(t.id)
    else if (a === 'delete') toast.show('휴지통으로 옮겼어요', { undo: await trashTasks(ids), duration: 5000 })
    else if (a.startsWith('p')) await setPriority(ids, Number(a.slice(1)))
  }
  // 블록 끌어 놓기 → 새 시각(길이 유지) + 되돌리기
  const drop = async (it: Item, dy: number, dCols: number) => {
    const t = it.task
    const target = dragTarget(it.start, dy, dCols)
    if (target === it.start) return
    if (evtOf(it)) return withUndo('옮겼어요', await rescheduleEvent(t.id, moveTo({ start_at: it.start, due_at: it.end }, target)))
    const before = { start_at: t.start_at, due_at: t.due_at, is_all_day: t.is_all_day }
    await updateTask(t.id, moveTo(t, target))
    withUndo('옮겼어요', () => updateTask(t.id, before))
  }

  const title = monthTitle(view === 'month' ? `${cursor.slice(0, 7)}-01` : cursor, today)
  const shift = (n: number) => setCursor((c) => (view === 'month' ? (() => { const m = shiftCursor('month', c, n); return m.slice(0, 7) === today.slice(0, 7) ? today : m })() : shiftCursor(view, c, n)))
  const bottomPad = space.padFab
  const ViewIcon = VIEW_ICON[view]
  const timeline = view === 'day' || view === '3day'

  return (
    <View style={{ flex: 1, backgroundColor: view === 'list' ? p.pageBg : p.cardBg }}>
      <View style={[s.head, { marginTop: insets.top }]}>
        <View ref={viewMenu.ref} collapsable={false}>
          <GlassButton label="보기 전환" onPress={viewMenu.open}><ViewIcon size={20} color={p.textPrimary} /></GlassButton>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}, 오늘로`} onPress={() => setCursor(today)} style={{ flex: 1 }}>
          <Text style={[FONT.nav, { color: p.textPrimary, textAlign: 'center', fontSize: 19 }]}>{title}</Text>
        </Pressable>
        <GlassButton label="오늘로" onPress={() => setCursor(today)}><CalendarCheck size={20} color={cursor === today ? p.accent : p.textPrimary} /></GlassButton>
        <View ref={more.ref} collapsable={false}>
          <GlassButton label="더보기" onPress={more.open}><Ellipsis size={22} color={p.textPrimary} /></GlassButton>
        </View>
      </View>

      {view === 'month' ? (
        <MonthView
          today={today}
          cursor={cursor}
          items={items}
          onPick={setCursor}
          onShift={shift}
          onAdd={addAt}
          marks={marks}
          list={(fold) => <DayList day={cursor} today={today} items={itemsOnDay(items, cursor)} onCheck={check} onOpen={openDetail} onLong={setLp} onAdd={() => addAt(cursor)} bottomPad={bottomPad} fold={fold} />}
        />
      ) : null}
      {timeline ? (
        <Timeline
          view={view}
          today={today}
          cursor={cursor}
          items={items}
          onPick={setCursor}
          onShift={shift}
          onAddAt={addAt}
          onOpen={openDetail}
          onCheck={check}
          onDrop={drop}
          onMenu={(task, rect) => setLp({ task, rect })}
          bottomPad={bottomPad}
          marks={marks}
        />
      ) : null}
      {view === 'list' ? <Agenda today={today} cursor={cursor} items={items} onCheck={check} onOpen={openDetail} onLong={setLp} onMore={() => shift(1)} onBack={cursor > today ? () => setCursor(today) : undefined} bottomPad={bottomPad} /> : null}

      <Fab onPress={() => addAt(timeline ? floatingAt(cursor, Math.min(23 * 60, (new Date().getHours() + 1) * 60)) : cursor)} />

      <PopMenu
        anchor={viewMenu.rect}
        onClose={viewMenu.close}
        width={190}
        align="left"
        items={CAL_VIEWS.map(([k, label]) => {
          const I = VIEW_ICON[k]
          return { key: k, label, checked: view === k, icon: <I size={18} color={view === k ? p.accent : p.textSecondary} />, onPress: () => setView(k) }
        })}
      />
      <PopMenu
        anchor={more.rect}
        onClose={more.close}
        width={230}
        items={[
          { key: 'done', label: showDone ? '완료한 할 일 숨기기' : '완료한 할 일 보기', onPress: () => setShowDone(!showDone) },
          { key: 'undated', label: '날짜 없는 할 일', icon: <CalendarRange size={18} color={p.textSecondary} />, onPress: () => afterMenu(() => setUndatedOpen(true)) }
        ]}
      />
      <LongPressMenu
        rect={lp?.rect ?? null}
        pinned={!!lp?.task.pinned_at}
        priority={lp?.task.priority ?? 0}
        onClose={() => setLp(null)}
        onAction={(a) => void onAction(a)}
        row={lp ? <TaskRowView task={lp.task} today={today} showList /> : null}
      />
      {evMenu.element}
      <UndatedSheet open={undatedOpen} day={cursor} today={today} onClose={() => setUndatedOpen(false)} onOpen={(t) => { setUndatedOpen(false); openDetail(t) }} />
    </View>
  )
}

/** 06 §16 날짜 숫자 색: 공휴일·일요일 = 빨강, 토요일 = 파랑(사용자 결정 2026-10-05), 다른 달은 옅게 */
function dayTone(p: Palette, d: string, mk: DayMarks, faded: boolean, base = p.textPrimary): string {
  const w = new Date(`${d}T00:00`).getDay()
  const c = mk.holiday || w === 0 ? p.holiday : w === 6 ? p.saturday : null
  if (!c) return faded ? p.textQuaternary : base
  return faded ? alpha(c, 0.45) : c
}

// ── 월 ──
/** 달 접기(20 §7): 아래 목록이 쓰는 끌기 · 스크롤 상태 */
type Fold = { gesture: ReturnType<typeof Gesture.Simultaneous>; scrollEnabled: boolean; scrollY: SharedValue<number> }
const FOLD_MS = 220
const snapTo = (to: number) => {
  'worklet'
  return withTiming(to, { duration: FOLD_MS, easing: Easing.out(Easing.cubic) })
}

function MonthView(props: { today: string; cursor: string; items: Item[]; onPick: (d: string) => void; onShift: (n: number) => void; onAdd: (d: string) => void; marks: (d: string, firstOfRow: boolean) => DayMarks; list: (fold: Fold) => ReactNode }) {
  const p = usePalette()
  const days = monthDays(props.cursor)
  const weeks = days.length / 7
  const rowH = weeks > 5 ? 58 : 66
  const month = props.cursor.slice(0, 7)
  const fullH = weeks * rowH
  const range = fullH - rowH
  const selWeek = Math.max(0, Math.floor(days.indexOf(props.cursor) / 7))
  const now = new Date()
  const { onShift, onPick, cursor } = props // 워클릿에는 함수만 넘긴다(props 통째로 넘기면 children을 복사하다 실패)

  // 0 = 달 전체, 1 = 고른 날의 한 주. 손가락을 따라가고, 놓으면 가까운 쪽(빠르게 튕기면 그 방향)으로 붙는다
  const [collapsed, setCollapsed] = useState(false)
  const prog = useSharedValue(0)
  const from = useSharedValue(0)
  const startScroll = useSharedValue(0)
  const scrollY = useSharedValue(0)
  const settle = (c: boolean) => setCollapsed(c)
  const begin = () => {
    'worklet'
    from.value = prog.value
    startScroll.value = scrollY.value
  }
  const follow = (ty: number) => {
    'worklet'
    if (range <= 0) return
    if (from.value < 0.5) prog.value = Math.min(1, Math.max(0, -ty / range))
    else if (startScroll.value <= 0 && ty > 0) prog.value = Math.min(1, Math.max(0, 1 - ty / range))
  }
  const release = (vy: number) => {
    'worklet'
    let to = prog.value > 0.5 ? 1 : 0
    if (from.value < 0.5 && vy < -500) to = 1
    if (from.value >= 0.5 && startScroll.value <= 0 && vy > 500) to = 0
    prog.value = snapTo(to)
    scheduleOnRN(settle, to === 1)
  }
  // 아래 목록: 펼친 동안은 스크롤 대신 접기, 접힌 뒤 맨 위에서 아래로 끌면 펼치기
  const native = Gesture.Native()
  const listPan = Gesture.Pan().activeOffsetY([-10, 10]).failOffsetX([-25, 25]).onStart(begin).onUpdate((e) => follow(e.translationY)).onEnd((e) => release(e.velocityY))
  const listGesture = Gesture.Simultaneous(listPan, native)

  // 달 칸: 펼침 = 위아래로 밀어 달 넘기기 / 접힘 = 아래로 끌어 펼치기 · 좌우로 밀어 앞뒤 주
  const monthSwipe = Gesture.Pan().activeOffsetY([-24, 24]).failOffsetX([-20, 20]).onEnd((e) => {
    if (e.translationY < -50) scheduleOnRN(onShift, 1)
    else if (e.translationY > 50) scheduleOnRN(onShift, -1)
  })
  const nextWeek = dayKey(7, new Date(`${cursor}T00:00`))
  const prevWeek = dayKey(-7, new Date(`${cursor}T00:00`))
  const pullDown = Gesture.Pan().activeOffsetY([-12, 12]).failOffsetX([-20, 20]).onStart(begin).onUpdate((e) => follow(e.translationY)).onEnd((e) => release(e.velocityY))
  const weekSwipe = Gesture.Pan().activeOffsetX([-24, 24]).failOffsetY([-16, 16]).onEnd((e) => {
    if (e.translationX < -50) scheduleOnRN(onPick, nextWeek)
    else if (e.translationX > 50) scheduleOnRN(onPick, prevWeek)
  })
  const gridGesture = collapsed ? Gesture.Race(pullDown, weekSwipe) : monthSwipe

  const frame = useAnimatedStyle(() => ({ height: fullH - range * prog.value }))
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: -selWeek * rowH * prog.value }] }))
  return (
    <View style={{ flex: 1 }}>
      <View style={s.wd}>
        {WEEK_HEAD.map((w, i) => <Text key={w} style={[s.wdText, { color: i === 6 ? p.holiday : i === 5 ? p.saturday : p.textTertiary }]}>{w}</Text>)}
      </View>
      <GestureDetector gesture={gridGesture}>
        <Animated.View
          accessibilityHint={collapsed ? '아래로 끌면 달 전체를 펼쳐요' : undefined}
          style={[{ overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.borderDivider }, frame]}
        >
          <Animated.View style={slide}>
            {Array.from({ length: weeks }, (_, w) => (
              <View key={w} style={[s.week, { height: rowH, borderTopColor: p.borderDivider }]} importantForAccessibility={collapsed && w !== selWeek ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={collapsed && w !== selWeek}>
                {days.slice(w * 7, w * 7 + 7).map((d, c) => {
                  // 06 §16 숫자 아래 한 줄(휴일 이름·주 번호·음력)이 있으면 띠를 하나 덜 보인다
                  const mk = props.marks(d, c === 0)
                  const { shown, more } = cellSummary(props.items, d, (rowH > 60 ? 3 : 2) - (mk.side ? 1 : 0))
                  const isToday = d === props.today
                  const sel = d === props.cursor
                  const other = d.slice(0, 7) !== month
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      accessibilityLabel={`${Number(d.slice(8))}일 ${weekdayKo(d)}요일${mk.holiday ? `, ${mk.holiday}` : ''}, 할 일 ${shown.length + more}개`}
                      accessibilityState={{ selected: sel }}
                      onPress={() => props.onPick(d)}
                      onLongPress={() => props.onAdd(d)}
                      style={[s.cell, sel && { backgroundColor: p.bgSelected }]}
                    >
                      <View style={[s.num, isToday && { backgroundColor: p.accent }]}>
                        <Text style={{ fontSize: 12, fontWeight: isToday || sel ? '700' : '500', color: isToday ? '#fff' : dayTone(p, d, mk, other && !collapsed) }}>{Number(d.slice(8))}</Text>
                        <RestBadge marks={mk} />
                      </View>
                      <View style={{ marginTop: -1, opacity: other && !collapsed ? 0.55 : 1 }}><SideLabel marks={mk} /></View>
                      {shown.map((it) => {
                        const k = lookOf(p, it, now)
                        return (
                          <View key={it.key} style={[s.bar, { backgroundColor: alpha(k.color.slice(0, 7), k.faded ? 0.08 : 0.18) }]}>
                            <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 13, color: k.text }}>{it.task.title}</Text>
                          </View>
                        )
                      })}
                      {more ? <Text style={{ fontSize: 10, lineHeight: 13, color: p.textTertiary, paddingLeft: 3 }}>+{more}</Text> : null}
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {props.list({ gesture: listGesture, scrollEnabled: collapsed, scrollY })}
    </View>
  )
}

function DayList(props: { day: string; today: string; items: Item[]; onCheck: (t: TaskRow) => void; onOpen: (t: TaskRow) => void; onLong: (v: { task: TaskRow; rect: Rect }) => void; onAdd: () => void; bottomPad: number; fold: Fold }) {
  const p = usePalette()
  const refs = useRef(new Map<string, View | null>())
  const { scrollY } = props.fold
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  return (
    <GestureDetector gesture={props.fold.gesture}>
      <Animated.ScrollView
        style={{ flex: 1, backgroundColor: p.pageBg }}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: props.bottomPad, flexGrow: 1 }}
        scrollEnabled={props.fold.scrollEnabled}
        bounces={false}
        overScrollMode="never"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {props.items.length ? (
          <GroupCard title={agendaTitle(props.day, props.today)} count={props.items.length} collapsed={false} onToggle={() => {}}>
            {props.items.map((it) => evtOf(it) ? (
              <EventRowView key={it.key} evt={evtOf(it)!} start={it.start} end={it.end} color={it.task.list_color ?? ''} onPress={() => props.onOpen(it.task)} onLongPress={(rect) => props.onLong({ task: it.task, rect })} />
            ) : (
              <View key={it.key} ref={(r) => { refs.current.set(it.key, r) }} collapsable={false}>
                <TaskRowView
                  task={it.task}
                  today={props.today}
                  showList
                  onCheck={() => props.onCheck(it.task)}
                  onPress={() => props.onOpen(it.task)}
                  onLongPress={() => refs.current.get(it.key)?.measureInWindow((x, y, width, height) => props.onLong({ task: it.task, rect: { x, y, width, height } }))}
                />
              </View>
            ))}
          </GroupCard>
        ) : (
          <Pressable accessibilityRole="button" onPress={props.onAdd} style={s.dayEmpty}>
            <Text style={[FONT.sub, { color: p.textTertiary }]}>{agendaTitle(props.day, props.today)} · 할 일·일정이 없어요</Text>
            <Text style={[FONT.sub, { color: p.accent, marginTop: 4 }]}>+ 추가</Text>
          </Pressable>
        )}
      </Animated.ScrollView>
    </GestureDetector>
  )
}

// ── 일 · 3일(시간 칸) ──
function Timeline(props: {
  view: MobileCalView; today: string; cursor: string; items: Item[]
  onPick: (d: string) => void; onShift: (n: number) => void; onAddAt: (due: string) => void; onOpen: (t: TaskRow) => void; onCheck: (t: TaskRow) => void
  onDrop: (it: Item, dy: number, dCols: number) => void; onMenu: (t: TaskRow, rect: Rect) => void; bottomPad: number
  marks: (d: string, firstOfRow: boolean) => DayMarks
}) {
  const p = usePalette()
  const win = useWindowDimensions()
  const days = props.view === 'day' ? [props.cursor] : rangeOf('3day', props.cursor).days
  const colW = (win.width - GUTTER) / days.length
  const scroll = useRef<ScrollView>(null)
  useScrollToTop(scroll)
  const [dragging, setDragging] = useState(false)
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  useEffect(() => {
    const t = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()) }, 60_000)
    return () => clearInterval(t)
  }, [])
  // 처음엔 지금 1시간 전(없으면 오전 8시)이 위에 오게
  useEffect(() => {
    const y = Math.max(0, ((days.includes(props.today) ? nowMin - 60 : 8 * 60) / 60) * HOUR_H)
    const t = setTimeout(() => scroll.current?.scrollTo({ y, animated: false }), 50)
    return () => clearTimeout(t)
  }, [props.view]) // eslint-disable-line react-hooks/exhaustive-deps
  const { onShift, onPick, cursor } = props
  const nextWeek = dayKey(7, new Date(`${cursor}T00:00`))
  const prevWeek = dayKey(-7, new Date(`${cursor}T00:00`))
  const swipe = Gesture.Pan().activeOffsetX([-24, 24]).failOffsetY([-16, 16]).onEnd((e) => {
    if (e.translationX < -50) scheduleOnRN(onShift, 1)
    else if (e.translationX > 50) scheduleOnRN(onShift, -1)
  })
  const bars = (d: string) => itemsOnDay(props.items, d).filter(isBarItem)
  const now = new Date() // 1분마다 nowMin이 바뀌어 다시 그려진다 → 지난 항목 옅게도 따라 바뀜
  const week = Array.from({ length: 7 }, (_, i) => dayKey(i, new Date(`${weekStart(props.cursor)}T00:00`)))
  const weekSwipe = Gesture.Pan().activeOffsetX([-24, 24]).onEnd((e) => {
    if (e.translationX < -50) scheduleOnRN(onPick, nextWeek)
    else if (e.translationX > 50) scheduleOnRN(onPick, prevWeek)
  })
  return (
    <View style={{ flex: 1 }}>
      {props.view === 'day' ? (
        <GestureDetector gesture={weekSwipe}>
          <View style={s.strip}>
            {week.map((d) => {
              const sel = d === props.cursor
              const has = itemsOnDay(props.items, d).length > 0
              const mk = props.marks(d, false)
              return (
                <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${Number(d.slice(8))}일 ${weekdayKo(d)}요일${mk.holiday ? `, ${mk.holiday}` : ''}`} accessibilityState={{ selected: sel }} onPress={() => props.onPick(d)} style={s.stripDay}>
                  <Text style={{ fontSize: 11, color: p.textTertiary }}>{weekdayKo(d)}</Text>
                  <View style={[s.stripNum, sel && { backgroundColor: p.accent }, !sel && d === props.today && { borderWidth: 1.5, borderColor: p.accent }]}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: sel ? '#fff' : d === props.today ? p.accent : dayTone(p, d, mk, false) }}>{Number(d.slice(8))}</Text>
                    <RestBadge marks={mk} size={13} top={-3} right={-5} />
                  </View>
                  <View style={[s.dot, { backgroundColor: has ? p.textQuaternary : 'transparent' }]} />
                </Pressable>
              )
            })}
          </View>
        </GestureDetector>
      ) : (
        <GestureDetector gesture={swipe}>
          <View style={[s.colHead, { paddingLeft: GUTTER }]}>
            {days.map((d) => {
              const mk = props.marks(d, false)
              return (
                <Pressable key={d} accessibilityLabel={`${weekdayKo(d)} ${Number(d.slice(8))}${mk.holiday ? `, ${mk.holiday}` : ''}`} onPress={() => props.onPick(d)} style={{ width: colW, alignItems: 'center', paddingVertical: 6 }}>
                  <View>
                    <Text style={{ fontSize: 12, color: d === props.today ? p.accent : dayTone(p, d, mk, false, p.textTertiary), fontWeight: d === props.today ? '700' : '400' }}>{`${weekdayKo(d)} ${Number(d.slice(8))}`}</Text>
                    <RestBadge marks={mk} top={-5} right={-9} />
                  </View>
                  <SideLabel marks={mk} size={9.5} />
                </Pressable>
              )
            })}
          </View>
        </GestureDetector>
      )}
      {/* 종일 줄 */}
      <View style={[s.allday, { borderBottomColor: p.borderDivider }]}>
        <Text style={[s.alldayLabel, { color: p.textTertiary }]}>종일</Text>
        {days.map((d) => {
          const b = bars(d)
          return (
            <View key={d} style={{ width: colW, paddingHorizontal: 2, gap: 2 }}>
              {b.slice(0, 3).map((it) => {
                const k = lookOf(p, it, now)
                return (
                  <Pressable key={it.key} accessibilityLabel={`${k.ev ? '일정 ' : ''}${it.task.title}`} onPress={() => props.onOpen(it.task)} onLongPress={(e) => props.onMenu(it.task, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 0, height: 0 })} style={[s.chip, { backgroundColor: alpha(k.color.slice(0, 7), k.faded ? 0.1 : 0.2) }]}>
                    {colW >= 48 ? <Mark look={k} onCheck={() => props.onCheck(it.task)} /> : null}
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: k.text }}>{it.task.title}</Text>
                  </Pressable>
                )
              })}
              {b.length > 3 ? <Text style={{ fontSize: 10, color: p.textTertiary }}>+{b.length - 3}</Text> : null}
            </View>
          )
        })}
      </View>
      <ScrollView ref={scroll} scrollEnabled={!dragging} contentContainerStyle={{ paddingBottom: props.bottomPad }}>
        <View style={{ height: 24 * HOUR_H, flexDirection: 'row' }}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: 24 }, (_, h) => (
              <Text key={h} style={[s.hour, { top: h * HOUR_H - 7, color: p.textTertiary }]}>{h ? hourLabel(h) : ''}</Text>
            ))}
          </View>
          {days.map((d, ci) => (
            <View key={d} style={{ width: colW, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: p.borderDivider }}>
              {Array.from({ length: 24 }, (_, h) => <View key={h} style={[s.line, { top: h * HOUR_H, borderTopColor: p.borderDivider }]} />)}
              <Pressable
                accessibilityLabel={`${d} 빈 시간 — 눌러서 할 일 추가`}
                style={StyleSheet.absoluteFill}
                onPress={(e) => props.onAddAt(floatingAt(d, minutesAtY(e.nativeEvent.locationY)))}
              />
              {layoutDay(props.items, d).map((b) => (
                <DragBlock key={b.item.key} block={b} now={now} colW={colW} colIndex={ci} cols={days.length} onDragging={setDragging} onTap={() => props.onOpen(b.item.task)} onCheck={() => props.onCheck(b.item.task)} onDrop={(dx, dy) => props.onDrop(b.item, dy, Math.round(dx / colW))} onMenu={(rect) => props.onMenu(b.item.task, rect)} />
              ))}
              {d === props.today ? (
                <View pointerEvents="none" style={[s.now, { top: (nowMin / 60) * HOUR_H }]}>
                  <View style={[s.nowDot, { backgroundColor: p.danger }]} />
                  <View style={{ flex: 1, height: 1.5, backgroundColor: p.danger }} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

/** 체크박스(할 일, 누르면 완료·완료 취소) 또는 캘린더 아이콘(일정) — 같은 자리·같은 크기 11(06 §14.3) */
function Mark({ look: k, onCheck }: { look: ReturnType<typeof lookOf>; onCheck?: () => void }) {
  if (k.ev) return <View style={s.mark}><CalendarDays size={11} color={k.mark} strokeWidth={2.4} /></View>
  const box = [s.mark, s.box, { borderColor: k.done ? k.color : k.mark, backgroundColor: k.done ? k.color : 'transparent' }]
  const check = k.done ? <Check size={8} color="#fff" strokeWidth={4} /> : null
  // 시간 칸 블록은 블록 탭이 자리로 나눠 처리(onCheck 없음), 종일 칩은 Pressable
  if (!onCheck) return <View style={box}>{check}</View>
  return (
    <Pressable hitSlop={8} onPress={onCheck} accessibilityRole="checkbox" accessibilityState={{ checked: k.done }} accessibilityLabel={k.done ? '완료 취소' : '완료'} style={box}>
      {check}
    </Pressable>
  )
}

/**
 * 시각 블록: 누르면 상세(일정이면 일정 시트), 길게 누른 채 끌면 옮기기, 길게 누르고 그대로 놓으면 빠른 메뉴.
 * 끄는 동안 블록은 15분 칸·날 열에 붙어 움직이고 원래 자리는 옅게(0.4) 남는다(06 §7.2 v1.7의 휴대폰판 — 20 §7.1).
 */
function DragBlock(props: { block: Block<TaskRow>; colW: number; colIndex: number; cols: number; now: Date; onDragging: (on: boolean) => void; onTap: () => void; onCheck: () => void; onDrop: (dx: number, dy: number) => void; onMenu: (r: Rect) => void }) {
  const p = usePalette()
  const { block: b, colW } = props
  const t = b.item.task
  const top = (b.startMin / 60) * HOUR_H
  const h = Math.max(22, ((b.endMin - b.startMin) / 60) * HOUR_H - 2)
  const w = colW / b.cols
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const lifted = useSharedValue(0)
  const ref = useRef<View>(null)
  const menu = useCallback(() => ref.current?.measureInWindow((x, y, width, height) => props.onMenu({ x, y, width, height })), [props])
  const end = useCallback((dx: number, dy: number) => {
    props.onDragging(false)
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) menu()
    else props.onDrop(dx, dy)
  }, [props, menu])
  const minX = -props.colIndex * colW
  const maxX = (props.cols - 1 - props.colIndex) * colW
  const q = HOUR_H / 4 // 15분
  const minY = -top
  const maxY = 24 * HOUR_H - q - top
  const { onDragging, onTap } = props
  const pan = Gesture.Pan()
    .enabled(!b.item.virtual)
    .activateAfterLongPress(320)
    .onStart(() => { lifted.value = 1; scheduleOnRN(onDragging, true) })
    .onUpdate((e) => {
      // 날 열·15분 칸에 붙는다(손가락을 그대로 따라가지 않음)
      tx.value = Math.round(Math.max(minX, Math.min(maxX, e.translationX)) / colW) * colW
      ty.value = Math.max(minY, Math.min(maxY, Math.round(e.translationY / q) * q))
    })
    .onEnd(() => { scheduleOnRN(end, tx.value, ty.value) })
    .onFinalize(() => { tx.value = 0; ty.value = 0; lifted.value = 0 })
  const k = lookOf(p, b.item, props.now)
  const markShown = w >= 48
  // 블록 왼쪽 체크박스 자리를 누르면 완료(상세는 열지 않는다), 나머지는 상세 — 체크박스를 Pressable로 두면 블록 탭과 둘 다 불린다
  const tapAt = useCallback((x: number) => { if (markShown && !k.ev && x < 26) props.onCheck(); else onTap() }, [markShown, k.ev, props, onTap])
  const tap = Gesture.Tap().onEnd((e) => { scheduleOnRN(tapAt, e.x) })
  const g = Gesture.Exclusive(pan, tap)
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }], zIndex: lifted.value ? 10 : 1, opacity: lifted.value ? 0.9 : 1, shadowOpacity: lifted.value ? 0.25 : 0 }))
  const ghost = useAnimatedStyle(() => ({ opacity: lifted.value ? 0.4 : 0 }))
  const box = { top, height: h, left: b.col * w + 1, width: w - 3, backgroundColor: alpha(k.color.slice(0, 7), k.faded ? 0.1 : 0.22), borderLeftColor: k.faded ? alpha(k.color.slice(0, 7), 0.5) : k.color }
  const body = (
    <>
      {markShown ? <Mark look={k} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={h > 36 ? 2 : 1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', color: k.text }}>{t.title}</Text>
        {h > 40 ? <Text numberOfLines={1} style={{ fontSize: 10, color: k.faded ? p.textTertiary : p.textSecondary }}>{blockTime(b.item.start, b.item.end)}</Text> : null}
      </View>
    </>
  )
  return (
    <>
      <Animated.View pointerEvents="none" style={[s.block, box, ghost]}>{body}</Animated.View>
      <GestureDetector gesture={g}>
        <Animated.View ref={ref} collapsable={false} accessibilityRole="button" accessibilityLabel={`${k.ev ? '일정 ' : ''}${t.title}, ${blockTime(b.item.start, b.item.end)}`} style={[s.block, box, s.shadow, style]}>
          {body}
        </Animated.View>
      </GestureDetector>
    </>
  )
}

// ── 목록(일정) ──
function Agenda(props: { today: string; cursor: string; items: Item[]; onCheck: (t: TaskRow) => void; onOpen: (t: TaskRow) => void; onLong: (v: { task: TaskRow; rect: Rect }) => void; onMore: () => void; onBack?: () => void; bottomPad: number }) {
  const p = usePalette()
  const scroll = useRef<ScrollView>(null)
  useScrollToTop(scroll)
  const refs = useRef(new Map<string, View | null>())
  const days = rangeOf('list', props.cursor).days
  const groups = days.map((d) => ({ d, items: itemsOnDay(props.items, d) })).filter((g) => g.items.length)
  return (
    <ScrollView ref={scroll} contentContainerStyle={{ paddingTop: 6, paddingBottom: props.bottomPad }}>
      {props.onBack ? <Pressable onPress={props.onBack} style={s.more}><Text style={[FONT.sub, { color: p.accent }]}>오늘부터 보기</Text></Pressable> : null}
      {!groups.length ? <EmptyState title="앞으로 30일 동안 일정이 없어요" sub="+를 눌러 추가하세요" /> : null}
      {groups.map((g) => (
        <GroupCard key={g.d} title={agendaTitle(g.d, props.today)} count={g.items.length} collapsed={false} onToggle={() => {}}>
          {g.items.map((it) => evtOf(it) ? (
            <EventRowView key={`${g.d}:${it.key}`} evt={evtOf(it)!} start={it.start} end={it.end} color={it.task.list_color ?? ''} onPress={() => props.onOpen(it.task)} onLongPress={(rect) => props.onLong({ task: it.task, rect })} />
          ) : (
            <View key={`${g.d}:${it.key}`} ref={(r) => { refs.current.set(`${g.d}:${it.key}`, r) }} collapsable={false}>
              <TaskRowView
                task={it.task}
                today={props.today}
                showList
                onCheck={() => props.onCheck(it.task)}
                onPress={() => props.onOpen(it.task)}
                onLongPress={() => refs.current.get(`${g.d}:${it.key}`)?.measureInWindow((x, y, width, height) => props.onLong({ task: it.task, rect: { x, y, width, height } }))}
              />
            </View>
          ))}
        </GroupCard>
      ))}
      <Pressable accessibilityRole="button" onPress={props.onMore} style={s.more}><Text style={[FONT.sub, { color: p.accent }]}>다음 30일</Text></Pressable>
    </ScrollView>
  )
}

// ── 날짜 없는 할 일(06 §9 휴대폰판) ──
function UndatedSheet(props: { open: boolean; day: string; today: string; onClose: () => void; onOpen: (t: TaskRow) => void }) {
  const p = usePalette()
  const toast = useToast()
  const rows = useQuery<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND t.due_at IS NULL AND t.parent_id IS NULL AND l.archived_at IS NULL ORDER BY t.priority DESC, t.sort_order LIMIT 300`
  ).data
  const label = agendaTitle(props.day, props.today)
  const put = async (t: TaskRow) => {
    await scheduleOn(t.id, props.day)
    toast.show(`${label.split(' · ')[0]}에 넣었어요`, { undo: () => updateTask(t.id, { start_at: null, due_at: null, is_all_day: 1 }) })
  }
  return (
    <Modal visible={props.open} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <View style={{ flex: 1, backgroundColor: p.pageBg }}>
        <SheetHead title="날짜 없는 할 일" onClose={props.onClose} />
        <Text style={[FONT.meta, { color: p.textTertiary, paddingHorizontal: 20, paddingBottom: 8 }]}>{`＋를 누르면 ${label}에 일정을 잡아요`}</Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {rows.length ? (
            <View style={[s.card, { backgroundColor: p.cardBg }]}>
              {rows.map((t) => (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}><TaskRowView task={t} today={props.today} showList onPress={() => props.onOpen(t)} /></View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${t.title} 일정 잡기`} hitSlop={6} onPress={() => void put(t)} style={[s.put, { backgroundColor: p.accentSubtle }]}>
                    <Plus size={16} color={p.accent} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : <EmptyState title="날짜 없는 할 일이 없어요" />}
        </ScrollView>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  head: { height: M.navH, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  wd: { flexDirection: 'row', height: 26, alignItems: 'center' },
  wdText: { flex: 1, textAlign: 'center', fontSize: 12 },
  week: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cell: { flex: 1, paddingTop: 3, paddingHorizontal: 1.5, gap: 1.5, overflow: 'hidden' },
  num: { alignSelf: 'center', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  bar: { borderRadius: 3, paddingHorizontal: 3 },
  dayEmpty: { alignItems: 'center', paddingVertical: 28 },
  strip: { flexDirection: 'row', paddingHorizontal: 6, paddingBottom: 4 },
  stripDay: { flex: 1, alignItems: 'center', gap: 3 },
  stripNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  colHead: { flexDirection: 'row' },
  allday: { flexDirection: 'row', minHeight: 28, paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth },
  alldayLabel: { width: GUTTER, fontSize: 10, textAlign: 'center', paddingTop: 4 },
  chip: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 },
  hour: { position: 'absolute', right: 6, fontSize: 10 },
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  block: { position: 'absolute', borderRadius: 5, borderLeftWidth: 3, paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', gap: 4, overflow: 'hidden' },
  mark: { width: 11, height: 11, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: 3, borderWidth: 1.2 },
  shadow: { shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  now: { position: 'absolute', left: -4, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot: { width: 8, height: 8, borderRadius: 4 },
  more: { alignItems: 'center', paddingVertical: 14 },
  card: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, overflow: 'hidden' },
  put: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 }
})

