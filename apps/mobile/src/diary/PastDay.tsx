// 28 §8.2·§8.10 지난 날: 저장한 일기 카드(편마다 시각·제목·태그) + `느리와 나눈 이야기 N개`(접힘) + `그날 끝낸 할 일 N개`(접힘).
// 빈 날 = `그날 이야기 하기`(그날 기준 질문으로 대화) · `그냥 쓸래요`. 좌우로 밀면 앞뒤 날(밀기는 화면이 준다).
import { CheckSquare, ChevronDown, ChevronRight, Lock, MessageCircle } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { GestureDetector, type GestureType } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '../theme/ThemeProvider'
import { alpha } from '../theme/palette'
import { parseSections } from '@sprout/schema/diaryPrompts'
import { MoodFace } from './art'
import { useDayStats, useMessages } from './data'
import { isWritten, josa, mayCallAi, moodOf, parseBuddyReply, type Buddy, type DiaryEntry } from './logic'
import { BuddyArt } from './parts'
import { useDiaryPrefs } from './prefs'

export function PastDay({ date, entry, buddy, reduced, swipe, onChat, onFree }: {
  date: string; entry: DiaryEntry | undefined; buddy: Buddy & { stage: number }; reduced: boolean; swipe: GestureType; onChat: () => void; onFree: () => void
}) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const messages = useMessages(date)
  const stats = useDayStats(date)
  const prefs = useDiaryPrefs()
  const [openTalk, setOpenTalk] = useState(false)
  const [openDone, setOpenDone] = useState(false)
  const name = buddy.name
  const written = !!entry && isWritten(entry)
  const m = moodOf(entry?.mood)
  const sections = parseSections(entry?.content)
  const talk = messages.filter((x) => x.safety !== 1)
  const canTalk = written && !entry?.private && prefs.consent !== false
  return (
    <GestureDetector gesture={swipe}>
      <ScrollView contentContainerStyle={[s.wrap, { paddingBottom: insets.bottom + 32 }]}>
        {!written ? (
          <View style={s.empty}>
            <BuddyArt buddy={buddy} stage={buddy.stage} size={88} mood="smile" still={reduced} />
            <Text style={[s.emptyTitle, { color: p.textPrimary }]}>이 날은 비어 있어요</Text>
            <Text style={[s.emptySub, { color: p.textTertiary }]}>{josa(name, '가', '이')} 그날 이야기를 물어볼게요</Text>
            <Pressable accessibilityRole="button" onPress={onChat} style={[s.btn, { backgroundColor: p.accent }]}><Text style={[s.btnText, { color: p.onAccent }]}>그날 이야기 하기</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onFree} style={[s.btn, { borderWidth: 1, borderColor: p.borderStrong }]}><Text style={[s.btnText, { color: p.textPrimary }]}>그냥 쓸래요</Text></Pressable>
            {stats.done ? <Text style={[s.emptySub, { color: p.textTertiary, marginTop: 12 }]}>그날 끝낸 할 일 {stats.done}개</Text> : null}
          </View>
        ) : (
          <>
            {entry?.private ? (
              <View style={[s.lockbar, { backgroundColor: p.bgSelected }]}>
                <Lock size={15} color={p.accentInk} />
                <Text style={{ color: p.textSecondary, fontSize: 13, flex: 1 }}>나만 보기 — {josa(name, '가', '이')} 읽지 않은 날이에요</Text>
              </View>
            ) : null}
            <View style={[s.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
              {m ? <View style={s.pm}><MoodFace mood={m.value} size={34} /><Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '700' }}>{m.label}</Text></View> : null}
              {sections.length ? sections.map((sec, i) => (
                <View key={i} style={[i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider, paddingTop: 12, marginTop: 12 }, { gap: 6 }]}>
                  {sec.time || sec.title ? <Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '800' }}>{sec.time ? <Text style={{ color: p.textTertiary, fontWeight: '600', fontSize: 13 }}>{sec.time}  </Text> : null}{sec.title}</Text> : null}
                  {sec.tags.length ? <View style={s.tags}>{sec.tags.map((t) => <View key={t} style={[s.tag, { backgroundColor: alpha(p.accent, 0.1) }]}><Text style={{ color: p.accentInk, fontSize: 12, fontWeight: '600' }}>{t}</Text></View>)}</View> : null}
                  <Text style={[s.pt, { color: p.textPrimary }]} selectable>{sec.body}</Text>
                </View>
              )) : <Text style={[s.pt, { color: p.textPrimary }]}>(기분만 남겼어요)</Text>}
            </View>
            {talk.length && !entry?.private ? (
              <>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: openTalk }} onPress={() => setOpenTalk((v) => !v)} style={[s.row, { backgroundColor: p.cardBg }]}>
                  <MessageCircle size={18} color={p.textSecondary} />
                  <Text style={[s.rowText, { color: p.textPrimary }]}>{josa(name, '와', '과')} 나눈 이야기</Text>
                  <Text style={{ color: p.textTertiary, fontSize: 13 }}>{talk.length}개</Text>
                  {openTalk ? <ChevronDown size={18} color={p.textTertiary} /> : <ChevronRight size={18} color={p.textTertiary} />}
                </Pressable>
                {openTalk ? (
                  <View style={s.talk}>
                    {talk.map((x) => (
                      <Text key={x.id} style={{ color: p.textSecondary, fontSize: 13.5, lineHeight: 20 }}>
                        <Text style={{ color: p.textPrimary, fontWeight: '700' }}>{x.role === 'me' ? '나' : name} </Text>
                        {x.role === 'buddy' && !x.safety ? parseBuddyReply(x.content).text : x.content}
                        {x.role === 'buddy' && !x.safety ? <Text style={{ color: p.brandApricot, fontSize: 10, fontWeight: '800' }}>  AI</Text> : null}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            {canTalk && mayCallAi({ consent: prefs.consent ?? true, private: entry?.private, solo: prefs.isSolo(date) }) ? (
              <Pressable accessibilityRole="button" onPress={onChat} style={[s.row, { backgroundColor: p.cardBg }]}>
                <MessageCircle size={18} color={p.accentInk} />
                <Text style={[s.rowText, { color: p.accentInk }]}>{josa(name, '와', '과')} 이 날 이야기하기</Text>
                <ChevronRight size={18} color={p.textTertiary} />
              </Pressable>
            ) : null}
            {stats.done ? (
              <>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: openDone }} onPress={() => setOpenDone((v) => !v)} style={[s.row, { backgroundColor: p.cardBg }]}>
                  <CheckSquare size={18} color={p.textSecondary} />
                  <Text style={[s.rowText, { color: p.textPrimary }]}>그날 끝낸 할 일</Text>
                  <Text style={{ color: p.textTertiary, fontSize: 13 }}>{stats.done}개</Text>
                  {openDone ? <ChevronDown size={18} color={p.textTertiary} /> : <ChevronRight size={18} color={p.textTertiary} />}
                </Pressable>
                {openDone ? <View style={s.talk}>{stats.doneTitles.map((t, i) => <Text key={i} style={{ color: p.textSecondary, fontSize: 13.5, lineHeight: 20 }}>✓ {t}</Text>)}</View> : null}
              </>
            ) : null}
          </>
        )}
        <Text style={[s.hint, { color: p.textQuaternary }]}>← 밀어서 다음 날 · 밀어서 전날 →</Text>
      </ScrollView>
    </GestureDetector>
  )
}
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 14, lineHeight: 20 },
  btn: { height: 48, minWidth: 180, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { fontSize: 15, fontWeight: '700' },
  lockbar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  card: { borderRadius: 20, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  pm: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pt: { fontSize: 16.5, lineHeight: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 16 },
  rowText: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  talk: { paddingHorizontal: 6, gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  hint: { textAlign: 'center', fontSize: 11.5, marginTop: 16 }
})
