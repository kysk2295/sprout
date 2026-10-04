// 28 모바일 일기 — 머리(‹ · 🔍 · 📅) · 큰 제목 "일기" · 세그먼트 쓰기|돌아보기 · 본문. 처음 열 때 동의 시트(15 §3.1, 기기에만).
import { useRouter } from 'expo-router'
import { CalendarDays, ChevronLeft, Cloud, Lock, RotateCcw, Search } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEntries, useEntry, useBuddy } from '../../src/diary/data'
import { josa } from '../../src/diary/logic'
import { BuddyArt } from '../../src/diary/parts'
import { setConsent, useDiaryPrefs } from '../../src/diary/prefs'
import { Review } from '../../src/diary/Review'
import { setDiaryState, useDiaryState } from '../../src/diary/state'
import { WritePage } from '../../src/diary/WritePage'
import { KEY, preload } from '../../src/growth/store'
import { useMotionReduced } from '../../src/growth/motion'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { BigTitle, NavRow } from '../../src/ui/Header'
import { Segmented } from '../../src/ui/Segmented'

export default function Diary() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { date, tab, month } = useDiaryState()
  const today = dayKey()
  const entries = useEntries()
  const entry = useEntry(date)
  const buddy = useBuddy()
  const prefs = useDiaryPrefs()
  const reduced = useMotionReduced()
  const [askConsent, setAskConsent] = useState(false)
  useEffect(() => { void preload([KEY.motion]) }, [])
  // 동의는 처음 한 번(저장소를 읽은 뒤 아직 묻지 않았으면)
  useEffect(() => { if (prefs.ready && prefs.consent === null) setAskConsent(true) }, [prefs.ready, prefs.consent])

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow
        left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>}
        right={<>
          <GlassButton label="일기 검색" onPress={() => router.push('/diary/search')}><Search size={19} color={p.textPrimary} /></GlassButton>
          <GlassButton label="달력" onPress={() => router.push('/diary/calendar')}><CalendarDays size={19} color={p.textPrimary} /></GlassButton>
        </>}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <BigTitle title="일기" />
          <Segmented style={{ marginHorizontal: 16, marginBottom: 12 }} value={tab} onChange={(t) => setDiaryState({ tab: t, month: t === 'review' ? date.slice(0, 7) : month })}
            items={[{ key: 'write', label: '쓰기' }, { key: 'review', label: '돌아보기' }]} />
          {tab === 'write'
            ? <WritePage date={date} today={today} entry={entry} entries={entries} buddy={buddy} stage={buddy.stage} reduced={reduced} />
            : <Review month={month} entries={entries} today={today} buddy={buddy} stage={buddy.stage} reduced={reduced} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 동의(15 §9.7): 그림 · 제목 · 사실 3줄 · 한계 · [혼자 쓸게요] [나누기] */}
      <Modal visible={askConsent} transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={() => setAskConsent(false)}>
        <View style={[s.scrim, { backgroundColor: p.scrim }]}>
          <View style={[s.sheet, { backgroundColor: p.sheetBg, paddingBottom: insets.bottom + 16 }]}>
            <View style={{ alignItems: 'center' }}><BuddyArt buddy={buddy} stage={buddy.stage} size={96} mood="smile" still={reduced} /></View>
            <Text style={[s.title, { color: p.textPrimary }]}>일기를 {josa(buddy.name, '와', '과')} 나눌까요?</Text>
            {[
              { icon: <Cloud size={18} color={p.textSecondary} />, text: '일기 글이 sprout AI(운영자의 Mac mini)에서 처리돼요' },
              { icon: <Lock size={18} color={p.textSecondary} />, text: '나만 보기로 둔 날은 보내지 않아요' },
              { icon: <RotateCcw size={18} color={p.textSecondary} />, text: '언제든 일기 ⋯ 메뉴에서 끌 수 있어요' }
            ].map((f) => <View key={f.text} style={s.fact}>{f.icon}<Text style={[s.factText, { color: p.textPrimary }]}>{f.text}</Text></View>)}
            <Text style={[s.small, { color: p.textTertiary }]}>{josa(buddy.name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요</Text>
            <View style={s.btns}>
              <Pressable accessibilityRole="button" onPress={() => { setConsent(false); setAskConsent(false) }} style={[s.btn, { backgroundColor: p.bgSelected }]}><Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600' }}>혼자 쓸게요</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setConsent(true); setAskConsent(false) }} style={[s.btn, { backgroundColor: p.accent }]}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>나누기</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
const s = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  factText: { flex: 1, fontSize: 14.5, lineHeight: 20 },
  small: { fontSize: 12.5, textAlign: 'center' },
  btns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }
})
