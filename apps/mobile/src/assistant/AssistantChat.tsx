// 27 D1·D2 대화 본문 — 전체 화면(app/assistant)과 반 시트(AssistantSheet)가 같이 쓴다.
// 40 §3: AI 쪽 얼굴 = 내 캐릭터 30(✦ 원 자리). 한 줄은 앱이 고르고(@sprout/schema/companion), 카드·오류 상자·버튼은 13 해요체 그대로.
// 움직이는 캐릭터는 마지막 답(또는 받는 중·오류 줄) 하나뿐, 지난 답은 그 답의 얼굴로 멈춘 그림.
// 내 말 = 오른쪽 회색 면 · AI = 왼쪽 캐릭터 + 이름 + 본문 · 결과 카드(할 일 행: 체크 = 완료(XP) · 누름 = 상세) · 집계 카드 · ↶ 되돌리기
// · 받는 중(글자 + 깜빡이는 커서, 단계 줄 `● 연결 › ● 해석 › ● 확인 · N초`, 대기열이면 `순서를 기다리는 중…`) · 오류 상자(13 §6 문구)
// · ↓ 최신으로 · 입력창(1줄 44 → 최대 6줄, Return = 보내기, 처리 중 = ■ 정지)
import { personaIdOf } from '@sprout/schema/persona'
import { useLiveQuery } from '../data/rows'
import { useRouter } from 'expo-router'
import { ArrowDown, ArrowUp, BarChart3, CalendarDays, Check, History, List, RefreshCw, RotateCcw, Square, TriangleAlert } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native'
import Animated, { cancelAnimation, Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { XP } from '@sprout/schema/growth'
import { daysBetween, dayWord, ymdOf, type RecallHit, type RecallResult } from '@sprout/schema/recall'
import { openInCalendarApp } from '../calendars/device'
import { answerFace, answerKindOf, COMPANION_SIZE, companionLabel, companionName, EGG_TAP_LINE, errorFace, pickLine, quickReplies, tapSpeaks, TAP_LINES, WAITING_FACE, type CompanionFace as Face, type CompanionMove } from '@sprout/schema/companion'
import { completeTasks } from '../data/tasks'
import { useBuddy } from '../diary/data'
import { CompanionFace, SayBubble, StaticFace, XpPop } from '../ui/CompanionFace'
import { dayKey, rowDateLabel } from '../lib/dates'
import { FONT, shadow } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { Checkbox } from '../ui/Checkbox'
import { OFFLINE, type AssistantProgress, type AssistantResult } from './core'
import { cancel, cancelAgentCard, refresh, saveAgentCard, send, setAgentLine, setBuddyName, setDraft, toggleTarget, undo, undoAgentCard, type AssistantState, type Message } from './store'
import { AgentCards, Bands, editParams, LiveText, ToolChips } from './AgentParts'
import { SceneBackdrop } from '../growth/art/Scene3D'
import { Glass, myScene, sceneTone, type GlassTone } from '../growth/home/glass'
import { useCharacterWear } from '../growth/art/CharacterArt'
import { PlayableCharacter, type PlayHandle } from '../growth/art/PlayableCharacter'
import { useMotionReduced } from '../growth/motion'
import { FOOT, SCENE_EDGE, SCENE_TINT, sceneDark, sceneLayout } from '@sprout/schema/characterArt'
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg'
import { iGa } from '@sprout/schema/josa'
import { leftLine } from './core'
import { isConfirm, type ConfirmCard } from '@sprout/schema/assistantExec'

/** "2026-10-05 ~ 2026-10-11" → "10/5–10/11" */
const shortRange = (range: string) => range.split(' ~ ').map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join('–')
// 40 §3.3: 빈 대화 예시는 회색 테두리 알약(색·아이콘 없음). 글은 13 그대로(누르면 바로 보냄)
const SUGGESTIONS = ['내일 오후 3시에 기획 회의 한 시간 잡아줘', '이번 주 남은 할 일 보여줘', '이번 주에 완료한 거 몇 개야?']
// 47 §5.4 B안 빈 대화 예시(회색 테두리 알약 — 누르면 바로 보냄)
const AGENT_SUGGESTIONS = ['미용실 간 지 얼마나 지났지', '이번 주 뭐가 제일 급해?', '내일 3시에 교수님 면담 잡아줘']
const STEPS: { key: AssistantProgress['phase'][]; label: string }[] = [{ key: ['connecting'], label: '연결' }, { key: ['generating'], label: '해석' }, { key: ['validating', 'saving', 'querying'], label: '확인' }]

/** 머리 상태 알약(13 §2.1): 연결됨(초록) · 대기 중 · 앞에 N명(주황) · 연결 중… · 지금은 쓸 수 없어요(회색). 누르면 다시 연결 */
export function StatusPill({ a }: { a: AssistantState }) {
  const p = usePalette()
  const waiting = a.busy && (a.progress.queue ?? 0) > 0
  const state = a.connecting || waiting ? 'wait' : a.models.length ? 'ok' : 'off'
  const color = state === 'ok' ? '#2fb36b' : state === 'wait' ? '#f29a2e' : p.textTertiary
  // 사용자 2026-10-11 "연결됨 이것도 UI에서 지워 줘": 잘 연결돼 있으면 알약을 그리지 않는다(연결 중·대기·못 씀일 때만)
  if (state === 'ok') return null
  const label = a.connecting ? '연결 중…' : waiting ? `대기 중 · 앞에 ${a.progress.queue}명` : '지금은 쓸 수 없어요'
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, 다시 연결`} disabled={a.connecting || a.busy} onPress={() => void refresh()} style={[s.pill, { backgroundColor: p.bgSelected }]}>
      <View style={[s.pillDot, { backgroundColor: color }]} />
      <Text style={[s.pillText, { color: state === 'off' ? p.textTertiary : p.textSecondary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

/** 빈 대화 장면(49 §8 표) — 감싸는 화면(전체 화면 머리 · 반 시트)도 같은 값으로 머리를 투명하게·글자색을 장면에 맞춘다 */
export function useChatScene(a: AssistantState) {
  const p = usePalette()
  const wear = useCharacterWear()
  const empty = !a.messages.length && !a.busy && !(a.error && !a.busy)
  const sceneKey = myScene(wear?.species ? wear.wear.eq?.bg : null, p.dark)
  return { empty, sceneKey, tone: sceneTone(sceneKey) }
}

/** bleed = 장면을 대화 칸 밖으로 넓힐 길이(전체 화면: 위 = 상태 막대 + 머리, 아래 = 홈 표시줄 여백) — 흰 띠 없이 화면 끝까지 */
export function AssistantChat({ a, variant, autoFocus, bleed, onHeader, contentTop = 0 }: { a: AssistantState; variant: 'full' | 'sheet'; autoFocus?: boolean; bleed?: { top?: number; bottom?: number }; onHeader?: (show: boolean) => void; contentTop?: number }) {
  const lastY = useRef(0)
  const dragging = useRef(false)
  const p = usePalette()
  const scroll = useRef<ScrollView>(null)
  const follow = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now())
  const buddy = useBuddy()
  const egg = !buddy.species
  const who = companionName(buddy.species, buddy.name)
  useEffect(() => { setBuddyName(buddy.species ? buddy.name : '', personaIdOf(buddy.species)) }, [buddy.species, buddy.name])
  const router = useRouter()
  const today = dayKey()
  // 결과 카드에서 완료할 때 오늘 할 일 XP가 상한 아래였을 때만 +1(10 §6 — 등록만으로는 XP 없음, 40 결정 ④)
  const todayTaskXp = useLiveQuery<{ xp: number }>("SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events WHERE day = ? AND kind IN ('task', 'task_revoke')", [today]).data[0]?.xp ?? 0
  // 빠른 답 칩(리스트를 물을 때): 최근 쓴 리스트 3개
  const recentLists = useLiveQuery<{ name: string }>("SELECT l.name AS name FROM tasks t JOIN lists l ON l.id = t.list_id WHERE t.deleted_at IS NULL AND l.archived_at IS NULL AND COALESCE(l.kind, '') <> 'inbox' GROUP BY l.id ORDER BY MAX(t.modified_at) DESC LIMIT 3").data.map((r) => r.name)
  useEffect(() => { if (!a.busy) return; const tick = () => setElapsed(Math.floor((Date.now() - a.started) / 1000)); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t) }, [a.busy, a.started])
  useEffect(() => { if (a.cooldownUntil <= Date.now()) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [a.cooldownUntil])
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(t) }, [notice])
  useEffect(() => { if (follow.current) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true })) }, [a.messages, a.busy, a.progress, a.error])
  const latest = () => { follow.current = true; setShowLatest(false); scroll.current?.scrollToEnd({ animated: true }) }
  // ↓ 최신으로는 맨 아래에서 70 넘게 떨어졌을 때만. 반 시트가 커지는 동안(높이만 바뀌고 스크롤 이벤트는 없음)에도 다시 잰다
  const box = useRef({ content: 0, view: 0, y: 0 })
  const measure = () => {
    const { content, view, y } = box.current
    follow.current = content - y - view < 70
    setShowLatest(!follow.current)
  }
  const submit = async (text = a.draft, prompt?: string) => {
    if (a.busy || !a.model || !text.trim()) return
    if (text === a.draft) setDraft('')
    Keyboard.dismiss() // 사용자 "한번 채팅하면 키보드를 내리는 게 기본" — 보내면 캐릭터·답이 보이게
    latest()
    await send(text, prompt)
  }
  // 마지막 답의 한 번 움직임: 새 답이 들어오면 그 얼굴의 움직임(깡충·갸웃), 누르기·완료면 깡충
  let lastAi = a.messages.length - 1
  while (lastAi >= 0 && a.messages[lastAi].role !== 'assistant') lastAi--
  const lastId = lastAi >= 0 ? a.messages[lastAi].id : ''
  const [play, setPlay] = useState<{ move: CompanionMove; n: number }>({ move: null, n: 0 })
  const [xp, setXp] = useState(0)
  const seen = useRef(lastId)
  const doUndo = async (m: Message) => {
    try { await undo(m.id); setNotice('등록을 되돌렸어요'); if (m.id === lastId) setPlay((o) => ({ move: 'tilt', n: o.n + 1 })) } catch (e) { setNotice(e instanceof Error ? e.message : '되돌리지 못했어요.') }
  }
  const faces = useMemo(() => a.messages.map((m, i): Face | null => {
    if (m.role !== 'assistant') return null
    if (m.agent) {
      if (m.agent.error && !m.text) return errorFace(m.agent.error, egg)
      const happy = m.agent.mood === 'happy'
      return { mood: happy ? 'happy' : 'smile', move: happy ? 'hop' : null, line: m.text || null }
    }
    const r = m.result
    const kind = answerKindOf(r)
    const prev = a.messages[i - 1]
    return answerFace({ kind, undone: m.undone, count: r?.total ?? r?.tasks?.length ?? 0, first: r?.tasks?.[0], status: r?.status, request: prev?.role === 'user' ? prev.sent ?? prev.text : '', text: r?.stats ? '' : m.text, egg })
  }), [a.messages, egg])
  const reduced = useMotionReduced()
  const [typing, setTyping] = useState('') // 새로 온 답만 글자가 써지듯(다시 열면 바로 다)
  const [speaking, setSpeaking] = useState(false)
  const [spoken, setSpoken] = useState('') // 다 말한 답 → 말풍선에서 위 대화 기록으로(사용자 "한번 대답하고 나면 바로 위쪽으로")
  useEffect(() => { if (spoken) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true })) }, [spoken])
  const [speakN, setSpeakN] = useState(0)
  useEffect(() => {
    if (!lastId || lastId === seen.current) return
    seen.current = lastId
    setTyping(lastId); setSpeaking(true); setSpeakN((n) => n + 1)
    const f = faces[lastAi]
    if (f?.move) setPlay((o) => ({ move: f.move, n: o.n + 1 }))
  }, [lastId, lastAi, faces])
  // 입력을 시작하면 갸웃(듣는 중)
  const drafting = !!a.draft.trim()
  useEffect(() => { if (drafting) setPlay((o) => ({ move: 'tilt', n: o.n + 1 })) }, [drafting])
  const phaseIndex = STEPS.findIndex((st) => st.key.includes(a.progress.phase))
  const bump = (i: number) => { if (i === lastAi) setPlay((o) => ({ move: 'hop', n: o.n + 1 })) }
  const actionsFor = (m: Message, i: number) => ({
    onComplete: () => { bump(i); if (todayTaskXp < XP.taskDailyCap && i === lastAi) setXp((n) => n + 1) },
    onSave: async (key: string) => {
      const card = m.agent?.cards.find((c): c is ConfirmCard => isConfirm(c) && c.key === key)
      const line = await saveAgentCard(m.id, key)
      if (!line) return
      setAgentLine(m.id, line)
      bump(i)
      if (card?.op === 'complete' && todayTaskXp < XP.taskDailyCap && i === lastAi) setXp((n) => n + 1)
    },
    onCancel: (key: string) => { cancelAgentCard(m.id, key); setAgentLine(m.id, '알겠어, 그대로 둘게.', 'smile') },
    onUndo: async (key: string) => { try { await undoAgentCard(m.id, key); setAgentLine(m.id, '알겠어, 되돌렸어.', 'smile'); setNotice('되돌렸어요') } catch (e) { setNotice(e instanceof Error ? e.message : '되돌리지 못했어요.') } },
    onToggle: (key: string, id: string) => toggleTarget(m.id, key, id),
    // 47 §19.2 빠른 입력을 카드 값(제목·날짜·리스트·반복·할 일/일정)으로
    onEdit: (c: ConfirmCard) => { cancelAgentCard(m.id, c.key); router.push({ pathname: '/quick-add', params: editParams(c) }) }
  })
  const left = leftLine(a.daily)
  const cooling = a.cooldownUntil > now
  const leftSec = Math.ceil((a.cooldownUntil - now) / 1000)
  const errShown = !!a.error && !a.busy
  const errFace = errShown ? errorFace(a.error, egg) : null
  // 마지막 답이 되묻기면 빠른 답 칩(40 §3.3) — 받는 중·오류·직접 쓰는 중이면 없음
  const last = lastAi >= 0 && lastAi === a.messages.length - 1 ? a.messages[lastAi] : null
  const chips = last && !a.busy && !errShown && !a.draft.trim() && faces[lastAi]?.mood === 'puzzled' && answerKindOf(last.result) === 'reply'
    ? quickReplies({ request: a.messages[lastAi - 1]?.text ?? '', question: last.text, lists: recentLists })
    : []
  const animatedRow = a.busy || errShown ? -1 : lastAi
  const faceOf = (f: Face | null, live: boolean, key?: string) => live
    ? <CompanionFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.chat} mood={f?.mood ?? 'smile'} dim={f?.dim} loop={f === WAITING_FACE ? 'think' : null} play={key === 'last' ? play : undefined}
      onPress={key === 'last' ? () => setPlay((o) => ({ move: 'hop', n: o.n + 1 })) : undefined} label={key === 'last' ? companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage) : undefined} />
    : <StaticFace species={buddy.species} stage={buddy.stage} size={COMPANION_SIZE.chat} mood={f?.mood ?? 'smile'} dim={f?.dim} />

  // 49 §8 표 · 시안 character-v3 wAsst: 빈 대화 = 장면 끝까지(고른 배경, 다크 = 밤 짝) + 받침 위 캐릭터 + 무엇을 도와줄까? + 유리 칩 + 입력칸.
  // 대화가 시작돼도 장면은 그대로(사용자 2026-10-11 "이 화면에서 그대로 채팅하면서") — 캐릭터 답은 반투명 카드 말풍선(긴 글 읽기)
  const { empty, sceneKey, tone } = useChatScene(a)
  const bt = bleed?.top ?? 0, bb = bleed?.bottom ?? 0
  const [area, setArea] = useState({ w: 0, h: 0 })
  const [barTop, setBarTop] = useState(0)
  // 49 v1.6: 대화 중에도 캐릭터가 받침 위에 남아 반응한다(사용자 "대화하면 캐릭터가 사라지잖아, 인터랙티브하게")
  // 대화 중(49 v1.6): 장면을 아래로 내려 받침 돌이 입력칸 바로 위에 오게 — 캐릭터는 그 돌 위, 대화는 그 위 공간(사용자 "여기(받침)에 캐릭터를 띄워서")
  // 키보드가 올라오면 대화 칸이 줄어든다 — 장면은 키보드 없을 때 높이로 고정(크기가 출렁이지 않게)하고 위치만 옮긴다, 캐릭터는 작게
  const [kb, setKb] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false))
    return () => { show.remove(); hide.remove() }
  }, [])
  const fullH = useRef(0)
  if (!kb && area.h > fullH.current) fullH.current = area.h
  const buddySize = kb ? 72 : variant === 'sheet' ? 96 : 132
  const sceneH = Math.max(area.h, fullH.current) + bt + bb
  const L0 = area.w ? sceneLayout(sceneKey, area.w, sceneH, 'bottom') : null
  const perchTarget = barTop - (variant === 'sheet' ? 6 : 10) // 대화 칸 좌표
  const sceneShift = !empty && L0 && barTop ? Math.max(area.h + bt + bb - sceneH, perchTarget - (L0.perchY - bt)) : 0 // 키보드면 위로도(음수)
  const buddyTop = perchTarget - buddySize * FOOT.y
  const headY = buddyTop + buddySize * 0.16 // 말풍선 꼬리가 닿는 머리 높이
  const [speechH, setSpeechH] = useState(0)
  // 말풍선이 커지면(글자가 써지는 동안) 기록도 같이 올려 방금 보낸 말이 가려지지 않게
  useEffect(() => { if (follow.current) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: false })) }, [speechH, a.busy])
  // 말풍선 = 지금 말하는 새 답(글자가 써지는 동안 + 0.8초)뿐. 다 말하면 위 대화 기록으로 올라간다. 다시 열면 지난 답은 처음부터 기록에
  const speechIdx = -1 // v1.8(사용자): 말풍선은 '생각 중'만 — 답은 오자마자 위 대화 기록으로 올라간다
  const buddyRoom = barTop ? Math.max(0, barTop - headY) + (a.busy || speechIdx >= 0 ? speechH : 0) + 16 : 0
  const shiftV = useSharedValue(0)
  useEffect(() => { shiftV.value = withTiming(sceneShift, { duration: 420 }) }, [sceneShift, shiftV])
  const shiftSt = useAnimatedStyle(() => ({ transform: [{ translateY: shiftV.value }] }))
  const tint = SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-day']
  const edge = SCENE_EDGE[sceneKey] ?? tint.top // 그림 맨 윗줄 실제 색
  // ── 49 v1.7 "이 친구와 실제로 대화하는 느낌"(사용자): 최신 답·진행 상황은 캐릭터 머리 위 큰 말풍선(글자가 써지듯), 지난 대화는 그 위로
  const aiBody = (m: Message, i: number, typed = false) => (
    <>
            {m.agent ? <ToolChips chips={m.agent.chips.map((chip) => ({ chip, state: chip.failed ? 'failed' as const : 'done' as const }))} /> : null}
            {faces[i]?.line ? (typed ? <TypeText key={m.id} text={faces[i]!.line!} play={typing === m.id} onDone={() => setSpeaking(false)} style={[s.text, { color: p.textPrimary }]} /> : <Text style={[s.text, { color: p.textPrimary }]} selectable>{faces[i]!.line}</Text>) : null}
            {m.agent ? <Bands bands={m.agent.bands} /> : null}
            {m.agent ? <AgentCards cards={m.agent.cards} actions={actionsFor(m, i)} /> : null}
            {m.agent?.hint ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{m.agent.hint}</Text> : null}
            {m.agent?.action ? <View style={{ flexDirection: 'row' }}><Btn label={m.agent.action === 'diary' ? '일기로 가기' : '설정 열기'} onPress={() => router.push(m.agent!.action === 'diary' ? '/diary' : '/settings/assistant')} /></View> : null}
            {m.result?.recall ? <RecallCard r={m.result.recall} /> : null}
            {m.result && !m.result.recall ? <ResultCard r={m.result} onComplete={() => { if (i === lastAi) setPlay((o) => ({ move: 'hop', n: o.n + 1 })); if (todayTaskXp < XP.taskDailyCap && i === lastAi) setXp((n) => n + 1) }} /> : null}
            {m.result?.created && !m.undone ? (
              <Pressable accessibilityRole="button" onPress={() => void doUndo(m)} style={s.undo} hitSlop={6}>
                <RotateCcw size={15} color={p.accent} /><Text style={[FONT.sub, { color: p.accentInk, fontWeight: '600' }]}>되돌리기</Text>
              </Pressable>
            ) : null}
            {i === lastAi && chips.length ? (
              <View style={s.chips}>
                {chips.map((c) => (
                  <Pressable key={c.label} accessibilityRole="button" disabled={!a.model} onPress={() => void submit(c.label, c.send)} style={({ pressed }) => [s.chip, { borderColor: p.borderDivider, backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
                    <Text style={[s.chipText, { color: c.ghost ? p.textSecondary : p.textPrimary }]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
    </>
  )
  // v1.8: 말풍선은 '생각 중' 한 줄만(진행 칩·미리 찾은 카드는 넣지 않는다 — 답이 기록으로 올라갈 때 같이 보인다)
  // 사용자 "말풍선을 더 줄여, 캐릭터 크기에 맞게": 점 세 개만(찾는 중·대기 중일 때만 짧은 글자)
  const thinkingLine = (a.progress.queue ?? 0) > 0 ? `앞에 ${a.progress.queue}명` : a.live?.chips.some((c) => c?.state === 'running') ? '찾는 중' : ''
  const liveBody = a.busy ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={thinkingLine || '생각 중'}>
      {thinkingLine ? <Text style={[s.thinkText, { color: tone.ink }]}>{thinkingLine}</Text> : null}
      <ThinkingDots color={tone.ink} />
    </View>
  ) : null
  const speechBody = a.busy ? liveBody : null
  const perchX = L0?.perchX ?? area.w / 2
  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setArea((o) => (o.w === width && o.h === height ? o : { w: width, h: height })) }}>
      {area.w ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: -bt, width: area.w, height: sceneH, backgroundColor: edge }} /> : null}
      {area.w ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: -bt, width: area.w, height: sceneH }, shiftSt]}>
          <SceneBackdrop sceneKey={sceneKey} width={area.w} height={sceneH} />
          {/* 그림 위 경계를 위 빈자리 색으로 부드럽게 섞기(띠 없이) */}
          {L0 ? (
            <Svg pointerEvents="none" width={area.w} height={90} style={{ position: 'absolute', left: 0, top: L0.y }}>
              <Defs><SvgGradient id="edge" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={edge} stopOpacity={1} /><Stop offset="1" stopColor={edge} stopOpacity={0} /></SvgGradient></Defs>
              <Rect x="0" y="0" width={area.w} height={90} fill="url(#edge)" />
            </Svg>
          ) : null}
        </Animated.View>
      ) : null}
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 + contentTop, paddingBottom: 16 + (!empty ? buddyRoom : 0), gap: 14 }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          box.current = { content: contentSize.height, view: layoutMeasurement.height, y: contentOffset.y }
          measure()
          // 사용자 "스크롤하면 앱바가 올라가야지": 손으로 끌어 내리면(내용이 위로) 머리가 위로 사라지고, 끌어 올리거나 맨 위면 돌아온다.
          // 새 답이 와서 저절로 내려가는 스크롤은 무시(손으로 끌 때만)
          const dy = contentOffset.y - lastY.current
          lastY.current = contentOffset.y
          if (contentOffset.y < 8) onHeader?.(true)
          else if (dragging.current && dy > 6) onHeader?.(false)
          else if (dragging.current && dy < -6) onHeader?.(true)
        }}
        onLayout={(e) => {
          const wasFollowing = follow.current
          box.current.view = e.nativeEvent.layout.height
          if (wasFollowing) { scroll.current?.scrollToEnd({ animated: false }); follow.current = true; setShowLatest(false) } else measure()
        }}
        onContentSizeChange={(_, h) => { box.current.content = h; if (follow.current) scroll.current?.scrollToEnd({ animated: false }); else measure() }}
        onScrollBeginDrag={() => { dragging.current = true }}
        onMomentumScrollEnd={() => { dragging.current = false }}
        onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity?.y) dragging.current = false }}
        scrollEventThrottle={16}
        accessibilityLabel="AI 대화 기록"
      >

        {a.messages.map((m, i) => m.role === 'user' ? (
          <Animated.View key={m.id} entering={reduced ? undefined : FadeIn.duration(180)} style={[s.me, { backgroundColor: p.accent }]}><Text style={[s.text, { color: p.onAccent }]}>{m.text}</Text></Animated.View>
        ) : i === speechIdx ? null : (
          <Animated.View key={m.id} entering={reduced ? undefined : typing === m.id ? riseIn : FadeIn.duration(180)}><Ai name={who} face={faceOf(faces[i], false)} xp={0}>{aiBody(m, i, typing === m.id)}</Ai></Animated.View>
        ))}
        {errShown && errFace ? (
          <Ai name={who} face={faceOf(errFace, true)}>
            {errFace.line ? <Text style={[s.text, { color: p.textPrimary }]}>{errFace.line}</Text> : null}
            <View style={[s.err, { backgroundColor: p.dark ? '#2a2a2c' : '#f2f2f5' }]} accessibilityRole="alert">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TriangleAlert size={16} color={p.textSecondary} style={{ marginTop: 2 }} />
                <Text style={[FONT.sub, { color: p.textPrimary, flex: 1 }]}>{a.error}</Text>
              </View>
              {a.error === OFFLINE && !a.models.length ? <Text style={[FONT.meta, { color: p.textTertiary }]}>1분 뒤 저절로 다시 확인해요</Text> : null}
              <View style={s.errActs}>
                {a.lastRequest ? <Btn label={cooling ? `다시 시도 · ${leftSec}초` : '다시 시도'} icon={<RefreshCw size={14} color={p.textPrimary} />} disabled={a.busy || cooling || !a.model} onPress={() => void submit(a.lastRequest, a.lastPrompt)} /> : null}
                {a.lastRequest ? <Btn label="입력으로 가져오기" onPress={() => setDraft(a.lastPrompt || a.lastRequest)} /> : null}
                {!a.models.length ? <Btn label="다시 연결" disabled={a.connecting} onPress={() => void refresh()} /> : null}
              </View>
            </View>
          </Ai>
        ) : null}
      </ScrollView>
      {showLatest ? (
        <Pressable accessibilityRole="button" onPress={latest} style={[s.latest, { bottom: Math.max(12, area.h - barTop + 10), backgroundColor: p.bgPopover, borderColor: p.borderDivider }]}>
          <ArrowDown size={14} color={p.textPrimary} /><Text style={[FONT.meta, { color: p.textPrimary, fontWeight: '600' }]}>최신으로</Text>
        </Pressable>
      ) : null}
      {notice ? <Text style={[s.notice, { backgroundColor: p.toastBg }]}>{notice}</Text> : null}
      {!empty && speechBody && area.w && barTop ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: perchX - 80, width: 160, bottom: area.h - headY, alignItems: 'center' }}>
          {/* 사용자 "말풍선은 없애고 …만 움직이게": 배경·꼬리 없이 머리 위 점 세 개만(장면 글자색 + 옅은 그림자) */}
          <Animated.View entering={FadeIn.duration(150)} style={s.think} accessibilityLiveRegion="polite">
            {speechBody}
          </Animated.View>
        </View>
      ) : null}
      {!empty && area.w && barTop ? (
        <ChatBuddy a={a} size={buddySize} left={(L0?.perchX ?? area.w / 2) - buddySize * FOOT.x} top={buddyTop}
          face={errFace ?? (lastAi >= 0 ? faces[lastAi] : null)} hopN={typing ? speakN : 0} listening={drafting} speaking={speaking} />
      ) : null}
      {empty && area.w && barTop ? <EmptyChat a={a} variant={variant} sceneKey={sceneKey} tone={tone} area={area} bleed={{ top: bt, bottom: bb }} barTop={barTop} onPick={(t) => void submit(t)} contentTop={contentTop} /> : null}
      <View onLayout={(e) => setBarTop(e.nativeEvent.layout.y)} pointerEvents="box-none">
      <Composer a={a} autoFocus={autoFocus} onSubmit={() => void submit()} />
      {a.agent ? <Text style={[s.foot, { color: tone.sub }]}>{[variant === 'full' ? '꿈틀 AI는 꿈틀 서버에서만 돌아가요 · 인터넷은 볼 수 없어요 · 저장 전엔 늘 물어봐요' : '꿈틀 서버에서 돌아가요 · 인터넷은 못 봐요', left].filter(Boolean).join(' · ')}</Text>
        : variant === 'full' ? <Text style={[s.foot, { color: tone.sub }]}>결과는 카드에서 되돌릴 수 있어요</Text> : null}
      </View>
    </View>
  )
}

/** 빈 대화(49 §8 표 · 시안 wAsst): 위 `무엇을 도와줄까?` + 한 줄, 받침 위 캐릭터(전체 180 · 반 시트 120 — 칩과 겹치면 줄임),
 *  입력칸 바로 위 유리 추천 칩 3개(세로). 캐릭터를 누르면 깡충 + 말풍선(40 §3.1 그대로) */
function EmptyChat({ a, variant, sceneKey, tone, area, bleed, barTop, onPick, contentTop = 0 }: { a: AssistantState; variant: 'full' | 'sheet'; sceneKey: string; tone: GlassTone; area: { w: number; h: number }; bleed: { top: number; bottom: number }; barTop: number; onPick: (text: string) => void; contentTop?: number }) {
  const buddy = useBuddy()
  const [play, setPlay] = useState<{ move: CompanionMove; n: number }>({ move: null, n: 0 })
  const [say, setSay] = useState({ text: '', n: 0 })
  const [chipsH, setChipsH] = useState(0)
  const prev = useRef(-1)
  const taps = useRef<number[]>([])
  const tap = () => {
    setPlay((o) => ({ move: 'hop', n: o.n + 1 }))
    if (!tapSpeaks(taps.current, Date.now())) return
    if (!buddy.species) { setSay((o) => ({ text: EGG_TAP_LINE, n: o.n + 1 })); return }
    const i = pickLine(TAP_LINES, prev.current)
    prev.current = i
    setSay((o) => ({ text: TAP_LINES[i], n: o.n + 1 }))
  }
  const sheet = variant === 'sheet'
  const name = companionName(buddy.species, buddy.name)
  const sugs = (a.agent ? AGENT_SUGGESTIONS : SUGGESTIONS).slice(0, variant === 'sheet' ? 2 : 3) // 반 시트는 낮아서 2개(캐릭터 자리)
  const titleBottom = (sheet ? 64 : 96) + contentTop
  const chipsTop = barTop - 10 - (chipsH || sugs.length * 52)
  // 받침 자리(장면 지도) — 칩 위로 올라오게 막고, 위 글과 겹치면 줄인다
  const L = sceneLayout(sceneKey, area.w, area.h + bleed.top + bleed.bottom, 'bottom') // 넓힌 장면 기준 → 대화 칸 좌표로
  const feet = Math.min(L.perchY - bleed.top, chipsTop - 4)
  const size = Math.max(72, Math.min(sheet ? 120 : 180, (feet - titleBottom) / FOOT.y))
  const left = L.perchX - size * FOOT.x, top = feet - size * FOOT.y
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={{ paddingTop: (sheet ? 10 : 28) + contentTop, paddingHorizontal: 20, alignItems: 'center' }} pointerEvents="none">
        <Text style={[s.heroT, sheet && s.heroTs, { color: tone.ink }]} accessibilityRole="header">무엇을 도와줄까?</Text>
        <Text style={[s.heroS, { color: tone.sub }]}>{`${iGa(name)} 오늘 할 일을 같이 봐 줄게`}</Text>
      </View>
      <View style={{ position: 'absolute', left, top, width: size, height: size }}>
        <SayBubble text={say.text} n={say.n} style={{ bottom: size * 0.86 }} />
        <CompanionFace species={buddy.species} stage={buddy.stage} size={size} mood="smile" loop="breathe" play={play} onPress={tap} label={companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage)} />
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, top: chipsTop, gap: 8 }} onLayout={(e) => setChipsH(e.nativeEvent.layout.height)}>
        {sugs.map((text) => (
          <Pressable key={text} accessibilityRole="button" disabled={a.busy || !a.model} onPress={() => onPick(text)} style={({ pressed }) => [(!a.model || a.busy) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}>
            <Glass dark={sceneDark(sceneKey)} radius={18} style={s.heroChip}>
              <Text style={[s.heroChipT, { color: tone.ink }]} numberOfLines={1}>{text}</Text>
            </Glass>
          </Pressable>
        ))}
      </View>
    </View>
  )
}


/** 대화 중 캐릭터(49 v1.6): 받침 위(입력칸 바로 위)에 서서 — 기다리는 동안 생각 얼굴 + 진행 말풍선(계속 보임),
 *  답이 오면 깡충 + 답 첫 문장을 말풍선으로, 누르면 깡충 + 한 줄. 큰 추천 칩·제목은 빈 대화에만 */
function ChatBuddy({ a, size, left, top, face, hopN, listening, speaking }: {
  a: AssistantState; size: number; left: number; top: number
  face: Face | null; hopN: number; listening: boolean; speaking: boolean
}) {
  const buddy = useBuddy()
  const wear = useCharacterWear()
  const pc = useRef<PlayHandle>(null)
  const reduced = useMotionReduced()
  // 몸짓(49 v1.7 · 사용자 "애니메이션을 자연스럽게"): 듣기 = 입력칸 쪽으로 기울며 조금 커짐, 생각 = 좌우로 천천히 흔들, 말하기 = 리듬 있게 들썩
  const rot = useSharedValue(0), sc = useSharedValue(1), sy = useSharedValue(1)
  const ease = Easing.inOut(Easing.sin)
  const state = a.busy ? 'think' : speaking ? 'talk' : listening ? 'listen' : 'idle'
  useEffect(() => {
    cancelAnimation(rot); cancelAnimation(sc); cancelAnimation(sy)
    if (reduced) { rot.value = 0; sc.value = 1; sy.value = 1; return }
    if (state === 'think') {
      sc.value = withTiming(1, { duration: 250 }); sy.value = withTiming(1, { duration: 200 })
      rot.value = withSequence(withTiming(-4, { duration: 400, easing: ease }), withRepeat(withSequence(withTiming(4, { duration: 900, easing: ease }), withTiming(-4, { duration: 900, easing: ease })), -1))
    } else if (state === 'talk') {
      rot.value = withTiming(0, { duration: 200 }); sc.value = withTiming(1.02, { duration: 200 })
      sy.value = withRepeat(withSequence(withTiming(1.05, { duration: 140, easing: ease }), withTiming(0.98, { duration: 160, easing: ease })), -1, true)
    } else if (state === 'listen') {
      sy.value = withTiming(1, { duration: 200 })
      rot.value = withSpring(-6, { damping: 9, stiffness: 120 }); sc.value = withSpring(1.05, { damping: 10, stiffness: 120 })
    } else {
      rot.value = withSpring(0, { damping: 10, stiffness: 110 }); sc.value = withSpring(1, { damping: 10, stiffness: 110 }); sy.value = withTiming(1, { duration: 250 })
    }
  }, [state, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  // 답이 오면 깡충 → 히히
  useEffect(() => { if (hopN) { pc.current?.play('hop'); if (!reduced) setTimeout(() => pc.current?.play('giggle'), 420) } }, [hopN]) // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }, { scale: sc.value }, { scaleY: sy.value }] }))
  const mood = a.busy ? 'think' : listening ? 'smile' : face?.mood ?? 'smile'
  return (
    <Animated.View style={[{ position: 'absolute', left, top, width: size, height: size, transformOrigin: '50% 90%' }, st]} pointerEvents="box-none">
      <PlayableCharacter ref={pc} species={buddy.species} stage={buddy.stage} size={size} mood={mood} seed={wear?.wear.seed}
        wear={buddy.species ? wear?.wear : undefined} level="full" draggable={false} idle={!a.busy && !speaking} reduced={reduced}
        accessibilityLabel={companionLabel(buddy.species, buddy.name, buddy.level, buddy.stage)} />
    </Animated.View>
  )
}

/** 새 답이 들어올 때 — 캐릭터 머리 위(말풍선 자리)에서 위 기록으로 올라오듯(0.32초, 튕김 없음) */
const riseIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 56 }] },
    animations: { opacity: withTiming(1, { duration: 200 }), transform: [{ translateY: withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }) }] }
  }
}

/** 생각 중 점 세 개(통통) */
function ThinkingDots({ color }: { color: string }) {
  const reduced = useMotionReduced()
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 3 }} accessibilityLabel="생각하는 중">
      {[0, 1, 2].map((i) => <Dot key={i} delay={i * 140} color={color} still={reduced} />)}
    </View>
  )
}
function Dot({ delay, color, still }: { delay: number; color: string; still: boolean }) {
  const y = useSharedValue(0)
  useEffect(() => {
    if (still) return
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 280 })), -1))
    return () => cancelAnimation(y)
  }, [delay, still, y])
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, st]} />
}

/** 글자가 써지듯(새 답만) — 움직임 줄이기면 바로 다 */
function TypeText({ text, play, style, onDone }: { text: string; play: boolean; style: StyleProp<TextStyle>; onDone?: () => void }) {
  const [n, setN] = useState(play ? 0 : text.length)
  useEffect(() => {
    if (!play) { setN(text.length); onDone?.(); return }
    let id: ReturnType<typeof setInterval> | undefined
    let alive = true
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return
      if (reduce) { setN(text.length); onDone?.(); return }
      const step = Math.max(1, Math.ceil(text.length / 80)) // 길어도 2.5초 안에
      id = setInterval(() => setN((v) => { const nv = Math.min(text.length, v + step); if (nv >= text.length && id) { clearInterval(id); setTimeout(() => onDone?.(), 0) } return nv }), 30)
    })
    return () => { alive = false; if (id) clearInterval(id) }
  }, [text, play])
  return <Text style={style} selectable>{text.slice(0, n)}</Text>
}

/** AI 쪽 한 줄: 캐릭터 30(13의 ✦ 원 자리, 배경 원 없음) · 이름(3차 11.5) · 본문 */
function Ai({ face, name, xp = 0, children }: { face: ReactNode; name: string; xp?: number; children: ReactNode }) {
  const p = usePalette()
  return (
    <View style={s.ai}>
      <View style={s.who}>{face}<XpPop n={xp} style={{ top: -8, right: -10 }} /></View>
      {/* 장면 위 말풍선 — 글자는 늘 카드 위라 기존 글자색 그대로 읽힌다 */}
      <View style={[s.aiCard, { backgroundColor: p.dark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.93)' }]}>
        <Text style={[s.name, { color: p.textTertiary }]} numberOfLines={1}>{name}</Text>
        {children}
      </View>
    </View>
  )
}

function Caret() {
  const p = usePalette()
  const o = useSharedValue(1)
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (!r) o.value = withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1) }) }, [o])
  const st = useAnimatedStyle(() => ({ opacity: o.value }))
  return <Animated.View style={[{ width: 2, height: 16, backgroundColor: p.accent, marginLeft: 2, transform: [{ translateY: 3 }] }, st]} />
}

function Btn({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: ReactNode }) {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, { backgroundColor: p.cardBg, borderColor: p.borderDivider }, (pressed || disabled) && { opacity: 0.45 }]}>
      {icon}<Text style={[FONT.sub, { color: p.textPrimary, fontWeight: '500' }]}>{label}</Text>
    </Pressable>
  )
}

function Composer({ a, onSubmit, autoFocus }: { a: AssistantState; onSubmit: () => void; autoFocus?: boolean }) {
  const p = usePalette()
  const input = useRef<TextInput>(null)
  // Android: Modal(반 시트) 안의 autoFocus는 창이 붙기 전에 불려 키보드가 안 뜬다 → 조금 뒤에 직접 초점
  useEffect(() => {
    if (!autoFocus || Platform.OS !== 'android') return
    const t = setTimeout(() => input.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [autoFocus])
  const can = !a.busy && !!a.model && !!a.draft.trim() && !a.connecting
  return (
    <View style={[s.composer, { backgroundColor: p.cardBg, borderColor: p.borderDivider }, shadow(p, 'float')]}>
      <TextInput
        ref={input}
        value={a.draft}
        onChangeText={setDraft}
        autoFocus={autoFocus && Platform.OS !== 'android'}
        multiline
        maxLength={4000}
        placeholder={a.busy ? '다음에 물어볼 내용을 적어 두세요' : '무엇이든 물어보세요'}
        placeholderTextColor={p.textTertiary}
        style={[s.input, { color: p.textPrimary }]}
        // 엔터 = 줄 바꿈, 보내기는 ↑ 단추(2026-10-25 사용자 — 엔터로 바로 보내지 않는다)
        accessibilityLabel="AI에게 보낼 내용"
      />
      {a.busy ? (
        <Pressable accessibilityRole="button" accessibilityLabel="멈추기" hitSlop={6} onPress={cancel} style={[s.send, { backgroundColor: p.textPrimary }]}><Square size={12} color={p.cardBg} fill={p.cardBg} /></Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="보내기" hitSlop={6} disabled={!can} onPress={onSubmit} style={[s.send, { backgroundColor: p.accent }, !can && { opacity: 0.35 }]}><ArrowUp size={18} color={p.onAccent} strokeWidth={2.6} /></Pressable>
      )}
    </View>
  )
}

/** 결과 카드(13 §3): 머리 줄(아이콘 · 이름 · 개수) + 할 일 행(체크 · 제목 · 날짜). 집계는 큰 숫자 + 기준 문구 + 근거 행 최대 5개 */
function ResultCard({ r, onComplete }: { r: AssistantResult; onComplete?: () => void }) {
  const p = usePalette()
  const router = useRouter()
  const tasks = r.tasks ?? []
  const [more, setMore] = useState(false)
  const ids = tasks.map((t) => t.id)
  const live = useLiveQuery<{ id: string; status: number; deleted_at: string | null; title: string; start_at: string | null; due_at: string | null; priority: number }>(
    ids.length ? `SELECT id, status, deleted_at, title, start_at, due_at, priority FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})` : 'SELECT NULL AS id WHERE 0', ids
  ).data
  if (!tasks.length && !r.stats) return null
  const byId = new Map(live.map((t) => [t.id, t]))
  const limit = r.created ? tasks.length : 5
  const shown = more ? tasks : tasks.slice(0, limit)
  const today = dayKey()
  const head = r.created ? (tasks.some((t) => t.due_at?.includes('T')) ? '등록한 일정' : '등록한 할 일') : r.stats ? `완료 기록${r.stats.range ? ` · ${shortRange(r.stats.range)}` : ''}` : '찾은 항목'
  const Icon = r.created ? Check : r.stats ? BarChart3 : List
  return (
    <View style={[s.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
      <View style={[s.cardHead, { borderBottomColor: p.borderDivider }]}>
        <Icon size={14} color={p.textSecondary} />
        <Text style={[FONT.sub, { color: p.textSecondary, flex: 1, fontWeight: '600' }]} numberOfLines={1}>{head}</Text>
        <Text style={[FONT.meta, { color: p.textTertiary }]}>{r.stats ? '완료 시각 기준' : r.total ?? tasks.length}</Text>
      </View>
      {r.stats ? (
        <View style={s.stats}>
          <Text style={[s.big, { color: p.textPrimary }]}>{r.stats.hours}시간</Text>
          <Text style={[FONT.meta, { color: p.textTertiary }]}>일정 길이 합계 · 겹친 시간 포함, 실제 측정 아님 · 시간 없는 완료 {r.stats.untimed}개</Text>
        </View>
      ) : null}
      {shown.map((t) => {
        const cur = byId.get(t.id)
        const gone = live.length > 0 && (!cur || !!cur.deleted_at)
        const done = cur?.status === 1
        const date = rowDateLabel({ start_at: cur?.start_at ?? t.start_at, due_at: cur?.due_at ?? t.due_at }, today)
        return (
          <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${cur?.title ?? t.title} 열기`} disabled={gone} onPress={() => router.push(`/task/${t.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
            <Checkbox priority={cur?.priority ?? 0} done={done} disabled={gone || done} label={`${t.title} 완료`} onPress={() => { onComplete?.(); void completeTasks([t.id]) }} />
            <Text style={[FONT.body, { flex: 1, fontSize: 15, color: done || gone ? p.textTertiary : p.textPrimary }, gone && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{cur?.title ?? t.title}</Text>
            {gone ? <Text style={[FONT.meta, { color: p.textTertiary }]}>삭제됨</Text> : date && !done ? <Text style={[FONT.meta, { color: date.tone === 'overdue' ? p.overdue : p.accent, fontSize: 13 }]}>{date.label}</Text> : null}
          </Pressable>
        )
      })}
      {!more && tasks.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={s.more}><Text style={[FONT.sub, { color: p.accentInk }]}>더 보기 {tasks.length - limit}</Text></Pressable>
      ) : null}
    </View>
  )
}

/** 13 §3.1 기록 카드: 마지막으로 한 것 1행(+ 다음 예정), 횟수면 그 기간 기록(최대 5, 더 보기). 누름 = 할 일 상세 · 일정 시트 · 휴대폰 캘린더 앱 */
function RecallCard({ r }: { r: RecallResult }) {
  const p = usePalette()
  const router = useRouter()
  const [more, setMore] = useState(false)
  const now = new Date()
  const today = ymdOf(now)
  const rows: { hit: RecallHit; meta: string; future?: boolean }[] = []
  if (r.mode === 'last' && r.last) rows.push({ hit: r.last, meta: `${dayWord(r.last.date, now)}${r.last.date === today ? '' : ` · ${daysBetween(r.last.date, today)}일 전`}` })
  if (r.mode === 'count') for (const hit of r.hits ?? []) rows.push({ hit, meta: dayWord(hit.date, now) })
  const shown = rows.slice(0, r.mode === 'count' && !more ? 5 : rows.length)
  if (r.next) shown.push({ hit: r.next, meta: `다음 예정 · ${dayWord(r.next.date, now)}`, future: true })
  if (!shown.length) return null
  const open = (key: string) => {
    if (key.startsWith('ev:')) router.push(`/event/${key.slice(3)}`)
    else if (key.startsWith('dev:')) { const [id, at] = key.slice(4).split('|'); void openInCalendarApp(id, at) }
    else router.push(`/task/${key}`)
  }
  return (
    <View style={[s.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
      <View style={[s.cardHead, { borderBottomColor: p.borderDivider }]}>
        <History size={14} color={p.textSecondary} />
        <Text style={[FONT.sub, { color: p.textSecondary, flex: 1, fontWeight: '600' }]} numberOfLines={1}>{r.mode === 'last' ? '마지막 기록' : `${r.scope ?? '지금까지'} 기록`}</Text>
        {r.mode === 'count' ? <Text style={[FONT.meta, { color: p.textTertiary }]}>{r.count ?? 0}번</Text> : null}
      </View>
      {shown.map(({ hit, meta, future }) => (
        <Pressable key={`${future ? 'n' : 'p'}:${hit.id}`} accessibilityRole="button" accessibilityLabel={`${hit.title} 열기`} onPress={() => open(hit.open)} style={({ pressed }) => [s.row, pressed && { backgroundColor: p.bgSelected }]}>
          {hit.source === 'task' && !future ? <Check size={18} color={p.textTertiary} /> : <CalendarDays size={18} color={future ? p.accent : p.textTertiary} />}
          <Text style={[FONT.body, { flex: 1, fontSize: 15, color: future ? p.textPrimary : p.textSecondary }]} numberOfLines={1}>{hit.title}</Text>
          <Text style={[FONT.meta, { color: future ? p.accent : p.textTertiary, fontSize: 13 }]}>{meta}</Text>
        </Pressable>
      ))}
      {r.mode === 'count' && !more && rows.length > 5 ? (
        <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={s.more}><Text style={[FONT.sub, { color: p.accentInk }]}>더 보기 {rows.length - 5}</Text></Pressable>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 11.5, lineHeight: 15, fontWeight: '500' },
  ai: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  who: { width: 30, height: 30, marginTop: -4 },
  name: { fontSize: 11.5, lineHeight: 14, marginBottom: -6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chipWide: { alignSelf: 'stretch' },
  chipText: { fontSize: 14, lineHeight: 18 },
  heroT: { fontSize: 25, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center' },
  heroTs: { fontSize: 21, lineHeight: 27 },
  heroS: { fontSize: 14, lineHeight: 20, fontWeight: '500', marginTop: 6, textAlign: 'center' },
  heroChip: { paddingHorizontal: 16, paddingVertical: 13 },
  heroChipT: { fontSize: 14.5, fontWeight: '600' },
  think: { paddingBottom: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  thinkText: { fontSize: 12, fontWeight: '600' },
  speech: { position: 'absolute', borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  speechText: { fontSize: 16.5, lineHeight: 24 },
  tail: { position: 'absolute', bottom: -7, width: 14, height: 14, transform: [{ rotate: '45deg' }] },
  buddyBusy: { position: 'absolute', alignSelf: 'center', minWidth: 120, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  aiCard: { flex: 1, gap: 8, minWidth: 0, borderTopLeftRadius: 6, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingHorizontal: 13, paddingVertical: 10 },
  me: { alignSelf: 'flex-end', maxWidth: '80%', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 9 },
  text: { fontSize: 15.5, lineHeight: 22 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  step: { fontSize: 12, lineHeight: 16 },
  err: { borderRadius: 12, padding: 12, gap: 8 },
  errActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, borderRadius: 9, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth },
  latest: { position: 'absolute', right: 14, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 16, paddingHorizontal: 12, height: 32, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  notice: { position: 'absolute', alignSelf: 'center', bottom: 72, color: '#fff', fontSize: 13.5, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 9 },
  composer: { marginHorizontal: 12, marginTop: 4, borderRadius: 22, // 여러 줄이어도 어색하지 않게(P3-8 — 일기 Composer와 맞춤, 한 줄 높이 44에선 알약과 같다)
    borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 44 },
  input: { flex: 1, fontSize: 16, lineHeight: 21, maxHeight: 6 * 21 + 12, paddingTop: 6, paddingBottom: 6 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }, // 누름 자리 = 32 + hitSlop 6×2 = 44(P2-8)
  foot: { fontSize: 11, lineHeight: 15, textAlign: 'center', paddingHorizontal: 20, paddingTop: 6 },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderBottomWidth: StyleSheet.hairlineWidth },
  stats: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 2 },
  big: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 12 },
  more: { height: 40, alignItems: 'center', justifyContent: 'center' }
})
