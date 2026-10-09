// 리스트·폴더·태그·필터 편집 시트(05·07 휴대폰판 — 틱틱 iOS: 아래에서 올라오는 페이지 시트, 머리 ✕ · 제목 · ✓).
// 저장 전에는 쓰지 않는다(✕ = 변경 없음). 이름이 비면 ✓ 흐림. 실패는 빨간 한 줄 + 입력 유지. 색은 데스크톱 편집기와 같은 견본.
// 섹션 이름 같은 한 줄 입력은 TextPrompt(가운데 작은 창 — Android에 Alert.prompt가 없어서 직접 그림).
import { Check, Folder, X } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useFolders, useLists } from '../data/lists'
import { EMPTY_FILTER, FILTER_DATES, filterSummary, readFilter, writeFilter, type FilterRule } from '../data/filters'
import { saveFilter, saveFolder, saveList, saveTag, useFilters, useListFull, useTagsFull } from '../data/organization'
import { FONT, M, priorityColor } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { Cell, Cells } from './Cells'
import { GlassButton } from './Glass'

export const ORG_COLORS = ['', '#ff6467', '#ffb74d', '#ffd54f', '#d4e157', '#4ade80', '#60a5fa', '#818cf8', '#c084fc']

/** 페이지 시트 뼈대 */
function Sheet(props: { open: boolean; title: string; canSave: boolean; busy?: boolean; error?: string; onClose: () => void; onSave: () => void; children: ReactNode }) {
  const p = usePalette()
  return (
    <Modal visible={props.open} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: p.pageBg }}>
        <View style={s.head}>
          <GlassButton label="닫기" onPress={props.onClose}><X size={20} color={p.textPrimary} /></GlassButton>
          <Text style={[FONT.nav, s.title, { color: p.textPrimary }]} numberOfLines={1}>{props.title}</Text>
          <GlassButton label="저장" disabled={!props.canSave || props.busy} onPress={props.onSave} plain style={{ backgroundColor: props.canSave ? p.accent : p.bgSelected }}>
            <Check size={20} color={props.canSave ? '#fff' : p.textQuaternary} />
          </GlassButton>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
          {props.error ? <Text style={[s.err, { color: p.danger }]} accessibilityRole="alert">{props.error}</Text> : null}
          {props.children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/** 이모지 칸(40) + 이름 입력(리스트 편집과 같은 줄 — 07) */
function NameRow(props: { emoji?: string | null; onEmoji?: (v: string) => void; name: string; onName: (v: string) => void; placeholder: string; prefix?: string }) {
  const p = usePalette()
  return (
    <View style={[s.nameRow, { backgroundColor: p.cardBg }]}>
      {props.onEmoji ? (
        <TextInput
          value={props.emoji ?? ''}
          onChangeText={(v) => props.onEmoji!(Array.from(v).slice(-1).join(''))}
          placeholder="🙂"
          placeholderTextColor={p.textQuaternary}
          style={[s.emoji, { backgroundColor: p.bgSelected, color: p.textPrimary }]}
          accessibilityLabel="이모지"
        />
      ) : props.prefix ? <Text style={[FONT.body, { color: p.textTertiary }]}>{props.prefix}</Text> : null}
      <TextInput
        autoFocus
        value={props.name}
        onChangeText={props.onName}
        placeholder={props.placeholder}
        placeholderTextColor={p.textQuaternary}
        style={[FONT.body, { flex: 1, color: p.textPrimary, height: 48 }]}
        accessibilityLabel="이름"
        returnKeyType="done"
      />
    </View>
  )
}
function Colors(props: { value: string | null; onChange: (c: string | null) => void }) {
  const p = usePalette()
  return (
    <View style={[s.colors, { backgroundColor: p.cardBg }]}>
      {ORG_COLORS.map((c) => {
        const on = (props.value ?? '') === c
        return (
          <Pressable key={c || 'none'} accessibilityRole="button" accessibilityLabel={c ? `색 ${c}` : '색 없음'} accessibilityState={{ selected: on }} onPress={() => props.onChange(c || null)} style={[s.swatch, { borderColor: on ? p.accent : 'transparent' }]}>
            <View style={[s.swatchIn, { backgroundColor: c || 'transparent', borderColor: c ? c : p.textQuaternary }]}>
              {!c ? <View style={[s.slash, { backgroundColor: p.textQuaternary }]} /> : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
const Title = ({ children }: { children: string }) => {
  const p = usePalette()
  return <Text style={[s.sec, { color: p.textTertiary }]}>{children}</Text>
}
function Chip(props: { label: string; on: boolean; onPress: () => void; color?: string }) {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: props.on }} onPress={props.onPress} style={[s.chip, { backgroundColor: props.on ? p.accent : p.bgSelected }]}>
      {props.color ? <View style={[s.cdot, { backgroundColor: props.color }]} /> : null}
      <Text style={{ fontSize: 14, color: props.on ? '#fff' : p.textPrimary }} numberOfLines={1}>{props.label}</Text>
    </Pressable>
  )
}

// ── 리스트 ──
export function ListEditSheet(props: { open: boolean; id: string | null; folderId?: string | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const p = usePalette()
  const list = useListFull(props.id)
  const folders = useFolders()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [smart, setSmart] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!props.open) return
    setName(list?.name ?? ''); setEmoji(list?.emoji ?? null); setColor(list?.color ?? null)
    setFolder(props.id ? list?.folder_id ?? null : props.folderId ?? null); setSmart((list?.show_in_smart ?? 'all') !== 'none'); setError(''); setBusy(false)
  }, [props.open, list?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true)
    try {
      const id = await saveList(props.id, { name, emoji, color, folder_id: folder, show_in_smart: smart ? 'all' : 'none' })
      props.onClose(); props.onSaved?.(id)
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요'); setBusy(false) }
  }
  const inbox = list?.kind === 'inbox'
  return (
    <Sheet open={props.open} title={props.id ? '리스트 편집' : '리스트 추가'} canSave={!!name.trim() && !busy} busy={busy} error={error} onClose={props.onClose} onSave={() => void save()}>
      <NameRow emoji={emoji} onEmoji={setEmoji} name={name} onName={setName} placeholder="이름" />
      <Title>색</Title>
      <Colors value={color} onChange={setColor} />
      {!inbox ? (
        <>
          <Title>폴더</Title>
          <Cells>
            <Cell first label="없음" chevron={false} right={!folder ? <Check size={16} color={p.accent} /> : null} onPress={() => setFolder(null)} />
            {folders.map((f) => <Cell key={f.id} label={f.name} icon={<Folder size={18} color={p.textSecondary} />} iconBg="transparent" chevron={false} right={folder === f.id ? <Check size={16} color={p.accent} /> : null} onPress={() => setFolder(f.id)} />)}
          </Cells>
        </>
      ) : null}
      <Cells>
        <Cell first label="스마트 목록에 표시" chevron={false} right={<Switch value={smart} onValueChange={setSmart} />} />
      </Cells>
      <Text style={[s.hint, { color: p.textTertiary }]}>끄면 오늘·내일·다음 7일·전체에서 이 리스트의 할 일을 빼요.</Text>
    </Sheet>
  )
}

// ── 폴더 ──
export function FolderEditSheet(props: { open: boolean; id: string | null; onClose: () => void }) {
  const p = usePalette()
  const folders = useFolders()
  const lists = useLists()
  const [name, setName] = useState('')
  const [pick, setPick] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!props.open) return
    setName(folders.find((f) => f.id === props.id)?.name ?? ''); setPick([]); setError(''); setBusy(false)
  }, [props.open]) // eslint-disable-line react-hooks/exhaustive-deps
  const loose = lists.filter((l) => l.kind !== 'inbox' && (!l.folder_id || !folders.some((f) => f.id === l.folder_id)))
  const save = async () => {
    setBusy(true)
    try { await saveFolder(props.id, name, pick); props.onClose() } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요'); setBusy(false) }
  }
  return (
    <Sheet open={props.open} title={props.id ? '폴더 편집' : '폴더 추가'} canSave={!!name.trim() && !busy} busy={busy} error={error} onClose={props.onClose} onSave={() => void save()}>
      <NameRow name={name} onName={setName} placeholder="폴더 이름" />
      {loose.length ? (
        <>
          <Title>{props.id ? '이 폴더에 넣을 리스트' : '넣을 리스트'}</Title>
          <Cells>
            {loose.map((l, i) => {
              const on = pick.includes(l.id)
              return <Cell key={l.id} first={i === 0} label={l.emoji ? `${l.emoji} ${l.name}` : l.name} chevron={false} right={on ? <Check size={16} color={p.accent} /> : null} onPress={() => setPick((x) => (on ? x.filter((y) => y !== l.id) : [...x, l.id]))} />
            })}
          </Cells>
        </>
      ) : null}
    </Sheet>
  )
}

// ── 태그 ──
export function TagEditSheet(props: { open: boolean; id: string | null; onClose: () => void }) {
  const p = usePalette()
  const tags = useTagsFull()
  const tag = tags.find((t) => t.id === props.id)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [parent, setParent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!props.open) return
    setName(tag?.name ?? ''); setColor(tag?.color ?? null); setParent(tag?.parent_id ?? null); setError(''); setBusy(false)
  }, [props.open, tag?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasKids = !!props.id && tags.some((t) => t.parent_id === props.id)
  const parents = tags.filter((t) => !t.parent_id && t.id !== props.id)
  const save = async () => {
    setBusy(true)
    try { await saveTag(props.id, { name, color, parent_id: parent }); props.onClose() } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요'); setBusy(false) }
  }
  return (
    <Sheet open={props.open} title={props.id ? '태그 편집' : '태그 추가'} canSave={!!name.trim() && !busy} busy={busy} error={error} onClose={props.onClose} onSave={() => void save()}>
      <NameRow name={name} onName={setName} placeholder="태그 이름" prefix="#" />
      <Title>색</Title>
      <Colors value={color} onChange={setColor} />
      <Title>상위 태그</Title>
      <Cells>
        <Cell first label="없음" chevron={false} right={!parent ? <Check size={16} color={p.accent} /> : null} onPress={() => setParent(null)} />
        {hasKids ? null : parents.map((t) => <Cell key={t.id} label={`#${t.name}`} chevron={false} right={parent === t.id ? <Check size={16} color={p.accent} /> : null} onPress={() => setParent(t.id)} />)}
      </Cells>
      <Text style={[s.hint, { color: p.textTertiary }]}>{hasKids ? '하위 태그가 있는 태그는 다른 태그 아래에 넣을 수 없어요(최대 2단계).' : '태그는 최대 2단계로 정리할 수 있어요.'}</Text>
    </Sheet>
  )
}

// ── 필터(07: 같은 종류는 OR, 종류 사이 AND, 빈 선택은 전체) ──
export function FilterEditSheet(props: { open: boolean; id: string | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const p = usePalette()
  const filters = useFilters()
  const lists = useLists()
  const tags = useTagsFull()
  const f = filters.find((x) => x.id === props.id)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [rule, setRule] = useState<FilterRule>(EMPTY_FILTER)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!props.open) return
    setName(f?.name ?? ''); setEmoji(f?.emoji ?? null); setRule(f ? readFilter(f.rule_json) : EMPTY_FILTER); setError(''); setBusy(false)
  }, [props.open, f?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = <K extends 'lists' | 'tags' | 'priorities'>(k: K, v: FilterRule[K][number]) =>
    setRule((r) => ({ ...r, [k]: (r[k] as unknown[]).includes(v) ? (r[k] as unknown[]).filter((x) => x !== v) : [...(r[k] as unknown[]), v] }))
  const save = async () => {
    setBusy(true)
    try {
      const id = await saveFilter(props.id, { name, emoji, rule_json: writeFilter(rule) })
      props.onClose(); props.onSaved?.(id)
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요'); setBusy(false) }
  }
  const names = { lists: Object.fromEntries(lists.map((l) => [l.id, l.kind === 'inbox' ? '기본함' : l.name])), tags: Object.fromEntries(tags.map((t) => [t.id, t.name])) }
  return (
    <Sheet open={props.open} title={props.id ? '필터 편집' : '필터 추가'} canSave={!!name.trim() && !busy} busy={busy} error={error} onClose={props.onClose} onSave={() => void save()}>
      <NameRow emoji={emoji} onEmoji={setEmoji} name={name} onName={setName} placeholder="필터 이름" />
      <Title>리스트</Title>
      <View style={s.chips}>
        <Chip label="전체" on={!rule.lists.length} onPress={() => setRule((r) => ({ ...r, lists: [] }))} />
        {lists.map((l) => <Chip key={l.id} label={l.kind === 'inbox' ? '기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name}`} color={l.color ?? undefined} on={rule.lists.includes(l.id)} onPress={() => toggle('lists', l.id)} />)}
      </View>
      <Title>태그</Title>
      <View style={s.chips}>
        <Chip label="전체" on={!rule.tags.length} onPress={() => setRule((r) => ({ ...r, tags: [] }))} />
        {tags.map((t) => <Chip key={t.id} label={`#${t.name}`} on={rule.tags.includes(t.id)} onPress={() => toggle('tags', t.id)} />)}
      </View>
      <Title>날짜</Title>
      <View style={s.chips}>
        {FILTER_DATES.map(([d, label]) => <Chip key={d} label={label} on={rule.date === d} onPress={() => setRule((r) => ({ ...r, date: d }))} />)}
      </View>
      <Title>우선순위</Title>
      <View style={s.chips}>
        <Chip label="전체" on={!rule.priorities.length} onPress={() => setRule((r) => ({ ...r, priorities: [] }))} />
        {[3, 2, 1, 0].map((n) => <Chip key={n} label={['없음', '낮음', '중간', '높음'][n]} color={n ? priorityColor(p, n) : undefined} on={rule.priorities.includes(n)} onPress={() => toggle('priorities', n)} />)}
      </View>
      <Title>포함</Title>
      <View style={[s.nameRow, { backgroundColor: p.cardBg }]}>
        <TextInput value={rule.keyword} onChangeText={(k) => setRule((r) => ({ ...r, keyword: k }))} placeholder="작업 키워드" placeholderTextColor={p.textQuaternary} style={[FONT.body, { flex: 1, color: p.textPrimary, height: 48 }]} accessibilityLabel="포함 키워드" />
      </View>
      <Text style={[s.hint, { color: p.textTertiary }]}>{filterSummary(rule, names)}</Text>
    </Sheet>
  )
}

// ── 한 줄 입력 창(섹션 이름 등) ──
export function TextPrompt(props: { open: boolean; title: string; initial?: string; placeholder: string; confirm?: string; onClose: () => void; onSubmit: (v: string) => Promise<void> | void }) {
  const p = usePalette()
  const [v, setV] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (props.open) { setV(props.initial ?? ''); setError('') } }, [props.open, props.initial])
  const ok = async () => {
    if (!v.trim()) return
    try { await props.onSubmit(v.trim()); props.onClose() } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요') }
  }
  return (
    <Modal transparent visible={props.open} animationType="fade" onRequestClose={props.onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.dim, { backgroundColor: p.scrim }]}>
        <View style={[s.box, { backgroundColor: p.bgPopover, borderColor: p.borderPopover }]}>
          <Text style={[FONT.nav, { color: p.textPrimary, textAlign: 'center' }]}>{props.title}</Text>
          <TextInput autoFocus value={v} onChangeText={setV} onSubmitEditing={() => void ok()} placeholder={props.placeholder} placeholderTextColor={p.textQuaternary} returnKeyType="done" style={[FONT.body, s.input, { color: p.textPrimary, borderColor: p.accent }]} accessibilityLabel={props.title} />
          {error ? <Text style={{ color: p.danger, fontSize: 13 }}>{error}</Text> : null}
          <View style={s.btns}>
            <Pressable accessibilityRole="button" onPress={props.onClose} style={s.btn}><Text style={{ fontSize: 16, color: p.textSecondary }}>취소</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={!v.trim()} onPress={() => void ok()} style={s.btn}><Text style={{ fontSize: 16, fontWeight: '600', color: v.trim() ? p.accentInk : p.textQuaternary }}>{props.confirm ?? '확인'}</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  head: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  title: { flex: 1, textAlign: 'center' },
  err: { fontSize: 13, paddingHorizontal: M.cardInset + 14, paddingBottom: 8 },
  nameRow: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 6 },
  emoji: { width: 40, height: 36, borderRadius: 8, textAlign: 'center', fontSize: 20 },
  sec: { fontSize: 13, lineHeight: 18, paddingTop: 18, paddingBottom: 6, paddingHorizontal: M.cardInset + 14 },
  colors: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchIn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slash: { width: 30, height: 1.5, transform: [{ rotate: '-45deg' }] },
  hint: { fontSize: 12, lineHeight: 17, paddingHorizontal: M.cardInset + 14, paddingTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: M.cardInset + 2 },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220 },
  cdot: { width: 8, height: 8, borderRadius: 4 },
  dim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 340, borderRadius: 16, borderWidth: 1, padding: 18, gap: 12 },
  input: { height: 44, borderBottomWidth: 1.5 },
  btns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8 }
})
