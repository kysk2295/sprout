// 날짜 시트(22 §3.3, 시안 E, 03 §3·§4): ✕ · 날짜/기간 · ✓ → 빠른 날짜 줄 → 달력 → 둥근 카드(시간 · 알림 · 반복).
// 빠른 입력(새 할 일)과 상세·스와이프 "날짜"·길게 누름 "날짜 지정"(app/date.tsx)이 함께 쓴다. 계산은 dateSheetModel(데스크톱 DatePicker와 같은 규칙).
import { parseRule, reminderLabel, ruleSummary, timePart, hasTime, datePart, RR_DAY_CODES, rrDayLabel, formatTimeKo } from '@sprout/schema/time'
import { AlarmClock, CalendarArrowUp, CalendarDays, Check, ChevronsUpDown, Clock, Minus, Moon, Plus, Repeat, Sun, Sunrise, X } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { dayKey, nextMonday } from '../lib/dates'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import {
  EMPTY_SCHEDULE, customTrigger, dateCellLabel, fromWheel, pickDate, quickSchedule, reminderOptions, repeatPresets, ruleBase, setEnd, setRepeat, setStart, setTime,
  toDateMode, toDuration, toggleAllDay, toggleReminder, toWheel, weeklyDays, weeklyRule, type Schedule
} from './dateSheetModel'
import { GlassButton } from './Glass'
import { MonthCalendar } from './MonthCalendar'
import { Wheel } from './Wheel'

type Open = 'time' | 'reminder' | 'custom' | 'repeat' | 'sd' | 'st' | 'ed' | 'et' | 'date' | null
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export function DateSheet({ initial, onDone, onClose, scroll = true, datesOnly = false }: {
  initial: Schedule
  /** 38 §2.3 휴대폰 캘린더 일정: 날짜·기간·종일만(알림·반복 줄과 날짜 지우기 숨김) */
  datesOnly?: boolean
  /** ✓ 또는 빠른 날짜(바로 닫힘 — 03 §3) */
  onDone: (s: Schedule) => void
  onClose: () => void
  /** 시트 안에서 스크롤(app/date.tsx) — 빠른 입력 패널은 바깥이 스크롤 */
  scroll?: boolean
}) {
  const p = usePalette()
  const today = dayKey()
  const [d, setD] = useState<Schedule>(initial)
  const [tab, setTab] = useState<'date' | 'duration'>(initial.start_at ? 'duration' : 'date')
  const [open, setOpen] = useState<Open>(null)
  const sel = d.due_at ? datePart(d.start_at ?? d.due_at) : null
  const [month, setMonth] = useState((sel ?? today).slice(0, 7))
  const allDay = !hasTime(d.due_at)
  const toggle = (o: Open) => setOpen((x) => (x === o ? null : o))
  const rule = parseRule(d.repeat_rule)

  type Icon = typeof Sun
  const quick: [string, Icon, string, string | undefined][] = [
    ['오늘', Sun, today, undefined],
    ['내일', Sunrise, dayKey(1), undefined],
    ['다음 주 월', CalendarArrowUp, nextMonday(today), undefined],
    ['오늘 밤', Moon, today, '20:00']
  ]
  const tonight = d.due_at === `${today}T20:00`
  const quickOn = (date: string, time?: string) => (time ? tonight : sel === date && !(date === today && tonight))

  // ── 시간 휠 ──
  const timeWheel = (value: string, onChange: (t: string) => void) => {
    const w = toWheel(value)
    return (
      <Wheel columns={[
        { label: '오전 오후', items: ['오전', '오후'], index: w.pm ? 1 : 0, onChange: (i) => onChange(fromWheel({ ...w, pm: i === 1 })) },
        { label: '시', items: HOURS, index: w.hour12 - 1, onChange: (i) => onChange(fromWheel({ ...w, hour12: i + 1 })) },
        { label: '분', items: MINUTES, index: w.minute / 5, onChange: (i) => onChange(fromWheel({ ...w, minute: i * 5 })) }
      ]} />
    )
  }
  const defaultTime = () => {
    const n = new Date()
    n.setMinutes(0, 0, 0)
    n.setHours(n.getHours() + 1)
    return `${String(n.getHours()).padStart(2, '0')}:00`
  }

  // ── 알림 목록 ──
  const reminderText = d.reminders.map((r) => reminderLabel(r, allDay)).join(', ')
  const reminderList = () => {
    const presets = reminderOptions(allDay, !!d.start_at)
    const custom = d.reminders.filter((r) => !presets.some(([t]) => t === r))
    return (
      <>
        <Sub label="없음" on={d.reminders.length === 0} onPress={() => setD({ ...d, reminders: [] })} />
        {presets.map(([t, label]) => <Sub key={t} label={label} on={d.reminders.includes(t)} onPress={() => setD({ ...d, reminders: toggleReminder(d.reminders, t) })} />)}
        {custom.map((t) => <Sub key={t} label={reminderLabel(t, allDay)} on onPress={() => setD({ ...d, reminders: toggleReminder(d.reminders, t) })} />)}
        <Sub label="직접 설정…" accent onPress={() => toggle('custom')} />
        {open === 'custom' ? <CustomReminder allDay={allDay} onAdd={(t) => { setD({ ...d, reminders: [...new Set([...d.reminders, t])] }); setOpen('reminder') }} /> : null}
      </>
    )
  }

  // ── 반복 목록 ──
  const anchor = sel ?? today
  const repeatList = () => {
    const presets = repeatPresets(anchor)
    const base = ruleBase(d.repeat_rule)
    const isPreset = presets.some((x) => x.rule === base)
    const days = weeklyDays(d.repeat_rule, anchor)
    return (
      <>
        <Sub label="없음" on={!rule} onPress={() => setD(setRepeat(d, null, today))} />
        {presets.map((x) => <Sub key={x.label} label={x.label} hint={x.hint} on={base === x.rule} onPress={() => setD(setRepeat(d, x.rule, today))} />)}
        {rule && !isPreset ? <Sub label={ruleSummary({ ...rule, until: undefined, count: undefined }, anchor)} on onPress={() => {}} /> : null}
        {rule?.freq === 'WEEKLY' ? (
          <View style={s.pills}>
            {RR_DAY_CODES.map((c) => {
              const on = days.includes(c)
              return (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`${rrDayLabel(c)}요일`}
                  accessibilityState={{ selected: on }}
                  onPress={() => setD({ ...d, repeat_rule: weeklyRule(on ? days.filter((x) => x !== c) : [...days, c], anchor, d.repeat_rule) })}
                  style={[s.pill, { backgroundColor: on ? p.accent : p.bgSelected }]}
                >
                  <Text style={{ fontSize: 14, color: on ? '#fff' : p.textPrimary, fontWeight: on ? '600' : '400' }}>{rrDayLabel(c)}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </>
    )
  }

  const body = (
    <View style={s.body}>
      {/* 머리: ✕ · 날짜/기간 · ✓ (틱틱 iOS) */}
      <View style={s.head}>
        <GlassButton label="닫기" onPress={onClose}><X size={20} color={p.textPrimary} /></GlassButton>
        <View style={[s.seg, { backgroundColor: p.segTrack }]}>
          {(['date', 'duration'] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => { setTab(t); setOpen(null); setD(t === 'duration' ? toDuration(d, today) : toDateMode(d)) }}
              style={[s.segBtn, tab === t && { backgroundColor: p.segOn, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
            >
              <Text style={{ fontSize: 14, fontWeight: tab === t ? '600' : '400', color: p.textPrimary }}>{t === 'date' ? '날짜' : '기간'}</Text>
            </Pressable>
          ))}
        </View>
        <GlassButton label="확인" plain style={{ backgroundColor: p.accent }} onPress={() => onDone(d)}><Check size={20} color="#fff" /></GlassButton>
      </View>

      {tab === 'date' ? (
        <>
          {/* 빠른 날짜 줄(20 M6) — 누르면 바로 저장하고 닫는다(03 §3) */}
          <View style={s.quick}>
            {quick.map(([label, Icon, date, time]) => {
              const on = quickOn(date, time)
              return (
                <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => onDone(quickSchedule(d, date, time))} style={s.q}>
                  <Icon size={26} color={on ? p.accent : p.textPrimary} />
                  <Text style={{ fontSize: 11, lineHeight: 14, color: on ? p.accent : p.textSecondary }}>{label}</Text>
                </Pressable>
              )
            })}
          </View>
          {open === 'time' || open === 'reminder' || open === 'custom' || open === 'repeat' ? (
            <Card>
              <Row icon={<CalendarDays size={20} color={p.textSecondary} />} label="날짜" value={sel ? dateCellLabel(sel, today) : '없음'} accent={!!sel} onPress={() => setOpen(null)} />
            </Card>
          ) : (
            <MonthCalendar month={month} onMonth={setMonth} today={today} selected={sel ? [sel] : []} onPick={(day) => { setD(pickDate(d, day)); setMonth(day.slice(0, 7)) }} />
          )}
          <Card>
            <Row
              icon={<Clock size={20} color={p.textSecondary} />}
              label="시간"
              value={hasTime(d.due_at) ? formatTimeKo(timePart(d.due_at!)!) : '없음'}
              accent={hasTime(d.due_at)}
              onClear={hasTime(d.due_at) ? () => { setD(setTime(d, null, today)); setOpen(null) } : undefined}
              onPress={() => {
                if (!hasTime(d.due_at)) setD(setTime(d, defaultTime(), today))
                toggle('time')
              }}
            />
            {open === 'time' && hasTime(d.due_at) ? timeWheel(timePart(d.due_at!)!, (t) => setD(setTime(d, t, today))) : null}
            {datesOnly ? null : (
              <>
                <Row icon={<AlarmClock size={20} color={p.textSecondary} />} label="알림" value={reminderText || '없음'} accent={!!reminderText} first={false} onPress={() => toggle(open === 'custom' ? 'custom' : 'reminder')} onClear={reminderText ? () => setD({ ...d, reminders: [] }) : undefined} />
                {open === 'reminder' || open === 'custom' ? reminderList() : null}
                <Row icon={<Repeat size={20} color={p.textSecondary} />} label="반복" value={rule ? ruleSummary(rule, anchor) : '없음'} accent={!!rule} first={false} onPress={() => toggle('repeat')} onClear={rule ? () => setD(setRepeat(d, null, today)) : undefined} />
                {open === 'repeat' ? repeatList() : null}
              </>
            )}
          </Card>
        </>
      ) : (
        <DurationBody datesOnly={datesOnly} d={d} setD={setD} open={open} toggle={toggle} today={today} timeWheel={timeWheel} reminderText={reminderText} reminderList={reminderList} ruleText={rule ? ruleSummary(rule, anchor) : ''} repeatList={repeatList} onClearRepeat={() => setD(setRepeat(d, null, today))} />
      )}
      {datesOnly ? null : (
        <Pressable accessibilityRole="button" onPress={() => onDone(EMPTY_SCHEDULE)} style={s.clear}>
          <Text style={{ fontSize: 15, color: p.textTertiary }}>날짜 지우기</Text>
        </Pressable>
      )}
    </View>
  )
  if (!scroll) return body
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>{body}</ScrollView>
}

function DurationBody(props: {
  datesOnly?: boolean
  d: Schedule; setD: (s: Schedule) => void; open: Open; toggle: (o: Open) => void; today: string
  timeWheel: (v: string, on: (t: string) => void) => ReactNode; reminderText: string; reminderList: () => ReactNode; ruleText: string; repeatList: () => ReactNode; onClearRepeat: () => void
}) {
  const p = usePalette()
  const { d, setD, open, toggle, today } = props
  const start = d.start_at ?? d.due_at ?? today
  const end = d.due_at ?? start
  const allDay = !hasTime(d.due_at)
  const [month, setMonth] = useState(start.slice(0, 7))
  const which = (k: 'sd' | 'ed') => (k === 'sd' ? start : end)
  const fmt = (f: string) => dateCellLabel(datePart(f), today).split(' · ')[0]
  const line = (k: 'sd' | 'ed', label: string) => {
    const v = which(k)
    const tk = k === 'sd' ? 'st' : 'et'
    return (
      <>
        <View style={[s.row, k === 'ed' && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
          <Text style={[FONT.body, { width: 44, color: p.textPrimary }]}>{label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} 날짜`} onPress={() => { setMonth(v.slice(0, 7)); toggle(k) }} style={[s.field, { backgroundColor: open === k ? p.accentSubtle : p.bgSelected }]}>
            <Text style={{ fontSize: 15, color: open === k ? p.accent : p.textPrimary }}>{fmt(v)}</Text>
          </Pressable>
          {!allDay ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${label} 시간`} onPress={() => toggle(tk)} style={[s.field, { backgroundColor: open === tk ? p.accentSubtle : p.bgSelected }]}>
              <Text style={{ fontSize: 15, color: open === tk ? p.accent : p.textPrimary }}>{timePart(v)}</Text>
            </Pressable>
          ) : null}
        </View>
        {open === k ? (
          <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
            <MonthCalendar month={month} onMonth={setMonth} today={today} selected={[datePart(v)]} onPick={(day) => {
              const next = hasTime(v) ? `${day}T${timePart(v)}` : day
              setD(k === 'sd' ? setStart(d, next) : setEnd(d, next))
              toggle(null)
            }} />
          </View>
        ) : null}
        {open === tk && hasTime(v) ? props.timeWheel(timePart(v)!, (t) => setD(k === 'sd' ? setStart(d, `${datePart(v)}T${t}`) : setEnd(d, `${datePart(v)}T${t}`))) : null}
      </>
    )
  }
  return (
    <>
      <Card>
        {line('sd', '시작')}
        {line('ed', '끝')}
        <View style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }]}>
          <Text style={[FONT.body, { flex: 1, color: p.textPrimary }]}>종일</Text>
          <Switch value={allDay} onValueChange={() => setD(toggleAllDay(d))} trackColor={{ true: p.accent }} accessibilityLabel="종일" />
        </View>
      </Card>
      {props.datesOnly ? null : (
        <Card>
          <Row icon={<AlarmClock size={20} color={p.textSecondary} />} label="알림" value={props.reminderText || '없음'} accent={!!props.reminderText} onPress={() => toggle('reminder')} onClear={props.reminderText ? () => setD({ ...d, reminders: [] }) : undefined} />
          {open === 'reminder' || open === 'custom' ? props.reminderList() : null}
          <Row icon={<Repeat size={20} color={p.textSecondary} />} label="반복" value={props.ruleText || '없음'} accent={!!props.ruleText} first={false} onPress={() => toggle('repeat')} onClear={props.ruleText ? props.onClearRepeat : undefined} />
          {open === 'repeat' ? props.repeatList() : null}
        </Card>
      )}
    </>
  )
}

/** 알림 직접 설정: 시각 할 일 = N분·시간·일 전 / 종일 = N일 전 + 시각(03 §3.2) */
function CustomReminder({ allDay, onAdd }: { allDay: boolean; onAdd: (t: string) => void }) {
  const p = usePalette()
  const [n, setN] = useState(allDay ? 1 : 15)
  const [unit, setUnit] = useState<'m' | 'h' | 'd'>('m')
  const [time, setTimeV] = useState('09:00')
  const trigger = customTrigger(n, unit, allDay, time)
  const w = toWheel(time)
  return (
    <View style={[s.custom, { borderTopColor: p.borderDivider }]}>
      <View style={s.customRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="줄이기" onPress={() => setN(Math.max(0, n - 1))} style={[s.step, { backgroundColor: p.bgSelected }]}><Minus size={16} color={p.textPrimary} /></Pressable>
        <Text style={[FONT.bodyStrong, { minWidth: 36, textAlign: 'center', color: p.textPrimary }]}>{n}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="늘리기" onPress={() => setN(n + 1)} style={[s.step, { backgroundColor: p.bgSelected }]}><Plus size={16} color={p.textPrimary} /></Pressable>
        {allDay ? <Text style={[FONT.body, { color: p.textPrimary }]}>일 전</Text> : (
          <View style={[s.seg, { backgroundColor: p.segTrack, width: 168, marginLeft: 6 }]}>
            {(['m', 'h', 'd'] as const).map((u) => (
              <Pressable key={u} onPress={() => setUnit(u)} accessibilityRole="button" accessibilityState={{ selected: unit === u }} style={[s.segBtn, unit === u && { backgroundColor: p.segOn }]}>
                <Text style={{ fontSize: 13, color: p.textPrimary }}>{u === 'm' ? '분 전' : u === 'h' ? '시간 전' : '일 전'}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {allDay ? (
        <Wheel columns={[
          { label: '오전 오후', items: ['오전', '오후'], index: w.pm ? 1 : 0, onChange: (i) => setTimeV(fromWheel({ ...w, pm: i === 1 })) },
          { label: '시', items: HOURS, index: w.hour12 - 1, onChange: (i) => setTimeV(fromWheel({ ...w, hour12: i + 1 })) },
          { label: '분', items: MINUTES, index: w.minute / 5, onChange: (i) => setTimeV(fromWheel({ ...w, minute: i * 5 })) }
        ]} />
      ) : null}
      <View style={s.customRow}>
        <Text style={[FONT.sub, { flex: 1, color: p.textSecondary }]}>{reminderLabel(trigger, allDay)}</Text>
        <Pressable accessibilityRole="button" onPress={() => onAdd(trigger)} style={[s.add, { backgroundColor: p.accent }]}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>추가</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Card({ children }: { children: ReactNode }) {
  const p = usePalette()
  return <View style={[s.card, { backgroundColor: p.dark ? '#2a2a2a' : p.bgInput }]}>{children}</View>
}
function Row({ icon, label, value, accent, onPress, onClear, first = true }: { icon: ReactNode; label: string; value: string; accent?: boolean; onPress: () => void; onClear?: () => void; first?: boolean }) {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={({ pressed }) => [s.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { opacity: 0.7 }]}>
      {icon}
      <Text style={[FONT.body, { color: p.textPrimary }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={[FONT.sub, { color: accent ? p.accent : p.textTertiary, flexShrink: 1 }]} numberOfLines={1}>{value}</Text>
      {onClear ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} 지우기`} hitSlop={8} onPress={onClear}><X size={14} color={p.textTertiary} /></Pressable>
      ) : <ChevronsUpDown size={14} color={p.textTertiary} />}
    </Pressable>
  )
}
function Sub({ label, hint, on, accent, onPress }: { label: string; hint?: string; on?: boolean; accent?: boolean; onPress: () => void }) {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={({ pressed }) => [s.sub, pressed && { opacity: 0.6 }]}>
      <Text style={[FONT.body, { flex: 1, color: accent ? p.accent : p.textPrimary }]}>{label}{hint ? <Text style={{ color: p.textTertiary }}> ({hint})</Text> : null}</Text>
      {on ? <Check size={18} color={p.accent} /> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 14 },
  head: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  seg: { flexDirection: 'row', width: 150, height: 32, borderRadius: 9, padding: 2, marginHorizontal: 'auto' },
  segBtn: { flex: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 4, paddingBottom: 12 },
  q: { alignItems: 'center', gap: 4, width: 70 },
  card: { borderRadius: 14, marginTop: 12, overflow: 'hidden' },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  sub: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingLeft: 44, paddingRight: 14 },
  pills: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 44, paddingRight: 14, paddingVertical: 8 },
  pill: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  field: { height: 32, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center', marginRight: 6 },
  custom: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 44, paddingRight: 14, paddingVertical: 6 },
  step: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  add: { height: 32, borderRadius: 16, paddingHorizontal: 16, justifyContent: 'center' },
  clear: { alignItems: 'center', paddingVertical: 16 }
})
