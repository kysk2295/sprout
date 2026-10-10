// 10 §4.6 · 49 §6.0 `이번 주` 팝업 = 목표 편집기(휴대폰). 공용 BottomSheet 안:
// [이번 주 | 다음 주] · 행(체크 · 제목 누르면 그 자리 이름 바꾸기 · 둘째 줄 진행(점·−/+·연결 꼬리표) + `목표 [−] n번 [+]` · 보상 칩 · ⋯) ·
// 왼쪽으로 밀어 삭제(팝업 안 되돌리기 5초 — 앱 토스트는 팝업 뒤) · 길게 눌러 끌어 순서(공용 DragReorder, 사본은 시트 overlay = 창 좌표) ·
// ⋯ = 세는 방법…(고르기 화면) · 다음 주로 넘기기 · 삭제. AI 초안 ✦ 줄(누르면 입력 줄로 고쳐 받기 · + · ×). 바닥 입력 줄은 키보드 위.
// 쓰기는 공용 @sprout/schema/goalCore(데스크톱과 같은 문장) — 고친 것은 같은 kpis 실시간 읽기라 고정 칸에 바로 보인다.
import { COMPANION_SIZE, QUEST_LIMIT_LINE, QUEST_LIMIT_NOTE } from '@sprout/schema/companion'
import { GOAL_TEMPLATES, GOAL_TARGET_MAX, GOAL_TITLE_ERROR, GOAL_TITLE_MAX, isLinked, linkLabel, parseGoal, type GoalLinkKind, type NewGoal } from '@sprout/schema/goalCore'
import { XP, type GoalDraft } from '@sprout/schema/growth'
import { addDays } from '@sprout/schema/time'
import { Check, ChevronLeft, Hash, ListTodo, MoreHorizontal, Plus, Sparkles, Trash2, X, FolderClosed, Hand } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBuddy } from '../diary/data'
import type { Palette } from '../theme/palette'
import { BottomSheet } from '../ui/BottomSheet'
import { Checkbox } from '../ui/Checkbox'
import { StaticFace } from '../ui/CompanionFace'
import { DragGhost, DragRow, useDragReorder, type DropAt } from '../ui/DragReorder'
import { hx } from '../ui/haptics'
import { PopMenu, type Rect } from '../ui/Menu'
import { Segmented } from '../ui/Segmented'
import { SheetHead } from '../ui/SheetHead'
import { closeOpenRow, SwipeRow } from '../ui/SwipeRow'
import { Confetti } from './Bits'
import {
  addGoal, carryOverGoal, createGoal, dismissDraft, removeGoal, renameGoal, reorderGoal, setGoalLink, setGoalProgress, setGoalTarget, useLinkTargets, useWeekGoals
} from './data'
import { checkTarget, dotTarget, goalBadge, weekRange, type GoalRow } from './logic'

type Snack = { id: number; text: string; undo?: () => Promise<void>; error?: boolean }

export function GoalsSheet({ p, visible, onClose, today, week, drafts, draftUsed, reduced, focusAdd }: {
  p: Palette; visible: boolean; onClose: () => void; today: string; week: string; drafts: GoalDraft[]; draftUsed?: boolean; reduced: boolean
  /** 고정 칸이 `+ 목표 만들기`였으면 열자마자 입력 커서 */
  focusAdd?: boolean
}) {
  const ins = useSafeAreaInsets()
  const buddy = useBuddy()
  const [tab, setTab] = useState<'this' | 'next'>('this')
  const shownWeek = tab === 'this' ? week : addDays(week, 7)
  const { goals, xpIds } = useWeekGoals(shownWeek)
  const links = useLinkTargets()
  const full = goals.length >= XP.goalsPerWeek
  const shownDrafts = tab === 'this' && !full ? drafts : []
  const [picking, setPicking] = useState<string | null>(null) // 세는 방법 고르는 목표 id
  const [editing, setEditing] = useState<string | null>(null)
  const [cheer, setCheer] = useState<string>()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<string>() // 고쳐 받는 AI 초안 제목
  const [addErr, setAddErr] = useState<string>()
  const [snack, setSnack] = useState<Snack | null>(null)
  const snackTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const input = useRef<TextInput>(null)
  const seq = useRef(0)

  const say = useCallback((t: string, o: { undo?: () => Promise<void>; error?: boolean } = {}) => {
    clearTimeout(snackTimer.current)
    const id = ++seq.current
    setSnack({ id, text: t, ...o })
    snackTimer.current = setTimeout(() => setSnack((s) => (s?.id === id ? null : s)), o.undo ? 5000 : 2200)
  }, [])
  useEffect(() => () => clearTimeout(snackTimer.current), [])
  // 닫으면 처음 모양으로
  useEffect(() => {
    if (visible) { if (focusAdd) { const t = setTimeout(() => input.current?.focus(), 380); return () => clearTimeout(t) } return }
    setTab('this'); setPicking(null); setEditing(null); setText(''); setPending(undefined); setAddErr(undefined); setSnack(null)
  }, [visible, focusAdd])
  const fail = (e: unknown) => { console.warn('[growth] 목표', e); say('저장하지 못했어요', { error: true }) }

  // ── 진행 · 체크 ──
  const progressTo = async (g: GoalRow, n: number) => {
    if (isLinked(g)) { say('할 일을 끝내면 저절로 세요'); return }
    const reaching = g.status !== 'achieved' && n >= g.target
    try { await setGoalProgress(today, g, n) } catch (e) { fail(e); return }
    if (reaching) { setCheer(g.id); setTimeout(() => setCheer((c) => (c === g.id ? undefined : c)), 1300) }
  }
  const target = async (g: GoalRow, n: number) => {
    const t = Math.max(1, Math.min(GOAL_TARGET_MAX, n))
    if (t === g.target) return
    hx.tick()
    const was = g.status === 'achieved'
    try { await setGoalTarget(today, g, t) } catch (e) { fail(e); return }
    // 목표 수를 내려 진행이 닿으면 그 순간 달성(XP 3개를 넘었어도 축하는 한다)
    if (!was && g.progress >= t) { setCheer(g.id); setTimeout(() => setCheer((c) => (c === g.id ? undefined : c)), 1300) }
  }

  // ── 만들기 ──
  const submit = async (raw = text, extra: Partial<NewGoal> = {}) => {
    const v = raw.trim()
    if (!v) return
    const parsed = parseGoal(v)
    const r = await createGoal(today, shownWeek, { ...parsed, source: pending ? 'ai' : 'manual', ...extra }).catch((e) => { fail(e); return 'error' as const })
    if (r === 'error') return
    if (r === 'ok') {
      hx.tap()
      setText(''); setAddErr(undefined)
      if (pending) { void dismissDraft(today, addDays(week, -7), pending); setPending(undefined) }
      return
    }
    setAddErr(r === 'full' ? `${tab === 'this' ? '이번' : '다음'} 주는 ${XP.goalsPerWeek}개까지 적을 수 있어요` : GOAL_TITLE_ERROR[r])
  }
  const template = async (t: NewGoal) => {
    const r = await createGoal(today, shownWeek, t).catch((e) => { fail(e); return 'error' as const })
    if (r === 'ok') hx.tap()
    else if (r !== 'error') say(r === 'full' ? `${XP.goalsPerWeek}개까지 적을 수 있어요` : GOAL_TITLE_ERROR[r], { error: true })
  }
  const accept = async (d: GoalDraft) => {
    const r = await addGoal(today, week, d.title, d.target, 'ai').catch((e) => { fail(e); return 'error' as const })
    if (r === 'full') say(`이번 주는 ${XP.goalsPerWeek}개까지 적을 수 있어요`, { error: true })
  }

  // ── 지우기 · 넘기기 ──
  const remove = async (g: GoalRow) => {
    closeOpenRow()
    try {
      const undo = await removeGoal(today, g.id)
      setAddErr(undefined)
      say('목표를 지웠어요', { undo: async () => { try { await undo() } catch (e) { fail(e) } } })
    } catch (e) { fail(e) }
  }
  const goalsRef = useRef(goals)
  goalsRef.current = goals
  const [menu, setMenu] = useState<{ goal: GoalRow; rect: Rect } | null>(null)
  const anchors = useRef(new Map<string, View | null>())
  const openMenu = useCallback((id: string) => {
    const g = goalsRef.current.find((x) => x.id === id)
    const v = anchors.current.get(id)
    if (!g || !v) return
    v.measureInWindow((x, y, width, height) => setMenu({ goal: g, rect: { x, y, width, height } }))
  }, [])

  // ── 순서(길게 눌러 끌기) ──
  const onDrop = useCallback((d: DropAt) => {
    const ids = goalsRef.current.map((g) => g.id)
    const without = ids.filter((x) => x !== d.id)
    const before = d.before ?? (d.after ? (without[without.indexOf(d.after) + 1] ?? null) : null)
    void reorderGoal(today, ids, d.id, before).catch(fail)
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useDragReorder({ canCross: () => false, onDrop, onMenu: openMenu })
  const ghostOf = useCallback((id: string) => {
    const g = goalsRef.current.find((x) => x.id === id)
    return g ? <View style={[s.row, { backgroundColor: p.cardBg }]}><Checkbox priority={0} done={g.status === 'achieved'} /><Text style={[s.title, { color: p.textPrimary, flex: 1 }]} numberOfLines={1}>{g.title}</Text></View> : null
  }, [p])

  const done = goals.filter((g) => g.status === 'achieved').length
  const pickGoal = picking ? goals.find((g) => g.id === picking) : undefined

  const head = <SheetHead compact title={pickGoal ? '세는 방법' : '이번 주'} onClose={onClose} />
  const footer = pickGoal ? null : (
    <View style={{ paddingHorizontal: 12 }}>
      {snack ? (
        <View style={[s.snack, { backgroundColor: p.toastBg }]} accessibilityLiveRegion="polite">
          <Text style={[s.snackT, snack.error && { color: '#ffb4b4' }]} numberOfLines={2}>{snack.text}</Text>
          {snack.undo ? (
            <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="되돌리기" onPress={() => { const u = snack.undo; setSnack(null); void u?.() }}>
              <Text style={[s.snackBtn, { color: p.toastAction }]}>되돌리기</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {addErr ? <Text style={[s.err, { color: p.danger }]}>{addErr}</Text> : null}
      {full ? (
        <View style={[s.add, { backgroundColor: p.bgInput }]}><Text style={[s.addFull, { color: p.textTertiary }]}>{tab === 'this' ? '이번' : '다음'} 주는 {XP.goalsPerWeek}개까지 적을 수 있어요</Text></View>
      ) : (
        <View style={[s.add, { backgroundColor: p.bgInput }]}>
          <Plus size={18} color={p.textTertiary} />
          <TextInput ref={input} value={text} maxLength={GOAL_TITLE_MAX} returnKeyType="done" blurOnSubmit={false}
            placeholder={`${tab === 'this' ? '이번' : '다음'} 주에 하고 싶은 일 추가`} placeholderTextColor={p.textTertiary}
            style={[s.addInput, { color: p.textPrimary }]} accessibilityLabel="목표 추가"
            onChangeText={(v) => { setText(v); setAddErr(undefined); if (!v) setPending(undefined) }}
            onSubmitEditing={() => void submit()} />
          <Pressable disabled={!text.trim()} onPress={() => void submit()} hitSlop={6} accessibilityRole="button" accessibilityLabel="추가"
            style={({ pressed }) => [s.addBtn, { backgroundColor: text.trim() ? p.accent : p.bgSelected }, pressed && { opacity: 0.8 }]}>
            <Text style={[s.addBtnT, { color: text.trim() ? '#fff' : p.textTertiary }]}>추가</Text>
          </Pressable>
        </View>
      )}
    </View>
  )

  return (
    <BottomSheet visible={visible} onClose={onClose} mid={0.66} label="이번 주 목표" head={head} footer={footer}
      overlay={<DragGhost state={drag.state} id={drag.ghost} render={ghostOf} />}>
      {pickGoal ? (
        <LinkPicker p={p} goal={pickGoal} links={links} onBack={() => setPicking(null)}
          onPick={async (kind, id) => { setPicking(null); try { await setGoalLink(today, pickGoal, { kind, id }) } catch (e) { fail(e) } }} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={!drag.dragging} onScrollBeginDrag={closeOpenRow}
          contentContainerStyle={{ paddingBottom: ins.bottom + 16 }}>
          <View style={s.tabs}>
            <Segmented small style={{ width: 168 }} items={[{ key: 'this', label: '이번 주' }, { key: 'next', label: '다음 주' }]} value={tab} onChange={(v) => { setTab(v); setEditing(null); setAddErr(undefined) }} />
            <Text style={[s.range, { color: p.textTertiary }]}>{weekRange(shownWeek)}{goals.length ? ` · ${done}/${goals.length}` : ''}</Text>
          </View>
          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            {goals.map((g, i) => (
              <DragRow key={g.id} id={g.id} group="goals" drag={drag.api} enabled={editing !== g.id}>
                <SwipeRow enabled={editing !== g.id} right={[{ key: 'del', color: p.swipeDel, icon: <Trash2 size={20} color="#fff" />, label: '삭제', leaves: true, onPress: () => void remove(g) }]}>
                  <View style={[{ backgroundColor: p.cardBg }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
                    <GoalLine p={p} g={g} xpIds={xpIds} names={links.names} editing={editing === g.id} cheer={cheer === g.id && !reduced}
                      onEdit={() => { closeOpenRow(); setEditing(g.id) }}
                      onRename={async (v) => {
                        setEditing(null)
                        if (v.trim() === g.title) return
                        const r = await renameGoal(today, g, v).catch((e) => { fail(e); return 'ok' as const })
                        if (r !== 'ok' && r !== 'empty') say(GOAL_TITLE_ERROR[r], { error: true })
                      }}
                      onProgress={(n) => void progressTo(g, n)} onTarget={(n) => void target(g, n)}
                      moreRef={(v) => { anchors.current.set(g.id, v) }} onMore={() => openMenu(g.id)} />
                  </View>
                </SwipeRow>
              </DragRow>
            ))}
            {shownDrafts.map((d) => (
              <View key={d.title} style={[s.aiRow, { borderTopColor: p.borderRow }, goals.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Pressable style={s.aiMain} onPress={() => { setText(d.title); setPending(d.title); setAddErr(undefined); input.current?.focus() }}
                  accessibilityRole="button" accessibilityLabel={`AI 제안 고쳐서 받기: ${d.title}`}>
                  <Sparkles size={16} color={p.accent} />
                  <Text style={[s.aiText, { color: p.textSecondary }]} numberOfLines={1}>{d.title}</Text>
                </Pressable>
                <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={`${d.title} 목표로 추가`} onPress={() => void accept(d)}><Plus size={20} color={p.accent} /></Pressable>
                <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={`${d.title} 제안 숨기기`} onPress={() => void dismissDraft(today, addDays(week, -7), d.title)}><X size={18} color={p.textTertiary} /></Pressable>
              </View>
            ))}
            {tab === 'this' && draftUsed && !shownDrafts.length && !full && !goals.length ? (
              <View style={s.limit}>
                <View style={s.limitRow}>
                  <StaticFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.quest} mood="sleepy" />
                  <Text style={[s.limitLine, { color: p.textSecondary }]}>{QUEST_LIMIT_LINE}</Text>
                </View>
                <Text style={[s.limitNote, { color: p.textTertiary }]}>{QUEST_LIMIT_NOTE}</Text>
              </View>
            ) : null}
            {!goals.length ? (
              <View style={s.empty}>
                <Text style={[s.emptyTitle, { color: p.textSecondary }]}>{tab === 'this' ? '이번' : '다음'} 주 목표가 아직 없어요</Text>
                <Text style={[s.emptySub, { color: p.textTertiary }]}>날짜 없이 이 주 안에 이루고 싶은 일을 적어요</Text>
                <View style={s.chips}>
                  {GOAL_TEMPLATES.map((t) => (
                    <Pressable key={t.title} onPress={() => void template(t)} accessibilityRole="button" accessibilityLabel={`${t.title} 목표 만들기`}
                      style={({ pressed }) => [s.chip, { backgroundColor: p.accentSubtle }, pressed && { opacity: 0.7 }]}>
                      <Plus size={13} color={p.accent} /><Text style={[s.chipT, { color: p.accent }]}>{t.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {goals.length >= 2 ? (
              <View style={s.bonus}>
                <Text style={[s.bonusText, { color: p.textTertiary }]}>{done === goals.length ? `모두 이뤘어요 · 보너스 +${XP.kpiAll}` : `2개 이상 모두 이루면 +${XP.kpiAll}`}</Text>
                <View style={[s.bonusBar, { backgroundColor: p.bgSelected }]}><View style={{ height: 4, borderRadius: 2, backgroundColor: p.accent, width: `${(done / goals.length) * 100}%` }} /></View>
              </View>
            ) : null}
          </View>
          {goals.length ? <Text style={[s.hint, { color: p.textTertiary }]}>제목을 누르면 이름을 바꿔요 · 길게 눌러 끌면 순서 · 왼쪽으로 밀면 삭제</Text> : null}
        </ScrollView>
      )}
      <PopMenu anchor={menu?.rect ?? null} onClose={() => setMenu(null)} width={220} items={menu ? [
        { key: 'link', label: '세는 방법…', onPress: () => { const id = menu.goal.id; setTimeout(() => setPicking(id), 200) } },
        { key: 'rename', label: '이름 바꾸기', onPress: () => { const id = menu.goal.id; setTimeout(() => setEditing(id), 200) } },
        ...(tab === 'this' && menu.goal.status !== 'achieved' ? [{ key: 'carry', label: '다음 주로 넘기기', onPress: () => { void carryOverGoal(today, menu.goal).then(() => say('다음 주로 넘겼어요')).catch(fail) } }] : []),
        { key: 'del', label: '삭제', danger: true, onPress: () => void remove(menu.goal) }
      ] : []} />
    </BottomSheet>
  )
}

/** 목표 한 줄(두 줄 높이): 체크 · 제목(누르면 그 자리 입력) / 진행 + 목표 수 · 보상 · ⋯ */
function GoalLine({ p, g, xpIds, names, editing, cheer, onEdit, onRename, onProgress, onTarget, moreRef, onMore }: {
  p: Palette; g: GoalRow; xpIds: Set<string>; names: { tags: Map<string, string>; lists: Map<string, string> }; editing: boolean; cheer: boolean
  onEdit: () => void; onRename: (v: string) => void; onProgress: (n: number) => void; onTarget: (n: number) => void; moreRef: (v: View | null) => void; onMore: () => void
}) {
  const achieved = g.status === 'achieved'
  const badge = goalBadge(g, xpIds)
  const linked = isLinked(g)
  const [draft, setDraft] = useState(g.title)
  useEffect(() => { if (editing) setDraft(g.title) }, [editing, g.title])
  const saved = useRef(false)
  useEffect(() => { saved.current = false }, [editing])
  const save = () => { if (saved.current) return; saved.current = true; onRename(draft) }
  return (
    <View style={s.row}>
      <Checkbox priority={0} done={achieved} flash={cheer} label={achieved ? `${g.title} 달성 취소` : `${g.title} 달성`} onPress={() => onProgress(checkTarget(g))} />
      <View style={{ flex: 1, paddingVertical: 8, gap: 4 }}>
        {editing ? (
          <TextInput value={draft} onChangeText={setDraft} autoFocus maxLength={GOAL_TITLE_MAX} returnKeyType="done" selectTextOnFocus
            onSubmitEditing={save} onBlur={save} style={[s.title, s.titleInput, { color: p.textPrimary, borderColor: p.accent }]} accessibilityLabel="목표 이름" />
        ) : (
          <Pressable onPress={onEdit} hitSlop={{ top: 6, bottom: 4 }} accessibilityRole="button" accessibilityLabel={`${g.title}, 이름 바꾸기`}>
            <Text style={[s.title, { color: achieved ? p.textTertiary : p.textPrimary }]} numberOfLines={2}>{g.title}</Text>
          </Pressable>
        )}
        <View style={s.sub}>
          {linked ? (
            <View style={[s.tag, { backgroundColor: p.bgSelected }]}>
              {g.link_kind === 'tag' ? <Hash size={11} color={p.textSecondary} /> : g.link_kind === 'list' ? <FolderClosed size={11} color={p.textSecondary} /> : <ListTodo size={11} color={p.textSecondary} />}
              <Text style={[s.tagT, { color: p.textSecondary }]} numberOfLines={1}>{linkLabel(g, names).replace(/^#/, '')} · {g.progress}/{g.target}</Text>
            </View>
          ) : g.target > 1 && g.target <= 10 && !achieved ? (
            <View style={s.dots} accessibilityLabel={`${g.progress}/${g.target}`}>
              {Array.from({ length: g.target }, (_, k) => (
                <Pressable key={k} hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }} accessibilityRole="button" accessibilityLabel={`${k + 1}번`} onPress={() => onProgress(dotTarget(g.progress, k))}>
                  <View style={[s.dot, { borderColor: p.accent }, k < g.progress && { backgroundColor: p.accent }]} />
                </Pressable>
              ))}
            </View>
          ) : g.target > 10 && !achieved ? (
            <View style={s.count}>
              <Pressable hitSlop={8} accessibilityLabel="하나 빼기" onPress={() => onProgress(g.progress - 1)}><Text style={[s.countBtn, { color: p.accent }]}>−</Text></Pressable>
              <Text style={{ color: p.textSecondary, fontSize: 13 }}>{g.progress}/{g.target}</Text>
              <Pressable hitSlop={8} accessibilityLabel="하나 더하기" onPress={() => onProgress(g.progress + 1)}><Text style={[s.countBtn, { color: p.accent }]}>+</Text></Pressable>
            </View>
          ) : badge.note ? <Text style={[s.note, { color: p.textTertiary }]}>{badge.note}</Text> : null}
          <View style={{ flex: 1 }} />
          <Stepper p={p} value={g.target} onChange={onTarget} />
        </View>
      </View>
      {badge.reward ? <View style={[s.reward, { backgroundColor: p.accentSubtle }]}><Text style={[s.rewardT, { color: p.accent }]}>{badge.reward}</Text></View> : null}
      <View ref={moreRef} collapsable={false}>
        <Pressable onPress={onMore} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${g.title} 메뉴`} style={s.more}><MoreHorizontal size={18} color={p.textTertiary} /></Pressable>
      </View>
      {cheer ? <View style={s.cheer} pointerEvents="none"><Confetti count={14} spread={60} /></View> : null}
    </View>
  )
}

/** `목표 [−] 3번 [+]` — 1~99 */
function Stepper({ p, value, onChange }: { p: Palette; value: number; onChange: (n: number) => void }) {
  const minus = value <= 1
  const plus = value >= GOAL_TARGET_MAX
  return (
    <View style={s.step} accessibilityRole="adjustable" accessibilityLabel="목표 수" accessibilityValue={{ text: `${value}번` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
      <Text style={[s.stepLbl, { color: p.textTertiary }]}>목표</Text>
      <Pressable disabled={minus} hitSlop={8} onPress={() => onChange(value - 1)} style={[s.stepBtn, { backgroundColor: p.bgSelected }, minus && { opacity: 0.35 }]} accessibilityLabel="목표 수 줄이기">
        <Text style={[s.stepBtnT, { color: p.textPrimary }]}>−</Text>
      </Pressable>
      <Text style={[s.stepN, { color: p.textPrimary }]}>{value}번</Text>
      <Pressable disabled={plus} hitSlop={8} onPress={() => onChange(value + 1)} style={[s.stepBtn, { backgroundColor: p.bgSelected }, plus && { opacity: 0.35 }]} accessibilityLabel="목표 수 늘리기">
        <Text style={[s.stepBtnT, { color: p.textPrimary }]}>+</Text>
      </Pressable>
    </View>
  )
}

/** 세는 방법 고르기(팝업 안 화면, ← 뒤로): 직접 체크 · 끝낸 할 일 모두 · 태그 · 리스트 */
function LinkPicker({ p, goal, links, onBack, onPick }: {
  p: Palette; goal: GoalRow; links: ReturnType<typeof useLinkTargets>; onBack: () => void; onPick: (kind: GoalLinkKind, id?: string | null) => void
}) {
  const ins = useSafeAreaInsets()
  const cur = goal.link_kind ?? 'none'
  const Row = ({ kind, id, label, icon, sub }: { kind: GoalLinkKind; id?: string; label: string; icon: React.ReactNode; sub?: string }) => {
    const on = cur === kind && (kind === 'none' || kind === 'tasks' || goal.link_id === id)
    return (
      <Pressable onPress={() => onPick(kind, id ?? null)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={({ pressed }) => [s.pick, { borderTopColor: p.borderRow }, pressed && { backgroundColor: p.bgSelected }]}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={[s.pickT, { color: p.textPrimary }]} numberOfLines={1}>{label}</Text>
          {sub ? <Text style={[s.pickS, { color: p.textTertiary }]}>{sub}</Text> : null}
        </View>
        {on ? <Check size={18} color={p.accent} /> : null}
      </Pressable>
    )
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: ins.bottom + 24 }}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button" accessibilityLabel="뒤로">
        <ChevronLeft size={18} color={p.accent} /><Text style={[s.backT, { color: p.accent }]} numberOfLines={1}>{goal.title}</Text>
      </Pressable>
      <View style={[s.card, { backgroundColor: p.cardBg }]}>
        <Row kind="none" label="직접 체크" sub="체크·점을 눌러 세요" icon={<Hand size={17} color={p.textSecondary} />} />
        <Row kind="tasks" label="끝낸 할 일 모두" sub="이번 주에 끝낸 할 일마다 1" icon={<ListTodo size={17} color={p.textSecondary} />} />
      </View>
      {links.tags.length ? <Text style={[s.group, { color: p.textSecondary }]}>태그</Text> : null}
      {links.tags.length ? (
        <View style={[s.card, { backgroundColor: p.cardBg, marginTop: 0 }]}>
          {links.tags.map((t) => <Row key={t.id} kind="tag" id={t.id} label={t.name} icon={<Hash size={17} color={p.textSecondary} />} />)}
        </View>
      ) : null}
      {links.lists.length ? <Text style={[s.group, { color: p.textSecondary }]}>리스트</Text> : null}
      {links.lists.length ? (
        <View style={[s.card, { backgroundColor: p.cardBg, marginTop: 0 }]}>
          {links.lists.map((l) => <Row key={l.id} kind="list" id={l.id} label={links.names.lists.get(l.id) ?? l.name} icon={<FolderClosed size={17} color={p.textSecondary} />} />)}
        </View>
      ) : null}
      <Text style={[s.hint, { color: p.textTertiary }]}>연결하면 그 주에 끝낸 할 일 수로 저절로 세요. 목표 수에 닿으면 +{XP.kpi} XP</Text>
    </ScrollView>
  )
}


const s = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 4 },
  range: { flex: 1, fontSize: 12, textAlign: 'right' },
  card: { marginHorizontal: 12, marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  title: { fontSize: 16, lineHeight: 22 },
  titleInput: { paddingVertical: 2, paddingHorizontal: 6, marginHorizontal: -6, borderWidth: 1.5, borderRadius: 8 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  note: { fontSize: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 150 },
  tagT: { fontSize: 12, fontWeight: '500' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countBtn: { fontSize: 20, fontWeight: '600', paddingHorizontal: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepLbl: { fontSize: 11.5 },
  stepBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepBtnT: { fontSize: 16, lineHeight: 18, fontWeight: '600' },
  stepN: { fontSize: 13, fontWeight: '600', minWidth: 30, textAlign: 'center', fontVariant: ['tabular-nums'] },
  reward: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  rewardT: { fontSize: 12, fontWeight: '600' },
  more: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  cheer: { position: 'absolute', left: 14, top: 0, bottom: 0, width: 20 },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  aiMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiText: { flex: 1, fontSize: 15 },
  limit: { paddingHorizontal: 14, paddingTop: 10, gap: 2 },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  limitLine: { flex: 1, fontSize: 13.5, lineHeight: 18 },
  limitNote: { fontSize: 12, lineHeight: 16, marginLeft: 26 },
  empty: { padding: 14, gap: 3 },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptySub: { fontSize: 12.5, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  chipT: { fontSize: 13.5, fontWeight: '600' },
  bonus: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8 },
  bonusText: { fontSize: 12 },
  bonusBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  hint: { fontSize: 12, lineHeight: 16, paddingHorizontal: 18, paddingTop: 10 },
  snack: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 14, paddingRight: 6, minHeight: 44, marginBottom: 8 },
  snackT: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500', paddingVertical: 10 },
  snackBtn: { fontSize: 14, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 10 },
  err: { fontSize: 12.5, paddingHorizontal: 6, paddingBottom: 6 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 12, paddingRight: 6, minHeight: 46 },
  addInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  addFull: { flex: 1, fontSize: 14, paddingVertical: 13, paddingHorizontal: 2 },
  addBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnT: { fontSize: 14, fontWeight: '700' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 6 },
  backT: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  group: { fontSize: 12.5, fontWeight: '700', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
  pick: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth },
  pickT: { fontSize: 15.5 },
  pickS: { fontSize: 12, marginTop: 1 }
})
