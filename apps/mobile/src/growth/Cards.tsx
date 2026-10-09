// 23 §2 ③~⑦: 요약 칩 · 진화 길 · 이번 주 목표 · 이번 주 XP · 주간 리포트 목록 (시안 B1·B2, 공용 키트 묶음 카드)
import { COMPANION_SIZE, QUEST_LIMIT_LINE, QUEST_LIMIT_NOTE } from '@sprout/schema/companion'
import { STAGES, weekLabel, XP, type GoalDraft, type Species } from '@sprout/schema/growth'
import { addDays } from '@sprout/schema/time'
import { useRouter } from 'expo-router'
import { BarChart3, Check, ChevronRight, Lock, Plus, Sparkles, Target, X } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { Checkbox } from '../ui/Checkbox'
import { useToast } from '../ui/Toast'
import type { Palette } from '../theme/palette'
import { CharacterArt } from './art/CharacterArt'
import { useBuddy } from '../diary/data'
import { StaticFace } from '../ui/CompanionFace'
import { Confetti } from './Bits'
import { addGoal, dismissDraft, setGoalProgress, useRefTitles } from './data'
import {
  checkTarget, dotTarget, goalBadge, newlyUnlocked, signed, weekBars, weekRange, xpDayGroups, xpLabel, weekTotal,
  type GoalRow, type ReportRow, type XpRow
} from './logic'

const card = (p: Palette) => ({ backgroundColor: p.cardBg })

export function EvolutionRoad({ p, species, level, stage, open, onOpen }: { p: Palette; species: Species | null; level: number; stage: number; open: number | null; onOpen: (n: number | null) => void }) {
  const sel = open !== null ? STAGES.find((x) => x.stage === open) : undefined
  return (
    <View>
      <View style={s.road}>
        <View style={[s.roadLine, { backgroundColor: p.bgSelected }]} />
        {STAGES.map((st) => {
          const state = st.stage < stage ? 'past' : st.stage === stage ? 'now' : 'future'
          return (
            <Pressable key={st.stage} style={s.station} onPress={() => onOpen(open === st.stage ? null : st.stage)} accessibilityRole="button"
              accessibilityLabel={`${st.name} 단계 Lv ${st.from}${state === 'future' ? ` · ${st.from - level}레벨 남음` : state === 'now' ? ' · 지금 단계' : ''}`}>
              <View style={[s.ball, { backgroundColor: state === 'past' ? p.accentSubtle : state === 'now' ? p.bgApp : p.bgInput },
                state === 'now' && { borderColor: p.accent, shadowColor: p.accent, shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }]}>
                <CharacterArt species={species} stage={st.stage} size={state === 'now' ? 36 : 34} silhouette={state === 'future' ? (p.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)') : undefined} />
                {state === 'future' ? <View style={[s.lock, { backgroundColor: p.bgPopover, borderColor: p.borderDivider }]}><Lock size={10} color={p.textTertiary} /></View> : null}
              </View>
              <Text style={[s.stLabel, { color: state === 'now' ? p.accent : state === 'past' ? p.textSecondary : p.textTertiary }, state === 'now' && { fontWeight: '700' }]}>
                {state === 'future' ? `Lv ${st.from}` : st.name}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {sel ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={[s.preview, { backgroundColor: p.bgPopover, borderColor: p.borderPopover }]}>
          <CharacterArt species={species} stage={sel.stage} size={64} mood="happy" />
          <View style={{ flex: 1 }}>
            <Text style={[s.pvTitle, { color: p.textPrimary }]}>{sel.name} · Lv {sel.from}</Text>
            <Text style={[s.pvSub, { color: p.textSecondary }]}>
              {sel.stage > stage ? `Lv ${sel.from}에 만나요 · ${sel.from - level}레벨 남음` : sel.stage === stage ? '지금 단계' : '지나온 단계'}
            </Text>
            <Text style={[s.pvSub, { color: p.textTertiary }]} numberOfLines={2}>
              열리는 장식: {newlyUnlocked(sel.from - 1, (STAGES.find((x) => x.stage === sel.stage + 1)?.from ?? 99) - 1).map((d) => d.name).join(' · ') || '—'}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}

/** ⑤ 이번 주 목표: 체크·횟수 점·AI 초안 +/× (휴대폰에서 새로 적기·고쳐 받기·삭제는 없음 — 23 §4, D7) */
export function GoalsCard({ p, today, week, goals, xpIds, drafts, draftUsed, reduced }: {
  p: Palette; today: string; week: string; goals: GoalRow[]; xpIds: Set<string>; drafts: GoalDraft[]; draftUsed?: boolean; reduced: boolean
}) {
  const buddy = useBuddy()
  const toast = useToast()
  const [cheer, setCheer] = useState<string>()
  const done = goals.filter((g) => g.status === 'achieved').length
  const progressTo = async (g: GoalRow, n: number) => {
    const reaching = g.status !== 'achieved' && n >= g.target
    await setGoalProgress(today, g, n)
    if (reaching) { setCheer(g.id); setTimeout(() => setCheer((c) => (c === g.id ? undefined : c)), 1300) }
  }
  const accept = async (d: GoalDraft) => {
    const r = await addGoal(today, week, d.title, d.target, 'ai')
    if (r === 'full') toast.show(`이번 주는 ${XP.goalsPerWeek}개까지 적을 수 있어요`, { error: true })
  }
  return (
    <View style={[s.card, card(p)]}>
      <View style={s.head}>
        <Text style={[s.headTitle, { color: p.textPrimary }]}>이번 주 목표 <Text style={[s.headMeta, { color: p.textTertiary }]}>{weekRange(week)}</Text></Text>
        {goals.length ? <Text style={[s.headRight, { color: p.textSecondary }]}>{done}/{goals.length}</Text> : null}
      </View>
      {goals.map((g, i) => {
        const achieved = g.status === 'achieved'
        const badge = goalBadge(g, xpIds)
        return (
          <View key={g.id} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
            <Checkbox priority={0} done={achieved} flash={cheer === g.id} label={achieved ? '달성 취소' : '달성'} onPress={() => void progressTo(g, checkTarget(g))} />
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: achieved ? p.textTertiary : p.textPrimary }]} numberOfLines={1}>{g.title}</Text>
              {badge.note ? <Text style={[s.rowSub, { color: p.textTertiary }]}>{badge.note}</Text> : null}
            </View>
            {g.target > 1 && g.target <= 10 && !achieved ? (
              <View style={s.dots} accessibilityLabel={`${g.progress}/${g.target}`}>
                {Array.from({ length: g.target }, (_, k) => (
                  <Pressable key={k} hitSlop={{ top: 12, bottom: 12, left: 3, right: 3 }} accessibilityRole="button" accessibilityLabel={`${k + 1}번`} onPress={() => void progressTo(g, dotTarget(g.progress, k))}>
                    <View style={[s.dot, { borderColor: p.accent }, k < g.progress && { backgroundColor: p.accent }]} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {g.target > 10 && !achieved ? (
              <View style={s.count}>
                <Pressable hitSlop={8} accessibilityLabel="하나 빼기" onPress={() => void progressTo(g, g.progress - 1)}><Text style={[s.countBtn, { color: p.accent }]}>−</Text></Pressable>
                <Text style={{ color: p.textSecondary, fontSize: 13 }}>{g.progress}/{g.target}</Text>
                <Pressable hitSlop={8} accessibilityLabel="하나 더하기" onPress={() => void progressTo(g, g.progress + 1)}><Text style={[s.countBtn, { color: p.accent }]}>+</Text></Pressable>
              </View>
            ) : null}
            {badge.reward ? <View style={[s.chip, { backgroundColor: p.accentSubtle }]}><Text style={[s.chipText, { color: p.accent }]}>{badge.reward}</Text></View> : null}
            {cheer === g.id && !reduced ? <View style={s.cheer} pointerEvents="none"><Confetti count={14} spread={60} /></View> : null}
          </View>
        )
      })}
      {drafts.map((d) => (
        <View key={d.title} style={s.aiRow}>
          <View style={s.dash} pointerEvents="none"><View style={[s.dashLine, { borderColor: p.borderDivider }]} /></View>
          <Pressable style={s.aiMain} onPress={() => toast.show('고쳐서 받기는 컴퓨터에서 할 수 있어요', { icon: false })} accessibilityRole="button" accessibilityLabel={`AI 제안: ${d.title}`}>
            <Sparkles size={16} color={p.accent} />
            <Text style={[s.aiText, { color: p.textSecondary }]} numberOfLines={1}>{d.title}</Text>
          </Pressable>
          <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={`${d.title} 목표로 추가`} onPress={() => void accept(d)}><Plus size={20} color={p.accent} /></Pressable>
          <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={`${d.title} 제안 숨기기`} onPress={() => void dismissDraft(today, addDays(week, -7), d.title)}><X size={18} color={p.textTertiary} /></Pressable>
        </View>
      ))}
      {draftUsed && !drafts.length && goals.length < XP.goalsPerWeek ? (
        // 40 §5.2 주간 한도: 캐릭터 S 18 sleepy + 한 줄(반말), 아래 3차 시스템 문장(해요체)
        <View style={s.limit}>
          <View style={s.limitRow}>
            <StaticFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.quest} mood="sleepy" />
            <Text style={[s.limitLine, { color: p.textSecondary }]}>{QUEST_LIMIT_LINE}</Text>
          </View>
          <Text style={[s.limitNote, { color: p.textTertiary }]}>{QUEST_LIMIT_NOTE}</Text>
        </View>
      ) : null}
      {!goals.length ? (
        <View style={s.empty}>
          <Text style={[s.emptyTitle, { color: p.textSecondary }]}>이번 주 목표가 아직 없어요</Text>
          <Text style={[s.emptySub, { color: p.textTertiary }]}>컴퓨터의 성장 화면에서 적을 수 있어요</Text>
        </View>
      ) : null}
      {drafts.length ? <Text style={[s.fnote, { color: p.textTertiary }]}>✦ AI 제안은 <Text style={{ fontWeight: '700' }}>+</Text>를 눌러야 목표가 돼요 · 새로 적기는 컴퓨터에서</Text> : null}
      {goals.length >= 2 ? (
        <View style={s.bonus}>
          <Text style={[s.bonusText, { color: p.textTertiary }]}>{done === goals.length ? `모두 이뤘어요 · 보너스 +${XP.kpiAll}` : `2개 이상 모두 이루면 +${XP.kpiAll}`}</Text>
          <View style={[s.bonusBar, { backgroundColor: p.bgSelected }]}><View style={{ height: 4, borderRadius: 2, backgroundColor: p.accent, width: `${(done / goals.length) * 100}%` }} /></View>
        </View>
      ) : null}
    </View>
  )
}

/** ⑥ 이번 주 XP: 7일 막대(누르면 "수 · 40 XP") + 날짜 묶음 */
export function XpCard({ p, events, week, today }: { p: Palette; events: XpRow[]; week: string; today: string }) {
  const bars = weekBars(events, week, today)
  const groups = xpDayGroups(events, week, today)
  const total = weekTotal(events, week)
  const ids = groups.flatMap((g) => g.items.map((e) => e.ref_id))
  const titles = useRefTitles(ids)
  const [tip, setTip] = useState<number | null>(null)
  return (
    <View style={[s.card, card(p)]}>
      <View style={s.head}>
        <Text style={[s.headTitle, { color: p.textPrimary }]}>이번 주 XP</Text>
        <Text style={[s.headRight, { color: p.accent, fontWeight: '700' }]}>{signed(total)}</Text>
      </View>
      <View style={s.bars}>
        {bars.map((b, i) => (
          <Pressable key={b.day} style={s.barCol} onPress={() => setTip(tip === i ? null : i)} accessibilityLabel={`${b.label}요일 ${b.xp} XP`}>
            {tip === i ? <View style={[s.tip, { backgroundColor: p.textPrimary }]}><Text style={[s.tipText, { color: p.bgApp }]}>{b.label} · {b.xp} XP</Text></View> : null}
            <View style={[s.bar, { height: `${Math.max(4, b.ratio * 100)}%`, backgroundColor: b.today ? p.accent : p.bgSelected }]} />
            <Text style={[s.barDay, { color: b.today ? p.accent : p.textTertiary }, b.today && { fontWeight: '700' }]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
      {!groups.length ? <Text style={[s.emptySub, { color: p.textTertiary, padding: 14 }]}>할 일을 끝내면 XP가 쌓여요. 하루에 할 일로 {XP.taskDailyCap} XP까지 받을 수 있어요.</Text> : null}
      {groups.map((g) => (
        <View key={g.day}>
          <View style={s.ghead}>
            <Text style={[s.gheadText, { color: p.textPrimary }]}>{g.note || g.label}</Text>
            <Text style={[s.gheadN, { color: p.textTertiary }]}>{g.total} XP</Text>
          </View>
          {g.items.map((e) => (
            <View key={e.id} style={s.xpRow}>
              {e.kind.startsWith('task') ? <Check size={15} color={p.textTertiary} /> : <Target size={15} color={p.textTertiary} />}
              <Text style={[s.xpLabel, { color: p.textPrimary }]} numberOfLines={1}>{xpLabel(e, titles.get(e.ref_id))}</Text>
              <Text style={[s.xpAmt, { color: e.amount < 0 ? p.textTertiary : p.accent }]}>{signed(e.amount)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

/** ⑦ 주간 리포트 목록(읽기). 없으면 카드를 숨긴다 */
export function ReportsCard({ p, reports }: { p: Palette; reports: ReportRow[] }) {
  const router = useRouter()
  if (!reports.length) return null
  return (
    <View style={[s.card, card(p)]}>
      <View style={s.head}><Text style={[s.headTitle, { color: p.textPrimary }]}>주간 리포트</Text></View>
      {reports.map((r, i) => (
        <Pressable key={r.id} onPress={() => router.push({ pathname: '/growth/report/[week]', params: { week: r.week_start } })}
          style={({ pressed }) => [s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }, pressed && { backgroundColor: p.bgSelected }]}
          accessibilityRole="button" accessibilityLabel={`${weekLabel(r.week_start)}${r.seen_at ? '' : ', 새 리포트'}`}>
          <BarChart3 size={17} color={p.textTertiary} />
          <Text style={[s.rowTitle, { flex: 1, color: p.textPrimary }]}>{weekLabel(r.week_start)}</Text>
          {!r.seen_at ? <View style={[s.newdot, { backgroundColor: p.accent }]} /> : null}
          <Text style={{ fontSize: 12, color: p.textTertiary }}>{signed(r.xp_total)} XP</Text>
          <ChevronRight size={16} color={p.textQuaternary} />
        </Pressable>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  limit: { paddingTop: 8, gap: 2 },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  limitLine: { flex: 1, fontSize: 13.5, lineHeight: 18 },
  limitNote: { fontSize: 12, lineHeight: 16, marginLeft: 26 },
  chips: { gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  road: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 4 },
  roadLine: { position: 'absolute', left: 44, right: 44, top: 34, height: 2 },
  station: { width: 52, alignItems: 'center', gap: 4 },
  ball: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  lock: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  stLabel: { fontSize: 11, lineHeight: 14, fontWeight: '500' },
  preview: { marginHorizontal: 12, marginTop: 6, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  pvTitle: { fontSize: 15, fontWeight: '700' },
  pvSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, overflow: 'hidden' },
  head: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  headTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  headMeta: { fontSize: 12, fontWeight: '400' },
  headRight: { fontSize: 13 },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  rowText: { flex: 1, paddingVertical: 8 },
  rowTitle: { fontSize: 16, lineHeight: 22 },
  rowSub: { fontSize: 12, lineHeight: 16 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countBtn: { fontSize: 20, fontWeight: '600', paddingHorizontal: 4 },
  cheer: { position: 'absolute', left: 14, top: 0, bottom: 0, width: 20 },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  aiMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dash: { position: 'absolute', left: 14, right: 14, top: 0, height: 1, overflow: 'hidden' },
  dashLine: { height: 3, borderWidth: 1, borderStyle: 'dashed' },
  aiText: { flex: 1, fontSize: 15 },
  empty: { paddingHorizontal: 14, paddingBottom: 14, gap: 2 },
  emptyTitle: { fontSize: 15 },
  emptySub: { fontSize: 12, lineHeight: 17 },
  fnote: { fontSize: 12, lineHeight: 16, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },
  bonus: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 },
  bonusText: { fontSize: 12 },
  bonusBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 96, paddingHorizontal: 18, paddingTop: 8 },
  barCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', maxWidth: 26, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barDay: { fontSize: 11, lineHeight: 14, fontWeight: '500' },
  tip: { position: 'absolute', top: -4, zIndex: 2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, minWidth: 64, alignItems: 'center' },
  tipText: { fontSize: 11, fontWeight: '600' },
  ghead: { height: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 6 },
  gheadText: { flex: 1, fontSize: 13, fontWeight: '600' },
  gheadN: { fontSize: 12 },
  xpRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  xpLabel: { flex: 1, fontSize: 14.5 },
  xpAmt: { fontSize: 13, fontWeight: '600' },
  newdot: { width: 7, height: 7, borderRadius: 4 }
})
