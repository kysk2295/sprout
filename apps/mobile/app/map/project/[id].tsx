// 29 §9.2 프로젝트 화면(2026-10-05 v2 디자인 — 틱틱 목록처럼) + 41 §8 직접 고치기:
// 머리 = 큰 제목(누르면 그 자리에서 고침, 20자, 앞 이모지 유지) · 회색 `N개 중 M개 완료 · 시험 11/23` · 얇은 진행 막대 ·
// 알약 줄 `⚑ 시험 11/23 D-48`(날짜 시트) 또는 `＋ 핵심 날짜` · `팀원 ＋`(칩 ✕, ＋ = 그 자리 입력) · `집중`.
// nav ⋯ = `묶기: 일의 종류 · 태그`(프로젝트마다 동기화 설정) · `다음 단계 같이 짜기` · `태그 페이지`.
// 묶기 태그 = 공용 tagLanes(태그 없음은 맨 끝, 비면 숨김): 묶음 이름 누르기 = 이름 고치기, 길게 = `이름 바꾸기 · 묶음 지우기`, 맨 아래 `＋ 묶음 추가`,
// 줄 나누기 제안(§2.4) 회색 한 줄 + 단추. 묶기 일의 종류 = 예전 그대로(+ 회색 안내).
// 행: 누름 = 상세, 왼쪽 밀기 = 빼기(연결만)·삭제(휴지통), 길게 누름 = 메뉴(묶기 태그면 `다른 묶음으로 ›`), 체크 = 완료.
// 묶음마다 맨 아래 `＋ 할 일 추가`(빠른 입력 인식 + 기간 `10/12~10/18`, 완료 뒤 입력칸이 남음, 묶음 태그를 붙임, 주 리스트 → 기본함).
import { useLiveQuery } from '../../../src/data/rows'
import { eulReul, ro } from '@sprout/schema/josa'
import { findDayRange, mainListOf, NO_LANE, projectTaskInput, takeDayRange, type TagLane } from '@sprout/schema/planView'
import { splitPeople } from '@sprout/schema/projectScore'
import { projectTitle, taskDay, WORK_KINDS, WORK_LABEL, workKind, type WorkKind } from '@sprout/schema/projects'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, FolderMinus, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLists } from '../../../src/data/lists'
import { moveDates, setPriority, trashTasks } from '../../../src/data/tasks'
import { dayKey, nextMonday } from '../../../src/lib/dates'
import { Card } from '../../../src/map/v2/bits'
import { setFocus } from '../../../src/map/v2/focus'
import { KeyDateSheet, type KeyDateTarget } from '../../../src/map/v2/KeyDateSheet'
import { addProjectTask, addToProject, confirmProject, removeFromProject, usePlanData, type ProjectView, type PTaskRow } from '../../../src/map/v2/plan'
import { CardLine, PlanTaskRow } from '../../../src/map/v2/ProjectBoard'
import { addLane, addLanes, linkTeam, moveToLane, removeLane, renameLane, renameProject, saveProjectSettings, unlinkTeammate, type Undo } from '../../../src/map/v2/projectDirect'
import { keyPill, starterAsk, visibleLanes } from '../../../src/map/v2/projectDirectModel'
import { alpha } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { LongPressMenu, type LongPressAction } from '../../../src/ui/LongPressMenu'
import { PopMenu, useAnchor, type MenuItem, type Rect } from '../../../src/ui/Menu'
import { recognizeWith, segments, type Range } from '../../../src/ui/quickAddModel'
import { closeOpenRow, SwipeRow } from '../../../src/ui/SwipeRow'
import { useToast } from '../../../src/ui/Toast'
import { openView } from '../../../src/wiki/WikiIndex'
import { useTagMeta } from '../../../src/wiki/data'

/** '제목'을/를 */
const qEul = (t: string) => `'${t}'${eulReul(t).slice(t.length)}`
const PEOPLE_SQL = "SELECT tt.task_id FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE g.kind = 'person' AND COALESCE(tt.state,'accepted') = 'accepted'"
type Group = { key: string; label: string; kind: WorkKind | null; lane: TagLane | null; items: PTaskRow[] }
const rank = (m: PTaskRow) => (m.status !== 0 ? 2 : taskDay(m) ? 0 : 1)
const byDay = (a: PTaskRow, b: PTaskRow) => rank(a) - rank(b) || (taskDay(a) ?? '').localeCompare(taskDay(b) ?? '')

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const data = usePlanData()
  const people = useLiveQuery<{ task_id: string }>(PEOPLE_SQL).data
  const withPerson = useMemo(() => new Set(people.map((r) => r.task_id)), [people])
  const [adding, setAdding] = useState(false)
  const [newIn, setNewIn] = useState<string | null>(null)
  const [lp, setLp] = useState<{ task: PTaskRow; rect: Rect } | null>(null)
  const [laneMenu, setLaneMenu] = useState<{ task: PTaskRow; rect: Rect } | null>(null)
  const [groupMenu, setGroupMenu] = useState<{ lane: TagLane; rect: Rect } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newLane, setNewLane] = useState(false)
  const [keySheet, setKeySheet] = useState<KeyDateTarget | null>(null)
  const more = useAnchor()
  const rowRefs = useRef(new Map<string, View | null>())
  const headRefs = useRef(new Map<string, View | null>())
  const lists = useLists()
  const tags = useTagMeta()
  const [q, setQ] = useState('')
  const today = dayKey()
  const x = data.projects.find((y) => y.tag.id === id)

  const groups = useMemo((): Group[] => {
    if (!x) return []
    if (x.laneBy === 'tag') {
      const lanes = visibleLanes(x.tagLanes)
      const shown = lanes.length ? lanes : x.tagLanes.lanes.filter((l) => l.id === NO_LANE)
      return shown.map((l) => ({ key: `lane:${l.id}`, label: l.id === NO_LANE ? l.name : `#${l.name}`, kind: null, lane: l, items: [...l.items].sort(byDay) }))
    }
    // 일의 종류별 묶음(순서 고정), 안은 날짜 순(날짜 없는 열린 일은 뒤, 끝낸 일은 맨 뒤)
    const by = new Map<WorkKind, PTaskRow[]>()
    for (const m of x.members) { const k = x.kindOf.get(m.id) ?? workKind(m.title); by.set(k, [...(by.get(k) ?? []), m]) }
    // 묶음이 없으면 `기타` 자리에 ＋ 할 일 추가만(29 §9.2)
    if (!by.size) return [{ key: 'kind:other', label: WORK_LABEL.other, kind: 'other', lane: null, items: [] }]
    return WORK_KINDS.filter((k) => by.has(k)).map((kind) => ({ key: `kind:${kind}`, label: WORK_LABEL[kind], kind, lane: null, items: by.get(kind)!.sort(byDay) }))
  }, [x])
  const outside = useMemo(() => {
    if (!x || !adding) return []
    const mine = new Set(x.members.map((m) => m.id))
    const k = q.trim().toLowerCase()
    return data.openTasks.filter((t) => !mine.has(t.id) && (!k || t.title.toLowerCase().includes(k))).slice(0, 30)
  }, [x, adding, q, data.openTasks])

  if (!data.loaded) return <View style={{ flex: 1, backgroundColor: p.pageBg }} />
  const nav = (
    <View style={[s.nav, { marginTop: insets.top }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="모든 프로젝트로 돌아가기" style={s.back} hitSlop={6}>
        <ChevronLeft size={24} color={p.accent} /><Text style={{ color: p.accent, fontSize: 17 }}>모든 프로젝트</Text>
      </Pressable>
      {x ? (
        <View ref={more.ref} collapsable={false}>
          <Pressable onPress={more.open} accessibilityRole="button" accessibilityLabel="프로젝트 메뉴" hitSlop={10} style={s.moreBtn}><MoreHorizontal size={22} color={p.accent} /></Pressable>
        </View>
      ) : null}
    </View>
  )
  if (!x) {
    return (
      <View style={{ flex: 1, backgroundColor: p.pageBg }}>
        {nav}
        <Text style={{ color: p.textTertiary, textAlign: 'center', marginTop: 80, fontSize: 15 }}>이 프로젝트에 남은 일이 없어요</Text>
      </View>
    )
  }
  const tagged = x.laneBy === 'tag'
  const fail = () => toast.show('저장하지 못했어요. 다시 시도해 주세요.', { error: true })
  const tryDo = async (f: () => Promise<void>) => { try { await f() } catch { fail() } }
  const remove = async (t: PTaskRow) => {
    closeOpenRow()
    const undo = await removeFromProject(t.id, x.tag.id)
    toast.show(`${qEul(t.title)} 프로젝트에서 뺐어요 · 리스트엔 그대로예요`, { undo })
  }
  const trash = async (t: PTaskRow) => {
    closeOpenRow()
    toast.show('휴지통으로 옮겼어요', { undo: await trashTasks([t.id]), duration: 5000 })
  }
  // 31 §12.12.1 · 41 §4.3 새 할 일: 기간(10/12~10/18)을 먼저 떼고 빠른 입력 인식 → 묶음 종류·태그 → 주 리스트(없으면 기본함)·프로젝트 태그 user
  const mainList = mainListOf(x.members, (lid) => lists.find((l) => l.id === lid) ?? null)
  const create = async (raw: string, g: Group) => {
    const range = takeDayRange(raw, today)
    const r = recognizeWith(range ? range.rest : raw, lists.map((l) => ({ id: l.id, name: l.kind === 'inbox' ? '기본함' : l.name })), tags)
    const laneTag = g.lane && g.lane.id !== NO_LANE ? g.lane.id : null
    const input = projectTaskInput({ ...r, due_at: range?.end ?? r.due_at, start_at: range?.start ?? null }, { kind: g.kind, mainList, laneTag })
    if (!input) return false
    try {
      const made = await addProjectTask(input, x.tag.id)
      toast.show(`${qEul(input.title)} 넣었어요`, { undo: made.undo })
      return true
    } catch {
      toast.show('할 일을 저장하지 못했어요. 다시 시도해 주세요.')
      return false
    }
  }
  const onMenu = async (a: LongPressAction) => {
    const t = lp?.task
    if (!t) return
    if (a === 'today' || a === 'tomorrow' || a === 'nextWeek') {
      const date = a === 'today' ? today : a === 'tomorrow' ? dayKey(1) : nextMonday(today)
      toast.show(`${a === 'today' ? '오늘' : a === 'tomorrow' ? '내일' : '다음 주'}로 옮겼어요`, { undo: await moveDates([t.id], date) })
    } else if (a === 'pickDate') router.push({ pathname: '/date', params: { ids: t.id } })
    else if (a === 'move') { const rect = lp.rect; setTimeout(() => setLaneMenu({ task: t, rect }), 250) }
    else if (a === 'out') await remove(t)
    else if (a === 'delete') await trash(t)
    else if (a.startsWith('p')) await setPriority([t.id], Number(a.slice(1)))
  }
  const add = async (t: PTaskRow) => {
    const undo = await addToProject([t.id], x.tag.id)
    toast.show(`${qEul(t.title)} ${x.title}에 넣었어요`, { undo })
  }
  // ── 묶음(태그) ──
  const laneLabel = (laneId: string) => { const l = x.tagLanes.lanes.find((y) => y.id === laneId); return l ? `#${l.name}` : '' }
  const moveTask = (t: PTaskRow, to: string) => tryDo(async () => {
    const from = x.tagLanes.laneOf.get(t.id) ?? NO_LANE
    const undo = await moveToLane([{ id: t.id, tags: x.tagLanes.tagsOf.get(t.id) ?? [], from }], to)
    toast.show(to === NO_LANE ? `'${laneLabel(from)}' 태그를 뗐어요` : `'${laneLabel(to)}' 태그를 붙였어요`, { undo })
  })
  const laneItems: MenuItem[] = laneMenu ? [
    ...x.tagLanes.lanes.filter((l) => l.id !== NO_LANE).map((l) => ({ key: l.id, label: `#${l.name}`, checked: x.tagLanes.laneOf.get(laneMenu.task.id) === l.id, onPress: () => void moveTask(laneMenu.task, l.id) })),
    { key: NO_LANE, label: '태그 없음으로', checked: x.tagLanes.laneOf.get(laneMenu.task.id) === NO_LANE, onPress: () => void moveTask(laneMenu.task, NO_LANE) }
  ] : []
  const makeLane = async (raw: string) => {
    const r = await addLane(x.tag.id, raw)
    if (!r) return false
    toast.show(`'#${r.name}' 줄을 만들었어요`, { undo: r.undo })
    setNewLane(false)
    setNewIn(`lane:${r.tagId}`) // 초점이 그 묶음의 ＋ 할 일 추가로
    return true
  }
  const doRenameLane = (lane: TagLane, raw: string) => tryDo(async () => {
    setRenaming(null)
    const r = await renameLane(lane.id, raw)
    if (r.result === 'conflict') toast.show(`'#${r.name}' 태그가 이미 있어요 · 합치기는 컴퓨터 앱에서 해요`)
    else if (r.result === 'ok') toast.show(`'#${r.name}'${ro(r.name).slice(r.name.length)} 바꿨어요`, { undo: r.undo })
  })
  const dropLane = (lane: TagLane) => tryDo(async () => {
    const r = await removeLane(x.tag.id, lane.id, x.members.map((m) => m.id))
    toast.show(`'#${lane.name}' 줄을 지웠어요 · 할 일 ${r.n}개는 태그 없음으로 · 태그는 남아요`, { undo: r.undo, duration: 5000 })
  })
  const setBy = (by: 'tag' | 'kind') => tryDo(async () => { if (by !== x.laneBy) await saveProjectSettings(x.tag.id, { by }) })
  const ask = starterAsk(x)
  const seen = () => saveProjectSettings(x.tag.id, { starterSeen: true })
  const starterYes = () => tryDo(async () => {
    if (!ask) return
    const u1 = await seen()
    if (ask.lanes) {
      const u2 = await addLanes(x.tag.id, ask.lanes)
      toast.show(`줄 ${ask.lanes.length}개를 만들었어요`, { undo: async () => { await u2(); await u1() } })
    } else setNewLane(true)
  })
  const menuItems: MenuItem[] = [
    { key: 'kind', label: '묶기: 일의 종류', checked: !tagged, onPress: () => void setBy('kind') },
    { key: 'tag', label: '묶기: 태그', checked: tagged, onPress: () => void setBy('tag') },
    { key: 'plan', label: '다음 단계 같이 짜기', onPress: () => router.push({ pathname: '/plan-chat', params: { project: x.tag.id } }) },
    { key: 'page', label: '태그 페이지', onPress: () => openView(router, `tag:${x.tag.id}`) }
  ]
  const ratio = x.members.length ? x.done / x.members.length : 0

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      {nav}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" onScrollBeginDrag={closeOpenRow}>
        <View style={s.head}>
          <TitleEdit x={x} onSave={(v) => tryDo(async () => { const u = await renameProject(x.tag.id, x.tag.name, v); if (u) toast.show('이름을 바꿨어요', { undo: u }) })} />
          <CardLine x={x} today={today} extra={x.auto ? ' · 자동으로 묶었어요' : ''} />
          <View style={[s.bar, { backgroundColor: p.bgSelected }]}><View style={[s.barIn, { width: `${ratio * 100}%`, backgroundColor: p.accent }]} /></View>
          <HeadPills x={x} today={today} onKey={() => setKeySheet({ tagId: x.tag.id, name: x.title, keyTaskId: x.keyTask?.id ?? null, day: x.keyTask ? x.deadline?.day ?? null : null, word: x.keyTask ? x.deadline?.word ?? null : null })}
            onTeam={(names) => tryDo(async () => { const u = await linkTeam(x.tag.id, names); toast.show(`팀원 ${names.length}명을 이었어요`, { undo: u }) })}
            onUnteam={(pid, name) => tryDo(async () => toast.show(`${qEul(name)} 팀원에서 뺐어요 · 태그는 남아요`, { undo: await unlinkTeammate(x.tag.id, pid) }))}
            onOpenPerson={(pid) => openView(router, `tag:${pid}`)}
            onFocus={() => tryDo(async () => { const u = await setFocus(x.focus ? null : x.tag.id); toast.show(x.focus ? '집중을 껐어요' : `지금 '${x.title}'에 집중해요 · 빠른 입력에 붙여 둘게요`, { undo: u }) })} />
        </View>

        <View style={s.notice}>
          <Text style={{ flex: 1, color: p.textSecondary, fontSize: 13.5, lineHeight: 19 }}>
            {x.confirmed ? `관련 일 ${x.members.length}개` : `관련 일 ${x.members.length}개를 모았어요. 빠진 게 있으면 더 넣어요.`}
          </Text>
          {!x.confirmed ? <Pressable onPress={() => { void confirmProject(x.tag.id, x.members.length).catch(fail); setAdding(false) }} hitSlop={8} accessibilityRole="button"><Text style={{ color: p.textSecondary, fontSize: 14 }}>빠진 거 없어</Text></Pressable> : null}
          <Pressable onPress={() => { setAdding((v) => !v); setQ('') }} hitSlop={8} accessibilityRole="button"><Text style={{ color: p.accent, fontSize: 14, fontWeight: '500' }}>{adding ? '닫기' : '더 넣기'}</Text></Pressable>
        </View>
        {adding ? (
          <Card>
            <View style={[s.search, { borderBottomColor: p.borderDivider }]}>
              <Search size={16} color={p.textTertiary} />
              <TextInput value={q} onChangeText={setQ} autoFocus placeholder="넣을 할 일 찾기" placeholderTextColor={p.textTertiary} style={{ flex: 1, fontSize: 15, color: p.textPrimary }} accessibilityLabel="넣을 할 일 찾기" />
            </View>
            {outside.map((t, i) => (
              <Pressable key={t.id} onPress={() => void add(t)} accessibilityRole="button" style={({ pressed }) => [s.pick, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: p.textPrimary, fontSize: 15 }} numberOfLines={1}>{t.title}</Text>
                  <Text style={{ color: p.textTertiary, fontSize: 12 }} numberOfLines={1}>{data.listName(t.list_id)}</Text>
                </View>
                <Text style={{ color: p.accent, fontSize: 14 }}>넣기</Text>
              </Pressable>
            ))}
            {!outside.length ? <Text style={{ color: p.textTertiary, padding: 14 }}>넣을 할 일이 없어요</Text> : null}
          </Card>
        ) : null}

        {ask ? (
          <View style={s.starter}>
            <Text style={{ flex: 1, color: p.textSecondary, fontSize: 13.5 }}>{ask.text}</Text>
            <Pressable onPress={() => void starterYes()} accessibilityRole="button" hitSlop={6}><Text style={{ color: p.accent, fontSize: 14, fontWeight: '600' }}>{ask.lanes ? '그렇게' : `＋ ${ask.add} 추가`}</Text></Pressable>
            <Pressable onPress={() => void tryDo(async () => { await seen() })} accessibilityRole="button" hitSlop={6}><Text style={{ color: p.textTertiary, fontSize: 14 }}>괜찮아요</Text></Pressable>
            <Pressable onPress={() => void tryDo(async () => { await seen() })} accessibilityRole="button" accessibilityLabel="제안 닫기" hitSlop={8}><X size={15} color={p.textTertiary} /></Pressable>
          </View>
        ) : null}

        {groups.map((g) => {
          const lane = g.lane
          const editable = !!lane && lane.id !== NO_LANE
          return (
            <View key={g.key}>
              <View ref={(v) => { headRefs.current.set(g.key, v) }} collapsable={false} style={s.ghead}>
                {editable && renaming === lane.id ? (
                  <InlineInput initial={lane.name} prefix="#" label="묶음 이름" onDone={(v) => { if (v === null) setRenaming(null); else void doRenameLane(lane, v) }} />
                ) : (
                  <Pressable disabled={!editable} onPress={() => editable && setRenaming(lane.id)} delayLongPress={350}
                    onLongPress={() => editable && headRefs.current.get(g.key)?.measureInWindow((rx, ry, width, height) => setGroupMenu({ lane, rect: { x: rx, y: ry, width, height } }))}
                    accessibilityRole={editable ? 'button' : undefined} accessibilityHint={editable ? '누르면 이름 고치기, 길게 누르면 메뉴' : undefined} style={s.gname}>
                    <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600' }}>{g.label}</Text>
                    <Text style={{ color: p.textTertiary, fontSize: 13 }}>{g.items.length}</Text>
                  </Pressable>
                )}
              </View>
              <Card>
                {g.items.map((t, i) => {
                  const extra = tagged ? x.tagLanes.more.get(t.id) : undefined
                  return (
                    <SwipeRow key={t.id} right={[
                      { key: 'out', color: p.textTertiary, icon: <FolderMinus size={20} color="#fff" />, label: '프로젝트에서 빼기', onPress: () => void remove(t) },
                      { key: 'del', color: p.swipeDel, icon: <Trash2 size={20} color="#fff" />, label: '삭제', onPress: () => void trash(t) }
                    ]}>
                      <View ref={(v) => { rowRefs.current.set(t.id, v) }} collapsable={false} style={{ backgroundColor: p.cardBg }}>
                        <PlanTaskRow task={t} today={today} first={i === 0} right={extra ? `+${extra}` : withPerson.has(t.id) ? '사람' : undefined}
                          onLongPress={() => rowRefs.current.get(t.id)?.measureInWindow((rx, ry, width, height) => setLp({ task: t, rect: { x: rx, y: ry, width, height } }))} />
                      </View>
                    </SwipeRow>
                  )
                })}
                <AddRow first={!g.items.length} open={newIn === g.key} onOpen={() => setNewIn(g.key)} onClose={() => setNewIn((k) => (k === g.key ? null : k))}
                  placeholder={lane ? (lane.id === NO_LANE ? "새 할 일 · '10/12~10/18'처럼 기간도" : `${g.label}에 새 할 일 · '10/20'처럼 날짜도`) : `${g.label}에 새 할 일 · '내일'처럼 날짜도`}
                  lists={lists} tags={tags} today={today} onSubmit={(raw) => create(raw, g)} />
              </Card>
            </View>
          )
        })}
        {tagged ? (
          newLane ? (
            <View style={[s.newLane, { backgroundColor: p.cardBg }]}>
              <InlineInput initial="" prefix="#" label="새 묶음 이름" placeholder="예: 금융상품" onDone={(v) => { if (v === null || !v.trim()) setNewLane(false); else void makeLane(v).catch(fail) }} />
            </View>
          ) : (
            <Pressable onPress={() => setNewLane(true)} accessibilityRole="button" style={({ pressed }) => [s.addLane, pressed && { backgroundColor: p.bgSelected }]}>
              <Plus size={18} color={p.accent} /><Text style={{ color: p.accent, fontSize: 15, fontWeight: '500' }}>묶음 추가</Text>
            </Pressable>
          )
        ) : (
          <Text style={[s.kindNote, { color: p.textTertiary }]}>일의 종류 묶음은 정해져 있어요. 묶음을 직접 만들려면 묶기: 태그로 바꿔요.</Text>
        )}
        {!x.members.length ? <Text style={{ color: p.textTertiary, fontSize: 14, textAlign: 'center', marginTop: 8 }}>이 프로젝트에 남은 일이 없어요</Text> : null}
        <Text style={{ color: p.textQuaternary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>왼쪽으로 밀면 빼기·삭제, 길게 누르면 메뉴</Text>

        {x.people.length ? <Related title="관련 사람" items={x.people.map((pp) => ({ key: pp.id, label: pp.name, sub: pp.label, onPress: () => openView(router, `tag:${pp.id}`) }))} /> : null}
        {x.memos.length ? <Related title="관련 메모" items={x.memos.map((m) => ({ key: m.id, label: m.title, onPress: () => router.push(m.kind === 'topic' ? `/collect/wiki/${m.id}` : '/collect') }))} /> : null}
        {x.lists.length ? <Related title={`관련 리스트 · ${x.lists.length}곳`} items={x.lists.map((l) => ({ key: l.id, label: l.name, sub: `${l.count}`, onPress: () => router.push(`/map/list/${l.id}`) }))} /> : null}
      </ScrollView>
      <LongPressMenu rect={lp?.rect ?? null} pinned={false} priority={lp?.task.priority ?? 0} only={tagged ? ['move', 'out', 'delete'] : ['out', 'delete']} labels={{ move: '다른 묶음으로 ›' }}
        onClose={() => setLp(null)} onAction={(a) => void onMenu(a)}
        row={lp ? <PlanTaskRow task={lp.task} today={today} first /> : null} />
      <PopMenu anchor={laneMenu?.rect ?? null} onClose={() => setLaneMenu(null)} items={laneItems} width={240} />
      <PopMenu anchor={groupMenu?.rect ?? null} onClose={() => setGroupMenu(null)} align="left" width={200} items={groupMenu ? [
        { key: 'rename', label: '이름 바꾸기', onPress: () => setRenaming(groupMenu.lane.id) },
        { key: 'drop', label: '묶음 지우기', danger: true, onPress: () => void dropLane(groupMenu.lane) }
      ] : []} />
      <PopMenu anchor={more.rect} onClose={more.close} items={menuItems} width={230} />
      <KeyDateSheet target={keySheet} onClose={() => setKeySheet(null)} />
    </View>
  )
}

/** 큰 제목: 누르면 그 자리에서 고친다(완료·밖 누르기 = 저장, 20자). 앞 이모지는 tags.name에 그대로 남는다 */
function TitleEdit({ x, onSave }: { x: ProjectView; onSave: (v: string) => void }) {
  const p = usePalette()
  const [edit, setEdit] = useState<string | null>(null)
  const done = useRef(false)
  const title = projectTitle(x.tag.name)
  if (edit === null) {
    return (
      <Pressable onPress={() => { done.current = false; setEdit(title) }} accessibilityRole="button" accessibilityLabel={`${title}, 누르면 이름 고치기`}>
        <Text style={[s.title, { color: p.textPrimary }]} numberOfLines={2}>{x.title}</Text>
      </Pressable>
    )
  }
  const save = () => { if (done.current) return; done.current = true; const v = edit.trim(); setEdit(null); if (v && v !== title) onSave(v) }
  return (
    <TextInput value={edit} onChangeText={setEdit} autoFocus maxLength={20} submitBehavior="blurAndSubmit" returnKeyType="done" onSubmitEditing={save} onBlur={save}
      style={[s.title, s.titleIn, { color: p.textPrimary, borderColor: p.accent }]} accessibilityLabel="프로젝트 이름" />
  )
}

/** 머리 알약 줄: ⚑ 핵심 날짜 · 팀원 · 집중 */
function HeadPills({ x, today, onKey, onTeam, onUnteam, onOpenPerson, onFocus }: {
  x: ProjectView; today: string; onKey: () => void; onTeam: (names: string[]) => void; onUnteam: (id: string, name: string) => void; onOpenPerson: (id: string) => void; onFocus: () => void
}) {
  const p = usePalette()
  const [typing, setTyping] = useState(false)
  const pill = keyPill(x.deadline, !!x.keyTask, today)
  const gray = { backgroundColor: p.bgSelected }
  return (
    <View style={s.pills}>
      <Pressable onPress={onKey} accessibilityRole="button" accessibilityLabel={pill ? `핵심 날짜 ${pill.text} ${pill.dday}` : '핵심 날짜 정하기'} style={[s.pill, gray]}>
        {pill ? (
          <Text style={{ color: pill.hot ? p.overdue : p.textSecondary, fontSize: 13 }}>{pill.text} <Text style={{ fontWeight: '600' }}>{pill.dday}</Text></Text>
        ) : <Text style={{ color: p.textSecondary, fontSize: 13 }}>＋ 핵심 날짜</Text>}
      </Pressable>
      {x.team.map((m) => (
        <View key={m.id} style={[s.pill, gray, { paddingRight: 6 }]}>
          <Pressable onPress={() => onOpenPerson(m.id)} accessibilityRole="button" hitSlop={4}><Text style={{ color: p.textSecondary, fontSize: 13 }}>{m.name}</Text></Pressable>
          <Pressable onPress={() => onUnteam(m.id, m.name)} accessibilityRole="button" accessibilityLabel={`${m.name} 팀원에서 빼기`} hitSlop={8} style={{ marginLeft: 4 }}><X size={13} color={p.textTertiary} /></Pressable>
        </View>
      ))}
      {typing ? (
        <View style={[s.pill, gray, { minWidth: 120 }]}>
          <InlineInput initial="" label="팀원 이름" placeholder="예: 민수, 지은" small onDone={(v) => { setTyping(false); const names = v ? splitPeople(v) : []; if (names.length) onTeam(names) }} />
        </View>
      ) : (
        <Pressable onPress={() => setTyping(true)} accessibilityRole="button" accessibilityLabel="팀원 더하기" style={[s.pill, gray]}>
          <Text style={{ color: p.textSecondary, fontSize: 13 }}>{x.team.length ? '＋' : '팀원 ＋'}</Text>
        </Pressable>
      )}
      <Pressable onPress={onFocus} accessibilityRole="button" accessibilityState={{ selected: x.focus }} style={[s.pill, { backgroundColor: x.focus ? p.accent : p.bgSelected }]}>
        <Text style={{ color: x.focus ? '#fff' : p.textSecondary, fontSize: 13, fontWeight: x.focus ? '600' : '400' }}>집중</Text>
      </Pressable>
    </View>
  )
}

/** 그 자리 입력 한 칸: 완료 = 그 글, 빈 채로 벗어나기 = null */
function InlineInput({ initial, prefix, label, placeholder, small, onDone }: { initial: string; prefix?: string; label: string; placeholder?: string; small?: boolean; onDone: (v: string | null) => void }) {
  const p = usePalette()
  const [v, setV] = useState(initial)
  const done = useRef(false)
  const finish = (val: string | null) => { if (done.current) return; done.current = true; onDone(val) }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
      {prefix ? <Text style={{ color: p.textTertiary, fontSize: small ? 13 : 15 }}>{prefix}</Text> : null}
      <TextInput value={v} onChangeText={setV} autoFocus placeholder={placeholder} placeholderTextColor={p.textQuaternary} maxLength={30}
        submitBehavior="blurAndSubmit" returnKeyType="done" onSubmitEditing={() => finish(v.trim() ? v : null)} onBlur={() => finish(v.trim() && v !== initial ? v : null)}
        style={{ flex: 1, fontSize: small ? 13 : 15, color: p.textPrimary, paddingVertical: 0 }} accessibilityLabel={label} />
    </View>
  )
}

/** 묶음 맨 아래 `＋ 할 일 추가`(31 §12.12.1): 누르면 입력칸, 완료 = 만들고 비운 채 남음, 빈 채로 완료·벗어나기 = 닫기. 인식 글자(기간 포함)는 강조 */
function AddRow({ first, open, onOpen, onClose, placeholder, lists, tags, today, onSubmit }: {
  first: boolean; open: boolean; onOpen: () => void; onClose: () => void; placeholder: string; today: string
  lists: { id: string; name: string; kind: string | null }[]; tags: { id: string; name: string }[]; onSubmit: (raw: string) => Promise<boolean>
}) {
  const p = usePalette()
  const [text, setText] = useState('')
  const busy = useRef(false)
  const ranges = useMemo((): Range[] => {
    const r = recognizeWith(text, lists.map((l) => ({ id: l.id, name: l.kind === 'inbox' ? '기본함' : l.name })), tags)
    const d = takeDayRange(text, today) ? findDayRange(text, today) : null
    if (!d) return r.ranges
    const hit = { start: d.index, end: d.index + d.token.length, text: d.token }
    return [...r.ranges.filter((x) => x.end <= hit.start || x.start >= hit.end), hit].sort((a, b) => a.start - b.start)
  }, [text, lists, tags, today])
  const border = !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }
  if (!open) {
    return (
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="할 일 추가" style={({ pressed }) => [s.add, border, pressed && { backgroundColor: p.bgSelected }]}>
        <Plus size={18} color={p.textTertiary} /><Text style={{ color: p.textTertiary, fontSize: 15 }}>할 일 추가</Text>
      </Pressable>
    )
  }
  const send = async () => {
    const v = text.trim()
    if (!v) { onClose(); return }
    if (busy.current) return
    busy.current = true
    try { if (await onSubmit(v)) setText('') } finally { busy.current = false }
  }
  return (
    <View style={[s.add, border]}>
      <Plus size={18} color={p.accent} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <TextInput value={text} onChangeText={setText} autoFocus placeholder={placeholder} placeholderTextColor={p.textQuaternary}
          submitBehavior="submit" returnKeyType="done" onSubmitEditing={() => void send()} onBlur={() => { if (!text.trim()) onClose() }}
          style={{ fontSize: 15, color: p.textPrimary, paddingVertical: 0 }} accessibilityLabel="새 할 일 제목" />
        {ranges.length ? (
          <Text style={[StyleSheet.absoluteFill, { fontSize: 15, color: 'transparent' }]} pointerEvents="none" accessible={false}>
            {segments(text, ranges).map((g, i) => <Text key={i} style={g.hl ? { backgroundColor: alpha(p.accent, p.dark ? 0.3 : 0.16) } : undefined}>{g.text}</Text>)}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function Related({ title, items }: { title: string; items: { key: string; label: string; sub?: string; onPress: () => void }[] }) {
  const p = usePalette()
  return (
    <>
      <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 }}>{title}</Text>
      <Card>
        {items.map((it, i) => (
          <Pressable key={it.key} onPress={it.onPress} accessibilityRole="button" style={({ pressed }) => [s.pick, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
            <Text style={{ flex: 1, color: p.textPrimary, fontSize: 15 }} numberOfLines={1}>{it.label}</Text>
            {it.sub ? <Text style={{ color: p.textTertiary, fontSize: 12.5 }}>{it.sub}</Text> : null}
            <ChevronRight size={15} color={p.textQuaternary} />
          </Pressable>
        ))}
      </Card>
    </>
  )
}

const s = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center' },
  moreBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  head: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  titleIn: { borderWidth: 2, borderRadius: 6, paddingHorizontal: 4, marginHorizontal: -6, paddingVertical: 0 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', height: 30, borderRadius: 15, paddingHorizontal: 11 },
  bar: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  barIn: { height: 3, borderRadius: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingBottom: 10 },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  add: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  pick: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 6 },
  ghead: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  gname: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newLane: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, minHeight: 46, paddingHorizontal: 14, justifyContent: 'center' },
  addLane: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  kindNote: { fontSize: 12, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 8, lineHeight: 17 }
})
