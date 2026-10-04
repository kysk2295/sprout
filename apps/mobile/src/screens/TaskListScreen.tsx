// 할 일 탭 목록(21): 오늘(기본) 또는 서랍에서 고른 목록. 회색 바닥 위 묶음 카드, 둥근 ☰ · ⋯, 큰 제목, 떠 있는 +.
// 체크 → 바로 완료 묶음 + "작업이 완료되었습니다." 토스트(되돌리기) + 성장 탭 +1. 스와이프·길게 누름·미루기·당겨서 새로 고침.
// 2026-10-05 전체 기능: 전체·계획 취소·태그·필터 보기, ⋯ = 리스트/태그/필터 편집 · 섹션 추가 · 묶기 › · 정렬 › · 자세히 보기 · 완료 보기,
// 섹션 머리 길게 눌러 이름 바꾸기·순서·삭제, 휴지통은 복원 · 영구 삭제(확인) · 휴지통 비우기, 머리 🔍 = 검색.
import { useQuery, useStatus } from '@powersync/react-native'
import { useRouter, useScrollToTop } from 'expo-router'
import { Calendar, Check, Ellipsis, FolderInput, Menu, Pin, Plus, RotateCcw, Search, Trash2, Undo2 } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import { AssistantButton } from '../assistant/AssistantSheet'
import { syncNow } from '../data/auth'
import { useFolders, useLists, useSections } from '../data/lists'
import {
  completeTasks, deleteForever, moveDates, reopenTasks, restoreTasks, setPinned, setPriority, trashTasks, type Undo
} from '../data/tasks'
import {
  addSection, deleteSection, moveSection, renameSection, saveViewSettings, useFilters, useTagsFull, useViewSettings
} from '../data/organization'
import {
  buildGroups, doneSql, GROUP_LABEL, groupOptions, isArchive, isListView, openSql, showsListName, SORT_LABEL, sortOptions, viewTitle, type Node, type TaskRow
} from '../data/views'
import { dayKey, longDay, nextMonday } from '../lib/dates'
import { useTasksView } from '../state/tasksView'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { EmptyState } from '../ui/EmptyState'
import { GlassButton } from '../ui/Glass'
import { GroupCard } from '../ui/GroupCard'
import { BigTitle, NavRow } from '../ui/Header'
import { LongPressMenu, type LongPressAction } from '../ui/LongPressMenu'
import { PopMenu, useAnchor, type Rect } from '../ui/Menu'
import { closeOpenRow, SwipeRow, type SwipeAction } from '../ui/SwipeRow'
import { useToast } from '../ui/Toast'
import { Fab } from '../ui/Fab'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { TaskRowView } from '../ui/TaskRow'
import { DrawerEdge } from '../ui/Drawer'
import { afterMenu } from '../ui/Drawer'
import { FilterEditSheet, ListEditSheet, TagEditSheet, TextPrompt } from '../ui/OrgSheets'

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
  const status = useStatus()
  const lists = useLists()
  const folders = useFolders()
  const listId = view.startsWith('list:') ? view.slice(5) : view === 'smart:inbox' ? lists.find((l) => l.kind === 'inbox')?.id ?? null : null
  const sections = useSections(listId)
  const listView = listId ? `list:${listId}` : view

  const openQ = useMemo(() => openSql(listView, today), [listView, today])
  const doneQ = useMemo(() => doneSql(listView, today), [listView, today])
  const open = useQuery<TaskRow>(openQ.sql, openQ.params)
  const done = useQuery<TaskRow>(doneQ.sql, doneQ.params)
  const tags = useTagsFull()
  const filters = useFilters()
  const settings = useViewSettings(view)
  const groupLists = useMemo(() => (view.startsWith('folder:') ? lists.filter((l) => l.folder_id === view.slice(7)) : lists), [view, lists])
  const groups = useMemo(
    () => buildGroups(listView, open.data, v.showCompleted ? done.data.filter((t) => t.id) : [], { today, sections, lists: groupLists, tags, settings }),
    [listView, open.data, done.data, today, sections, groupLists, tags, settings, v.showCompleted]
  )
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

  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }) }, [view])
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await syncNow() } finally { setRefreshing(false) }
  }, [])

  const withUndo = (message: string, undo: Undo | null, duration?: number) => toast.show(message, { undo: undo ?? undefined, duration })
  const complete = async (t: TaskRow) => {
    closeOpenRow()
    if (t.status !== 0) {
      await reopenTasks([t.id])
      return
    }
    const undo = await completeTasks([t.id])
    setFlash(t.id)
    if (undo) withUndo('작업이 완료되었습니다.', undo)
  }
  const trash = async (ids: string[]) => withUndo('휴지통으로 옮겼어요', await trashTasks(ids), 5000)
  /** 영구 삭제는 되돌릴 수 없어 확인을 받는다(02 §13.4) */
  const confirmForever = (ids: string[], all = false) =>
    Alert.alert(all ? '휴지통을 비울까요?' : '영구 삭제할까요?', all ? `${ids.length}개의 할 일이 모든 기기에서 영구히 지워져요. 되돌릴 수 없어요.` : '이 할 일이 모든 기기에서 영구히 지워져요. 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: all ? '비우기' : '영구 삭제', style: 'destructive', onPress: () => void deleteForever(ids).then(() => toast.show(all ? '휴지통을 비웠어요' : '영구 삭제했어요')) }
    ])
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
    else if (a === 'delete') await trash(ids)
    else if (a.startsWith('p')) await setPriority(ids, Number(a.slice(1)))
  }

  // 만료됨 "미루기"(21 §4.1)
  const postpone = useAnchor()
  const overdueIds = groups.find((g) => g.id === 'overdue')?.rows.map((r) => r.task.id) ?? []
  const postponeTo = async (date: string, label: string) => withUndo(`${label}로 미뤘어요`, await moveDates(overdueIds, date))
  // 머리 ⋯
  const more = useAnchor()
  const offline = !status.connected && !!status.lastSyncedAt
  const syncError = status.dataFlowStatus?.uploadError ?? status.dataFlowStatus?.downloadError
  const firstLoad = !status.hasSynced && open.isLoading

  const swipeFor = (t: TaskRow): { left: SwipeAction[]; right: SwipeAction[]; full?: () => void; fullLabel?: string } => {
    const icon = (I: typeof Check) => <I size={22} color="#fff" />
    if (t.deleted_at) {
      return {
        left: [],
        right: [
          { key: 'restore', color: p.swipeDone, icon: icon(RotateCcw), label: '복원', onPress: () => void restoreTasks([t.id]).then(() => toast.show('복원했어요')) },
          { key: 'forever', color: p.swipeDel, icon: icon(Trash2), label: '영구 삭제', onPress: () => confirmForever([t.id]) }
        ]
      }
    }
    if (t.status !== 0) {
      return { left: [{ key: 'reopen', color: p.swipeMove, icon: icon(Undo2), label: '완료 취소', onPress: () => void reopenTasks([t.id]) }], right: [], full: () => void reopenTasks([t.id]), fullLabel: '놓으면 완료 취소' }
    }
    return {
      left: [
        { key: 'done', color: p.swipeDone, icon: icon(Check), label: '완료', onPress: () => void complete(t) },
        { key: 'pin', color: p.swipePin, icon: icon(Pin), label: t.pinned_at ? '고정 해제' : '고정', onPress: () => void setPinned([t.id], !t.pinned_at) }
      ],
      right: [
        { key: 'move', color: p.swipeMove, icon: icon(FolderInput), label: '이동', onPress: () => openSheet('/move', [t.id]) },
        { key: 'del', color: p.swipeDel, icon: icon(Trash2), label: '삭제', onPress: () => void trash([t.id]) },
        { key: 'date', color: p.swipeDate, icon: icon(Calendar), label: '날짜', onPress: () => openSheet('/date', [t.id]) }
      ],
      full: () => void complete(t)
    }
  }

  const rowRefs = useRef(new Map<string, View | null>())
  const renderNode = (n: Node, depth = 0): React.ReactNode => {
    const t = n.task
    const sw = swipeFor(t)
    const expanded = v.isExpanded(t.id)
    return (
      <View key={t.id}>
        <SwipeRow left={sw.left} right={sw.right} onFullSwipe={sw.full} fullLabel={sw.fullLabel}>
          <View ref={(r) => { rowRefs.current.set(t.id, r) }} collapsable={false}>
            <TaskRowView
              task={t}
              today={today}
              depth={depth}
              showList={showsListName(view) && !archive}
              showDetails={v.showDetails}
              hideTodayLabel={isToday}
              childCount={n.children.length}
              expanded={expanded}
              flash={flash === t.id}
              pressed={lp?.task.id === t.id}
              onToggleExpand={() => v.toggleExpand(t.id)}
              onCheck={t.deleted_at ? undefined : () => void complete(t)}
              onPress={() => openDetail(t)}
              onLongPress={() => rowRefs.current.get(t.id)?.measureInWindow((x, y, width, height) => (t.deleted_at ? setTrashMenu({ task: t, rect: { x, y, width, height } }) : setLp({ task: t, rect: { x, y, width, height } })))}
            />
          </View>
        </SwipeRow>
        {expanded ? n.children.map((c) => renderNode(c, depth + 1)) : null}
      </View>
    )
  }

  const openSub = (kind: 'group' | 'sort') => { const r = more.rect; if (r) afterMenu(() => setSub({ kind, rect: r })) }
  const moreItems = view === 'smart:trash'
    ? [{ key: 'empty', label: '휴지통 비우기', danger: true, disabled: !open.data.length, onPress: () => afterMenu(() => confirmForever(open.data.map((t) => t.id), true)) }]
    : archive ? [{ key: 'none', label: '보관함은 정렬을 바꿀 수 없어요', disabled: true, onPress: () => {} }]
    : [
      ...(listId ? [{ key: 'edit', label: '리스트 편집', onPress: () => afterMenu(() => setEditing('list')) }] : []),
      ...(view.startsWith('tag:') ? [{ key: 'edit', label: '태그 편집', onPress: () => afterMenu(() => setEditing('tag')) }] : []),
      ...(view.startsWith('filter:') ? [{ key: 'edit', label: '필터 편집', onPress: () => afterMenu(() => setEditing('filter')) }] : []),
      ...(listId && settings.group_by === 'custom' ? [{ key: 'section', label: '섹션 추가', onPress: () => afterMenu(() => setPrompt({ kind: 'add' })) }] : []),
      { key: 'group', label: `묶기 · ${GROUP_LABEL[settings.group_by]}`, onPress: () => openSub('group') },
      { key: 'sort', label: `정렬 · ${SORT_LABEL[settings.sort_by]}`, onPress: () => openSub('sort') },
      { key: 'details', label: '자세히 보기', checked: v.showDetails, onPress: () => v.setShowDetails(!v.showDetails) },
      { key: 'completed', label: v.showCompleted ? '완료한 할 일 숨기기' : '완료한 할 일 보기', onPress: () => v.setShowCompleted(!v.showCompleted) }
    ]
  const openCount = open.data.length
  const doneCount = done.data.filter((t) => t.id).length
  const bottomPad = space.padFab

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow
        left={<GlassButton label="리스트 서랍" onPress={() => v.setDrawerOpen(true)}><Menu size={22} color={p.textPrimary} /></GlassButton>}
        right={
          <>
            {/* 27 D3 · M-A1 ①: 할 일 머리 ✦(강조색) → AI 비서 반 시트. 🔍 · ⋯ 왼쪽 */}
            <AssistantButton />
            <GlassButton label="검색" onPress={() => router.push('/search')}><Search size={20} color={p.textPrimary} /></GlassButton>
            <View ref={more.ref} collapsable={false}>
              <GlassButton label="더보기" badge={offline || !!syncError} onPress={more.open}><Ellipsis size={22} color={p.textPrimary} /></GlassButton>
            </View>
          </>
        }
      />
      <BigTitle title={title} emoji={emoji} sub={isToday ? longDay(today) : undefined} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomPad }}
        onScrollBeginDrag={closeOpenRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.textTertiary} />}
      >
        {firstLoad ? <Skeleton /> : null}
        {!firstLoad && openCount === 0 && !archive ? (
          isToday && doneCount > 0 ? <EmptyState title="모두 완료했어요" sub={`오늘 ${doneCount}개를 끝냈어요. 푹 쉬어요`} />
            : isToday ? <EmptyState title="오늘 할 일이 없어요" sub="+를 눌러 추가하세요" />
            : <EmptyState title="할 일이 없어요" sub="+를 눌러 추가하세요" />
        ) : null}
        {!firstLoad && archive && openCount === 0 ? <EmptyState title={view === 'smart:trash' ? '휴지통이 비어 있어요' : view === 'smart:wontdo' ? '계획 취소한 할 일이 없어요' : '완료한 할 일이 없어요'} /> : null}
        <View style={openCount === 0 && doneCount > 0 ? { marginTop: 28 } : undefined}>
          {groups.map((g) => {
            const byDefault = g.done && (isListView(view) || openCount === 0)
            const collapsed = v.isCollapsed(g.id, !!byDefault)
            return (
              <GroupCard
                key={g.id}
                title={g.title}
                count={g.count}
                collapsed={g.title ? collapsed : false}
                onToggle={() => v.toggleGroup(g.id, !!byDefault)}
                onPostpone={g.postpone ? postpone.open : undefined}
                onLongPress={g.sectionId ? (e: GestureResponderEvent) => setSecMenu({ id: g.sectionId!, name: g.title, rect: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 0, height: 0 } }) : undefined}
              >
                {g.rows.map((n) => renderNode(n))}
              </GroupCard>
            )
          })}
        </View>
      </ScrollView>
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
          { key: 'pick', label: '날짜 지정', onPress: () => openSheet('/date', overdueIds) }
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

function Skeleton() {
  const p = usePalette()
  return (
    <View style={[s.skel, { backgroundColor: p.cardBg }]}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={s.skelRow}>
          <View style={[s.skelBox, { backgroundColor: p.bgSelected }]} />
          <View style={[s.skelBar, { backgroundColor: p.bgSelected, width: `${70 - i * 7}%` }]} />
        </View>
      ))}
      <Text style={[s.skelText, { color: p.textTertiary }]}>처음 데이터를 내려받는 중…</Text>
    </View>
  )
}

const s = StyleSheet.create({
  status: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  skel: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, paddingVertical: 8 },
  skelRow: { height: M.rowH, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  skelBox: { width: 18, height: 18, borderRadius: 4 },
  skelBar: { height: 12, borderRadius: 6 },
  skelText: { fontSize: 12, textAlign: 'center', paddingVertical: 8 }
})
