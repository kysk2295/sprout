// 할 일 행(21 §2·§3): 체크박스 17 · 제목 16 · 오른쪽 날짜 13(강조색 / 만료 빨강) + 아이콘(⟲ 반복 · 🔔 알림 · ≡ 설명)
// 스마트 목록이면 제목 아래 메타 줄(리스트 색 점 + 이름 · 체크리스트 진행 1/3). 행 46, 메타 줄 있으면 62. 행 사이 선 없음.
// 33 §11: 메타 줄에 태그 알약 2개 + `+N`(accepted만 — tag_ids가 이미 거름), 제목 속 `[[링크]]`는 강조색 글자(src/wiki).
import { AlignLeft, Bell, ChevronDown, ChevronRight, ListChecks, Repeat } from 'lucide-react-native'
import { displayTitle } from '@sprout/schema/wikiLink'
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PressableRow } from './Pressables'
import { rowDateLabel } from '../lib/dates'
import type { TaskRow as Task } from '../data/views'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { Checkbox } from './Checkbox'
import { LinkTitle, RowTagPills } from '../wiki/RowBits'
import { useWikiIndex } from '../wiki/WikiIndex'

export type RowProps = {
  task: Task
  today: string
  depth?: number
  showList?: boolean
  showDetails?: boolean
  hideTodayLabel?: boolean
  childCount?: number
  expanded?: boolean
  flash?: boolean
  /** 체크 뒤 완료 모양으로 머무는 중(39 §4.1) */
  pending?: boolean
  onToggleExpand?: () => void
  onCheck?: () => void
  onPress?: () => void
  onLongPress?: () => void
  pressed?: boolean
  /** 태그 화면이면 그 태그 알약은 숨긴다(33 §6.6) */
  hideTag?: string
}

export const TaskRowView = memo(function TaskRowView(props: RowProps) {
  const p = usePalette()
  const t = props.task
  const done = t.status !== 0
  const looksDone = done || !!props.pending
  const date = done ? null : rowDateLabel(t, props.today, { hideToday: props.hideTodayLabel })
  const listDot = t.list_color ?? (t.list_kind === 'inbox' ? p.slInbox : p.textQuaternary)
  const listName = t.list_kind === 'inbox' ? '기본함' : t.list_name
  const progress = t.check_total > 0 ? `${t.check_done}/${t.check_total}` : null
  const idx = useWikiIndex()
  const hasTags = !!idx && !!t.tag_ids && t.tag_ids.split(',').some((id) => id !== props.hideTag && idx.tags.has(id))
  const meta = !done && ((props.showList && listName) || progress || hasTags)
  const details = props.showDetails && t.content_mode !== 'checklist' && t.content ? t.content.split('\n')[0] : null
  const two = !!meta || !!details
  return (
    <PressableRow
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={350}
      accessibilityLabel={displayTitle(t.title) || '제목 없음'}
      bg={p.cardBg}
      pressedBg={p.bgSelected}
      held={props.pressed}
      flashBg={props.flash ? p.accentSubtle : null}
      style={[s.row, two && s.two, { paddingLeft: M.rowPad + (props.depth ?? 0) * 30 }]}
    >
      <View style={two ? { marginTop: -11 } : undefined}>
        <Checkbox priority={t.priority} done={done} pending={props.pending} onPress={props.onCheck} label={`${displayTitle(t.title)} 완료`} flash={props.flash} disabled={!!t.deleted_at} />
      </View>
      <View style={s.tx}>
        <LinkTitle taskId={t.id} text={t.title || '제목 없음'} done={done} style={[FONT.body, { color: looksDone ? p.textTertiary : p.textPrimary }]} />
        {meta ? (
          <View style={s.sub}>
            {props.showList && listName ? (
              <View style={s.subItem}>
                <View style={[s.dot, { backgroundColor: listDot }]} />
                <Text style={[FONT.meta, { color: p.textTertiary }]} numberOfLines={1}>{t.list_emoji ? `${t.list_emoji} ` : ''}{listName}</Text>
              </View>
            ) : null}
            {progress ? (
              <View style={s.subItem}>
                <ListChecks size={12} color={p.textTertiary} />
                <Text style={[FONT.meta, { color: p.textTertiary }]}>{progress}</Text>
              </View>
            ) : null}
            {hasTags ? <RowTagPills ids={t.tag_ids} hide={props.hideTag} /> : null}
          </View>
        ) : null}
        {details ? <Text style={[FONT.meta, { color: p.textTertiary }]} numberOfLines={1}>{details}</Text> : null}
      </View>
      <View style={s.right}>
        {date ? <Text style={[FONT.meta, s.date, { color: date.tone === "overdue" ? p.overdue : p.accentInk }]} numberOfLines={1}>{date.label}</Text> : null}
        {!done && (t.repeat_rule || t.reminder_count > 0 || (t.content && t.content_mode !== 'checklist')) ? (
          <View style={s.icons}>
            {t.repeat_rule ? <Repeat size={12} color={p.textTertiary} /> : null}
            {t.reminder_count > 0 ? <Bell size={12} color={p.textTertiary} /> : null}
            {t.content && t.content_mode !== 'checklist' && !props.showDetails ? <AlignLeft size={12} color={p.textTertiary} /> : null}
          </View>
        ) : null}
      </View>
      {props.childCount ? (
        <Pressable accessibilityRole="button" accessibilityLabel={props.expanded ? '하위 할 일 접기' : '하위 할 일 펼치기'} hitSlop={10} onPress={props.onToggleExpand} style={s.chev}>
          {props.expanded ? <ChevronDown size={14} color={p.textQuaternary} /> : <ChevronRight size={14} color={p.textQuaternary} />}
        </Pressable>
      ) : null}
    </PressableRow>
  )
})

const s = StyleSheet.create({
  row: { minHeight: M.rowH, flexDirection: 'row', alignItems: 'center', gap: 15, paddingRight: 16 },
  two: { minHeight: M.rowH2, paddingTop: 10, paddingBottom: 9 },
  tx: { flex: 1, minWidth: 0, gap: 3, justifyContent: 'center' },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  subItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  right: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: 140 },
  icons: { flexDirection: 'row', gap: 3 },
  date: { fontSize: 13, lineHeight: 17 },
  chev: { width: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginLeft: -6 }
})
