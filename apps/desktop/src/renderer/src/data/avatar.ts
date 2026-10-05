// 35 프로필 이미지 — user_prefs.avatar_json 읽기·쓰기(계정 단위, 동기화로 휴대폰과 같은 값).
// 검사·그릴 것 결정은 공용 @sprout/schema/avatar. 따라가기는 성장 캐릭터 종 + XP 원장으로 계산한 단계.
import { useMemo } from 'react'
import { parseAvatar, resolveAvatar, serializeAvatar, type AvatarPref, type ResolvedAvatar } from '@sprout/schema/avatar'
import { progressFromEvents, type Species } from '@sprout/schema/growth'
import { getDb } from './db'
import { insert, run, update, uuid } from './mutations'
import { useQuery } from './useQuery'

export function useAvatar(): { pref: AvatarPref | null; resolved: ResolvedAvatar; growth: { species: Species | null; stage: number } } {
  const row = useQuery<{ avatar_json: string | null }>('SELECT avatar_json FROM user_prefs ORDER BY created_at LIMIT 1')?.[0]
  const ch = useQuery<{ species: Species | null }>('SELECT species FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1')?.[0]
  const xp = useQuery<{ amount: number; created_at: string }>('SELECT amount, created_at FROM xp_events')
  const stage = useMemo(() => progressFromEvents(xp ?? []).stage, [xp])
  const pref = parseAvatar(row?.avatar_json)
  const growth = useMemo(() => ({ species: ch?.species ?? null, stage }), [ch?.species, stage])
  return { pref, resolved: resolveAvatar(pref, growth), growth }
}

/** 고르는 즉시 저장(35 §3.2). 지금 DB 값에 next를 적용한다(화면 값이 아직 안 읽혔거나 다른 기기가 방금 바꿔도 색이 날아가지 않게).
 * 다른 칸은 그대로, 행이 없으면 만든다(id는 uuid — notifyPrefs와 같은 규칙) */
let queue: Promise<void> = Promise.resolve()
export function saveAvatar(next: AvatarPref | null | ((cur: AvatarPref | null) => AvatarPref | null)): Promise<void> {
  // 빠르게 연달아 눌러도 앞 저장이 끝난 뒤 읽는다(색 → 칸을 바로 누르면 색이 날아가던 경합)
  queue = queue.catch(() => {}).then(() => writeAvatar(next))
  return queue
}
async function writeAvatar(next: AvatarPref | null | ((cur: AvatarPref | null) => AvatarPref | null)): Promise<void> {
  const db = await getDb()
  const row = await db.get<{ id: string; avatar_json: string | null }>('SELECT id, avatar_json FROM user_prefs ORDER BY created_at LIMIT 1')
  const value = typeof next === 'function' ? next(parseAvatar(row?.avatar_json)) : next
  const avatar_json = serializeAvatar(value)
  await run(row ? update('user_prefs', row.id, { avatar_json }) : insert('user_prefs', { id: uuid(), avatar_json }))
}
