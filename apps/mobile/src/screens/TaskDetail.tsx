// 상세 시트(21 §5, 시안 F): 반 시트 → 끌어 올리면 전체 화면(네이티브 formSheet, 높이 0.6 / 1).
// 위: 리스트 이름 ⌃⌄(이동 시트) · 둥근 깃발(우선순위) · 둥근 ⋯ / 체크박스 + 날짜 글자(→ 날짜 시트) / 제목 20/600 / 설명 또는 체크리스트
// / 태그 칩 / 하위 할 일 / 아래 도구 줄(태그 · 체크리스트로 바꾸기) + "저장됨" — 키보드가 올라오면 도구 줄이 키보드 바로 위에 붙는다(21 §5-6, research 24 §7).
// 편집은 0.6초 뒤 자동 저장(02 §13). 제목을 비우고 닫으면 이전 제목으로 되돌린다.
// 편집 범위(20 M3 확정): 제목·설명·날짜·우선순위·리스트·체크리스트 체크·항목 추가·태그. 하위 할 일 만들기·반복 직접 설정은 v1.1.
import { useQuery } from '@powersync/react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { ArrowRightLeft, Ban, Bell, ChevronLeft, ChevronsUpDown, Copy, Ellipsis, Flag, ListChecks, Pin, Plus, Repeat, Tag, Trash2 } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Dimensions, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardEvent } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  addCheckItem, duplicateTask, removeCheckItem, renameCheckItem, setPinned, setPriority, setWontDo, toggleCheckItem, toggleContentMode, toggleDone, trashTasks, updateTask
} from '../data/tasks'
import { COLUMNS, type TaskRow } from '../data/views'
import { dayKey, detailDateLabel } from '../lib/dates'
import { FONT, priorityColor } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { SheetScrollGuard } from '../ui/SheetScrollGuard'
import { Checkbox } from '../ui/Checkbox'
import { GlassButton } from '../ui/Glass'
import { PopMenu, useAnchor } from '../ui/Menu'
import { useToast } from '../ui/Toast'
import { useEventActions } from '../ui/EventMenu'
import { syncTaskLinks } from '../wiki/data'
import { DetailTags } from '../wiki/DetailTags'

type CheckItem = { id: string; title: string; done: number; sort_order: number }

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const p = usePalette()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const evAct = useEventActions()
  const today = dayKey()
  const task = useQuery<TaskRow>(`SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.id = ?`, [id]).data[0]
  const items = useQuery<CheckItem>('SELECT id, title, done, sort_order FROM check_items WHERE task_id = ? ORDER BY sort_order', [id]).data
  const tags = useQuery<{ id: string }>("SELECT DISTINCT tt.tag_id AS id FROM task_tags tt WHERE tt.task_id = ? AND COALESCE(tt.state,'accepted') = 'accepted'", [id]).data
  const subs = useQuery<TaskRow>(`SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.parent_id = ? AND t.deleted_at IS NULL ORDER BY t.status, t.sort_order`, [id]).data
  const [full, setFull] = useState(false)
  const root = useRef<View>(null)
  const kb = useKeyboardOverlap(root, Math.max(insets.bottom, 8) - 8)
  useEffect(() => navigation.addListener('sheetDetentChange' as never, ((e: { data: { index: number } }) => setFull(e.data.index === 1)) as never), [navigation])

  // 제목·설명: 입력 중에는 로컬 값, 0.6초 뒤 저장
  const [title, setTitle] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const pending = useRef<Record<string, unknown>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTitle = useRef('')
  if (task?.title) lastTitle.current = task.title
  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    // 33 §11: 제목·설명의 [[링크]] → 그 할 일 하나만 relations·task_tags(link) 맞춤
    if (Object.keys(patch).length) void updateTask(id, patch).then(() => { setSaved(true); if ('title' in patch || 'content' in patch) void syncTaskLinks(id) })
  }
  const edit = (patch: Record<string, unknown>) => {
    Object.assign(pending.current, patch)
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }
  useEffect(() => () => {
    if (pending.current.title === '') pending.current.title = lastTitle.current
    flush()
  }, [])

  const priority = useAnchor()
  const [more, setMore] = useState(false)
  const [newItem, setNewItem] = useState('')
  if (!task) return <View style={{ flex: 1, backgroundColor: p.sheetBg }} />
  const done = task.status !== 0
  const date = detailDateLabel(task, today)
  const listName = task.list_kind === 'inbox' ? '기본함' : task.list_name ?? '기본함'
  const checklist = task.content_mode === 'checklist'
  const openSheet = (path: '/move' | '/date' | '/tags') => router.push({ pathname: path, params: { ids: id } })

  return (
    <View ref={root} collapsable={false} style={{ flex: 1, backgroundColor: p.sheetBg }}>
      {/* iOS formSheet는 ScrollView를 시트 맨 위에 붙인다 — 머리를 형제로 두면 날짜 줄이 겹쳐서 안에 둔다(README 주의) */}
      <SheetScrollGuard />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 + kb.height }}>
        <View style={[s.top, { marginTop: full ? insets.top : 10 }]}>
          {full ? <GlassButton label="닫기" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`리스트: ${listName}, 이동`} onPress={() => openSheet('/move')} style={s.list}>
            {task.list_emoji ? <Text>{task.list_emoji}</Text> : <View style={[s.dot, { backgroundColor: task.list_color ?? (task.list_kind === 'inbox' ? p.slInbox : p.textQuaternary) }]} />}
            <Text style={[s.listText, { color: p.textSecondary }]} numberOfLines={1}>{listName}</Text>
            <ChevronsUpDown size={14} color={p.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View ref={priority.ref} collapsable={false}>
            <GlassButton label="우선순위" onPress={priority.open}><Flag size={20} color={priorityColor(p, task.priority)} fill={task.priority ? priorityColor(p, task.priority) : 'transparent'} /></GlassButton>
          </View>
          <GlassButton label="더보기" onPress={() => setMore(true)}><Ellipsis size={22} color={p.textPrimary} /></GlassButton>
        </View>
        <View style={s.dateRow}>
          {checklist ? <ListChecks size={18} color={p.textTertiary} /> : (
            <Checkbox priority={task.priority} done={done} onPress={() => void toggleDone(task).then((u) => u && toast.show('작업이 완료되었습니다.', { undo: u }))} />
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={`날짜: ${date.label}`} onPress={() => openSheet('/date')} style={s.dateBtn}>
            <Text style={[FONT.body, { fontSize: 15, color: date.tone === 'none' ? p.textQuaternary : date.tone === 'overdue' ? p.overdue : p.accent }]}>{date.label}</Text>
            {task.reminder_count ? <Bell size={15} color={p.accent} /> : null}
            {task.repeat_rule ? <Repeat size={15} color={p.accent} /> : null}
          </Pressable>
        </View>

        <TextInput
          value={title ?? task.title}
          onChangeText={(t) => { setTitle(t); edit({ title: t }) }}
          onBlur={() => { if (!(title ?? task.title).trim()) { setTitle(lastTitle.current); edit({ title: lastTitle.current }) } }}
          placeholder="제목"
          placeholderTextColor={p.textQuaternary}
          multiline
          blurOnSubmit
          returnKeyType="done"
          style={[FONT.detailTitle, s.title, { color: done ? p.textTertiary : p.textPrimary }]}
          accessibilityLabel="제목"
        />

        {checklist ? (
          <View>
            {items.map((it) => (
              <View key={it.id} style={s.check}>
                <Checkbox priority={0} done={!!it.done} size={16} onPress={() => void toggleCheckItem(it.id, !it.done)} label={`${it.title} 체크`} />
                <TextInput
                  defaultValue={it.title}
                  onEndEditing={(e) => { const v = e.nativeEvent.text.trim(); if (!v) void removeCheckItem(it.id); else if (v !== it.title) void renameCheckItem(it.id, v) }}
                  style={[FONT.body, s.checkText, { color: it.done ? p.textTertiary : p.textPrimary, textDecorationLine: it.done ? 'line-through' : 'none' }]}
                  placeholder="항목"
                  placeholderTextColor={p.textQuaternary}
                />
              </View>
            ))}
            <View style={s.check}>
              <View style={{ width: 18, alignItems: 'center' }}><Plus size={16} color={p.textQuaternary} /></View>
              <TextInput
                value={newItem}
                onChangeText={setNewItem}
                placeholder="항목 추가"
                placeholderTextColor={p.textQuaternary}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => { const v = newItem.trim(); if (v) { void addCheckItem(id, v); setNewItem('') } }}
                style={[FONT.body, s.checkText, { color: p.textPrimary }]}
                accessibilityLabel="항목 추가"
              />
            </View>
          </View>
        ) : (
          <TextInput
            value={content ?? task.content ?? ''}
            onChangeText={(t) => { setContent(t); edit({ content: t }) }}
            placeholder="설명"
            placeholderTextColor={p.textQuaternary}
            multiline
            style={[FONT.body, s.body, { color: p.textSecondary }]}
            accessibilityLabel="설명"
          />
        )}

        {/* 33 §11: 자동 태그 ✦ · ✕ 떼기(자동은 dismissed) · 이름 = 태그 페이지 */}
        <DetailTags taskId={id} onAdd={() => openSheet('/tags')} />

        {subs.length ? (
          <View>
            <Text style={[FONT.meta, s.subHead, { color: p.textTertiary }]}>하위 할 일 {subs.length}</Text>
            {subs.map((c) => (
              <Pressable key={c.id} onPress={() => router.push(`/task/${c.id}`)} style={s.subRow}>
                <Checkbox priority={c.priority} done={c.status !== 0} onPress={() => void toggleDone(c)} />
                <Text style={[FONT.body, { flex: 1, color: c.status ? p.textTertiary : p.textPrimary }]} numberOfLines={1}>{c.title}</Text>
              </Pressable>
            ))}
            <Text style={[FONT.meta, { color: p.textQuaternary, paddingHorizontal: 16, paddingTop: 4 }]}>하위 할 일 만들기는 컴퓨터에서 할 수 있어요</Text>
          </View>
        ) : null}
      </ScrollView>

      <Animated.View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: p.borderDivider, backgroundColor: p.sheetBg }, kb.style]}>
        <GlassButton plain label="태그" onPress={() => openSheet('/tags')}><Tag size={21} color={tags.length ? p.accent : p.textSecondary} /></GlassButton>
        <GlassButton plain label={checklist ? '본문으로 바꾸기' : '체크리스트로 바꾸기'} onPress={() => void toggleContentMode(id)}><ListChecks size={21} color={checklist ? p.accent : p.textSecondary} /></GlassButton>
        <View style={{ flex: 1 }} />
        <Text style={[FONT.meta, { color: p.textTertiary, paddingRight: 6 }]}>{saved ? '저장됨' : '저장 중…'}</Text>
      </Animated.View>

      <PopMenu
        anchor={priority.rect}
        onClose={priority.close}
        width={200}
        items={[3, 2, 1, 0].map((n) => ({
          key: `p${n}`,
          label: ['없음', '낮음', '중간', '높음'][n],
          checked: task.priority === n,
          icon: <Flag size={18} color={priorityColor(p, n)} fill={n ? priorityColor(p, n) : 'transparent'} />,
          onPress: () => void setPriority([id], n)
        }))}
      />
      <MoreSheet
        open={more}
        onClose={() => setMore(false)}
        pinned={!!task.pinned_at}
        actions={{
          pin: () => void setPinned([id], !task.pinned_at),
          copy: () => void duplicateTask(id).then((nid) => nid && router.replace(`/task/${nid}`)),
          wontdo: () => void setWontDo([id]).then((u) => { router.back(); toast.show('하지 않음으로 표시했어요', { undo: u }) }),
          trash: () => void trashTasks([id]).then((u) => { router.back(); toast.show('휴지통으로 옮겼어요', { undo: u, duration: 5000 }) }),
          tags: () => openSheet('/tags'),
          // 20 §7.1 · 06 §14.4.6: 상세를 닫고 새 일정 시트를 연다
          toEvent: () => void evAct.fromTask(id).then((eid) => { if (eid) router.replace(`/event/${eid}`) })
        }}
      />
    </View>
  )
}

/**
 * 키보드가 이 시트 아래쪽을 얼마나 덮는지(21 §5-6). iOS formSheet는 화면 바닥에 붙어 있어 키보드 높이 그대로,
 * Android는 시트 바닥(창 좌표)과 키보드 윗변의 차이라서 시트가 이미 키보드 위로 올라가 있으면 0이 된다.
 * 도구 줄은 키보드와 같은 시간으로 따라 오르내린다. 키보드 위에서는 안전 영역 여백(safePad)이 필요 없어 그만큼 덜 올린다
 * (여백 부분은 키보드 밑으로 들어가 도구 줄 글자가 키보드 위 8에 온다).
 */
function useKeyboardOverlap(root: { current: View | null }, safePad: number) {
  const [height, setHeight] = useState(0)
  const lift = useSharedValue(0)
  useEffect(() => {
    const ease = Easing.bezier(0.17, 0.59, 0.4, 0.77) // iOS 키보드 곡선 근사
    const go = (h: number, ms: number) => {
      lift.value = withTiming(h ? Math.max(0, h - safePad) : 0, { duration: ms || 250, easing: ease })
      setHeight(h)
    }
    const show = (e: KeyboardEvent) => {
      const top = e.endCoordinates.screenY
      // iOS formSheet는 늘 화면 바닥에 붙어 있고(키보드가 오면 시트가 커질 뿐), 시트 안 measureInWindow는 시트 기준이라 화면 높이로 잰다
      if (Platform.OS === 'ios') return go(Math.max(0, Math.round(Dimensions.get('screen').height - top)), e.duration)
      root.current?.measureInWindow((_x, y, _w, hgt) => go(Math.max(0, Math.round(y + hgt - top)), e.duration))
    }
    const hide = (e: KeyboardEvent) => go(0, e?.duration ?? 0)
    const subs = Platform.OS === 'ios'
      ? [Keyboard.addListener('keyboardWillChangeFrame', show), Keyboard.addListener('keyboardWillHide', hide)]
      : [Keyboard.addListener('keyboardDidShow', show), Keyboard.addListener('keyboardDidHide', hide)]
    return () => subs.forEach((x) => x.remove())
  }, [root, lift, safePad])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value }] }))
  return { height, style }
}

/** 상세 ⋯(21 §5, 시안 F-3): 위 큰 아이콘 줄 고정·복사·하지 않음·삭제 + 목록(태그). "주간 목표에 연결"은 넣지 않음(20 M8) */
function MoreSheet(props: { open: boolean; onClose: () => void; pinned: boolean; actions: Record<'pin' | 'copy' | 'wontdo' | 'trash' | 'tags' | 'toEvent', () => void> }) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const big: [keyof typeof props.actions, string, ReactNode][] = [
    ['pin', props.pinned ? '고정 해제' : '고정', <Pin key="i" size={22} color="#f29a2e" />],
    ['copy', '복사', <Copy key="i" size={22} color="#1fc79a" />],
    ['wontdo', '하지 않음', <Ban key="i" size={22} color={p.accent} />],
    ['trash', '삭제', <Trash2 key="i" size={22} color={p.danger} />]
  ]
  const act = (k: keyof typeof props.actions) => { props.onClose(); props.actions[k]() }
  return (
    <Modal transparent visible={props.open} animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }]} onPress={props.onClose} accessibilityLabel="닫기" />
      <View style={[s.more, { backgroundColor: p.pageBg, paddingBottom: insets.bottom + 12 }]}>
        <View style={[s.grabber, { backgroundColor: p.textQuaternary }]} />
        <View style={s.bigRow}>
          {big.map(([k, label, icon]) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={label} onPress={() => act(k)} style={[s.big, { backgroundColor: p.cardBg }]}>
              {icon}
              <Text style={{ fontSize: 12, color: p.textSecondary }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[s.cells, { backgroundColor: p.cardBg }]}>
          <Pressable accessibilityRole="button" onPress={() => act('tags')} style={s.cell}>
            <Tag size={20} color={p.textSecondary} />
            <Text style={[FONT.body, { color: p.textPrimary }]}>태그</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => act('toEvent')} style={[s.cell, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
            <ArrowRightLeft size={20} color={p.textSecondary} />
            <Text style={[FONT.body, { color: p.textPrimary }]}>일정으로 바꾸기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  top: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12 },
  list: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, paddingVertical: 8 },
  listText: { fontSize: 15, lineHeight: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 36 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, flex: 1 },
  title: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  body: { paddingHorizontal: 16, paddingVertical: 2, lineHeight: 24, minHeight: 80, textAlignVertical: 'top' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 16 },
  checkText: { flex: 1, height: 42 },
  subHead: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  subRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 5, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  more: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 6 },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', opacity: 0.7, marginBottom: 12 },
  bigRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  big: { flex: 1, height: 74, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  cells: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  cell: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }
})
