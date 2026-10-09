// 26 수집함 탭(C3 수집 · C5 볼 것 · C6 위키 목록): 둥근 🔍 · ⋯ / 큰 제목 / 세그먼트 `수집 · 볼 것 N · 위키`
// 수집: 추가 바(Enter 저장, 링크만이면 볼 것) · 날짜 묶음 + 카톡 날짜 묶음 · 두 줄 행(종류 · 꼬리표 · 등록) · 왼쪽 밀기 = 할 일로 · 삭제
// 볼 것: 안 본 것 · 다 본 것(접힘) · 동그라미 = 봤어요 · 행 = 링크 열기 · 오른쪽 밀기 = 봤어요
// 위키: 주제 목록(자료 수 · 바뀐 때 · 새 점) → 주제 페이지(읽기 + 되돌리기)
import { useLiveQuery } from '../data/rows'
import { useRouter, useScrollToTop } from 'expo-router'
import { BookOpen, Check, ChevronRight, Ellipsis, Plus, Search, SquareCheck, Trash2, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { syncNow } from '../data/auth'
import { dayKey } from '../lib/dates'
import { useWeekStart } from '../data/calendarPrefs'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { GlassButton } from '../ui/Glass'
import { GroupCard } from '../ui/GroupCard'
import { BigTitle, NavRow } from '../ui/Header'
import { PopMenu, useAnchor, type Rect } from '../ui/Menu'
import { closeOpenRow, SwipeRow } from '../ui/SwipeRow'
import { useToast } from '../ui/Toast'
import {
  domainOf, groupItems, isBareLink, isKakao, ITEMS_SQL, KIND_NAME, KINDS, localDay, monthDayKo, ro, sentAt, shortDay, timeKo, titleOf, watchGroups,
  type CollectItem, type WikiTopic
} from './core'
import { deleteItem, registerSuggestion, saveItem, setKind, setSeen } from './data'
import { openItem, takeItem } from './events'
import { ItemSheet } from './ItemSheet'
import { ChipView, CollectEmpty, ItemRow, Segmented, SiteMark } from './parts'
import { seedSeen, useSeen } from './wikiSeen'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { canReceiveShare } from '../share/android'

type Section = 'notes' | 'watch' | 'wiki'
type Topic = WikiTopic & { count: number }

function useToday() {
  const [today, setToday] = useState(dayKey())
  useEffect(() => { const t = setInterval(() => setToday(dayKey()), 30_000); return () => clearInterval(t) }, [])
  return today
}

export default function CollectScreen() {
  const p = usePalette()
  const space = useTabBarSpace()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const toast = useToast()
  const today = useToday()
  const [section, setSection] = useState<Section>('notes')
  const [search, setSearch] = useState<string | null>(null)
  const q = search ?? ''
  const items = useLiveQuery<CollectItem>(ITEMS_SQL, [q]).data
  const unseen = useLiveQuery<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE url IS NOT NULL AND seen_at IS NULL').data[0]?.n ?? 0
  const pending = useLiveQuery<{ n: number }>("SELECT COUNT(*) AS n FROM notes WHERE ai_state = 'pending' AND task_id IS NULL").data[0]?.n ?? 0
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) => setToggled((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [sheet, setSheet] = useState<{ id: string; convert?: boolean } | null>(null)
  const [menu, setMenu] = useState<{ item: CollectItem; rect: Rect; kinds?: boolean } | null>(null)
  const more = useAnchor()

  useEffect(() => {
    const open = (id: string) => { setSection('notes'); setSearch(null); setSheet({ id }) }
    const first = takeItem() // 47 §19.1 탭이 그려지기 전에 온 요청
    if (first) open(first)
    return openItem.on(open)
  }, [])

  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => { setRefreshing(true); try { await syncNow() } finally { setRefreshing(false) } }, [])

  const ws = useWeekStart() // 06 §16.1 "이번 주" = 주 시작 설정
  const groups = useMemo(() => groupItems(items, today, ws), [items, today, ws])
  const watch = useMemo(() => watchGroups(items), [items])

  const register = async (item: CollectItem) => {
    try {
      const taskId = await registerSuggestion(item)
      toast.show('할 일로 등록했어요', { action: { label: '열기', onPress: () => router.push(`/task/${taskId}`) } })
    } catch (e) { toast.show(e instanceof Error ? e.message : '등록하지 못했어요. 다시 시도해 주세요.', { error: true }) }
  }
  const toTask = (item: CollectItem) => {
    if (item.task_id) return router.push(`/task/${item.task_id}`)
    // 할 일 제안이면 바로 등록, 아니면 시트에서 날짜를 고르고 등록(26 §4)
    if (item.kind === 'task' && item.ai_state === 'done' && item.suggestion) return void register(item)
    setSheet({ id: item.id, convert: true })
  }
  const remove = async (item: CollectItem) => {
    const undo = await deleteItem(item.id)
    toast.show('삭제했어요', { undo, duration: 5000 })
  }
  const seen = async (item: CollectItem, on: boolean) => {
    const undo = await setSeen(item.id, on)
    toast.show(on ? '봤어요로 옮겼어요' : '안 본 것으로 옮겼어요', { undo })
  }

  const segItems: [Section, string][] = [['notes', '수집'], ['watch', unseen ? `볼 것 ${unseen}` : '볼 것'], ['wiki', '위키']]
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      {search === null ? (
        <NavRow right={<>
          <GlassButton label="수집함 검색" onPress={() => setSearch('')}><Search size={19} color={p.textPrimary} /></GlassButton>
          <View ref={more.ref} collapsable={false}><GlassButton label="수집함 메뉴" onPress={more.open}><Ellipsis size={20} color={p.textPrimary} /></GlassButton></View>
        </>} />
      ) : (
        <View style={[s.searchRow, { marginTop: insets.top }]}>
          <View style={[s.searchBox, { backgroundColor: p.dark ? 'rgba(118,118,128,0.24)' : 'rgba(120,120,128,0.12)' }]}>
            <Search size={16} color={p.textTertiary} />
            <TextInput autoFocus value={search} onChangeText={setSearch} placeholder={section === 'wiki' ? '주제 검색' : section === 'watch' ? '볼 것 검색' : '수집함 검색'} placeholderTextColor={p.textTertiary} style={[s.searchInput, { color: p.textPrimary }]} returnKeyType="search" accessibilityLabel="수집함 검색" />
            {search ? <Pressable accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => setSearch('')}><X size={16} color={p.textTertiary} /></Pressable> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={() => { setSearch(null); Keyboard.dismiss() }} hitSlop={8}><Text style={[FONT.body, { color: p.accentInk }]}>취소</Text></Pressable>
        </View>
      )}
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={closeOpenRow}
        contentContainerStyle={{ paddingBottom: space.pad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        {search === null ? <BigTitle title="수집함" /> : null}
        <Segmented value={section} items={segItems} onChange={(v) => { closeOpenRow(); setSection(v) }} />

        {section === 'notes' ? (
          <>
            {search === null ? <AddBar onSaved={(bare) => { if (bare) toast.show('볼 것에 넣었어요') }} /> : null}
            {pending > 0 && search === null ? (
              <View style={[s.band, { backgroundColor: p.accentSubtle }]}>
                <Text style={[FONT.meta, { color: p.textSecondary, flex: 1 }]}>정리 전 {pending}개 · 컴퓨터에서 꿈틀을 열면 AI가 정리해요</Text>
              </View>
            ) : null}
            {!items.length ? (
              q ? <CollectEmpty icon="inbox" title={`"${q}"와 맞는 항목이 없어요`} /> : (
                <CollectEmpty icon="inbox" title="무엇이든 던져 두세요" sub={canReceiveShare ? "다른 앱에서 공유 → 꿈틀을 누르면 여기로 와요\n(카톡 '나에게 보내기'처럼)" : '링크·글을 복사해 위 입력 칸에 붙여 넣으면 여기로 와요\n(카톡 \'나에게 보내기\'처럼)'} />
              )
            ) : groups.map((g) => {
              const closed = !q && g.closedByDefault !== toggled.has(g.id)
              return (
                <GroupCard key={g.id} title={g.name} count={g.items.length} collapsed={closed} onToggle={() => toggle(g.id)}>
                  {g.items.map((n) => (
                    <SwipeRow key={n.id} right={[
                      { key: 'task', color: p.swipeMove, label: n.task_id ? '할 일 열기' : '할 일로', icon: <SquareCheck size={20} color="#fff" />, onPress: () => toTask(n) },
                      { key: 'del', color: p.swipeDel, label: '삭제', icon: <Trash2 size={20} color="#fff" />, onPress: () => void remove(n) }
                    ]}>
                      <RowWithMenu item={n} today={today} showTime={g.showTime} onPress={() => setSheet({ id: n.id })} onMenu={(rect) => setMenu({ item: n, rect })} onRegister={() => void register(n)} />
                    </SwipeRow>
                  ))}
                </GroupCard>
              )
            })}
          </>
        ) : section === 'watch' ? (
          !watch.some((g) => g.items.length) ? (
            q ? <CollectEmpty icon="link" title={`"${q}"와 맞는 링크가 없어요`} /> : <CollectEmpty icon="link" title="저장한 링크가 여기에 모여요" sub="수집에 유튜브·기사 링크를 던져 두면 제목과 함께 들어와요" />
          ) : watch.filter((g) => g.items.length).map((g) => {
            const closed = !q && (g.id === 'seen') !== toggled.has(`w:${g.id}`)
            return (
              <GroupCard key={g.id} title={g.name} count={g.items.length} collapsed={closed} onToggle={() => toggle(`w:${g.id}`)}>
                {g.items.map((n) => (
                  <SwipeRow key={n.id} left={[{ key: 'seen', color: p.swipeDone, label: n.seen_at ? '안 본 것으로' : '봤어요', icon: <Check size={20} color="#fff" />, onPress: () => void seen(n, !n.seen_at) }]} onFullSwipe={() => void seen(n, !n.seen_at)} fullLabel={n.seen_at ? '안 본 것으로' : '봤어요'} fullColor={p.swipeDone}>
                    <WatchRow item={n} today={today} onToggle={() => void seen(n, !n.seen_at)} onMenu={(rect) => setMenu({ item: n, rect })} />
                  </SwipeRow>
                ))}
              </GroupCard>
            )
          })
        ) : (
          <WikiTopics query={q} onOpen={(id) => router.push(`/collect/wiki/${id}`)} onBack={() => setSection('notes')} />
        )}
      </ScrollView>

      <ItemSheet id={sheet?.id ?? null} startConvert={sheet?.convert} onClose={() => setSheet(null)} onTopic={(id) => router.push(`/collect/wiki/${id}`)} />
      <PopMenu anchor={more.rect} onClose={more.close} width={270} items={[
        { key: 'sync', label: '지금 동기화', onPress: () => void onRefresh() },
        { key: 'kakao', label: '카카오톡 대화 가져오기', onPress: () => toast.show('카카오톡 대화 가져오기는 컴퓨터에서 해요', { icon: false, duration: 3000 }) },
        { key: 'wiki', label: '위키 고치기·주제 정리', onPress: () => toast.show('위키 고치기·합치기·이름 바꾸기는 컴퓨터에서 해요', { icon: false, duration: 3000 }) }
      ]} />
      {menu ? (
        <PopMenu
          anchor={menu.rect}
          onClose={() => setMenu(null)}
          align="left"
          width={240}
          items={menu.kinds
            ? KINDS.filter((k) => k !== menu.item.kind).map((k) => ({ key: k, label: ro(KIND_NAME[k]), onPress: () => void setKind(menu.item, k) }))
            : [
                ...(menu.item.url ? [{ key: 'detail', label: '자세히', onPress: () => setSheet({ id: menu.item.id }) }] : []),
                { key: 'task', label: menu.item.task_id ? '할 일 열기' : '할 일로 만들기', onPress: () => toTask(menu.item) },
                { key: 'kind', label: '다른 종류로 ›', onPress: () => { const m = menu; setTimeout(() => setMenu({ ...m, kinds: true }), 250) } },
                { key: 'share', label: '공유·복사', onPress: () => void Share.share({ message: menu.item.content }) },
                { key: 'del', label: '삭제', danger: true, onPress: () => void remove(menu.item) }
              ]}
        />
      ) : null}
    </View>
  )
}

function RowWithMenu({ item, today, showTime, onPress, onMenu, onRegister }: { item: CollectItem; today: string; showTime: boolean; onPress: () => void; onMenu: (r: Rect) => void; onRegister: () => void }) {
  const ref = useRef<View>(null)
  return (
    <View ref={ref} collapsable={false}>
      <ItemRow item={item} today={today} showTime={showTime} onPress={onPress} onRegister={onRegister} onLongPress={() => ref.current?.measureInWindow((x, y, width, height) => onMenu({ x: x + 40, y, width: 0, height }))} />
    </View>
  )
}

/** 볼 것 행(62): 동그라미(봤어요) · 사이트 표시 · 제목 · `youtube.com · 오늘` (+ 카톡). 누르면 그 앱·브라우저로 */
function WatchRow({ item, today, onToggle, onMenu }: { item: CollectItem; today: string; onToggle: () => void; onMenu: (r: Rect) => void }) {
  const p = usePalette()
  const ref = useRef<View>(null)
  const on = !!item.seen_at
  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={() => void Linking.openURL(item.url!)}
        onLongPress={() => ref.current?.measureInWindow((x, y, width, height) => onMenu({ x: x + 40, y, width: 0, height }))}
        delayLongPress={350}
        accessibilityLabel={`${item.link_title || item.url} 열기`}
        style={({ pressed }) => [s.wrow, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}
      >
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={on ? '안 본 것으로' : '봤어요'} hitSlop={8} onPress={onToggle} style={[s.circle, { borderColor: on ? p.textQuaternary : p.textTertiary, backgroundColor: on ? p.textQuaternary : 'transparent' }]}>
          {on ? <Check size={11} color="#fff" strokeWidth={3} /> : null}
        </Pressable>
        <SiteMark url={item.url!} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={[FONT.body, { color: on ? p.textTertiary : p.textPrimary }]} numberOfLines={1}>{item.link_title || titleOf(item) || item.url}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[FONT.meta, { color: p.textTertiary, flexShrink: 1 }]} numberOfLines={1}>{domainOf(item.url!)} · {shortDay(sentAt(item), today)}</Text>
            {isKakao(item) ? <ChipView chip={{ text: '카톡', tone: 'line' }} /> : null}
          </View>
        </View>
      </Pressable>
    </View>
  )
}

/** 추가 바(44): 누르면 입력. Enter = 저장(링크만이면 볼 것), 칸은 비우고 계속 입력 */
function AddBar({ onSaved }: { onSaved: (bare: boolean) => void }) {
  const p = usePalette()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const submit = async () => {
    const text = value.trim()
    if (!text) return
    try {
      await saveItem(text)
      setValue('')
      onSaved(isBareLink(text))
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장하지 못했어요.', { error: true }) }
  }
  return (
    <View style={[s.add, { backgroundColor: p.cardBg }]}>
      <Plus size={18} color={editing ? p.accent : p.textTertiary} />
      {editing ? (
        <TextInput
          autoFocus
          value={value}
          onChangeText={setValue}
          placeholder="무엇이든 던져 두세요 — 할 일, 링크, 메모"
          placeholderTextColor={p.textTertiary}
          style={[s.addInput, { color: p.textPrimary }]}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => void submit()}
          onBlur={() => { if (!value.trim()) setEditing(false) }}
          accessibilityLabel="수집함에 넣기"
        />
      ) : (
        <Pressable accessibilityRole="button" style={{ flex: 1, height: 44, justifyContent: 'center' }} onPress={() => setEditing(true)}>
          <Text style={[FONT.body, { color: p.textTertiary }]} numberOfLines={1}>무엇이든 던져 두세요 — 할 일, 링크, 메모</Text>
        </Pressable>
      )}
    </View>
  )
}

/** 위키 주제 목록(C6) — 읽기·되돌리기만, 고치기는 컴퓨터(26 M-C2) */
function WikiTopics({ query, onOpen, onBack }: { query: string; onOpen: (id: string) => void; onBack: () => void }) {
  const p = usePalette()
  const topics = useLiveQuery<Topic>('SELECT w.*, (SELECT COUNT(*) FROM notes n WHERE n.topic_id = w.id) AS count FROM wiki_topics w ORDER BY w.modified_at DESC, w.name').data
  const seen = useSeen()
  useEffect(() => { seedSeen(topics) }, [topics])
  const ql = query.trim().toLowerCase()
  const shown = topics.filter((t) => !ql || t.name.toLowerCase().includes(ql) || t.content.toLowerCase().includes(ql))
  if (!topics.length) {
    return (
      <CollectEmpty icon="book" title="자료가 쌓이면 주제별로 정리해 드려요" sub="공부한 것·알게 된 것을 수집에 던져 두면 AI가 주제 페이지를 만들어요">
        <Pressable accessibilityRole="button" onPress={onBack} style={{ marginTop: 10 }}><Text style={[FONT.sub, { color: p.accentInk, fontWeight: '600' }]}>수집으로 돌아가기</Text></Pressable>
      </CollectEmpty>
    )
  }
  if (!shown.length) return <CollectEmpty icon="book" title={`"${query}"와 맞는 주제가 없어요`} />
  const changed = (iso: string) => (Math.abs(Date.now() - Date.parse(iso)) < 60_000 ? '방금 바뀜' : localDay(iso) === dayKey() ? timeKo(iso) : monthDayKo(iso))
  return (
    <>
      <GroupCard title="주제" count={shown.length} collapsed={false}>
        {shown.map((t) => {
          const fresh = !!seen && t.version > (seen[t.id] ?? 0)
          return (
            <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${t.name}${fresh ? ', 새로 바뀜' : ''}`} onPress={() => onOpen(t.id)} style={({ pressed }) => [s.trow, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
              <View style={{ width: 24, alignItems: 'center' }}><BookOpen size={18} color={p.textTertiary} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={[FONT.body, { color: p.textPrimary }]} numberOfLines={1}>{t.name}</Text>
                <Text style={[FONT.meta, { color: p.textTertiary }]}>자료 {t.count} · {changed(t.modified_at)}</Text>
              </View>
              {fresh ? <View style={[s.newdot, { backgroundColor: p.accent }]} /> : null}
              <ChevronRight size={16} color={p.textQuaternary} />
            </Pressable>
          )
        })}
      </GroupCard>
      <Text style={[FONT.meta, { color: p.textTertiary, paddingHorizontal: 16 + 12, paddingTop: 6, lineHeight: 18 }]}>주제 이름 바꾸기·합치기·고치기는 컴퓨터에서 해요. 휴대폰에서는 읽고, AI가 바꾼 것을 되돌릴 수 있어요.</Text>
    </>
  )
}

const s = StyleSheet.create({
  searchRow: { height: M.navH, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: M.gutter },
  searchBox: { flex: 1, height: 36, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  add: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  addInput: { flex: 1, fontSize: 16, height: 44 },
  band: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center' },
  wrow: { minHeight: M.rowH2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 14, paddingVertical: 9 },
  circle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  trow: { minHeight: M.rowH2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  newdot: { width: 8, height: 8, borderRadius: 4 }
})
