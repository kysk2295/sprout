// 33 §11 리스트·태그 페이지 머리(모바일): 큰 제목 아래, 첫 묶음 카드 위 카드 한 장. 내용이 없으면 카드 자체가 없다(= 지금 화면).
// 접힘(리스트 기본) = 설명 첫 줄 · 태그 알약 3개(누르면 거르기) · 관련 N · ↩ N · ⌄ / 펼침(태그 페이지 기본) = 설명 · 태그 가로 알약 · 관련 리스트 · 백링크
// (태그 페이지는 설명 · 위키 · 리스트 · 관련 태그). 태그 알약: 누름 = 이 리스트 안 거르기, 길게 누름 = 태그 페이지.
import { useRows } from '../data/rows'
import { relatedLists, relatedTags, tagPills } from '@sprout/schema/wikiGraph'
import { useRouter } from 'expo-router'
import { Check, ChevronDown, X } from 'lucide-react-native'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { contentOf } from '../collect/core'
import { toggleDone } from '../data/tasks'
import type { ListRow } from '../data/views'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { Checkbox } from '../ui/Checkbox'
import { GlassButton } from '../ui/Glass'
import { useToast } from '../ui/Toast'
import { ACCEPTED, DESC_MAX, ensureTagTopic, setListDescription, setTagDescription, type TagMeta } from './data'
import { KindGlyph, LinkTitle } from './RowBits'
import { openView } from './WikiIndex'

const OPEN = 't.status = 0 AND t.deleted_at IS NULL'
type Backlink = { from_type: string; from_id: string; title: string | null; status: number | null; priority: number | null; list_id: string | null }

/** 접힘·펼침 기억(기기 메모리, 보기마다). 리스트는 처음 접힘, 태그 페이지는 처음 펼침 */
const openMemo = new Map<string, boolean>()

export function PageCard(props: { view: string; lists: ListRow[]; filter: string[]; onFilter: (ids: string[]) => void; descOpen: boolean; onDescClose: () => void }) {
  const [kind, id] = props.view.split(':') as [string, string]
  if (kind !== 'list' && kind !== 'tag') return null
  if (kind === 'list' && props.lists.find((l) => l.id === id)?.kind === 'inbox') return null // 기본함은 정리 대상(30 §B) — 머리 없음
  return <Body key={props.view} {...props} kind={kind} id={id} />
}

function Body({ kind, id, lists, filter, onFilter, descOpen, onDescClose }: Parameters<typeof PageCard>[0] & { kind: 'list' | 'tag'; id: string }) {
  const p = usePalette()
  const router = useRouter()
  const isList = kind === 'list'
  const view = `${kind}:${id}`
  const [open, setOpenState] = useState(openMemo.get(view) ?? !isList)
  const setOpen = (v: boolean) => { openMemo.set(view, v); setOpenState(v) }
  const [descLocal, setDescLocal] = useState(false)

  const allTags = useRows<TagMeta>('SELECT id, name, color, kind, aliases, description, topic_id FROM tags').data
  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags])
  const listRow = useRows<{ description: string | null }>('SELECT description FROM lists WHERE id = ?', [isList ? id : '']).data[0]
  const tag = isList ? undefined : tagById.get(id)
  const description = (isList ? listRow?.description : tag?.description) ?? ''

  // 리스트: 태그 줄 / 태그: 리스트 줄
  const pillRows = useRows<{ tag_id: string; source: string | null; c: number }>(
    `SELECT tt.tag_id, tt.source, count(*) AS c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE t.list_id = ? AND ${OPEN} AND ${ACCEPTED()} GROUP BY tt.tag_id, tt.source`, [isList ? id : '']
  ).data
  const pills = useMemo(() => tagPills(pillRows).filter((x) => tagById.has(x.tag_id)), [pillRows, tagById])
  const tagLists = useRows<{ list_id: string; c: number }>(
    `SELECT t.list_id, count(DISTINCT t.id) AS c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE tt.tag_id = ? AND ${OPEN} AND ${ACCEPTED()} AND t.list_id IS NOT NULL GROUP BY t.list_id ORDER BY c DESC`, [isList ? '' : id]
  ).data
  // 관련 리스트(§3.3) · 관련 태그(§4.1)
  const graph = useRows<{ list_id: string; tag_id: string; c: number }>(
    `SELECT t.list_id, tt.tag_id, count(*) AS c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id JOIN lists l ON l.id = t.list_id
     WHERE ${OPEN} AND ${ACCEPTED()} AND l.archived_at IS NULL AND ? GROUP BY t.list_id, tt.tag_id`, [isList ? 1 : 0]
  ).data
  const total = useRows<{ n: number }>(`SELECT count(*) AS n FROM tasks t WHERE ${OPEN}`).data[0]?.n ?? 0
  const related = useMemo(() => (isList ? relatedLists(id, graph, total).filter((r) => lists.some((l) => l.id === r.list_id)) : []), [isList, id, graph, total, lists])
  const pairs = useRows<{ task_id: string; tag_id: string }>(
    `SELECT tt.task_id, tt.tag_id FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE ${OPEN} AND ${ACCEPTED()} AND tt.task_id IN (SELECT task_id FROM task_tags WHERE tag_id = ?)`, [isList ? '' : id]
  ).data
  const relTags = useMemo(() => (isList ? [] : relatedTags(id, pairs).filter((r) => tagById.has(r.tag_id))), [isList, id, pairs, tagById])
  // 위키(태그 페이지): tags.topic_id, 없으면 같은 이름 주제
  const topic = useRows<{ id: string; name: string; content: string | null }>(
    'SELECT id, name, content FROM wiki_topics WHERE id = ? OR (? IS NULL AND name = ?) LIMIT 1', [tag?.topic_id ?? '', tag?.topic_id ?? null, isList ? '' : tag?.name ?? '']
  ).data[0]
  // 백링크(다른 곳에서 [[이 리스트/태그]]) — 태그 페이지에서 할 일은 이미 그 태그가 붙어 목록에 있으니 뺀다
  const backlinks = useRows<Backlink>(
    `SELECT r.from_type, r.from_id, t.title, t.status, t.priority, t.list_id FROM relations r LEFT JOIN tasks t ON r.from_type = 'task' AND t.id = r.from_id
     WHERE r.source = 'link' AND r.to_type = ? AND r.to_id = ? AND COALESCE(r.state,'accepted') = 'accepted' AND (r.from_type != 'task' OR t.deleted_at IS NULL) ${isList ? '' : "AND r.from_type != 'task'"}
     GROUP BY r.from_type, r.from_id LIMIT 11`, [kind, id]
  ).data

  const hasContent = !!description || pills.length > 0 || tagLists.length > 0 || related.length > 0 || relTags.length > 0 || backlinks.length > 0 || (!isList && !!topic)
  const listName = (lid: string) => {
    const l = lists.find((x) => x.id === lid)
    return l ? (l.kind === 'inbox' ? '기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name}`) : ''
  }
  const tagName = (tid: string) => tagById.get(tid)?.name ?? ''
  const toggle = (tid: string) => onFilter(filter.includes(tid) ? filter.filter((x) => x !== tid) : [...filter, tid])
  const editor = (
    <DescriptionSheet open={descOpen || descLocal} value={description} onClose={() => { setDescLocal(false); onDescClose() }} onSave={(v) => (isList ? setListDescription(id, v) : setTagDescription(id, v))} />
  )
  if (!hasContent) return editor

  const Pill = ({ tid, n, ai, small }: { tid: string; n?: number; ai?: boolean; small?: boolean }) => {
    const on = filter.includes(tid)
    const t = tagById.get(tid)
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${tagName(tid)}${on ? ' 거르는 중' : ''}, 길게 누르면 태그 페이지`}
        onPress={() => toggle(tid)} onLongPress={() => openView(router, `tag:${tid}`)} delayLongPress={350}
        style={[small ? s.pillSm : s.pill, { backgroundColor: on ? p.accent : p.bgSelected }]}>
        {ai ? <Text style={[s.ai, { color: on ? '#fff' : p.accent }]}>✦</Text> : null}
        <KindGlyph kind={t?.kind} size={small ? 11 : 12} color={on ? '#fff' : p.textSecondary} />
        <Text style={[s.pillText, { color: on ? '#fff' : p.textPrimary }]} numberOfLines={1}>{tagName(tid)}</Text>
        {n !== undefined ? <Text style={[s.pillN, { color: on ? '#fff' : p.textTertiary }]}>{n}</Text> : null}
      </Pressable>
    )
  }
  const NavPill = ({ label, n, onPress, children }: { label: string; n?: string | number; onPress: () => void; children?: ReactNode }) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.pill, { backgroundColor: p.bgSelected }]}>
      {children}
      <Text style={[s.pillText, { color: p.textPrimary }]} numberOfLines={1}>{label}</Text>
      {n !== undefined ? <Text style={[s.pillN, { color: p.textTertiary }]} numberOfLines={1}>{n}</Text> : null}
    </Pressable>
  )

  if (!open) {
    const shown = [...filter.filter((f) => pills.some((x) => x.tag_id === f)), ...pills.map((x) => x.tag_id).filter((x) => !filter.includes(x))].slice(0, Math.max(description ? 2 : 3, filter.length))
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel="페이지 정보 펼치기" onPress={() => setOpen(true)} style={[s.card, s.collapsed, { backgroundColor: p.cardBg }]}>
          {description ? <Text style={[FONT.sub, s.descLine, { color: p.textSecondary }]} numberOfLines={1}>{description.split('\n')[0]}</Text> : null}
          {shown.map((tid) => <Pill key={tid} tid={tid} small />)}
          {filter.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="거르기 해제" hitSlop={8} onPress={() => onFilter([])} style={s.clear}><X size={14} color={p.textTertiary} /></Pressable>
          ) : null}
          {!isList && tagLists.length ? <Text style={[s.meta, { color: p.textTertiary }]}>리스트 {tagLists.length}</Text> : null}
          {related.length ? <Text style={[s.meta, { color: p.textTertiary }]}>관련 {related.length}</Text> : null}
          {backlinks.length ? <Text style={[s.meta, { color: p.textTertiary }]}>{'\u21A9\uFE0E'} {backlinks.length}</Text> : null}
          {description ? null : <View style={{ flex: 1 }} />}
          <ChevronDown size={15} color={p.textTertiary} />
        </Pressable>
        {editor}
      </>
    )
  }

  const c = topic ? contentOf({ content: topic.content ?? '' }) : undefined
  return (
    <View style={[s.card, { backgroundColor: p.cardBg }]}>
      <Row label="설명">
        <Pressable accessibilityRole="button" accessibilityLabel="설명 고치기" onPress={() => setDescLocal(true)} style={{ flex: 1 }}>
          {description
            ? <Text style={[FONT.sub, { color: p.textPrimary }]}>{description}</Text>
            : <Text style={[FONT.sub, { color: p.textTertiary }]}>+ 설명 쓰기</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="페이지 정보 접기" hitSlop={8} onPress={() => setOpen(false)} style={s.fold}>
          <ChevronDown size={15} color={p.textTertiary} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
      </Row>
      {!isList ? (
        <Row label="위키">
          {topic ? (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/collect/wiki/${topic.id}`)} style={{ flex: 1, gap: 2 }}>
              <Text style={[FONT.sub, { color: c!.sections.overview[0] ? p.textSecondary : p.textTertiary }]} numberOfLines={2}>📖 {c!.sections.overview[0]?.text ?? '개요 없음'}</Text>
              <Text style={[FONT.sub, { color: p.accentInk }]}>핵심 정리 {c!.sections.key.length}줄 ›</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={async () => { if (tag) router.push(`/collect/wiki/${await ensureTagTopic(tag)}`) }}>
              <Text style={[FONT.sub, { color: p.accentInk }]}>+ 위키 페이지 만들기</Text>
            </Pressable>
          )}
        </Row>
      ) : null}
      {isList && pills.length ? (
        <Row label="태그" scroll>
          <Pressable accessibilityRole="button" onPress={() => onFilter([])} style={[s.pill, { backgroundColor: filter.length ? p.bgSelected : p.accent }]}>
            <Text style={[s.pillText, { color: filter.length ? p.textPrimary : '#fff' }]}>전체</Text>
          </Pressable>
          {pills.map((x) => <Pill key={x.tag_id} tid={x.tag_id} n={x.count} ai={x.aiOnly} />)}
        </Row>
      ) : null}
      {!isList && tagLists.length ? (
        <Row label="리스트" scroll>
          {tagLists.map((x) => <NavPill key={x.list_id} label={listName(x.list_id)} n={x.c} onPress={() => openView(router, `list:${x.list_id}`, lists.find((l) => l.id === x.list_id)?.kind === 'inbox' ? undefined : id)} />)}
        </Row>
      ) : null}
      {related.length ? (
        <Row label="관련 리스트" scroll>
          {related.map((r) => <NavPill key={r.list_id} label={listName(r.list_id)} n={r.tags.map((t) => `#${tagName(t)}`).join(' ')} onPress={() => openView(router, `list:${r.list_id}`)} />)}
        </Row>
      ) : null}
      {relTags.length ? (
        <Row label="관련 태그" scroll>
          {relTags.map((r) => (
            <NavPill key={r.tag_id} label={tagName(r.tag_id)} onPress={() => openView(router, `tag:${r.tag_id}`)}>
              <KindGlyph kind={tagById.get(r.tag_id)?.kind} size={12} color={p.textSecondary} />
            </NavPill>
          ))}
        </Row>
      ) : null}
      {backlinks.length ? (
        <View style={[s.back, { borderTopColor: p.borderDivider }]}>
          <Text style={[s.k, { color: p.textTertiary, paddingBottom: 2 }]}>백링크 {backlinks.length > 10 ? '10+' : backlinks.length}</Text>
          {backlinks.slice(0, 10).map((b) => (
            <Pressable key={`${b.from_type}:${b.from_id}`} accessibilityRole="button" disabled={b.from_type !== 'task'} onPress={() => router.push(`/task/${b.from_id}`)} style={s.backRow}>
              {b.from_type === 'task'
                ? <Checkbox priority={b.priority ?? 0} done={b.status !== 0} size={16} onPress={() => void toggleDone({ id: b.from_id, status: b.status ?? 0 })} />
                : <Text style={{ width: 18, textAlign: 'center', color: p.textTertiary }}>{b.from_type === 'tag' ? '#' : '≡'}</Text>}
              <View style={{ flex: 1 }}>
                {b.title ? <LinkTitle taskId={b.from_id} text={b.title} done={b.status !== 0} style={[FONT.sub, { color: b.status ? p.textTertiary : p.textPrimary }]} />
                  : <Text style={[FONT.sub, { color: p.textTertiary }]}>{b.from_type === 'task' ? '제목 없음' : '설명'}</Text>}
              </View>
              {b.list_id ? <Text style={[s.meta, { color: p.textTertiary }]} numberOfLines={1}>{listName(b.list_id)}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {editor}
    </View>
  )
}

function Row({ label, children, scroll }: { label: string; children: ReactNode; scroll?: boolean }) {
  const p = usePalette()
  return (
    <View style={s.row}>
      <Text style={[s.k, { color: p.textTertiary }]}>{label}</Text>
      {scroll
        ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.scroll}>{children}</ScrollView>
        : <View style={s.v}>{children}</View>}
    </View>
  )
}

/** 설명 고치기(아래에서 올라오는 페이지 시트, 500자). `[[ ]]`는 그대로 쓸 수 있다(자동 완성은 [다음]) */
function DescriptionSheet({ open, value, onClose, onSave }: { open: boolean; value: string; onClose: () => void; onSave: (v: string) => Promise<unknown> }) {
  const p = usePalette()
  const toast = useToast()
  const [draft, setDraft] = useState(value)
  const shown = open
  useEffect(() => { if (shown) setDraft(value) }, [shown, value])
  const close = () => onClose()
  const over = draft.length > DESC_MAX
  const save = async () => {
    if (over) return
    close()
    if (draft.trim() !== value.trim()) { try { await onSave(draft.trim()) } catch { toast.show('저장하지 못했어요') } }
  }
  return (
    <Modal visible={shown} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: p.pageBg }}>
        <View style={s.head}>
          <GlassButton label="닫기" onPress={close}><X size={20} color={p.textPrimary} /></GlassButton>
          <Text style={[FONT.nav, { flex: 1, textAlign: 'center', color: p.textPrimary }]}>설명</Text>
          <GlassButton label="저장" plain disabled={over} onPress={() => void save()} style={{ backgroundColor: over ? p.bgSelected : p.accent }}>
            <Check size={20} color={over ? p.textQuaternary : '#fff'} />
          </GlassButton>
        </View>
        <View style={[s.editBox, { backgroundColor: p.cardBg }]}>
          <TextInput autoFocus multiline value={draft} onChangeText={setDraft} placeholder="이 페이지는 무엇인가요?" placeholderTextColor={p.textQuaternary}
            style={[FONT.body, { color: p.textPrimary, minHeight: 140, textAlignVertical: 'top' }]} accessibilityLabel="설명" />
        </View>
        {draft.length > DESC_MAX - 50 ? <Text style={[s.count, { color: over ? p.danger : p.textTertiary }]}>{draft.length}/{DESC_MAX}</Text> : null}
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  card: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: M.radiusCard, overflow: 'hidden', paddingVertical: 4 },
  collapsed: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 0 },
  descLine: { flex: 1, minWidth: 48 },
  meta: { fontSize: 12, lineHeight: 16 },
  clear: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 40, paddingLeft: 14, paddingRight: 8, paddingVertical: 8 },
  k: { width: 64, fontSize: 12, lineHeight: 20 },
  v: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  scroll: { gap: 6, paddingRight: 8 },
  fold: { width: 28, height: 20, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 26, borderRadius: 13, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 220 },
  pillSm: { height: 22, borderRadius: 11, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: 110, flexShrink: 0 },
  pillText: { fontSize: 13, lineHeight: 17, fontWeight: '500', flexShrink: 1 },
  pillN: { fontSize: 12, lineHeight: 16, marginLeft: 2 },
  ai: { fontSize: 9, lineHeight: 13 },
  back: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 4 },
  backRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 },
  head: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  editBox: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, padding: 14 },
  count: { fontSize: 12, textAlign: 'right', paddingHorizontal: 20, paddingTop: 6 }
})
