// 28 §2.1 오늘 쓰기(E1) + 15 §9 v1 모양: 주 띠(월~일, 기분 점) → 종이 페이지(하늘 띠·날짜·책갈피 🔒) → 기분 얼굴 → 질문 쪽지 → 줄 노트 글
// → 오늘 한 일 타임라인 → 곁에 앉은 캐릭터 칸(첫 답 미리보기·상태별 안내) → 바닥 줄(새싹 잎 연속 · 저장 시각).
import { useRouter } from 'expo-router'
import { ChevronRight, Lock, LockOpen, MoreHorizontal, RefreshCw } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { addDays } from '@sprout/schema/time'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { PopMenu, useAnchor } from '../ui/Menu'
import { useToast } from '../ui/Toast'
import { LeafIcon, MoodFace, SkyIcon, diaryColors } from './art'
import { buddyReply, deleteEntry, saveEntry, setPrivate, summarizeEntry, useDone, useMessages } from './data'
import {
  buddyLine, FIRST_REPLY_MS, isWritten, josa, mayCallAi, moodFaceOf, moodOf, MOODS, parseBuddyReply, promptFor, skyOf, streakOf, wantsFirstReply, WEEK_DAYS, weekOf,
  type Buddy, type DiaryEntry
} from './logic'
import { BuddyArt, Bubble } from './parts'
import { getConsent, isSolo, setConsent, setSolo, useDiaryPrefs } from './prefs'
import { setDiaryState } from './state'

type Ai = { kind: 'idle' } | { kind: 'reading'; text: string; queue?: number } | { kind: 'error'; message: string }

export function WritePage({ date, today, entry, entries, buddy, stage, reduced }: {
  date: string; today: string; entry: DiaryEntry | undefined; entries: DiaryEntry[]; buddy: Buddy & { stage: number }; stage: number; reduced: boolean
}) {
  const p = usePalette()
  const c = diaryColors(p)
  const router = useRouter()
  const toast = useToast()
  const prefs = useDiaryPrefs()
  const messages = useMessages(date)
  const done = useDone(date)
  const [text, setText] = useState(entry?.content ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(entry?.modified_at ?? null)
  const [shift, setShift] = useState(0)
  const [ai, setAi] = useState<Ai>({ kind: 'idle' })
  const [cue, setCue] = useState<{ line: string; n: number } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [lines, setLines] = useState(6)
  const [confirmDel, setConfirmDel] = useState(false)
  const more = useAnchor()
  const editing = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const replyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const asked = useRef(new Set<string>())
  const touched = useRef(new Set<string>())
  const abort = useRef<AbortController | null>(null)
  const inputRef = useRef<TextInput>(null)
  const isPrivate = !!entry?.private
  const solo = prefs.isSolo(date)
  const aiOk = mayCallAi({ consent: prefs.consent, private: entry?.private, solo })

  // 날짜가 바뀌거나 다른 기기에서 고쳐진 글: 내가 쓰는 중이 아니면 따라간다
  useEffect(() => { setText(entry?.content ?? ''); setSavedAt(entry?.modified_at ?? null); setAi({ kind: 'idle' }); setShowAll(false); editing.current = false }, [date]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!editing.current && entry) setText(entry.content ?? '') }, [entry?.content]) // eslint-disable-line react-hooks/exhaustive-deps
  // 떠날 때: 쓰거나 이야기한 날이면 기억하기 요약(켜 둔 사람만, 나만 보기 아님 — summarizeEntry 안에서 다시 확인)
  useEffect(() => () => {
    clearTimeout(replyTimer.current)
    abort.current?.abort()
    if (touched.current.has(date)) { touched.current.delete(date); void summarizeEntry(date, AbortSignal.timeout(180000)).catch(() => {}) }
  }, [date])
  // 처음 열기 말풍선
  useEffect(() => { setCue({ line: isPrivate ? buddyLine({ kind: 'private' }) : solo ? buddyLine({ kind: 'solo' }) : !entries.length ? buddyLine({ kind: 'first' }) : buddyLine({ kind: 'open', hour: new Date().getHours() }), n: Date.now() }) }, [date, isPrivate, solo]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!cue) return; const t = setTimeout(() => setCue(null), 2600); return () => clearTimeout(t) }, [cue])

  const runReply = useCallback(async () => {
    if (asked.current.has(date)) return
    asked.current.add(date)
    const ctrl = new AbortController()
    abort.current = ctrl
    setAi({ kind: 'reading', text: '' })
    try {
      const r = await buddyReply(date, { buddy, signal: ctrl.signal, onDelta: (t) => setAi({ kind: 'reading', text: t }), onQueue: (q) => setAi((a) => (a.kind === 'reading' ? { ...a, queue: q } : a)) })
      touched.current.add(date)
      setAi({ kind: 'idle' })
      if (r === 'blocked') asked.current.delete(date)
    } catch (e) {
      if (ctrl.signal.aborted) return
      asked.current.delete(date)
      setAi({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [date, buddy])

  const onChange = (v: string) => {
    editing.current = true
    setText(v)
    clearTimeout(saveTimer.current)
    clearTimeout(replyTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveEntry(date, { content: v }).then(() => { setSavedAt(new Date().toISOString()); touched.current.add(date) })
    }, 600)
    // 첫 답(15 §7): 10자 이상 + 마지막 입력 뒤 3.6초 + 아직 대화 없음 + 부를 수 있을 때만
    replyTimer.current = setTimeout(() => {
      editing.current = false
      if (wantsFirstReply(v, messages.length) && mayCallAi({ consent: getConsent(), private: entry?.private, solo: isSolo(date) })) void runReply()
    }, FIRST_REPLY_MS)
  }
  useEffect(() => () => { clearTimeout(saveTimer.current) }, [])

  const pickMood = async (v: number) => {
    const next = entry?.mood === v ? null : v
    await saveEntry(date, { mood: next })
    setSavedAt(new Date().toISOString())
    if (next) setCue({ line: buddyLine({ kind: 'mood', mood: next }), n: Date.now() })
  }
  const togglePrivate = async () => {
    const on = !isPrivate
    if (on) { abort.current?.abort(); setAi({ kind: 'idle' }) }
    await setPrivate(date, on)
    setCue({ line: on ? buddyLine({ kind: 'private' }) : buddyLine({ kind: 'open', hour: new Date().getHours() }), n: Date.now() })
    toast.show(on ? '이 날은 나만 봐요. AI가 읽지 않아요' : `${josa(buddy.name, '와', '과')} 같이 읽어요`)
  }
  const usePrompt = () => {
    const q = `Q. ${promptFor(date, shift)}\n`
    onChange(q + text)
    void saveEntry(date, { prompt: promptFor(date, shift) })
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── 주 띠 ──
  const week = weekOf(date)
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])
  const fling = Gesture.Race(
    Gesture.Fling().direction(1).runOnJS(true).onEnd(() => setDiaryState({ date: addDays(date, -7) })),
    Gesture.Fling().direction(2).runOnJS(true).onEnd(() => { const n = addDays(date, 7); setDiaryState({ date: n > today ? today : n }) })
  )
  const streak = useMemo(() => streakOf(new Set(entries.filter(isWritten).map((e) => e.date)), today), [entries, today])

  // ── 하늘 띠 ──
  const d = new Date(`${date}T00:00:00`)
  const isToday = date === today
  const sky = isToday ? skyOf(new Date().getHours()) : 'day'
  const mood = moodOf(entry?.mood)
  const [sky1, sky2] = isToday ? c.sky[sky] : mood ? [alpha(mood.color, 0.3), c.paper] : [alpha(c.sky.day[0], 0.6), c.paper]
  const savedLabel = savedAt ? `${new Date(savedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} · 저장됨` : ''

  // ── 캐릭터 칸 ──
  const firstReply = messages.find((m) => m.role === 'buddy' && !m.safety) // safety=1: 예전 위기 카드 행(기능 제외) — 건너뛴다
  const buddyMood = isPrivate ? 'sleepy' : mood ? moodFaceOf(mood.value) : 'default'
  const companion = () => {
    const name = buddy.name
    if (prefs.consent === false) {
      return (
        <View style={{ gap: 8 }}>
          <Text style={[st.cTitle, { color: p.textPrimary }]}>{josa(name, '와', '과')} 일기를 나눠 볼래?</Text>
          <Text style={[st.cSub, { color: p.textSecondary }]}>일기를 읽고 친구처럼 이야기해 줘요. 나만 보기로 둔 날은 보내지 않아요.</Text>
          <Pressable accessibilityRole="button" onPress={() => setConsent(true)} style={[st.pill, { backgroundColor: p.accent }]}><Text style={st.pillText}>나누기 켜기</Text></Pressable>
          <Text style={[st.cSub, { color: p.textTertiary }]}>{done.rows.length ? `오늘 ${done.rows.length}개를 해냈네. 잘했어` : '쉬어 가는 날도 괜찮아'}</Text>
        </View>
      )
    }
    if (isPrivate) {
      return (
        <View style={{ gap: 8 }}>
          <Text style={[st.cTitle, { color: p.textPrimary }]}>🔒 이 날은 {josa(name, '가', '이')} 읽지 않아요</Text>
          <Pressable accessibilityRole="button" onPress={() => void togglePrivate()} style={[st.pillLine, { borderColor: p.accent }]}><Text style={[st.pillLineText, { color: p.accent }]}>나만 보기 끄기</Text></Pressable>
        </View>
      )
    }
    if (solo) {
      return (
        <View style={{ gap: 8 }}>
          <Text style={[st.cTitle, { color: p.textPrimary }]}>오늘은 혼자 쓰는 날</Text>
          <Pressable accessibilityRole="button" onPress={() => setSolo(date, false)} style={[st.pillLine, { borderColor: p.accent }]}><Text style={[st.pillLineText, { color: p.accent }]}>{josa(name, '와', '과')} 이야기하기</Text></Pressable>
        </View>
      )
    }
    if (ai.kind === 'reading') {
      return <Text style={[st.cSub, { color: p.textSecondary }]} numberOfLines={3}>{ai.text || (ai.queue ? `${josa(name, '가', '이')} 차례를 기다리는 중… (앞에 ${ai.queue}명)` : `${josa(name, '가', '이')} 읽는 중…`)}</Text>
    }
    if (ai.kind === 'error') {
      return (
        <View style={{ gap: 8 }}>
          <Text style={[st.cSub, { color: p.textSecondary }]}>지금은 {josa(name, '가', '이')} 쉬고 있어요. 일기는 그대로 저장돼요</Text>
          <Pressable accessibilityRole="button" onPress={() => void runReply()} style={[st.pillLine, { borderColor: p.accent, flexDirection: 'row', gap: 6 }]}><RefreshCw size={14} color={p.accent} /><Text style={[st.pillLineText, { color: p.accent }]}>다시 시도</Text></Pressable>
        </View>
      )
    }
    if (firstReply) {
      return (
        <Pressable accessibilityRole="button" accessibilityLabel={`${josa(name, '와', '과')} 이야기하기`} onPress={() => router.push({ pathname: '/diary/chat', params: { date } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[st.cSub, { color: p.textPrimary, flex: 1 }]} numberOfLines={2}>{parseBuddyReply(firstReply.content).text}</Text>
          <Text style={{ color: p.accent, fontSize: 13, fontWeight: '600' }}>이야기하기</Text>
        </Pressable>
      )
    }
    if (text.trim().length < 10) return <Text style={[st.cSub, { color: p.textTertiary }]}>일기를 쓰면 {josa(name, '가', '이')} 읽고 이야기해 줘요</Text>
    return (
      <Pressable onPress={() => router.push({ pathname: '/diary/chat', params: { date } })} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[st.cSub, { color: p.textTertiary, flex: 1 }]}>잠깐 쉬면 {josa(name, '가', '이')} 먼저 말을 걸어요</Text>
        <Text style={{ color: p.accent, fontSize: 13, fontWeight: '600' }}>이야기하기</Text>
      </Pressable>
    )
  }

  const shown = showAll ? done.rows : done.rows.slice(0, 3)
  return (
    <View>
      {/* 주 띠 */}
      <GestureDetector gesture={fling}>
        <View style={st.week} accessibilityHint="좌우로 밀면 앞뒤 주">
          {week.map((w, i) => {
            const e = byDate.get(w)
            const m = moodOf(e?.mood)
            const sel = w === date
            const future = w > today
            return (
              <Pressable key={w} disabled={future} onPress={() => setDiaryState({ date: w })} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`${Number(w.slice(5, 7))}월 ${Number(w.slice(8))}일`}
                style={[st.wcell, sel && { backgroundColor: p.accent }, future && { opacity: 0.35 }]}>
                <Text style={[st.wday, { color: sel ? '#fff' : p.textTertiary }]}>{WEEK_DAYS[i]}</Text>
                <Text style={[st.wnum, { color: sel ? '#fff' : w === today ? p.accent : p.textPrimary }]}>{Number(w.slice(8))}</Text>
                <View style={[st.wdot, { backgroundColor: m ? m.color : e && isWritten(e) ? p.accent : 'transparent' }, sel && m && { borderWidth: 1, borderColor: '#fff' }]} />
              </Pressable>
            )
          })}
        </View>
      </GestureDetector>

      {/* 종이 페이지 */}
      <Animated.View key={date} entering={reduced ? FadeIn.duration(150) : FadeInDown.duration(180)} style={[st.page, { backgroundColor: c.paper, shadowOpacity: p.dark ? 0 : 0.07 }]}>
        <View style={st.sky}>
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 76">
            <Defs><LinearGradient id="dsky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={sky1} /><Stop offset="1" stopColor={sky2} /></LinearGradient></Defs>
            <Rect x={0} y={0} width={100} height={76} fill="url(#dsky)" />
          </Svg>
          <View style={st.skyIcon}><SkyIcon sky={sky} behind={sky1} /></View>
          <Text style={[st.big, { color: p.textPrimary }]}>{d.getDate()}</Text>
          <View style={{ flex: 1, paddingTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[st.mline, { color: p.textPrimary }]}>{d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}년 ` : ''}{d.getMonth() + 1}월 · {'일월화수목금토'[d.getDay()]}요일</Text>
              {isToday ? <View style={[st.todayChip, { backgroundColor: p.accentSubtle }]}><Text style={{ color: p.accent, fontSize: 11, fontWeight: '600' }}>오늘</Text></View> : null}
            </View>
            {savedLabel ? <Animated.Text key={savedAt} entering={FadeIn.duration(200)} style={[st.saved, { color: p.textTertiary }]}>{savedLabel} ✓</Animated.Text> : null}
          </View>
          <Pressable ref={more.ref} onPress={more.open} accessibilityRole="button" accessibilityLabel="일기 메뉴" hitSlop={8} style={st.more}><MoreHorizontal size={20} color={p.textSecondary} /></Pressable>
        </View>
        {/* 나만 보기 책갈피 */}
        <Pressable onPress={() => void togglePrivate()} accessibilityRole="switch" accessibilityState={{ checked: isPrivate }} accessibilityLabel="나만 보기" hitSlop={8}
          style={[st.mark, { backgroundColor: isPrivate ? p.accent : p.dark ? '#ffffff26' : '#0000001a' }]}>
          {isPrivate ? <Lock size={14} color="#fff" /> : <LockOpen size={14} color={p.textSecondary} />}
          <View style={[st.markNotch, { borderTopColor: c.paper }]} />
        </Pressable>

        <View style={st.inner}>
          <Text style={[st.label, { color: p.textTertiary }]}>{isToday ? '오늘 기분' : '이 날 기분'}</Text>
          <View accessibilityRole="radiogroup" style={st.moods}>
            {MOODS.map((m) => {
              const on = entry?.mood === m.value
              return (
                <Pressable key={m.value} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={m.label} onPress={() => void pickMood(m.value)} hitSlop={4}
                  style={[st.face, on && { transform: [{ scale: 1.12 }], borderColor: m.color, borderWidth: 2 }]}>
                  <MoodFace mood={m.value} size={40} faded={!!entry?.mood && !on} />
                </Pressable>
              )
            })}
          </View>
          {mood ? <Text style={[st.moodLabel, { color: mood.color }]}>{mood.label}</Text> : null}

          {!text.trim() ? (
            <Animated.View key={shift} entering={reduced ? undefined : FadeIn.duration(250)} style={[st.note, { backgroundColor: c.note }]}>
              <Text style={[st.noteHead, { color: p.textTertiary }]}>오늘의 질문</Text>
              <Text style={[st.noteQ, { color: p.textPrimary }]}>{promptFor(date, shift)}</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Pressable onPress={usePrompt} accessibilityRole="button" hitSlop={6}><Text style={{ color: p.accent, fontWeight: '600', fontSize: 13 }}>이 질문으로 쓰기</Text></Pressable>
                <Pressable onPress={() => setShift((n) => n + 1)} accessibilityRole="button" hitSlop={6}><Text style={{ color: p.textSecondary, fontSize: 13 }}>다른 질문 ↻</Text></Pressable>
              </View>
            </Animated.View>
          ) : null}

          {/* 줄 노트 */}
          <View style={{ minHeight: 28 * 6 }} onLayout={(e) => setLines(Math.max(6, Math.ceil(e.nativeEvent.layout.height / 28)))}>
            {Array.from({ length: lines }, (_, i) => <View key={i} style={[st.rule, { top: 28 * (i + 1) - 1, backgroundColor: c.line }]} />)}
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={onChange}
              multiline
              scrollEnabled={false}
              placeholder={isToday ? '오늘 하루는 어땠나요?' : '이 날은 비어 있어요. 지금 써도 돼요'}
              placeholderTextColor={p.textQuaternary}
              accessibilityLabel="일기 글"
              style={[st.input, { color: p.textPrimary }]}
            />
          </View>

          {/* 오늘 한 일 타임라인(15 §9.5, 읽기만) */}
          <View style={[st.doneHead, { borderTopColor: p.borderDivider }]}>
            <Text style={[st.doneTitle, { color: p.textSecondary }]}>{isToday ? '오늘' : '이 날'} 한 일 {done.rows.length}개</Text>
            {done.xp > 0 ? <View style={[st.xp, { backgroundColor: p.accentSubtle }]}><Text style={{ color: p.accent, fontSize: 11.5, fontWeight: '600' }}>+{done.xp} XP</Text></View> : null}
          </View>
          {done.rows.length === 0 ? <Text style={[st.cSub, { color: p.textTertiary }]}>{isToday ? '오늘' : '이 날'} 끝낸 할 일이 아직 없어요</Text> : (
            <View>
              {shown.map((r, i) => (
                <Pressable key={r.id} onPress={() => router.push(`/task/${r.id}`)} accessibilityRole="button" style={st.tl}>
                  <Text style={[st.tlTime, { color: p.textTertiary }]}>{new Date(r.completed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
                  <View style={st.tlRail}>
                    <View style={[st.tlDot, { backgroundColor: p.accent }]} />
                    {i < shown.length - 1 ? <View style={[st.tlLine, { backgroundColor: p.borderDivider }]} /> : null}
                  </View>
                  <Text style={[st.tlTitle, { color: p.textPrimary }]} numberOfLines={1}>{r.title}</Text>
                  <ChevronRight size={14} color={p.textQuaternary} />
                </Pressable>
              ))}
              {done.rows.length > 3 ? <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={6}><Text style={{ color: p.accent, fontSize: 13, marginLeft: 58, marginTop: 2 }}>{showAll ? '접기' : `＋ ${done.rows.length - 3}개 더`}</Text></Pressable> : null}
            </View>
          )}
        </View>
      </Animated.View>

      {/* 곁에 앉은 캐릭터 */}
      <View style={[st.companion, { backgroundColor: p.cardBg }]}>
        <View style={st.cHead}>
          <BuddyArt buddy={buddy} stage={stage} size={56} mood={buddyMood} still={reduced} bounce={cue?.n} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[st.cName, { color: p.textTertiary }]}>{buddy.name}{prefs.consent && !isPrivate ? ' · 같이 읽는 중' : ''}</Text>
            {cue ? <Bubble text={cue.line} /> : null}
          </View>
        </View>
        {companion()}
      </View>

      {/* 바닥 줄 */}
      <View style={st.foot}>
        <LeafIcon size={16} />
        <Text style={[st.footText, { color: p.textSecondary }]}>{streak.days ? `${streak.days}일째 이어 쓰는 중${streak.today ? '' : ' · 오늘도 이어 가요'}` : '오늘부터 시작해요'}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[st.footText, { color: p.textTertiary }]}>{isPrivate ? '🔒 이 날은 AI가 읽지 않아요' : prefs.consent ? `${buddy.name}만 같이 읽어요` : '일기는 나만 봐요'}</Text>
      </View>

      <PopMenu anchor={more.rect} onClose={more.close} items={[
        { key: 'private', label: isPrivate ? '나만 보기 끄기' : '나만 보기', checked: isPrivate, onPress: () => void togglePrivate() },
        ...(prefs.consent ? [{ key: 'solo', label: '오늘은 혼자 쓸게', checked: solo, onPress: () => { setSolo(date, !solo); if (!solo) { abort.current?.abort(); setAi({ kind: 'idle' }) } } }] : []),
        { key: 'consent', label: prefs.consent ? `${josa(buddy.name, '와', '과')} 나누기 끄기` : `${josa(buddy.name, '와', '과')} 나누기 켜기`, onPress: () => setConsent(!prefs.consent) },
        { key: 'del', label: '이 날 일기 지우기', danger: true, disabled: !entry, onPress: () => setConfirmDel(true) }
      ]} />
      {confirmDel ? (
        <View style={[st.confirm, { backgroundColor: p.bgPopover, borderColor: p.borderPopover }]}>
          <Text style={{ color: p.textPrimary, fontSize: 15, fontWeight: '600' }}>이 날 일기를 지울까요?</Text>
          <Text style={{ color: p.textSecondary, fontSize: 13 }}>글·기분·대화가 모든 기기에서 지워져요.</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 6 }}>
            <Pressable onPress={() => setConfirmDel(false)} hitSlop={8}><Text style={{ color: p.textSecondary, fontSize: 15 }}>취소</Text></Pressable>
            <Pressable onPress={() => { setConfirmDel(false); void deleteEntry(date).then(() => { setText(''); toast.show('일기를 지웠어요') }) }} hitSlop={8}><Text style={{ color: p.danger, fontSize: 15, fontWeight: '600' }}>지우기</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}
const st = StyleSheet.create({
  week: { flexDirection: 'row', paddingHorizontal: 12, gap: 4, marginBottom: 10 },
  wcell: { flex: 1, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  wday: { fontSize: 11, fontWeight: '500' },
  wnum: { fontSize: 16, fontWeight: '600' },
  wdot: { width: 6, height: 6, borderRadius: 3 },
  page: { marginHorizontal: 12, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  sky: { height: 76, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 18, paddingTop: 10, gap: 10 },
  skyIcon: { position: 'absolute', right: 62, top: 10, opacity: 0.9 },
  big: { fontSize: 44, lineHeight: 52, fontWeight: '800' },
  mline: { fontSize: 15, fontWeight: '600' },
  todayChip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  saved: { fontSize: 11, marginTop: 3 },
  more: { position: 'absolute', right: 52, top: 40 },
  mark: { position: 'absolute', right: 16, top: 0, width: 28, height: 40, alignItems: 'center', justifyContent: 'center', paddingBottom: 6 },
  markNotch: { position: 'absolute', bottom: -1, width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderTopWidth: 0, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent' },
  inner: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18, gap: 10 },
  label: { fontSize: 12, fontWeight: '600' },
  moods: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  face: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  moodLabel: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginTop: -4 },
  note: { borderRadius: 6, padding: 12, gap: 6, transform: [{ rotate: '-1deg' }], shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  noteHead: { fontSize: 11, fontWeight: '600' },
  noteQ: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  rule: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  input: { fontSize: 16, lineHeight: 28, minHeight: 28 * 6, padding: 0, paddingTop: 2, textAlignVertical: 'top' },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4 },
  doneTitle: { fontSize: 12.5, fontWeight: '600' },
  xp: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tl: { flexDirection: 'row', alignItems: 'center', minHeight: 34, gap: 8 },
  tlTime: { width: 40, fontSize: 11, fontVariant: ['tabular-nums'] },
  tlRail: { width: 10, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  tlDot: { width: 8, height: 8, borderRadius: 4 },
  tlLine: { position: 'absolute', top: 21, bottom: -13, width: 1 },
  tlTitle: { flex: 1, fontSize: 13.5 },
  companion: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 14, gap: 10 },
  cHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cName: { fontSize: 12, fontWeight: '600' },
  cTitle: { fontSize: 15, fontWeight: '600' },
  cSub: { fontSize: 14, lineHeight: 20 },
  pill: { alignSelf: 'flex-start', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  pillLine: { alignSelf: 'flex-start', borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
  pillLineText: { fontWeight: '600', fontSize: 14 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14 },
  footText: { fontSize: 12 },
  confirm: { position: 'absolute', left: 24, right: 24, top: 120, borderRadius: 14, borderWidth: 1, padding: 16, gap: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 }
})
