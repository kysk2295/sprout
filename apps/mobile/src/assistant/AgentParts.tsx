// 47 §5 휴대폰 B안 부품 — 도구 칩 · 결과 카드(할 일·마지막으로 한 날·일정·메모·프로젝트·성장·일기·빈 결과) · 확인 카드 · 띠(인터넷 없음·건강/돈) · 받는 글.
// 카드는 앱이 도구 결과로 그린다(모델 글 아님). 칩·카드 말씨는 해요체 사실(13), 캐릭터 한 줄만 반말(40). 시안: docs/screens/mockups/assistant-free-chat.html(휴대폰 반 시트).
import { useRouter } from 'expo-router'
import { CalendarDays, Check, ChevronRight, Clock, FileText, Folder, HeartPulse, List, RotateCcw, Sprout, WifiOff, X } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { mdw, whenLine } from '@sprout/schema/assistantTools'
import type { Card, Chip, ConfirmCard, TaskItem } from '@sprout/schema/assistantExec'
import type { Band } from '@sprout/schema/assistantRouter'
import { completeTasks } from '../data/tasks'
import { useLiveQuery } from '../data/rows'
import { StreamText } from '../diary/Stream'
import { dayKey, rowDateLabel } from '../lib/dates'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { Checkbox } from '../ui/Checkbox'
import { StaticFace } from '../ui/CompanionFace'
import { useBuddy } from '../diary/data'
import { liveText } from './store'
export { editText } from './core'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

// ── 도구 칩(§5.1): 높이 28 · 부르는 중 = 돌기 · 끝 = ✓ + 글 + › · 누르면 찾은 조건 펼침 ──
export function ToolChips({ chips }: { chips: { chip: Chip; state: 'running' | 'done' | 'failed' }[] }) {
  if (!chips.length) return null
  return <View style={{ gap: 6 }}>{chips.map((c, i) => c ? <ToolChip key={i} chip={c.chip} state={c.state} /> : null)}</View>
}
function ToolChip({ chip, state }: { chip: Chip; state: 'running' | 'done' | 'failed' }) {
  const p = usePalette()
  const [open, setOpen] = useState(false)
  const done = state === 'done'
  return (
    <View style={{ gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={done ? `${chip.done}, 찾은 조건 보기` : chip.running} disabled={!done || !chip.detail} onPress={() => setOpen((o) => !o)} style={[s.chip, { backgroundColor: p.bgInput }]}>
        {state === 'running' ? <ActivityIndicator size="small" color={p.accent} style={{ transform: [{ scale: 0.7 }] }} /> : state === 'done' ? <Check size={13} color={p.accentInk} strokeWidth={3} /> : <X size={13} color={p.textTertiary} />}
        <Text style={[s.chipText, { color: state === 'running' ? p.textSecondary : p.textTertiary }]} numberOfLines={1}>{state === 'running' ? chip.running : chip.done}</Text>
        {done && chip.detail ? <ChevronRight size={12} color={p.textTertiary} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} /> : null}
      </Pressable>
      {open && chip.detail ? <Text style={[FONT.meta, { color: p.textTertiary, paddingLeft: 10 }]}>{chip.detail}</Text> : null}
    </View>
  )
}

// ── 받는 글: liveText 저장소만 구독(대화 전체를 다시 그리지 않음 — 28 §8.11과 같은 방식) ──
export function LiveText() {
  const p = usePalette()
  const reduced = useReducedMotion()
  return <StreamText stream={liveText} reduced={!!reduced} style={[s.text, { color: p.textPrimary }]} />
}

// ── 띠(§5.4) ──
export function Bands({ bands }: { bands: Band[] }) {
  const p = usePalette()
  return (
    <>
      {bands.map((b) => (
        <View key={b} style={[s.band, { backgroundColor: p.bgInput }]} accessibilityRole="text">
          {b === 'noweb' ? <WifiOff size={15} color={p.textTertiary} /> : <HeartPulse size={15} color={p.textTertiary} />}
          <Text style={[s.bandText, { color: p.textSecondary }]}>{b === 'noweb' ? '꿈틀 AI는 인터넷에 연결되지 않아요. 뉴스·가격·날씨처럼 지금 바뀌는 정보는 알 수 없어요.' : '건강·돈 이야기는 일반적인 내용이에요. 꼭 전문가와 상의해 주세요.'}</Text>
        </View>
      ))}
    </>
  )
}

// ── 결과 카드(§5.2) ──
type CardActions = { onComplete?: () => void; onSave: (key: string) => void; onCancel: (key: string) => void; onUndo: (key: string) => void; onToggle: (key: string, id: string) => void; onEdit: (c: ConfirmCard) => void }
export function AgentCards({ cards, actions }: { cards: Card[]; actions: CardActions }) {
  return <>{cards.map((c, i) => <AgentCard key={c.type === 'confirm' ? c.key : `${c.type}${i}`} card={c} actions={actions} />)}</>
}
function AgentCard({ card: c, actions }: { card: Card; actions: CardActions }) {
  switch (c.type) {
    case 'tasks': return <TasksCard head={c.head} total={c.total} tasks={c.tasks} note={c.note} empty={c.empty} onComplete={actions.onComplete} />
    case 'since': return <SinceCard c={c} />
    case 'events': return <EventsCard c={c} />
    case 'notes': return <NotesCard c={c} />
    case 'project': return <ProjectCard c={c} />
    case 'growth': return <GrowthCard c={c} />
    case 'diary': return <DiaryCard c={c} />
    case 'confirm': return <ConfirmView c={c} actions={actions} />
  }
}

function Shell({ icon, head, n, foot, children, danger, accent }: { icon: ReactNode; head: string; n?: string; foot?: string; children: ReactNode; danger?: boolean; accent?: boolean }) {
  const p = usePalette()
  const border = danger ? p.textDanger : accent ? p.accent : p.borderDivider
  return (
    <View style={[s.card, { backgroundColor: p.cardBg, borderColor: border, borderWidth: danger || accent ? 1.5 : StyleSheet.hairlineWidth, borderRadius: danger || accent ? 14 : 18 }]}>
      <View style={[s.cardHead, { borderBottomColor: p.borderDivider }]}>
        {icon}
        <Text style={[FONT.sub, { color: danger ? p.textDanger : accent ? p.accentInk : p.textSecondary, flex: 1, fontWeight: '600' }]} numberOfLines={1}>{head}</Text>
        {n ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{n}</Text> : null}
      </View>
      {children}
      {foot ? <Text style={[FONT.meta, s.foot, { color: p.textTertiary }]}>{foot}</Text> : null}
    </View>
  )
}

/** 할 일 행(13 행): 체크 = 완료 + XP · 누름 = 상세. 지금 상태(완료·삭제)는 DB에서 다시 읽는다 */
function TaskRows({ tasks, limit = 5, onComplete }: { tasks: Pick<TaskItem, 'id' | 'title' | 'start_at' | 'due_at' | 'priority'>[]; limit?: number; onComplete?: () => void }) {
  const p = usePalette()
  const router = useRouter()
  const [more, setMore] = useState(false)
  const ids = tasks.map((t) => t.id)
  const live = useLiveQuery<{ id: string; status: number; deleted_at: string | null; title: string; start_at: string | null; due_at: string | null; priority: number }>(
    ids.length ? `SELECT id, status, deleted_at, title, start_at, due_at, priority FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})` : 'SELECT NULL AS id WHERE 0', ids
  ).data
  const byId = new Map(live.map((t) => [t.id, t]))
  const today = dayKey()
  const shown = more ? tasks : tasks.slice(0, limit)
  return (
    <>
      {shown.map((t) => {
        const cur = byId.get(t.id)
        const gone = live.length > 0 && (!cur || !!cur.deleted_at)
        const done = cur?.status === 1
        const date = rowDateLabel({ start_at: cur?.start_at ?? t.start_at, due_at: cur?.due_at ?? t.due_at }, today)
        return (
          <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${cur?.title ?? t.title} 열기`} disabled={gone} onPress={() => router.push(`/task/${t.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
            <Checkbox priority={cur?.priority ?? t.priority ?? 0} done={done} disabled={gone || done} label={`${t.title} 완료`} onPress={() => { onComplete?.(); void completeTasks([t.id]) }} />
            <Text style={[FONT.body, { flex: 1, fontSize: 15, color: done || gone ? p.textTertiary : p.textPrimary }, gone && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{cur?.title ?? t.title}</Text>
            {gone ? <Text style={[FONT.meta, { color: p.textTertiary }]}>삭제됨</Text> : date && !done ? <Text style={[FONT.meta, { color: date.tone === 'overdue' ? p.overdue : p.accent, fontSize: 13 }]}>{date.label}</Text> : null}
          </Pressable>
        )
      })}
      {!more && tasks.length > limit ? <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={s.more}><Text style={[FONT.sub, { color: p.accentInk }]}>더 보기 {tasks.length - limit}</Text></Pressable> : null}
    </>
  )
}

function TasksCard({ head, total, tasks, note, empty, onComplete }: { head: string; total: number; tasks: TaskItem[]; note?: string; empty?: string; onComplete?: () => void }) {
  const p = usePalette()
  return (
    <Shell icon={<List size={14} color={p.textSecondary} />} head={head} n={`${total}개`} foot={total ? note : empty}>
      {total ? <TaskRows tasks={tasks} onComplete={onComplete} /> : <Text style={[FONT.sub, s.emptyRow, { color: p.textTertiary }]}>찾은 할 일이 없어요</Text>}
    </Shell>
  )
}

function SinceCard({ c }: { c: Extract<Card, { type: 'since' }> }) {
  const p = usePalette()
  const router = useRouter()
  const now = new Date()
  if (!c.last) {
    return (
      <Shell icon={<Clock size={14} color={p.textSecondary} />} head={`‘${c.phrase}’ 기록`} n="0개" foot={c.first ? `꿈틀의 첫 기록 · ${mdw(c.first, now)} · 다른 앱 캘린더(구글·iCloud)는 AI가 보지 않아요` : '다른 앱 캘린더(구글·iCloud)는 AI가 보지 않아요'}>
        <Text style={[FONT.sub, s.emptyRow, { color: p.textTertiary }]}>끝낸 할 일·일정이 없어요</Text>
      </Shell>
    )
  }
  const dots = [...c.dates].reverse()
  const open = () => (c.last!.open.startsWith('ev:') ? router.push(`/event/${c.last!.open.slice(3)}`) : router.push(`/task/${c.last!.id}`))
  return (
    <Shell icon={<Clock size={14} color={p.textSecondary} />} head="마지막으로 한 날" n={`${c.count}번`} foot={c.note}>
      <View style={s.big}>
        {/* 40 §0.1: 큰 숫자는 1차 글자색(색 큰 숫자 금지) */}
        <Text style={[s.bigNum, { color: p.textPrimary }]}>{c.days ?? 0}</Text>
        <Text style={[FONT.sub, { color: p.textSecondary }]}>{c.days ? '일 지났어요' : '오늘 했어요'}</Text>
      </View>
      <View style={s.tl}>
        {dots.map((d, i) => (
          <View key={d} style={s.tlCell}>
            <View style={s.tlLine}><View style={[s.dot, { backgroundColor: p.accent }]} />{i < dots.length ? <View style={[s.seg, { backgroundColor: p.borderDivider }]} /> : null}</View>
            <Text style={[s.tlLabel, { color: p.textTertiary }]}>{md(d)}</Text>
          </View>
        ))}
        <View style={s.tlCell}><View style={s.tlLine}><View style={[s.dot, { backgroundColor: p.cardBg, borderWidth: 2, borderColor: p.accent }]} /></View><Text style={[s.tlLabel, { color: p.textTertiary }]}>오늘</Text></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${c.last.title} 열기`} onPress={open} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
        {c.last.source === 'task' ? <Checkbox priority={0} done disabled label={c.last.title} /> : <CalendarDays size={18} color={p.textTertiary} />}
        <Text style={[FONT.body, { flex: 1, fontSize: 15, color: p.textSecondary }]} numberOfLines={1}>{c.last.title}</Text>
        <Text style={[FONT.meta, { color: p.textTertiary, fontSize: 13 }]}>{mdw(c.last.date, now).replace(/\(.\)$/, '')} 완료</Text>
      </Pressable>
      {c.next ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(c.next!.open.startsWith('ev:') ? `/event/${c.next!.open.slice(3)}` : `/task/${c.next!.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
          <CalendarDays size={18} color={p.accent} />
          <Text style={[FONT.body, { flex: 1, fontSize: 15, color: p.textPrimary }]} numberOfLines={1}>{c.next.title}</Text>
          <Text style={[FONT.meta, { color: p.accent, fontSize: 13 }]}>다음 예정 · {md(c.next.date)}</Text>
        </Pressable>
      ) : null}
    </Shell>
  )
}

function EventsCard({ c }: { c: Extract<Card, { type: 'events' }> }) {
  const p = usePalette()
  const router = useRouter()
  const time = (at: string) => (at.includes('T') ? `${Number(at.slice(11, 13)) < 12 ? '오전' : '오후'} ${Number(at.slice(11, 13)) % 12 || 12}:${at.slice(14, 16)}` : '종일')
  return (
    <Shell icon={<CalendarDays size={14} color={p.textSecondary} />} head={c.head} n={`${c.total}개`} foot={c.total ? undefined : c.empty}>
      {c.total ? c.events.slice(0, 5).map((e, i) => (
        <Pressable key={`${e.id}${i}`} accessibilityRole="button" onPress={() => router.push(e.kind === 'event' ? `/event/${e.id}` : `/task/${e.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
          <View style={[s.bar, { backgroundColor: p.accent }]} />
          <Text style={[FONT.body, { flex: 1, fontSize: 15, color: p.textPrimary }]} numberOfLines={1}>{e.title}</Text>
          <Text style={[FONT.meta, { color: p.textTertiary, fontSize: 13 }]}>{md(e.start)} {time(e.start)}</Text>
        </Pressable>
      )) : <Text style={[FONT.sub, s.emptyRow, { color: p.textTertiary }]}>일정이 없어요</Text>}
    </Shell>
  )
}

function NotesCard({ c }: { c: Extract<Card, { type: 'notes' }> }) {
  const p = usePalette()
  const router = useRouter()
  return (
    <Shell icon={<FileText size={14} color={p.textSecondary} />} head={c.head} n={`${c.total}개`}>
      {c.total ? c.notes.slice(0, 5).map((n) => (
        <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${n.title} 메모 열기`} onPress={() => router.push('/collect')} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
          <FileText size={17} color={p.textTertiary} />
          <Text style={[FONT.body, { flex: 1, fontSize: 15, color: p.textPrimary }]} numberOfLines={1}>{n.title}</Text>
          {n.modified ? <Text style={[FONT.meta, { color: p.textTertiary, fontSize: 13 }]}>{md(n.modified)}</Text> : null}
        </Pressable>
      )) : <Text style={[FONT.sub, s.emptyRow, { color: p.textTertiary }]}>찾은 메모가 없어요</Text>}
    </Shell>
  )
}

function ProjectCard({ c }: { c: Extract<Card, { type: 'project' }> }) {
  const p = usePalette()
  const router = useRouter()
  const today = dayKey()
  if (!c.projects.length) return <Shell icon={<Folder size={14} color={p.textSecondary} />} head="프로젝트" n="0개"><Text style={[FONT.sub, s.emptyRow, { color: p.textTertiary }]}>진행 중인 프로젝트가 없어요</Text></Shell>
  return (
    <>
      {c.projects.slice(0, 2).map((pj) => {
        const dd = pj.deadline ? Math.round((Date.parse(`${pj.deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null
        return (
          <Shell key={pj.id} icon={<Folder size={14} color={p.textSecondary} />} head={pj.name} n={`${pj.done}/${pj.total}`}>
            <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.track, { backgroundColor: p.bgInput }]}><View style={[s.fill, { backgroundColor: p.accent, width: `${pj.total ? Math.round((pj.done / pj.total) * 100) : 0}%` }]} /></View>
                {dd !== null ? <Text style={[s.pillTxt, { backgroundColor: dd <= 3 ? p.overdue : p.accentSubtle, color: dd <= 3 ? '#fff' : p.accentInk }]}>{dd === 0 ? 'D-DAY' : dd > 0 ? `D-${dd}` : `D+${-dd}`}</Text> : null}
              </View>
            </View>
            {pj.next.map((t) => (
              <Pressable key={t.id} accessibilityRole="button" onPress={() => router.push(`/task/${t.id}`)} style={({ pressed }) => [s.row, { minHeight: 40 }, pressed && { backgroundColor: p.bgSelected }]}>
                <Text style={[FONT.sub, { flex: 1, color: p.textPrimary }]} numberOfLines={1}>{t.title}</Text>
                {t.due_at ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{md(t.due_at)}</Text> : null}
              </Pressable>
            ))}
          </Shell>
        )
      })}
    </>
  )
}

function GrowthCard({ c }: { c: Extract<Card, { type: 'growth' }> }) {
  const p = usePalette()
  const buddy = useBuddy()
  return (
    <Shell icon={<Sprout size={14} color={p.textSecondary} />} head="성장 기록" n={`이번 주 완료 ${c.weekDone}개`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <StaticFace species={buddy.species} stage={buddy.stage} size={44} mood="happy" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[FONT.body, { color: p.textPrimary, fontWeight: '700' }]}>Lv {c.level} · {c.stageName}</Text>
          <View style={[s.track, { backgroundColor: p.bgInput }]}><View style={[s.fill, { backgroundColor: p.accent, width: `${c.toNext ? Math.min(100, Math.round((c.into / c.toNext) * 100)) : 0}%` }]} /></View>
          <Text style={[FONT.meta, { color: p.textTertiary }]}>다음 레벨까지 {Math.max(0, c.toNext - c.into)} XP</Text>
        </View>
      </View>
    </Shell>
  )
}

function DiaryCard({ c }: { c: Extract<Card, { type: 'diary' }> }) {
  const p = usePalette()
  const router = useRouter()
  return (
    <Shell icon={<FileText size={14} color={p.textSecondary} />} head="일기" n={`${c.total}일`} foot="나만 보기 날은 AI가 보지 않아요">
      {c.days.length ? c.days.slice(0, 5).map((d) => (
        <Pressable key={d.date} accessibilityRole="button" onPress={() => router.push('/diary')} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
          <Text style={[FONT.meta, { color: p.textTertiary, width: 40 }]}>{md(d.date)}</Text>
          <Text style={[FONT.sub, { flex: 1, color: p.textPrimary }]} numberOfLines={1}>{d.snippet}</Text>
        </Pressable>
      )) : <Text style={[FONT.sub, s.emptyRow, { color: p.textTertiary }]}>찾은 일기가 없어요</Text>}
    </Shell>
  )
}

// ── 확인 카드(§5.3) ──
const HEAD: Record<ConfirmCard['op'], string> = { create: '', complete: '완료로 바꿀까?', move: '날짜를 옮길까?', delete: '지울까?' }
const SAVE: Record<ConfirmCard['op'], string> = { create: '넣기', complete: '완료', move: '옮기기', delete: '지우기' }
const DONE: Record<ConfirmCard['op'], string> = { create: '넣었어요', complete: '완료로 바꿨어요', move: '옮겼어요', delete: '지웠어요' }
function ConfirmView({ c, actions }: { c: ConfirmCard; actions: CardActions }) {
  const p = usePalette()
  const router = useRouter()
  const now = new Date()
  const multi = (c.targets?.length ?? 0) > 1
  const picked = c.targets?.filter((t) => t.picked).length ?? 0
  const danger = c.op === 'delete'
  const at = c.start || c.due
  if (c.state !== 'pending') {
    const ids = c.saved?.ids ?? []
    const rows = c.op === 'create' ? ids.map((id) => ({ id, title: c.title, start_at: c.start || null, due_at: c.due || null, priority: 0 })) : (c.targets ?? []).filter((t) => ids.includes(t.id)).map((t) => ({ ...t, priority: 0 }))
    return (
      <Shell accent={c.state === 'saved' && !danger} icon={c.state === 'saved' ? <Check size={14} color={p.accentInk} /> : c.state === 'undone' ? <RotateCcw size={14} color={p.textTertiary} /> : <X size={14} color={p.textTertiary} />}
        head={c.state === 'saved' ? DONE[c.op] : c.state === 'undone' ? '되돌렸어요' : c.op === 'create' ? '넣지 않았어요' : '바꾸지 않았어요'}>
        {c.state === 'cancelled' ? <Text style={[FONT.sub, s.emptyRow, { color: p.textTertiary, fontWeight: '600' }]}>{c.title}</Text> : c.op === 'delete' || c.state === 'undone' ? (
          rows.map((r) => <View key={r.id} style={s.row}><Text style={[FONT.body, { flex: 1, color: p.textTertiary, textDecorationLine: c.state === 'undone' && c.op === 'create' ? 'line-through' : 'none' }]} numberOfLines={1}>{r.title}</Text></View>)
        ) : <TaskRows tasks={rows} />}
        {c.state === 'saved' ? (
          <Pressable accessibilityRole="button" onPress={() => actions.onUndo(c.key)} style={s.undo} hitSlop={6}>
            <RotateCcw size={15} color={p.accent} /><Text style={[FONT.sub, { color: p.accentInk, fontWeight: '600' }]}>되돌리기</Text>
          </Pressable>
        ) : null}
      </Shell>
    )
  }
  const kind = c.due.includes('T') ? '일정' : '할 일'
  return (
    <Shell accent={!danger} danger={danger} icon={c.op === 'create' ? <CalendarDays size={14} color={p.accentInk} /> : danger ? <X size={14} color={p.textDanger} /> : <Check size={14} color={p.accentInk} />}
      head={c.op === 'create' ? `새 ${kind} · 확인해 줘` : HEAD[c.op]}>
      <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 6 }}>
        {!multi ? <Text style={[s.ctitle, { color: p.textPrimary }]}>{c.title}</Text> : null}
        {c.op === 'create' ? (
          <>
            <Def k="언제" v={whenLine(at, now)} extra={c.said ? `(“${c.said}”)` : undefined} hl />
            {c.length ? <Def k="길이" v={c.length} /> : null}
            <Def k="리스트" v={c.listName || '기본함'} />
            {c.repeat ? <Def k="반복" v={c.repeat.replace('FREQ=DAILY', '매일').replace(/FREQ=WEEKLY;BYDAY=(\w\w)/, (_m, d: string) => `매주 ${'일월화수목금토'['SUMOTUWETHFRSA'.indexOf(d) / 2]}요일`)} /> : null}
            {c.assumed ? <Def k="참고" v={c.assumed} /> : null}
            {c.basis ? <Def k="근거" v={c.basis} /> : null}
          </>
        ) : c.op === 'move' && c.moveTo && !multi ? <Def k="언제" v={`${c.due ? whenLine(c.due.slice(0, 10), now) : '날짜 없음'} → ${whenLine(c.moveTo, now)}`} hl /> : null}
      </View>
      {multi ? c.targets!.map((t) => (
        <Pressable key={t.id} accessibilityRole="checkbox" accessibilityState={{ checked: t.picked }} onPress={() => actions.onToggle(c.key, t.id)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
          <View style={[s.pick, { borderColor: t.picked ? (danger ? p.textDanger : p.accent) : p.borderStrong, backgroundColor: t.picked ? (danger ? p.textDanger : p.accent) : 'transparent' }]}>{t.picked ? <Check size={12} color="#fff" strokeWidth={3} /> : null}</View>
          <Text style={[FONT.body, { flex: 1, fontSize: 15, color: p.textPrimary }]} numberOfLines={1}>{t.title}</Text>
          {t.due_at ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{md(t.due_at)}</Text> : null}
        </Pressable>
      )) : null}
      <View style={s.acts}>
        <Pressable accessibilityRole="button" disabled={multi && !picked} onPress={() => actions.onSave(c.key)} style={({ pressed }) => [s.pri, { backgroundColor: danger ? p.textDanger : p.accent }, (pressed || (multi && !picked)) && { opacity: 0.6 }]}>
          <Text style={[s.priText, { color: danger ? '#fff' : p.onAccent }]}>{multi ? `골라서 ${SAVE[c.op]} ${picked}` : SAVE[c.op]}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => (c.op === 'create' ? actions.onEdit(c) : router.push(`/task/${c.targets?.find((t) => t.picked)?.id ?? c.targets?.[0]?.id}`))} style={({ pressed }) => [s.sec, { borderColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
          <Text style={[s.secText, { color: p.textPrimary }]}>고치기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => actions.onCancel(c.key)} style={s.ghost}><Text style={[s.secText, { color: p.textSecondary }]}>취소</Text></Pressable>
      </View>
      <Text style={[FONT.meta, s.foot, { color: p.textTertiary }]}>{danger ? '지우기는 단추로만 할 수 있어요 · 휴지통에서 되살릴 수 있어요' : `‘${SAVE[c.op]}’를 누르기 전엔 저장되지 않아요 · “응”이라고 답해도 돼요`}</Text>
    </Shell>
  )
}
function Def({ k, v, extra, hl }: { k: string; v: string; extra?: string; hl?: boolean }) {
  const p = usePalette()
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={[FONT.sub, { width: 40, color: p.textTertiary }]}>{k}</Text>
      <Text style={[FONT.sub, { flex: 1, color: hl ? p.accentInk : p.textPrimary, fontWeight: hl ? '600' : '400' }]}>{v}{extra ? <Text style={{ color: p.textTertiary, fontWeight: '400' }}> {extra}</Text> : null}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  chip: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, borderRadius: 14, paddingLeft: 9, paddingRight: 11 },
  chipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  text: { fontSize: 15.5, lineHeight: 22 },
  band: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  bandText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '500' },
  card: { overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderBottomWidth: StyleSheet.hairlineWidth },
  foot: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  more: { height: 40, alignItems: 'center', justifyContent: 'center' },
  emptyRow: { paddingHorizontal: 12, paddingVertical: 12 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 12, paddingTop: 10 },
  bigNum: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  tl: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8 },
  tlCell: { flex: 1, gap: 4 },
  tlLine: { flexDirection: 'row', alignItems: 'center', height: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  seg: { flex: 1, height: 2 },
  tlLabel: { fontSize: 10.5 },
  bar: { width: 3, height: 26, borderRadius: 2 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  pillTxt: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  ctitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  pick: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  acts: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  pri: { height: 36, borderRadius: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  priText: { fontSize: 14.5, fontWeight: '700' },
  sec: { height: 36, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  secText: { fontSize: 14.5, fontWeight: '600' },
  ghost: { height: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 10 }
})
