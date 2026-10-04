// 작업 지도 부품: 진행 고리 · 할 일 행(체크·제목·꼬리표: 날짜 / ⛓ 먼저 N / 🎯 목표) · 행 길게 누름 메뉴 · 완료(뒤 할 일 안내)
import { useRouter } from 'expo-router'
import { useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { completeTasks, reopenTasks, trashTasks } from '../data/tasks'
import { rowDateLabel } from '../lib/dates'
import { usePalette } from '../theme/ThemeProvider'
import { Checkbox } from '../ui/Checkbox'
import { PopMenu, type Rect } from '../ui/Menu'
import { useToast } from '../ui/Toast'
import { cutSequence, type MapData } from './data'
import { goalTags, unlockedBy, type MapTask } from './logic'

const eul = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c <= 11171 && c % 28 !== 0 ? '을' : '를') }

export function Ring({ done, total, size = 22 }: { done: number; total: number; size?: number }) {
  const p = usePalette()
  const r = size / 2 - 2
  const len = 2 * Math.PI * r
  const ratio = total ? done / total : 0
  return (
    <Svg width={size} height={size} accessibilityLabel={`${total}개 중 ${done}개 완료`}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={p.textQuaternary} strokeOpacity={0.6} strokeWidth={2.5} fill="none" />
      {ratio > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={ratio >= 1 ? '#3fb950' : p.accent} strokeWidth={2.5} fill="none" strokeDasharray={`${len * ratio} ${len}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null}
    </Svg>
  )
}

export function Tag({ text, tone }: { text: string; tone: 'goal' | 'wait' | 'date' | 'over' | 'muted' }) {
  const p = usePalette()
  const color = tone === 'goal' ? '#d9822b' : tone === 'date' ? p.accent : tone === 'over' ? p.overdue : p.textTertiary
  const bg = tone === 'goal' ? '#e8a23a22' : tone === 'wait' ? p.bgSelected : 'transparent'
  return <View style={[s.tag, { backgroundColor: bg }, bg !== 'transparent' && { paddingHorizontal: 6 }]}><Text style={{ color, fontSize: 12 }} numberOfLines={1}>{text}</Text></View>
}

/** 완료/완료 취소 — 앞 할 일을 끝내면 "이제 '…'를 시작할 수 있어요"(14 §0.2) */
export function useComplete(data: MapData) {
  const toast = useToast()
  return async (t: MapTask) => {
    if (t.status === 1) { await reopenTasks([t.id]); return }
    const undo = await completeTasks([t.id])
    const status = new Map(data.statusOf)
    status.set(t.id, 1)
    const next = unlockedBy(t.id, data.links, status)
    const title = next ? (data.byId.get(next)?.title ?? data.links.find((l) => l.to_id === next)?.to_title) : null
    toast.show(title ? `이제 '${title}'${eul(title).slice(title.length)} 시작할 수 있어요` : '작업이 완료되었습니다.', { undo: undo ?? undefined })
  }
}

/** 할 일 행(21 행과 같은 모양) + 길게 누름 메뉴(29 §4) */
export function MapTaskRow({ task, data, lead, first, waiting }: { task: MapTask; data: MapData; lead?: ReactNode; first?: boolean; waiting?: number }) {
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const complete = useComplete(data)
  const ref = useRef<View>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const goals = goalTags(task.id, data.links, data.goals)
  const date = rowDateLabel({ start_at: task.start_at, due_at: task.due_at }, data.today)
  const wait = waiting ?? data.wait.get(task.id) ?? 0
  const done = task.status === 1
  const hasSeq = data.links.some((l) => l.kind === 'sequence' && l.state === 'accepted' && (l.from_id === task.id || l.to_id === task.id))
  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={() => router.push(`/task/${task.id}`)}
        onLongPress={() => ref.current?.measureInWindow((x, y, width, height) => setRect({ x, y, width, height }))}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityHint="길게 누르면 옮기기·순서·목표 메뉴"
        style={({ pressed }) => [s.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}
      >
        {lead}
        <Checkbox priority={task.priority} done={done} onPress={() => void complete(task)} label={done ? '완료 취소' : '완료'} />
        <View style={{ flex: 1, paddingVertical: 10, gap: 3 }}>
          <Text style={[s.title, { color: done ? p.textTertiary : p.textPrimary }]} numberOfLines={2}>{task.title}</Text>
          {date || wait || goals.length ? (
            <View style={s.tags}>
              {wait && !done ? <Tag tone="wait" text={`⛓ 먼저 ${wait}`} /> : null}
              {goals.map((g) => <Tag key={g} tone="goal" text={`🎯 ${g}`} />)}
              {date ? <Tag tone={date.tone === 'overdue' && !done ? 'over' : 'date'} text={date.label} /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <PopMenu anchor={rect} onClose={() => setRect(null)} width={250} items={[
        { key: 'move', label: '다른 리스트로 옮기기', onPress: () => router.push({ pathname: '/map/move', params: { task: task.id } }) },
        { key: 'next', label: '다음에 할 일 고르기', onPress: () => router.push({ pathname: '/map/link', params: { task: task.id, kind: 'sequence' } }) },
        ...(hasSeq ? [{ key: 'cut', label: '순서 끊기', onPress: () => void cutSequence(task.id).then(() => toast.show('순서를 끊었어요')) }] : []),
        { key: 'goal', label: '목표와 연결', onPress: () => router.push({ pathname: '/map/link', params: { task: task.id, kind: 'goal' } }) },
        { key: 'date', label: '날짜', onPress: () => router.push({ pathname: '/date', params: { ids: task.id } }) },
        { key: 'del', label: '삭제', danger: true, onPress: () => void trashTasks([task.id]).then((undo) => toast.show('삭제했어요', { undo })) }
      ]} />
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 12, gap: 10, minHeight: 46 },
  title: { fontSize: 16, lineHeight: 21 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: { borderRadius: 6, paddingVertical: 1 }
})
