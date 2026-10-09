// 49 §7 도감 칸(4종 × 5단계 = 20). 본 모습 계산은 예전 도감 그대로: 내 종에서 지금 단계까지(갈래는 지금 고른 길).
import type { Species } from '@sprout/schema/growth'

export const DEX_SPECIES: Species[] = ['snail', 'frog', 'bee', 'worm']
export const DEX_TOTAL = DEX_SPECIES.length * 5

/** 칸 순서: 내 종을 맨 앞에 */
export function dexCells(mine: Species | null): { sp: Species; st: number }[] {
  const order = mine ? [mine, ...DEX_SPECIES.filter((x) => x !== mine)] : DEX_SPECIES
  return order.flatMap((sp) => [1, 2, 3, 4, 5].map((st) => ({ sp, st })))
}
export const dexSeen = (mine: Species | null, stage: number, sp: Species, st: number) => !!mine && sp === mine && st <= stage
export const dexCount = (mine: Species | null, stage: number) => (mine ? Math.min(5, Math.max(0, stage)) : 0)
