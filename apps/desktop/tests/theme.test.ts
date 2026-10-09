// 00 §5 테마: tokens.css의 테마 블록이 목록과 맞는지, 글자·강조·레일 대비가 기준을 넘는지, 저장 형식이 예전 값과 맞는지
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEMES, encodeTheme, effectiveTheme, parseTheme, themeAttrs } from '../src/renderer/src/data/theme'

const css = readFileSync('packages/tokens/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = new Map<string, Record<string, string>>()
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const vars: Record<string, string> = {}
  for (const d of m[2].matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim()
  for (const sel of m[1].split(',')) blocks.set(sel.trim(), { ...blocks.get(sel.trim()), ...vars })
}
const selectorOf = (id: string) => {
  const { theme, variant } = themeAttrs(id)
  return variant ? `[data-theme="${theme}"][data-theme-variant="${variant}"]` : `[data-theme="${theme}"]`
}
/** 문서 루트에 그 테마를 붙였을 때의 변수(:root → data-theme → 변형 순서로 덮는다) */
function resolved(id: string) {
  const { theme, variant } = themeAttrs(id)
  const v = { ...blocks.get(':root'), ...blocks.get(`[data-theme="${theme}"]`), ...(variant ? blocks.get(selectorOf(id)) : {}) }
  const get = (name: string, depth = 0): string => {
    const raw = v[name]
    assert.ok(raw, `${id}: ${name} 없음`)
    const ref = raw.match(/^var\((--[\w-]+)\)$/)
    return ref && depth < 5 ? get(ref[1], depth + 1) : raw
  }
  return { get, scheme: v['color-scheme'] }
}

type RGBA = [number, number, number, number]
function parse(c: string): RGBA {
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as RGBA
  const rgba = c.match(/^rgba?\(([^)]+)\)$/)
  if (rgba) { const p = rgba[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1] }
  if (c === 'transparent') return [0, 0, 0, 0]
  throw new Error(`색을 읽지 못함: ${c}`)
}
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as RGBA
const lum = (c: RGBA) => { const [r, g, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export function contrast(fg: string, bg: string) {
  const b = parse(bg)
  const [x, y] = [lum(over(parse(fg), b)), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// 예전부터 있던 셋(틱틱 화면에서 잰 값)은 강조색·레일 아이콘을 실측대로 둔다 — 새 테마만 4.5:1·3:1을 강제
const MEASURED = new Set(['default', 'sky', 'dark'])
const surfaces = ['--color-bg-app', '--color-bg-sidebar', '--color-bg-selected', '--color-bg-card', '--color-bg-popover', '--color-bg-input', '--color-bg-hover']
const failures: string[] = []
const check = (ok: boolean, msg: string) => { if (!ok) failures.push(msg) }

assert.ok(THEMES.length >= 12, '테마는 12개 이상')
assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length, '테마 id 중복')
for (const t of THEMES) {
  if (t.id !== 'default') assert.ok(blocks.has(selectorOf(t.id)), `${t.id}: tokens.css에 ${selectorOf(t.id)} 블록이 없다`)
  const { get, scheme } = resolved(t.id)
  if (t.family === 'dark') assert.equal(scheme, 'dark', `${t.id}: 다크 계열은 color-scheme: dark`)
  for (const s of surfaces) {
    const bg = get(s)
    check(contrast(get('--color-text-primary'), bg) >= 4.5, `${t.id}: 본문 글자 / ${s} ${contrast(get('--color-text-primary'), bg).toFixed(2)} < 4.5`)
  }
  // 보조 글자(날짜·개수)는 틱틱 실측(#7D7D7D, 흰 바탕 4.1:1)을 기준선으로: 어느 테마도 그보다 크게 떨어지면 안 된다
  for (const s of ['--color-bg-app', '--color-bg-sidebar']) check(contrast(get('--color-text-secondary'), get(s)) >= 3.8, `${t.id}: 보조 글자 / ${s} ${contrast(get('--color-text-secondary'), get(s)).toFixed(2)} < 3.8`)
  check(contrast(get('--color-text-secondary'), get('--color-bg-selected')) >= 3.4, `${t.id}: 보조 글자 / 선택 면 < 3.4`)
  const accentMin = MEASURED.has(t.id) ? 3 : 4.5
  for (const s of ['--color-bg-app', '--color-bg-sidebar']) check(contrast(get('--color-accent'), get(s)) >= accentMin, `${t.id}: 강조색 / ${s} ${contrast(get('--color-accent'), get(s)).toFixed(2)} < ${accentMin}`)
  check(contrast('#ffffff', get('--color-accent')) >= accentMin, `${t.id}: 강조 버튼 흰 글자 ${contrast('#ffffff', get('--color-accent')).toFixed(2)} < ${accentMin}`)
  if (!MEASURED.has(t.id)) check(contrast(get('--color-accent'), get('--color-accent-subtle')) >= 3, `${t.id}: 강조색 / 옅은 강조 면 < 3`)
  if (!MEASURED.has(t.id)) {
    check(contrast(get('--color-rail-icon'), get('--color-bg-rail')) >= 3, `${t.id}: 레일 아이콘 / 레일 ${contrast(get('--color-rail-icon'), get('--color-bg-rail')).toFixed(2)} < 3`)
    const selBg = get('--color-rail-icon-selected-bg')
    const under = selBg === 'transparent' ? get('--color-bg-rail') : selBg
    check(contrast(get('--color-rail-icon-selected'), under) >= 3, `${t.id}: 선택 레일 아이콘 < 3`)
    const hover = parse(get('--color-rail-hover'))
    const hoverBg = over(hover, parse(get('--color-bg-rail')))
    check(contrast(get('--color-rail-icon-hover'), `rgb(${hoverBg.slice(0, 3).join(',')})`) >= 3, `${t.id}: 호버 레일 아이콘 < 3`)
  }
  // 00 v2.0 (44 §8): 작은 강조 글자(링크·시각)는 accent-ink — 흰 면·바닥·고른 면에서 읽혀야 한다
  const inkMin = MEASURED.has(t.id) && t.id === 'sky' ? 4 : 4.5
  for (const s of ['--color-bg-app', '--color-bg-sidebar', '--color-bg-ground']) check(contrast(get('--color-accent-ink'), get(s)) >= inkMin, `${t.id}: 강조 글자 / ${s} ${contrast(get('--color-accent-ink'), get(s)).toFixed(2)} < ${inkMin}`)
  check(contrast(get('--color-accent-ink'), get('--color-bg-selected')) >= 4, `${t.id}: 강조 글자 / 고른 면 < 4`)
  check(contrast(get('--color-text-danger'), get('--color-bg-app')) >= 4.4, `${t.id}: 빨강 글자 / 면 ${contrast(get('--color-text-danger'), get('--color-bg-app')).toFixed(2)} < 4.4`)
  check(contrast(get('--color-priority-high'), get('--color-bg-app')) >= 3, `${t.id}: 높음 체크 테두리 / 면 < 3`)
  check(contrast(get('--color-on-accent'), get('--color-accent')) >= (MEASURED.has(t.id) ? 3 : 4.5), `${t.id}: 강조 위 글자 < 기준`)
}
// 기본 테마 = 꿈틀 초록(44 결정 ⓒ), 다른 색 테마는 각자 강조색
assert.equal(resolved('default').get('--color-accent'), '#22a45d')
assert.equal(resolved('sky').get('--color-accent'), '#4e75f2')
assert.equal(resolved('black').get('--color-accent'), '#5a62fa')
assert.deepEqual(failures, [], `대비 기준 미달:\n${failures.join('\n')}`)

// 저장 형식: 예전 값('default'·'sky'·'dark')은 그대로 읽히고, 두 번째 칸은 시스템 다크일 때 테마
assert.deepEqual(parseTheme('sky'), { main: 'sky', dark: 'dark' })
assert.deepEqual(parseTheme('dark'), { main: 'dark', dark: 'dark' })
assert.deepEqual(parseTheme(null), { main: 'default', dark: 'dark' })
assert.deepEqual(parseTheme('없는테마|teal'), { main: 'default', dark: 'dark' }, '모르는 값·라이트를 다크 칸에 넣으면 기본값')
assert.deepEqual(parseTheme('teal|black'), { main: 'teal', dark: 'black' })
assert.equal(encodeTheme('teal', 'dark'), 'teal', '다크가 기본이면 예전 형식 한 칸')
assert.equal(encodeTheme('teal', 'black'), 'teal|black')
assert.equal(encodeTheme('teal', 'sky'), 'teal', '라이트 테마는 다크 칸에 못 들어간다')
assert.equal(effectiveTheme('teal|black', true, true), 'black')
assert.equal(effectiveTheme('teal|black', true, false), 'teal')
assert.equal(effectiveTheme('teal|black', false, true), 'teal')
assert.deepEqual(themeAttrs('black'), { theme: 'dark', variant: 'black' })
assert.deepEqual(themeAttrs('dark'), { theme: 'dark' })
assert.deepEqual(themeAttrs('peach'), { theme: 'peach' })
console.log(`theme: ${THEMES.length}개 테마 대비·저장 형식 확인`)
