// 49 캐릭터 v3 · 미리 구운 3D 스프라이트 그림 목록 — 데스크톱·휴대폰·위젯·사이트가 같이 쓰는 순수 함수.
// 그림 파일(packages/schema/art3d/*.webp)과 목록(art3dManifest.ts)은 scripts/characters3d(Blender 절차 생성 → encode.py)가 만든다.
// 같은 종·단계의 층(몸·칸 소품·얼굴·옷)은 같은 캔버스·같은 카메라로 구웠다 → 앱은 같은 크기 그림을 순서대로 겹치기만 한다(기준점 계산 없음).
// 옷 층은 몸에 가려지는 부분이 이미 빠져 있고(holdout) 몸에 진 그림자를 품고 있다 → 겹치는 순서만 지키면 된다.
// 실루엣·잠김(진화 연출·도감)은 따로 굽지 않는다: 같은 층을 한 색으로 칠한다(휴대폰 Image tintColor · 데스크톱 CSS mask) — 필터 없음(40 §7).
import { ART3D_VERSION, ACCS, BODIES, DECOR3D, FACES, FILE_BYTES, PROPS, SCENES3D, SEEDS3D, SPINS3D } from './art3dManifest.ts'
import { LEGACY_SPECIES, SPECIES_IDS, type Species } from './growth.ts'
import type { Equip, Path } from './wardrobe.ts'

export { ART3D_VERSION, ACCS, BODIES, DECOR3D, FACES, FILE_BYTES, PROPS, SCENES3D, SEEDS3D, SPINS3D }

/* ───────── 표정 5 (49 결정 ④) ───────── */
export type Mood5 = 'default' | 'happy' | 'sleepy' | 'wow' | 'think'
export const MOODS5: Mood5[] = ['default', 'happy', 'sleepy', 'wow', 'think']
export const MOOD5_NAME: Record<Mood5, string> = { default: '기본', happy: '웃음', sleepy: '졸림', wow: '놀람', think: '생각' }
/** 옛 표정 11(40 §6 · 42 · 43 만지기) → 5. 부르는 쪽(AI 비서·일기·만지기)은 옛 이름을 그대로 넘겨도 된다.
 *  smile·content·pet·giggle·eat = 웃음(웃는 눈·넓은 미소) · puzzled = 생각(눈이 옆·위로) */
export const MOOD_MAP: Record<string, Mood5> = {
  default: 'default', smile: 'happy', happy: 'happy', content: 'happy', pet: 'happy', giggle: 'happy', eat: 'happy',
  sleepy: 'sleepy', think: 'think', puzzled: 'think', wow: 'wow'
}
export const mood5 = (m?: string | null): Mood5 => MOOD_MAP[m ?? 'default'] ?? 'default'

/* ───────── 이름 ───────── */
const SP = (sp: string | null | undefined): Species => ((SPECIES_IDS as string[]).includes(sp ?? '') ? (sp as Species) : LEGACY_SPECIES[sp ?? ''] ?? 'worm')
const ST = (st: number) => Math.min(5, Math.max(1, Math.round(st) || 1))
export const SEED_COUNT = 4
/** 씨앗 4개(49 §5.2) — 껍질 색 이름. 종은 정하지 않는다(결정 ③) */
export const SEED_NAMES = [
  { name: '흙빛 씨앗', line: '포근하고 든든한 갈색 껍질', color: '#C99063' },
  { name: '장미 씨앗', line: '볕에 그을린 장밋빛 껍질', color: '#B9876E' },
  { name: '올리브 씨앗', line: '숲 그늘을 닮은 올리브 껍질', color: '#A9A26F' },
  { name: '새벽 씨앗', line: '새벽 하늘빛이 도는 껍질', color: '#8E9AB4' }
] as const
const SEED = (s: number | null | undefined) => (Number.isInteger(s) && (s as number) >= 0 && (s as number) < SEED_COUNT ? (s as number) : 0)

/** 몸 층 이름: 아기 = 씨앗 껍질 색별(개구리 아기는 물방울 알이라 하나), 꼬마 = 하나, 친구~전설 = 갈래별 */
export function bodyKey(sp: Species | string, st: number, path: Path = 'a', seed = 0): string {
  const s = SP(sp), t = ST(st)
  if (t === 1) return s === 'frog' ? 'frog-1' : `${s}-1s${SEED(seed)}`
  if (t === 2) return `${s}-2`
  return `${s}-${t}${path === 'b' ? 'b' : 'a'}`
}
export const faceKey = (sp: Species | string, st: number, mood: string = 'default') => `${SP(sp)}-${ST(st)}-face-${mood5(mood)}`
export const accKey = (sp: Species | string, st: number, id: string) => `${SP(sp)}-${ST(st)}-acc-${id}`
export const propKey = (sp: Species | string, st: number, path: Path = 'a') => `${SP(sp)}-${ST(st)}${path === 'b' ? 'b' : 'a'}-prop`
/** 씨앗 파일 크기: 앞모습(t00)·금은 512, 돌아가는 컷은 384 */
export const seedPx = (key: string) => (/-(t00|crack\d)$/.test(key) ? SEED_PX : MID_PX)
export const seedTurnKey = (seed: number, turn: number) => `seed${SEED(seed)}-t${String(((Math.round(turn) % 12) + 12) % 12).padStart(2, '0')}`
export const seedCrackKey = (seed: number, cracks: number) => (cracks <= 0 ? seedTurnKey(seed, 0) : `seed${SEED(seed)}-crack${Math.min(2, cracks)}`)
export const SEED_FRAMES = 12

/** 크기 사다리(49 §4.4, 2026-10-10 고침 — 3배 화면에서 늘리지 않게): 768 큰 자리(≈ 256pt까지) · 384 중간(≈ 128pt, 도감 칸) · 160 작은 자리(≤ 56pt) · 씨앗 512 · 장면·띠 1170 · 장식 256 · 회전 띠 360 */
export const BIG_PX = 768, MID_PX = 384, SMALL_PX = 160, SEED_PX = 512
/** 파일 이름 */
export const artFile = (key: string, px: number) => `${key}@${px}.webp`
/** 화면 크기(pt)에 맞는 원본 — 늘리지 않는 가장 작은 것: ≤ 160px → 160, ≤ 384px → 384, 그 위 768 */
export const pickPx = (sizePt: number, scale = 3): 160 | 384 | 768 => (sizePt * scale <= SMALL_PX + 8 ? 160 : sizePt * scale <= MID_PX + 16 ? 384 : 768)

/* ───────── 층 쌓기 ───────── */
export type Layer3D = { key: string; kind: 'body' | 'prop' | 'face' | 'acc'; slot?: 'hat' | 'neck' | 'hand' | 'back' }
export type Look3D = { path?: Path; seed?: number; eq?: Partial<Equip>; mood?: string | null; size?: number }
const ACC_ORDER: ('back' | 'neck' | 'hand' | 'hat')[] = ['back', 'neck', 'hand', 'hat']
/** 겹치는 순서(뒤 → 앞): 몸 · 칸 소품(같은 칸 옷을 입으면 숨는다 — 43 §5.1) · 등 · 얼굴 · 목 · 손 · 모자.
 *  작은 자리(< 64pt)는 목·손·등 옷을 그리지 않는다(42 §5.3 그대로). 아기는 목·등 칸이 없다(그릇 안). 없는 층은 건너뛴다. */
export function layers3d(spIn: Species | string, stIn: number, o: Look3D = {}): Layer3D[] {
  const sp = SP(spIn), st = ST(stIn), path = o.path === 'b' ? 'b' : 'a'
  const small = !!o.size && o.size < 64
  const eq = o.eq ?? {}
  const worn: Partial<Record<string, string>> = {}
  for (const slot of ACC_ORDER) {
    const id = eq[slot]
    if (!id) continue
    if (small && slot !== 'hat') continue
    if (ACCS[accKey(sp, st, id)]) worn[slot] = id
  }
  const out: Layer3D[] = [{ key: bodyKey(sp, st, path, o.seed ?? 0), kind: 'body' }]
  const b = BODIES[bodyKey(sp, st, path, o.seed ?? 0)]
  for (const slot of b?.props ?? []) if (!worn[slot] && PROPS[propKey(sp, st, path)]) out.push({ key: propKey(sp, st, path), kind: 'prop', slot: slot as Layer3D['slot'] })
  if (worn.back) out.push({ key: accKey(sp, st, worn.back), kind: 'acc', slot: 'back' })
  out.push({ key: faceKey(sp, st, o.mood ?? 'default'), kind: 'face' })
  for (const slot of ['neck', 'hand', 'hat'] as const) if (worn[slot]) out.push({ key: accKey(sp, st, worn[slot]!), kind: 'acc', slot })
  return out
}
/** 입은 옷 중 실제로 그려지는 칸(작은 자리·아기·없는 층 제외) */
export function wornSlots3d(sp: Species | string, st: number, o: Look3D = {}): string[] {
  return layers3d(sp, st, o).filter((l) => l.kind === 'acc').map((l) => l.slot!)
}

/* ───────── 자르기 · 자리 ───────── */
export type Box = { x: number; y: number; w: number; h: number }
/** 머리 칸(아바타·AI 답 얼굴·토스트 — 49 §8.1): 새싹 꼭대기부터 머리 아래까지 정사각형. full = 캔버스 전체 */
export function cropBox(sp: Species | string, st: number, crop: 'full' | 'bust' = 'full', path: Path = 'a', seed = 0): Box {
  if (crop !== 'bust') return { x: 0, y: 0, w: 1, h: 1 }
  const b = BODIES[bodyKey(sp, st, path, seed)]
  if (!b) return { x: 0, y: 0, w: 1, h: 1 }
  const [hx, hy, hr] = b.head
  const top = Math.min(b.top[1], hy - hr) - 0.025
  const bottom = hy + hr * 1.05
  const side = Math.min(1, Math.max(0.3, bottom - top))
  const x = Math.min(1 - side, Math.max(0, hx - side / 2))
  const y = Math.min(1 - side, Math.max(0, top))
  return { x: +x.toFixed(4), y: +y.toFixed(4), w: +side.toFixed(4), h: +side.toFixed(4) }
}
/** 머리 꼭대기(새싹 끝) — 말풍선·하트·+10을 머리 위에 둘 때(캔버스 비율) */
export function headTop3d(sp: Species | string, st: number, path: Path = 'a', seed = 0): { x: number; y: number } {
  const b = BODIES[bodyKey(sp, st, path, seed)]
  return b ? { x: b.top[0], y: b.top[1] } : { x: 0.5, y: 0.14 }
}
/** 발밑 자리: 모든 그림이 같다(캔버스 아래 10%, 가운데) */
export const FOOT = { x: 0.5, y: 0.9 } as const

/** 옷장 칸 그림: 옷 층을 그 옷 자리로 확대해 자른 상자(49 §7). 기준 몸 = 꿀벌 친구(둥근 몸이라 모든 옷이 가운데) */
export const ICON_BASE: { sp: Species; st: number } = { sp: 'bee', st: 3 }
export function accIcon(id: string): { key: string; box: Box } | null {
  const key = accKey(ICON_BASE.sp, ICON_BASE.st, id)
  const bb = ACCS[key]
  if (!bb) return null
  return { key, box: square(bb, 0.06) }
}
function square([x0, y0, x1, y1]: number[], pad: number): Box {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const side = Math.min(1, Math.max(x1 - x0, y1 - y0) + pad * 2)
  return { x: +Math.min(1 - side, Math.max(0, cx - side / 2)).toFixed(4), y: +Math.min(1 - side, Math.max(0, cy - side / 2)).toFixed(4), w: +side.toFixed(4), h: +side.toFixed(4) }
}
/** 그려진 테두리 상자(정사각형으로) — 도감 칸·위젯처럼 꽉 채워 보여 줄 때 */
export const bodyBox = (key: string, pad = 0.04): Box => (BODIES[key] ? square(BODIES[key].box, pad) : { x: 0, y: 0, w: 1, h: 1 })

/* ───────── 장면 · 배경 고르기(49 §6.1) ───────── */
export type SceneKey = string
/** 밤 짝이 있는 장면(다크 테마·늦은 밤이면 -n) */
const NIGHT_PAIR: Record<string, string> = { rain: 'scene-rain-n', flowers: 'scene-flowers-n', pond: 'scene-pond-n', study: 'scene-study-n' }
/** 자동 · 시간 따라(기본): 5~9시 새벽 · 9~18시 낮 · 18~20시 노을 · 그 밖 별밤. 다크 테마면 늘 별밤 */
export function autoSceneKey(hour: number, dark = false): string {
  if (dark) return 'scene-dusk'
  if (hour >= 5 && hour < 9) return 'scene-dawn'
  if (hour >= 9 && hour < 18) return 'scene-day'
  if (hour >= 18 && hour < 20) return 'scene-sunset'
  return 'scene-dusk'
}
/** 고른 배경(look.eq.bg) + 밤(다크 테마·늦은 밤) → 장면 키. hour는 '자동'에만 쓴다(없으면 지금 시각) */
export function sceneKeyFor(bg: string | null | undefined, night = false, hour?: number): SceneKey {
  const h = hour ?? new Date().getHours()
  switch (bg ?? 'auto') {
    case 'auto': return autoSceneKey(h, night)
    case 'grass': return night ? 'scene-dusk' : 'scene-day'
    case 'dawn': return night ? 'scene-dusk' : 'scene-dawn'
    case 'sunset': return night ? 'scene-dusk' : 'scene-sunset'
    case 'night': return 'scene-dusk'
    case 'moon': return 'scene-moon'
    case 'snow': return 'scene-snow'
    default: return NIGHT_PAIR[bg!] ? (night ? NIGHT_PAIR[bg!] : `scene-${bg}`) : night ? 'scene-dusk' : 'scene-day'
  }
}
/** 옷장 칸 썸네일용 장면(밤 아님) */
export const SCENE_OF_BG: Record<string, SceneKey> = {
  auto: 'scene-dawn', grass: 'scene-day', dawn: 'scene-dawn', sunset: 'scene-sunset', night: 'scene-dusk', moon: 'scene-moon', snow: 'scene-snow',
  rain: 'scene-rain', flowers: 'scene-flowers', pond: 'scene-pond', study: 'scene-study'
}
/** 어두운 장면인가 — 유리 카드·글자·상태 막대를 어두운 판으로 */
export const sceneDark = (key: string) => key === 'scene-dusk' || key === 'scene-moon' || key.endsWith('-n') || key === 'band-dusk'
/** 할 일 화면 큰 제목 뒤 띠(49 §8.2) — 고른 장면을 가로로 잘라 쓴다(bandCrop). 장면이 없으면 기본 띠 */
export const bandKeyFor = (dark: boolean) => (dark ? 'band-dusk' : 'band-day')
/** 세로 장면에서 띠로 자를 높이 구간(장면 높이 비율) — 하늘 끝 · 나무 · 언덕 */
export const BAND_CROP = { y0: 0.17, y1: 0.43 } as const
export const SCENE_PX = 1170, BAND_PX = 1170, SCENE_LOW_PX = 390
/** 장면 바탕색(장면 밖 · 이미지가 오기 전) + 유리 카드 톤 */
export const SCENE_TINT: Record<string, { top: string; bottom: string }> = {
  'scene-day': { top: '#9CCBE4', bottom: '#6DAE5F' }, 'scene-dawn': { top: '#EDC4B1', bottom: '#86BC6E' }, 'scene-dusk': { top: '#1F2846', bottom: '#2F4A45' },
  'scene-sunset': { top: '#F3AD8A', bottom: '#8DAE62' }, 'scene-moon': { top: '#222D4E', bottom: '#33504A' }, 'scene-snow': { top: '#C6D8E9', bottom: '#F3F6F8' },
  'scene-rain': { top: '#93A6B6', bottom: '#6A9563' }, 'scene-rain-n': { top: '#1C2434', bottom: '#28403C' }, 'scene-flowers': { top: '#A5CFE7', bottom: '#6DAE5F' },
  'scene-flowers-n': { top: '#20284A', bottom: '#2F4A45' }, 'scene-pond': { top: '#92C7E3', bottom: '#6DAE5F' }, 'scene-pond-n': { top: '#1D2643', bottom: '#2F4A45' },
  'scene-study': { top: '#EFE4D2', bottom: '#C9A77E' }, 'scene-study-n': { top: '#2A2838', bottom: '#4C3E3A' },
  'band-day': { top: '#9CCBE4', bottom: '#6DAE5F' }, 'band-dusk': { top: '#1F2846', bottom: '#2F4A45' }
}
/** 장면 위 유리 카드 색(글자 대비 — 밝은 장면 = 흰 유리 + 짙은 글자, 어두운 장면 = 짙은 유리 + 흰 글자) */
export const sceneGlass = (key: string) => (sceneDark(key) ? { fill: 'rgba(22,28,40,0.58)', line: 'rgba(255,255,255,0.14)', ink: '#F4F6F8', sub: 'rgba(244,246,248,0.72)' } : { fill: 'rgba(255,255,255,0.62)', line: 'rgba(255,255,255,0.7)', ink: '#1F2A24', sub: 'rgba(31,42,36,0.62)' })

/** 장면을 칸(cw × ch)에 꽉 채워(cover) 깔 때의 이미지 자리와 받침 자리(px).
 *  align = 'bottom'(받침이 늘 보이게 아래를 맞춤 — 성장 홈) · 'center' */
export function sceneLayout(key: string, cw: number, ch: number, align: 'bottom' | 'center' = 'bottom') {
  const m = SCENES3D[key] ?? SCENES3D['scene-day'] ?? { perch: [0.5, 0.7], unit: 0.2, aspect: 2 }
  const aspect = m.aspect
  const s = Math.max(cw / 1, ch / aspect) // 이미지 폭(px)
  const w = s, h = s * aspect
  const x = (cw - w) / 2
  const y = align === 'bottom' ? ch - h : (ch - h) / 2
  return { x, y, w, h, perchX: x + m.perch[0] * w, perchY: y + m.perch[1] * h, unitPx: m.unit * w }
}
/** 캐릭터 상자(box px)를 받침 위에 세울 때의 왼쪽·위 — 발밑(FOOT)이 받침 자리에 */
export function standOnPerch(perchX: number, perchY: number, box: number) {
  return { left: perchX - box * FOOT.x, top: perchY - box * FOOT.y }
}

/* ───────── 방 장식(10 §3.2.7) — 장면 위 작은 3D 소품 ───────── */
/** 받침 자리 기준 놓을 곳: dx·dy = 장면 폭 비율, w = 장식 상자 폭(장면 폭 비율). 뒤(dy < 0)는 캐릭터보다 먼저 그린다 */
export const DECOR_SPOTS: Record<string, { dx: number; dy: number; w: number }> = {
  pot: { dx: -0.36, dy: 0.02, w: 0.2 }, fence: { dx: 0.34, dy: -0.06, w: 0.28 }, mushlamp: { dx: -0.27, dy: -0.07, w: 0.17 },
  butterfly: { dx: 0.24, dy: -0.3, w: 0.12 }, ball: { dx: 0.3, dy: 0.05, w: 0.13 }, bunting: { dx: 0, dy: -0.42, w: 0.7 },
  tent: { dx: 0.36, dy: -0.12, w: 0.26 }, firefly: { dx: -0.1, dy: -0.36, w: 0.5 }, arch: { dx: 0, dy: -0.17, w: 0.6 }
}
export const decorKey = (id: string) => `decor-${id}`

/* ───────── 예산(49 §4.4) ───────── */
export function artBytes(filter: (file: string) => boolean = () => true): number {
  let n = 0
  for (const [f, b] of Object.entries(FILE_BYTES)) if (filter(f)) n += b
  return n
}

/* ───────── 휴대폰 묶음 · 종별 내려받기(49 §4.4 예산) ─────────
   기본 묶음(앱 안, ≈ 1 MB): 모든 160 그림(몸·얼굴·모자 옷·소품 — 도감·아바타·작은 자리·내려받기 전 대체) + 씨앗 회전·금 + 장면·띠 + 방 장식 + 아기 단계 512(만들기 흐름·부화).
   종 묶음(처음 부화 뒤 내 종만 내려받기, ≈ 0.6 MB): 꼬마~전설 몸·얼굴 512 + 옷 512 + 칸 소품 512.
   데스크톱은 앱 크기 제한이 없어 전부 넣는다. 정적 파일 주소 = 사이트(Railway, 변경 불가 캐시) /art3d/v3/ */
export const ART3D_PACK_URL = 'https://web-production-cd889.up.railway.app/art3d/v3/'
export type ArtTier = 'base' | 'pack' | 'bg' | 'none'
const FILE_RE = /^(.+)@(\d+)\.webp$/
/** 파일 하나가 휴대폰에서 어디에 있나: base = 앱 안, pack = 종 묶음 내려받기, none = 휴대폰에서 안 씀(목·손·등 옷 160 — 작은 자리엔 모자만 그린다) */
export function mobileTier(file: string): ArtTier {
  const m = FILE_RE.exec(file)
  if (!m) return 'none'
  const [, key, pxs] = m
  const px = Number(pxs)
  // 장면: 낮·새벽·밤(자동이 쓰는 셋)과 띠·모든 장면의 390 미리보기는 앱 안, 나머지 1170은 배경 묶음(고를 때 내려받기)
  if (/^scene-/.test(key)) return px === SCENE_LOW_PX || /^scene-(day|dawn|dusk|sunset)$/.test(key) ? 'base' : 'bg'
  if (/^(seed|band|decor)/.test(key)) return 'base'
  if (/-spin$/.test(key)) return 'pack'
  const acc = /^[a-z]+-\d-acc-(.+)$/.exec(key)
  if (acc) return px === BIG_PX ? 'pack' : ACC_HATS.has(acc[1]) ? 'base' : 'none'
  const st = Number(/^[a-z]+-(\d)/.exec(key)?.[1] ?? 0)
  if (px === SMALL_PX) return 'base'
  if (px === MID_PX) return 'pack'
  // 768·384: 아기(만들기 흐름·부화)는 앱 안, 꼬마~전설은 종 묶음
  return st === 1 && !/-prop$/.test(key) ? 'base' : 'pack'
}
const ACC_HATS = new Set(['acorn-cap', 'leaf-hat', 'straw', 'beanie', 'santa'])
/** 종 묶음 파일 이름 */
export function packFiles(sp: Species | string): string[] {
  const s = SP(sp)
  return Object.keys(FILE_BYTES).filter((f) => f.startsWith(`${s}-`) && mobileTier(f) === 'pack').sort()
}
export const tierBytes = (tier: ArtTier, sp?: Species) => artBytes((f) => mobileTier(f) === tier && (!sp || f.startsWith(`${sp}-`)))

/* ───────── 한 바퀴 회전 띠(만지기 — 49 §5.3) ───────── */
/** 이 몸의 회전 띠: 파일 키·컷 수·컷 px. 없으면 null(아직 안 구웠거나 휴대폰에서 종 묶음 전) */
export function spinOf(sp: Species | string, st: number, path: Path = 'a', seed = 0): { key: string; frames: number; px: number } | null {
  const b = bodyKey(sp, st, path, seed)
  const s = SPINS3D[b]
  return s ? { key: `${b}-spin`, frames: s[0], px: s[1] } : null
}
/** 배경 묶음 파일(이 장면 키의 큰 그림) — 고르거나 미리 볼 때 받는다 */
export const bgPackFile = (sceneKey: string) => artFile(sceneKey, SCENE_PX)
