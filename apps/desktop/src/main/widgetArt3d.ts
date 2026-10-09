// 49 §8.1 위젯 그림(v3) — 무엇을 겹칠지만 정하는 순수 함수(electron 없음 · 시험 가능).
// 앱 CharacterArt와 같은 층(layers3d)을 같은 순서로 겹치고, 그려진 테두리(몸 + 입은 옷 + 칸 소품)로 꽉 채운다.
// 그림 파일 자리: 개발 = 저장소 packages/schema/art3d · 패키지 앱 = resources/art3d(electron-builder.yml extraResources, 384 + 씨앗 앞모습 512만).
import { ACCS, BODIES, FACES, PROPS, SCENE_LOW_PX, SCENES3D, SEEDS3D, artFile, bodyKey, layers3d, mood5, sceneBehind, seedTurnKey, type Box } from '@sprout/schema/characterArt'
import { widgetSceneKey } from '@sprout/schema/widget'
import type { Species } from '@sprout/schema/growth'
import { parseLook } from '@sprout/schema/wardrobe'

export const WIDGET_ART_PX = 192 // 96pt @2x (25 §3.4 중간 캐릭터 96)
export type WidgetArtMood = 'default' | 'happy' | 'sleepy'
/** scene = 캐릭터 뒤에 깔 장면(49 §6.1 고른 배경) — 파일 · 캔버스 비율 자리(sceneBehind). 둥근 칸(모서리 radius 비율)으로 자른다 */
export type WidgetArtPlan = { files: string[]; box: Box; scene?: { file: string; at: { x: number; y: number; w: number; h: number } } }
export const WIDGET_ART_RADIUS = 0.2

const PAD = 0.04
function squareOf([x0, y0, x1, y1]: number[]): Box {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const side = Math.min(1, Math.max(x1 - x0, y1 - y0) + PAD * 2)
  return { x: Math.min(1 - side, Math.max(0, cx - side / 2)), y: Math.min(1 - side, Math.max(0, cy - side / 2)), w: side, h: side }
}
const union = (a: number[], b: number[]) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]

/** 겹칠 파일 이름(뒤 → 앞)과 자를 상자(캔버스 비율). 종을 모르면 씨앗 한 장(앞모습) */
export function widgetArtPlan(species: Species | null, stage: number, mood: WidgetArtMood, lookJson?: string | null): WidgetArtPlan {
  const l = parseLook(lookJson)
  const seed = l.seed ?? 0
  if (!species) {
    const k = seedTurnKey(seed, 0)
    return { files: [artFile(SEEDS3D.includes(k) ? k : seedTurnKey(0, 0), 512)], box: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }, scene: sceneOf(lookJson) }
  }
  const L = layers3d(species, stage, { path: l.path, seed, eq: l.eq, mood: mood5(mood), size: 96 })
  const body = BODIES[bodyKey(species, stage, l.path, seed)]
  let bb = body?.box ?? [0, 0, 1, 1]
  for (const x of L) {
    const r = x.kind === 'acc' ? ACCS[x.key] : x.kind === 'prop' ? PROPS[x.key] : x.kind === 'face' ? FACES[x.key] : undefined
    if (r) bb = union(bb, r)
  }
  return { files: L.map((x) => artFile(x.key, 384)), box: squareOf(bb), scene: sceneOf(lookJson) }
}
function sceneOf(lookJson?: string | null): WidgetArtPlan['scene'] {
  const key = widgetSceneKey(lookJson)
  return SCENES3D[key] ? { file: artFile(key, SCENE_LOW_PX), at: sceneBehind(key) } : undefined
}

/** 겹쳐 찍을 HTML(그림은 data: URL — 파일 권한·경로 문제 없음). src(file) = 파일 이름 → data: URL(없으면 null → 건너뜀) */
export function widgetArtHtml(plan: WidgetArtPlan, src: (file: string) => string | null, px = WIDGET_ART_PX): string {
  const full = px / plan.box.w
  const r = (n: number) => Math.round(n * 100) / 100
  const pos = `width:${r(full)}px;height:${r(full)}px;left:${r(-plan.box.x * full)}px;top:${r(-plan.box.y * full)}px`
  const imgs = plan.files.map(src).filter((u): u is string => !!u).map((u) => `<img src="${u}" style="${pos}">`).join('')
  // 장면(있으면 맨 뒤): 캐릭터 캔버스 비율 자리 → 같은 배율로
  const su = plan.scene ? src(plan.scene.file) : null
  const a = plan.scene?.at
  const back = su && a ? `<img src="${su}" style="width:${r(a.w * full)}px;height:${r(a.h * full)}px;left:${r((a.x - plan.box.x) * full)}px;top:${r((a.y - plan.box.y) * full)}px">` : ''
  // body의 overflow는 화면으로 넘어가 둥글게 잘리지 않는다 → 감싸개 div가 자른다
  const round = back ? `border-radius:${r(px * WIDGET_ART_RADIUS)}px;` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}#a{width:${px}px;height:${px}px;overflow:hidden;position:relative;${round}}img{position:absolute;display:block;max-width:none}</style></head><body><div id="a">${back}${imgs}</div></body></html>`
}
