// 26 수집함 화면 조각: 종류 아이콘 · 사이트 표시(유튜브 빨간 재생 칸) · 꼬리표 · 세그먼트 · 빈 상태 · 항목 행
import { BookOpen, Clock3, FileText, Inbox, Link2 } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { alpha, FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { chipsOf, isYoutube, monthDayKo, sentAt, timeKo, titleOf, type Chip, type CollectItem } from './core'

/** 행 왼쪽 종류 표시: 할 일 = 강조색 점선 칸 · 볼 것 = 링크 · 위키 = 책 · 메모 = 문서 · 정리 전 = 시계 */
export function KindIcon({ kind }: { kind: ReturnType<typeof chipsOf>['icon'] }) {
  const p = usePalette()
  if (kind === 'task') return <View style={s.kind}><View style={[s.dash, { borderColor: p.accent }]} /></View>
  const Icon = kind === 'link' ? Link2 : kind === 'wiki' ? BookOpen : kind === 'pending' ? Clock3 : FileText
  return <View style={s.kind}><Icon size={18} color={p.textTertiary} /></View>
}

/** 유튜브: 빨간 둥근 칸 + 흰 재생 / 그 밖: 회색 링크 칸 (그림은 직접 그림 — 유튜브 로고 원본 아님) */
export function SiteMark({ url, size = 20 }: { url: string; size?: number }) {
  const p = usePalette()
  if (isYoutube(url)) {
    return (
      <View style={[s.kind, { width: size + 4 }]} accessibilityLabel="유튜브">
        <Svg width={size} height={(size * 15) / 20} viewBox="0 0 20 15"><Rect x={0} y={0} width={20} height={15} rx={4} fill="#ff3b30" /><Path d="M8 4.2v6.6l5.4-3.3z" fill="#fff" /></Svg>
      </View>
    )
  }
  return <View style={[s.kind, { width: size + 4 }]}><View style={[s.web, { backgroundColor: p.bgSelected }]}><Link2 size={13} color={p.textSecondary} /></View></View>
}

export function ChipView({ chip }: { chip: Chip }) {
  const p = usePalette()
  const color = chip.tone === 'accent' ? p.accent : chip.tone === 'wiki' ? '#2f9e5b' : chip.tone === 'muted' ? p.textTertiary : p.textSecondary
  const bg = chip.tone === 'accent' ? p.accentSubtle : chip.tone === 'wiki' ? alpha('#2f9e5b', 0.12) : chip.tone === 'line' || chip.tone === 'muted' ? 'transparent' : p.bgSelected
  return (
    <View style={[s.chip, { backgroundColor: bg }, chip.tone === 'line' && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: p.textQuaternary }, chip.tone === 'muted' && { paddingHorizontal: 0 }]}>
      <Text style={[s.chipText, { color }]} numberOfLines={1}>{chip.text}</Text>
    </View>
  )
}

/** 세그먼트(키트 .m-seg): 좌우 16, 높이 32 */
export function Segmented<T extends string>({ value, items, onChange }: { value: T; items: [T, string][]; onChange: (v: T) => void }) {
  const p = usePalette()
  return (
    <View style={[s.seg, { backgroundColor: p.dark ? 'rgba(118,118,128,0.24)' : 'rgba(120,120,128,0.12)' }]} accessibilityRole="tablist">
      {items.map(([k, label]) => {
        const on = k === value
        return (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(k)} style={[s.segItem, on && { backgroundColor: p.dark ? '#636366' : p.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}>
            <Text style={[s.segText, { color: on ? p.textPrimary : p.textSecondary, fontWeight: on ? '600' : '500' }]} numberOfLines={1}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function CollectEmpty({ icon, title, sub, children }: { icon: 'inbox' | 'link' | 'book'; title: string; sub?: string; children?: ReactNode }) {
  const p = usePalette()
  const Icon = icon === 'inbox' ? Inbox : icon === 'link' ? Link2 : BookOpen
  return (
    <View style={s.empty}>
      <View style={[s.emptyIcon, { backgroundColor: p.accentSubtle }]}><Icon size={30} color={p.accent} /></View>
      <Text style={[s.emptyTitle, { color: p.textPrimary }]}>{title}</Text>
      {sub ? <Text style={[FONT.meta, { color: p.textTertiary, textAlign: 'center', lineHeight: 18 }]}>{sub}</Text> : null}
      {children}
    </View>
  )
}

/** 수집 행(62, 두 줄): 종류 표시 · 제목 · 꼬리표 줄(없으면 시각/날짜) · 할 일 제안이면 오른쪽 `등록` */
export function ItemRow({ item, today, showTime, onPress, onLongPress, onRegister }: { item: CollectItem; today: string; showTime: boolean; onPress: () => void; onLongPress: () => void; onRegister: () => void }) {
  const p = usePalette()
  const { chips, register, icon } = chipsOf(item, today)
  const at = sentAt(item)
  const kindChips = chips.filter((c) => c.text !== '카톡')
  const when = showTime ? timeKo(at) : monthDayKo(at)
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} accessibilityLabel={titleOf(item) || '내용 없음'} style={({ pressed }) => [s.row, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
      {icon === 'link' && item.url ? <SiteMark url={item.url} /> : <KindIcon kind={icon} />}
      <View style={s.tx}>
        <Text style={[FONT.body, { color: p.textPrimary }]} numberOfLines={1}>{titleOf(item) || '내용 없음'}</Text>
        <View style={s.sub}>
          {chips.filter((c) => c.tone !== 'muted').map((c) => <ChipView key={c.text} chip={c} />)}
          {!kindChips.length || kindChips[0].tone === 'muted' ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{kindChips.length ? `${kindChips[0].text} · ${when}` : when}</Text> : null}
          {item.url && item.kind === 'link' && !item.task_id ? <Text style={[FONT.meta, { color: p.textTertiary, flexShrink: 1 }]} numberOfLines={1}>{domainShort(item.url)}</Text> : null}
        </View>
      </View>
      {register ? (
        <Pressable accessibilityRole="button" accessibilityLabel="할 일로 등록" hitSlop={8} onPress={onRegister} style={[s.reg, { backgroundColor: p.accent }]}>
          <Text style={s.regText}>등록</Text>
        </Pressable>
      ) : null}
    </Pressable>
  )
}
const domainShort = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

const s = StyleSheet.create({
  kind: { width: 24, alignItems: 'center', justifyContent: 'center' },
  dash: { width: 17, height: 17, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed' },
  web: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1.5, maxWidth: 220 },
  chipText: { fontSize: 11.5, lineHeight: 15, fontWeight: '500' },
  seg: { height: 32, marginHorizontal: M.gutter, marginBottom: 12, borderRadius: 9, flexDirection: 'row', padding: 2 },
  segItem: { flex: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 13.5, lineHeight: 18 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 60, paddingHorizontal: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  row: { minHeight: M.rowH2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 14, paddingVertical: 9 },
  tx: { flex: 1, minWidth: 0, gap: 4 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reg: { height: 28, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  regText: { color: '#fff', fontSize: 13, fontWeight: '600' }
})
