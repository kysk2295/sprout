// 33 §11 할 일 행: 태그 알약 최대 2개 + `+N`(accepted만, 순서 = 직접 → 링크 → 자동, ✦ 없음) · 제목 속 `[[링크]]` = 괄호 없는 강조색 글자.
import { rowTagIds } from '@sprout/schema/wikiGraph'
import { Hash } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, type TextStyle, type StyleProp } from 'react-native'
import { useRouter } from 'expo-router'
import { useToast } from '../ui/Toast'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { createTag } from '../data/tasks'
import { KIND_ICON, kindOf, syncTaskLinks } from './data'
import { tagShow } from '../data/emojiLead'
import { openView, useLinkSegments, useOpenTarget, useWikiIndex } from './WikiIndex'

/** 종류 아이콘(👤🚀📍, 주제는 #). name을 주면 30 §A.5 규칙 — 이름 앞 이모지가 있으면 그 하나(이름 글은 tagShow(t).name으로 뗀다) */
export function KindGlyph({ kind, name, size = 12, color }: { kind: string | null | undefined; name?: string; size?: number; color: string }) {
  const e = name != null ? tagShow({ name, kind: kindOf(kind) }).emoji : KIND_ICON[kindOf(kind)]
  return e ? <Text style={{ fontSize: size - 1, lineHeight: size + 3 }}>{e}</Text> : <Hash size={size} color={color} />
}

/** 행 메타 줄의 태그 알약. 보일 게 없으면 null */
export function RowTagPills({ ids, hide }: { ids: string | null | undefined; hide?: string }) {
  const p = usePalette()
  const router = useRouter()
  const idx = useWikiIndex()
  if (!idx || !ids) return null
  const all = ids.split(',').filter((id, i, a) => id && a.indexOf(id) === i && idx.tags.has(id))
  const { shown, more } = rowTagIds(all, 2, hide)
  if (!shown.length) return null
  return (
    <>
      {shown.map((id) => {
        const t = idx.tags.get(id)!
        const c = t.color ?? p.textSecondary
        return (
          <Pressable key={id} accessibilityRole="button" accessibilityLabel={`태그 ${t.name} 페이지`} hitSlop={6} onPress={() => openView(router, `tag:${id}`)}
            style={[s.pill, { backgroundColor: alpha(t.color ?? '#8a8f99', p.dark ? 0.22 : 0.14) }]}>
            <KindGlyph kind={t.kind} name={t.name} size={10} color={c} />
            <Text style={[s.pillText, { color: t.color ? c : p.textSecondary }]} numberOfLines={1}>{tagShow(t).name}</Text>
          </Pressable>
        )
      })}
      {more ? <Text style={[s.more, { color: p.textTertiary }]}>+{more}</Text> : null}
    </>
  )
}

/** 행 제목: `[[링크]]`가 있으면 괄호 없이 강조색 글자(누르면 그 페이지), 없는 링크는 점선 밑줄(누르면 태그 만들기) */
export function LinkTitle({ taskId, text, style, done, numberOfLines = 1 }: { taskId: string; text: string; style: StyleProp<TextStyle>; done?: boolean; numberOfLines?: number }) {
  const p = usePalette()
  const segs = useLinkSegments(taskId, text)
  const open = useOpenTarget()
  const toast = useToast()
  if (!segs) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segs.map((g, i) => {
        if (!g.link) return g.text
        if (g.missing || !g.target) {
          return (
            <Text key={i} accessibilityRole="link" suppressHighlighting onPress={() => void createTag(g.text).then(() => syncTaskLinks(taskId)).then(() => toast.show(`'${g.text}' 태그를 만들었어요`))}
              style={{ color: p.textTertiary, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>{g.text}</Text>
          )
        }
        const target = g.target
        return <Text key={i} accessibilityRole="link" onPress={() => open(target)} style={{ color: done ? p.textTertiary : p.accent }}>{g.text}</Text>
      })}
    </Text>
  )
}

const s = StyleSheet.create({
  pill: { height: 18, borderRadius: 9, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: 110, flexShrink: 1 },
  pillText: { fontSize: 11, lineHeight: 14, fontWeight: '500', flexShrink: 1 },
  more: { fontSize: 11, lineHeight: 14 }
})
