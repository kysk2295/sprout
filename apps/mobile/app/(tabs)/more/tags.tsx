// 33 §11 더보기 › 태그: 태그 = 위키 페이지 목록. 종류별 묶음 카드(사람 · 프로젝트 · 장소 · 주제, 빈 묶음 없음),
// 행 = 종류 아이콘 · 이름 · 별칭(3차) · 열린 할 일 수(accepted). 누르면 태그 페이지(할 일 탭 그 태그 보기 + 페이지 카드).
import { useLiveQuery } from '../../../src/data/rows'
import { parseAliases } from '@sprout/schema/wikiLink'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { ScrollView, Text, View } from 'react-native'
import { FONT } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { EmptyState } from '../../../src/ui/EmptyState'
import { GlassButton } from '../../../src/ui/Glass'
import { BigTitle, NavRow } from '../../../src/ui/Header'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'
import { KIND_LABEL, kindOf, type TagKind } from '../../../src/wiki/data'
import { KindGlyph } from '../../../src/wiki/RowBits'
import { openView } from '../../../src/wiki/WikiIndex'

type Row = { id: string; name: string; color: string | null; kind: string | null; aliases: string | null; n: number }
const ORDER: TagKind[] = ['person', 'project', 'place', 'topic']

export default function TagList() {
  const p = usePalette()
  const router = useRouter()
  const space = useTabBarSpace()
  const rows = useLiveQuery<Row>(
    `SELECT g.id, g.name, g.color, g.kind, g.aliases,
       (SELECT count(DISTINCT tt.task_id) FROM task_tags tt JOIN tasks t ON t.id = tt.task_id LEFT JOIN lists l ON l.id = t.list_id
         WHERE tt.tag_id = g.id AND t.status = 0 AND t.deleted_at IS NULL AND l.archived_at IS NULL AND COALESCE(tt.state,'accepted') = 'accepted') AS n
     FROM tags g ORDER BY COALESCE(g.pinned, 0) DESC, g.sort_order, g.name`
  ).data
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} />
      <BigTitle title="태그" />
      <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: space.pad }}>
        {!rows.length ? <EmptyState title="태그가 없어요" sub="할 일 제목에 #이름 이나 [[이름]] 을 써 보세요" /> : null}
        {ORDER.map((k) => {
          const list = rows.filter((r) => kindOf(r.kind) === k)
          if (!list.length) return null
          return (
            <Cells key={k} title={KIND_LABEL[k]}>
              {list.map((t, i) => {
                const aliases = parseAliases(t.aliases)
                return (
                  <Cell
                    key={t.id}
                    first={i === 0}
                    label={t.name}
                    icon={<KindGlyph kind={t.kind} size={17} color={t.color ?? p.textSecondary} />}
                    iconBg="transparent"
                    right={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '45%' }}>
                        {aliases.length ? <Text style={[FONT.meta, { color: p.textTertiary, flexShrink: 1 }]} numberOfLines={1}>{aliases.slice(0, 2).join(' · ')}</Text> : null}
                        {t.n ? <Text style={[FONT.sub, { color: p.textTertiary }]}>{t.n}</Text> : null}
                      </View>
                    }
                    onPress={() => openView(router, `tag:${t.id}`, undefined, true)}
                  />
                )
              })}
            </Cells>
          )
        })}
      </ScrollView>
    </View>
  )
}
