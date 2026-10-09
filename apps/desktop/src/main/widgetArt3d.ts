// 49 §8.1 위젯 그림(v3) — 무엇을 겹칠지만 정하는 순수 함수(electron 없음 · 시험 가능).
// 앱 CharacterArt와 같은 층(layers3d)을 같은 순서로 겹치고, 그려진 테두리(몸 + 입은 옷 + 칸 소품)로 꽉 채운다.
// 그림 파일 자리: 개발 = 저장소 packages/schema/art3d · 패키지 앱 = resources/art3d(electron-builder.yml extraResources, 512 + 씨앗 320만).
import { ACCS, BODIES, FACES, PROPS, SEEDS3D, artFile, bodyKey, layers3d, mood5, seedTurnKey, type Box } from '@sprout/schema/characterArt'
import type { Species } from '@sprout/schema/growth'
import { parseLook } from '@sprout/schema/wardrobe'

export const WIDGET_ART_PX = 192 // 96pt @2x (25 §3.4 중간 캐릭터 96)
export type WidgetArtMood = 'default' | 'happy' | 'sleepy'
export type WidgetArtPlan = { files: string[]; box: Box }

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
    return { files: [artFile(SEEDS3D.includes(k) ? k : seedTurnKey(0, 0), 320)], box: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 } }
  }
  const L = layers3d(species, stage, { path: l.path, seed, eq: l.eq, mood: mood5(mood), size: 96 })
  const body = BODIES[bodyKey(species, stage, l.path, seed)]
  let bb = body?.box ?? [0, 0, 1, 1]
  for (const x of L) {
    const r = x.kind === 'acc' ? ACCS[x.key] : x.kind === 'prop' ? PROPS[x.key] : x.kind === 'face' ? FACES[x.key] : undefined
    if (r) bb = union(bb, r)
  }
  return { files: L.map((x) => artFile(x.key, 512)), box: squareOf(bb) }
}

/** 겹쳐 찍을 HTML(그림은 data: URL — 파일 권한·경로 문제 없음). src(file) = 파일 이름 → data: URL(없으면 null → 건너뜀) */
export function widgetArtHtml(plan: WidgetArtPlan, src: (file: string) => string | null, px = WIDGET_ART_PX): string {
  const full = px / plan.box.w
  const r = (n: number) => Math.round(n * 100) / 100
  const pos = `width:${r(full)}px;height:${r(full)}px;left:${r(-plan.box.x * full)}px;top:${r(-plan.box.y * full)}px`
  const imgs = plan.files.map(src).filter((u): u is string => !!u).map((u) => `<img src="${u}" style="${pos}">`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${px}px;height:${px}px;background:transparent;overflow:hidden;position:relative}img{position:absolute;display:block;max-width:none}</style></head><body>${imgs}</body></html>`
}
