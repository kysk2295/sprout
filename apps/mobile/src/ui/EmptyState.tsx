// 빈 상태(21 §3, 20 M7): 새싹 화분 그림 — 시안 B-3을 그대로 옮긴 직접 그린 그림(틱틱 그림 아님). 정식 캐릭터 그림이 오면 바꾼다.
import { allDoneLine, COMPANION_SIZE, companionLabel, todayEmptyLines } from '@sprout/schema/companion'
import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import Animated from 'react-native-reanimated'
import { useBuddy } from '../diary/data'
import { CompanionFace } from './CompanionFace'
import { popIn } from './motion'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

export function SproutPot({ size = 150 }: { size?: number }) {
  const p = usePalette()
  return (
    <Svg width={size} height={(size * 120) / 150} viewBox="0 0 150 120" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Ellipse cx={75} cy={108} rx={46} ry={6} fill={p.bgSelected} />
      <Path d="M52 78h46l-6 28H58z" fill={p.accentSubtle} stroke={p.accent} strokeWidth={2.5} />
      <Path d="M48 72h54v8H48z" fill={p.cardBg} stroke={p.accent} strokeWidth={2.5} />
      <Path d="M75 72V44" stroke="#4caf6a" strokeWidth={3} />
      <Path d="M75 52c0-12-8-19-22-19 0 12 8 19 22 19z" fill="#bfe6c4" stroke="#4caf6a" strokeWidth={2.5} />
      <Path d="M75 47c0-10 7-16 19-16 0 10-7 16-19 16z" fill="#bfe6c4" stroke="#4caf6a" strokeWidth={2.5} />
      <Circle cx={68} cy={90} r={1.8} fill={p.accent} />
      <Circle cx={82} cy={90} r={1.8} fill={p.accent} />
      <Path d="M71 96c2.5 2 5.5 2 8 0" stroke={p.accent} strokeWidth={2} />
      <Path d="M112 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#f6c343" />
      <Path d="M36 40l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill="#f6c343" />
    </Svg>
  )
}

// 39 §4.1-5·§4.8: 나타날 때 옅게 + 0.96 → 1(250ms). 첫 화면에서는 animate=false로 바로
const appear = popIn(0.96)
export function EmptyState({ title, sub, animate = true }: { title: string; sub?: string; animate?: boolean }) {
  const p = usePalette()
  return (
    <Animated.View entering={animate ? appear : undefined} style={s.wrap}>
      <SproutPot />
      <Text style={[s.title, { color: p.textPrimary }]}>{title}</Text>
      {sub ? <Text style={[FONT.meta, { color: p.textTertiary, textAlign: 'center' }]}>{sub}</Text> : null}
    </Animated.View>
  )
}
/** 40 §2.2·§4: "오늘 비어 있음"·"모두 완료"만 캐릭터 M 64(숨쉬기 없음, 누르면 깡충). 제목은 틱틱 문구(해요체), 둘째 줄은 캐릭터 말(실제 숫자).
 *  오늘 비어 있음은 누를 때마다 다음 후보 문장으로. 평범한 빈 목록은 위 EmptyState(새싹 화분) 그대로 */
export function CompanionEmpty({ kind, todayDone, animate = true }: { kind: 'today' | 'done'; todayDone: number; animate?: boolean }) {
  const p = usePalette()
  const buddy = useBuddy()
  const egg = !buddy.species
  const [n, setN] = useState(0)
  const lines = kind === 'today' ? todayEmptyLines({ todayDone, hour: new Date().getHours(), egg }) : [allDoneLine(todayDone, egg)]
  return (
    <Animated.View entering={animate ? appear : undefined} style={s.wrap}>
      <CompanionFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.m} mood={kind === 'done' ? 'content' : 'smile'} play={{ move: 'hop', n }} onPress={() => setN((x) => x + 1)} label={companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage)} />
      <Text style={[s.title, { color: p.textPrimary }]}>{kind === 'done' ? '모두 완료했어요' : '오늘 할 일이 없어요'}</Text>
      <Text accessibilityLiveRegion="polite" style={[FONT.meta, { color: p.textTertiary, textAlign: 'center' }]}>{lines[n % lines.length]}</Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, paddingTop: 70, paddingHorizontal: 40 },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '500', marginTop: 10 }
})
