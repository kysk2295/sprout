// 49 §8.1 위젯 그림(v3): 겹칠 층·자르기 상자·HTML — 앱 CharacterArt와 같은 층 순서, 파일이 실제로 있는지
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { layers3d, artFile } from '@sprout/schema/characterArt'
import { widgetArtHtml, widgetArtPlan } from '../src/main/widgetArt3d'

const DIR = resolve('packages/schema/art3d')

{ // 기본 모습: 몸 + 얼굴, 같은 순서, 512
  const p = widgetArtPlan('snail', 3, 'happy', null)
  assert.deepEqual(p.files, layers3d('snail', 3, { mood: 'happy', size: 96 }).map((l) => artFile(l.key, 384)))
  assert.ok(p.files.some((f) => /-face-happy@384/.test(f)))
  assert.ok(p.box.w > 0.3 && p.box.w <= 1 && p.box.x >= 0 && p.box.y >= 0 && p.box.x + p.box.w <= 1.0001 && p.box.y + p.box.h <= 1.0001)
}
{ // 표정 3개가 mood5 이름으로
  for (const m of ['default', 'happy', 'sleepy'] as const) assert.ok(widgetArtPlan('bee', 2, m).files.some((f) => f.includes(`-face-${m}@`)))
}
{ // 종 모름(성향 조사 전) = 마스코트 아기 달팽이(49 §15) — 고른 씨앗·옷·단계와 상관없이 snail-1s0 + 얼굴
  const p = widgetArtPlan(null, 4, 'happy', JSON.stringify({ seed: 3, eq: { hat: 'beanie' } }))
  assert.deepEqual(p.files, ['snail-1s0@384.webp', 'snail-1-face-happy@384.webp'])
  if (existsSync(DIR)) for (const f of p.files) assert.ok(existsSync(resolve(DIR, f)), f)
}
{ // 모든 종·단계: 몸 층 파일이 있다(패키지 extraResources 필터 *@512 · seed*-t00@320과 맞는지)
  for (const sp of ['snail', 'frog', 'bee', 'worm'] as const) for (let st = 1; st <= 5; st++) {
    const p = widgetArtPlan(sp, st, 'default')
    assert.ok(p.files.every((f) => /@384\.webp$/.test(f)))
    if (existsSync(DIR)) assert.ok(existsSync(resolve(DIR, p.files[0])), p.files[0])
  }
}
{ // HTML: 없는 파일은 건너뛰고, 상자를 꽉 채우게 확대
  const p = { files: ['a@512.webp', 'b@512.webp'], box: { x: 0.25, y: 0.1, w: 0.5, h: 0.5 } }
  const html = widgetArtHtml(p, (f) => (f.startsWith('a') ? 'data:image/webp;base64,AA' : null), 192)
  assert.equal((html.match(/<img /g) ?? []).length, 1)
  assert.match(html, /width:384px;height:384px;left:-96px;top:-38\.4px/)
}
{ // 49 §6.1 위젯 배경: 고른 배경의 낮 짝 장면(390)이 맨 뒤, 받침이 발밑, 둥근 칸
  const p = widgetArtPlan('frog', 3, 'default', JSON.stringify({ eq: { bg: 'flowers' } }))
  assert.equal(p.scene?.file, 'scene-flowers@390.webp')
  assert.ok(p.scene!.at.w > 1 && p.scene!.at.x < 0, '장면이 캐릭터 캔버스보다 넓다')
  assert.equal(widgetArtPlan('frog', 3, 'default', null).scene?.file, 'scene-day@390.webp')
  if (existsSync(DIR)) assert.ok(existsSync(resolve(DIR, p.scene!.file)))
  const html = widgetArtHtml(p, () => 'data:image/webp;base64,AA', 192)
  assert.ok(html.indexOf('<img') === html.indexOf(`<img src="data:image/webp;base64,AA" style="width:${Math.round(p.scene!.at.w * (192 / p.box.w) * 100) / 100}px`), '장면이 맨 앞(뒤 층)')
  assert.match(html, /border-radius:38\.4px/)
}
console.log('widget-art3d ok')
