// 29 §9.8 · 31 §12.13.4 넣을지 묻기(보드 말풍선, 한 번에 하나, 하루 3개) · §12.13.6 주간 점검 끝 남은 후보([모두 넣기] [하나씩]).
// 고르기·글은 공용 @sprout/schema/projectScore(데스크톱 components/map/plan/ProjectAsk.tsx와 같은 함수), 답 쓰기는 ./ask.
import { ASK_TOAST, askText, leftoverGroups, leftoverLine, nextAsk, reasonLine } from '@sprout/schema/projectScore'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated'
import { FONT, M } from '../../theme/palette'
import { usePalette } from '../../theme/ThemeProvider'
import { useToast } from '../../ui/Toast'
import { addToProject, answerProjectQuestion, useAskCandidates, useAskedToday, type AskItem } from './ask'
import { Buddy } from './bits'

const fade = FadeIn.duration(120).reduceMotion(ReduceMotion.System)

/** 작은 칩 단추(응·아니) — 보이는 높이 32, 누르는 자리 44 */
function Chip({ label, primary, onPress, disabled, a11y }: { label: string; primary?: boolean; onPress: () => void; disabled?: boolean; a11y?: string }) {
  const p = usePalette()
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={a11y ?? label}
      style={({ pressed }) => [s.chip, { backgroundColor: primary ? p.accentSubtle : p.bgSelected, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
      <Text style={{ color: primary ? p.accentInk : p.textSecondary, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

/** 보드 요약 줄 아래 말풍선: `'회의'도 K 데이터 공모전 일이야?` [응] [아니] */
export function ProjectAskBubble() {
  const p = usePalette()
  const toast = useToast()
  const { ask } = useAskCandidates()
  const [asked, askedLoaded] = useAskedToday()
  const [busy, setBusy] = useState(false)
  const [gone, setGone] = useState<Set<string>>(new Set()) // 답한 직후(쿼리가 따라오기 전) 다시 안 뜨게
  const item = useMemo(() => (askedLoaded ? nextAsk(ask, asked, gone) : null), [ask, asked, askedLoaded, gone])
  if (!item) return null
  const answer = async (yes: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      setGone((g) => new Set(g).add(item.taskId))
      const undo = await answerProjectQuestion(item, yes)
      toast.show(yes ? ASK_TOAST.yes(item) : ASK_TOAST.no, { undo: async () => {
        await undo()
        setGone((g) => { const n = new Set(g); n.delete(item.taskId); return n })
      } })
    } catch {
      setGone((g) => { const n = new Set(g); n.delete(item.taskId); return n })
      toast.show('저장하지 못했어요. 다시 시도해 주세요.', { error: true })
    } finally { setBusy(false) }
  }
  const why = reasonLine(item)
  return (
    <Animated.View key={item.taskId} entering={fade} style={s.line}>
      <Buddy size={30} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[s.bubble, { backgroundColor: p.cardBg }]}>
          <Text style={{ color: p.textPrimary, fontSize: 14.5, lineHeight: 20 }} accessibilityLiveRegion="polite">{askText(item)}</Text>
          {why ? <Text style={{ color: p.textTertiary, fontSize: 12.5, marginTop: 3 }} numberOfLines={1}>{why}</Text> : null}
        </View>
        <View style={s.chips}>
          <Chip label="응" primary disabled={busy} onPress={() => void answer(true)} a11y={`응, ${item.project}에 넣기`} />
          <Chip label="아니" disabled={busy} onPress={() => void answer(false)} a11y="아니, 다시 묻지 않기" />
        </View>
      </View>
    </Animated.View>
  )
}

/** 주간 점검 끝(§12.13.6): 프로젝트마다 `K 공모전에 들어갈 것 같은 일 N개` [모두 넣기] [하나씩] */
export function ReviewProjectLeftovers() {
  const p = usePalette()
  const toast = useToast()
  const { ask } = useAskCandidates()
  const [open, setOpen] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const groups = useMemo(() => leftoverGroups(ask, gone), [ask, gone])
  if (!groups.length) return null
  const hide = (ids: string[]) => setGone((g) => { const n = new Set(g); ids.forEach((id) => n.add(id)); return n })
  const unhide = (ids: string[]) => setGone((g) => { const n = new Set(g); ids.forEach((id) => n.delete(id)); return n })
  const one = async (x: AskItem, yes: boolean) => {
    hide([x.taskId])
    try {
      const u = await answerProjectQuestion(x, yes, { count: false })
      toast.show(yes ? ASK_TOAST.yesShort(x) : ASK_TOAST.no, { undo: async () => { await u(); unhide([x.taskId]) } })
    } catch { unhide([x.taskId]); toast.show('저장하지 못했어요. 다시 시도해 주세요.', { error: true }) }
  }
  return (
    <View accessibilityLabel="프로젝트에 들어갈 것 같은 일">
      {groups.map((g) => (
        <View key={g.tagId} style={[s.box, { backgroundColor: p.cardBg }]}>
          <View style={s.head}>
            <Text style={[FONT.body, { color: p.textPrimary }]} numberOfLines={2} accessibilityLabel={leftoverLine(g.project, g.items.length)}>
              {g.project}에 들어갈 것 같은 일 <Text style={{ fontWeight: '700' }}>{g.items.length}</Text>개
            </Text>
            <View style={s.chips}>
              <Pressable accessibilityRole="button" onPress={async () => {
                const ids = g.items.map((x) => x.taskId)
                hide(ids)
                try {
                  const undo = await addToProject(ids, g.tagId)
                  toast.show(ASK_TOAST.all(ids.length, g.project), { undo: async () => { await undo(); unhide(ids) } })
                } catch { unhide(ids); toast.show('저장하지 못했어요. 다시 시도해 주세요.', { error: true }) }
              }} style={({ pressed }) => [s.btn, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={s.btnT}>모두 넣기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === g.tagId }} onPress={() => setOpen(open === g.tagId ? null : g.tagId)}
                style={({ pressed }) => [s.btn, { backgroundColor: p.bgSelected, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[s.btnT, { color: p.textSecondary }]}>{open === g.tagId ? '접기' : '하나씩'}</Text>
              </Pressable>
            </View>
          </View>
          {open === g.tagId ? g.items.map((x) => {
            const why = reasonLine(x)
            return (
              <View key={x.taskId} style={[s.item, { borderTopColor: p.borderDivider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[FONT.body, { color: p.textPrimary }]} numberOfLines={1}>{x.title}</Text>
                  {why ? <Text style={[FONT.meta, { color: p.textTertiary, marginTop: 2 }]} numberOfLines={1}>{why}</Text> : null}
                </View>
                <Chip label="응" primary onPress={() => void one(x, true)} a11y={`응, '${x.title}' 넣기`} />
                <Chip label="아니" onPress={() => void one(x, false)} a11y={`아니, '${x.title}' 다시 묻지 않기`} />
              </View>
            )
          }) : null}
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginBottom: 12 },
  bubble: { borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 32, minWidth: 52, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  box: { marginHorizontal: M.cardInset, marginTop: 18, borderRadius: M.radiusCard, overflow: 'hidden' },
  head: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  btn: { height: 36, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnT: { color: '#fff', fontSize: 15, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: M.rowH2, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth }
})
