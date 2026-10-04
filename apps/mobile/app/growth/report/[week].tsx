// 주간 리포트 읽기(23 §2.1, 시안 B3 — "○○의 일기"): 캐릭터 한마디 · 칩 · 해낸 것 · 목표 결과(이번 주로 넘기기) · 다음 주 제안.
// 열면 seen_at을 쓴다. 휴대폰엔 [다시 시도] 없음(M-G2 — 데스크톱이 다시 시도).
import { useQuery } from '@powersync/react-native'
import { progressFromEvents, readTextJson, SPECIES, weekLabel, XP, type Species } from '@sprout/schema/growth'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, ChevronLeft, Circle } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CharacterArt } from '../../../src/growth/art/CharacterArt'
import { addGoal, markReportSeen, useReport, useWeekGoalTitles } from '../../../src/growth/data'
import { CHARACTER_SQL } from '../../../src/growth/goalCore'
import { hm, parseStats, reportHeadline, reportLead, sameTitle, signed, weekStartOf, type CharacterRow } from '../../../src/growth/logic'
import { dayKey } from '../../../src/lib/dates'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { GlassButton } from '../../../src/ui/Glass'
import { useToast } from '../../../src/ui/Toast'

export default function Report() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { week } = useLocalSearchParams<{ week: string }>()
  const row = useReport(week ?? '')
  const ch = useQuery<CharacterRow>(CHARACTER_SQL).data[0]
  const species: Species | null = ch?.species ?? null
  const stage = progressFromEvents(useQuery<{ amount: number; created_at: string }>('SELECT amount, created_at FROM xp_events').data).stage
  const today = dayKey()
  const thisWeek = weekStartOf(today)
  const current = useWeekGoalTitles(thisWeek)
  const full = current.length >= XP.goalsPerWeek

  // 열면 본 것으로(목록·데스크톱의 새 점이 사라진다)
  const marked = useRef(false)
  useEffect(() => { if (row && !row.seen_at && !marked.current) { marked.current = true; void markReportSeen(today, row.id) } }, [row, today])

  const stats = row ? parseStats(row.stats_json) : null
  const text = readTextJson(row?.text_json)
  const lead = stats ? reportLead(stats) : ''
  const name = species ? (ch?.name || SPECIES[species].name) : '알'

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.nav, { marginTop: insets.top }]}>
        <GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <Text style={[s.navTitle, { color: p.textPrimary }]} numberOfLines={1}>{week ? weekLabel(week) : ''}</Text>
        <View style={{ width: 40 }} />
      </View>
      {!row || !stats ? (
        <Text style={[s.missing, { color: p.textTertiary }]}>{row ? '리포트를 읽을 수 없어요.' : '이 주의 리포트가 아직 이 기기에 없어요. 동기화되면 보여요.'}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 30 }}>
          <View style={s.say}>
            <CharacterArt species={species} stage={stage} size={64} mood="happy" />
            <View style={[s.bubble, { backgroundColor: p.cardBg }]} accessibilityLabel={`${name}의 한마디`}>
              <Text style={[s.bubbleText, { color: p.textPrimary }]}>{reportHeadline(row.text_json, stats)}</Text>
            </View>
          </View>
          <View style={s.chips}>
            <Chip p={p} t={`완료 ${stats.completed}`} />
            {stats.scheduledMinutes > 0 ? <Chip p={p} t={`일정 ${hm(stats.scheduledMinutes)}`} /> : null}
            {stats.goals.length > 0 ? <Chip p={p} t={`목표 ${stats.goalsAchieved}/${stats.goals.length}`} /> : null}
            <Chip p={p} t={`${signed(stats.xp.total)} XP`} acc />
          </View>

          {!text.report ? (
            <Text style={[s.ai, { color: p.textTertiary }]}>{text.reportTried ? '이번 주 문장은 만들지 못했어요. 숫자 리포트만 남겨 둘게요.' : '지금은 AI를 쓸 수 없어요'}</Text>
          ) : null}

          <View style={s.sec}>
            <Text style={[s.h4, { color: p.textTertiary }]}>해낸 것</Text>
            {text.report ? <Text style={[s.body, { color: p.textPrimary }]}>{text.report.done}</Text> : <Text style={[s.body, { color: p.textPrimary }]}>완료한 할 일 {stats.completed}개</Text>}
            {lead ? <Text style={[s.meta, { color: p.textTertiary }]}>{lead}</Text> : null}
          </View>

          <View style={s.sec}><Text style={[s.h4, { color: p.textTertiary }]}>목표 결과</Text></View>
          {stats.goals.length === 0 ? <Text style={[s.meta, { color: p.textTertiary, paddingHorizontal: 16 }]}>이 주에는 목표가 없었어요.</Text> : (
            <View style={[s.card, { backgroundColor: p.cardBg }]}>
              {stats.goals.map((g, i) => {
                const carried = current.some((c) => sameTitle(c.title, g.title))
                return (
                  <View key={g.id} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
                    {g.achieved
                      ? <View style={[s.ok, { backgroundColor: p.textQuaternary }]}><Check size={11} color="#fff" strokeWidth={3} /></View>
                      : <Circle size={16} color={p.textTertiary} />}
                    <View style={{ flex: 1, paddingVertical: 8 }}>
                      <Text style={[s.rowTitle, { color: p.textPrimary }]} numberOfLines={2}>{g.title}</Text>
                      {!g.achieved ? <Text style={[s.rowSub, { color: p.textTertiary }]}>못 이룸{g.target > 1 ? ` · ${g.progress}/${g.target}` : ''}</Text> : null}
                    </View>
                    {g.achieved ? <Text style={[s.rowSub, { color: p.textTertiary }]}>이룸</Text>
                      : row.week_start < thisWeek ? (
                        carried ? <Text style={[s.rowSub, { color: p.textTertiary }]}>넘김</Text> : (
                          <Pressable style={[s.carry, { borderColor: p.borderDivider, opacity: full ? 0.5 : 1 }]} disabled={full} accessibilityRole="button"
                            onPress={async () => {
                              const r = await addGoal(today, thisWeek, g.title, g.target, 'manual')
                              toast.show(r === 'full' ? `이번 주는 ${XP.goalsPerWeek}개까지예요` : '이번 주 목표로 넘겼어요', { error: r === 'full' })
                            }}>
                            <Text style={[s.carryText, { color: p.textPrimary }]}>이번 주로 넘기기</Text>
                          </Pressable>
                        )
                      ) : null}
                  </View>
                )
              })}
            </View>
          )}
          {text.report ? <Text style={[s.body, { color: p.textPrimary, paddingHorizontal: 16, paddingTop: 10 }]}>{text.report.goals}</Text> : null}

          {text.report?.next.length ? (
            <View style={s.sec}>
              <Text style={[s.h4, { color: p.textTertiary }]}>다음 주 제안</Text>
              {text.report.next.map((n) => <Text key={n} style={[s.body, { color: p.textPrimary }]}>•  {n}</Text>)}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

function Chip({ p, t, acc }: { p: ReturnType<typeof usePalette>; t: string; acc?: boolean }) {
  return <View style={[s.chip, { backgroundColor: acc ? p.accentSubtle : p.bgSelected }]}><Text style={[s.chipText, { color: acc ? p.accent : p.textSecondary }, acc && { fontWeight: '700' }]}>{t}</Text></View>
}

const s = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  missing: { padding: 24, textAlign: 'center', fontSize: 14 },
  say: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  bubble: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  ai: { fontSize: 13, paddingHorizontal: 16, paddingTop: 12 },
  sec: { paddingHorizontal: 16, paddingTop: 18, gap: 6 },
  h4: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 23 },
  meta: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  card: { marginHorizontal: 12, marginTop: 6, borderRadius: 14, overflow: 'hidden' },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  ok: { width: 16, height: 16, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, lineHeight: 22 },
  rowSub: { fontSize: 12, lineHeight: 16 },
  carry: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  carryText: { fontSize: 13, fontWeight: '600' }
})
