// 49 캐릭터 v3(데스크톱) — 미리 구운 3D 스프라이트(packages/schema/art3d/*.webp)를 <img> 층으로 겹친다.
// 층 순서·이름·자르기는 공용 @sprout/schema/art3d(layers3d · cropBox) — 휴대폰 CharacterArt·위젯·사이트와 같은 그림.
// 움직임(39 §11 · 42 §4.1): 감싸개 transform(숨·깡충)과 얼굴 층 opacity(깜빡임)뿐. 반복해서 움직이는 캐릭터는 화면에 하나(motion='idle').
// 실루엣·잠김 = 같은 층 모양(CSS mask)에 한 색 — 따로 구운 그림·filter 없음(40 §7).
// 입힌 옷: wear를 넘기지 않으면 CharacterWearProvider(내 캐릭터의 모습·레벨)를 쓴다 — 같은 종·같은 단계일 때만.
import { createContext, memo, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { MASCOT, SEED_PX, cropBox, layers3d, mascotLayers, pickPx, seedCrackKey, seedTurnKey, type Box, type Crop, type Detail } from '@sprout/schema/characterArt'
import { normalizeSpecies, stageOf, type Species } from '@sprout/schema/growth'
import type { Equip, Path } from '@sprout/schema/wardrobe'
import { artUrl } from './art3dUrls'
import './character.css'

/** 얼굴: 옛 이름 11개도 받는다(공용 mood5가 5개로 — 49 결정 ④) */
export type CharacterMood = string
/** 입힌 모습: 레벨 · 갈래 · 옷 · 씨앗 껍질 */
export type CharacterWear = { lv?: number; path?: Path; eq?: Partial<Equip>; seed?: number }

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
  /** [호환] v3 얼굴은 눈동자가 따로 없다 */
  look?: { x: number; y: number }
  /** 눈 감기 한 프레임 */
  blink?: boolean
  /** 씨앗(종을 모를 때): 금 0~2 · 회전 컷 0~11 · 껍질 0~3 */
  cracks?: number
  turn?: number
  seed?: number
  /** [호환] 작은 자리 = crop 'bust' */
  tight?: boolean
  /** idle = 숨쉬기·깜빡임 — 반복해서 움직이는 캐릭터는 화면에 하나 */
  motion?: 'still' | 'idle'
  detail?: Detail
  crop?: Crop
  /** 한 색 실루엣(진화 연출 — true = 흰색) */
  silhouette?: boolean | string
  /** 잠긴 칸 실루엣(도감·진화 길) */
  lock?: boolean | string
  /** [호환] v3는 늘 같은 상자를 채운다 */
  fit?: boolean
  /** 입힌 모습(없으면 Provider 값) — null이면 아무것도 입히지 않는다 */
  wear?: CharacterWear | null
  noAura?: boolean
  wave?: boolean
  calm?: boolean
  className?: string
  label?: string
}

const LOCK = '#C9D0CB'

export const CharacterArt = memo(function CharacterArt({ species, stage = 1, size = 120, mood = 'default', blink, cracks, turn, seed, tight, motion = 'still', crop, silhouette, lock, wear, wave, calm, className, label }: CharacterArtProps) {
  const ctx = useContext(WearContext)
  const sp = normalizeSpecies(species ?? null)
  const st = Math.min(5, Math.max(1, stage))
  const w = wear === null ? undefined : wear ?? (ctx && sp && ctx.species === sp && stageOf(ctx.level) === st ? { ...ctx.wear, lv: ctx.wear.lv ?? ctx.level } : undefined)
  const seedNo = seed ?? w?.seed ?? ctx?.wear.seed ?? 0
  const cr = tight ? 'bust' : crop === 'bust' || (crop !== 'full' && size <= 40) ? 'bust' : 'full'
  const tint = silhouette ? (typeof silhouette === 'string' ? silhouette : '#FFFFFF') : lock ? (typeof lock === 'string' ? lock : LOCK) : null
  const idle = motion === 'idle'
  // 종이 없고 씨앗 컷(cracks·turn)도 안 넘기면 = 성향 조사 전 기본 캐릭터 → 마스코트(49 §15)
  const mascot = !sp && cracks == null && turn == null
  const { keys, box, sleepy } = useMemo(() => {
    if (mascot) {
      const L = mascotLayers(mood, size)
      const face = L.find((l) => l.kind === 'face')!.key
      return { keys: L.map((l) => l.key), box: cropBox(MASCOT.sp, MASCOT.st, cr, 'a', MASCOT.seed), sleepy: tint ? null : face.replace(/-face-[a-z]+$/, '-face-sleepy') }
    }
    if (!sp) {
      const k = cracks ? seedCrackKey(seedNo, cracks) : seedTurnKey(seedNo, turn ?? 0)
      return { keys: [k], box: (cr === 'bust' ? { x: 0.12, y: 0.06, w: 0.76, h: 0.76 } : { x: 0, y: 0, w: 1, h: 1 }) as Box, sleepy: null as string | null }
    }
    const L = layers3d(sp, st, { path: w?.path, seed: seedNo, eq: w?.eq, mood, size })
    const face = L.find((l) => l.kind === 'face')!.key
    return { keys: L.map((l) => l.key), box: cropBox(sp, st, cr, w?.path, seedNo), sleepy: tint ? null : face.replace(/-face-[a-z]+$/, '-face-sleepy') }
  }, [sp, st, w?.path, w?.eq?.hat, w?.eq?.neck, w?.eq?.hand, w?.eq?.back, seedNo, mood, size, cracks, turn, cr, tint, mascot])
  const full = size / box.w
  const px = sp || mascot ? pickPx(full, 2) : SEED_PX
  const pos: CSSProperties = { width: full, height: full, left: -box.x * full, top: -box.y * full }
  const showBlink = !!sleepy && (blink || idle)
  const cls = `character c3${sp ? ` sp-${sp} st-${st}` : mascot ? ' mascot' : ' egg'}${idle ? ' live' : ''}${calm ? ' calm' : ''}${wave ? ' wave' : ''}${blink ? ' blink' : ''}${tint ? ' tinted' : ''}${className ? ` ${className}` : ''}`
  return (
    <span className={cls} style={{ width: size, height: size }} role="img" aria-label={label ?? (sp ? undefined : mascot ? '꿈틀 아기 달팽이' : '아직 모르는 씨앗')} aria-hidden={label ? undefined : true}>
      <span className="c3-move">
        {keys.map((k) => {
          const url = artUrl(k, px)
          if (!url) return null
          const isFace = /-face-/.test(k)
          if (tint) return <span key={k} className="c3-l c3-tint" style={{ ...pos, backgroundColor: tint, WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }} />
          return <img key={k} className={`c3-l${isFace && showBlink ? ' c3-open' : ''}`} src={url} style={pos} alt="" draggable={false} decoding="async" />
        })}
        {showBlink && artUrl(sleepy!, px) ? <img className="c3-l c3-shut" src={artUrl(sleepy!, px)!} style={pos} alt="" draggable={false} /> : null}
      </span>
    </span>
  )
})

/** 그림 한 장을 상자(box, 캔버스 비율)만큼 확대해 size 칸에 — 옷 칸·장식·장면 아이콘 */
export const ArtImage = memo(function ArtImage({ artKey, size, box, px, tint, className }: { artKey: string; size: number; box?: Box; px?: number; tint?: string | null; className?: string }) {
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 }
  const full = size / b.w
  const url = artUrl(artKey, px ?? pickPx(full, 2))
  const pos: CSSProperties = { width: full, height: full, left: -b.x * full, top: -b.y * full }
  return (
    <span className={`character c3${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      {url ? (tint ? <span className="c3-l c3-tint" style={{ ...pos, backgroundColor: tint, WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }} /> : <img className="c3-l" src={url} style={pos} alt="" draggable={false} />) : null}
    </span>
  )
})
