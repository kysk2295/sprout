// 42 §5.2 · 43 §5 캐릭터 그림 — 공용 그림 데이터(@sprout/schema/characterArt, 시안 kkumteul-art.js v3)를 그대로 그린다.
// 휴대폰(src/growth/art/CharacterArt.tsx)·맥 위젯 PNG(main/widgetArt.ts)·사이트 SVG가 같은 글을 그린다.
// 입힌 옷: wear를 넘기지 않으면 CharacterWearProvider(내 캐릭터의 모습·레벨)를 쓴다 — 같은 종·같은 단계일 때만(진화 길의 다른 단계엔 안 입힌다).
// 크기: 단계와 상관없이 늘 같은 크기로 상자를 채운다(2026-10-09 사용자 결정 "항상 같은 크기" — characterArt FILL). fit 인자는 이제 결과가 같다.
import { createContext, memo, useContext, useId, useMemo, type ReactNode } from 'react'
import { art, seedArt, type ArtMood, type Crop, type Detail } from '@sprout/schema/characterArt'
import { normalizeSpecies, stageOf, type Species } from '@sprout/schema/growth'
import type { Equip, Path } from '@sprout/schema/wardrobe'
import './character.css'

/** 얼굴(10 §3.2.3 · 40 §6 · 43 만지기): default · smile · happy · content · eat · sleepy · think · puzzled · pet · giggle · wow */
export type CharacterMood = ArtMood
/** 입힌 모습: 레벨(새싹 잎눈·무늬 점) · 갈래 · 옷 */
export type CharacterWear = { lv?: number; path?: Path; eq?: Partial<Equip> }

type WearCtx = { species: Species | null; level: number; wear: CharacterWear } | null
const WearContext = createContext<WearCtx>(null)
/** 내 캐릭터의 모습을 아래 모든 CharacterArt에 준다(App 맨 위에서 한 번) */
export function CharacterWearProvider({ value, children }: { value: WearCtx; children: ReactNode }) {
  return <WearContext.Provider value={value}>{children}</WearContext.Provider>
}
export const useCharacterWear = () => useContext(WearContext)

/** 40 §6 [호환] 작은 자리 viewBox — 이제 crop='bust'가 대신한다 */
export const tightViewBox = (_species: Species | null, _stage = 1) => '0 0 120 120'

export type CharacterArtProps = {
  species: Species | string | null
  stage?: number
  size?: number
  mood?: CharacterMood
  /** 눈동자 방향(−1~1) */
  look?: { x: number; y: number }
  /** 눈 감기 한 프레임(motion='still'일 때) */
  blink?: boolean
  /** 씨앗 금(0~3, 종을 모를 때) */
  cracks?: number
  /** [호환] 작은 자리 = crop 'bust' */
  tight?: boolean
  /** idle = 부품 대기 동작(42 §4.1) — 반복해서 움직이는 캐릭터는 화면에 하나 */
  motion?: 'still' | 'idle'
  detail?: Detail
  crop?: Crop
  /** 한 색 실루엣(진화 연출 — true = 흰색) */
  silhouette?: boolean | string
  /** 잠긴 칸 실루엣(도감·진화 길) */
  lock?: boolean
  /** 단계 배율을 끄고 상자를 채운다. 기본 true(무대·도감·진화는 false) */
  fit?: boolean
  /** 입힌 모습(없으면 Provider 값) — null이면 아무것도 입히지 않는다 */
  wear?: CharacterWear | null
  /** 전설 배경(원판·장면 조각) 끄기 — 기본: 96 미만이면 끈다(42 결정 ③: 무대·AI 비서 빈 대화만) */
  noAura?: boolean
  wave?: boolean
  calm?: boolean
  className?: string
  label?: string
}

export const CharacterArt = memo(function CharacterArt({ species, stage = 1, size = 120, mood = 'default', look, blink, cracks, tight, motion = 'still', detail = 'auto', crop, silhouette, lock, fit = true, wear, noAura, wave, calm, className, label }: CharacterArtProps) {
  const uid = useId()
  const ctx = useContext(WearContext)
  const sp = normalizeSpecies(species ?? null)
  const st = Math.min(5, Math.max(1, stage))
  const w = wear === null ? undefined : wear ?? (ctx && sp && ctx.species === sp && stageOf(ctx.level) === st ? { ...ctx.wear, lv: ctx.wear.lv ?? ctx.level } : undefined)
  const html = useMemo(() => {
    if (!sp) return seedArt({ size, cracks, uid, live: motion === 'idle', crop: tight ? 'bust' : crop })
    return art(sp, st, {
      size, mood, look, blink, detail, crop: tight ? 'bust' : crop, sil: silhouette, lock, fit, noAura: noAura ?? size < 96, wave, calm, uid, label,
      live: motion === 'idle', lv: w?.lv, path: w?.path, eq: w?.eq
    })
    // w는 매번 새 객체라 값으로 비교한다
  }, [sp, st, size, mood, look?.x, look?.y, blink, detail, crop, tight, silhouette, lock, fit, noAura, wave, calm, uid, label, motion, cracks, w?.lv, w?.path, w?.eq?.hat, w?.eq?.neck, w?.eq?.hand, w?.eq?.back])
  return <span className={`character${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: html }} />
})
