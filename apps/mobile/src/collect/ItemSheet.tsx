// 26 C4 항목 상세 시트: 머리(작성 시각 · 카톡 · ⋯) / 제목 20/700 + 본문(0.6초 뒤 자동 저장) / 링크 / AI 판단 카드(읽기 전용 + 종류 바꾸기)
// / 할 일로 만들기(제목 · 리스트 · 날짜 시트 → 등록, 데스크톱 ConvertPopover와 같은 검사) / 바닥 줄(날짜 · 공유·복사 · 삭제).
// 휴대폰은 AI를 부르지 않는다(26 M-C5) — 정리 전·실패는 "컴퓨터에서 정리" 안내만.
import { useQuery } from '@powersync/react-native'
import { useRouter } from 'expo-router'
import { BookOpen, CalendarDays, ChevronRight, Ellipsis, ExternalLink, FileText, Link2, Share2, Sparkles, Trash2 } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLists } from '../data/lists'
import { dayKey, detailDateLabel } from '../lib/dates'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { BottomSheet } from '../ui/BottomSheet'
import { DateSheet } from '../ui/DateSheet'
import { EMPTY_SCHEDULE, type Schedule } from '../ui/dateSheetModel'
import { GlassButton } from '../ui/Glass'
import { CloseButton } from '../ui/SheetHead'
import { PopMenu, useAnchor } from '../ui/Menu'
import { useToast } from '../ui/Toast'
import {
  domainOf, firstLine, fullKo, isKakao, ITEMS_SQL, KIND_NAME, KINDS, registeredGone, ro, scheduledWord, sentAt, suggestionOf,
  type CollectItem, type CollectKind
} from './core'
import { convertItem, deleteItem, editItem, registerSuggestion, setKind, setSeen } from './data'

const ONE_SQL = ITEMS_SQL.replace("WHERE instr(lower(n.content || ' ' || COALESCE(n.link_title, '')), lower(?)) > 0", 'WHERE n.id = ?')
const split = (s: string) => { const i = s.indexOf('\n'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)] }
const join = (t: string, b: string) => (b ? `${t}\n${b}` : t)

export function ItemSheet({ id, startConvert, onClose, onTopic }: { id: string | null; startConvert?: boolean; onClose: () => void; onTopic: (topicId: string) => void }) {
  const p = usePalette()
  const item = useQuery<CollectItem>(ONE_SQL, [id ?? '']).data[0]
  const [convert, setConvert] = useState(false)
  useEffect(() => { setConvert(!!startConvert) }, [id, startConvert])
  const more = useAnchor()
  const toast = useToast()
  const router = useRouter()

  const remove = async () => {
    if (!item) return
    onClose()
    const undo = await deleteItem(item.id)
    toast.show('삭제했어요', { undo, duration: 5000 })
  }
  const share = () => { if (item) void Share.share({ message: item.content }) }
  const kakao = item ? isKakao(item) : false
  const head = item ? (
    <View style={s.head}>
      <CloseButton onPress={onClose} />
      <Text style={[FONT.meta, { color: p.textTertiary, flex: 1, textAlign: 'center' }]} numberOfLines={1}>
        {kakao ? `${fullKo(sentAt(item))} · 카톡에서 가져옴` : `${fullKo(item.created_at)} 작성`}
      </Text>
      <View ref={more.ref} collapsable={false}>
        <GlassButton label="항목 메뉴" onPress={more.open}><Ellipsis size={20} color={p.textPrimary} /></GlassButton>
      </View>
    </View>
  ) : null
  const footer = item ? (
    <View style={[s.footer, { borderTopColor: p.borderDivider }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.task_id ? '연결된 할 일 열기' : '할 일로 만들기'} style={s.fbtn} onPress={() => (item.task_id && !registeredGone(item) ? (onClose(), router.push(`/task/${item.task_id}`)) : setConvert(true))}>
        <CalendarDays size={22} color={p.textSecondary} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="공유·복사" style={s.fbtn} onPress={share}><Share2 size={22} color={p.textSecondary} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="삭제" style={s.fbtn} onPress={() => void remove()}><Trash2 size={22} color={p.danger} /></Pressable>
    </View>
  ) : null

  return (
    <BottomSheet visible={!!id} onClose={onClose} mid={0.72} head={head} footer={convert ? null : footer} label="항목 상세">
      {item ? (
        convert ? (
          <ConvertPanel item={item} onCancel={() => setConvert(false)} onDone={(title) => { onClose(); toast.show(`"${title}" 할 일로 등록했어요`, { action: { label: '열기', onPress: () => router.push(`/task/note-${item.id}`) } }) }} />
        ) : (
          <Body key={item.id} item={item} onClose={onClose} onTopic={onTopic} onConvert={() => setConvert(true)} />
        )
      ) : null}
      <PopMenu anchor={more.rect} onClose={more.close} width={230} items={[
        { key: 'convert', label: item?.task_id ? `${item ? scheduledWord(item) : '할 일'} 열기` : '할 일로 만들기', onPress: () => (item?.task_id ? (onClose(), router.push(`/task/${item.task_id}`)) : setConvert(true)) },
        ...KINDS.filter((k) => k !== item?.kind).map((k) => ({ key: `k-${k}`, label: `${ro(KIND_NAME[k])} 바꾸기`, onPress: () => item && void setKind(item, k) })),
        { key: 'share', label: '공유·복사', onPress: share },
        { key: 'del', label: '삭제', danger: true, onPress: () => void remove() }
      ]} />
    </BottomSheet>
  )
}

function Body({ item, onClose, onTopic, onConvert }: { item: CollectItem; onClose: () => void; onTopic: (id: string) => void; onConvert: () => void }) {
  const p = usePalette()
  const router = useRouter()
  const [title, setTitle] = useState(() => split(item.content)[0])
  const [body, setBody] = useState(() => split(item.content)[1])
  const saved = useRef(item.content)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const focused = useRef(false)
  const flush = (t = title, b = body) => {
    clearTimeout(timer.current)
    const next = join(t, b)
    if (next === saved.current || !next.trim()) return
    saved.current = next
    void editItem(item.id, next)
  }
  const schedule = (t: string, b: string) => { clearTimeout(timer.current); timer.current = setTimeout(() => flush(t, b), 600) }
  useEffect(() => () => { clearTimeout(timer.current) }, [])
  // 닫힐 때 남은 고침을 저장
  const latest = useRef({ title, body })
  latest.current = { title, body }
  useEffect(() => () => { const { title: t, body: b } = latest.current; const next = join(t, b); if (next !== saved.current && next.trim()) void editItem(item.id, next) }, [item.id])
  // 다른 기기에서 글이 바뀌면 고치는 중이 아닐 때만 따라간다
  useEffect(() => {
    if (item.content === saved.current || focused.current) return
    saved.current = item.content
    const [t, b] = split(item.content)
    setTitle(t); setBody(b)
  }, [item.content])
  const links = Array.from(new Set(join(title, body).match(/https?:\/\/[^\s)]+/g) ?? [])).slice(0, 5)
  const gone = registeredGone(item)
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      <TextInput
        style={[s.title, { color: p.textPrimary }]}
        value={title}
        placeholder="제목"
        placeholderTextColor={p.textQuaternary}
        multiline
        scrollEnabled={false}
        submitBehavior="blurAndSubmit"
        accessibilityLabel="제목"
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; flush() }}
        onChangeText={(v) => { const t = v.replace(/\n/g, ' '); setTitle(t); schedule(t, body) }}
      />
      <TextInput
        style={[s.body, { color: p.textSecondary }]}
        value={body}
        placeholder="내용"
        placeholderTextColor={p.textQuaternary}
        multiline
        scrollEnabled={false}
        accessibilityLabel="내용"
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; flush() }}
        onChangeText={(v) => { setBody(v); schedule(title, v) }}
      />
      {links.map((l) => (
        <Pressable key={l} accessibilityRole="link" onPress={() => void Linking.openURL(l)} style={s.link}>
          <Link2 size={15} color={p.accent} />
          <Text style={[FONT.sub, { color: p.accent, flex: 1 }]} numberOfLines={1}>{l.replace(/^https?:\/\//, '')}</Text>
        </Pressable>
      ))}
      {item.task_id ? (
        gone ? <Text style={[FONT.sub, s.linked, { color: p.textTertiary }]}>연결된 항목이 삭제되었어요</Text> : (
          <Pressable accessibilityRole="button" onPress={() => { onClose(); router.push(`/task/${item.task_id}`) }} style={[s.linked, s.linkedRow, { backgroundColor: p.accentSubtle }]}>
            <Text style={[FONT.sub, { color: p.accent, flex: 1 }]} numberOfLines={1}>↳ {scheduledWord(item)}: {item.task_title}</Text>
            <ExternalLink size={15} color={p.accent} />
          </Pressable>
        )
      ) : (
        <AiCard item={item} onTopic={(t) => { onClose(); onTopic(t) }} onConvert={onConvert} onRegistered={onClose} />
      )}
      <Text style={[FONT.meta, { color: p.textTertiary, paddingHorizontal: 16, marginTop: 10 }]}>글을 고치면 0.6초 뒤 자동 저장 · 사용자가 바꾼 종류는 AI가 다시 바꾸지 않아요</Text>
    </ScrollView>
  )
}

/** AI 판단 카드(11 v3-3): 할 일 = 제목·날짜·리스트 + [할 일로 등록] [메모로 두기], 그 밖 종류는 짧게. 아래 "다른 종류로" */
function AiCard({ item, onTopic, onConvert, onRegistered }: { item: CollectItem; onTopic: (id: string) => void; onConvert: () => void; onRegistered: () => void }) {
  const p = usePalette()
  const toast = useToast()
  const lists = useLists()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const by = item.kind_source === 'user'
  const change = (k: CollectKind) => void setKind(item, k).catch(() => toast.show('바꾸지 못했어요. 다시 시도해 주세요.', { error: true }))
  const others = KINDS.filter((k) => k !== item.kind)
  const Other = () => (
    <View style={s.other}>
      <Text style={[FONT.meta, { color: p.textTertiary }]}>다른 종류로:</Text>
      {others.map((k, i) => (
        <Pressable key={k} accessibilityRole="button" hitSlop={6} onPress={() => change(k)} style={{ flexDirection: 'row' }}>
          {i > 0 ? <Text style={[FONT.meta, { color: p.textTertiary }]}>· </Text> : null}
          <Text style={[s.otherBtn, { color: p.accent }]}>{KIND_NAME[k]}</Text>
        </Pressable>
      ))}
    </View>
  )
  const Card = ({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) => (
    <View style={[s.card, { backgroundColor: p.dark ? '#262628' : '#f6f6f8', borderColor: p.borderDivider }]}>
      <View style={s.cardHead}>{icon}<Text style={[FONT.group, { color: p.textPrimary }]}>{title}</Text></View>
      {children}
      <Other />
    </View>
  )
  const Field = ({ k, v, accent }: { k: string; v: string; accent?: boolean }) => (
    <View style={s.field}><Text style={[FONT.sub, { color: p.textTertiary, width: 52 }]}>{k}</Text><Text style={[FONT.sub, { color: accent ? p.accent : p.textPrimary, flex: 1 }]} numberOfLines={2}>{v}</Text></View>
  )
  const Btn = ({ label, primary, onPress, disabled }: { label: string; primary?: boolean; onPress: () => void; disabled?: boolean }) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, primary ? { backgroundColor: p.accent } : { backgroundColor: p.bgSelected }, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={[s.btnText, { color: primary ? '#fff' : p.textPrimary }]}>{label}</Text>
    </Pressable>
  )
  const spark = <Sparkles size={16} color={p.accent} />
  if (item.ai_state === 'pending') {
    return (
      <Card icon={spark} title="아직 정리하지 않았어요">
        <Text style={[FONT.sub, { color: p.textSecondary }]}>컴퓨터에서 꿈틀을 열면 AI가 할 일·볼 것·위키·메모로 나눠 둬요.</Text>
        <View style={s.acts}><Btn label="할 일로 만들기" primary onPress={onConvert} /></View>
      </Card>
    )
  }
  if (!item.kind || item.ai_state === 'failed') {
    return (
      <Card icon={spark} title={item.ai_state === 'failed' ? '정리하지 못했어요' : '아직 정리하지 않았어요'}>
        <Text style={[FONT.sub, { color: p.textSecondary }]}>컴퓨터에서 다시 정리할 수 있어요</Text>
        <View style={s.acts}><Btn label="할 일로 만들기" primary onPress={onConvert} /></View>
      </Card>
    )
  }
  if (item.kind === 'task') {
    const sug = suggestionOf(item)
    const list = lists.find((l) => l.id === sug?.listId) ?? lists.find((l) => l.kind === 'inbox')
    const date = sug?.due ? detailDateLabel({ start_at: sug.start || null, due_at: sug.due }, dayKey()) : null
    const register = async () => {
      setBusy(true)
      try {
        const taskId = await registerSuggestion(item)
        onRegistered()
        toast.show(`"${sug?.title || firstLine(item.content)}" 할 일로 등록했어요`, { action: { label: '열기', onPress: () => router.push(`/task/${taskId}`) } })
      } catch (e) {
        toast.show(e instanceof Error ? e.message : '등록하지 못했어요. 다시 시도해 주세요.', { error: true })
      } finally { setBusy(false) }
    }
    return (
      <Card icon={spark} title={by ? '할 일로 정했어요' : 'AI가 할 일로 봤어요'}>
        <Field k="제목" v={sug?.title || firstLine(item.content)} />
        <Field k="날짜" v={date?.label === '기한' || !date ? '없음' : date.label} accent={!!date && date.tone !== 'none'} />
        <Field k="리스트" v={list ? (list.kind === 'inbox' ? '기본함' : `${list.emoji ? list.emoji + ' ' : ''}${list.name}`) : '기본함'} />
        <View style={s.acts}>
          <Btn label="할 일로 등록" primary disabled={busy} onPress={() => void register()} />
          <Btn label="날짜 고치기" onPress={onConvert} />
          <Btn label="메모로 두기" onPress={() => change('memo')} />
        </View>
      </Card>
    )
  }
  if (item.kind === 'link') {
    return (
      <Card icon={<Link2 size={16} color={p.accent} />} title={by ? '볼 것으로 정했어요' : 'AI가 볼 것으로 봤어요'}>
        <Field k="제목" v={item.link_title || item.url || '링크 없음'} />
        {item.url ? <Field k="사이트" v={domainOf(item.url)} /> : null}
        {item.url ? (
          <View style={s.acts}>
            <Btn label="링크 열기" primary onPress={() => void Linking.openURL(item.url!)} />
            <Btn label={item.seen_at ? '안 본 것으로' : '봤어요'} onPress={() => void setSeen(item.id, !item.seen_at)} />
          </View>
        ) : null}
      </Card>
    )
  }
  if (item.kind === 'wiki') {
    return (
      <Card icon={<BookOpen size={16} color={p.accent} />} title={by ? '위키로 정했어요' : 'AI가 위키로 봤어요'}>
        {item.topic_id ? (
          <Pressable accessibilityRole="button" onPress={() => onTopic(item.topic_id!)} style={s.topicLink}>
            <Text style={[FONT.sub, { color: p.accent }]}>{item.topic_name ?? '주제'} 주제에 반영됨</Text>
            <ChevronRight size={15} color={p.accent} />
          </Pressable>
        ) : <Field k="주제" v="정리 전 — 컴퓨터에서 정리돼요" />}
      </Card>
    )
  }
  return <Card icon={<FileText size={16} color={p.accent} />} title={by ? '메모로 두었어요' : 'AI가 메모로 봤어요'} />
}

/** 할 일로 만들기: 제목 · 리스트 · 날짜(22 날짜 시트) — AI 제안이 있으면 그 값으로 채운다 */
function ConvertPanel({ item, onCancel, onDone }: { item: CollectItem; onCancel: () => void; onDone: (title: string) => void }) {
  const p = usePalette()
  const lists = useLists()
  const sug = suggestionOf(item)
  const [title, setTitle] = useState((sug?.title || firstLine(item.content)).slice(0, 200))
  const [listId, setListId] = useState('')
  const [when, setWhen] = useState<Schedule>(sug?.due ? { ...EMPTY_SCHEDULE, start_at: sug.start || null, due_at: sug.due, is_all_day: sug.due.includes('T') ? 0 : 1 } : EMPTY_SCHEDULE)
  const [dateOpen, setDateOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const listMenu = useAnchor()
  const chosen = listId || (sug?.listId && lists.some((l) => l.id === sug.listId) ? sug.listId : lists.find((l) => l.kind === 'inbox')?.id) || lists[0]?.id || ''
  const list = lists.find((l) => l.id === chosen)
  const date = detailDateLabel(when, dayKey())
  const submit = async () => {
    if (busy) return
    if (!title.trim()) return setError('제목을 입력해 주세요.')
    setBusy(true); setError('')
    try {
      await convertItem(item.id, { title, listId: chosen, due: when.due_at ?? undefined, start: when.start_at ?? undefined })
      onDone(title.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : '만들지 못했어요. 다시 시도해 주세요.')
      setBusy(false)
    }
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
      <Text style={[FONT.nav, { color: p.textPrimary, marginBottom: 12 }]}>할 일로 만들기</Text>
      <TextInput style={[s.convTitle, { color: p.textPrimary, backgroundColor: p.bgInput }]} value={title} onChangeText={setTitle} accessibilityLabel="제목" returnKeyType="done" onSubmitEditing={() => void submit()} />
      <View style={[s.convCard, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
        <View ref={listMenu.ref} collapsable={false}>
          <Pressable accessibilityRole="button" onPress={listMenu.open} style={s.convRow}>
            <Text style={[FONT.body, { color: p.textPrimary, flex: 1 }]}>리스트</Text>
            <Text style={[FONT.sub, { color: p.textSecondary }]}>{list ? (list.kind === 'inbox' ? '기본함' : `${list.emoji ? list.emoji + ' ' : ''}${list.name}`) : '선택'}</Text>
            <ChevronRight size={16} color={p.textQuaternary} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setDateOpen(true)} style={[s.convRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
          <Text style={[FONT.body, { color: p.textPrimary, flex: 1 }]}>날짜</Text>
          <Text style={[FONT.sub, { color: when.due_at ? (date.tone === 'overdue' ? p.overdue : p.accent) : p.textSecondary }]}>{when.due_at ? date.label : '없음'}</Text>
          <ChevronRight size={16} color={p.textQuaternary} />
        </Pressable>
      </View>
      <Text style={[FONT.meta, { color: p.textTertiary, marginTop: 8 }]}>원본은 그대로 두고 설명에 함께 저장해요</Text>
      {error ? <Text style={[FONT.sub, { color: p.danger, marginTop: 8 }]} accessibilityRole="alert">{error}</Text> : null}
      <View style={[s.acts, { marginTop: 16 }]}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={[s.btn, { flex: 1, backgroundColor: p.bgSelected }]}><Text style={[s.btnText, { color: p.textPrimary }]}>취소</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy || !title.trim() || !chosen} onPress={() => void submit()} style={[s.btn, { flex: 1, backgroundColor: p.accent }, (busy || !title.trim()) && { opacity: 0.5 }]}>
          <Text style={[s.btnText, { color: '#fff' }]}>{busy ? '만드는 중…' : '등록'}</Text>
        </Pressable>
      </View>
      <PopMenu anchor={listMenu.rect} onClose={listMenu.close} align="right" width={240} items={lists.map((l) => ({ key: l.id, label: l.kind === 'inbox' ? '기본함' : `${l.emoji ? l.emoji + ' ' : ''}${l.name}`, checked: l.id === chosen, onPress: () => setListId(l.id) }))} />
      <Modal visible={dateOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDateOpen(false)}>
        <View style={{ flex: 1, backgroundColor: p.sheetBg }}>
          <DateSheet initial={when} onClose={() => setDateOpen(false)} onDone={(v) => { setWhen(v); setDateOpen(false) }} />
        </View>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  head: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 4 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  body: { fontSize: 15.5, lineHeight: 23, paddingHorizontal: 16, paddingBottom: 10, minHeight: 46 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6 },
  linked: { marginHorizontal: 16, marginTop: 10 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  card: { marginHorizontal: 12, marginTop: 10, borderRadius: 14, padding: 14, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  field: { flexDirection: 'row', alignItems: 'flex-start' },
  acts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  btn: { height: 36, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
  other: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  otherBtn: { fontSize: 12.5, lineHeight: 16, fontWeight: '600' },
  topicLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  fbtn: { width: 64, height: 44, alignItems: 'center', justifyContent: 'center' },
  convTitle: { fontSize: 17, lineHeight: 22, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  convCard: { marginTop: 12, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  convRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }
})
