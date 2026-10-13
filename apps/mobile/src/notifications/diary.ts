// 28 §9 A 저녁 일기 알림: 캐릭터가 묻는 한 줄 + 기분 단추 2개 + 바로 답장(앱을 열지 않음).
// - 문구는 끝낸 할 일 **수**만(제목·일기 글은 잠금 화면에 띄우지 않는다). 할 일이 바뀌면 다시 계산(index.ts rescheduleOnce 끝에서)
// - 기본 21:00(기기 설정 sprout.diary.nudge = 'off' | 'HH:MM'). 그날 이미 일기를 남겼으면 다음 날로. 3일 연속 그냥 지나가면 주 2번(수·일)으로 줄인다
// - 응답: 기분 단추 = 그날 기분만 저장 · 답장 = 대화 첫 줄(질문 + 내 말)로 남김 → 다음에 일기를 열면 캐릭터가 이어서 답한다(Conversation)
//   iOS는 앱이 꺼져 있으면 JS를 깨우지 않을 수 있다 → 다음 실행 때 마지막 응답으로 반영(index.ts와 같은 길)
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { CHANNELS } from '@sprout/schema/notify'
import { addDays } from '@sprout/schema/time'
import { db } from '../data/db'
import { dayKey } from '../lib/dates'
import { dayRange, isWritten, type DiaryEntry } from '../diary/logic'
import { addMine, addScripted, saveEntry } from '../diary/data'

export const DIARY_CATEGORY = 'sprout-diary'
export const DIARY_REPLY = 'diary-reply'
export const DIARY_GOOD = 'diary-mood-4'
export const DIARY_HARD = 'diary-mood-1'
const ID = 'diary-nudge'
const ASKED = 'sprout.diary.nudge.asked'
const K = { time: 'sprout.diary.nudge', ignored: 'sprout.diary.nudge.ignored', last: 'sprout.diary.nudge.last' }

export async function configureDiaryCategory() {
  await Notifications.setNotificationCategoryAsync(DIARY_CATEGORY, [
    { identifier: DIARY_REPLY, buttonTitle: '답장', textInput: { submitButtonTitle: '보내기', placeholder: '한 줄도 괜찮아' }, options: { opensAppToForeground: false } },
    { identifier: DIARY_GOOD, buttonTitle: '😊 좋았어', options: { opensAppToForeground: false } },
    { identifier: DIARY_HARD, buttonTitle: '😣 힘들었어', options: { opensAppToForeground: false } }
  ])
}

/** 기기 설정: null = 끔, 'HH:MM' = 시각(기본 21:00) */
export async function getDiaryNudge(): Promise<string | null> {
  const v = await SecureStore.getItemAsync(K.time).catch(() => null)
  return v === 'off' ? null : v && /^\d{2}:\d{2}$/.test(v) ? v : '21:00'
}
export async function setDiaryNudge(v: string | null) {
  await SecureStore.setItemAsync(K.time, v ?? 'off').catch(() => {})
  await scheduleDiaryNudge()
}

const written = async (date: string) => {
  const e = await db.getOptional<DiaryEntry>('SELECT * FROM diary_entries WHERE date = ? ORDER BY created_at LIMIT 1', [date]).catch(() => null)
  return !!e && (isWritten(e) || !!e.mood)
}
/** 다음 알림 날: 오늘 시각이 안 지났고 아직 안 썼으면 오늘, 아니면 내일부터. 쉬는 중(3일 무시)이면 수·일만 */
async function nextDay(time: string, quiet: boolean): Promise<{ date: string; at: Date } | null> {
  const [h, m] = time.split(':').map(Number)
  for (let i = 0; i < 8; i++) {
    const date = dayKey(i)
    const at = new Date(`${date}T00:00:00`)
    at.setHours(h, m, 0, 0)
    if (at.getTime() <= Date.now() + 60_000) continue
    if (i === 0 && (await written(date))) continue
    if (quiet && ![0, 3].includes(at.getDay())) continue
    return { date, at }
  }
  return null
}

/** 다시 계산(앱 시작·앞으로 올 때·할 일/일기가 바뀔 때) — 알림 하나만 예약해 둔다 */
export async function scheduleDiaryNudge() {
  try {
    await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {})
    const time = await getDiaryNudge()
    if (!time) return
    // 지난 알림 날에 일기를 안 썼으면 무시 1회, 썼으면 0으로
    const last = await SecureStore.getItemAsync(K.last).catch(() => null)
    let ignored = Number((await SecureStore.getItemAsync(K.ignored).catch(() => null)) ?? 0)
    if (last && last < dayKey()) {
      ignored = (await written(last)) ? 0 : ignored + 1
      await SecureStore.setItemAsync(K.ignored, String(ignored)).catch(() => {})
      await SecureStore.deleteItemAsync(K.last).catch(() => {})
    }
    const next = await nextDay(time, ignored >= 3)
    if (!next) return
    const done = next.date === dayKey() ? await doneCount(next.date) : 0
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: await buddyName(),
        body: done ? `오늘 할 일 ${done}개나 끝냈네. 하루 어땠어?` : '오늘 하루 어땠어? 한 줄만 들려줘.',
        data: { diary: next.date, url: 'sprout://diary' },
        categoryIdentifier: DIARY_CATEGORY,
        sound: 'default'
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next.at, ...(Platform.OS === 'android' ? { channelId: CHANNELS.daily } : {}) }
    })
    await SecureStore.setItemAsync(K.last, next.date).catch(() => {})
  } catch (e) {
    console.warn('[diary-nudge] schedule failed', e)
  }
}
const doneCount = async (date: string) => {
  const [a, b] = dayRange(date)
  return (await db.getOptional<{ n: number }>('SELECT count(*) AS n FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ?', [a, b]).catch(() => null))?.n ?? 0
}
const buddyName = async () => (await db.getOptional<{ name: string | null }>('SELECT name FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1').catch(() => null))?.name?.trim() || '꿈틀'

/** 알림 응답(기분 단추·답장). 처리했으면 true. 누름(기본 동작)은 index.ts가 sprout://diary로 연다 */
export async function handleDiaryResponse(r: Notifications.NotificationResponse): Promise<boolean> {
  const data = r.notification.request.content.data as { diary?: string } | null
  const date = data?.diary
  if (!date || date > addDays(dayKey(), 1)) return false
  const id = r.actionIdentifier
  if (id === DIARY_GOOD || id === DIARY_HARD) {
    await saveEntry(date, { mood: id === DIARY_GOOD ? 4 : 1 })
  } else if (id === DIARY_REPLY && r.userText?.trim()) {
    // 대화 첫 줄: 캐릭터가 물은 말(정해진 말) + 내 답(AI 대화 행 — 다음에 열면 캐릭터가 이어서 답한다)
    await addScripted(date, [{ role: 'buddy', content: r.notification.request.content.body ?? '오늘 하루 어땠어?' }])
    await addMine(date, r.userText.trim())
  } else return false
  await Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {})
  void scheduleDiaryNudge()
  return true
}

/** 첫 일기를 남긴 뒤 한 번만 저녁 알림 권한을 묻는다(할 일 알림을 안 써서 권한이 없는 사람) */
export async function askDiaryNudgeOnce() {
  if ((await SecureStore.getItemAsync(ASKED).catch(() => null)) === 'on') return
  if (!(await getDiaryNudge())) return
  await SecureStore.setItemAsync(ASKED, 'on').catch(() => {})
  const { ensurePermission } = await import('./index')
  if (await ensurePermission({ diary: true })) void scheduleDiaryNudge()
}
