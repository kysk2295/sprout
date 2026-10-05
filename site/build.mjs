// 꿈틀(코드네임 sprout) 사이트 빌드 — 의존성 없음(Node 20+). `node build.mjs` → public/*.html
// 법률 문서는 ../docs/release/legal/*.md(정본)에서 매번 다시 만든다. 문서를 고치면 다시 빌드만 하면 된다.
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import cfg from './site.config.mjs'
import { landing, support, notFound } from './src/pages.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, 'public')
const legalDir = join(here, '../docs/release/legal')
mkdirSync(join(pub, 'assets'), { recursive: true })

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isPh = (v) => String(v).startsWith('[')
/** 정해지지 않은 값은 노란 표시로, 이메일은 링크로 */
const phEn = (v) => v.replace('도메인', 'domain').replace('미정', 'TBD').replace('운영자', 'operator')
export const val = (v) => (isPh(v) ? `<mark class="ph"><span lang="ko" data-l="ko">${esc(v)}</span><span lang="en" data-l="en">${esc(phEn(v))}</span></mark>` : /@/.test(v) ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : esc(v))

// ── 아주 작은 마크다운 변환기(법률 문서에 쓰인 문법만: 제목·문단·목록(중첩)·표·인용·구분선·굵게·코드·링크) ──
const LINKS = { 'privacy-policy': '/privacy', terms: '/terms', 'account-deletion': '/account-deletion' }
function inline(src) {
  let s = esc(src)
  const codes = []
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000` })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    if (/^https?:\/\//.test(url)) return `<a href="${url}" rel="noopener">${text}</a>`
    const md = url.match(/^([a-z-]+)\.(?:ko|en)\.md$|^([a-z-]+)\.md$/)
    if (md) { const to = LINKS[md[1] || md[2]]; return to ? `<a href="${to}">${text}</a>` : text }
    return m
  })
  // 남은 [ ... ] = 채울 자리 → 노란 표시(태그 안은 건드리지 않음)
  s = s.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(/\[([^\]\n]+)\]/g, '<mark class="ph">[$1]</mark>'))).join('')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`)
}
function md(text) {
  const lines = text.replace(/\r/g, '').split('\n')
  const out = []
  let i = 0, h2 = 0
  const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    let m
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const n = m[1].length
      const id = n === 2 ? ` id="s${++h2}"` : ''
      out.push(`<h${n}${id}>${inline(m[2])}</h${n}>`); i++; continue
    }
    if (/^-{3,}\s*$/.test(line)) { out.push('<hr>'); i++; continue }
    if (line.startsWith('>')) {
      const buf = []
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`); continue
    }
    if (line.startsWith('|') && lines[i + 1] && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(line); i += 2
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]))
      out.push(`<div class="table" tabindex="0"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    if (listRe.test(line)) {
      // 들여쓰기로 중첩을 만든다
      const items = []
      while (i < lines.length && lines[i].trim()) {
        const lm = lines[i].match(listRe)
        if (lm) items.push({ indent: lm[1].length, ordered: /\d/.test(lm[2]), text: lm[3] })
        else if (items.length) items[items.length - 1].text += ' ' + lines[i].trim()
        i++
      }
      let pos = 0
      const build = (indent) => {
        const ordered = items[pos].ordered
        let html = ordered ? '<ol>' : '<ul>'
        while (pos < items.length && items[pos].indent >= indent) {
          if (items[pos].indent > indent) { html = html.replace(/<\/li>$/, '') + build(items[pos].indent) + '</li>'; continue }
          html += `<li>${inline(items[pos].text)}</li>`; pos++
        }
        return html + (ordered ? '</ol>' : '</ul>')
      }
      while (pos < items.length) out.push(build(items[pos].indent))
      continue
    }
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\||-{3,}\s*$)/.test(lines[i]) && !listRe.test(lines[i])) buf.push(lines[i++].trim())
    out.push(`<p>${inline(buf.join(' '))}</p>`)
  }
  return out.join('\n')
}

// ── 공용 틀 ──
const T = (ko, en) => `<span lang="ko" data-l="ko">${ko}</span><span lang="en" data-l="en">${en}</span>`
const icon = {
  sun: '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>'
}
const headScript = `(function(){var r=document.documentElement,q=null,s=null,t=null;try{q=new URLSearchParams(location.search).get('lang')}catch(e){}try{s=localStorage.getItem('lang');t=localStorage.getItem('theme')}catch(e){}var l=(q==='en'||q==='ko')?q:(s==='en'?'en':'ko');r.setAttribute('data-lang',l);r.setAttribute('lang',l);if(t==='dark'||t==='light')r.setAttribute('data-theme',t);r.classList.add('js')})()`

const headHash = createHash('sha256').update(headScript).digest('base64')

export function page({ path, titleKo, titleEn, descKo, descEn, body, scripts = [] }) {
  const url = cfg.baseUrl + path
  return `<!doctype html>
<html lang="ko" data-lang="ko" data-title-ko="${esc(titleKo)}" data-title-en="${esc(titleEn)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titleKo)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'sha256-${headHash}'; base-uri 'none'; form-action 'none'">
<script>${headScript}</script>
<meta name="description" content="${esc(descKo)}">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light dark">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ko" href="${url}">
<link rel="alternate" hreflang="en" href="${url}?lang=en">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:title" content="${esc(titleKo)}">
<meta property="og:description" content="${esc(descKo)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${cfg.baseUrl}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ko_KR">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleEn)}">
<meta name="twitter:description" content="${esc(descEn)}">
<meta name="twitter:image" content="${cfg.baseUrl}/og.png">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/styles.css?v=${version}">
</head>
<body>
<a class="skip" href="#main">${T('본문으로 건너뛰기', 'Skip to content')}</a>
${header(path)}
<main id="main">
${body}
</main>
${footer()}
<script src="/assets/app.js?v=${version}" defer></script>${scripts.map((f) => `\n<script src="/assets/${f}?v=${version}" defer></script>`).join('')}
</body>
</html>
`
}
const version = Date.now().toString(36)

function header(path) {
  const home = path === '/'
  const nav = home
    ? `<nav class="nav" aria-label="${'페이지'}"><a href="#tasks">${T('할 일', 'Tasks')}</a><a href="#growth">${T('성장', 'Growth')}</a><a href="#map">${T('작업 지도', 'Work map')}</a><a href="#calendar">${T('캘린더', 'Calendar')}</a><a href="#privacy">${T('개인정보', 'Privacy')}</a><a href="#install">${T('설치', 'Install')}</a><a href="#faq">FAQ</a></nav>`
    : `<nav class="nav" aria-label="페이지"><a href="/">${T('홈', 'Home')}</a><a href="/support">${T('지원', 'Support')}</a></nav>`
  return `<header class="top"><div class="wrap">
<a class="brand" href="/" aria-label="${esc(cfg.name)} 홈" data-aria-ko="${esc(cfg.name)} 홈" data-aria-en="${esc(cfg.nameEn)} home"><img src="/favicon.svg" alt="" width="30" height="30">${T(esc(cfg.name), esc(cfg.nameEn))}</a>
${nav}
<div class="tools">
<button class="tbtn" type="button" data-lang-toggle aria-label="Change language / 언어 바꾸기">${T('EN', '한국어')}</button>
<button class="tbtn" type="button" data-theme-toggle aria-label="밝게·어둡게 바꾸기" data-aria-ko="밝게·어둡게 바꾸기" data-aria-en="Toggle light or dark">${icon.moon}${icon.sun}</button>
</div>
</div></header>`
}
function footer() {
  return `<footer class="foot"><div class="wrap">
<div><a class="brand" href="/"><img src="/favicon.svg" alt="" width="24" height="24">${T(esc(cfg.name), esc(cfg.nameEn))}</a>
<div>${T(`운영: ${val(cfg.operator)}`, `Operated by ${val(cfg.operatorEn)}`)}</div>
<div>© ${cfg.year} ${T(val(cfg.copyrightHolder), val(cfg.copyrightHolderEn))}</div>
<div>${T('문의', 'Contact')}: ${val(cfg.supportEmail)}</div></div>
<nav aria-label="${'사이트 정보'}">
<a href="/privacy">${T('개인정보 처리방침', 'Privacy Policy')}</a>
<a href="/terms">${T('이용약관', 'Terms of Service')}</a>
<a href="/account-deletion">${T('계정 삭제', 'Delete account')}</a>
<a href="/support">${T('지원', 'Support')}</a>
</nav>
</div></footer>`
}

// ── 법률 문서 ──
function legal(file, path, titleKo, titleEn) {
  const read = (lang) => {
    let src = readFileSync(join(legalDir, `${file}.${lang}.md`), 'utf8')
    // 맨 위 내부 메모 인용("초안 — 법률 검토 필요"·"내부 메모"·"Internal note")은 빼고, 대신 설정에 따라 띠를 붙인다
    src = src.replace(/^>\s*\*\*(초안|DRAFT|내부 메모|Internal note)[^\n]*\n(>[^\n]*\n)*/, '')
    src = src
      .replaceAll('[제품명]', cfg.name).replaceAll('[Product Name]', cfg.nameEn)
      .replaceAll('[support@도메인]', '\u0001S').replaceAll('[support@domain]', '\u0001S')
      .replaceAll('[privacy@도메인]', '\u0001P').replaceAll('[privacy@domain]', '\u0001P')
    let html = md(src)
    return html.replaceAll('\u0001S', val(cfg.supportEmail)).replaceAll('\u0001P', val(cfg.privacyEmail))
  }
  const banner = cfg.legalDraftBanner
    ? `<div class="draft" role="note">${T('이 문서는 출시 전 초안이에요. 법률 검토 후 확정하며, <mark class="ph">노란 칸</mark>은 아직 정하지 않은 내용입니다.', 'This is a pre-release draft pending legal review. <mark class="ph">Highlighted</mark> items are not final yet. The Korean version governs if the two differ.')}</div>`
    : ''
  const others = [['/privacy', '개인정보 처리방침', 'Privacy Policy'], ['/terms', '이용약관', 'Terms of Service'], ['/account-deletion', '계정 삭제 안내', 'Account deletion'], ['/support', '지원', 'Support']]
    .filter(([p]) => p !== path).map(([p, k, e]) => `<a href="${p}">${T(k, e)}</a>`).join('')
  const body = `<article class="doc">
<div class="crumbs"><a href="/">${T('홈', 'Home')}</a> › ${T(titleKo, titleEn)}</div>
${banner}
<div lang="ko" data-l="ko">${read('ko')}</div>
<div lang="en" data-l="en">${read('en')}</div>
<nav class="doc-links" aria-label="다른 문서">${others}</nav>
</article>`
  return page({ path, titleKo: `${titleKo} — ${cfg.name}`, titleEn: `${titleEn} — ${cfg.nameEn}`, descKo: `${cfg.name} ${titleKo}`, descEn: `${cfg.nameEn} ${titleEn}`, body })
}

const ctx = { cfg, T, esc, val, page }
const files = {
  'index.html': landing(ctx),
  'support.html': support(ctx),
  '404.html': notFound(ctx)
}
if (existsSync(legalDir)) {
  files['privacy.html'] = legal('privacy-policy', '/privacy', '개인정보 처리방침', 'Privacy Policy')
  files['terms.html'] = legal('terms', '/terms', '이용약관', 'Terms of Service')
  files['account-deletion.html'] = legal('account-deletion', '/account-deletion', '계정 삭제 안내', 'Delete your account')
} else console.warn('! docs/release/legal 없음 — 법률 페이지는 예전 빌드를 그대로 둔다')
for (const [f, html] of Object.entries(files)) writeFileSync(join(pub, f), html)

copyFileSync(join(here, 'src/styles.css'), join(pub, 'assets/styles.css'))
copyFileSync(join(here, 'src/app.js'), join(pub, 'assets/app.js'))
copyFileSync(join(here, 'src/demos.js'), join(pub, 'assets/demos.js'))
writeFileSync(join(pub, 'site.webmanifest'), JSON.stringify({
  name: cfg.name, short_name: cfg.name, start_url: '/', display: 'standalone', theme_color: '#2BAE66', background_color: '#ffffff',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
}, null, 2))
writeFileSync(join(pub, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${cfg.baseUrl}/sitemap.xml\n`)
writeFileSync(join(pub, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/privacy', '/terms', '/account-deletion', '/support'].map((p) => `  <url><loc>${cfg.baseUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`)
console.log('built:', Object.keys(files).join(', '))
