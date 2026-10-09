// 43 캐릭터 키우기 — 데스크톱 데이터: 입힌 모습(characters.look_json) · 받은 옷·트로피(character_items) · 해금 실행.
// 규칙은 모두 공용(@sprout/schema/wardrobe · raiseCore). 여기는 읽기 훅과 실행만 — 휴대폰과 같은 문을 쓴다.
import { useEffect, useMemo, useRef } from 'react'
import { LOCAL_OWNER } from '@sprout/schema'
import { normalizeSpecies, type Species } from '@sprout/schema/growth'
import {
  CHARACTER_ITEMS_SQL, loadProjectDeadlineToday, planLegacySpeciesFix, planMarkSeen, planSaveLook, planUnlocks, type CharacterItem
} from '@sprout/schema/raiseCore'
import { ownedItems, parseLook, raiseStateFrom, wornEquip, type CharacterItemRow, type Equip, type Look, type RaiseState } from '@sprout/schema/wardrobe'
import { getDb } from './db'
import { ensureCharacter, useGrowth } from './growth'
import { run } from './mutations'
import { useQuery } from './useQuery'

const env = () => ({ owner: LOCAL_OWNER })
/** 새로 받은 옷·트로피(무대가 카드·말풍선으로 보인다) */
export const RAISE_FRESH = 'sprout:raise-fresh'
/** 꾸미기·도감 패널 열기(⋯ 메뉴 `도감`) */
export const RAISE_PANEL = 'sprout:raise-panel'

export type Raise = {
  species: Species | null
  characterId: string | null
  level: number
  stage: number
  look: Look
  /** 받지 않은 옷은 뺀 실제 입은 것 */
  worn: Equip
  owned: Set<string>
  items: CharacterItem[]
  trophies: CharacterItem[]
  state: RaiseState
  /** 새로 받음 점(옷만, seen_at 비어 있음) */
  fresh: Set<string>
}

/** 내 캐릭터의 모습·받은 것 */
export function useRaise(): Raise {
  const { character, progress, events } = useGrowth()
  const cid = character?.id ?? ''
  const rows = useQuery<CharacterItem>(CHARACTER_ITEMS_SQL, [cid])
  return useMemo(() => {
    const items = rows ?? []
    const state = raiseStateFrom(progress.level, events)
    const owned = ownedItems(items, state)
    const look = parseLook(character?.look_json)
    return {
      species: normalizeSpecies(character?.species), characterId: character?.id ?? null, level: progress.level, stage: progress.stage,
      look, worn: wornEquip(look, owned), owned, items,
      trophies: items.filter((r) => r.kind === 'trophy'),
      state: { ...state, projects: items.filter((r) => r.kind === 'trophy' && r.source === 'project').map((r) => ({ id: r.ref_id ?? r.id, title: r.title, day: r.earned_at })) },
      fresh: new Set(items.filter((r) => r.kind === 'item' && !r.seen_at).map((r) => r.item_id))
    }
  }, [rows, events, progress.level, progress.stage, character?.id, character?.species, character?.look_json])
}

// ── 쓰기 ──
export async function saveLook(next: Look) {
  const c = await ensureCharacter()
  await run(...planSaveLook(c.id, next, env()))
}
export async function markItemsSeen(characterId: string, itemIds: string[]) {
  if (!itemIds.length) return
  await run(...planMarkSeen(itemIds.map((i) => `item:${characterId}:${i}`), env()))
}
export const markRowsSeen = (rowIds: string[]) => (rowIds.length ? run(...planMarkSeen(rowIds, env())) : Promise.resolve())
export const isProjectDeadlineToday = async (today: string) => loadProjectDeadlineToday(await getDb(), today)

/** 해금을 돌려 새 것만 넣는다. 새로 받은 행을 돌려준다 */
let busy: Promise<CharacterItemRow[]> | null = null
export function runUnlocks(): Promise<CharacterItemRow[]> {
  busy ??= (async () => {
    try {
      const db = await getDb()
      const c = await ensureCharacter()
      if (!c.species) return []
      const { stmts, fresh } = await planUnlocks(db, c.id, env())
      if (stmts.length) await run(...stmts)
      if (fresh.length) window.dispatchEvent(new CustomEvent(RAISE_FRESH, { detail: fresh }))
      return fresh
    } catch (e) { console.warn('[raise] 해금 실패', e); return [] } finally { busy = null }
  })()
  return busy
}

/** 앱 맨 위에서 한 번: 옛 종 id 옮기기 → 해금(열 때 · XP가 들 때 · 할 일·프로젝트가 바뀔 때) */
export function useRaiseRunner() {
  const done = useQuery<{ n: number; m: string | null }>('SELECT count(*) n, max(modified_at) m FROM tasks WHERE status = 1')?.[0]
  const fixed = useRef(false)
  useEffect(() => {
    if (fixed.current) return
    fixed.current = true
    void (async () => {
      try { const stmts = await planLegacySpeciesFix(await getDb(), env()); if (stmts.length) await run(...stmts) } catch (e) { console.warn('[raise] 종 옮기기 실패', e) }
      await runUnlocks()
    })()
  }, [])
  useEffect(() => {
    const on = () => { window.setTimeout(() => void runUnlocks(), 300) }
    window.addEventListener('sprout:xp', on)
    return () => window.removeEventListener('sprout:xp', on)
  }, [])
  const key = `${done?.n ?? 0}|${done?.m ?? ''}`
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = window.setTimeout(() => void runUnlocks(), 800)
    return () => window.clearTimeout(t)
  }, [key])
}
