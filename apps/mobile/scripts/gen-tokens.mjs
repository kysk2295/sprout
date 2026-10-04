// packages/tokens/tokens.css(정본, 00 디자인 토큰) → React Native 색 상수(src/theme/tokens.generated.ts)
// 쓰는 법: npm run tokens -w @sprout/mobile   (tokens.css가 바뀌면 다시 돌린다)
// - 테마 13종을 각각 "다 풀린" 색표로 만든다: 기본(:root) 위에 테마 블록을 덮고 var(--x)를 끝까지 풀어 넣는다.
// - 다크 계열: dark = 기본 + [data-theme="dark"], black = dark + [data-theme-variant="black"] (00 §5.3)
// - 색(--color-*)만 옮긴다. 모바일 전용 값(--m-*)은 src/theme/palette.ts가 시안 키트 2부를 따라 계산한다.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, '../../../packages/tokens/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const blocks = {}
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const vars = {}
  for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) if (d[1].startsWith('color-')) vars[d[1]] = d[2].trim()
  for (const sel of m[1].split(',').map((s) => s.trim())) {
    const key = sel === ':root' || sel === '[data-theme="default"]' ? 'base'
      : sel === '[data-theme="dark"][data-theme-variant="black"]' ? 'black'
      : (sel.match(/^\[data-theme="([\w-]+)"\]$/) ?? [])[1]
    if (!key) throw new Error(`모르는 선택자: ${sel}`)
    blocks[key] = { ...(blocks[key] ?? {}), ...vars }
  }
}

const THEMES = ['default', 'sky', 'turquoise', 'teal', 'matcha', 'sunshine', 'peach', 'lilac', 'ebony', 'navy', 'gray', 'dark', 'black']
const camel = (name) => name.replace(/^color-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())

function resolve(vars) {
  const out = {}
  const get = (name, depth = 0) => {
    if (depth > 10) throw new Error(`순환 참조: ${name}`)
    const raw = vars[name]
    if (raw === undefined) throw new Error(`없는 변수: ${name}`)
    return raw.replace(/var\(--([\w-]+)\)/g, (_, ref) => get(ref, depth + 1))
  }
  for (const name of Object.keys(vars)) out[camel(name)] = get(name)
  return out
}

const result = {}
for (const id of THEMES) {
  const layers = id === 'default' ? ['base'] : id === 'black' ? ['base', 'dark', 'black'] : ['base', id]
  result[id] = resolve(Object.assign({}, ...layers.map((l) => blocks[l] ?? {})))
}
const keys = Object.keys(result.default)
for (const id of THEMES) for (const k of keys) if (!(k in result[id])) throw new Error(`${id}에 ${k} 없음`)

const out = `// 자동 생성 — 손으로 고치지 말 것. 정본: packages/tokens/tokens.css → scripts/gen-tokens.mjs
export type TokenColors = {\n${keys.map((k) => `  ${k}: string`).join('\n')}\n}
export const TOKEN_THEMES: Record<${THEMES.map((t) => `'${t}'`).join(' | ')}, TokenColors> = ${JSON.stringify(result, null, 2)}
`
writeFileSync(join(here, '../src/theme/tokens.generated.ts'), out)
console.log(`토큰 ${keys.length}개 × 테마 ${THEMES.length}종 → src/theme/tokens.generated.ts`)
