// 29 모바일 작업 지도. §9(2026-10-05 결정): 작업 지도 = 프로젝트 한 화면(⚡ 지금 할 일 · 프로젝트 카드 · 같이 계획 짜기).
// 머리 ⧉ = 전체 지도(아래 §2 — 내 폴더 › 리스트 › 할 일): 머리(‹ · ⧉ · ⋯) · 큰 제목 · 세그먼트 목록|보드.
// 목록(F1) = 목표 줄 → 폴더 없는 리스트 카드 → 폴더 카드(리스트 행: 진행 고리·완료/전체) → 기본함(점선, 정리할 것) → + 새로운 리스트 · 새 폴더.
// 보드(F3) = 폴더를 한 열씩 넘김(열 안 묶음 = 리스트), 기본함 열은 맨 오른쪽.
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, FolderPlus, Inbox, Layers, Map as MapIcon, MoreHorizontal, Plus, Target } from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { setGoalProgress } from '../../src/growth/data'
import type { GoalRow } from '../../src/growth/logic'
import { dayKey } from '../../src/lib/dates'
import { useMapData, useMapOptions, type MapData } from '../../src/map/data'
import { Dialog, type DialogSpec } from '../../src/map/Dialog'
import { useFolderMenu } from '../../src/map/folderMenu'
import { FolderGlyph, ListGlyph, listShow, splitLead } from '../../src/ui/OrgIcons'
import { goalLinkedCount, goalsAllDone, type FolderNode, type ListNode, type MapTask } from '../../src/map/logic'
import { MapTaskRow, Ring } from '../../src/map/parts'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { BigTitle, NavRow } from '../../src/ui/Header'
import { PopMenu, useAnchor, type MenuItem, type Rect } from '../../src/ui/Menu'
import { Segmented } from '../../src/ui/Segmented'
import { usePlanData } from '../../src/map/v2/plan'
import { ProjectBoard } from '../../src/map/v2/ProjectBoard'

export default function WorkMap() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [o, setO] = useMapOptions()
  const data = useMapData(o)
  const plan = usePlanData()
  const more = useAnchor()
  const [dialog, setDialog] = useState<DialogSpec | null>(null)
  const [menu, setMenu] = useState<{ rect: Rect; items: MenuItem[] } | null>(null)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const menus = useFolderMenu(setDialog)
  const openFolderMenu = (f: FolderNode, rect: Rect) => { if (f.folder) setMenu({ rect, items: menus.folder(f.folder) }) }
  const linkedOpen = goalLinkedCount(data.goals, data.links, data.statusOf)
  const doneGoal = goalsAllDone(data.goals, data.links, data.statusOf).find((id) => !skip.has(id))
  const doneGoalRow = data.goals.find((g) => g.id === doneGoal)
  const empty = data.loaded && !data.tree.folders.length && !data.tree.inbox?.tasks.length

  const seg = <Segmented style={{ marginHorizontal: 16, marginBottom: 12 }} value={o.view} onChange={(v) => setO({ view: v })} items={[{ key: 'list', label: '목록' }, { key: 'board', label: '보드' }]} />
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow
        left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>}
        right={
          <>
            <GlassButton label={o.whole ? '프로젝트 화면으로' : '전체 지도'} onPress={() => setO({ whole: !o.whole })}><Layers size={20} color={o.whole ? p.accent : p.textPrimary} /></GlassButton>
            {o.whole ? <GlassButton label="보기 옵션" onPress={more.open}><View ref={more.ref} collapsable={false}><MoreHorizontal size={20} color={p.textPrimary} /></View></GlassButton> : null}
          </>
        }
      />
      {!o.whole ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
          <BigTitle title="작업 지도" />
          <ProjectBoard data={plan} />
        </ScrollView>
      ) : o.view === 'list' || empty ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
          <BigTitle title="작업 지도" />
          {seg}
          {empty ? <EmptyMap onCreate={() => menus.newList(null)} /> : (
            <>
              {doneGoalRow ? (
                <View style={[s.band, { backgroundColor: p.accentSubtle }]}>
                  <Text style={{ flex: 1, color: p.textPrimary, fontSize: 14 }}>'{doneGoalRow.title}'에 연결된 할 일을 다 끝냈어요</Text>
                  <Pressable onPress={() => { setSkip((x) => new Set(x).add(doneGoalRow.id)); void setGoalProgress(dayKey(), doneGoalRow as GoalRow, doneGoalRow.target) }} hitSlop={6}><Text style={{ color: p.accent, fontWeight: '600' }}>달성으로 표시</Text></Pressable>
                </View>
              ) : null}
              {linkedOpen ? (
                <Pressable onPress={() => router.push('/map/goals')} accessibilityRole="button" style={[s.goalStrip, { backgroundColor: p.dark ? '#e8a23a1f' : '#fdf1df' }]}>
                  <Target size={17} color="#e8a23a" />
                  <Text style={{ flex: 1, color: p.textPrimary, fontSize: 14 }}>이번 주 목표에 연결된 할 일 <Text style={{ fontWeight: '700' }}>{linkedOpen}</Text></Text>
                  <ChevronRight size={16} color={p.textTertiary} />
                </Pressable>
              ) : null}
              {data.tree.folders.map((f) => <FolderCard key={f.folder?.id ?? 'loose'} f={f} data={data} onMenu={openFolderMenu} />)}
              {data.tree.inbox ? (
                <Pressable onPress={() => router.push(`/map/list/${data.tree.inbox!.list.id}`)} accessibilityRole="button" style={[s.card, s.dashed, { borderColor: p.textQuaternary }]}>
                  <View style={s.head}>
                    <Inbox size={17} color={p.slInbox} />
                    <Text style={[s.folderName, { color: p.textSecondary }]}>기본함</Text>
                    <Text style={[s.count, { color: p.textTertiary }]}>{data.tree.inbox.open}</Text>
                    {data.tree.inbox.open ? <View style={s.review}><Text style={{ color: '#d9822b', fontSize: 11.5 }}>정리할 것</Text></View> : null}
                    <View style={{ flex: 1 }} />
                    <ChevronRight size={16} color={p.textTertiary} />
                  </View>
                </Pressable>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable onPress={() => menus.newList(null)} accessibilityRole="button" style={s.newBtn}><Plus size={18} color={p.accent} /><Text style={{ color: p.accent, fontSize: 15, fontWeight: '500' }}>새로운 리스트</Text></Pressable>
                <Pressable onPress={menus.newFolder} accessibilityRole="button" style={s.newBtn}><FolderPlus size={17} color={p.accent} /><Text style={{ color: p.accent, fontSize: 15, fontWeight: '500' }}>새 폴더</Text></Pressable>
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <BigTitle title="작업 지도" />
          {seg}
          <Board data={data} onMenu={openFolderMenu} onNew={() => menus.newList(null)} bottom={insets.bottom} />
        </View>
      )}

      <PopMenu anchor={more.rect} onClose={more.close} items={[
        { key: 'week', label: '이번 주', checked: o.view === 'list' && o.period === 'week', disabled: o.view === 'board', onPress: () => setO({ period: 'week' }) },
        { key: 'all', label: '전체', checked: o.period === 'all' || o.view === 'board', disabled: o.view === 'board', onPress: () => setO({ period: 'all' }) },
        { key: 'done', label: '완료 보이기', checked: o.showDone, onPress: () => setO({ showDone: !o.showDone }) },
        { key: 'nodate', label: '날짜 없는 항목 보이기', checked: o.showNoDate, onPress: () => setO({ showNoDate: !o.showNoDate }) },
        { key: 'newl', label: '새로운 리스트', onPress: () => menus.newList(null) },
        { key: 'newf', label: '새 폴더', onPress: menus.newFolder }
      ]} />
      <PopMenu anchor={menu?.rect ?? null} onClose={() => setMenu(null)} items={menu?.items ?? []} />
      <Dialog spec={dialog} onClose={() => setDialog(null)} />
    </View>
  )
}

function EmptyMap({ onCreate }: { onCreate: () => void }) {
  const p = usePalette()
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 36, gap: 8 }}>
      <MapIcon size={56} color={p.textQuaternary} />
      <Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 8 }}>폴더와 리스트로 할 일을 한눈에 봐요</Text>
      <Text style={{ color: p.textTertiary, fontSize: 13.5, textAlign: 'center' }}>리스트를 만들고 할 일을 옮기면 여기에 지도가 생겨요</Text>
      <Pressable onPress={onCreate} accessibilityRole="button" style={{ marginTop: 14, backgroundColor: p.accent, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9 }}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>리스트 만들기</Text></Pressable>
    </View>
  )
}

function ListIcon({ l }: { l: ListNode['list'] }) {
  return <ListGlyph list={l} size={15} /> // 30 §A.5
}

function FolderCard({ f, data, onMenu }: { f: FolderNode; data: MapData; onMenu: (f: FolderNode, r: Rect) => void }) {
  const p = usePalette()
  const router = useRouter()
  const ref = useRef<View>(null)
  return (
    <View style={[s.card, { backgroundColor: p.cardBg }]}>
      {f.folder ? (
        <View style={s.head}>
          <FolderGlyph name={f.folder.name} size={18} />
          <Text style={[s.folderName, { color: p.textPrimary }]} numberOfLines={1}>{splitLead(f.folder.name).name}</Text>
          <Text style={[s.count, { color: p.textTertiary }]}>{f.open}</Text>
          <View style={{ flex: 1 }} />
          <Pressable ref={ref} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${f.folder.name} 메뉴`} onPress={() => ref.current?.measureInWindow((x, y, width, height) => onMenu(f, { x, y, width, height }))}>
            <MoreHorizontal size={18} color={p.textTertiary} />
          </Pressable>
        </View>
      ) : null}
      {f.lists.map((n, i) => {
        const prog = data.progress.get(n.list.id) ?? { done: 0, total: 0 }
        return (
          <Pressable key={n.list.id} onPress={() => router.push(`/map/list/${n.list.id}`)} accessibilityRole="button" style={({ pressed }) => [s.lrow, (f.folder || i > 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
            <Ring done={prog.done} total={prog.total} />
            <ListIcon l={n.list} />
            <Text style={[s.lname, { color: p.textPrimary }]} numberOfLines={1}>{listShow(n.list).name}</Text>
            <Text style={[s.count, { color: p.textTertiary }]}>{prog.done}/{prog.total}</Text>
            <ChevronRight size={16} color={p.textQuaternary} />
          </Pressable>
        )
      })}
      {!f.lists.length ? <Text style={{ color: p.textTertiary, fontSize: 13, paddingHorizontal: 14, paddingBottom: 12 }}>리스트가 없어요 · ⋯에서 새 리스트</Text> : null}
    </View>
  )
}

/** 보드(F3): 열 = 폴더(폴더 없는 리스트는 "리스트" 열, 기본함은 맨 오른쪽), 열 폭 = 화면 − 77, 한 열씩 딱 멈춤. 열 이름 → 모든 열 격자 */
function Board({ data, onMenu, onNew, bottom }: { data: MapData; onMenu: (f: FolderNode, r: Rect) => void; onNew: () => void; bottom: number }) {
  const p = usePalette()
  const { width } = useWindowDimensions()
  const colW = width - 77
  const gap = 12
  const scroll = useRef<ScrollView>(null)
  const [page, setPage] = useState(0)
  const [grid, setGrid] = useState(false)
  const cols = useMemo(() => [
    ...data.tree.folders.map((f) => ({ key: f.folder?.id ?? 'loose', node: f, name: f.folder?.name ?? '리스트', groups: f.lists.map((n) => ({ key: n.list.id, name: n.list.name, tasks: n.tasks })), count: f.open })),
    ...(data.tree.inbox ? [{ key: 'inbox', node: null, name: '기본함', groups: [{ key: data.tree.inbox.list.id, name: '', tasks: data.tree.inbox.tasks }], count: data.tree.inbox.open }] : [])
  ], [data.tree])
  const go = (i: number) => { scroll.current?.scrollTo({ x: i * (colW + gap), animated: true }); setPage(i) }
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / (colW + gap)))
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} horizontal snapToInterval={colW + gap} decelerationRate="fast" showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd} contentContainerStyle={{ paddingHorizontal: 16, gap }}>
        {cols.map((c) => <Column key={c.key} col={c} data={data} width={colW} onTitle={() => setGrid(true)} onMenu={onMenu} />)}
        <Pressable onPress={onNew} accessibilityRole="button" style={[s.newCol, { width: colW * 0.6, borderColor: p.borderDivider }]}><Plus size={18} color={p.accent} /><Text style={{ color: p.accent, fontSize: 15 }}>새로운 리스트</Text></Pressable>
      </ScrollView>
      <View style={[s.dots, { paddingBottom: bottom + 8 }]}>
        {cols.map((c, i) => <View key={c.key} style={[s.pdot, { backgroundColor: i === page ? p.accent : p.textQuaternary }]} />)}
      </View>
      <Modal visible={grid} transparent animationType="fade" onRequestClose={() => setGrid(false)}>
        <Pressable style={[s.gridScrim, { backgroundColor: p.scrim }]} onPress={() => setGrid(false)}>
          <View style={[s.gridBox, { backgroundColor: p.sheetBg }]}>
            <Text style={{ color: p.textPrimary, fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>폴더</Text>
            <View style={s.gridWrap}>
              {cols.map((c, i) => (
                <Pressable key={c.key} onPress={() => { setGrid(false); go(i) }} accessibilityRole="button" style={[s.gridCell, { backgroundColor: i === page ? p.accentSubtle : p.cardBg }]}>
                  <Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: p.textTertiary, fontSize: 12 }}>{c.count}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

function Column({ col, data, width, onTitle, onMenu }: { col: { key: string; node: FolderNode | null; name: string; groups: { key: string; name: string; tasks: MapTask[] }[]; count: number }; data: MapData; width: number; onTitle: () => void; onMenu: (f: FolderNode, r: Rect) => void }) {
  const p = usePalette()
  const router = useRouter()
  const ref = useRef<View>(null)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  return (
    <View style={[s.col, { width, backgroundColor: p.dark ? '#ffffff0d' : '#0000000a' }]}>
      <View style={s.colHead}>
        <Pressable onPress={onTitle} accessibilityRole="button" accessibilityHint="모든 열 보기" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={{ color: col.node ? p.textPrimary : p.textSecondary, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{col.name}</Text>
          <Text style={{ color: p.textTertiary, fontSize: 13 }}>{col.count}</Text>
        </Pressable>
        {col.node?.folder ? (
          <Pressable ref={ref} hitSlop={10} accessibilityLabel={`${col.name} 메뉴`} onPress={() => ref.current?.measureInWindow((x, y, w, h) => onMenu(col.node!, { x, y, width: w, height: h }))}><MoreHorizontal size={18} color={p.textTertiary} /></Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 6 }} showsVerticalScrollIndicator={false}>
        {col.groups.map((g) => (
          <View key={g.key} style={{ gap: 6 }}>
            {g.name ? (
              <View style={s.sub}>
                <Pressable onPress={() => setClosed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }} accessibilityRole="button">
                  <ChevronRight size={13} color={p.textTertiary} style={{ transform: [{ rotate: closed.has(g.key) ? '0deg' : '90deg' }] }} />
                  <Text style={{ color: p.textSecondary, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>{g.name}</Text>
                  <Text style={{ color: p.textTertiary, fontSize: 12 }}>{g.tasks.filter((t) => t.status === 0).length}</Text>
                </Pressable>
                <Pressable onPress={() => router.push(`/map/list/${g.key}`)} hitSlop={8} accessibilityLabel={`${g.name} 열기`}><ChevronRight size={14} color={p.textQuaternary} /></Pressable>
              </View>
            ) : null}
            {!closed.has(g.key) ? g.tasks.map((t) => (
              <View key={t.id} style={[s.kcard, { backgroundColor: p.cardBg }]}><MapTaskRow task={t} data={data} first /></View>
            )) : null}
          </View>
        ))}
        {!col.groups.some((g) => g.tasks.length) ? <Text style={{ color: p.textTertiary, fontSize: 13, padding: 8 }}>할 일이 없어요</Text> : null}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  band: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  goalStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 10, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  dashed: { borderWidth: 1, borderStyle: 'dashed' },
  head: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  folderName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  count: { fontSize: 13 },
  review: { backgroundColor: '#e8a23a22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  lrow: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  lname: { flex: 1, fontSize: 15.5 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12 },
  col: { borderRadius: 14, padding: 8, paddingBottom: 0 },
  colHead: { flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 6, gap: 8 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingTop: 6 },
  kcard: { borderRadius: 8, overflow: 'hidden' },
  newCol: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, alignSelf: 'flex-start', height: 60 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 8 },
  pdot: { width: 6, height: 6, borderRadius: 3 },
  gridScrim: { flex: 1, justifyContent: 'center', padding: 24 },
  gridBox: { borderRadius: 18, padding: 16 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: { width: '48%', borderRadius: 12, padding: 12, gap: 4 }
})
