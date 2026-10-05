// 38 §5.4 캐시 전용 휴대폰 일정 고치기·옮기기·삭제 + 반복 범위 대화(16 §12.8과 같은 말).
// 휴대폰 안에서 바로 쓰고(네트워크 없음) 다시 그린다. 실패하면 토스트. 반복 아닌 것은 토스트 ⟲로 되돌린다.
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { useToast } from '../ui/Toast'
import * as Dev from './device'
import { deviceRef, type DeviceRef } from './items'
import { SPAN_LABEL, spanChoices, spanToDevice, type Span } from './link'
import { bumpDeviceCal } from './store'

export interface DevPatch { title?: string; notes?: string | null; location?: string | null; start_at?: string; end_at?: string; is_all_day?: number }
const SAVE_FAIL = '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const GONE = '이미 삭제된 일정이에요'

/** 반복 범위 대화 — ask()가 고른 범위(취소면 null)를 돌려준다 */
function useSpanAsk() {
  const p = usePalette()
  const [q, setQ] = useState<{ action: 'edit' | 'delete'; choices: Span[] } | null>(null)
  const resolver = useRef<((s: Span | null) => void) | null>(null)
  const ask = (action: 'edit' | 'delete') => new Promise<Span | null>((resolve) => { resolver.current = resolve; setQ({ action, choices: spanChoices(Dev.PF, action) }) })
  const done = (s: Span | null) => { setQ(null); resolver.current?.(s); resolver.current = null }
  const element = (
    <Modal visible={!!q} transparent animationType="fade" onRequestClose={() => done(null)}>
      <Pressable style={s.dim} onPress={() => done(null)} accessibilityLabel="취소">
        <Pressable style={[s.card, { backgroundColor: p.cardBg }]} onPress={() => {}}>
          <Text style={[FONT.nav, { color: p.textPrimary, textAlign: 'center' }]}>{q?.action === 'delete' ? '반복 일정 삭제' : '반복 일정 편집'}</Text>
          <Text style={[FONT.sub, { color: p.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 14 }]}>
            {q?.action === 'delete' ? '반복 일정을 지우고 있어요. 지울 범위를 골라 주세요.' : '반복 일정을 바꾸고 있어요. 바꿀 범위를 골라 주세요.'}
            {q?.action === 'edit' && Dev.PF === 'android' ? ' 이 휴대폰에서는 모든 회차를 함께 바꿀 수 있어요.' : ''}
          </Text>
          {q?.choices.map((c) => (
            <Pressable key={c} accessibilityRole="button" onPress={() => done(c)} style={({ pressed }) => [s.btn, { backgroundColor: pressed ? p.bgSelected : p.accentSubtle }]}>
              <Text style={[FONT.bodyStrong, { color: q.action === 'delete' ? p.danger : p.accent }]}>{SPAN_LABEL[c]}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => done(null)} style={s.cancel}>
            <Text style={[FONT.body, { color: p.textSecondary }]}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
  return { ask, element }
}

const changesTime = (x: DevPatch) => x.start_at !== undefined || x.end_at !== undefined || x.is_all_day !== undefined
/** 시각 칸을 OS 입력으로(바뀐 것만) */
function inputOf(ref: DeviceRef, x: DevPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (x.title !== undefined) out.title = x.title.trim() || ref.ev.title || ''
  if (x.notes !== undefined) out.notes = x.notes ?? ''
  if (x.location !== undefined) out.location = x.location ?? ''
  if (changesTime(x)) Object.assign(out, spanToDevice({ start_at: x.start_at ?? ref.start_at, end_at: x.end_at ?? ref.end_at, is_all_day: x.is_all_day ?? ref.is_all_day }, Dev.PF, Dev.deviceTimeZone()))
  return out
}
const toMs = (v: string | Date) => (v instanceof Date ? v : new Date(v)).getTime()

export function useDeviceActions() {
  const router = useRouter()
  const toast = useToast()
  const span = useSpanAsk()

  /** 고치기·옮기기(§5.4). 반복이면 범위를 묻는다. 돌려주는 값: 썼나 */
  const save = async (key: string, x: DevPatch, opts: { toast?: string } = {}): Promise<boolean> => {
    const ref = deviceRef(key)
    if (!ref || !ref.writable) return false
    const id = ref.ev.id
    try {
      if (!(await Dev.getEvent(id, ref.recurring ? ref.ev.startDate : undefined))) { toast.show(GONE); bumpDeviceCal(); return false }
      if (!ref.recurring) {
        const before = inputOf(ref, { title: ref.ev.title ?? '', notes: ref.ev.notes ?? null, location: ref.ev.location ?? null, start_at: ref.start_at, end_at: ref.end_at, is_all_day: ref.is_all_day })
        await Dev.updateEvent(id, inputOf(ref, x))
        bumpDeviceCal()
        if (opts.toast) toast.show(opts.toast, { undo: async () => { try { await Dev.updateEvent(id, before) } catch { toast.show(SAVE_FAIL) } bumpDeviceCal() } })
        return true
      }
      const chosen = await span.ask('edit')
      if (!chosen) return false
      if (chosen === 'all') {
        const first = await Dev.getEvent(id)
        if (!first) { toast.show(GONE); bumpDeviceCal(); return false }
        const input: Record<string, unknown> = inputOf(ref, { ...x, start_at: undefined, end_at: undefined, is_all_day: undefined })
        if (changesTime(x)) {
          // 첫 회차를 같은 만큼 옮긴다(이 회차의 새 시각 − 이 회차의 원래 시각)
          const now = spanToDevice({ start_at: x.start_at ?? ref.start_at, end_at: x.end_at ?? ref.end_at, is_all_day: x.is_all_day ?? ref.is_all_day }, Dev.PF, Dev.deviceTimeZone())
          const d0 = now.startDate.getTime() - toMs(ref.ev.startDate)
          const len = now.endDate.getTime() - now.startDate.getTime()
          const s0 = new Date(toMs(first.startDate) + d0)
          Object.assign(input, { startDate: s0, endDate: new Date(s0.getTime() + len), allDay: now.allDay, timeZone: now.timeZone })
          if (first.recurrenceRule) input.recurrenceRule = first.recurrenceRule // Android: 반복 일정은 길이로 저장돼야 한다
        }
        await Dev.updateEvent(id, input, { span: 'all' })
      } else {
        await Dev.updateEvent(id, inputOf(ref, x), { span: chosen, instanceStart: ref.ev.startDate })
      }
      bumpDeviceCal()
      if (opts.toast) toast.show(opts.toast)
      return true
    } catch (e) {
      console.warn('[device-cal] 쓰기 실패:', e)
      toast.show(SAVE_FAIL)
      bumpDeviceCal()
      return false
    }
  }

  const remove = async (key: string): Promise<boolean> => {
    const ref = deviceRef(key)
    if (!ref || !ref.writable) return false
    const id = ref.ev.id
    try {
      if (!ref.recurring) {
        const again = { title: ref.ev.title ?? '', notes: ref.ev.notes ?? '', location: ref.ev.location ?? '', ...spanToDevice(ref, Dev.PF, Dev.deviceTimeZone()) }
        await Dev.deleteEvent(id)
        bumpDeviceCal()
        toast.show('일정을 삭제했어요', { duration: 5000, undo: async () => { try { await Dev.createEvent(ref.cal.id, again) } catch { toast.show(SAVE_FAIL) } bumpDeviceCal() } })
        return true
      }
      const chosen = await span.ask('delete')
      if (!chosen) return false
      await Dev.deleteEvent(id, chosen === 'all' ? { span: 'all' } : { span: chosen, instanceStart: ref.ev.startDate })
      bumpDeviceCal()
      toast.show('일정을 삭제했어요')
      return true
    } catch (e) {
      console.warn('[device-cal] 삭제 실패:', e)
      toast.show(SAVE_FAIL)
      bumpDeviceCal()
      return false
    }
  }

  return {
    element: span.element,
    open: (key: string) => router.push({ pathname: '/device-event', params: { key: key.replace(/^ev:/, '') } }),
    openInApp: (key: string) => { const ref = deviceRef(key); if (ref) void Dev.openInCalendarApp(ref.ev.id, ref.recurring ? ref.ev.startDate : undefined) },
    save,
    remove
  }
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: 320, maxWidth: '100%', borderRadius: 16, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 8 },
  btn: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center' }
})
