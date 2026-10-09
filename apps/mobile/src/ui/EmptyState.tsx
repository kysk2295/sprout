// 빈 상태(21 §3, 20 M7 · 49 §8.2): 할 일 목록 = 내 캐릭터 3D 170 + 틱틱 문구, 그 밖 = 말랑 아이콘. SproutPot(새싹 화분)은 검색 빈 상태에만 남는다.
import { allDoneLine, companionLabel, todayEmptyLines } from '@sprout/schema/companion'
import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import Animated from 'react-native-reanimated'
import { useBuddy } from '../diary/data'
import { CompanionFace } from './CompanionFace'
import { popIn } from './motion'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'
import { FONT } from '../theme/palette'
import { SoftIcon, type SoftIconName } from './SoftIcon'
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
/** 49 §8.2 은은하게: 할 일 목록 빈 상태 = 내 캐릭터 3D 170(없으면 씨앗) — 누르면 깡충 */
export const EMPTY_ART = 170
function BuddyEmptyArt({ mood = 'smile' }: { mood?: 'smile' | 'content' }) {
  const buddy = useBuddy()
  const [n, setN] = useState(0)
  return <CompanionFace species={buddy.species} stage={buddy.stage} size={EMPTY_ART} mood={mood} play={{ move: 'hop', n }} onPress={() => setN((x) => x + 1)} label={companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage)} />
}

// 44 §4: 말랑 아이콘 88 + 제목 17/650 + 회색 한 줄(배치 그대로). character = 49 §8.2 캐릭터 170(문구는 그대로)
export function EmptyState({ title, sub, animate = true, icon = 'list', character }: { title: string; sub?: string; animate?: boolean; icon?: SoftIconName; character?: boolean }) {
  const p = usePalette()
  return (
    <Animated.View entering={animate ? appear : undefined} style={[s.wrap, character && s.wrapArt]}>
      {character ? <BuddyEmptyArt /> : <SoftIcon name={icon} size={88} day={icon === 'today' ? new Date().getDate() : undefined} />}
      <Text style={[FONT.emptyTitle, s.title, character && s.titleArt, { color: p.textPrimary }]}>{title}</Text>
      {sub ? <Text style={[s.sub, { color: p.textTertiary }]}>{sub}</Text> : null}
    </Animated.View>
  )
}
/** 40 §2.2·§4: "오늘 비어 있음"·"모두 완료" — 캐릭터(49 §8.2: 3D 170, 숨쉬기 없음, 누르면 깡충). 제목은 틱틱 문구(해요체), 둘째 줄은 캐릭터 말(실제 숫자).
 *  오늘 비어 있음은 누를 때마다 다음 후보 문장으로. 평범한 빈 목록은 위 EmptyState(새싹 화분) 그대로 */
export function CompanionEmpty({ kind, todayDone, animate = true }: { kind: 'today' | 'done'; todayDone: number; animate?: boolean }) {
  const p = usePalette()
  const buddy = useBuddy()
  const egg = !buddy.species
  const [n, setN] = useState(0)
  const lines = kind === 'today' ? todayEmptyLines({ todayDone, hour: new Date().getHours(), egg }) : [allDoneLine(todayDone, egg)]
  return (
    <Animated.View entering={animate ? appear : undefined} style={[s.wrap, s.wrapArt]}>
      <CompanionFace species={buddy.species} stage={buddy.stage} size={EMPTY_ART} mood={kind === 'done' ? 'content' : 'smile'} play={{ move: 'hop', n }} onPress={() => setN((x) => x + 1)} label={companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage)} />
      <Text style={[FONT.emptyTitle, s.title, s.titleArt, { color: p.textPrimary }]}>{kind === 'done' ? '모두 완료했어요' : '오늘 할 일이 없어요'}</Text>
      <Text accessibilityLiveRegion="polite" style={[s.sub, { color: p.textTertiary }]}>{lines[n % lines.length]}</Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, paddingTop: 70, paddingHorizontal: 40 },
  // 캐릭터 170은 발밑 여백(아래 10%)이 있어 제목과 붙여 둔다 — 시안 G .empty(위 40)
  wrapArt: { paddingTop: 40, gap: 4 },
  title: { marginTop: 10, textAlign: 'center' },
  titleArt: { marginTop: 0 },
  sub: { fontSize: 13, lineHeight: 18, fontWeight: '500', textAlign: 'center' }
})
