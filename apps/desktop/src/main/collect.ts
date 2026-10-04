import { ipcMain } from 'electron'
import { isIP } from 'node:net'
import { isYoutube } from '../shared/collect'

// 11 v3-3: 볼 것 링크의 제목만 가져온다(요약하지 않는다). 유튜브는 oEmbed, 그 밖은 페이지 <title>
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m)
const tidy = (s: string) => decode(s).replace(/\s+/g, ' ').trim().slice(0, 200)

/** 내부망·이 기기 주소는 열지 않는다(가져온 카톡 링크가 공유기 관리 화면 등을 건드리지 않게) */
function allowed(url: URL) {
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (isIP(host) === 4) return !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  if (isIP(host) === 6) return !/^(::1?$|f[cd]|fe80)/i.test(host)
  return true
}

async function readHead(res: Response, limit = 256 * 1024) {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (text.length < limit) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (/<\/head>/i.test(text)) break
    }
  } finally { await reader.cancel().catch(() => {}) }
  return text
}

export async function linkTitle(raw: string): Promise<string> {
  let url: URL
  try { url = new URL(raw) } catch { return '' }
  if (!allowed(url)) return ''
  const signal = AbortSignal.timeout(8000)
  try {
    if (isYoutube(url.href)) {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`, { signal })
      if (!res.ok) return ''
      const json = await res.json()
      return typeof json.title === 'string' ? tidy(json.title) : ''
    }
    const res = await fetch(url, { signal, redirect: 'follow', headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Macintosh) sprout-link-title' } })
    if (!res.ok || !/text\/html|application\/xhtml/i.test(res.headers.get('content-type') ?? '')) return ''
    const html = await readHead(res)
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i)
    const title = og?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
    return tidy(title)
  } catch { return '' }
}

export function registerCollect() {
  ipcMain.handle('collect:link-title', (_e, url: unknown) => (typeof url === 'string' && url.length <= 2000 ? linkTitle(url) : ''))
}
