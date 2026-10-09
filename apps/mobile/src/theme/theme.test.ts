// 테마 색표 시험: 13종 모두 만들어지고, 저장 형식(user_prefs.theme)이 데스크톱과 같게 읽힌다
import assert from 'node:assert/strict'
import { THEMES, effectiveTheme, encodeTheme, parseTheme } from './themes.ts'
import { mix, paletteOf } from './palette.ts'

assert.equal(THEMES.length, 13)
for (const t of THEMES) {
  const p = paletteOf(t.id)
  assert.equal(p.id, t.id)
  assert.equal(p.dark, t.family === 'dark')
  for (const [k, v] of Object.entries(p)) if (typeof v === 'string' && k !== 'id') assert.ok(!v.includes('var('), `${t.id}.${k} 미해결: ${v}`)
}
// 라이트 기본 바닥은 #F4F6F3(44 §3.1), 색 테마는 견본색 9%
assert.equal(paletteOf('default').pageBg, '#f4f6f3')
assert.equal(paletteOf('default').accent, '#22a45d')
assert.equal(paletteOf('dark').pageBg, '#0c0f0d')
assert.equal(paletteOf('dark').cardBg, '#161a17')
assert.equal(paletteOf('sky').pageBg, mix('#6387f5', '#f3f3f6', 0.09))
// 트루 블랙
assert.equal(paletteOf('black').pageBg, '#000000')
assert.equal(paletteOf('black').accent, '#5a62fa')
// 저장 형식
assert.deepEqual(parseTheme('teal|black'), { main: 'teal', dark: 'black' })
assert.equal(encodeTheme('sky', 'dark'), 'sky')
assert.equal(effectiveTheme('teal|black', true, true), 'black')
assert.equal(effectiveTheme('teal|black', false, true), 'teal')
assert.equal(paletteOf('없는테마').id, 'default')
console.log('theme ok')
