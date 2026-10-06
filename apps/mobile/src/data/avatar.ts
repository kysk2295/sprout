// 35 프로필 이미지 — 동기화되는 user_prefs.avatar_json(데스크톱 레일·설정과 같은 값). 검사·결정은 공용 @sprout/schema/avatar.
// 따라가기 = 성장 캐릭터 종 + XP 원장으로 계산한 단계.
import { useLiveQuery } from './rows'
import { parseAvatar, resolveAvatar, serializeAvatar, type AvatarPref, type ResolvedAvatar } from '@sprout/schema/avatar'
import { progressFromEvents, type Species } from '@sprout/schema/growth'
import { useMemo } from 'react'
import { db, run } from './db'
import { COUNT_THROTTLE, useRows } from './rows'
import { insert, update } from './tasks'

const SQL = 'SELECT id, avatar_json FROM user_prefs ORDER BY created_at LIMIT 1'
type Row = { id: string; avatar_json: string | null }

export function useAvatar(): { pref: AvatarPref | null; resolved: ResolvedAvatar; growth: { species: Species | null; stage: number } } {
  const raw = useLiveQuery<Row>(SQL).data[0]?.avatar_json ?? null
  const species = useLiveQuery<{ species: Species | null }>('SELECT species FROM characters WHERE species IS NOT NULL LIMIT 1').data[0]?.species ?? null
  const xp = useRows<{ amount: number; created_at: string }>('SELECT amount, created_at FROM xp_events', [], COUNT_THROTTLE).data
  const stage = useMemo(() => progressFromEvents(xp).stage, [xp])
  const pref = useMemo(() => parseAvatar(raw), [raw])
  const growth = useMemo(() => ({ species, stage }), [species, stage])
  return { pref, resolved: useMemo(() => resolveAvatar(pref, growth), [pref, growth]), growth }
}

/** 고르는 즉시 저장 — 지금 DB 값에 적용, 연달아 눌러도 순서대로(데스크톱 data/avatar.ts와 같음) */
let queue: Promise<void> = Promise.resolve()
export function saveAvatar(next: AvatarPref | null | ((cur: AvatarPref | null) => AvatarPref | null)): Promise<void> {
  queue = queue.catch(() => {}).then(async () => {
    const row = await db.getOptional<Row>(SQL)
    const value = typeof next === 'function' ? next(parseAvatar(row?.avatar_json)) : next
    const avatar_json = serializeAvatar(value)
    await run([row ? update('user_prefs', row.id, { avatar_json }) : insert('user_prefs', { id: crypto.randomUUID(), avatar_json })])
  })
  return queue
}
