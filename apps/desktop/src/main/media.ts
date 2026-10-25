import { app, ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serverAccess } from './sync'

// 15 §11 · 28 §10.3 일기 사진 한 장(데스크톱): 렌더러가 줄인 JPEG 바이트를 넘기면 메인 프로세스가 토큰을 붙여 POST /media,
// 보기는 GET /media/:id → userData/diary-photos/<id>.jpg 파일 캐시 + 메모리 캐시(데이터 URL). 토큰은 렌더러로 가지 않는다.
export type MediaUpload = { ok: true; id: string } | { ok: false; status: number; error: string }

const dir = () => join(app.getPath('userData'), 'diary-photos')
const safe = (id: string) => id.replace(/[^\w-]/g, '')
const file = (id: string) => join(dir(), `${safe(id)}.jpg`)
/** 데이터 URL 메모리 캐시(최근 것 80장) */
const mem = new Map<string, string>()
const remember = (id: string, url: string) => {
  mem.delete(id)
  mem.set(id, url)
  if (mem.size > 80) mem.delete(mem.keys().next().value as string)
}
const sniff = (b: Buffer) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.subarray(8, 12).toString('ascii') === 'WEBP' ? 'image/webp' : 'image/jpeg')
const loading = new Map<string, Promise<string | null>>()

async function upload(bytes: Uint8Array, mime: string): Promise<MediaUpload> {
  const { url, token } = await serverAccess()
  if (!token) return { ok: false, status: 401, error: '로그인하면 사진을 붙일 수 있어요' }
  const body = Buffer.from(bytes)
  try {
    const res = await fetch(`${url}/media`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': mime }, body })
    if (!res.ok) {
      const error = res.status === 429 ? '오늘은 사진을 10장까지 붙일 수 있어요' : res.status === 413 ? '사진이 너무 커요' : res.status === 400 || res.status === 415 ? '이 사진은 붙일 수 없어요' : '지금은 사진을 올리지 못했어요'
      return { ok: false, status: res.status, error }
    }
    const { id } = (await res.json()) as { id: string }
    // 올린 기기는 줄인 파일을 그대로 캐시로
    try { await mkdir(dir(), { recursive: true }); await writeFile(file(id), body) } catch { /* 다음에 받으면 됨 */ }
    remember(id, `data:${mime};base64,${body.toString('base64')}`)
    return { ok: true, id }
  } catch {
    return { ok: false, status: 0, error: '인터넷이 끊겨 사진을 올리지 못했어요' }
  }
}

async function get(id: string): Promise<string | null> {
  if (!id) return null
  const hit = mem.get(id)
  if (hit) return hit
  let p = loading.get(id)
  if (!p) {
    p = (async () => {
      try {
        const b = await readFile(file(id))
        const u = `data:${sniff(b)};base64,${b.toString('base64')}`
        remember(id, u)
        return u
      } catch { /* 캐시에 없음 → 받기 */ }
      const { url, token } = await serverAccess()
      if (!token) return null
      try {
        const res = await fetch(`${url}/media/${encodeURIComponent(safe(id))}`, { headers: { authorization: `Bearer ${token}` } })
        if (!res.ok) return null
        const b = Buffer.from(await res.arrayBuffer())
        try { await mkdir(dir(), { recursive: true }); await writeFile(file(id), b) } catch { /* 이번엔 메모리만 */ }
        const u = `data:${res.headers.get('content-type')?.split(';')[0] || sniff(b)};base64,${b.toString('base64')}`
        remember(id, u)
        return u
      } catch { return null }
    })().finally(() => loading.delete(id))
    loading.set(id, p)
  }
  return p
}

export function registerMedia(): void {
  ipcMain.handle('media:upload', (_e, bytes: Uint8Array, mime: string) => upload(bytes, mime === 'image/png' || mime === 'image/webp' ? mime : 'image/jpeg'))
  ipcMain.handle('media:get', (_e, id: string) => get(String(id)))
}
