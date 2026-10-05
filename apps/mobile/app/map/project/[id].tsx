// 29 §9.2 프로젝트 화면(2026-10-05 v2 디자인 — 틱틱 목록처럼): 제목 · 회색 `N개 중 M개 완료 · 제출 10/10` · 얇은 진행 막대 ·
// 회색 한 줄 `관련 일 N개를 모았어요` + `빠진 거 없어`·`더 넣기`(글자 단추) → 일의 종류별 묶음(회색 묶음 이름, 안은 날짜 순 할 일 행: 체크 · 제목 · 날짜, 끝낸 일은 흐리게)
// → 관련 사람·메모·리스트 → 아래 `다음 단계 같이 짜기`. 행: 누름 = 상세, 왼쪽 밀기 = 빼기(태그만), 체크 = 완료.
import { useQuery } from '@powersync/react-native'
import { eulReul } from '@sprout/schema/josa'
import { taskDay, WORK_KINDS, WORK_LABEL, workKind, type WorkKind } from '@sprout/schema/projects'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dayKey } from '../../../src/lib/dates'
import { Card } from '../../../src/map/v2/bits'
import { addToProject, confirmProject, removeFromProject, usePlanData, type PTaskRow } from '../../../src/map/v2/plan'
import { CardLine, PlanTaskRow } from '../../../src/map/v2/ProjectBoard'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { closeOpenRow, SwipeRow } from '../../../src/ui/SwipeRow'
import { useToast } from '../../../src/ui/Toast'
import { openView } from '../../../src/wiki/WikiIndex'

/** '제목'을/를 */
const qEul = (t: string) => `'${t}'${eulReul(t).slice(t.length)}`
const PEOPLE_SQL = "SELECT tt.task_id FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE g.kind = 'person' AND COALESCE(tt.state,'accepted') = 'accepted'"

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const data = usePlanData()
  const people = useQuery<{ task_id: string }>(PEOPLE_SQL).data
  const withPerson = useMemo(() => new Set(people.map((r) => r.task_id)), [people])
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const today = dayKey()
  const x = data.projects.find((y) => y.tag.id === id)

  // 일의 종류별 묶음(순서 고정), 안은 날짜 순(날짜 없는 열린 일은 뒤, 끝낸 일은 맨 뒤)
  const groups = useMemo(() => {
    if (!x) return [] as { kind: WorkKind; items: PTaskRow[] }[]
    const by = new Map<WorkKind, PTaskRow[]>()
    for (const m of x.members) { const k = x.kindOf.get(m.id) ?? workKind(m.title); by.set(k, [...(by.get(k) ?? []), m]) }
    const rank = (m: PTaskRow) => (m.status !== 0 ? 2 : taskDay(m) ? 0 : 1)
    return WORK_KINDS.filter((k) => by.has(k)).map((kind) => ({
      kind, items: by.get(kind)!.sort((a, b) => rank(a) - rank(b) || (taskDay(a) ?? '').localeCompare(taskDay(b) ?? ''))
    }))
  }, [x])
  const outside = useMemo(() => {
    if (!x || !adding) return []
    const mine = new Set(x.members.map((m) => m.id))
    const k = q.trim().toLowerCase()
    return data.openTasks.filter((t) => !mine.has(t.id) && (!k || t.title.toLowerCase().includes(k))).slice(0, 30)
  }, [x, adding, q, data.openTasks])

  if (!data.loaded) return <View style={{ flex: 1, backgroundColor: p.pageBg }} />
  const back = (
    <View style={[s.nav, { marginTop: insets.top }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="모든 프로젝트로 돌아가기" style={s.back} hitSlop={6}>
        <ChevronLeft size={24} color={p.accent} /><Text style={{ color: p.accent, fontSize: 17 }}>모든 프로젝트</Text>
      </Pressable>
    </View>
  )
  if (!x || !x.members.length) {
    return (
      <View style={{ flex: 1, backgroundColor: p.pageBg }}>
        {back}
        <Text style={{ color: p.textTertiary, textAlign: 'center', marginTop: 80, fontSize: 15 }}>이 프로젝트에 남은 일이 없어요</Text>
      </View>
    )
  }
  const remove = async (t: PTaskRow) => {
    closeOpenRow()
    const undo = await removeFromProject(t.id, x.tag.id)
    toast.show(`${qEul(t.title)} 프로젝트에서 뺐어요`, { undo })
  }
  const add = async (t: PTaskRow) => {
    const undo = await addToProject([t.id], x.tag.id)
    toast.show(`${qEul(t.title)} ${x.title}에 넣었어요`, { undo })
  }
  const ratio = x.members.length ? x.done / x.members.length : 0

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      {back}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }} keyboardShouldPersistTaps="handled" onScrollBeginDrag={closeOpenRow}>
        <View style={s.head}>
          <Text style={{ color: p.textPrimary, fontSize: 26, fontWeight: '700' }} numberOfLines={2}>{x.title}</Text>
          <CardLine x={x} today={today} extra={x.auto ? ' · 자동으로 묶었어요' : ''} />
          <View style={[s.bar, { backgroundColor: p.bgSelected }]}><View style={[s.barIn, { width: `${ratio * 100}%`, backgroundColor: p.accent }]} /></View>
        </View>

        <View style={s.notice}>
          <Text style={{ flex: 1, color: p.textSecondary, fontSize: 13.5, lineHeight: 19 }}>
            {x.confirmed ? `관련 일 ${x.members.length}개` : `관련 일 ${x.members.length}개를 모았어요. 빠진 게 있으면 더 넣어요.`}
          </Text>
          {!x.confirmed ? <Pressable onPress={() => { confirmProject(x.tag.id, x.members.length); setAdding(false) }} hitSlop={8} accessibilityRole="button"><Text style={{ color: p.textSecondary, fontSize: 14 }}>빠진 거 없어</Text></Pressable> : null}
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

        {groups.map((g) => (
          <View key={g.kind}>
            <View style={s.ghead}>
              <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600' }}>{WORK_LABEL[g.kind]}</Text>
              <Text style={{ color: p.textTertiary, fontSize: 13 }}>{g.items.length}</Text>
            </View>
            <Card>
              {g.items.map((t, i) => (
                <SwipeRow key={t.id} right={[{ key: 'out', color: p.swipeDel, icon: <X size={20} color="#fff" />, label: '프로젝트에서 빼기', onPress: () => void remove(t) }]}>
                  <View style={{ backgroundColor: p.cardBg }}>
                    <PlanTaskRow task={t} today={today} first={i === 0} right={withPerson.has(t.id) ? '사람' : undefined} />
                  </View>
                </SwipeRow>
              ))}
            </Card>
          </View>
        ))}
        <Text style={{ color: p.textQuaternary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>왼쪽으로 밀면 프로젝트에서 빼요</Text>

        {x.people.length ? <Related title="관련 사람" items={x.people.map((pp) => ({ key: pp.id, label: pp.name, sub: pp.label, onPress: () => openView(router, `tag:${pp.id}`) }))} /> : null}
        {x.memos.length ? <Related title="관련 메모" items={x.memos.map((m) => ({ key: m.id, label: m.title, onPress: () => router.push(m.kind === 'topic' ? `/collect/wiki/${m.id}` : '/collect') }))} /> : null}
        {x.lists.length ? <Related title={`관련 리스트 · ${x.lists.length}곳`} items={x.lists.map((l) => ({ key: l.id, label: l.name, sub: `${l.count}`, onPress: () => router.push(`/map/list/${l.id}`) }))} /> : null}
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: insets.bottom + 10, backgroundColor: p.pageBg }]}>
        <Pressable onPress={() => router.push({ pathname: '/plan-chat', params: { project: x.tag.id } })} accessibilityRole="button" style={[s.cta, { backgroundColor: p.accent }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>다음 단계 같이 짜기</Text>
        </Pressable>
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
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center' },
  head: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  bar: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  barIn: { height: 3, borderRadius: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  pick: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 6 },
  ghead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 8 },
  cta: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }
})
