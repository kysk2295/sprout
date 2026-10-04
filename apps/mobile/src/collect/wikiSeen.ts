// 위키 "본 버전"(기기·계정별, 데스크톱 localStorage 'sprout.wiki.seen'과 같은 뜻): 목록의 새로 바뀐 점, 페이지 띠 기준.
// 이 기기에서 처음 위키를 열면 지금 버전을 모두 본 것으로 둔다(첫 화면이 점투성이가 되지 않게).
import { useSyncExternalStore } from 'react'
import { currentUserId } from '../data/auth'
import { readJson, writeJson } from './localStore'

type Seen = Record<string, number>
const key = () => `sprout.wiki.seen.${currentUserId()}`
let cache: { account: string; seen: Seen | null } | null = null
const listeners = new Set<() => void>()
function load() {
  const account = currentUserId()
  if (!cache || cache.account !== account) cache = { account, seen: readJson<Seen | null>(key(), null) }
  return cache
}
export function seenVersions(): Seen | null { return load().seen }
export function markSeen(id: string, version: number) {
  const c = load()
  if ((c.seen?.[id] ?? 0) >= version) return
  c.seen = { ...(c.seen ?? {}), [id]: version }
  writeJson(key(), c.seen)
  listeners.forEach((l) => l())
}
/** 처음이면 지금 버전들로 채운다 */
export function seedSeen(topics: { id: string; version: number }[]) {
  const c = load()
  if (c.seen || !topics.length) return
  c.seen = Object.fromEntries(topics.map((t) => [t.id, t.version]))
  writeJson(key(), c.seen)
  listeners.forEach((l) => l())
}
export function useSeen(): Seen | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, seenVersions)
}
