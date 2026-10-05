// 로컬 미리보기: node scripts/serve.mjs [포트=4173] — Caddy와 같은 규칙(/privacy → privacy.html, 없으면 404.html)
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const pub = join(dirname(fileURLToPath(import.meta.url)), '../public')
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' }
const port = +(process.argv[2] || 4173)
createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/healthz') return res.end('ok')
  for (const c of [p, p + '.html', join(p, 'index.html')]) {
    const f = join(pub, c)
    if (!f.startsWith(pub)) break
    try { if ((await stat(f)).isFile()) { res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); return res.end(await readFile(f)) } } catch {}
  }
  res.writeHead(404, { 'content-type': types['.html'] }); res.end(await readFile(join(pub, '404.html')))
}).listen(port, () => console.log(`http://localhost:${port}`))
