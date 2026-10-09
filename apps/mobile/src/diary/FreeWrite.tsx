// 28 §8.2·§8.4 그냥 쓰기: 기분 얼굴 줄(고른 것 46 + 이름, 나머지 바램) · 글 17/28 화면 가득 · 키보드 위 도구 막대 50
// (기분 · 나만 보기 · 질문 · 대화로 · 완료). 0.6초 뒤 자동 저장(diary_entries.content). 도구 막대는 키보드 바로 위(transform만 — keyboard.ts).
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import { HelpCircle, Lock, LockOpen, MessageCircle } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from '../ui/haptics'
import { useToast } from '../ui/Toast'
import { MoodFace } from './art'
import { MoodRow } from './chatParts'
import { saveEntry, setPrivate, touchEntry } from './data'
import { useKeyboardHeight, useKeyboardLift } from './keyboard'
import { josa, promptFor, type DiaryEntry } from './logic'

export type FreeStatus = 'idle' | 'saving' | 'saved'

export function FreeWrite({ date, entry, name, onChat, onStatus }: { date: string; entry: DiaryEntry | undefined; name: string; onChat: () => void; onStatus: (s: FreeStatus) => void }) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const [text, setText] = useState(entry?.content ?? '')
  const typed = useRef(false)
  // 동기화로 늦게 들어온 글: 아직 손대지 않았으면 받아 온다
  useEffect(() => { if (!typed.current && entry?.content != null) setText(entry.content) }, [entry?.content])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<string | null>(null)
  const flush = () => {
    clearTimeout(timer.current)
    const v = pending.current
    if (v === null) return
    pending.current = null
    void saveEntry(date, { content: v }).then(() => { touchEntry(date); onStatus('saved') })
  }
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v: string) => {
    typed.current = true
    setText(v)
    pending.current = v
    onStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }
  const mood = entry?.mood ?? null
  const pickMood = (v: number) => { hx.tick(); setMoodPop(false); void saveEntry(date, { mood: mood === v ? null : v }).then(() => touchEntry(date)) }
  const priv = !!entry?.private
  const togglePriv = () => { hx.tap(); void setPrivate(date, !priv).then(() => toast.show(!priv ? `이 날은 나만 봐요. ${josa(name, '가', '이')} 읽지 않아요` : `${josa(name, '와', '과')} 같이 읽어요`)) }
  const [shift, setShift] = useState(0)
  const input = useRef<TextInput>(null)
  const ask = () => {
    hx.tick()
    const q = `Q. ${promptFor(date, shift)}\n`
    setShift((n) => n + 1)
    change(text.startsWith('Q. ') ? q + text.split('\n').slice(1).join('\n').replace(/^\n+/, '') : q + text.replace(/^\n+/, ''))
    setTimeout(() => input.current?.focus(), 30)
  }
  const [moodPop, setMoodPop] = useState(false)
  const kbH = useKeyboardHeight()
  const lift = useKeyboardLift(insets.bottom)
  const [barH, setBarH] = useState(50 + insets.bottom)
  const onBar = (e: LayoutChangeEvent) => setBarH(Math.round(e.nativeEvent.layout.height))
  const done = () => { flush(); Keyboard.dismiss(); setMoodPop(false); if (text.trim()) toast.show('저장했어요') }

  return (
    <View style={{ flex: 1 }}>
      {kbH ? null : (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
          <MoodRow onPick={pickMood} selected={mood} />
        </Animated.View>
      )}
      <TextInput
        ref={input}
        value={text}
        onChangeText={change}
        multiline
        placeholder="오늘 하루는 어땠어요?"
        placeholderTextColor={p.textTertiary}
        accessibilityLabel="일기 글"
        textAlignVertical="top"
        style={[s.text, { color: p.textPrimary, marginBottom: barH + Math.max(0, kbH - insets.bottom) }]}
      />
      {moodPop && kbH ? (
        <Animated.View entering={FadeIn.duration(120)} style={[s.pop, { backgroundColor: p.sheetBg, bottom: barH + Math.max(0, kbH - insets.bottom) + 6, shadowOpacity: p.dark ? 0.5 : 0.15 }]}>
          <MoodRow onPick={pickMood} selected={mood} />
        </Animated.View>
      ) : null}
      <Animated.View onLayout={onBar} style={[s.bar, { paddingBottom: insets.bottom, backgroundColor: p.cardBg, borderTopColor: p.borderDivider }, lift]}>
        <View style={s.barRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={mood ? '기분 바꾸기' : '기분 고르기'} onPress={() => setMoodPop((v) => !v && !!kbH)} style={[s.tool, mood ? { backgroundColor: alpha(p.accent, 0.12) } : null]}>
            {mood ? <MoodFace mood={mood} size={26} /> : <View style={{ opacity: 0.45 }}><MoodFace mood={3} size={26} faded /></View>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="나만 보기" accessibilityState={{ selected: priv }} onPress={togglePriv} style={[s.tool, priv && { backgroundColor: alpha(p.accent, 0.12) }]}>
            {priv ? <Lock size={20} color={p.accentInk} /> : <LockOpen size={20} color={p.textSecondary} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="질문 넣기" onPress={ask} style={s.tool}><HelpCircle size={20} color={p.textSecondary} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="대화로 쓰기" onPress={() => { flush(); onChat() }} style={s.tool}><MessageCircle size={20} color={p.textSecondary} /></Pressable>
          <Pressable accessibilityRole="button" onPress={done} style={[s.tool, { marginLeft: 'auto', paddingHorizontal: 12 }]}><Text style={{ color: p.accentInk, fontSize: 15, fontWeight: '700' }}>완료</Text></Pressable>
        </View>
      </Animated.View>
    </View>
  )
}
const s = StyleSheet.create({
  text: { flex: 1, fontSize: 17, lineHeight: 28, paddingHorizontal: 18, paddingTop: 6 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
  barRow: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  tool: { minWidth: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pop: { position: 'absolute', left: 8, right: 8, borderRadius: 20, paddingTop: 8, shadowColor: '#000', shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
})
