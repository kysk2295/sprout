// 28 §8.11 받는 글 — 저장소(createTextStream)를 이 부품들만 구독한다. Conversation 전체는 글이 붙을 때 다시 그리지 않는다(39 §11).
// 드러내기는 30fps(33ms)로 묶은 프레임마다 revealNext. 움직임 줄이기면 받은 조각 그대로.
import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { revealNext, type TextStream } from '@sprout/schema/diaryTalk'
import { usePalette } from '../theme/ThemeProvider'
import { ProgressLine } from './chatParts'
import type { Buddy } from './logic'
import { BuddyArt } from './parts'

const FRAME_MS = 33
const nowMs = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now())

export function useRevealed(stream: TextStream, reduced: boolean) {
  const snap = useSyncExternalStore(stream.subscribe, stream.get)
  const [n, setN] = useState(() => (reduced ? snap.text.length : Math.min(snap.shown, snap.text.length)))
  const pos = useRef(n)
  useEffect(() => {
    const target = snap.text
    if (reduced) { pos.current = target.length; setN(target.length); stream.mark(target.length); return }
    if (pos.current > target.length) pos.current = 0
    let raf = 0
    let last = nowMs()
    const step = () => {
      const t = nowMs()
      if (t - last < FRAME_MS) { raf = requestAnimationFrame(step); return }
      const r = revealNext(pos.current, target, t - last)
      last = t
      pos.current = r.pos
      setN(r.shown)
      stream.mark(r.shown)
      if (r.shown < target.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [snap.seq, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  return { text: snap.text.slice(0, n), title: snap.title }
}

/** 받는 말풍선 안 글 — 이 부품만 다시 그린다 */
export const StreamText = memo(function StreamText({ stream, reduced, style }: { stream: TextStream; reduced: boolean; style: object }) {
  return <Text style={style}>{useRevealed(stream, reduced).text}</Text>
})

/** 일기로 옮기는 중 카드: 생각 얼굴 · 진행 줄 · 흘러나오는 제목·본문(JSON은 안 보임) · 멈추기 */
export function DistillCard({ stream, buddy, name, again, reduced, onStop }: { stream: TextStream; buddy: Buddy & { stage: number }; name: string; again: boolean; reduced: boolean; onStop: () => void }) {
  const p = usePalette()
  const r = useRevealed(stream, reduced)
  return (
    <Animated.View entering={FadeIn.duration(reduced ? 120 : 180)} accessibilityLabel="일기로 옮기는 중" style={[s.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider, shadowOpacity: p.dark ? 0 : 0.08 }]}>
      <View style={s.head}>
        <View style={[s.av, { backgroundColor: p.accentSubtle }]}><BuddyArt buddy={buddy} stage={buddy.stage} size={30} mood="think" still={reduced} crop="bust" think /></View>
        <Text style={[s.headText, { color: p.textSecondary }]}>{again ? '한 번 더 옮기는 중…' : '일기로 옮기는 중…'}</Text>
        <Pressable accessibilityRole="button" onPress={onStop} hitSlop={8} style={[s.stop, { borderColor: p.borderStrong }]}>
          <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600' }}>멈추기</Text>
        </Pressable>
      </View>
      <ProgressLine still={reduced} />
      {r.title ? <Text style={[s.title, { color: p.textPrimary }]}>{r.title}</Text> : null}
      {r.text ? <Text style={[s.body, { color: p.textPrimary }]}>{r.text}</Text>
        : <Text style={[s.note, { color: p.textTertiary }]}>{name}의 말은 빼고 내 말로 옮기고 있어</Text>}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  card: { marginLeft: 38, marginVertical: 4, borderRadius: 20, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#0B2A22', shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  av: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headText: { flex: 1, fontSize: 14, fontWeight: '700' },
  stop: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 24 },
  body: { fontSize: 15.5, lineHeight: 25 },
  note: { fontSize: 12.5, lineHeight: 18 }
})
