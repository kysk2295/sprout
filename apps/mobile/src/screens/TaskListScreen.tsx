// 할 일 탭 목록(21): 오늘(기본) 또는 서랍에서 고른 목록. 회색 바닥 위 묶음 카드, 둥근 ☰ · ⋯, 큰 제목, 떠 있는 +.
// 체크 → 바로 완료 묶음 + "작업이 완료되었습니다." 토스트(되돌리기) + 성장 탭 +1. 스와이프·길게 누름·미루기·당겨서 새로 고침.
// 2026-10-05 전체 기능: 전체·계획 취소·태그·필터 보기, ⋯ = 리스트/태그/필터 편집 · 섹션 추가 · 묶기 › · 정렬 › · 자세히 보기 · 완료 보기,
// 섹션 머리 길게 눌러 이름 바꾸기·순서·삭제, 휴지통은 복원 · 영구 삭제(확인) · 휴지통 비우기, 머리 🔍 = 검색.
import { useRouter, useScrollToTop } from 'expo-router'
import { Calendar, Check, Ellipsis, FolderInput, Menu, Pin, Plus, RotateCcw, Search, Trash2, Undo2 } from 'lucide-react-native'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { AssistantButton } from '../assistant/AssistantSheet'
import { syncNow } from '../data/auth'
import { useFolders, useLists, useSections } from '../data/lists'
import {
  completeTasks, deleteForever, moveDates, reopenTasks, reorderTasks, restoreTasks, setPinned, setPriority, trashTasks, type Undo
} from '../data/tasks'
import {
  addSection, deleteSection, moveSection, renameSection, saveViewSettings, useFilters, useTagsFull, useViewSettings
} from '../data/organization'
import {
  buildGroups, doneSql, GROUP_LABEL, groupOptions, isArchive, isListView, openSql, showsListName, SORT_LABEL, sortOptions, viewTitle, type Node, type TaskRow
} from '../data/views'
import { dayKey, longDay, nextMonday } from '../lib/dates'
import { isGroupCollapsed, toggleGroup, useGroupCollapsed, useTasksView } from '../state/tasksView'
import { useCompleting } from '../state/useCompleting'
import { hx } from '../ui/haptics'
import { playComplete } from '../ui/sound'
import { DragGhost, DragRow, useDragReorder, type DragApi, type DropAt } from '../ui/DragReorder'
import { rowExit, useListMotion } from '../ui/listMotion'
import { useReducedMotion } from '../ui/motion'
import { M, type Palette } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { CompanionEmpty, EmptyState } from '../ui/EmptyState'
import { OfflineBand } from '../ui/OfflineBand'
import { GlassButton, GlassGroup } from '../ui/Glass'
import { GroupCard } from '../ui/GroupCard'
import type { ListMotion } from '../ui/listMotion'
import { BigTitle, NavRow, useCollapsingTitle } from '../ui/Header'
import { LongPressMenu, type LongPressAction } from '../ui/LongPressMenu'
import { PopMenu, useAnchor, type Rect } from '../ui/Menu'
import { closeOpenRow, SwipeRow, type SwipeAction } from '../ui/SwipeRow'
import { useToast } from '../ui/Toast'
import { Fab } from '../ui/Fab'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { TaskRowView } from '../ui/TaskRow'
import { useEvents, useMyCalColor } from '../data/calEvents'
import { eventItems, eventListRange, eventsByGroup, mergeEventGroups } from '../data/eventsModel'
import { useEventMenu } from '../ui/EventMenu'
import { EventRowView } from '../ui/EventRow'
import { DrawerEdge } from '../ui/Drawer'
import { afterMenu } from '../ui/Drawer'
import { FilterEditSheet, ListEditSheet, TagEditSheet, TextPrompt } from '../ui/OrgSheets'
import { tagFilterIds } from '@sprout/schema/wikiGraph'
import { useRows, useSyncFlags } from '../data/rows'
import { PageCard } from '../wiki/PageCard'
import { takeTagFilter } from '../wiki/WikiIndex'

/** 오늘 날짜(자정이 지나면 바뀐다) */
function useToday() {
  const [today, setToday] = useState(dayKey())
  useEffect(() => {
    const t = setInterval(() => { const d = dayKey(); setToday((x) => (x === d ? x : d)) }, 30_000)
    return () => clearInterval(t)
  }, [])
  return today
}

export default function TaskListScreen() {
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const toast = useToast()
  const today = useToday()
  const v = useTasksView()
  const { view } = v
  const sync = useSyncFlags() // 39 §11: useStatus()는 쓰기마다 4~5번 다시 그린다
  const lists = useLists()
  const folders = useFolders()
  const listId = view.startsWith('list:') ? view.slice(5) : view === 'smart:inbox' ? lists.find((l) => l.kind === 'inbox')?.id ?? null : null
  const sections = useSections(listId)
  const listView = listId ? `list:${listId}` : view

  const openQ = useMemo(() => openSql(listView, today), [listView, today])
  const doneQ = useMemo(() => doneSql(listView, today), [listView, today])
  // 39 §11: 바뀐 행만 새 객체(나머지 행은 memo로 건너뜀)
  const openAll = useRows<TaskRow>(openQ.sql, openQ.params)
  const doneAll = useRows<TaskRow>(doneQ.sql, doneQ.params)
  // 33 §11 리스트 페이지 카드의 태그 알약 = 이 리스트 안 거르기(여럿 = 그중 하나라도, 하위는 부모 아래로). 보기를 바꾸면 해제
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [descOpen, setDescOpen] = useState(false)
  useEffect(() => { setTagFilter(takeTagFilter(view)) }, [view])
  const open = useMemo(() => {
    if (!tagFilter.length) return openAll
    const keep = tagFilterIds(openAll.data, tagFilter)
    return { ...openAll, data: openAll.data.filter((t) => keep.has(t.id)) }
  }, [openAll, tagFilter])
  const done = useMemo(() => (tagFilter.length ? { ...doneAll, data: doneAll.data.filter((t) => (t.tag_ids?.split(',') ?? []).some((x) => tagFilter.includes(x))) } : doneAll), [doneAll, tagFilter])
  const tags = useTagsFull()
  const filters = useFilters()
  const settings = useViewSettings(view)
  const groupLists = useMemo(() => (view.startsWith('folder:') ? lists.filter((l) => l.folder_id === view.slice(7)) : lists), [view, lists])
  const groups = useMemo(
    () => buildGroups(listView, open.data, v.showCompleted ? done.data.filter((t) => t.id) : [], { today, sections, lists: groupLists, tags, settings }),
    [listView, open.data, done.data, today, sections, groupLists, tags, settings, v.showCompleted]
  )
  // 20 §7.1 · 06 §14.3.1: 오늘·내일·다음 7일에는 sprout 일정도 — 날짜 묶음 맨 위(없는 날짜는 묶음을 새로), 날짜 묶기가 아니면 맨 아래 "일정"
  const evRange = eventListRange(view, today)
  const evRows = useEvents(evRange?.from ?? today, evRange?.to ?? today, !!evRange)
  const myCalColor = useMyCalColor()
  const evByGroup = useMemo(
    () => (evRange ? eventsByGroup(eventItems(evRows, evRange.from, evRange.to, myCalColor), today, settings.group_by === 'time') : new Map<string, ReturnType<typeof eventItems>>()),
    [evRows, evRange?.from, evRange?.to, myCalColor, today, settings.group_by] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shownGroups = useMemo(() => mergeEventGroups(groups, evByGroup, settings.group_by === 'time'), [groups, evByGroup, settings.group_by])
  const evMenu = useEventMenu()
  // 접힌 묶음도 센다 — 접고 펼 때 수가 30 넘게 바뀌어 카드 전환이 꺼지던 것(39 §11.5)
  const rowCount = shownGroups.reduce((n, g) => n + g.rows.length, 0)
  const motion = useListMotion(listView, rowCount)
  const { title, emoji } = viewTitle(view, lists, folders, { tags, filters })
  const isToday = view === 'smart:today'
  const archive = isArchive(view)

  // 체크 직후 잠깐 빛남(21 §3)
  const [flash, setFlash] = useState<string | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 900)
    return () => clearTimeout(t)
  }, [flash])

  const scrollRef = useRef<Animated.ScrollView>(null)
  const collapse = useCollapsingTitle()
  useScrollToTop(scrollRef)
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }) }, [view])
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await syncNow() } finally { setRefreshing(false) }
  }, [])

  const withUndo = (message: string, undo: Undo | null, duration?: number) => toast.show(message, { undo: undo ?? undefined, duration })
  // 39 §4.1: 체크 → 0.35초 완료 모양으로 머문 뒤 쓰기(그 사이 다시 누르면 취소). 쓰면 행이 옅어지며 빠지고 아래 행이 미끄러진다
  const justDone = useRef(0)
  const completeNow = async (id: string) => {
    justDone.current = Date.now()
    const undo = await completeTasks([id])
    if (undo) withUndo('작업이 완료되었습니다.', undo)
  }
  const completing = useCompleting(completeNow)
  const complete = async (t: TaskRow) => {
    closeOpenRow()
    if (t.status !== 0) {
      await reopenTasks([t.id])
      return
    }
    completing.toggle(t.id)
  }
  const trash = async (ids: string[]) => withUndo('휴지통으로 옮겼어요', await trashTasks(ids), 5000)
  // 손가락이 끝낸 마지막 할 일로 목록이 비면 "성공" 흔들림 한 번(39 §4.1-5)
  const prevOpen = useRef(0)
  /** 영구 삭제는 되돌릴 수 없어 확인을 받는다(02 §13.4) */
  const confirmForever = (ids: string[], all = false) => {
    hx.warn()
    Alert.alert(all ? '휴지통을 비울까요?' : '영구 삭제할까요?', all ? `${ids.length}개의 할 일이 모든 기기에서 영구히 지워져요. 되돌릴 수 없어요.` : '이 할 일이 모든 기기에서 영구히 지워져요. 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: all ? '비우기' : '영구 삭제', style: 'destructive', onPress: () => void deleteForever(ids).then(() => toast.show(all ? '휴지통을 비웠어요' : '영구 삭제했어요')) }
    ])
  }
  const openDetail = (t: TaskRow) => { closeOpenRow(); router.push(`/task/${t.id}`) }
  const openSheet = (path: '/move' | '/date' | '/tags', ids: string[]) => router.push({ pathname: path, params: { ids: ids.join(',') } })

  // 길게 누름(휴지통 행은 복원 · 영구 삭제)
  const [lp, setLp] = useState<{ task: TaskRow; rect: Rect } | null>(null)
  const [trashMenu, setTrashMenu] = useState<{ task: TaskRow; rect: Rect } | null>(null)
  // ⋯ 아래 단계(묶기 › · 정렬 ›), 편집 시트, 섹션
  const [sub, setSub] = useState<{ kind: 'group' | 'sort'; rect: Rect } | null>(null)
  const [editing, setEditing] = useState<'list' | 'tag' | 'filter' | null>(null)
  const [prompt, setPrompt] = useState<{ kind: 'add' } | { kind: 'rename'; id: string; name: string } | null>(null)
  const [secMenu, setSecMenu] = useState<{ id: string; name: string; rect: Rect } | null>(null)
  const onLongPressAction = async (a: LongPressAction) => {
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
    else if (a === 'delete') await trash(ids)
    else if (a.startsWith('p')) await setPriority(ids, Number(a.slice(1)))
  }

  // 만료됨 "미루기"(21 §4.1)
  const postpone = useAnchor()
  const overdueIds = groups.find((g) => g.id === 'overdue')?.rows.map((r) => r.task.id) ?? []
  const postponeTo = async (date: string, label: string) => withUndo(`${label}로 미뤘어요`, await moveDates(overdueIds, date))
  // 머리 ⋯
  const more = useAnchor()
  const { offline, syncError } = sync
  const firstLoad = !sync.hasSynced && open.isLoading

  const rowRefs = useRef(new Map<string, View | null>())
  // 39 §4.3 · 결정 ③: 길게 눌러 끌어 순서 바꾸기(같은 묶음 · 리스트의 다른 섹션). 그대로 떼면 지금처럼 메뉴
  const groupOfTask = useRef(new Map<string, string>())
  const openMenuFor = (id: string) => {
    const t = open.data.find((x) => x.id === id) ?? done.data.find((x) => x.id === id)
    if (!t) return
    rowRefs.current.get(id)?.measureInWindow((x, y, width, height) => (t.deleted_at ? setTrashMenu({ task: t, rect: { x, y, width, height } }) : setLp({ task: t, rect: { x, y, width, height } })))
  }
  const onDrop = async (d: DropAt) => {
    const g = shownGroups.find((x) => x.id === d.group)
    if (!g) return
    const ids = g.rows.map((n) => n.task.id).filter((x) => x !== d.id)
    let at = d.before ? ids.indexOf(d.before) : d.after ? ids.indexOf(d.after) + 1 : ids.length
    if (at < 0) at = ids.length
    ids.splice(at, 0, d.id)
    const cross = groupOfTask.current.get(d.id) !== d.group
    const undo = await reorderTasks(ids, { id: d.id, sectionId: cross ? (d.group === 's:none' ? null : d.group.slice(2)) : undefined })
    if (settings.sort_by !== 'custom') await saveViewSettings(view, { sort_by: 'custom' })
    if (cross) withUndo('옮겼어요', undo)
  }
  // 접힌 묶음의 행은 남아 있지만(GroupCard) 끌어 놓을 자리에서는 뺀다
  const foldDefault = useRef(new Map<string, boolean>())
  const drag = useDragReorder({ hidden: (gid) => isGroupCollapsed(view, gid, foldDefault.current.get(gid)), canCross: (a, b) => a.startsWith('s:') && b.startsWith('s:'), onDrop: (d) => void onDrop(d), onMenu: openMenuFor })
  const canDrag = !archive
  // 39 §11: 행이 쓰는 손잡이는 ref 하나로(행 memo가 화면이 다시 그려질 때마다 깨지지 않게), 행 설정은 바뀔 때만 새 객체
  const acts = useRef<RowActs>(null!)
  acts.current = {
    complete: (t) => void complete(t),
    completeNow: (id) => void completeNow(id),
    openDetail,
    openMenuFor,
    openSheet,
    trash: (ids) => void trash(ids),
    confirmForever,
    restore: (id) => void restoreTasks([id]).then(() => toast.show('복원했어요')),
    reopen: (id) => void reopenTasks([id]),
    pin: (t) => void setPinned([t.id], !t.pinned_at),
    toggleExpand: v.toggleExpand,
    setRowRef: (id, r) => { rowRefs.current.set(id, r) }
  }
  const hideTag = view.startsWith('tag:') ? view.slice(4) : undefined
  const cfg = useMemo<RowCfg>(() => ({ today, showList: showsListName(view) && !archive, showDetails: v.showDetails, hideTodayLabel: isToday, hideTag, canDrag, drag: drag.api, p }), [today, view, archive, v.showDetails, isToday, hideTag, canDrag, drag.api, p])
  const lpId = lp?.task.id
  const renderNode = (n: Node, depth = 0, groupId = ''): React.ReactNode => {
    const t = n.task
    const expanded = v.isExpanded(t.id)
    return (
      <Animated.View key={t.id} entering={motion.entering} exiting={motion.exiting} layout={motion.layout}>
        <TaskItem
          task={t}
          depth={depth}
          groupId={groupId}
          childCount={n.children.length}
          expanded={expanded}
          pending={completing.pending.has(t.id)}
          pressed={lpId === t.id}
          flash={flash === t.id}
          cfg={cfg}
          act={acts}
        />
        {expanded ? n.children.map((c) => renderNode(c, depth + 1)) : null}
      </Animated.View>
    )
  }
  const ghostRow = useRef<(id: string) => React.ReactNode>(() => null)
  ghostRow.current = (id) => { const t = open.data.find((x) => x.id === id); return t ? <TaskRowView task={t} today={today} showList={showsListName(view) && !archive} hideTodayLabel={isToday} /> : null }
  const renderGhost = useCallback((id: string) => ghostRow.current(id), [])

  const openSub = (kind: 'group' | 'sort') => { const r = more.rect; if (r) afterMenu(() => setSub({ kind, rect: r })) }
  const moreItems = view === 'smart:trash'
    ? [{ key: 'empty', label: '휴지통 비우기', danger: true, disabled: !open.data.length, onPress: () => afterMenu(() => confirmForever(open.data.map((t) => t.id), true)) }]
    : archive ? [{ key: 'none', label: '보관함은 정렬을 바꿀 수 없어요', disabled: true, onPress: () => {} }]
    : [
      ...(listId ? [{ key: 'edit', label: '리스트 편집', onPress: () => afterMenu(() => setEditing('list')) }] : []),
      ...(view.startsWith('tag:') ? [{ key: 'edit', label: '태그 편집', onPress: () => afterMenu(() => setEditing('tag')) }] : []),
      ...(view.startsWith('filter:') ? [{ key: 'edit', label: '필터 편집', onPress: () => afterMenu(() => setEditing('filter')) }] : []),
      // 33 §11: 머리 카드가 없을 때도 설명을 쓸 수 있게(기본함 제외)
      ...((listId && lists.find((l) => l.id === listId)?.kind !== 'inbox') || view.startsWith('tag:') ? [{ key: 'desc', label: '설명 쓰기', onPress: () => afterMenu(() => setDescOpen(true)) }] : []),
      // 29 §9.4 정리 입구: 기본함 ⋯ › 기본함 정리
      ...(listId && lists.find((l) => l.id === listId)?.kind === 'inbox' ? [{ key: 'tidy', label: '기본함 정리', onPress: () => afterMenu(() => router.push({ pathname: '/tidy', params: { tab: 'inbox' } })) }] : []),
      ...(listId && settings.group_by === 'custom' ? [{ key: 'section', label: '섹션 추가', onPress: () => afterMenu(() => setPrompt({ kind: 'add' })) }] : []),
      { key: 'group', label: `묶기 · ${GROUP_LABEL[settings.group_by]}`, onPress: () => openSub('group') },
      { key: 'sort', label: `정렬 · ${SORT_LABEL[settings.sort_by]}`, onPress: () => openSub('sort') },
      { key: 'details', label: '자세히 보기', checked: v.showDetails, onPress: () => v.setShowDetails(!v.showDetails) },
      { key: 'completed', label: v.showCompleted ? '완료한 할 일 숨기기' : '완료한 할 일 보기', onPress: () => v.setShowCompleted(!v.showCompleted) }
    ]
  const openCount = open.data.length
  const doneCount = done.data.filter((t) => t.id).length
  useEffect(() => {
    if (openCount === 0 && prevOpen.current > 0 && Date.now() - justDone.current < 2000) hx.success()
    prevOpen.current = openCount
  }, [openCount])
  const bottomPad = space.padFab

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow
        left={<GlassButton label="리스트 서랍" onPress={() => v.setDrawerOpen(true)}><Menu size={22} color={p.textPrimary} /></GlassButton>}
        smallTitle={title}
        smallStyle={collapse.small}
        right={
          // 39 §4.14 [영상 실측]: 오른쪽 버튼은 한 유리 알약. 27 D3 · M-A1 ①: ✦(강조색) → AI 비서 반 시트, 🔍 · ⋯
          <GlassGroup>
            <AssistantButton plain />
            <GlassButton plain label="검색" onPress={() => router.push('/search')}><Search size={20} color={p.textPrimary} /></GlassButton>
            <View ref={more.ref} collapsable={false}>
              <GlassButton plain label="더보기" badge={offline || !!syncError} onPress={more.open}><Ellipsis size={22} color={p.textPrimary} /></GlassButton>
            </View>
          </GlassGroup>
        }
      />
      <BigTitle title={title} emoji={emoji} sub={isToday ? longDay(today) : undefined} style={collapse.big} />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={collapse.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomPad }}
        onScrollBeginDrag={closeOpenRow}
        scrollEnabled={!drag.dragging}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.textTertiary} />}
      >
        {firstLoad ? <Skeleton /> : null}
        {!archive ? <OfflineBand offline={offline} /> : null}
        {!archive ? <PageCard view={listView} lists={lists} filter={tagFilter} onFilter={setTagFilter} descOpen={descOpen} onDescClose={() => setDescOpen(false)} /> : null}
        {!firstLoad && openCount === 0 && !archive && !evByGroup.size ? (
          isToday && doneCount > 0 ? <CompanionEmpty animate={!!motion.entering} kind="done" todayDone={doneCount} />
            : isToday ? <CompanionEmpty animate={!!motion.entering} kind="today" todayDone={0} />
            : <EmptyState animate={!!motion.entering} icon={view === 'smart:inbox' ? 'inbox' : view === 'smart:tomorrow' ? 'tomorrow' : view === 'smart:next7' ? 'week' : view === 'smart:all' ? 'all' : 'list'} title="할 일이 없어요" sub="+를 눌러 추가하세요" />
        ) : null}
        {!firstLoad && archive && openCount === 0 ? <EmptyState icon={view === 'smart:trash' ? 'trash' : view === 'smart:wontdo' ? 'cancel' : 'done'} title={view === 'smart:trash' ? '휴지통이 비어 있어요' : view === 'smart:wontdo' ? '계획 취소한 할 일이 없어요' : '완료한 할 일이 없어요'} /> : null}
        <View style={openCount === 0 && doneCount > 0 ? { marginTop: 28 } : undefined}>
          {shownGroups.map((g) => {
            const byDefault = !!(g.done && (isListView(view) || openCount === 0))
            foldDefault.current.set(g.id, byDefault)
            return (
              <TaskGroup
                key={g.id}
                view={view}
                gid={g.id}
                byDefault={byDefault}
                motion={motion}
                title={g.title}
                count={g.count}
                onPostpone={g.postpone ? postpone.open : undefined}
                onLongPress={g.sectionId ? (e: GestureResponderEvent) => setSecMenu({ id: g.sectionId!, name: g.title, rect: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 0, height: 0 } }) : undefined}
              >
                {evByGroup.get(g.id)?.map((it) => (
                  <EventRowView key={it.key} evt={it.evt} start={it.start} end={it.end} color={it.color} onPress={() => evMenu.act.open(it.evt.id)} onLongPress={(rect) => evMenu.openMenu(it.evt.id, rect)} />
                ))}
                {g.rows.map((n) => { groupOfTask.current.set(n.task.id, g.id); return renderNode(n, 0, g.id) })}
              </TaskGroup>
            )
          })}
        </View>
      </Animated.ScrollView>
      <DragGhost state={drag.state} id={drag.ghost} render={renderGhost} />
      <DrawerEdge />
      {!archive ? <Fab onPress={() => router.push({ pathname: '/quick-add', params: { view: listView } })} /> : null}

      <View ref={postpone.ref} collapsable={false} style={{ position: 'absolute', right: 12, top: 0, width: 1, height: 1 }} />
      <PopMenu
        anchor={postpone.rect}
        onClose={postpone.close}
        width={200}
        items={[
          { key: 'today', label: '오늘로', onPress: () => void postponeTo(today, '오늘') },
          { key: 'tomorrow', label: '내일로', onPress: () => void postponeTo(dayKey(1), '내일') },
          { key: 'week', label: '다음 주로', onPress: () => void postponeTo(nextMonday(today), '다음 주') },
          { key: 'pick', label: '날짜 지정', onPress: () => openSheet('/date', overdueIds) },
          { key: 'tidy', label: '정리 화면에서 보기', onPress: () => router.push({ pathname: '/tidy', params: { tab: 'overdue' } }) }
        ]}
      />
      <PopMenu
        anchor={more.rect}
        onClose={more.close}
        header={offline || syncError ? (
          <Text style={[s.status, { color: p.danger, borderBottomColor: p.borderDivider }]}>{syncError ? '동기화에 실패했어요 — 다시 시도하는 중' : '오프라인 — 연결되면 자동으로 올라가요'}</Text>
        ) : undefined}
        items={moreItems}
      />
      <PopMenu
        anchor={sub?.rect ?? null}
        onClose={() => setSub(null)}
        width={200}
        items={sub?.kind === 'group'
          ? groupOptions(view).map((g) => ({ key: g, label: GROUP_LABEL[g], checked: settings.group_by === g, onPress: () => void saveViewSettings(view, { group_by: g }) }))
          : sortOptions(view).map((o) => ({ key: o, label: SORT_LABEL[o], checked: settings.sort_by === o, onPress: () => void saveViewSettings(view, { sort_by: o }) }))}
      />
      <PopMenu
        anchor={trashMenu?.rect ?? null}
        onClose={() => setTrashMenu(null)}
        width={200}
        align="left"
        items={trashMenu ? [
          { key: 'restore', label: '복원', onPress: () => void restoreTasks([trashMenu.task.id]).then(() => toast.show('복원했어요')) },
          { key: 'forever', label: '영구 삭제', danger: true, onPress: () => afterMenu(() => confirmForever([trashMenu.task.id])) }
        ] : []}
      />
      <PopMenu
        anchor={secMenu?.rect ?? null}
        onClose={() => setSecMenu(null)}
        width={200}
        align="left"
        items={secMenu ? [
          { key: 'rename', label: '이름 바꾸기', onPress: () => afterMenu(() => setPrompt({ kind: 'rename', id: secMenu.id, name: secMenu.name })) },
          { key: 'up', label: '위로', onPress: () => void moveSection(sections, secMenu.id, -1) },
          { key: 'down', label: '아래로', onPress: () => void moveSection(sections, secMenu.id, 1) },
          { key: 'delete', label: '삭제', danger: true, onPress: () => afterMenu(() => Alert.alert(`"${secMenu.name}" 섹션을 삭제할까요?`, '안의 할 일은 지우지 않고 미분류로 옮겨요.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void deleteSection(secMenu.id) }])) }
        ] : []}
      />
      <TextPrompt
        open={!!prompt}
        title={prompt?.kind === 'rename' ? '섹션 이름 바꾸기' : '섹션 추가'}
        initial={prompt?.kind === 'rename' ? prompt.name : ''}
        placeholder="섹션 이름"
        confirm={prompt?.kind === 'rename' ? '저장' : '추가'}
        onClose={() => setPrompt(null)}
        onSubmit={async (name) => { if (prompt?.kind === 'rename') await renameSection(prompt.id, name); else if (listId) await addSection(listId, name) }}
      />
      <ListEditSheet open={editing === 'list'} id={listId} onClose={() => setEditing(null)} />
      <TagEditSheet open={editing === 'tag'} id={view.startsWith('tag:') ? view.slice(4) : null} onClose={() => setEditing(null)} />
      <FilterEditSheet open={editing === 'filter'} id={view.startsWith('filter:') ? view.slice(7) : null} onClose={() => setEditing(null)} />
      {evMenu.element}
      <LongPressMenu
        rect={lp?.rect ?? null}
        pinned={!!lp?.task.pinned_at}
        priority={lp?.task.priority ?? 0}
        onClose={() => setLp(null)}
        onAction={(a) => void onLongPressAction(a)}
        row={lp ? <TaskRowView task={lp.task} today={today} showList={showsListName(view)} hideTodayLabel={isToday} /> : null}
      />
    </View>
  )
}

/** 행 하나(39 §11 성능 규칙): memo + 바뀌지 않는 손잡이(act ref)라서, 한 행을 체크해도 그 행만 다시 그린다 */
type RowActs = {
  complete: (t: TaskRow) => void
  completeNow: (id: string) => void
  openDetail: (t: TaskRow) => void
  openMenuFor: (id: string) => void
  openSheet: (path: '/move' | '/date' | '/tags', ids: string[]) => void
  trash: (ids: string[]) => void
  confirmForever: (ids: string[]) => void
  restore: (id: string) => void
  reopen: (id: string) => void
  pin: (t: TaskRow) => void
  toggleExpand: (id: string) => void
  setRowRef: (id: string, r: View | null) => void
}
type RowCfg = { today: string; showList: boolean; showDetails: boolean; hideTodayLabel: boolean; hideTag?: string; canDrag: boolean; drag: DragApi; p: Palette }
const TaskItem = memo(function TaskItem(props: { task: TaskRow; depth: number; groupId: string; childCount: number; expanded: boolean; pending: boolean; pressed: boolean; flash: boolean; cfg: RowCfg; act: { current: RowActs } }) {
  const { task: t, cfg, act } = props
  const p = cfg.p
  const sw = useMemo((): { left: SwipeAction[]; right: SwipeAction[]; full?: () => void; fullLabel?: string } => {
    const icon = (I: typeof Check) => <I size={22} color="#fff" />
    if (t.deleted_at) {
      return {
        left: [],
        right: [
          { key: 'restore', color: p.swipeDone, icon: icon(RotateCcw), label: '복원', onPress: () => act.current.restore(t.id) },
          { key: 'forever', color: p.swipeDel, icon: icon(Trash2), label: '영구 삭제', onPress: () => act.current.confirmForever([t.id]) }
        ]
      }
    }
    if (t.status !== 0) {
      return { left: [{ key: 'reopen', color: p.swipeMove, icon: icon(Undo2), label: '완료 취소', onPress: () => act.current.reopen(t.id) }], right: [], full: () => act.current.reopen(t.id), fullLabel: '놓으면 완료 취소' }
    }
    return {
      left: [
        { key: 'done', color: p.swipeDone, icon: icon(Check), label: '완료', onPress: () => act.current.complete(t) },
        { key: 'pin', color: p.swipePin, icon: icon(Pin), label: t.pinned_at ? '고정 해제' : '고정', onPress: () => act.current.pin(t) }
      ],
      right: [
        { key: 'move', color: p.swipeMove, icon: icon(FolderInput), label: '이동', onPress: () => act.current.openSheet('/move', [t.id]) },
        { key: 'del', color: p.swipeDel, icon: icon(Trash2), label: '삭제', leaves: true, onPress: () => act.current.trash([t.id]) },
        { key: 'date', color: p.swipeDate, icon: icon(Calendar), label: '날짜', onPress: () => act.current.openSheet('/date', [t.id]) }
      ],
      // 끝까지 밀기는 행이 이미 밖으로 나갔으니 머무르지 않고 바로 쓴다
      full: () => { closeOpenRow(); playComplete(); act.current.completeNow(t.id) }
    }
  }, [t, p, act])
  const draggable = cfg.canDrag && props.depth === 0 && !!props.groupId && t.status === 0
  const ref = useCallback((r: View | null) => act.current.setRowRef(t.id, r), [act, t.id])
  const onCheck = useCallback(() => act.current.complete(t), [act, t])
  const onPress = useCallback(() => act.current.openDetail(t), [act, t])
  const onLongPress = useCallback(() => act.current.openMenuFor(t.id), [act, t.id])
  const onToggleExpand = useCallback(() => act.current.toggleExpand(t.id), [act, t.id])
  return (
    <DragRow id={t.id} group={props.groupId} drag={cfg.drag} enabled={draggable}>
      <SwipeRow left={sw.left} right={sw.right} onFullSwipe={sw.full} fullLabel={sw.fullLabel}>
        <View ref={ref} collapsable={false}>
          <TaskRowView
            task={t}
            today={cfg.today}
            depth={props.depth}
            showList={cfg.showList}
            showDetails={cfg.showDetails}
            hideTodayLabel={cfg.hideTodayLabel}
            childCount={props.childCount}
            expanded={props.expanded}
            flash={props.flash}
            pending={props.pending}
            pressed={props.pressed}
            hideTag={cfg.hideTag}
            onToggleExpand={onToggleExpand}
            onCheck={t.deleted_at ? undefined : onCheck}
            onPress={onPress}
            onLongPress={draggable ? undefined : onLongPress}
          />
        </View>
      </SwipeRow>
    </DragRow>
  )
})

/** 묶음 카드 + 접힘 구독 — 접고 펼 때 이 카드만 다시 그린다(목록 화면 전체는 그대로, 39 §11.5) */
function TaskGroup(props: { view: string; gid: string; byDefault: boolean; title: string; count: number; motion: ListMotion; onPostpone?: () => void; onLongPress?: (e: GestureResponderEvent) => void; children?: React.ReactNode }) {
  const { view, gid, byDefault, ...rest } = props
  const folded = useGroupCollapsed(view, gid, byDefault)
  const onToggle = useCallback(() => toggleGroup(view, gid, byDefault), [view, gid, byDefault])
  return <GroupCard {...rest} collapsed={props.title ? folded : false} onToggle={onToggle} />
}

function Skeleton() {
  const p = usePalette()
  // 39 §4.8: 막대가 1.2초마다 옅어졌다 진해짐(동작 줄이기면 멈춤), 내용이 오면 옅게 빠짐
  const reduce = useReducedMotion()
  const o = useSharedValue(1)
  useEffect(() => { o.value = reduce ? 1 : withRepeat(withTiming(0.5, { duration: 600 }), -1, true) }, [reduce, o])
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Animated.View exiting={motionExit} style={[s.skel, { backgroundColor: p.cardBg }, pulse]}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={s.skelRow}>
          <View style={[s.skelBox, { backgroundColor: p.bgSelected }]} />
          <View style={[s.skelBar, { backgroundColor: p.bgSelected, width: `${70 - i * 7}%` }]} />
        </View>
      ))}
      <Text style={[s.skelText, { color: p.textTertiary }]}>처음 데이터를 내려받는 중…</Text>
    </Animated.View>
  )
}
const motionExit = rowExit

const s = StyleSheet.create({
  status: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  skel: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, paddingVertical: 8 },
  skelRow: { height: M.rowH, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  skelBox: { width: 18, height: 18, borderRadius: 4 },
  skelBar: { height: 12, borderRadius: 6 },
  skelText: { fontSize: 12, textAlign: 'center', paddingVertical: 8 }
})
