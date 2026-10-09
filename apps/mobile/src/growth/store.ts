// 기기에만 두는 성장 값(동기화하지 않는다 — 10 §3.2.12, 23 §5 "기기에만"):
// 마지막으로 본 레벨·그때 시각(레벨업 화면을 한 번만), 마지막으로 성장 탭을 본 때(방울·차오르기 시작점), 하루 첫 인사,
// 치운 장식, 움직임 줄이기, 첫 실행 조사 안내.
// 저장은 이미 있는 expo-secure-store(새 네이티브 의존성 없음). 읽기는 메모리 사본을 먼저 채워 동기적으로 쓴다.
import * as SecureStore from 'expo-secure-store'

const cache = new Map<string, string | null>()
const listeners = new Set<() => void>()
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_')

/** 성장 탭이 열릴 때 한 번: 쓰는 키를 메모리로 읽어 둔다 */
export async function preload(keys: string[]): Promise<void> {
  await Promise.all(keys.filter((k) => !cache.has(k)).map(async (k) => {
    try { cache.set(k, await SecureStore.getItemAsync(safe(k))) } catch { cache.set(k, null) }
  }))
}
export const read = (k: string): string | null => cache.get(k) ?? null
export function write(k: string, v: string | null) {
  cache.set(k, v)
  listeners.forEach((l) => l())
  void (v === null ? SecureStore.deleteItemAsync(safe(k)) : SecureStore.setItemAsync(safe(k), v)).catch(() => { /* 저장 꺼짐 — 이번 실행 동안은 메모리 값 */ })
}
export const onChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const KEY = {
  seenLevel: (cid: string) => `sprout.seenLevel.${cid}`,
  seenLevelAt: (cid: string) => `sprout.seenLevel.${cid}.at`,
  seenAt: (cid: string) => `sprout.growthSeenAt.${cid}`,
  room: (cid: string) => `sprout.room.${cid}`,
  greeted: 'sprout.greetedDay',
  motion: 'sprout.growthMotion',
  /** 첫 실행 조사 권하기 — 계정마다(같은 휴대폰에 새 계정이 들어와도 한 번 권한다) */
  surveyOffered: (uid: string) => `sprout.surveyOffered.${uid}`,
  /** 43 §4.2 하루 장면(하루 한 번) · 하루 다 함 — 캐릭터마다 */
  dayMoment: (day: string, cid = '') => `sprout.dayMoment.${cid ? `${cid}.` : ''}${day}`,
  dayDone: (day: string, cid = '') => `sprout.dayDone.${cid ? `${cid}.` : ''}${day}`,
  /** 43 §10 옷장 마지막 탭 */
  wardTab: 'sprout.wardTab'
}
export const keysFor = (cid: string | undefined, day?: string, uid?: string | null) => [KEY.greeted, KEY.motion, KEY.wardTab, ...(uid ? [KEY.surveyOffered(uid)] : []), ...(day ? [KEY.dayMoment(day, cid), KEY.dayDone(day, cid)] : []), ...(cid ? [KEY.seenLevel(cid), KEY.seenLevelAt(cid), KEY.seenAt(cid), KEY.room(cid)] : [])]

export function readRoomOff(cid: string): Set<string> {
  try { return new Set(JSON.parse(read(KEY.room(cid)) ?? '[]') as string[]) } catch { return new Set() }
}
export const writeRoomOff = (cid: string, off: Set<string>) => write(KEY.room(cid), JSON.stringify([...off]))
/** 하루 첫 인사를 했는지(했으면 false), 안 했으면 표시하고 true */
export function takeGreeting(day: string): boolean {
  if (read(KEY.greeted) === day) return false
  write(KEY.greeted, day)
  return true
}
