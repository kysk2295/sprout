// 리스트 서랍(20 §2, 21 §2, 시안 C-1): 왼쪽에서 화면 82%를 덮는 판.
// 계정 줄(아바타·이름·⚙) → 스마트 목록(오늘·내일·다음 7일·기본함) → 구분선 → 리스트·폴더(⌄ 펼침) → 구분선 → 완료·휴지통
// 고르면 같은 목록 화면에 그 목록. 아이콘은 Lucide(오픈 라이선스), 색 배치만 틱틱처럼 여러 색.
// [다음] 태그 ›, + 추가(리스트·필터·태그), 관리 아이콘
import { useRouter } from 'expo-router'
import { CalendarCheck, CalendarRange, ChevronDown, ChevronRight, CircleCheck, Folder, Inbox, Settings, Sunrise, Trash2 } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { useAuth } from '../data/auth'
import { useDrawerCounts, useFolders, useLists } from '../data/lists'
import type { ViewKey } from '../data/views'
import { useTasksView } from '../state/tasksView'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

export function Drawer() {
  const { drawerOpen, setDrawerOpen, view, setView } = useTasksView()
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const win = useWindowDimensions()
  const width = Math.min(win.width * 0.82, 360)
  const x = useSharedValue(-width)
  const [mounted, setMounted] = useState(drawerOpen)
  const router = useRouter()
  const { user } = useAuth()
  const lists = useLists()
  const folders = useFolders()
  const counts = useDrawerCounts()
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (drawerOpen) {
      setMounted(true)
      x.value = withTiming(0, { duration: 220 })
    } else {
      x.value = withTiming(-width, { duration: 200 }, (fin) => { if (fin) scheduleOnRN(setMounted, false) })
    }
  }, [drawerOpen, width, x])

  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const scrim = useAnimatedStyle(() => ({ opacity: 1 + x.value / width }))
  const drag = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => { x.value = Math.min(0, e.translationX) })
    .onEnd((e) => {
      if (e.translationX < -width * 0.3 || e.velocityX < -500) scheduleOnRN(setDrawerOpen, false)
      else x.value = withTiming(0, { duration: 150 })
    })

  if (!mounted) return null
  const pick = (v: ViewKey) => { setView(v); setDrawerOpen(false) }
  const inbox = lists.find((l) => l.kind === 'inbox')
  const normal = lists.filter((l) => l.kind !== 'inbox')
  const loose = normal.filter((l) => !l.folder_id || !folders.some((f) => f.id === l.folder_id))
  const name = user?.email.split('@')[0] ?? ''

  const Row = (r: { v?: ViewKey; icon: ReactNode; label: string; n?: number; child?: boolean; right?: ReactNode; onPress?: () => void }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: r.v === view }}
      onPress={r.onPress ?? (() => r.v && pick(r.v))}
      style={({ pressed }) => [s.dr, r.child && { paddingLeft: 44 }, (r.v === view || pressed) && { backgroundColor: p.drawerSel }]}
    >
      <View style={s.icon}>{r.icon}</View>
      <Text style={[FONT.body, { color: p.textPrimary, flex: 1 }]} numberOfLines={1}>{r.label}</Text>
      {r.n ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{r.n}</Text> : null}
      {r.right}
    </Pressable>
  )
  const dot = (color: string | null) => <View style={[s.ldot, { backgroundColor: color ?? p.textQuaternary }]} />
  const listIcon = (l: { emoji: string | null; color: string | null }) => (l.emoji ? <Text style={{ fontSize: 17 }}>{l.emoji}</Text> : dot(l.color))

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerOpen(false)} accessibilityLabel="서랍 닫기" />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View style={[s.panel, { width, backgroundColor: p.drawerBg, paddingTop: insets.top }, panel]}>
          <View style={s.me}>
            <View style={s.av}><Text style={s.avText}>{name.slice(0, 1).toUpperCase() || '?'}</Text></View>
            <Text style={[FONT.bodyStrong, { color: p.textPrimary, flex: 1 }]} numberOfLines={1}>{name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="설정" hitSlop={8} onPress={() => { setDrawerOpen(false); router.navigate('/settings') }} style={s.meBtn}>
              <Settings size={22} color={p.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 20 }}>
            <Row v="smart:today" icon={<CalendarCheck size={22} color={p.slToday} />} label="오늘" n={counts.smart.today} />
            <Row v="smart:tomorrow" icon={<Sunrise size={22} color={p.slTomorrow} />} label="내일" n={counts.smart.tomorrow} />
            <Row v="smart:next7" icon={<CalendarRange size={22} color={p.slWeek} />} label="다음 7일" n={counts.smart.next7} />
            {inbox ? <Row v="smart:inbox" icon={<Inbox size={22} color={p.slInbox} />} label="기본함" n={counts.smart.inbox} /> : null}
            <View style={[s.hr, { borderTopColor: p.borderDivider }]} />
            {loose.map((l) => <Row key={l.id} v={`list:${l.id}`} icon={listIcon(l)} label={l.name} n={counts.lists[l.id]} />)}
            {folders.map((f) => {
              const kids = normal.filter((l) => l.folder_id === f.id)
              const open = !!openFolders[f.id]
              return (
                <View key={f.id}>
                  <Row
                    icon={<Folder size={22} color={p.textSecondary} />}
                    label={f.name}
                    n={kids.reduce((n, l) => n + (counts.lists[l.id] ?? 0), 0)}
                    onPress={() => pick(`folder:${f.id}`)}
                    right={
                      <Pressable accessibilityRole="button" accessibilityLabel={open ? '폴더 접기' : '폴더 펼치기'} hitSlop={10} onPress={() => setOpenFolders((s) => ({ ...s, [f.id]: !open }))}>
                        {open ? <ChevronDown size={14} color={p.textQuaternary} /> : <ChevronRight size={14} color={p.textQuaternary} />}
                      </Pressable>
                    }
                  />
                  {open ? kids.map((l) => <Row key={l.id} child v={`list:${l.id}`} icon={listIcon(l)} label={l.name} n={counts.lists[l.id]} />) : null}
                </View>
              )
            })}
            <View style={[s.hr, { borderTopColor: p.borderDivider }]} />
            <Row v="smart:completed" icon={<CircleCheck size={22} color={p.textSecondary} />} label="완료" />
            <Row v="smart:trash" icon={<Trash2 size={22} color={p.textSecondary} />} label="휴지통" />
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

/** 목록 화면 왼쪽 가장자리에서 오른쪽으로 밀면 서랍(21 §2) — 행 스와이프와 겹치지 않게 가장자리 20만 */
export function DrawerEdge() {
  const { setDrawerOpen } = useTasksView()
  const g = Gesture.Pan().activeOffsetX(14).failOffsetY([-12, 12]).onEnd((e) => { if (e.translationX > 50) scheduleOnRN(setDrawerOpen, true) })
  return (
    <GestureDetector gesture={g}>
      <View style={s.edge} />
    </GestureDetector>
  )
}

const s = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 8, height: 0 }, elevation: 20 },
  me: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8 },
  av: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#4caf6a', alignItems: 'center', justifyContent: 'center' },
  avText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  meBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dr: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 10 },
  icon: { width: 22, alignItems: 'center' },
  ldot: { width: 9, height: 9, borderRadius: 5 },
  hr: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: 10 },
  edge: { position: 'absolute', left: 0, top: 120, bottom: 120, width: 20 }
})
