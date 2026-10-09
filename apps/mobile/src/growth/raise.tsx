// 43 캐릭터 키우기(휴대폰) — 읽기(입힌 모습·받은 옷·트로피)와 쓰기(해금·모습 저장·본 것 표시). 규칙·문은 공용 @sprout/schema/wardrobe · raiseCore.
// RaiseRoot(앱 뿌리에서 한 번): 옛 종 id 옮기기 · 해금 판정(앱 열 때·XP·할 일이 바뀔 때) · CharacterWearProvider(모든 그림에 입은 옷).
// 서버가 아직 새 칸·표를 몰라도(배포 전) 읽기는 비어 있을 뿐 화면은 그대로다.
import { normalizeSpecies, progressFromEvents, type Species } from '@sprout/schema/growth'
import { CHARACTER_ITEMS_SQL, planLegacySpeciesFix, planMarkSeen, planSaveLook, planUnlocks, type CharacterItem } from '@sprout/schema/raiseCore'
import { ownedItems, parseLook, raiseStateFrom, wornEquip, type CharacterItemRow, type Look } from '@sprout/schema/wardrobe'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { currentUserId } from '../data/auth'
import { coreDb, db, run } from '../data/db'
import { taskDone } from '../data/events'
import { useLiveQuery, useSyncFlags } from '../data/rows'
import { CharacterWearProvider } from './art/CharacterArt'

const RAISE_CHARACTER_SQL = 'SELECT id, name, species, look_json FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'
type RaiseCharacter = { id: string; name: string | null; species: string | null; look_json: string | null }
type XpLite = { kind: string; amount: number; day: string; created_at: string }

/** 새로 받은 옷·트로피(새 옷 카드·트로피 말풍선). 성장 탭이 보이면 가져가고, 안 보이면 쌓아 둔다 */
type Fresh = CharacterItemRow
let pending: Fresh[] = []
const freshListeners = new Set<() => void>()
export const takeFresh = (): Fresh[] => { const out = pending; pending = []; return out }
export const peekFresh = () => pending.length
export const onFresh = (l: () => void) => { freshListeners.add(l); return () => { freshListeners.delete(l) } }
const pushFresh = (rows: Fresh[]) => { if (!rows.length) return; pending = [...pending, ...rows]; freshListeners.forEach((l) => l()) }

/** 내 캐릭터의 키우기 상태(성장 탭·꾸미기·도감) */
export function useRaise() {
  const ch = useLiveQuery<RaiseCharacter>(RAISE_CHARACTER_SQL).data[0]
  const xp = useLiveQuery<XpLite>('SELECT kind, amount, day, created_at FROM xp_events').data
  const items = useLiveQuery<CharacterItem>(CHARACTER_ITEMS_SQL, [ch?.id ?? '']).data
  return useMemo(() => {
    const species: Species | null = normalizeSpecies(ch?.species)
    const progress = progressFromEvents(xp)
    const state = raiseStateFrom(progress.level, xp)
    const look: Look = parseLook(ch?.look_json)
    const owned = ownedItems(items, state)
    const worn = wornEquip(look, owned)
    const trophies = items.filter((r) => r.kind === 'trophy')
    const fresh = new Set(items.filter((r) => r.kind === 'item' && !r.seen_at).map((r) => r.item_id))
    return { character: ch, species, progress, state, look, owned, worn, items, trophies, fresh }
  }, [ch, xp, items])
}
export type Raise = ReturnType<typeof useRaise>

// ── 쓰기 ──
const env = () => ({ owner: currentUserId() })
export const saveLook = (characterId: string, look: Look) => run(planSaveLook(characterId, look, env()))
export const markSeen = (characterId: string, itemIds: string[]) => (itemIds.length ? run(planMarkSeen(itemIds.map((i) => `item:${characterId}:${i}`), env())) : Promise.resolve())
let unlocking: Promise<void> | null = null
/** 새로 열린 것을 넣는다(한 번에 하나) */
export function checkUnlocks(): Promise<void> {
  if (unlocking) return unlocking
  unlocking = (async () => {
    try {
      const c = await coreDb.get<{ id: string; species: string | null }>(RAISE_CHARACTER_SQL)
      if (!c) return
      const { stmts, fresh } = await planUnlocks(coreDb, c.id, env())
      if (!stmts.length) return
      await run(stmts)
      pushFresh(fresh)
    } catch (e) {
      console.warn('[raise] unlocks failed:', e)
    } finally { unlocking = null }
  })()
  return unlocking
}

/** 앱 뿌리: 입은 모습을 모든 그림에 주고, 해금 판정을 돌린다 */
export function RaiseRoot({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return signedIn ? <RaiseOn>{children}</RaiseOn> : <>{children}</>
}
function RaiseOn({ children }: { children: ReactNode }) {
  const r = useRaise()
  const flags = useSyncFlags()
  // 서버에 못 붙어도(오프라인·배포 전) 10초 뒤에는 이 기기 원장으로 판정한다
  const [late, setLate] = useState(false)
  useEffect(() => { const t = setTimeout(() => setLate(true), 10_000); return () => clearTimeout(t) }, [])
  const hasSynced = flags.hasSynced || late
  // 옛 종 id → 새 종(서버 마이그레이션 전에도) — 첫 동기화 뒤 한 번
  const fixed = useRef(false)
  useEffect(() => {
    if (!hasSynced || fixed.current) return
    fixed.current = true
    void planLegacySpeciesFix(coreDb, env()).then((s) => (s.length ? run(s) : undefined)).catch((e) => console.warn('[raise] species fix failed:', e))
  }, [hasSynced])
  // 해금: 첫 동기화 뒤(내려받는 XP를 새로 받은 것으로 착각하지 않게) · XP가 바뀔 때 · 할 일을 끝낼 때(프로젝트 끝)
  const xpN = r.state.days * 1000 + r.progress.level * 10 + r.state.reviews
  useEffect(() => {
    if (!hasSynced || !r.character?.id) return
    const t = setTimeout(() => void checkUnlocks(), 600)
    return () => clearTimeout(t)
  }, [hasSynced, r.character?.id, xpN])
  useEffect(() => {
    if (!hasSynced) return
    let t: ReturnType<typeof setTimeout> | undefined
    const off = taskDone.on(() => { clearTimeout(t); t = setTimeout(() => void checkUnlocks(), 1200) })
    const offDb = db.onChange({ onChange: () => { clearTimeout(t); t = setTimeout(() => void checkUnlocks(), 1500) } }, { tables: ['tags'], throttleMs: 2000 })
    return () => { off(); offDb(); clearTimeout(t) }
  }, [hasSynced])
  const value = useMemo(() => ({ species: r.species, level: r.progress.level, wear: { path: r.look.path, eq: r.worn, seed: r.look.seed } }), [r.species, r.progress.level, r.look.path, r.worn, r.look.seed])
  return <CharacterWearProvider value={value}>{children}</CharacterWearProvider>
}
