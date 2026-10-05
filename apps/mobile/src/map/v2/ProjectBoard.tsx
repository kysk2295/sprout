// 29 §9.2 프로젝트 보드(작업 지도 첫 화면, 2026-10-05 v2 디자인 — 틱틱 목록처럼 차분하게: 회색 + 강조색 하나):
// 지금 할 일 카드 → 회색 한 줄 요약 → 프로젝트 카드(① 아이콘·이름·자동·› ② `N개 중 M개 완료 · 제출 10/10` ③ 얇은 진행 막대 ④ 다음 할 일 = 진짜 할 일 행) → 끝난 프로젝트(접힘) → ＋ 같이 계획 짜기.
// 계산은 공용 @sprout/schema/planView. 휴대폰은 프로젝트를 만들거나 붙이는 자동 패스를 돌리지 않는다(데스크톱이 만든 태그를 보여 주기만).
import { useRouter } from 'expo-router'
import { ChevronRight, FolderClosed, Plus } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { completeTasks } from '../../data/tasks'
import { rowDateLabel } from '../../lib/dates'
import { usePalette } from '../../theme/ThemeProvider'
import { Checkbox } from '../../ui/Checkbox'
import { PopMenu, type Rect } from '../../ui/Menu'
import { useToast } from '../../ui/Toast'
import { openView } from '../../wiki/WikiIndex'
import { Buddy, Card, md } from './bits'
import { projectCardLine } from '@sprout/schema/planView'
import type { PlanData, ProjectView, PTaskRow } from './plan'

const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** 카드·프로젝트 화면 둘째 줄 `14개 중 5개 완료 · 제출 10/10` — 공용 projectCardLine(데스크톱과 같은 글). 마감은 지났거나 3일 안이면 빨강 */
export function CardLine({ x, today, extra }: { x: ProjectView; today: string; extra?: string }) {
  const p = usePalette()
  const l = projectCardLine(x, today)
  return (
    <Text style={{ color: p.textTertiary, fontSize: 13 }} numberOfLines={1}>
      {`${x.members.length}개 중 ${x.done}개 완료`}
      {l.deadline ? <Text style={l.hot ? { color: p.overdue } : undefined}>{` · ${l.deadline}`}</Text> : null}
      {extra ?? ''}
    </Text>
  )
}

export function ProjectBoard({ data }: { data: PlanData }) {
  const p = usePalette()
  const router = useRouter()
  const [showDone, setShowDone] = useState(false)
  if (!data.loaded) return null
  const today = todayKey()
  const live = data.projects.filter((x) => !x.finished)
  const done = data.projects.filter((x) => x.finished)
  const together = () => router.push({ pathname: '/plan-chat', params: { make: '1' } })
  if (!data.projects.length) {
    return (
      <>
        <NowCard data={data} />
        <View style={{ alignItems: 'center', paddingTop: 30, paddingHorizontal: 32, gap: 10 }}>
          <Buddy size={96} still />
          <Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 6 }}>아직 묶인 프로젝트가 없어요</Text>
          <Text style={{ color: p.textTertiary, fontSize: 13.5, textAlign: 'center', lineHeight: 19 }}>컴퓨터 앱이 관련된 일을 알아서 묶어 줘요. 큰 일 하나로 바로 시작할 수도 있어요.</Text>
          <Pressable onPress={together} accessibilityRole="button" style={[s.primary, { backgroundColor: p.accent }]}><Text style={s.primaryText}>같이 계획 짜기</Text></Pressable>
        </View>
      </>
    )
  }
  const near = live.filter((x) => x.deadline && x.deadline.day >= today).sort((a, b) => a.deadline!.day.localeCompare(b.deadline!.day))[0]
  return (
    <>
      <NowCard data={data} />
      <Text style={[s.summary, { color: p.textTertiary }]}>
        프로젝트 {data.projects.length}개{near ? ` · 가장 가까운 마감: ${near.title} ${near.deadline!.word} ${md(near.deadline!.day)}` : ''}
      </Text>
      {live.map((x) => <ProjectCard key={x.tag.id} x={x} today={today} />)}
      {done.length ? (
        <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button" style={s.doneHead}>
          <Text style={{ color: p.textSecondary, fontSize: 14, fontWeight: '600' }}>끝난 프로젝트 {done.length}</Text>
          <ChevronRight size={15} color={p.textTertiary} style={{ transform: [{ rotate: showDone ? '90deg' : '0deg' }] }} />
        </Pressable>
      ) : null}
      {showDone ? done.map((x) => <ProjectCard key={x.tag.id} x={x} today={today} />) : null}
      <Pressable onPress={together} accessibilityRole="button" accessibilityHint="새 큰 일을 말해 주면 프로젝트로 만들고 단계도 나눠 줘요" style={({ pressed }) => [s.together, { backgroundColor: pressed ? p.bgSelected : 'transparent' }]}>
        <Plus size={18} color={p.accent} />
        <Text style={{ color: p.accent, fontSize: 15, fontWeight: '500' }}>같이 계획 짜기</Text>
      </Pressable>
    </>
  )
}

/** 할 일 행(체크 · 제목 · 날짜) — 체크 = 완료(XP 규칙 그대로, 토스트 되돌리기) */
export function PlanTaskRow({ task, today, first, right }: { task: PTaskRow; today: string; first?: boolean; right?: string }) {
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const [leaving, setLeaving] = useState(false)
  const done = task.status !== 0 || leaving
  const date = rowDateLabel({ start_at: task.start_at ?? null, due_at: task.due_at ?? null }, today)
  return (
    <Pressable onPress={() => router.push(`/task/${task.id}`)} accessibilityRole="button"
      style={({ pressed }) => [s.trow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
      <Checkbox priority={task.priority ?? 0} done={done} disabled={task.status !== 0} onPress={() => {
        setLeaving(true)
        void completeTasks([task.id]).then((undo) => toast.show('작업이 완료되었습니다.', { undo: undo ?? undefined })).finally(() => setLeaving(false))
      }} />
      <Text style={{ flex: 1, color: done ? p.textTertiary : p.textPrimary, fontSize: 15.5 }} numberOfLines={1}>{task.title}</Text>
      {right ? <Text style={{ color: p.textTertiary, fontSize: 12.5, maxWidth: 110 }} numberOfLines={1}>{right}</Text> : null}
      {date ? <Text style={{ color: date.tone === 'overdue' && !done ? p.overdue : p.textTertiary, fontSize: 13 }}>{date.label}</Text> : null}
    </Pressable>
  )
}

/** 지금 할 일(31 §12.5): 최대 3개, 오늘 것만. 기한 지난 일은 정리 화면으로 */
export function NowCard({ data }: { data: PlanData }) {
  const p = usePalette()
  const router = useRouter()
  if (!data.todayTotal && !data.overdue) return null
  const today = todayKey()
  return (
    <Card>
      <View style={s.nowHead}>
        <Text style={{ color: p.textPrimary, fontSize: 15, fontWeight: '600' }}>지금 할 일</Text>
        <Text style={{ color: p.textTertiary, fontSize: 13 }}>{data.todayTotal}</Text>
      </View>
      {data.today.map(({ task, project }, i) => <PlanTaskRow key={task.id} task={task} today={today} first={i === 0} right={project} />)}
      {!data.todayTotal ? <Text style={{ color: p.textTertiary, fontSize: 13.5, paddingHorizontal: 14, paddingBottom: 10 }}>오늘 할 일은 다 정리됐어요</Text> : null}
      {data.overdue > 0 ? (
        <Pressable onPress={() => router.push({ pathname: '/tidy', params: { tab: 'overdue' } })} accessibilityRole="button" style={[s.nowMore, { borderTopColor: p.borderDivider }]}>
          <Text style={{ flex: 1, color: p.textSecondary, fontSize: 13.5 }}>기한 지난 일 {data.overdue}개는 정리에서 볼게요</Text>
          <ChevronRight size={15} color={p.textTertiary} />
        </Pressable>
      ) : null}
    </Card>
  )
}

function ProjectCard({ x, today }: { x: ProjectView; today: string }) {
  const p = usePalette()
  const router = useRouter()
  const ref = useRef<View>(null)
  const [menu, setMenu] = useState<Rect | null>(null)
  const open = () => router.push(`/map/project/${x.tag.id}`)
  const next = x.next[0]
  const lead = /^\p{Extended_Pictographic}/u.test(x.tag.name.trim())
  return (
    <View ref={ref} collapsable={false} style={[s.card, { backgroundColor: p.cardBg }]}>
      <Pressable onPress={open} onLongPress={() => ref.current?.measureInWindow((a, b, w, h) => setMenu({ x: a, y: b, width: w, height: h }))} delayLongPress={350}
        accessibilityRole="button" accessibilityHint="길게 누르면 메뉴" style={({ pressed }) => [s.cardHead, pressed && { backgroundColor: p.bgSelected }]}>
        <View style={s.cardTop}>
          {lead ? <Text style={{ fontSize: 17 }}>{x.emoji}</Text> : <FolderClosed size={18} color={p.textSecondary} />}
          <Text style={{ flex: 1, color: p.textPrimary, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{x.title}</Text>
          {x.auto ? <Text style={{ color: p.textTertiary, fontSize: 12.5 }}>자동</Text> : null}
          <ChevronRight size={16} color={p.textQuaternary} />
        </View>
        <CardLine x={x} today={today} />
        <View style={[s.bar, { backgroundColor: p.bgSelected }]}><View style={[s.barIn, { width: `${projectCardLine(x, today).progress * 100}%`, backgroundColor: p.accent }]} /></View>
      </Pressable>
      {next ? <PlanTaskRow task={next} today={today} /> : (
        <Pressable onPress={() => router.push({ pathname: '/plan-chat', params: { project: x.tag.id } })} accessibilityRole="button" style={[s.trow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
          <Text style={{ color: p.textTertiary, fontSize: 14 }}>다음 할 일을 정해 볼까요?</Text>
        </Pressable>
      )}
      <PopMenu anchor={menu} onClose={() => setMenu(null)} width={230} items={[
        { key: 'open', label: '열기', onPress: open },
        { key: 'plan', label: '다음 단계 같이 짜기', onPress: () => router.push({ pathname: '/plan-chat', params: { project: x.tag.id } }) },
        { key: 'tag', label: '태그 페이지', onPress: () => openView(router, `tag:${x.tag.id}`) }
      ]} />
    </View>
  )
}

const s = StyleSheet.create({
  summary: { fontSize: 13, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  cardHead: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 12, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  bar: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  barIn: { height: 3, borderRadius: 2 },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 46 },
  nowHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  nowMore: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 42, borderTopWidth: StyleSheet.hairlineWidth },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingVertical: 10 },
  together: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  primary: { marginTop: 14, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 15 }
})
