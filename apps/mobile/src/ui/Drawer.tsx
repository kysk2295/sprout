// 리스트 서랍(20 §2, 21 §2, 시안 C-1): 왼쪽에서 화면 87%를 덮는 판 [영상 실측 research 34]. 뒤 탭 화면은 판과 같이 오른쪽으로 밀리며 어두워지고 흐려진다(39 §4.7).
// 열림 정도 = 공유 값 drawerP(0~1) 하나 — ☰ 누름은 250ms 감속, 목록 왼쪽 끝을 끌면 손가락을 따라감, 놓으면 속도·위치로.
// 계정 줄(아바타·이름·⚙) → 스마트 목록(전체·오늘·내일·다음 7일·기본함 — 설정의 표시/숨김/비어 있지 않으면) → 구분선
// → 리스트·폴더(⌄ 펼침, 고정 먼저) → 필터 ⌄ → 태그 ⌄(하위 태그 들여) → 구분선 → 완료·계획 취소·휴지통 → 아래 "+ 추가"(리스트·폴더·태그·필터)와 관리 아이콘.
// 행을 길게 누르면 메뉴(05: 리스트 편집·상단 고정·보관·삭제 / 폴더 편집·리스트 추가·그룹 해제 / 태그 편집·상단 고정·삭제 / 필터 편집·삭제).
// 고르면 같은 목록 화면에 그 목록. 스마트 목록·보관함 아이콘은 말랑 아이콘(44 §4, 직접 그림), 나머지는 Lucide(오픈 라이선스).
import { useRouter } from 'expo-router'
import {
  ArrowUpToLine, Cast, Funnel, Hash, Pencil, Plus, Settings, SlidersHorizontal, Trash2
} from 'lucide-react-native'
import { EXT_DEVICE_TITLE, EXT_DEVICE_VIEW, useDeviceUpcoming } from '../calendars/upcoming'
import { useEffect, useState, type ReactNode } from 'react'
import { BlurView } from 'expo-blur'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { makeMutable, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { AvatarSheet } from '../avatar/AvatarSheet'
import { ProfileAvatar } from '../avatar/ProfileAvatar'
import { useAuth } from '../data/auth'
import { useAvatar } from '../data/avatar'
import { useDrawerCounts, useFolders } from '../data/lists'
import {
  archiveList, deleteFilter, deleteList, deleteTag, pinList, pinTag, ungroupFolder, useArchiveCounts, useFilters, useListsFull, useOrgCounts, useSmartVisibility, useTagsFull
} from '../data/organization'
import { smartVisible, type ViewKey } from '../data/views'
import { useTasksView } from '../state/tasksView'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { PopMenu, type MenuItem, type Rect } from './Menu'
import { ColorDot, FolderGlyph, ListGlyph, listShow, splitLead } from './OrgIcons'
import { tagShow } from '../data/emojiLead'
import { SwipeRow, type SwipeAction } from './SwipeRow'
import { FilterEditSheet, FolderEditSheet, ListEditSheet, TagEditSheet } from './OrgSheets'
import { useToast } from './Toast'
import { DUR, EASE, SPRING, useReducedMotion } from './motion'
import { FoldBody, FoldChevron, groupLayout } from './Fold'
import { SoftIcon } from './SoftIcon'

/** 서랍 열림 정도(0 닫힘 ~ 1 열림)와 판 폭 — 탭 화면 밀기((tabs)/_layout)·왼쪽 끝 끌기(DrawerEdge)가 같이 쓴다 */
export const drawerP = makeMutable(0)
export const drawerW = makeMutable(320)

/** 메뉴(투명 Modal)가 닫히는 중에는 iOS가 다른 Modal·Alert를 못 띄운다 → 닫힌 뒤에 */
export const afterMenu = (f: () => void) => { setTimeout(f, 380) }

type Edit = { kind: 'list' | 'folder' | 'tag' | 'filter'; id: string | null; folderId?: string | null } | null

export function Drawer() {
  const { drawerOpen, setDrawerOpen, view, setView } = useTasksView()
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const win = useWindowDimensions()
  const width = Math.min(win.width * 0.87, 380)
  useEffect(() => { drawerW.value = width }, [width])
  const reduce = useReducedMotion()
  const router = useRouter()
  const toast = useToast()
  const { user } = useAuth()
  const lists = useListsFull()
  const folders = useFolders()
  const tags = useTagsFull()
  const filters = useFilters()
  const counts = useDrawerCounts()
  const org = useOrgCounts()
  const arch = useArchiveCounts()
  const vis = useSmartVisibility()
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({ filters: true, tags: true, subs: true })
  const [menu, setMenu] = useState<{ rect: Rect; items: MenuItem[] } | null>(null)
  const [edit, setEdit] = useState<Edit>(null)
  const [avatarOpen, setAvatarOpen] = useState(false) // 35 §4: 계정 줄 아바타 → 고르기 시트
  const avatar = useAvatar().resolved

  useEffect(() => {
    drawerP.value = withTiming(drawerOpen ? 1 : 0, { duration: reduce ? DUR.base : drawerOpen ? DUR.drawerIn : DUR.drawerOut, easing: EASE.out })
  }, [drawerOpen, reduce])

  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: (drawerP.value - 1) * width }] }), [width])
  const scrim = useAnimatedStyle(() => ({ opacity: drawerP.value }))
  const blur = useAnimatedStyle(() => ({ opacity: drawerP.value * 0.9 }))
  const drag = Gesture.Pan()
    // 행 왼쪽 밀기(둥근 칸, 12)가 먼저 잡히게 판 끌어 닫기는 30부터
    .activeOffsetX([-30, 30])
    .onUpdate((e) => { drawerP.value = Math.max(0, Math.min(1, 1 + e.translationX / width)) })
    .onEnd((e) => {
      if (e.translationX < -width * 0.3 || e.velocityX < -500) scheduleOnRN(setDrawerOpen, false)
      else drawerP.value = withSpring(1, { ...SPRING.drawer, velocity: e.velocityX / width })
    })

  const sheets = (
    <>
      <ListEditSheet open={edit?.kind === 'list'} id={edit?.kind === 'list' ? edit.id : null} folderId={edit?.folderId} onClose={() => setEdit(null)} onSaved={(id) => { if (!edit?.id) { setView(`list:${id}`); setDrawerOpen(false) } }} />
      <FolderEditSheet open={edit?.kind === 'folder'} id={edit?.kind === 'folder' ? edit.id : null} onClose={() => setEdit(null)} />
      <TagEditSheet open={edit?.kind === 'tag'} id={edit?.kind === 'tag' ? edit.id : null} onClose={() => setEdit(null)} />
      <FilterEditSheet open={edit?.kind === 'filter'} id={edit?.kind === 'filter' ? edit.id : null} onClose={() => setEdit(null)} onSaved={(id) => { if (!edit?.id) { setView(`filter:${id}`); setDrawerOpen(false) } }} />
      <PopMenu anchor={menu?.rect ?? null} onClose={() => setMenu(null)} items={menu?.items ?? []} width={200} align="left" />
      <AvatarSheet visible={avatarOpen} onClose={() => setAvatarOpen(false)} letter={(user?.email.slice(0, 1) ?? '?').toUpperCase()} />
    </>
  )
  const pick = (v: ViewKey) => { setView(v); setDrawerOpen(false) }
  const inbox = lists.find((l) => l.kind === 'inbox')
  const normal = lists.filter((l) => l.kind !== 'inbox')
  const loose = normal.filter((l) => !l.folder_id || !folders.some((f) => f.id === l.folder_id))
  const name = user?.email.split('@')[0] ?? ''
  const at = (e: GestureResponderEvent): Rect => ({ x: e.nativeEvent.pageX - 20, y: e.nativeEvent.pageY, width: 0, height: 0 })
  const confirm = (title: string, msg: string, label: string, run: () => Promise<void>) =>
    Alert.alert(title, msg, [{ text: '취소', style: 'cancel' }, { text: label, style: 'destructive', onPress: () => void run().catch((e) => toast.show(e instanceof Error ? e.message : '하지 못했어요')) }])
  const leaveIf = (v: ViewKey) => { if (view === v) setView('smart:today') }

  const listMenu = (l: (typeof lists)[number], e: GestureResponderEvent) => {
    if (l.kind === 'inbox') return
    setMenu({
      rect: at(e),
      items: [
        { key: 'edit', label: '편집', onPress: () => afterMenu(() => setEdit({ kind: 'list', id: l.id })) },
        { key: 'pin', label: l.pinned ? '고정 해제' : '상단 고정', onPress: () => void pinList(l.id, !l.pinned) },
        { key: 'archive', label: '보관', onPress: () => void archiveList(l.id, true).then(() => { leaveIf(`list:${l.id}`); toast.show(`"${l.name}"을(를) 보관했어요`) }) },
        { key: 'delete', label: '삭제', danger: true, onPress: () => afterMenu(() => confirm(`"${l.name}" 리스트를 삭제할까요?`, '안의 할 일은 휴지통으로 옮겨져요. 휴지통에서 복원하면 이 리스트로 돌아와요.', '삭제', async () => { await deleteList(l.id); leaveIf(`list:${l.id}`) })) }
      ]
    })
  }
  const folderMenu = (f: (typeof folders)[number], e: GestureResponderEvent) => setMenu({
    rect: at(e),
    items: [
      { key: 'add', label: '리스트 추가', onPress: () => afterMenu(() => setEdit({ kind: 'list', id: null, folderId: f.id })) },
      { key: 'edit', label: '편집', onPress: () => afterMenu(() => setEdit({ kind: 'folder', id: f.id })) },
      { key: 'ungroup', label: '그룹 해제', danger: true, onPress: () => afterMenu(() => confirm(`"${f.name}" 폴더를 풀까요?`, '안의 리스트는 그대로 남고 폴더만 없어져요.', '그룹 해제', async () => { await ungroupFolder(f.id); leaveIf(`folder:${f.id}`) })) }
    ]
  })
  const tagMenu = (t: (typeof tags)[number], e: GestureResponderEvent) => setMenu({
    rect: at(e),
    items: [
      { key: 'edit', label: '편집', onPress: () => afterMenu(() => setEdit({ kind: 'tag', id: t.id })) },
      { key: 'pin', label: t.pinned ? '고정 해제' : '상단 고정', onPress: () => void pinTag(t.id, !t.pinned) },
      { key: 'delete', label: '삭제', danger: true, onPress: () => afterMenu(() => confirm(`"#${t.name}" 태그를 삭제할까요?`, '할 일은 그대로 두고 태그만 떼어요.', '삭제', async () => { await deleteTag(t.id); leaveIf(`tag:${t.id}`) })) }
    ]
  })
  const filterMenu = (f: (typeof filters)[number], e: GestureResponderEvent) => setMenu({
    rect: at(e),
    items: [
      { key: 'edit', label: '편집', onPress: () => afterMenu(() => setEdit({ kind: 'filter', id: f.id })) },
      { key: 'delete', label: '삭제', danger: true, onPress: () => afterMenu(() => confirm(`"${f.name}" 필터를 삭제할까요?`, '할 일은 지워지지 않아요.', '삭제', async () => { await deleteFilter(f.id); leaveIf(`filter:${f.id}`) })) }
    ]
  })
  const addMenu = (e: GestureResponderEvent) => setMenu({
    rect: { ...at(e), y: e.nativeEvent.pageY - 4 * 44 - 20 },
    items: [
      { key: 'list', label: '리스트', onPress: () => afterMenu(() => setEdit({ kind: 'list', id: null })) },
      { key: 'folder', label: '폴더', onPress: () => afterMenu(() => setEdit({ kind: 'folder', id: null })) },
      { key: 'tag', label: '태그', onPress: () => afterMenu(() => setEdit({ kind: 'tag', id: null })) },
      { key: 'filter', label: '필터', onPress: () => afterMenu(() => setEdit({ kind: 'filter', id: null })) }
    ]
  })

  // 39 G19 [영상 실측 research 34 §3.5]: 리스트·태그·필터 행 왼쪽 밀기 = 둥근 칸(상단 고정 노랑 · 편집 주황 · 삭제 빨강)
  const circ = (I: typeof Pencil) => <I size={18} color="#fff" />
  const swipeList = (l: (typeof lists)[number]): SwipeAction[] => [
    { key: 'pin', color: p.swipePin, icon: circ(ArrowUpToLine), label: l.pinned ? '고정 해제' : '상단 고정', onPress: () => void pinList(l.id, !l.pinned) },
    { key: 'edit', color: p.swipeDate, icon: circ(Pencil), label: '편집', onPress: () => setEdit({ kind: 'list', id: l.id }) },
    { key: 'del', color: p.swipeDel, icon: circ(Trash2), label: '삭제', onPress: () => confirm(`"${l.name}" 리스트를 삭제할까요?`, '안의 할 일은 휴지통으로 옮겨져요. 휴지통에서 복원하면 이 리스트로 돌아와요.', '삭제', async () => { await deleteList(l.id); leaveIf(`list:${l.id}`) }) }
  ]
  const swipeTag = (t: (typeof tags)[number]): SwipeAction[] => [
    { key: 'pin', color: p.swipePin, icon: circ(ArrowUpToLine), label: t.pinned ? '고정 해제' : '상단 고정', onPress: () => void pinTag(t.id, !t.pinned) },
    { key: 'edit', color: p.swipeDate, icon: circ(Pencil), label: '편집', onPress: () => setEdit({ kind: 'tag', id: t.id }) },
    { key: 'del', color: p.swipeDel, icon: circ(Trash2), label: '삭제', onPress: () => confirm(`"#${t.name}" 태그를 삭제할까요?`, '할 일은 그대로 두고 태그만 떼어요.', '삭제', async () => { await deleteTag(t.id); leaveIf(`tag:${t.id}`) }) }
  ]
  const swipeFilter = (f: (typeof filters)[number]): SwipeAction[] => [
    { key: 'edit', color: p.swipeDate, icon: circ(Pencil), label: '편집', onPress: () => setEdit({ kind: 'filter', id: f.id }) },
    { key: 'del', color: p.swipeDel, icon: circ(Trash2), label: '삭제', onPress: () => confirm(`"${f.name}" 필터를 삭제할까요?`, '할 일은 지워지지 않아요.', '삭제', async () => { await deleteFilter(f.id); leaveIf(`filter:${f.id}`) }) }
  ]
  const Row = (r: { v?: ViewKey; icon: ReactNode; label: string; n?: number; depth?: number; right?: ReactNode; onPress?: () => void; onLongPress?: (e: GestureResponderEvent) => void }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: r.v === view }}
      onPress={r.onPress ?? (() => r.v && pick(r.v))}
      onLongPress={r.onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [s.dr, r.depth ? { paddingLeft: 10 + 34 * r.depth } : null, (r.v === view || pressed) && { backgroundColor: p.drawerSel }]}
    >
      <View style={s.icon}>{r.icon}</View>
      <Text style={[FONT.body, { color: p.textPrimary, flex: 1 }]} numberOfLines={1}>{r.label}</Text>
      {r.n ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{r.n}</Text> : null}
      {r.right}
    </Pressable>
  )
  const Section = (r: { id: string; label: string; onAdd: () => void }) => {
    const open = !!openSec[r.id]
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${r.label} ${open ? '접기' : '펼치기'}`} onPress={() => setOpenSec((x) => ({ ...x, [r.id]: !open }))} style={s.sec}>
        <Text style={[FONT.meta, { color: p.textTertiary, flex: 1, fontWeight: '600' }]}>{r.label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${r.label} 추가`} hitSlop={10} onPress={r.onAdd} style={{ paddingHorizontal: 6 }}><Plus size={15} color={p.textTertiary} /></Pressable>
        <FoldChevron open={open} size={14} color={p.textQuaternary} />
      </Pressable>
    )
  }
  // 30 §A.5: 리스트 = 이모지 또는 ≡ (+ 오른쪽 색 점), 폴더 = 이름 앞 이모지 또는 폴더 그림, 프로젝트 태그 = 🚀
  const listIcon = (l: { name: string; emoji: string | null }) => <ListGlyph list={l} />
  const tagIcon = (t: { name: string; kind?: string | null; color: string | null }, size: number) => {
    const k = tagShow(t).emoji // 이름 앞 이모지(여럿이면 하나) → 종류 아이콘 → 주제는 #
    if (!k) return <Hash size={size} color={t.color ?? p.textSecondary} />
    return <Text style={{ fontSize: size - 3, width: size + 2, textAlign: 'center' }}>{k}</Text>
  }
  const tagName = (t: { name: string; kind?: string | null }) => tagShow(t).name
  const show = (id: string, n?: number) => smartVisible(id, vis, n)
  const devUp = useDeviceUpcoming()
  const topTags = tags.filter((t) => !t.parent_id || !tags.some((x) => x.id === t.parent_id))
  const hr = <View style={[s.hr, { borderTopColor: p.borderDivider }]} />

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {Platform.OS === 'ios' && !reduce ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blur]}>
          <BlurView intensity={18} tint={p.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents={drawerOpen ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerOpen(false)} accessibilityLabel="서랍 닫기" />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View accessibilityElementsHidden={!drawerOpen} importantForAccessibility={drawerOpen ? 'auto' : 'no-hide-descendants'} style={[s.panel, { width, backgroundColor: p.drawerBg, paddingTop: insets.top }, panel]}>
          <View style={s.me}>
            <Pressable accessibilityRole="button" accessibilityLabel="프로필 이미지 바꾸기" hitSlop={6} onPress={() => setAvatarOpen(true)}>
              <ProfileAvatar avatar={avatar} size={30} letter={name.slice(0, 1).toUpperCase() || '?'} />
            </Pressable>
            <Text style={[FONT.bodyStrong, { color: p.textPrimary, flex: 1 }]} numberOfLines={1}>{name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="설정" hitSlop={8} onPress={() => { setDrawerOpen(false); router.navigate('/settings') }} style={s.meBtn}>
              <Settings size={22} color={p.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}>
            {show('all', org.all) ? <Row v="smart:all" icon={<SoftIcon name="all" size={22} />} label="전체" n={org.all} /> : null}
            {show('today', counts.smart.today) ? <Row v="smart:today" icon={<SoftIcon name="today" size={22} day={new Date().getDate()} />} label="오늘" n={counts.smart.today} /> : null}
            {show('tomorrow', counts.smart.tomorrow) ? <Row v="smart:tomorrow" icon={<SoftIcon name="tomorrow" size={22} />} label="내일" n={counts.smart.tomorrow} /> : null}
            {show('next7', counts.smart.next7) ? <Row v="smart:next7" icon={<SoftIcon name="week" size={22} />} label="다음 7일" n={counts.smart.next7} /> : null}
            {inbox ? <Row v="smart:inbox" icon={<SoftIcon name="inbox" size={22} />} label="기본함" n={counts.smart.inbox} onLongPress={(e) => setMenu({ rect: at(e), items: [{ key: 'edit', label: '편집', onPress: () => afterMenu(() => setEdit({ kind: 'list', id: inbox.id })) }] })} /> : null}
            {hr}
            {loose.map((l) => <SwipeRow key={l.id} round right={swipeList(l)}><Row v={`list:${l.id}`} icon={listIcon(l)} label={listShow(l).name} n={counts.lists[l.id]} right={<ColorDot color={l.color} />} onLongPress={(e) => listMenu(l, e)} /></SwipeRow>)}
            {folders.map((f) => {
              const kids = normal.filter((l) => l.folder_id === f.id)
              const open = !!openFolders[f.id]
              return (
                <Animated.View key={f.id} layout={groupLayout} style={s.fold}>
                  <Row
                    v={`folder:${f.id}`}
                    icon={<FolderGlyph name={f.name} />}
                    label={splitLead(f.name).name}
                    n={kids.reduce((n, l) => n + (counts.lists[l.id] ?? 0), 0)}
                    onLongPress={(e) => folderMenu(f, e)}
                    right={
                      <Pressable accessibilityRole="button" accessibilityLabel={open ? '폴더 접기' : '폴더 펼치기'} hitSlop={10} onPress={() => setOpenFolders((s) => ({ ...s, [f.id]: !open }))}>
                        <FoldChevron open={open} size={14} color={p.textQuaternary} />
                      </Pressable>
                    }
                  />
                  <FoldBody open={open}>{kids.map((l) => <SwipeRow key={l.id} round right={swipeList(l)}><Row depth={1} v={`list:${l.id}`} icon={listIcon(l)} label={listShow(l).name} n={counts.lists[l.id]} right={<ColorDot color={l.color} />} onLongPress={(e) => listMenu(l, e)} /></SwipeRow>)}</FoldBody>
                </Animated.View>
              )
            })}
            {show('filters') ? (
              <Animated.View layout={groupLayout} style={s.fold}>
                <Section id="filters" label="필터" onAdd={() => setEdit({ kind: 'filter', id: null })} />
                <FoldBody open={!!openSec.filters}>{filters.length ? filters.map((f) => (
                  <SwipeRow key={f.id} round right={swipeFilter(f)}><Row v={`filter:${f.id}`} icon={f.emoji ? <Text style={{ fontSize: 17 }}>{f.emoji}</Text> : <Funnel size={20} color={p.textSecondary} />} label={f.name} onLongPress={(e) => filterMenu(f, e)} /></SwipeRow>
                )) : <Text style={[s.hint, { color: p.textQuaternary }]}>조건으로 할 일을 모아 보세요</Text>}</FoldBody>
              </Animated.View>
            ) : null}
            {show('tags') ? (
              <Animated.View layout={groupLayout} style={s.fold}>
                <Section id="tags" label="태그" onAdd={() => setEdit({ kind: 'tag', id: null })} />
                <FoldBody open={!!openSec.tags}>{topTags.length ? topTags.map((t) => (
                  <View key={t.id}>
                    <SwipeRow round right={swipeTag(t)}><Row v={`tag:${t.id}`} icon={tagIcon(t, 20)} label={tagName(t)} n={org.tags[t.id]} onLongPress={(e) => tagMenu(t, e)} /></SwipeRow>
                    {tags.filter((c) => c.parent_id === t.id).map((c) => <SwipeRow key={c.id} round right={swipeTag(c)}><Row depth={1} v={`tag:${c.id}`} icon={tagIcon(c, 18)} label={tagName(c)} n={org.tags[c.id]} onLongPress={(e) => tagMenu(c, e)} /></SwipeRow>)}
                  </View>
                )) : <Text style={[s.hint, { color: p.textQuaternary }]}>할 일에 #태그를 붙이면 여기에 보여요</Text>}</FoldBody>
              </Animated.View>
            ) : null}
            {/* 38 §2.6 · 16 §2.4.1: 캘린더 구독 — 늘 보인다. + = 설정 › 캘린더 연동 */}
            <Animated.View layout={groupLayout} style={s.fold}>
              <Section id="subs" label="캘린더 구독" onAdd={() => { setDrawerOpen(false); router.push('/settings/calendars') }} />
              <FoldBody open={!!openSec.subs}>{devUp.active
                ? <Row v={EXT_DEVICE_VIEW} icon={<Cast size={20} color={p.textSecondary} />} label={EXT_DEVICE_TITLE} n={devUp.items.length} />
                : <Text style={[s.hint, { color: p.textQuaternary }]}>휴대폰 캘린더를 연결하면 여기에 보여요</Text>}</FoldBody>
            </Animated.View>
            <Animated.View layout={groupLayout}>
              {hr}
              {show('completed', arch.completed) ? <Row v="smart:completed" icon={<SoftIcon name="done" size={22} />} label="완료" /> : null}
              {show('wontdo', arch.wontdo) ? <Row v="smart:wontdo" icon={<SoftIcon name="cancel" size={22} />} label="계획 취소" /> : null}
              {show('trash', arch.trash) ? <Row v="smart:trash" icon={<SoftIcon name="trash" size={22} />} label="휴지통" /> : null}
            </Animated.View>
          </ScrollView>
          <View style={[s.foot, { paddingBottom: insets.bottom + 8, borderTopColor: p.borderDivider }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="추가" onPress={addMenu} style={s.footBtn}>
              <Plus size={20} color={p.textSecondary} />
              <Text style={[FONT.body, { color: p.textSecondary }]}>추가</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="리스트 관리" hitSlop={8} onPress={() => { setDrawerOpen(false); router.push('/lists/manage') }} style={s.meBtn}>
              <SlidersHorizontal size={20} color={p.textSecondary} />
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
      {sheets}
    </View>
  )
}

/** 목록 화면 왼쪽 가장자리(24)에서 오른쪽으로 끌면 서랍이 손가락을 따라 나온다(39 §4.7) — 행 스와이프와 겹치지 않게 가장자리만.
 * 놓으면 35% 넘음 또는 속도 > 500 → 열림, 아니면 스프링으로 닫힘 */
export function DrawerEdge() {
  const { setDrawerOpen } = useTasksView()
  const g = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY([-14, 14])
    .onUpdate((e) => { drawerP.value = Math.max(0, Math.min(1, e.translationX / drawerW.value)) })
    .onEnd((e) => {
      if (drawerP.value > 0.35 || e.velocityX > 500) scheduleOnRN(setDrawerOpen, true)
      else drawerP.value = withSpring(0, { ...SPRING.drawer, velocity: e.velocityX / drawerW.value })
    })
  return (
    <GestureDetector gesture={g}>
      <View style={s.edge} />
    </GestureDetector>
  )
}

const s = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 8, height: 0 }, elevation: 20 },
  me: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8 },
  meBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dr: { height: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, borderRadius: 10 },
  icon: { width: 22, alignItems: 'center' },
  ldot: { width: 9, height: 9, borderRadius: 5 },
  hr: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: 10 },
  // 접는 덩어리(39 §11.5): 접힌 줄은 남아 있고 덩어리가 가린다
  fold: { overflow: 'hidden' },
  sec: { height: 34, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 10, marginTop: 6 },
  hint: { fontSize: 12, paddingHorizontal: 12, paddingVertical: 6 },
  foot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  footBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 8 },
  edge: { position: 'absolute', left: 0, top: 110, bottom: 110, width: 24 }
})
