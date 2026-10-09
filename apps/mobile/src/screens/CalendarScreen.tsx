// 캘린더 탭(06 데스크톱 캘린더의 휴대폰판 — 시안 G): 머리 = 왼쪽 보기 전환(목록·일·3일·월) · 가운데 달 · 오른쪽 오늘로 · ⋯
// - 월: 화면 가득한 격자(주 시작 설정 칸, 리스트 색 옅은 띠 + 제목, 넘치면 +n). 날짜를 누르면 그 주가 맨 위로 올라가고 아래가 갈라지며 그날 판,
//   같은 날 다시 누르면 닫힘(research 35 · 39 §4.11). 위아래로 밀면 달이 바뀜
// - 목록: 작은 달 + 아래 그날 목록. 아래 목록을 위로 끌면 달이 고른 날의 한 주 줄로 접히고, 접힌 채 목록 맨 위에서 아래로 끌면 펼침(틱틱 목록 캘린더 — 20 §7, research 24 §10·34 §3.4)
// - 일·3일: 위 주 줄(점 = 할 일 있음)·종일 줄·시간 칸(1시간 56). 빈 칸 누르면 그 시각으로 빠른 입력, 블록을 길게 눌러 끌면 옮김(15분 단위, 3일은 다른 날로도)
// - ⋯ → 완료 보기/숨기기 · 날짜 없는 할 일(누르면 고른 날에 일정 잡기 — 06 §9 할일 정렬 패널의 휴대폰판)
// - sprout 일정(20 §7.1, 06 §14.4): 할 일과 같은 띠·블록·행에 섞어 그린다 — 체크박스 자리 캘린더 아이콘, 누르면 일정 시트, 길게 누르면 일정 메뉴
// - 모양(06 §14.2): 취소선 없음. 완료 = 옅게 + 체크된 칸, 지난 미완료 = 옅은 채움 + 빈 칸 + 글자 한 단계 진하게, 색 = 리스트 색(없으면 강조색)
// 38 휴대폰 캘린더: 연결하면(설정 › 캘린더 연동 · ⋯ › 캘린더 구독) 켜 둔 휴대폰 캘린더 일정을 그 캘린더 색으로 섞어 그린다.
//   연결된 꿈틀 일정과 같은 일정은 숨김(§7). 누르면 휴대폰 일정 시트, 쓸 수 있으면 끌어 옮기기(반복이면 범위 대화).
//   구글·Apple 캐시 전용 일정(데스크톱 16)은 컴퓨터의 기기 데이터라 휴대폰에는 없다.
import { useLiveQuery } from '../data/rows'
import { useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router'
import { CalendarCheck, CalendarDays, CalendarPlus, CalendarRange, Check, Columns3, Columns4, Ellipsis, ExternalLink, Grid3x3, List, Plus, Square, Trash2 } from 'lucide-react-native'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import {
  agendaTitle, blockTime, CAL_VIEWS, dragTarget, floatingAt, HOUR_H, hourLabel, isBarItem, itemsByDay, itemsOf, itemsOnDay, layoutDay, minutesAtY,
  monthDays, monthTitle, moveTo, rangeOf, shiftCursor, weekHeadOf, weekStart, weekdayKo, type Block, type CalItem, type MobileCalView
} from '../data/calendar'
import { rescheduleEvent, useEvents, useMyCalColor } from '../data/calEvents'
import { eventIdOf, eventItems, evtOf, isEventId, isPast } from '../data/eventsModel'
import { scheduleOn } from '../data/organization'
import { useRows } from '../data/rows'
import { completeTasks, moveDates, reopenTasks, setPinned, setPriority, trashTasks, updateTask, type Undo } from '../data/tasks'
import { COLUMNS, type TaskRow } from '../data/views'
import { dayKey, nextMonday } from '../lib/dates'
import { hx } from '../ui/haptics'
import { DUR, popIn, SPRING, timing } from '../ui/motion'
import Svg, { Circle, Ellipse, Path, Rect as SvgRect } from 'react-native-svg'
import { alpha, FONT, M, mix, type Palette } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { useEventMenu } from '../ui/EventMenu'
import { EventRowView } from '../ui/EventRow'
import { afterMenu } from '../ui/Drawer'
import { SoftIcon } from '../ui/SoftIcon'
import { EmptyState } from '../ui/EmptyState'
import { SceneBand } from '../growth/art/Scene3D'
import { useMyBandScene } from '../growth/home/glass'
import { GlassButton } from '../ui/Glass'
import { SheetHead } from '../ui/SheetHead'
import { GroupCard } from '../ui/GroupCard'
import { LongPressMenu, type LongPressAction } from '../ui/LongPressMenu'
import { PopMenu, useAnchor, type Rect } from '../ui/Menu'
import { useToast } from '../ui/Toast'
import { Fab } from '../ui/Fab'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { DayDragLayer, DayDragRow, useDayDrag, type DayDragApi, type DayDragMeasure } from '../ui/DayDrag'
import { TaskRowView } from '../ui/TaskRow'
import type { DayMarks } from '@sprout/schema/holidays'
import { isWidgetDate } from '@sprout/schema/widget'
import { useDayMarks, useMarkPrefs, useWeekStart } from '../data/calendarPrefs'
import { headWeekday, type WeekStart } from '@sprout/schema/weekStart'
import { SideLabel } from '../ui/DayMarks'
import { eventSpan } from '@sprout/schema/events'
import { useDeviceActions } from '../calendars/actions'
import { PF } from '../calendars/device'
import { deviceItems, deviceRef, isDeviceItemId, linkLabel } from '../calendars/items'
import { isMine } from '../calendars/link'
import { myLinkAccount, useDeviceEvents } from '../calendars/store'

type Item = CalItem<TaskRow>
const VIEW_ICON: Record<MobileCalView, typeof List> = { list: List, year: Grid3x3, month: CalendarDays, week: Columns4, '3day': Columns3, day: Square }
const GUTTER = 48

/**
 * 항목 모양(20 §7 v1.4 — 틱틱 다크 사진 + 사용자 2026-10-09 "할일과 안한일이 색상이 차이가 있어야"):
 * - 안 한 할 일(지난 날 포함) = 리스트 색 그대로 채운 막대 + 흰 굵은 글자. 날짜가 지났다고 옅게 하지 않는다
 * - 한 할 일 = 같은 모양, 리스트 색을 바탕에 어둡게 섞은 면(다크 32%·라이트 22%) + 흐린 글자. 취소선 없음
 * - 일정 = 제 색을 섞은 옅은 면(다크 50%·라이트 25%) + 캘린더 아이콘, 지난 일정은 한 할 일과 같이 흐리게
 */
function lookOf(p: Palette, it: Item, now: Date) {
  const ev = isEventId(it.task.id)
  const done = !ev && it.task.status !== 0
  const past = isPast(it.end, now)
  const overdue = !ev && !done && past
  const faded = done || (ev && past)
  const color = it.task.list_color ?? p.accent
  const c = color.slice(0, 7)
  const base = p.pageBg
  const dimText = p.dark ? 'rgba(255,255,255,0.48)' : alpha(p.textPrimary.slice(0, 7), 0.42)
  const fill = faded ? mix(c, base, p.dark ? 0.32 : 0.22) : ev ? mix(c, base, p.dark ? 0.5 : 0.25) : c
  const text = faded ? dimText : ev && !p.dark ? mix(c, p.textPrimary.slice(0, 7), 0.45) : '#ffffff'
  return {
    ev, done, overdue, faded, color, fill, text,
    /** 시각 블록 왼쪽 줄 */
    edge: faded ? mix(c, base, p.dark ? 0.55 : 0.45) : ev ? c : mix(c, '#000000', 0.82),
    /** 블록 둘째 줄(시각) */
    sub: faded ? dimText : ev && !p.dark ? p.textSecondary : 'rgba(255,255,255,0.82)',
    /** 체크박스 테두리·일정 아이콘 색 — 채운 막대 위라 글자색 쪽 */
    mark: faded ? dimText : ev && !p.dark ? mix(c, p.textPrimary.slice(0, 7), 0.7) : 'rgba(255,255,255,0.9)',
    /** 체크된 칸 채움(흐린 면 위에서 너무 튀지 않게) */
    checkFill: mix(c, base, 0.7)
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
  const bandScene = useMyBandScene(p.dark) // 49 §6.1 월 이름 뒤 띠 = 내 배경 장면을 가로로 잘라
  const insets = useSafeAreaInsets()
  const { width: winW } = useWindowDimensions()
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
  // 36 §6 위젯 날짜 칸: sprout://calendar?date=YYYY-MM-DD → 월 보기에서 그날 고름
  const { date: linkDate } = useLocalSearchParams<{ date?: string }>()
  useEffect(() => {
    if (!isWidgetDate(linkDate)) return
    setView('month')
    setCursor(linkDate)
  }, [linkDate])

  // 데이터: 범위에 걸친 할 일(일 보기는 주 줄 점 때문에 그 주 전체)
  const ws = useWeekStart() // 06 §16.1 / 20 §7.2 주 시작(설정 › 날짜와 시간) — 바꾸면 바로 다시 그린다
  const range = useMemo(() => {
    if (view === 'day') { const from = weekStart(cursor, ws); return { from, to: dayKey(6, new Date(`${from}T00:00`)) } }
    const r = rangeOf(view, cursor, ws)
    // 39 §4.11: 월 보기는 끌 때 앞뒤 달이 보이므로 그 달까지 읽는다
    if (view === 'month' || view === 'list') return { from: rangeOf('month', shiftCursor('month', cursor, -1), ws).from, to: rangeOf('month', shiftCursor('month', cursor, 1), ws).to }
    return { from: r.from, to: r.to }
  }, [view, cursor, ws])
  // 39 §11: 바뀐 행만 새 객체(칸 memo가 그대로인 날을 건너뜀)
  const tasks = useRows<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
     WHERE t.deleted_at IS NULL AND t.due_at IS NOT NULL AND (l.archived_at IS NULL) AND t.status IN (0, ?)
       AND substr(COALESCE(t.start_at, t.due_at), 1, 10) <= ? AND substr(t.due_at, 1, 10) >= ?`,
    [showDone ? 1 : 0, range.to, range.from]
  ).data
  const evRows = useEvents(range.from, range.to)
  const myColor = useMyCalColor()
  // 38: 휴대폰 캘린더 일정(켜 둔 캘린더) + 연결된 일정의 캘린더 이름
  const dev = useDeviceEvents(range.from, range.to)
  const [myAccount, setMyAccount] = useState<string | null>(null)
  useEffect(() => { void myLinkAccount().then(setMyAccount).catch(() => {}) }, [])
  const items = useMemo<Item[]>(() => {
    const now = new Date()
    const nameOf = (e: (typeof evRows)[number]) => linkLabel(e, dev.calendars, myAccount, PF)
    const evs = eventItems(evRows, range.from, range.to, myColor, nameOf)
    const linked = evs.filter((it) => !!it.evt.ext_provider)
    const myExtIds = new Set(evRows.filter((e) => e.ext_id && myAccount && isMine(e, PF, myAccount)).map((e) => e.ext_id!))
    const devs = deviceItems(dev.events, dev.calendars, PF, { myExtIds, linked, from: range.from, to: range.to })
    const shown = [...evs, ...devs].filter((it) => showDone || !isPast(it.end, now)) // 완료 숨기기 = 지난 일정도 숨김(06 §14.3)
    return [...itemsOf(tasks, range.from, range.to), ...shown]
  }, [tasks, evRows, myColor, range, showDone, dev.events, dev.calendars, myAccount])
  const devAct = useDeviceActions()
  const [devMenu, setDevMenu] = useState<{ id: string; rect: Rect } | null>(null)
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
  const openDetail = (t: TaskRow) => (isDeviceItemId(t.id) ? devAct.open(t.id) : router.push(isEventId(t.id) ? `/event/${eventIdOf(t.id)}` : `/task/${t.id}`))
  const addAt = (due: string) => router.push({ pathname: '/quick-add', params: { view: `date:${due}` } })
  const openSheet = (path: '/move' | '/date' | '/tags', ids: string[]) => router.push({ pathname: path, params: { ids: ids.join(',') } })

  // 길게 누름(목록 행 · 블록): 할 일 탭과 같은 메뉴
  const [lp, setLpState] = useState<{ task: TaskRow; rect: Rect } | null>(null)
  const setLp = (v: { task: TaskRow; rect: Rect } | null) => (v && isDeviceItemId(v.task.id) ? setDevMenu({ id: v.task.id, rect: v.rect }) : v && isEventId(v.task.id) ? evMenu.openMenu(v.task.id, v.rect) : setLpState(v))
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
    if (isDeviceItemId(t.id)) { const m = moveTo({ start_at: it.start, due_at: it.end }, target); await devAct.save(t.id, eventSpan(m.start_at, m.due_at), { toast: '옮겼어요' }); return }
    if (evtOf(it)) return withUndo('옮겼어요', await rescheduleEvent(t.id, moveTo({ start_at: it.start, due_at: it.end }, target)))
    const before = { start_at: t.start_at, due_at: t.due_at, is_all_day: t.is_all_day }
    await updateTask(t.id, moveTo(t, target))
    withUndo('옮겼어요', () => updateTask(t.id, before))
  }

  // 목록 = 작은 달 + 그날 목록(틱틱 목록 보기 — research 34 §3.4), 월 = 화면 가득한 달(research 35). 둘 다 한 달씩 넘긴다
  const monthLike = view === 'month' || view === 'list'
  const title = view === 'year' ? `${cursor.slice(0, 4)}년` : monthTitle(monthLike ? `${cursor.slice(0, 7)}-01` : cursor, today)
  const shift = (n: number) => setCursor((c) => (monthLike ? (() => { const m = shiftCursor('month', c, n); return m.slice(0, 7) === today.slice(0, 7) ? today : m })() : shiftCursor(view, c, n)))
  const bottomPad = space.padFab
  const ViewIcon = VIEW_ICON[view]
  const timeline = view === 'day' || view === '3day' || view === 'week'
  // 년 → 월(달 누름): 월 보기가 커지며 옅게 나타남 [영상 실측 120ms]
  const [fromYear, setFromYear] = useState(0)
  // 39 §4.11 [영상 실측 research 37]: 판의 할 일을 끄는 동안 + 버튼 자리엔 ✕(MonthFull이 그림)
  const [monthDrag, setMonthDrag] = useState(false)
  const dropOnDay = useCallback((t: TaskRow, day: string) => { void moveDates([t.id], day) }, [])
  const openMonth = (m: string) => { setFromYear((n) => n + 1); setCursor(m.slice(0, 7) === today.slice(0, 7) ? today : m); setView('month') }

  return (
    <View style={{ flex: 1, backgroundColor: view === 'month' ? p.pageBg : p.cardBg }}>
      {/* 49 §8.2 은은하게: 월 이름 뒤 얕은 장면 띠(머리 + 요일 줄까지, 아래로 바탕에 녹음). 달 보기만 — 자리를 차지하지 않는다 */}
      {view === 'month' ? <SceneBand dark={p.dark} sceneKey={bandScene} width={winW} height={insets.top + M.navH + 30} bg={p.pageBg} fade={0.7} style={s.band} /> : null}
      <View style={[s.head, { marginTop: insets.top }]}>
        <View ref={viewMenu.ref} collapsable={false}>
          <GlassButton label="보기 전환" onPress={viewMenu.open}><ViewIcon size={20} color={p.textPrimary} /></GlassButton>
        </View>
        {/* 달 이름은 화면 가운데에 고정(좌 버튼 1개·우 버튼 2개 폭과 상관없이 — 틱틱 사진, 사용자 2026-10-09) */}
        <View pointerEvents="box-none" style={s.headTitle}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${title}, 오늘로`} onPress={() => setCursor(today)} hitSlop={8}>
            <Text style={[FONT.nav, { color: p.textPrimary, textAlign: 'center', fontSize: 19 }]}>{title}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }} />
        <GlassButton label="오늘로" onPress={() => setCursor(today)}><CalendarCheck size={20} color={cursor === today ? p.accent : p.textPrimary} /></GlassButton>
        <View ref={more.ref} collapsable={false}>
          <GlassButton label="더보기" onPress={more.open}><Ellipsis size={22} color={p.textPrimary} /></GlassButton>
        </View>
      </View>

      {view === 'year' ? <YearView year={cursor.slice(0, 4)} today={today} items={items} ws={ws} onPick={openMonth} onShift={shift} bottomPad={bottomPad} /> : null}
      {view === 'month' ? (
        <Animated.View key={`m${fromYear}`} entering={fromYear ? monthZoom : undefined} style={{ flex: 1 }}>
          <MonthFull
            ws={ws}
            today={today}
            cursor={cursor}
            items={items}
            onPick={setCursor}
            onShift={shift}
            onAdd={addAt}
            marks={marks}
            clear={space.clear}
            fabBottom={space.fabBottom}
            onDragging={setMonthDrag}
            onLong={setLp}
            onDropDay={dropOnDay}
            panel={(drag) => <DayPanel day={cursor} today={today} items={itemsOnDay(items, cursor)} onCheck={check} onOpen={openDetail} onLong={setLp} drag={drag} />}
          />
        </Animated.View>
      ) : null}
      {view === 'list' ? (
        <MonthView
          ws={ws}
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
          ws={ws}
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

      {view === 'month' && monthDrag ? null : <Fab onPress={() => addAt(timeline ? floatingAt(cursor, Math.min(23 * 60, (new Date().getHours() + 1) * 60)) : cursor)} />}

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
          { key: 'undated', label: '날짜 없는 할 일', icon: <CalendarRange size={18} color={p.textSecondary} />, onPress: () => afterMenu(() => setUndatedOpen(true)) },
          // 38 §2.2 [틱틱 ⋯ › Calendar Subscription]
          { key: 'subscribe', label: '캘린더 구독', icon: <CalendarPlus size={18} color={p.textSecondary} />, onPress: () => router.push('/settings/calendars') }
        ]}
      />
      {/* 38 §5.4 휴대폰 캘린더 일정 길게 누름: 열기 · 캘린더 앱에서 열기 · 삭제(쓸 수 있을 때) */}
      <PopMenu
        anchor={devMenu?.rect ?? null}
        onClose={() => setDevMenu(null)}
        width={220}
        align="left"
        items={devMenu ? [
          { key: 'open', label: '열기', icon: <ExternalLink size={18} color={p.textSecondary} />, onPress: () => devAct.open(devMenu.id) },
          { key: 'app', label: '캘린더 앱에서 열기', icon: <CalendarDays size={18} color={p.textSecondary} />, onPress: () => devAct.openInApp(devMenu.id) },
          ...(deviceRef(devMenu.id)?.writable ? [{ key: 'del', label: '삭제', danger: true, icon: <Trash2 size={18} color={p.danger} />, onPress: () => void devAct.remove(devMenu.id) }] : [])
        ] : []}
      />
      {devAct.element}
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

// ── 년(39 G18 · 20 §7 — research 34 §3.4) ──
const monthZoom = popIn(0.92, 120)
function YearView(props: { year: string; today: string; items: Item[]; ws: WeekStart; onPick: (month: string) => void; onShift: (n: number) => void; bottomPad: number }) {
  const p = usePalette()
  const win = useWindowDimensions()
  const cellW = Math.floor((win.width - 24 - 2 * 14) / 3 / 7)
  // 날마다 할 일·일정 수(시작 날 기준) — 칸 진하기
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of props.items) { const d = it.start.slice(0, 10); m.set(d, (m.get(d) ?? 0) + 1) }
    return m
  }, [props.items])
  const { onShift } = props
  const swipe = Gesture.Pan().activeOffsetY([-24, 24]).failOffsetX([-20, 20]).onEnd((e) => {
    if (e.translationY < -60 || e.velocityY < -600) scheduleOnRN(onShift, 1)
    else if (e.translationY > 60 || e.velocityY > 600) scheduleOnRN(onShift, -1)
  })
  return (
    <GestureDetector gesture={swipe}>
      <View style={[s.year, { paddingBottom: props.bottomPad }]}>
        {Array.from({ length: 12 }, (_, i) => {
          const m = `${props.year}-${String(i + 1).padStart(2, '0')}-01`
          const days = monthDays(m, props.ws)
          return (
            <Pressable key={m} accessibilityRole="button" accessibilityLabel={`${i + 1}월`} onPress={() => props.onPick(m)} style={({ pressed }) => [s.ym, pressed && { opacity: 0.6 }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: m.slice(0, 7) === props.today.slice(0, 7) ? p.accentInk : p.textPrimary, marginBottom: 4 }}>{i + 1}월</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cellW * 7 }}>
                {days.map((d) => {
                  const other = d.slice(0, 7) !== m.slice(0, 7)
                  const n = other ? 0 : counts.get(d) ?? 0
                  const isToday = d === props.today
                  return (
                    <View key={d} style={[s.yc, { width: cellW, height: cellW }, n ? { backgroundColor: alpha(p.accent.slice(0, 7), n > 3 ? 0.5 : n > 1 ? 0.32 : 0.18) } : null, isToday && { backgroundColor: p.accent, borderRadius: cellW / 2 }]}>
                      {other ? null : <Text style={{ fontSize: 9, lineHeight: 11, color: isToday ? '#fff' : p.textSecondary }}>{Number(d.slice(8))}</Text>}
                    </View>
                  )
                })}
              </View>
            </Pressable>
          )
        })}
      </View>
    </GestureDetector>
  )
}

// ── 월 ──
/** 달 접기(20 §7): 아래 목록이 쓰는 끌기 · 스크롤 상태 */
type Fold = { gesture: ReturnType<typeof Gesture.Simultaneous>; scrollEnabled: boolean; scrollY: SharedValue<number> }
const FOLD_MS = 220
const snapTo = (to: number) => {
  'worklet'
  return withTiming(to, { duration: FOLD_MS, easing: Easing.out(Easing.cubic) })
}

function MonthView(props: { ws: WeekStart; today: string; cursor: string; items: Item[]; onPick: (d: string) => void; onShift: (n: number) => void; onAdd: (d: string) => void; marks: (d: string, firstOfRow: boolean) => DayMarks; list: (fold: Fold) => ReactNode }) {
  const p = usePalette()
  const days = useMemo(() => monthDays(props.cursor, props.ws), [props.cursor.slice(0, 7), props.ws]) // eslint-disable-line react-hooks/exhaustive-deps
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

  // 달 칸: 펼침 = 위아래로 끌면 앞뒤 달이 이어 붙은 세로 띠가 손가락을 따라오고, 놓으면 한 달 넘김(39 §4.11 [영상 실측 research 34])
  //        접힘 = 아래로 끌어 펼치기 · 좌우로 밀어 앞뒤 주
  const prevC = `${shiftCursor('month', `${month}-01`, -1).slice(0, 7)}-01`
  const nextC = `${shiftCursor('month', `${month}-01`, 1).slice(0, 7)}-01`
  const prevDays = useMemo(() => monthDays(prevC, props.ws), [prevC, props.ws])
  const nextDays = useMemo(() => monthDays(nextC, props.ws), [nextC, props.ws])
  const prevH = (prevDays.length / 7) * rowH
  const pageY = useSharedValue(0)
  // 넘긴 뒤 새 달이 그려지기 전에 띠를 가운데로(보이지 않게)
  useLayoutEffect(() => { pageY.value = 0 }, [month, pageY])
  const fh = useSharedValue(fullH)
  useEffect(() => { fh.value = withTiming(fullH, { duration: DUR.move }) }, [fullH, fh])
  const monthSwipe = Gesture.Pan().activeOffsetY([-12, 12]).failOffsetX([-20, 20])
    .onUpdate((e) => { pageY.value = e.translationY })
    .onEnd((e) => {
      const thr = fullH * 0.2
      const v = e.velocityY
      if (e.translationY < -thr || v < -500) pageY.value = withSpring(-fullH, { ...SPRING.page, velocity: v }, (fin) => { if (fin) scheduleOnRN(onShift, 1) })
      else if (e.translationY > thr || v > 500) pageY.value = withSpring(prevH, { ...SPRING.page, velocity: v }, (fin) => { if (fin) scheduleOnRN(onShift, -1) })
      else pageY.value = withSpring(0, { ...SPRING.page, velocity: v })
    })
  const nextWeek = dayKey(7, new Date(`${cursor}T00:00`))
  const prevWeek = dayKey(-7, new Date(`${cursor}T00:00`))
  const pullDown = Gesture.Pan().activeOffsetY([-12, 12]).failOffsetX([-20, 20]).onStart(begin).onUpdate((e) => follow(e.translationY)).onEnd((e) => release(e.velocityY))
  const weekSwipe = Gesture.Pan().activeOffsetX([-24, 24]).failOffsetY([-16, 16]).onEnd((e) => {
    if (e.translationX < -50) scheduleOnRN(onPick, nextWeek)
    else if (e.translationX > 50) scheduleOnRN(onPick, prevWeek)
  })
  const gridGesture = collapsed ? Gesture.Race(pullDown, weekSwipe) : monthSwipe

  const frame = useAnimatedStyle(() => ({ height: fh.value - range * prog.value }))
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: -selWeek * rowH * prog.value + pageY.value }] }))
  // 39 §11: 칸 그리기는 memo(MonthWeeks · DayCell) — 넘길 때 바뀐 칸만 다시 그리고, 달은 키로 이어 써서 다시 만들지 않는다
  const pickRef = useRef(props.onPick)
  pickRef.current = props.onPick
  const addRef = useRef(props.onAdd)
  addRef.current = props.onAdd
  const pick = useCallback((d: string) => { hx.tick(); pickRef.current(d) }, [])
  const add = useCallback((d: string) => addRef.current(d), [])
  const byDay = useMemo(() => itemsByDay(props.items, prevDays[0], nextDays[nextDays.length - 1]), [props.items, prevDays, nextDays])
  const months = [
    { mkey: prevC.slice(0, 7), ds: prevDays, top: -prevH, live: false },
    { mkey: month, ds: days, top: 0, live: true },
    { mkey: nextC.slice(0, 7), ds: nextDays, top: fullH, live: false }
  ].filter((m) => m.live || !collapsed)
  return (
    <View style={{ flex: 1 }}>
      <View style={s.wd}>
        {weekHeadOf(props.ws).map((w, i) => { const dow = headWeekday(i, props.ws); return <Text key={w} style={[s.wdText, { color: dow === 0 ? p.holiday : dow === 6 ? p.saturday : p.textTertiary }]}>{w}</Text> })}
      </View>
      <GestureDetector gesture={gridGesture}>
        <Animated.View
          accessibilityHint={collapsed ? '아래로 끌면 달 전체를 펼쳐요' : '위아래로 밀면 달이 바뀌어요'}
          style={[{ overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.borderDivider }, frame]}
        >
          <Animated.View style={[{ height: fullH }, slide]}>
            {months.map((m) => (
              <View key={m.mkey} style={{ position: 'absolute', left: 0, right: 0, top: m.top }}>
                <MonthWeeks ds={m.ds} mkey={m.mkey} live={m.live} rowH={rowH} today={props.today} sel={m.live ? props.cursor : ''} collapsed={collapsed} onlyWeek={m.live && collapsed ? selWeek : -1} byDay={byDay} marks={props.marks} onPick={pick} onAdd={add} />
              </View>
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {props.list({ gesture: listGesture, scrollEnabled: collapsed, scrollY })}
    </View>
  )
}

// ── 월(화면 가득한 달 — research 35 [영상 실측]) ──
// 닫힘: 달 격자가 탭 알약 위까지 채우고, 위아래로 끌면 앞뒤 달(목록 보기와 같은 세로 띠).
// 날짜 누름: 고른 주가 맨 위로 미끄러져 올라가고, 그 아래가 갈라지며 흰 그날 판이 나타난다. 그 아래 주 줄 하나는 판 밑(탭 알약 위)에 남는다.
// 같은 날을 다시 누르면 판이 먼저 사라지고 격자가 제자리로 내려온다.
// 39 §11: 움직임은 translateY·opacity만(UI 스레드), 높이는 처음 한 번 잰다, 칸은 memo(MonthWeeks · DayCell)
const SPLIT_OPEN = timing(200) // [영상 실측 research 35 §2: 190ms 감속]
const SPLIT_CLOSE = timing(180) // [영상 실측 180ms]
const PANEL_OUT = timing(80)
const PAGE_X = timing(240) // 월 가로 넘김 놓은 뒤 [영상 실측 230~250ms 감속] // 판은 첫 프레임 안에 사라짐 [영상 실측]
/** 판 아래 남는 다음 주 줄 높이(숫자 줄) [영상 실측 약 44pt] */
const PEEK = 42

function MonthFull(props: {
  ws: WeekStart; today: string; cursor: string; items: Item[]; onPick: (d: string) => void; onShift: (n: number) => void; onAdd: (d: string) => void; marks: (d: string, firstOfRow: boolean) => DayMarks
  clear: number; fabBottom: number; panel: (drag: DayDragApi) => ReactNode
  /** 판의 할 일 끌기(research 37): 끄는 중 알림(+ 버튼 숨김) · 끌지 않고 뗌 = 메뉴 · 날짜에 놓음 */
  onDragging: (on: boolean) => void; onLong: (v: { task: TaskRow; rect: Rect }) => void; onDropDay: (t: TaskRow, day: string) => void
}) {
  const p = usePalette()
  const days = useMemo(() => monthDays(props.cursor, props.ws), [props.cursor.slice(0, 7), props.ws]) // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = days.length / 7
  const month = props.cursor.slice(0, 7)
  const [gridH, setGridH] = useState(0)
  const [gridW, setGridW] = useState(0)
  const rowH = gridH ? Math.max(66, Math.floor((gridH - props.clear) / weeks)) : 0
  const fullH = weeks * rowH
  const selW = Math.max(0, Math.floor(days.indexOf(props.cursor) / 7))
  const { onShift } = props

  // 갈라짐: op 0 = 닫힘, 1 = 열림. pv = 판 보임(닫을 때 먼저 사라짐)
  const [open, setOpen] = useState(false)
  const op = useSharedValue(0)
  const pv = useSharedValue(0)
  const openRef = useRef(false)
  openRef.current = open
  const curRef = useRef(props.cursor)
  curRef.current = props.cursor
  const pending = useRef(false)
  const doClose = useCallback(() => {
    if (!openRef.current) return
    hx.tick()
    pv.value = withTiming(0, PANEL_OUT)
    op.value = withTiming(0, SPLIT_CLOSE, (fin) => { if (fin) scheduleOnRN(setOpen, false) })
  }, [op, pv])
  const pickRef = useRef(props.onPick)
  pickRef.current = props.onPick
  const pick = useCallback((d: string) => {
    if (openRef.current && d === curRef.current) return doClose()
    hx.tick()
    pickRef.current(d)
    if (!openRef.current || op.value < 1) {
      openRef.current = true
      pending.current = true
      setOpen(true)
    }
  }, [doClose, op])
  // 고른 날·열림이 그려진 뒤에 움직임을 시작한다 — 새 주(selW) 값이 워클릿에 들어가기 전에 움직이면 중간에 튄다
  useLayoutEffect(() => {
    if (!pending.current) return
    pending.current = false
    pv.value = 1
    op.value = withTiming(1, SPLIT_OPEN)
  }, [open, props.cursor, op, pv])
  const addRef = useRef(props.onAdd)
  addRef.current = props.onAdd
  const add = useCallback((d: string) => addRef.current(d), [])

  // 판의 할 일 끌기(39 §4.11 · research 37): 잡을 때 격자·판·✕ 자리를 창 좌표로 한 번 잰다
  const outerRef = useRef<View>(null)
  const gridRef = useRef<View>(null)
  const panelRef = useRef<View>(null)
  const geoRef = useRef({ rowH, weeks, gridH, clear: props.clear, fabBottom: props.fabBottom })
  geoRef.current = { rowH, weeks, gridH, clear: props.clear, fabBottom: props.fabBottom }
  const daysRef = useRef(days)
  daysRef.current = days
  const measure = useCallback<DayDragMeasure>((done) => {
    outerRef.current?.measureInWindow((ox, oy, ow, oh) => {
      gridRef.current?.measureInWindow((gx, gy, gw) => {
        panelRef.current?.measureInWindow((_px, py, _pw, ph) => {
          const g = geoRef.current
          const r = M.fab / 2
          done({
            gx, gy, cw: gw / 7, rowH: g.rowH, weeks: g.weeks, maxY: gy + g.gridH - g.clear,
            pTop: py, pBottom: py + ph,
            xx: ox + ow - M.fabRight - r, xy: oy + oh - g.fabBottom - r, xr: r + 8,
            ox, oy
          })
        })
      })
    })
  }, [])
  const drag = useDayDrag({
    openK: op,
    measure,
    dayAt: (i) => daysRef.current[i],
    fromDay: props.cursor,
    onMenu: (t, rect) => props.onLong({ task: t as TaskRow, rect }),
    onLeave: doClose,
    onDrop: (t, day) => props.onDropDay(t as TaskRow, day)
  })
  const { onDragging } = props
  useEffect(() => { onDragging(drag.dragging) }, [drag.dragging, onDragging])
  const showPanel = open || drag.holding

  // 앞뒤 달 세로 띠(닫혀 있을 때만)
  const prevC = `${shiftCursor('month', `${month}-01`, -1).slice(0, 7)}-01`
  const nextC = `${shiftCursor('month', `${month}-01`, 1).slice(0, 7)}-01`
  const prevDays = useMemo(() => monthDays(prevC, props.ws), [prevC, props.ws])
  const nextDays = useMemo(() => monthDays(nextC, props.ws), [nextC, props.ws])
  const prevH = (prevDays.length / 7) * rowH
  const pageY = useSharedValue(0)
  const pageX = useSharedValue(0)
  /** 끄는 방향: 0 = 세로(앞뒤 달이 위아래), 1 = 가로(앞뒤 달이 좌우) — 앞뒤 달 칸은 한 벌만 그리고 transform으로 자리를 바꾼다 */
  const axis = useSharedValue(0)
  useLayoutEffect(() => { pageY.value = 0; pageX.value = 0 }, [month, pageY, pageX])
  // 세로·가로 둘 다 [영상 실측 research 35 §1 — 10~13초 세로, 13~20초 가로]. 먼저 12pt 넘는 축으로 잠근다(다른 축은 실패)
  const monthSwipe = Gesture.Pan().enabled(!open && !drag.holding && rowH > 0).activeOffsetY([-12, 12]).failOffsetX([-12, 12])
    .onStart(() => { axis.value = 0 })
    .onUpdate((e) => { pageY.value = e.translationY })
    .onEnd((e) => {
      const thr = fullH * 0.2
      const v = e.velocityY
      if (e.translationY < -thr || v < -500) pageY.value = withSpring(-fullH, { ...SPRING.page, velocity: v }, (fin) => { if (fin) scheduleOnRN(onShift, 1) })
      else if (e.translationY > thr || v > 500) pageY.value = withSpring(prevH, { ...SPRING.page, velocity: v }, (fin) => { if (fin) scheduleOnRN(onShift, -1) })
      else pageY.value = withSpring(0, { ...SPRING.page, velocity: v })
    })
  // 가로: 다음 달이 오른쪽에서 나란히 따라 들어오고, 놓으면 폭 20% 또는 속도 500 넘으면 넘김 [영상 실측 손 뗀 뒤 약 230ms 감속]
  const monthSwipeX = Gesture.Pan().enabled(!open && !drag.holding && rowH > 0 && gridW > 0).activeOffsetX([-12, 12]).failOffsetY([-12, 12])
    .onStart(() => { axis.value = 1 })
    .onUpdate((e) => { pageX.value = e.translationX })
    .onEnd((e) => {
      const thr = gridW * 0.2
      const v = e.velocityX
      // 스프링은 눈에 멈춘 뒤에도 끝 알림이 늦어 머리 달 이름이 0.3초쯤 늦게 바뀐다 → 영상 길이 그대로 감속 시간
      if (e.translationX < -thr || v < -500) pageX.value = withTiming(-gridW, PAGE_X, (fin) => { if (fin) scheduleOnRN(onShift, 1) })
      else if (e.translationX > thr || v > 500) pageX.value = withTiming(gridW, PAGE_X, (fin) => { if (fin) scheduleOnRN(onShift, -1) })
      else pageX.value = withSpring(0, { ...SPRING.page, velocity: v })
    })
  const gridGesture = Gesture.Race(monthSwipe, monthSwipeX)

  const panelTop = rowH + 6
  const panelBottom = gridH - props.clear - PEEK
  const belowTop = (selW + 1) * rowH
  const dBelow = panelBottom + 4 - belowTop
  const lift = selW * rowH
  const prevStyle = useAnimatedStyle(() => (axis.value === 1
    ? { transform: [{ translateX: pageX.value - gridW }, { translateY: 0 }] }
    : { transform: [{ translateX: 0 }, { translateY: pageY.value - prevH }] }))
  const nextStyle = useAnimatedStyle(() => (axis.value === 1
    ? { transform: [{ translateX: pageX.value + gridW }, { translateY: 0 }] }
    : { transform: [{ translateX: 0 }, { translateY: pageY.value + fullH }] }))
  const above = useAnimatedStyle(() => ({ transform: [{ translateX: pageX.value }, { translateY: pageY.value - lift * op.value }] }))
  const below = useAnimatedStyle(() => ({ transform: [{ translateX: pageX.value }, { translateY: pageY.value + dBelow * op.value }] }))
  const panelStyle = useAnimatedStyle(() => ({ opacity: pv.value, transform: [{ translateY: lift * (1 - op.value) }] }))

  const byDay = useMemo(() => itemsByDay(props.items, prevDays[0], nextDays[nextDays.length - 1]), [props.items, prevDays, nextDays])
  const top = useMemo(() => days.slice(0, (selW + 1) * 7), [days, selW])
  const rest = useMemo(() => days.slice((selW + 1) * 7), [days, selW])
  const weeksProps = { rowH, today: props.today, collapsed: open, onlyWeek: -1, byDay, marks: props.marks, onPick: pick, onAdd: add }
  const ghostTask = drag.ghost?.item as TaskRow | undefined
  return (
    <View ref={outerRef} collapsable={false} style={{ flex: 1 }}>
      <View style={s.wd}>
        {weekHeadOf(props.ws).map((w, i) => { const dow = headWeekday(i, props.ws); return <Text key={w} style={[s.wdText, { color: dow === 0 ? p.holiday : dow === 6 ? p.saturday : p.textTertiary }]}>{w}</Text> })}
      </View>
      <GestureDetector gesture={gridGesture}>
        <View
          ref={gridRef}
          collapsable={false}
          style={{ flex: 1, overflow: 'hidden' }}
          onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); const w = Math.round(e.nativeEvent.layout.width); setGridH((x) => (x === h ? x : h)); setGridW((x) => (x === w ? x : w)) }}
          accessibilityHint={open ? '고른 날을 다시 누르면 닫혀요' : '위아래로 밀면 달이 바뀌어요. 날짜를 누르면 그날 일정이 열려요'}
        >
          {rowH ? (
            <>
              {!showPanel ? (
                <>
                  <Animated.View pointerEvents="none" style={[s.abs, prevStyle]}><MonthWeeks ds={prevDays} mkey={prevC.slice(0, 7)} live={false} sel="" {...weeksProps} /></Animated.View>
                  <Animated.View pointerEvents="none" style={[s.abs, nextStyle]}><MonthWeeks ds={nextDays} mkey={nextC.slice(0, 7)} live={false} sel="" {...weeksProps} /></Animated.View>
                </>
              ) : null}
              <Animated.View style={[s.abs, above]}>
                <MonthWeeks ds={top} mkey={month} live sel={props.cursor} hot={drag.hot} tint={open} {...weeksProps} />
              </Animated.View>
              {showPanel ? (
                <View ref={panelRef} collapsable={false} pointerEvents="box-none" style={[s.abs, { top: panelTop, height: Math.max(0, panelBottom - panelTop), overflow: 'hidden' }]}>
                  <Animated.View style={[s.panel, { top: 0, bottom: 0, backgroundColor: p.cardBg }, panelStyle]}>{props.panel(drag.api)}</Animated.View>
                </View>
              ) : null}
              <Animated.View style={[s.abs, { top: belowTop }, open && { backgroundColor: p.pageBg, paddingBottom: gridH }, below]}>
                <MonthWeeks ds={rest} mkey={month} live sel={props.cursor} hot={drag.hot} tint={open} {...weeksProps} />
              </Animated.View>
            </>
          ) : null}
        </View>
      </GestureDetector>
      <DayDragLayer drag={drag.api} ghost={drag.ghost} dragging={drag.dragging} onX={drag.onX} fabBottom={props.fabBottom}>
        {ghostTask ? <TaskRowView task={ghostTask} today={props.today} showList /> : null}
      </DayDragLayer>
    </View>
  )
}

/** 월 보기 그날 판(research 35 §3): 흰 카드 안에 행(묶음 머리 없음), 비면 그림 + `이 날에는 일정이 없어요` · `편하게 해요`.
 *  안을 끌면 내용만 고무줄(영상 — 판은 닫히지 않음). 닫기는 같은 날 다시 누름 */
function DayPanel(props: { day: string; today: string; items: Item[]; onCheck: (t: TaskRow) => void; onOpen: (t: TaskRow) => void; onLong: (v: { task: TaskRow; rect: Rect }) => void; drag: DayDragApi }) {
  const p = usePalette()
  const refs = useRef(new Map<string, View | null>())
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingVertical: 6, flexGrow: 1 }}
    >
      {props.items.length ? props.items.map((it) => evtOf(it) ? (
        <EventRowView key={it.key} evt={evtOf(it)!} start={it.start} end={it.end} color={it.task.list_color ?? ''} calName={it.task.list_name} onPress={() => props.onOpen(it.task)} onLongPress={(rect) => props.onLong({ task: it.task, rect })} />
      ) : isDeviceItemId(it.task.id) ? (
        <View key={it.key} ref={(r) => { refs.current.set(it.key, r) }} collapsable={false} style={s.prow}>
          <TaskRowView
            task={it.task}
            today={props.today}
            showList
            onCheck={() => props.onCheck(it.task)}
            onPress={() => props.onOpen(it.task)}
            onLongPress={() => refs.current.get(it.key)?.measureInWindow((x, y, width, height) => props.onLong({ task: it.task, rect: { x, y, width, height } }))}
          />
        </View>
      ) : (
        // 할 일: 길게 눌러 그대로 떼면 메뉴, 움직이면 끌어 다른 날로(research 37)
        <View key={it.key} style={s.prow}>
          <DayDragRow id={it.key} item={it.task} drag={props.drag}>
            <TaskRowView task={it.task} today={props.today} showList onCheck={() => props.onCheck(it.task)} onPress={() => props.onOpen(it.task)} />
          </DayDragRow>
        </View>
      )) : (
        <Animated.View entering={dayEmptyIn} style={s.panelEmpty}>
          <SoftIcon name="calendar" size={64} />
          <Text style={[FONT.emptyTitle, { fontSize: 15, color: p.textPrimary, marginTop: 12 }]}>이 날에는 일정이 없어요</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: p.textTertiary, marginTop: 2 }}>편하게 해요</Text>
        </Animated.View>
      )}
    </ScrollView>
  )
}
const dayEmptyIn = popIn(0.96, DUR.base)

/** 빈 날 그림 — 직접 그린 달력(틱틱 그림 아님, CLAUDE.md 자산 규칙) */
function CalendarArt() {
  const p = usePalette()
  const a = p.accent.slice(0, 7)
  return (
    <Svg width={150} height={110} viewBox="0 0 150 110" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Ellipse cx={75} cy={60} rx={56} ry={44} fill={p.bgSelected} />
      <SvgRect x={42} y={30} width={66} height={52} rx={6} fill={p.cardBg} stroke={p.textSecondary} strokeWidth={2} />
      <SvgRect x={42} y={30} width={66} height={13} rx={6} fill={alpha(a, 0.55)} stroke={p.textSecondary} strokeWidth={2} />
      {[52, 64, 76, 88].map((x) => <Path key={x} d={`M${x} 25v10`} stroke={p.textSecondary} strokeWidth={2.5} />)}
      {[50, 62].map((y) => <Path key={y} d={`M46 ${y}h58`} stroke={p.borderDivider} strokeWidth={1.5} />)}
      {[58, 75, 92].map((x) => <Path key={x} d={`M${x} 44v35`} stroke={p.borderDivider} strokeWidth={1.5} />)}
      <Circle cx={83} cy={56} r={6} fill={a} />
      <Path d="M30 30l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill={a} />
      <Path d="M122 70l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill={p.textSecondary} />
      <Circle cx={118} cy={28} r={2} fill={p.textTertiary} />
    </Svg>
  )
}

const NO_ITEMS: Item[] = []
/** 한 달의 주 줄들(39 §11 — memo). sel = 고른 날(살아 있는 달만), onlyWeek = 접혔을 때 보이는 주 */
const MonthWeeks = memo(function MonthWeeks(props: { ds: string[]; mkey: string; live: boolean; rowH: number; today: string; sel: string; hot?: string | null; tint?: boolean; collapsed: boolean; onlyWeek: number; byDay: Map<string, Item[]>; marks: (d: string, firstOfRow: boolean) => DayMarks; onPick: (d: string) => void; onAdd: (d: string) => void }) {
  const p = usePalette()
  const { ds, mkey, live, rowH, collapsed } = props
  return (
    <>
      {Array.from({ length: ds.length / 7 }, (_, w) => {
        const hidden = !live || (props.onlyWeek >= 0 && w !== props.onlyWeek)
        return (
          <View key={`${mkey}-${w}`} pointerEvents={live ? 'auto' : 'none'} style={[s.week, { height: rowH, borderTopColor: p.borderDivider }]} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={hidden}>
            {ds.slice(w * 7, w * 7 + 7).map((d, c) => (
              <DayCell key={d} d={d} first={c === 0} items={props.byDay.get(d) ?? NO_ITEMS} rowH={rowH} isToday={d === props.today} sel={d === props.sel || d === props.hot} tint={!!props.tint && d === props.sel} faded={d.slice(0, 7) !== mkey && !collapsed} marks={props.marks} onPick={props.onPick} onAdd={props.onAdd} />
            ))}
          </View>
        )
      })}
    </>
  )
})
type CellProps = { d: string; first: boolean; items: Item[]; rowH: number; isToday: boolean; sel: boolean; tint: boolean; faded: boolean; marks: (d: string, firstOfRow: boolean) => DayMarks; onPick: (d: string) => void; onAdd: (d: string) => void }
const sameItems = (a: Item[], b: Item[]) => a === b || (a.length === b.length && a.every((x, i) => x.key === b[i].key && x.task === b[i].task && x.start === b[i].start && x.end === b[i].end))
/** 날짜 칸 하나 — 항목이 그대로면(같은 키·같은 할 일 객체) 다시 그리지 않는다 */
const DayCell = memo(function DayCell(props: CellProps) {
  const p = usePalette()
  const { d } = props
  // 06 §16 숫자 아래 한 줄(휴일 이름·주 번호·음력)이 있으면 띠를 하나 덜 보인다
  const mk = props.marks(d, props.first)
  // 큰 칸(월 — research 35)은 높이만큼 띠를 더 보인다(숫자 줄 30 + 띠 17.5 = 높이 16 + 사이 1.5 — 틱틱 다크 사진)
  const big = props.rowH > 80
  const max = (big ? Math.max(3, Math.floor((props.rowH - 30) / 17.5)) : props.rowH > 60 ? 3 : 2) - (mk.side ? 1 : 0)
  const all = props.items
  const shown = all.length <= max ? all : all.slice(0, max - 1)
  const more = all.length - shown.length
  const now = new Date()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${Number(d.slice(8))}일 ${weekdayKo(d)}요일${mk.holiday ? `, ${mk.holiday}` : ''}, 할 일 ${all.length}개`}
      accessibilityState={{ selected: props.sel }}
      onPress={() => props.onPick(d)}
      onLongPress={() => props.onAdd(d)}
      style={[s.cell, props.tint && { backgroundColor: alpha(p.accent.slice(0, 7), 0.14), borderRadius: 8 }]}
    >
      {/* [영상 실측 research 35 §3] 고른 날 = 강조색 채운 원 + 흰 숫자, 오늘(안 고름) = 옅은 원 + 강조색 숫자. 그날 판이 열리면 고른 칸 전체에 옅은 강조색 면 */}
      <View style={[s.num, big && s.numBig, props.sel ? { backgroundColor: p.accent } : props.isToday ? { backgroundColor: p.accentSubtle } : null]}>
        <Text style={{ fontSize: big ? 14 : 12, fontWeight: props.isToday || props.sel ? '700' : '500', color: props.sel ? p.onAccent : props.isToday ? p.accentInk : dayTone(p, d, mk, props.faded) }}>{Number(d.slice(8))}</Text>
      </View>
      <View style={{ marginTop: -1, opacity: props.faded ? 0.55 : 1 }}><SideLabel marks={mk} /></View>
      {shown.map((it) => {
        const k = lookOf(p, it, now)
        return (
          <View key={it.key} style={[big ? s.barBig : s.bar, { backgroundColor: k.fill }]}>
            {k.ev ? <CalendarDays size={big ? 9 : 8} color={k.mark} strokeWidth={2.4} /> : null}
            {/* 틱틱처럼 말줄임 없이 칸 끝에서 자른다 */}
            <Text numberOfLines={1} ellipsizeMode="clip" style={[big ? s.barTextBig : s.barText, { color: k.text }, k.faded && { fontWeight: '500' }]}>{it.task.title}</Text>
          </View>
        )
      })}
      {more ? <View style={[s.moreChip, { backgroundColor: p.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}><Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '600', color: p.textTertiary }}>+{more}</Text></View> : null}
    </Pressable>
  )
}, (a, b) => a.d === b.d && a.first === b.first && a.rowH === b.rowH && a.isToday === b.isToday && a.sel === b.sel && a.tint === b.tint && a.faded === b.faded && a.marks === b.marks && a.onPick === b.onPick && a.onAdd === b.onAdd && sameItems(a.items, b.items))

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
          <GroupCard title={agendaTitle(props.day, props.today)} count={props.items.length} collapsed={false}>
            {props.items.map((it) => evtOf(it) ? (
              <EventRowView key={it.key} evt={evtOf(it)!} start={it.start} end={it.end} color={it.task.list_color ?? ''} calName={it.task.list_name} onPress={() => props.onOpen(it.task)} onLongPress={(rect) => props.onLong({ task: it.task, rect })} />
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
            <Text style={[FONT.sub, { color: p.accentInk, marginTop: 4 }]}>+ 추가</Text>
          </Pressable>
        )}
      </Animated.ScrollView>
    </GestureDetector>
  )
}

// ── 일 · 3일(시간 칸) ──
function Timeline(props: {
  ws: WeekStart; view: MobileCalView; today: string; cursor: string; items: Item[]
  onPick: (d: string) => void; onShift: (n: number) => void; onAddAt: (due: string) => void; onOpen: (t: TaskRow) => void; onCheck: (t: TaskRow) => void
  onDrop: (it: Item, dy: number, dCols: number) => void; onMenu: (t: TaskRow, rect: Rect) => void; bottomPad: number
  marks: (d: string, firstOfRow: boolean) => DayMarks
}) {
  const p = usePalette()
  const win = useWindowDimensions()
  const days = props.view === 'day' ? [props.cursor] : props.view === 'week' ? rangeOf('week', props.cursor, props.ws).days : rangeOf('3day', props.cursor).days
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
  const week = Array.from({ length: 7 }, (_, i) => dayKey(i, new Date(`${weekStart(props.cursor, props.ws)}T00:00`)))
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
                    <Text style={{ fontSize: 12, color: d === props.today ? p.accentInk : dayTone(p, d, mk, false, p.textTertiary), fontWeight: d === props.today ? '700' : '400' }}>{`${weekdayKo(d)} ${Number(d.slice(8))}`}</Text>
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
                  <Pressable key={it.key} accessibilityLabel={`${k.ev ? '일정 ' : ''}${it.task.title}`} onPress={() => props.onOpen(it.task)} onLongPress={(e) => props.onMenu(it.task, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 0, height: 0 })} style={[s.chip, { backgroundColor: k.fill }]}>
                    {colW >= 48 ? <Mark look={k} onCheck={() => props.onCheck(it.task)} /> : null}
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, fontWeight: k.faded ? '500' : '600', color: k.text }}>{it.task.title}</Text>
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
  const box = [s.mark, s.box, { borderColor: k.done ? k.checkFill : k.mark, backgroundColor: k.done ? k.checkFill : 'transparent' }]
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
  const dropped = useSharedValue(0)
  const ref = useRef<View>(null)
  // 39 §4.11: 놓은 자리에 그대로 있다가 DB 값이 들어와 블록 위치가 바뀌면 그때 0으로(원래 자리로 튀지 않음). 1.5초 안에 안 바뀌면 스프링으로 돌아감
  useEffect(() => { tx.value = 0; ty.value = 0; dropped.value = 0 }, [top, b.col, props.colIndex]) // eslint-disable-line react-hooks/exhaustive-deps
  const menu = useCallback(() => ref.current?.measureInWindow((x, y, width, height) => props.onMenu({ x, y, width, height })), [props])
  const end = useCallback((dx: number, dy: number) => {
    props.onDragging(false)
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) menu()
    else {
      hx.tap()
      props.onDrop(dx, dy)
      setTimeout(() => { if (dropped.value) { dropped.value = 0; tx.value = withSpring(0, SPRING.snappy); ty.value = withSpring(0, SPRING.snappy) } }, 1500)
    }
  }, [props, menu, dropped, tx, ty])
  const minX = -props.colIndex * colW
  const maxX = (props.cols - 1 - props.colIndex) * colW
  const q = HOUR_H / 4 // 15분
  const minY = -top
  const maxY = 24 * HOUR_H - q - top
  const { onDragging, onTap } = props
  const pan = Gesture.Pan()
    .enabled(!b.item.virtual && !b.item.locked)
    .activateAfterLongPress(320)
    .onStart(() => { lifted.value = withSpring(1, SPRING.snappy); scheduleOnRN(hx.lift); scheduleOnRN(onDragging, true) })
    .onUpdate((e) => {
      // 날 열·15분 칸에 붙는다(손가락을 그대로 따라가지 않음) — 칸을 넘을 때마다 틱
      const nx = Math.round(Math.max(minX, Math.min(maxX, e.translationX)) / colW) * colW
      const ny = Math.max(minY, Math.min(maxY, Math.round(e.translationY / q) * q))
      if (nx !== tx.value || ny !== ty.value) scheduleOnRN(hx.tick)
      tx.value = nx
      ty.value = ny
    })
    .onEnd(() => { if (Math.abs(tx.value) >= 6 || Math.abs(ty.value) >= 6) dropped.value = 1; scheduleOnRN(end, tx.value, ty.value) })
    .onFinalize(() => {
      lifted.value = withTiming(0, { duration: DUR.base })
      if (!dropped.value) { tx.value = withSpring(0, SPRING.snappy); ty.value = withSpring(0, SPRING.snappy) }
    })
  const k = lookOf(p, b.item, props.now)
  const markShown = w >= 48
  // 블록 왼쪽 체크박스 자리를 누르면 완료(상세는 열지 않는다), 나머지는 상세 — 체크박스를 Pressable로 두면 블록 탭과 둘 다 불린다
  const tapAt = useCallback((x: number) => { if (markShown && !k.ev && x < 26) props.onCheck(); else onTap() }, [markShown, k.ev, props, onTap])
  const tap = Gesture.Tap().onEnd((e) => { scheduleOnRN(tapAt, e.x) })
  const g = Gesture.Exclusive(pan, tap)
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: 1 + 0.03 * lifted.value }], zIndex: lifted.value > 0.01 || dropped.value ? 10 : 1, opacity: 1 - 0.1 * lifted.value, shadowOpacity: 0.25 * lifted.value }))
  const ghost = useAnimatedStyle(() => ({ opacity: lifted.value > 0.01 ? 0.4 * lifted.value : 0 }))
  const box = { top, height: h, left: b.col * w + 1, width: w - 3, backgroundColor: k.fill, borderLeftColor: k.edge }
  const body = (
    <>
      {markShown ? <Mark look={k} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={h > 36 ? 2 : 1} style={{ fontSize: 12, lineHeight: 15, fontWeight: k.faded ? '500' : '600', color: k.text }}>{t.title}</Text>
        {h > 40 ? <Text numberOfLines={1} style={{ fontSize: 10, color: k.sub }}>{blockTime(b.item.start, b.item.end)}</Text> : null}
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

// ── 날짜 없는 할 일(06 §9 휴대폰판) ──
function UndatedSheet(props: { open: boolean; day: string; today: string; onClose: () => void; onOpen: (t: TaskRow) => void }) {
  const p = usePalette()
  const toast = useToast()
  const rows = useLiveQuery<TaskRow>(
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
          ) : <EmptyState icon="calendar" title="날짜 없는 할 일이 없어요" />}
        </ScrollView>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  year: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 8, alignContent: 'flex-start' },
  ym: { width: '33.33%', paddingHorizontal: 7, paddingVertical: 8 },
  yc: { alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  band: { position: 'absolute', left: 0, top: 0 },
  head: { height: M.navH, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  headTitle: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  wd: { flexDirection: 'row', height: 26, alignItems: 'center' },
  wdText: { flex: 1, textAlign: 'center', fontSize: 12 },
  week: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cell: { flex: 1, paddingTop: 3, paddingHorizontal: 1.5, gap: 1.5, overflow: 'hidden' },
  num: { alignSelf: 'center', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  numBig: { width: 26, height: 26, borderRadius: 13, marginBottom: 2 },
  panel: { position: 'absolute', left: M.cardInset - 4, right: M.cardInset - 4, borderRadius: M.radiusCard + 2, overflow: 'hidden' },
  prow: { paddingHorizontal: 4 },
  abs: { position: 'absolute', left: 0, right: 0, top: 0 },
  panelEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  bar: { borderRadius: 4, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' },
  barBig: { height: 16, borderRadius: 4, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' },
  barText: { flex: 1, fontSize: 10, lineHeight: 13 },
  barTextBig: { flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  moreChip: { alignSelf: "flex-start", borderRadius: 4, paddingHorizontal: 4 },
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

