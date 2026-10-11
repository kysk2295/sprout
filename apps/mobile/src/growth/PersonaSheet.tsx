// 50 §8 캐릭터 소개(휴대폰): 성장 탭 HUD `이름 · 종` 줄 끝 정보 단추 → 공용 BottomSheet(아래로 끌기·딤 누르기·✕로 닫힘, 길면 안에서 스크롤).
// 내용(50 §8.2): 머리(그림 64 · 이름 · 종 · 성향) · 소개 · 성향 막대(answers_json이 있을 때만) · 말투 · 좋아하는 것 · 돕는 방식 · 말 예시 두 줄 · 바닥(마스코트만).
// 읽기만(50 §8.4) — 카드 글은 공용 PERSONAS 한 곳, 비율은 scoreSurvey. 쓰기 없음.
import { MASCOT_NAME } from '@sprout/schema/characterArt'
import { scoreSurvey, SPECIES, type Pick2, type Species } from '@sprout/schema/growth'
import { personaIdOf, personaOf } from '@sprout/schema/persona'
import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLiveQuery } from '../data/rows'
import type { Palette } from '../theme/palette'
import { BottomSheet } from '../ui/BottomSheet'
import { SheetHead } from '../ui/SheetHead'
import { CharacterArt, type CharacterWear } from './art/CharacterArt'

/** answers_json → 축 비율. 기록이 없거나 깨졌으면 null(예전 계정 — 막대 숨김, 50 §8.2-3) */
function ratiosOf(raw: string | null | undefined) {
  if (!raw) return null
  try {
    const a = JSON.parse(raw) as unknown
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null
    const answers = Object.fromEntries(Object.entries(a as Record<string, unknown>).filter(([, v]) => v === 'A' || v === 'B')) as Record<string, Pick2>
    if (!Object.keys(answers).length) return null
    const sc = scoreSurvey(answers)
    return { plan: sc.plan.ratioA, focus: sc.focus.ratioA }
  } catch { return null }
}

export function PersonaSheet({ p, visible, onClose, characterId, species, stage, name, wear }: {
  p: Palette; visible: boolean; onClose: () => void
  characterId: string | undefined; species: Species | null; stage: number; name: string
  /** 무대와 같은 입힌 모습 */
  wear?: CharacterWear
}) {
  const ins = useSafeAreaInsets()
  const pr = personaOf(personaIdOf(species))
  const row = useLiveQuery<{ answers_json: string | null }>('SELECT answers_json FROM characters WHERE id = ?', [characterId ?? '']).data[0]
  const ratios = useMemo(() => (species ? ratiosOf(row?.answers_json) : null), [species, row?.answers_json])
  const sub = species ? `${SPECIES[species].name} · ${pr.ui.kind}` : `${MASCOT_NAME} · ${pr.ui.kind}`
  const label = (t: string) => <Text style={[s.label, { color: p.textTertiary }]}>{t}</Text>

  return (
    <BottomSheet visible={visible} onClose={onClose} mid={0.72} label="캐릭터 소개"
      head={<SheetHead compact title="캐릭터 소개" onClose={onClose} />}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: ins.bottom + 24 }}>
        {/* 1 머리 */}
        <View style={s.head}>
          <CharacterArt species={species} stage={stage} size={64} wear={species ? wear : undefined} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.name, { color: p.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={[s.sub, { color: p.textSecondary }]} numberOfLines={1}>{sub}</Text>
          </View>
        </View>
        {/* 2 소개 */}
        <Text style={[s.body, { color: p.textPrimary }]}>{pr.ui.intro}</Text>
        {/* 3 성향 막대(종 + 답 기록이 있을 때만) */}
        {ratios ? (
          <View style={s.sec}>
            <Bar p={p} a="계획" b="즉흥" ratio={ratios.plan} />
            <Bar p={p} a="몰입" b="멀티" ratio={ratios.focus} />
          </View>
        ) : null}
        {/* 4 말투 */}
        <View style={s.sec}>{label('말투')}<Text style={[s.body, { color: p.textPrimary }]}>{pr.ui.toneLabel}</Text></View>
        {/* 5 좋아하는 것 */}
        <View style={s.sec}>
          {label('좋아하는 것')}
          <View style={s.chips}>
            {pr.likes.map((l) => <View key={l} style={[s.chip, { backgroundColor: p.dark ? p.bgSelected : p.pageBg }]}><Text style={[s.chipT, { color: p.textPrimary }]}>{l}</Text></View>)}
          </View>
        </View>
        {/* 6 돕는 방식 — 마스코트는 같은 글이 바닥 줄이라 바닥만 */}
        {species ? <View style={s.sec}>{label('이렇게 도와줘요')}<Text style={[s.body, { color: p.textPrimary }]}>{pr.ui.help}</Text></View> : null}
        {/* 7 말 예시(AI 비서 말풍선 축소판) */}
        <View style={s.sec}>
          {label('이런 식으로 말해요')}
          <View style={[s.me, { backgroundColor: p.accent }]}><Text style={[s.bubT, { color: p.onAccent }]}>{pr.example.user}</Text></View>
          <View style={[s.them, { backgroundColor: p.dark ? p.bgSelected : p.pageBg }]}><Text style={[s.bubT, { color: p.textPrimary }]}>{pr.example.reply}</Text></View>
        </View>
        {/* 8 바닥(마스코트만) */}
        {!species ? <Text style={[s.foot, { color: p.textSecondary }]}>{pr.ui.help}</Text> : null}
      </ScrollView>
    </BottomSheet>
  )
}

/** 성향 막대 한 줄: `계획 75% · 즉흥 25%` + 6px 막대(채운 쪽 = 강조색, 나머지 = 경계선색) */
function Bar({ p, a, b, ratio }: { p: Palette; a: string; b: string; ratio: number }) {
  const pa = Math.round(ratio * 100)
  return (
    <View style={{ gap: 5 }} accessible accessibilityLabel={`${a} ${pa}퍼센트, ${b} ${100 - pa}퍼센트`}>
      <Text style={[s.barT, { color: p.textSecondary }]}>{a} {pa}% · {b} {100 - pa}%</Text>
      <View style={[s.track, { backgroundColor: p.borderRow }]}><View style={{ width: `${pa}%`, height: '100%', backgroundColor: p.accent, borderRadius: 3 }} /></View>
    </View>
  )
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  sub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  body: { fontSize: 13, lineHeight: 19 },
  sec: { marginTop: 16, gap: 6 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipT: { fontSize: 12, lineHeight: 16 },
  barT: { fontSize: 12, lineHeight: 16 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  me: { alignSelf: 'flex-end', maxWidth: '82%', borderRadius: 14, borderBottomRightRadius: 5, paddingHorizontal: 11, paddingVertical: 7 },
  them: { alignSelf: 'flex-start', maxWidth: '82%', borderRadius: 14, borderBottomLeftRadius: 5, paddingHorizontal: 11, paddingVertical: 7, marginTop: 6 },
  bubT: { fontSize: 13, lineHeight: 18 },
  foot: { fontSize: 12, lineHeight: 16, marginTop: 20, textAlign: 'center' }
})
