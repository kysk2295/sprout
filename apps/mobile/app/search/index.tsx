// 검색(시안 H, 04 §검색): 위 검색 칸 + ✕ · 종류 칩(할 일 · 수집함 · 일기 · 리스트 · 태그 · 필터, 개수) · 비면 최근 검색 + 빈 그림.
// 로컬 DB에서 바로 찾으므로 오프라인에서도 같다. 맞는 글자는 검색 노랑, 설명·체크 항목에서 맞으면 아래 줄에 앞뒤 글. 완료는 아래 따로.
// 들어오는 곳: 더보기 › 검색, 할 일 머리 🔍. 일기는 "나만 보기"를 뺀다(15).
import { useLiveQuery } from '../../src/data/rows'
import { useRouter, type Href } from 'expo-router'
import { BookHeart, Funnel, Hash, Layers, Search, X } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { loadRecent, saveRecent } from '../../src/data/organization'
import { highlight, pushRecent, SEARCH_KINDS, searchSql, snippet, type SearchKind } from '../../src/data/search'
import { completeTasks, reopenTasks } from '../../src/data/tasks'
import { COLUMNS, type TaskRow } from '../../src/data/views'
import { dayKey, longDay, rowDateLabel } from '../../src/lib/dates'
import { setTasksView } from '../../src/state/tasksView'
import { FONT, M } from '../../src/theme/palette'
import { usePalette } from '../../src/theme/ThemeProvider'
import { Checkbox } from '../../src/ui/Checkbox'
import { SproutPot } from '../../src/ui/EmptyState'
import { GlassButton } from '../../src/ui/Glass'
import { GroupCard } from '../../src/ui/GroupCard'
import { useToast } from '../../src/ui/Toast'
import { tagShow } from '../../src/data/emojiLead'

type Named = { id: string; name: string; emoji?: string | null; color?: string | null; kind?: string }
type NoteHit = { id: string; content: string | null; link_title: string | null; url: string | null }
type DiaryHit = { id: string; date: string; content: string | null }

function useDebounced(v: string, ms = 120) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}
/** 검색어가 없으면 아무것도 안 고르는 문장 */
const NONE = { sql: 'SELECT NULL AS id WHERE 0', params: [] as unknown[] }

export default function SearchScreen() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const toast = useToast()
  const today = dayKey()
  const [text, setText] = useState('')
  const q = useDebounced(text).trim()
  const [kind, setKind] = useState<SearchKind>('task')
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const remember = (v = q) => { if (!v) return; const next = pushRecent(recent, v); setRecent(next); saveRecent(next) }

  const sql = (k: SearchKind) => (q ? searchSql(k, q) : NONE)
  const taskIds = sql('task')
  const tasks = useLiveQuery<TaskRow & { checks: string | null }>(
    q ? `SELECT ${COLUMNS}, (SELECT group_concat(c.title, ' · ') FROM check_items c WHERE c.task_id = t.id) AS checks FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.id IN (${taskIds.sql}) ORDER BY t.status, CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at` : NONE.sql,
    q ? taskIds.params : []
  ).data.filter((t) => t.id)
  const notes = useLiveQuery<NoteHit>(sql('note').sql, sql('note').params).data.filter((x) => x.id)
  const diary = useLiveQuery<DiaryHit>(sql('diary').sql, sql('diary').params).data.filter((x) => x.id)
  const lists = useLiveQuery<Named>(sql('list').sql, sql('list').params).data.filter((x) => x.id)
  const tags = useLiveQuery<Named>(sql('tag').sql, sql('tag').params).data.filter((x) => x.id)
  const filters = useLiveQuery<Named>(sql('filter').sql, sql('filter').params).data.filter((x) => x.id)
  const counts: Record<SearchKind, number> = { task: tasks.length, note: notes.length, diary: diary.length, list: lists.length, tag: tags.length, filter: filters.length }
  // 지금 칩에 결과가 없고 다른 칩에 있으면 그쪽으로(처음 한 번)
  useEffect(() => {
    if (!q || counts[kind]) return
    const first = SEARCH_KINDS.find(([k]) => counts[k])
    if (first) setKind(first[0])
  }, [q, counts.task, counts.note, counts.diary, counts.list, counts.tag, counts.filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = tasks.filter((t) => t.status === 0)
  const done = tasks.filter((t) => t.status !== 0)
  const goView = (v: string) => { remember(); setTasksView(v); router.dismissTo('/') }
  const Hl = ({ text: s, style, lines = 1 }: { text: string; style: object; lines?: number }) => (
    <Text style={style} numberOfLines={lines}>
      {highlight(s, q).map(([part, on], i) => <Text key={i} style={on ? { backgroundColor: p.searchHighlight, color: '#1f1f1f' } : undefined}>{part}</Text>)}
    </Text>
  )
  const taskRow = (t: TaskRow & { checks: string | null }) => {
    const date = t.status === 0 ? rowDateLabel(t, today) : null
    const sub = snippet(t.content, q) ?? snippet(t.checks, q)
    const listName = t.list_kind === 'inbox' ? '기본함' : t.list_name
    return (
      <Pressable key={t.id} accessibilityRole="button" onPress={() => { remember(); router.push(`/task/${t.id}`) }} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
        <Checkbox priority={t.priority} done={t.status !== 0} onPress={() => void (t.status ? reopenTasks([t.id]) : completeTasks([t.id]).then((u) => u && toast.show('작업이 완료되었습니다.', { undo: u })))} />
        <View style={{ flex: 1 }}>
          <Hl text={t.title} style={[FONT.body, { color: t.status ? p.textTertiary : p.textPrimary }]} />
          {sub ? <Hl text={sub} style={[FONT.meta, { color: p.textTertiary }]} /> : listName ? (
            <View style={s.meta}><View style={[s.dot, { backgroundColor: t.list_color ?? (t.list_kind === 'inbox' ? p.slInbox : p.textQuaternary) }]} /><Text style={[FONT.meta, { color: p.textTertiary }]} numberOfLines={1}>{listName}{t.status === 2 ? ' · 계획 취소' : ''}</Text></View>
          ) : null}
        </View>
        {date ? <Text style={[FONT.meta, { color: date.tone === 'overdue' ? p.overdue : p.accent }]}>{date.label}</Text> : null}
      </Pressable>
    )
  }
  const named = (rows: Named[], icon: (r: Named) => React.ReactNode, onPress: (r: Named) => void, prefix = '') => (
    <View style={[s.card, { backgroundColor: p.cardBg }]}>
      {rows.map((r) => (
        <Pressable key={r.id} accessibilityRole="button" onPress={() => onPress(r)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
          <View style={{ width: 22, alignItems: 'center' }}>{icon(r)}</View>
          <Hl text={`${prefix}${r.kind === 'inbox' ? '기본함' : r.name}`} style={[FONT.body, { flex: 1, color: p.textPrimary }]} />
        </Pressable>
      ))}
    </View>
  )
  const empty = (title: string) => <Text style={[FONT.sub, { color: p.textTertiary, textAlign: 'center', paddingTop: 50 }]}>{title}</Text>

  return (
    <View style={{ flex: 1, backgroundColor: q ? p.pageBg : p.cardBg }}>
      <View style={[s.top, { marginTop: insets.top + 6 }]}>
        <View style={[s.field, { backgroundColor: q ? p.cardBg : p.bgSelected }]}>
          <Search size={17} color={p.textTertiary} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => remember(text.trim())}
            placeholder="검색"
            placeholderTextColor={p.textTertiary}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[FONT.body, { flex: 1, color: p.textPrimary, height: 40 }]}
            accessibilityLabel="검색어"
          />
        </View>
        <GlassButton label="검색 닫기" onPress={() => { Keyboard.dismiss(); router.back() }}><X size={20} color={p.textPrimary} /></GlassButton>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
        {SEARCH_KINDS.map(([k, label]) => {
          const on = k === kind
          return (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setKind(k)} style={[s.chip, { backgroundColor: on ? p.accent : q ? p.cardBg : p.bgSelected }]}>
              <Text style={{ fontSize: 14, color: on ? '#fff' : p.textPrimary }}>{q && counts[k] ? `${label} ${counts[k]}` : label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 40 }}>
        {!q ? (
          <>
            {recent.length ? (
              <View style={s.recent}>
                <View style={s.recentHead}>
                  <Text style={[FONT.sub, { color: p.textSecondary, flex: 1 }]}>최근 검색</Text>
                  <Pressable accessibilityRole="button" onPress={() => { setRecent([]); saveRecent([]) }}><Text style={[FONT.sub, { color: p.textTertiary }]}>지우기</Text></Pressable>
                </View>
                <View style={s.wrap}>
                  {recent.map((r) => (
                    <Pressable key={r} accessibilityRole="button" onPress={() => setText(r)} style={[s.chip, { backgroundColor: p.bgSelected }]}>
                      <Text style={{ fontSize: 14, color: p.textPrimary }}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={s.hello}>
              <SproutPot size={130} />
              <Text style={[s.helloTitle, { color: p.textPrimary }]}>무엇을 찾을까요?</Text>
              <Text style={[FONT.meta, { color: p.textTertiary }]}>할 일 제목·설명·체크 항목, 수집함, 일기에서 찾아요</Text>
            </View>
          </>
        ) : kind === 'task' ? (
          tasks.length ? (
            <>
              {open.length ? <GroupCard title="할 일" count={open.length} collapsed={false} onToggle={() => {}}>{open.map(taskRow)}</GroupCard> : null}
              {done.length ? <GroupCard title="완료" count={done.length} collapsed={false} onToggle={() => {}}>{done.map(taskRow)}</GroupCard> : null}
            </>
          ) : empty('검색 결과가 없어요')
        ) : kind === 'note' ? (
          notes.length ? (
            <View style={[s.card, { backgroundColor: p.cardBg }]}>
              {notes.map((n) => (
                <Pressable key={n.id} accessibilityRole="button" onPress={() => { remember(); router.navigate('/collect' as Href) }} style={({ pressed }) => [s.row, { alignItems: 'flex-start', paddingVertical: 10 }, pressed && { backgroundColor: p.bgSelected }]}>
                  <Layers size={18} color={p.textTertiary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Hl lines={2} text={(n.link_title || n.content || n.url || '').replace(/\s+/g, ' ')} style={[FONT.body, { color: p.textPrimary }]} />
                    {n.url ? <Text numberOfLines={1} style={[FONT.meta, { color: p.textTertiary }]}>{n.url}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : empty('수집함에서 찾지 못했어요')
        ) : kind === 'diary' ? (
          diary.length ? (
            <View style={[s.card, { backgroundColor: p.cardBg }]}>
              {diary.map((d) => (
                <Pressable key={d.id} accessibilityRole="button" onPress={() => { remember(); router.push({ pathname: '/diary', params: { date: d.date } } as unknown as Href) }} style={({ pressed }) => [s.row, { alignItems: 'flex-start', paddingVertical: 10 }, pressed && { backgroundColor: p.bgSelected }]}>
                  <BookHeart size={18} color="#e5739b" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[FONT.sub, { color: p.textSecondary, fontWeight: '600' }]}>{longDay(d.date)}</Text>
                    <Hl lines={2} text={snippet(d.content, q, 30) ?? ''} style={[FONT.body, { color: p.textPrimary }]} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : empty('일기에서 찾지 못했어요(나만 보기 일기는 검색하지 않아요)')
        ) : kind === 'list' ? (
          lists.length ? named(lists, (r) => (r.emoji ? <Text style={{ fontSize: 16 }}>{r.emoji}</Text> : <View style={[s.ldot, { backgroundColor: r.color ?? p.textQuaternary }]} />), (r) => goView(r.kind === 'inbox' ? 'smart:inbox' : `list:${r.id}`)) : empty('리스트를 찾지 못했어요')
        ) : kind === 'tag' ? (
          tags.length ? named(tags.map((r) => ({ ...r, ...tagShow(r) })), (r) => (r.emoji ? <Text style={{ fontSize: 16 }}>{r.emoji}</Text> : <Hash size={18} color={r.color ?? p.textSecondary} />), (r) => goView(`tag:${r.id}`)) : empty('태그를 찾지 못했어요')
        ) : filters.length ? named(filters, (r) => (r.emoji ? <Text style={{ fontSize: 16 }}>{r.emoji}</Text> : <Funnel size={18} color={p.textSecondary} />), (r) => goView(`filter:${r.id}`)) : empty('필터를 찾지 못했어요')}
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 48 },
  field: { flex: 1, height: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },
  recent: { paddingHorizontal: 16, paddingTop: 6 },
  recentHead: { flexDirection: 'row', alignItems: 'center', height: 32 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hello: { alignItems: 'center', gap: 6, paddingTop: 60 },
  helloTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600', marginTop: 8 },
  card: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: M.radiusCard, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  ldot: { width: 9, height: 9, borderRadius: 5 }
})

