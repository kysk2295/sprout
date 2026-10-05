// 29 §9.4 정리 — 기본함 정리 · 밀린 일(31 T.* 분류 책상을 휴대폰으로: 끌기 대신 왼쪽 밀기 `옮기기` · 옮기기 시트).
// 탭 기본함 · 기한 지난 일 · 프로젝트 밖 · 태그 없음. 제안 칩 `→ 리스트/프로젝트` 좋아/아니, 제안 모두 옮기기 · 하나씩 볼래, 기한 지난 일 한꺼번에.
// 네 탭이 비면 `다 정리했어!` + 정리 +20 XP(하루 1회, 이번에 1개 이상 처리했을 때). params: tab
import { lateGroups, rowMeta, TAB_LABEL, TIDY_TABS, bubbleFor, type Proposal, type TidyTab, type TidyTask } from '@sprout/schema/tidy'
import { XP } from '@sprout/schema/growth'
import { useQuery } from '@powersync/react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRightLeft, CalendarClock, Check, ChevronLeft, Folder, Sun } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { grantTidyXp } from '../src/growth/data'
import { nextMonday } from '../src/lib/dates'
import { Buddy, PartnerLine } from '../src/map/v2/bits'
import { applyProposals, lateAction, putInto, sayNo, useTidyData, type TidyData } from '../src/map/v2/tidy'
import { usePalette } from '../src/theme/ThemeProvider'
import { closeOpenRow, SwipeRow } from '../src/ui/SwipeRow'
import { useToast } from '../src/ui/Toast'
import { SheetHead } from '../src/ui/SheetHead'

type Target = { kind: 'list' | 'project'; id: string }
/** 휴대폰엔 끌기가 없다 — 공용 문구의 '끌어다 놓으면'을 밀기·옮기기로 */
const phoneText = (t: string) => t.replace('프로젝트 상자에 끌어다 놓으면 묶여.', '밀어서 옮기기로 프로젝트에 묶을 수 있어.')

export default function TidyScreen() {
  const params = useLocalSearchParams<{ tab?: string }>()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const data = useTidyData()
  const [tab, setTab] = useState<TidyTab>((TIDY_TABS as string[]).includes(params.tab ?? '') ? (params.tab as TidyTab) : 'inbox')
  const [sel, setSel] = useState<string[]>([])
  const [one, setOne] = useState(false)
  const [sheet, setSheet] = useState<string[] | null>(null)
  const [hidden, setHidden] = useState(false)
  const processed = useRef(0)
  const granted = useRef(false)
  const xpRow = useQuery<{ id: string }>('SELECT id FROM xp_events WHERE kind = ? AND ref_id = ? LIMIT 1', ['tidy', `tidy:${data.today}`]).data

  const pile = data.piles[tab]
  const props = data.proposals[tab]
  const propOf = useMemo(() => new Map(props.map((x) => [x.taskId, x])), [props])
  const counts = Object.fromEntries(TIDY_TABS.map((t) => [t, data.piles[t].length])) as Record<TidyTab, number>
  const allClear = data.loaded && TIDY_TABS.every((t) => !counts[t])
  useEffect(() => { setSel([]); setOne(false) }, [tab])
  useEffect(() => {
    if (allClear && processed.current > 0 && !granted.current) { granted.current = true; void grantTidyXp(data.today).catch((e) => console.warn('[tidy] XP', e)) }
  }, [allClear, data.today])

  const did = (n: number) => { processed.current += n }
  const targetName = (to: Target) => to.kind === 'list' ? (() => { const l = data.listOf.get(to.id); return l ? `${l.emoji ? `${l.emoji} ` : ''}${l.name}` : '' })() : data.tagOf.get(to.id)?.name ?? ''
  const put = async (ids: string[], to: Target) => {
    closeOpenRow()
    const undo = await putInto(ids, to)
    did(ids.length)
    setSel([]); setSheet(null)
    const name = targetName(to)
    toast.show(to.kind === 'list' ? (ids.length > 1 ? `${ids.length}개를 ${name}로 옮겼어요` : `${name}로 옮겼어요`) : `${ids.length}개를 ${name}에 묶었어요`, { undo })
  }
  const yes = (x: Proposal) => void put([x.taskId], x.to)
  const no = (x: Proposal) => { sayNo(x) }
  const applyAll = async () => {
    const r = await applyProposals(props)
    did(props.length)
    toast.show(`제안대로 ${r.lists}개 옮김${r.projects ? ` · ${r.projects}개 프로젝트에 묶음` : ''}`, { undo: r.undo })
  }
  const late = async (kind: 'today' | 'next' | 'done' | 'trash', ids = sel) => {
    if (!ids.length) return
    closeOpenRow()
    const date = kind === 'today' ? data.today : kind === 'next' ? nextMonday(data.today) : undefined
    const undo = await lateAction(ids, kind, date)
    did(ids.length)
    setSel([])
    const what = kind === 'today' ? '오늘로 옮겼어요' : kind === 'next' ? '다음 주로 옮겼어요' : kind === 'done' ? '완료했어요 (XP 없음)' : '지웠어요'
    toast.show(`${ids.length}개를 ${what}`, { undo })
  }
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))

  const groups = tab === 'overdue' ? lateGroups(pile, data.today) : [{ key: 'all', label: '', tasks: pile }]
  const oldN = tab === 'overdue' ? lateGroups(pile, data.today).find((g) => g.key === 'old')?.tasks.length ?? 0 : 0
  const bubble = bubbleFor(tab, pile.length, props.length, { old: oldN, aiOk: false })
  const firstProp = one ? props[0]?.taskId : undefined
  const chipFor = (c: string) => c === 'apply' ? { key: c, label: '좋아', onPress: () => void applyAll() }
    : c === 'one' ? { key: c, label: '하나씩 볼래', primary: false, onPress: () => setOne(true) }
    : c === 'pickOld' ? { key: c, label: '한 달 넘은 것 고르기', onPress: () => setSel(lateGroups(pile, data.today).find((g) => g.key === 'old')?.tasks.map((t) => t.id) ?? []) }
    : c === 'today' ? { key: c, label: '전부 고르기', onPress: () => setSel(pile.map((t) => t.id)) } : null

  const row = (t: TidyTask, first: boolean) => {
    const x = propOf.get(t.id)
    const on = sel.includes(t.id)
    const dim = one && firstProp && firstProp !== t.id
    const unsure = tab === 'inbox' && !x
    return (
      <SwipeRow key={t.id}
        right={[
          ...(tab === 'overdue' ? [
            { key: 'today', color: p.swipeDate, icon: <Sun size={20} color="#fff" />, label: '오늘로', onPress: () => void late('today', [t.id]) },
            { key: 'next', color: p.swipePin, icon: <CalendarClock size={20} color="#fff" />, label: '다음 주로', onPress: () => void late('next', [t.id]) }
          ] : []),
          { key: 'move', color: p.swipeMove, icon: <ArrowRightLeft size={20} color="#fff" />, label: '옮기기', onPress: () => setSheet(on ? sel : [t.id]) }
        ]}>
        <Pressable onPress={() => router.push(`/task/${t.id}`)} accessibilityRole="button" accessibilityHint="왼쪽으로 밀면 옮기기"
          style={({ pressed }) => [s.row, { backgroundColor: on ? p.accentSubtle : pressed ? p.bgSelected : p.cardBg, opacity: dim ? 0.35 : 1 },
            !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider },
            one && firstProp === t.id && { borderWidth: 2, borderColor: p.accent }]}>
          <Pressable onPress={() => toggle(t.id)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel="고르기"
            style={[s.box, { borderColor: on ? p.accent : p.textQuaternary, backgroundColor: on ? p.accent : 'transparent' }]}>
            {on ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: p.textPrimary, fontSize: 15.5, fontWeight: tab === 'overdue' ? '500' : '600' }} numberOfLines={2}>{t.title}</Text>
            <Text style={{ color: tab === 'overdue' ? p.overdue : p.textTertiary, fontSize: 12.5 }} numberOfLines={1}>
              {rowMeta(tab, t, data.place(t), data.today)}{unsure ? ' · 확실하지 않아요 — 밀어서 옮겨요' : ''}
            </Text>
            {x ? (
              <View style={s.sugRow}>
                <Text style={{ color: p.accent, fontSize: 13, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>→ {targetName(x.to)}{x.to.kind === 'project' ? ' (프로젝트)' : ''}</Text>
                <Pressable onPress={() => yes(x)} accessibilityRole="button" style={[s.yes, { backgroundColor: p.accent }]}><Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>좋아</Text></Pressable>
                <Pressable onPress={() => no(x)} accessibilityRole="button" style={[s.yes, { backgroundColor: p.bgSelected }]}><Text style={{ color: p.textSecondary, fontSize: 12.5, fontWeight: '600' }}>아니</Text></Pressable>
              </View>
            ) : null}
          </View>
        </Pressable>
      </SwipeRow>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.nav, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="뒤로" style={s.back} hitSlop={6}><ChevronLeft size={24} color={p.accent} /><Text style={{ color: p.accent, fontSize: 17 }}>뒤로</Text></Pressable>
      </View>
      <Text style={[s.title, { color: p.textPrimary }]}>정리</Text>
      {!data.loaded ? null : allClear ? (
        <View style={{ alignItems: 'center', paddingHorizontal: 28, paddingTop: 40, gap: 10 }}>
          <Buddy size={96} mood="happy" still />
          <Text style={{ color: p.textPrimary, fontSize: 22, fontWeight: '700' }}>다 정리했어!</Text>
          <Text style={{ color: p.textTertiary, fontSize: 13.5 }}>{TIDY_TABS.map((t) => `${TAB_LABEL[t]} 0`).join(' · ')}</Text>
          {xpRow.length ? <View style={[s.xp, { backgroundColor: p.accentSubtle }]}><Text style={{ color: p.accent, fontWeight: '700' }}>정리 보너스 +{XP.tidy} XP</Text></View> : null}
          <Pressable onPress={() => router.push('/map')} accessibilityRole="button" style={[s.big, { backgroundColor: p.accent, alignSelf: 'stretch', marginTop: 8 }]}><Text style={s.bigT}>작업 지도 보기</Text></Pressable>
        </View>
      ) : (
        <>
          <ScrollView horizontal style={{ flexGrow: 0, flexShrink: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
            {TIDY_TABS.map((t) => {
              const on = t === tab
              return (
                <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.tab, { backgroundColor: on ? p.textPrimary : p.cardBg }]}>
                  <Text style={{ color: on ? p.pageBg : p.textSecondary, fontSize: 13.5, fontWeight: '600' }}>{TAB_LABEL[t]} {counts[t]}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} onScrollBeginDrag={closeOpenRow}>
            {!hidden ? <PartnerLine text={phoneText(bubble.text)} chips={(() => { const cs = bubble.chips.map(chipFor).filter((c): c is NonNullable<ReturnType<typeof chipFor>> => !!c); return cs.length ? [...cs, { key: 'x', label: '✕', primary: false, onPress: () => setHidden(true) }] : [] })()} /> : null}
            {!pile.length ? <Text style={{ color: p.textTertiary, textAlign: 'center', marginTop: 30, fontSize: 15 }}>✓ {TAB_LABEL[tab]} 깨끗해요</Text> : null}
            {groups.map((g) => (
              <View key={g.key}>
                {g.label ? (
                  <View style={s.ghead}>
                    <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '700', flex: 1 }}>{g.label} {g.tasks.length}</Text>
                    <Pressable onPress={() => { const ids = g.tasks.map((t) => t.id); const all = ids.every((id) => sel.includes(id)); setSel((x) => all ? x.filter((y) => !ids.includes(y)) : [...new Set([...x, ...ids])]) }} hitSlop={8} accessibilityRole="button">
                      <Text style={{ color: p.accent, fontSize: 13, fontWeight: '600' }}>{g.tasks.every((t) => sel.includes(t.id)) ? '고름 풀기' : '모두 고르기'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={[s.card, { backgroundColor: p.cardBg }]}>{g.tasks.map((t, i) => row(t, i === 0))}</View>
              </View>
            ))}
            {props.length && !sel.length ? (
              <View style={s.applyRow}>
                <Pressable onPress={() => void applyAll()} accessibilityRole="button" style={[s.big, { backgroundColor: p.accent, flex: 1 }]}><Text style={s.bigT}>제안 {props.length}개 모두 옮기기</Text></Pressable>
                <Pressable onPress={() => setOne((v) => !v)} accessibilityRole="button" hitSlop={8}><Text style={{ color: p.accent, fontSize: 14, fontWeight: '600', padding: 8 }}>{one ? '모두 보기' : '하나씩 볼래'}</Text></Pressable>
              </View>
            ) : null}
          </ScrollView>
          {sel.length || tab === 'overdue' ? (
            <View style={[s.bar, { paddingBottom: insets.bottom + 10, backgroundColor: p.cardBg, borderTopColor: p.borderDivider }]}>
              <Text style={{ color: p.textSecondary, fontSize: 13 }}>{sel.length ? `${sel.length}개 고름` : '골라서 한꺼번에'}</Text>
              <View style={{ flex: 1 }} />
              {tab === 'overdue' ? (
                <>
                  <BarBtn label="오늘로" onPress={() => void late('today')} disabled={!sel.length} primary />
                  <BarBtn label="다음 주로" onPress={() => void late('next')} disabled={!sel.length} />
                  <BarBtn label="완료" onPress={() => void late('done')} disabled={!sel.length} />
                  <BarBtn label="지우기" onPress={() => void late('trash')} disabled={!sel.length} danger />
                </>
              ) : (
                <>
                  <BarBtn label="옮기기" onPress={() => setSheet(sel)} primary />
                  <BarBtn label="고름 풀기" onPress={() => setSel([])} />
                </>
              )}
            </View>
          ) : null}
        </>
      )}
      <MoveSheet ids={sheet} data={data} onClose={() => setSheet(null)} onPick={(to) => void put(sheet ?? [], to)} />
    </View>
  )
}

function BarBtn({ label, onPress, disabled, primary, danger }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  const p = usePalette()
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[s.bb, { backgroundColor: primary ? p.accent : 'transparent', opacity: disabled ? 0.4 : 1 }]}>
      <Text style={{ color: primary ? '#fff' : danger ? p.danger : p.textPrimary, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

/** 옮기기 시트: 위 프로젝트 알약(태그만) → 아래 폴더 › 리스트(옮김). 화면 안 Modal(아래에서 올라옴) */
function MoveSheet({ ids, data, onClose, onPick }: { ids: string[] | null; data: TidyData; onClose: () => void; onPick: (to: Target) => void }) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const inbox = data.lists.find((l) => l.kind === 'inbox')
  return (
    <Modal visible={!!ids} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: p.scrim }} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[s.sheet, { backgroundColor: p.sheetBg, paddingBottom: insets.bottom + 16 }]}>
        <View style={[s.grab, { backgroundColor: p.textQuaternary }]} />
        <SheetHead compact title={ids && ids.length > 1 ? `${ids.length}개 옮기기` : '옮기기'} onClose={onClose} />
        <ScrollView style={{ maxHeight: 520 }}>
          {data.projects.length ? (
            <>
              <Text style={s.sh}><Text style={{ color: p.textSecondary, fontWeight: '700' }}>프로젝트에 묶기</Text><Text style={{ color: p.textTertiary }}> · 리스트는 그대로, 태그만 붙어요</Text></Text>
              <View style={s.pills}>
                {data.projects.map(({ tag, count }) => (
                  <Pressable key={tag.id} onPress={() => onPick({ kind: 'project', id: tag.id })} accessibilityRole="button" style={[s.pill, { backgroundColor: p.accentSubtle }]}>
                    <Text style={{ color: p.accent, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{tag.name} <Text style={{ fontWeight: '400' }}>{count}</Text></Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Text style={[s.sh, { color: p.textSecondary, fontWeight: '700' }]}>리스트로 옮기기</Text>
          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            {inbox ? <ListRow name="기본함" first onPress={() => onPick({ kind: 'list', id: inbox.id })} /> : null}
            {data.buckets.map((b) => b.kind === 'list'
              ? <ListRow key={b.id} name={`${b.box.list.emoji ? `${b.box.list.emoji} ` : ''}${b.box.list.name}`} count={b.box.count} onPress={() => onPick({ kind: 'list', id: b.id })} />
              : (
                <View key={b.id}>
                  <View style={[s.fhead, { borderTopColor: p.borderDivider }]}><Folder size={15} color={p.textSecondary} /><Text style={{ color: p.textSecondary, fontSize: 13.5, fontWeight: '700' }}>{b.name}</Text></View>
                  {b.lists.map((x) => <ListRow key={x.list.id} indent name={`${x.list.emoji ? `${x.list.emoji} ` : ''}${x.list.name}`} count={x.count} onPress={() => onPick({ kind: 'list', id: x.list.id })} />)}
                </View>
              ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
function ListRow({ name, count, onPress, first, indent }: { name: string; count?: number; onPress: () => void; first?: boolean; indent?: boolean }) {
  const p = usePalette()
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.lrow, indent && { paddingLeft: 34 }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
      <Text style={{ flex: 1, color: p.textPrimary, fontSize: 15.5 }} numberOfLines={1}>{name}</Text>
      {count !== undefined ? <Text style={{ color: p.textTertiary, fontSize: 13 }}>{count}</Text> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 10 },
  tabs: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tab: { borderRadius: 999, paddingHorizontal: 14, height: 34, justifyContent: 'center' },
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  ghead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  sugRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  yes: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  applyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 4 },
  big: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  bigT: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  bb: { borderRadius: 999, paddingHorizontal: 11, height: 34, justifyContent: 'center' },
  xp: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  sh: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, fontSize: 13 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' },
  fhead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderTopWidth: StyleSheet.hairlineWidth },
  lrow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }
})
