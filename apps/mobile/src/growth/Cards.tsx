// 23 §2 ③~⑦: 요약 칩 · 진화 길 · 이번 주 목표 · 이번 주 XP · 주간 리포트 목록 (시안 B1·B2, 공용 키트 묶음 카드)
import { STAGES, weekLabel, XP, type Species } from '@sprout/schema/growth'
import { DECOR, ITEMS } from '@sprout/schema/wardrobe'
import { addDays } from '@sprout/schema/time'
import { useRouter } from 'expo-router'
import { BarChart3, Check, ChevronRight, Lock, Target } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { Checkbox } from '../ui/Checkbox'
import { useToast } from '../ui/Toast'
import { completeTasks } from '../data/tasks'
import { useLiveQuery } from '../data/rows'
import type { Palette } from '../theme/palette'
import { CharacterArt } from './art/CharacterArt'
import { useRefTitles } from './data'
import { signed, weekBars, xpDayGroups, xpLabel, weekTotal, type ReportRow, type XpRow } from './logic'

const card = (p: Palette) => ({ backgroundColor: p.cardBg })
/** 진화 길 미리보기: 그 단계 레벨(from~to)에 열리는 옷·장식 이름(43 §6 해금표 — 옛 10 §3.2.7 장식 표가 아니라 wardrobe) */
const opensIn = (from: number, to: number) => [
  ...ITEMS.filter((i) => 'lv' in i.rule && i.rule.lv >= from && i.rule.lv <= to).map((i) => i.name),
  ...DECOR.filter((d) => d.lv >= from && d.lv <= to).map((d) => d.name)
].join(' · ')

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
              열리는 것: {opensIn(sel.from, (STAGES.find((x) => x.stage === sel.stage + 1)?.from ?? 99) - 1) || '—'}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}

/** 43 §18.2 시트의 오늘 할 일(체크 22): 오늘 마감 미완료 할 일을 여기서 바로 끝낸다 → 무대 캐릭터가 XP·기뻐하기로 바로 반응(완료 = 공용 completeTasks, 되돌리기 토스트) */
export function TodayCard({ p, today }: { p: Palette; today: string }) {
  const toast = useToast()
  const router = useRouter()
  const rows = useLiveQuery<{ id: string; title: string; priority: number; status: number }>(
    'SELECT id, title, priority, status FROM tasks WHERE deleted_at IS NULL AND status = 0 AND parent_id IS NULL AND due_at >= ? AND due_at < ? ORDER BY priority DESC, sort_order, created_at LIMIT 6',
    [today, addDays(today, 1)]
  ).data
  const [gone, setGone] = useState<Set<string>>(new Set())
  const open = rows.filter((r) => !gone.has(r.id))
  if (!open.length) return null
  const done = (id: string) => {
    setGone((g) => new Set(g).add(id))
    void completeTasks([id]).then((u) => { if (u) toast.show('작업이 완료되었습니다.', { undo: async () => { await u(); setGone((g) => { const n = new Set(g); n.delete(id); return n }) } }) })
  }
  return (
    <View style={[s.card, card(p)]}>
      <View style={s.head}>
        <Text style={[s.headTitle, { color: p.textPrimary }]}>오늘 할 일</Text>
        <Text style={[s.headRight, { color: p.textSecondary }]}>{open.length}</Text>
      </View>
      {open.map((t, i) => (
        <View key={t.id} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
          <Checkbox priority={t.priority} done={false} size={22} label={`${t.title} 완료`} onPress={() => done(t.id)} />
          <Pressable style={s.rowText} onPress={() => router.push(`/task/${t.id}`)} accessibilityRole="button">
            <Text style={[s.rowTitle, { color: p.textPrimary }]} numberOfLines={1}>{t.title}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}

// ⑤ 이번 주 목표 = GoalsSheet.tsx(10 §4.6 편집기)

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
