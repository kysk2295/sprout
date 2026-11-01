// GitHub Pages 배포용 — `node build.mjs` 결과(public/)를 .pages/로 옮기며 루트 기준 주소("/assets/…")에 저장소 경로(/sprout)를 붙인다.
// 2026-11-02: Railway 사이트가 11-01에 꺼져 Pages(https://kysk2295.github.io/sprout/)로 옮김. 루트 저장소 kysk2295.github.io는 주인 개인 사이트라 쓰지 않는다.
// Caddyfile이 하던 일 중 Pages가 못 하는 것: 옛 주소 이동(301) → 바로 넘기는 작은 HTML. /privacy처럼 확장자 없는 주소는 Pages가 privacy.html로 알아서 연다.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '../public')
const out = join(here, '../.pages')
const BASE = (process.env.SITE_BASE ?? '/sprout').replace(/\/$/, '')
const TEXT = new Set(['.html', '.css', '.js', '.webmanifest', '.xml', '.txt', '.json'])

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(pub, out, { recursive: true })

/** 루트 기준 주소에만 BASE를 붙인다(//로 시작하는 외부 주소·이미 붙은 것은 그대로) */
const fix = (s) => s
  .replace(/((?:href|src|action|content|data-dark|srcset)=["'])\/(?!\/|sprout\/)/g, `$1${BASE}/`)
  .replace(/url\((["']?)\/(?!\/)/g, `url($1${BASE}/`)
  .replace(/(["'`])\/(assets|art3d|icon-|favicon|apple-touch|og\.png|site\.webmanifest)/g, `$1${BASE}/$2`)
  .replace(/("start_url":\s*")\/"/g, `$1${BASE}/"`)

let n = 0
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { if (f !== 'art3d') walk(p); continue }
    if (!TEXT.has(extname(f))) continue
    const s = readFileSync(p, 'utf8'), t = fix(s)
    if (t !== s) { writeFileSync(p, t); n++ }
  }
}
walk(out)

// 옛 주소 → 새 주소(스토어에 적혀 있던 이름)
const redirect = (from, to) => writeFileSync(join(out, `${from}.html`), `<!doctype html><meta charset="utf-8"><title>이동 중</title><meta http-equiv="refresh" content="0; url=${BASE}${to}"><link rel="canonical" href="${BASE}${to}"><a href="${BASE}${to}">${BASE}${to}</a>\n`)
redirect('delete-account', '/account-deletion')
redirect('privacy-policy', '/privacy')
writeFileSync(join(out, '.nojekyll'), '')
if (!existsSync(join(out, '404.html'))) console.warn('! 404.html 없음')
console.log(`pages: ${out} (base ${BASE}, 고친 파일 ${n}개)`)
