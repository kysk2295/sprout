// 41 §3 · §8 머리 ⚑ 알약 → 날짜 시트: 안내 `핵심 날짜 — ⚑ 할 일과 같은 날짜예요` · 달력(하루 고르기) · 날짜 이름 칩 · `핵심 날짜 지우기`(이음만 끊음).
// 핵심 날짜가 없으면(`＋ 핵심 날짜`) 고르고 ✓ = ⚑ 할 일을 만들고 잇는다. 저장은 projectDirect setKeyDate · clearKeyDate.
import { keyWordChips, mdWeek, starterFor } from '@sprout/schema/planView'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { dayKey } from '../../lib/dates'
import { usePalette } from '../../theme/ThemeProvider'
import { BottomSheet } from '../../ui/BottomSheet'
import { MonthCalendar } from '../../ui/MonthCalendar'
import { SheetHead } from '../../ui/SheetHead'
import { useToast } from '../../ui/Toast'
import { clearKeyDate, setKeyDate } from './projectDirect'

export type KeyDateTarget = { tagId: string; name: string; keyTaskId: string | null; day: string | null; word: string | null }

export function KeyDateSheet({ target, onClose }: { target: KeyDateTarget | null; onClose: () => void }) {
  const p = usePalette()
  const toast = useToast()
  const today = dayKey()
  const [day, setDay] = useState<string | null>(null)
  const [word, setWord] = useState('마감')
  const [month, setMonth] = useState(today.slice(0, 7))
  useEffect(() => {
    if (!target) return
    const w = target.word ?? starterFor(target.name).word
    setDay(target.day); setWord(w); setMonth((target.day ?? today).slice(0, 7))
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = target
  const save = async () => {
    if (!t || !day) return
    onClose()
    try {
      const undo = await setKeyDate({ tagId: t.tagId, name: t.name, keyTaskId: t.keyTaskId }, day, word)
      toast.show(`핵심 날짜를 ${word} ${mdWeek(day)}로 정했어요`, { undo })
    } catch { toast.show('핵심 날짜를 저장하지 못했어요. 다시 시도해 주세요.', { error: true }) }
  }
  const clear = async () => {
    if (!t) return
    onClose()
    toast.show('핵심 날짜를 지웠어요 · ⚑ 할 일은 남아요', { undo: await clearKeyDate(t.tagId) })
  }
  const chips = keyWordChips(t ? starterFor(t.name).word : '마감')
  return (
    <BottomSheet visible={!!target} onClose={onClose} mid={0.72} label="핵심 날짜"
      head={<SheetHead compact title="핵심 날짜" onClose={onClose} onDone={day ? () => void save() : undefined} />}>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={{ color: p.textTertiary, fontSize: 13, marginBottom: 10 }}>핵심 날짜 — ⚑ 할 일과 같은 날짜예요</Text>
        <View style={[s.cal, { backgroundColor: p.cardBg }]}>
          <MonthCalendar month={month} onMonth={setMonth} today={today} selected={day ? [day] : []} onPick={setDay} />
        </View>
        <View style={s.chips}>
          {[...new Set([...chips, word])].map((w) => {
            const on = w === word
            return (
              <Pressable key={w} onPress={() => setWord(w)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`날짜 이름 ${w}`}
                style={[s.chip, { backgroundColor: on ? p.accentSubtle : p.bgSelected }]}>
                <Text style={{ color: on ? p.accent : p.textSecondary, fontSize: 13.5, fontWeight: on ? '600' : '400' }}>{w}</Text>
              </Pressable>
            )
          })}
        </View>
        {day ? <Text style={{ color: p.textSecondary, fontSize: 13, marginTop: 10 }}>⚑ {word} {mdWeek(day)}</Text> : null}
        {t?.keyTaskId && t.day ? (
          <Pressable onPress={() => void clear()} accessibilityRole="button" style={[s.clear, { borderTopColor: p.borderDivider }]}>
            <Text style={{ color: p.danger, fontSize: 15 }}>핵심 날짜 지우기</Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  cal: { borderRadius: 14, padding: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  clear: { marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' }
})
