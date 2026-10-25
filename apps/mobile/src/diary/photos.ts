// 28 §10.3 일기 사진 한 장: 고르기·찍기 → 기기에서 줄이기(긴 변 1600 · JPEG 0.8 · 다시 인코딩이라 EXIF 위치가 빠짐)
// → POST /media → diary_photos 행. 오프라인·실패면 기기 대기열(문서 폴더)에 두고 앞으로 올 때·다음 추가 때 다시 올린다.
// 보기: 기기 캐시 파일(문서 폴더/diary-photos/<media_id>.jpg) → 없으면 GET /media/:id로 받아 캐시. 올린 기기는 줄인 파일을 바로 캐시에 둔다.
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Directory, File, Paths } from 'expo-file-system'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useLiveQuery } from '../data/rows'
import { run } from '../data/db'
import { insert } from '../data/tasks'
import { serverAccess } from '../data/auth'
import { readJson, writeJson } from '../collect/localStore'

export type DiaryPhoto = { id: string; date: string; media_id: string; width: number | null; height: number | null; sort_order: number | null }
export const PHOTOS_SQL = 'SELECT id, date, media_id, width, height, sort_order FROM diary_photos WHERE date = ? ORDER BY sort_order, created_at, id'
export function usePhotos(date: string): DiaryPhoto[] {
  return useLiveQuery<DiaryPhoto>(PHOTOS_SQL, [date]).data
}
export function usePhotosBetween(from: string, to: string): DiaryPhoto[] {
  return useLiveQuery<DiaryPhoto>('SELECT id, date, media_id, width, height, sort_order FROM diary_photos WHERE date >= ? AND date <= ? ORDER BY date, sort_order, created_at', [from, to]).data
}

const dir = () => { const d = new Directory(Paths.document, 'diary-photos'); if (!d.exists) d.create({ intermediates: true }); return d }
const cacheFile = (mediaId: string) => new File(dir(), `${mediaId.replace(/[^\w-]/g, '')}.jpg`)

// ── 고르기 ──
export type Source = 'library' | 'camera'
/** 고르고 줄여서 기기 파일로. 취소면 null. 권한 거절은 'denied' */
export async function pick(source: Source): Promise<{ uri: string; width: number; height: number } | null | 'denied'> {
  // 앨범은 시스템 사진 고르기 창(iOS PHPicker · Android Photo Picker)이라 사진 보관함 권한을 묻지 않는다(고른 한 장만 받음). 카메라만 권한
  if (source === 'camera') { const perm = await ImagePicker.requestCameraPermissionsAsync(); if (!perm.granted) return 'denied' }
  const r = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false, selectionLimit: 1 })
  if (r.canceled || !r.assets?.[0]) return null
  const a = r.assets[0]
  const long = Math.max(a.width ?? 0, a.height ?? 0)
  const resize = long > 1600 ? [{ resize: (a.width ?? 0) >= (a.height ?? 0) ? { width: 1600 } : { height: 1600 } }] : []
  const out = await manipulateAsync(a.uri, resize, { compress: 0.8, format: SaveFormat.JPEG })
  return { uri: out.uri, width: out.width, height: out.height }
}

// ── 올리기(대기열) ──
type Pending = { localId: string; date: string; file: string; width: number; height: number; sort: number; at: string }
const PKEY = 'diary-photos-pending'
let flushing: Promise<void> | null = null
const listeners = new Set<() => void>()
export function usePendingPhotos(date: string): Pending[] {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump((n) => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return readJson<Pending[]>(PKEY, []).filter((p) => p.date === date)
}
const savePending = (list: Pending[]) => { writeJson(PKEY, list); listeners.forEach((l) => l()) }

/** 그날에 사진 붙이기: 대기열에 넣고 바로 올리기 시도 */
export async function addPhoto(date: string, img: { uri: string; width: number; height: number }, sort: number) {
  const localId = crypto.randomUUID()
  const f = new File(dir(), `pending-${localId}.jpg`)
  await new File(img.uri).copy(f)
  savePending([...readJson<Pending[]>(PKEY, []), { localId, date, file: f.uri, width: img.width, height: img.height, sort, at: new Date().toISOString() }])
  await flushPhotos()
}
export function flushPhotos(): Promise<void> {
  flushing ??= (async () => {
    try {
      for (const p of readJson<Pending[]>(PKEY, [])) {
        const { url, token } = await serverAccess()
        if (!token) return
        const file = new File(p.file)
        if (!file.exists) { savePending(readJson<Pending[]>(PKEY, []).filter((x) => x.localId !== p.localId)); continue }
        const res = await fetch(`${url}/media`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' }, body: file.bytesSync() as unknown as BodyInit })
        if (res.status === 429 || res.status === 413 || res.status === 400 || res.status === 415) {
          // 다시 보내도 같은 결과 — 대기열에서 뺀다(화면이 알림)
          savePending(readJson<Pending[]>(PKEY, []).filter((x) => x.localId !== p.localId))
          lastError = res.status === 429 ? '오늘은 사진을 10장까지 붙일 수 있어요' : '이 사진은 붙일 수 없어요'
          continue
        }
        if (!res.ok) return
        const { id } = (await res.json()) as { id: string }
        // 올린 기기는 줄인 파일을 그대로 캐시로
        try { const c = cacheFile(id); if (!c.exists) await file.copy(c) } catch { /* 다음에 받으면 됨 */ }
        await run([insert('diary_photos', { id: crypto.randomUUID(), date: p.date, media_id: id, width: p.width, height: p.height, sort_order: p.sort, created_at: p.at, modified_at: new Date().toISOString() })])
        try { file.delete() } catch { /* 그만 */ }
        savePending(readJson<Pending[]>(PKEY, []).filter((x) => x.localId !== p.localId))
      }
    } catch { /* 네트워크 — 다음에 */ } finally { flushing = null }
  })()
  return flushing
}
export let lastError: string | null = null
export const takeError = () => { const e = lastError; lastError = null; return e }
// 앞으로 올 때 남은 것 다시
AppState.addEventListener('change', (s) => { if (s === 'active') void flushPhotos() })

/** 사진 지우기: 행을 지우면 서버가 하루 뒤 바이트를 정리한다 */
export const removePhoto = (id: string) => run([{ sql: 'DELETE FROM diary_photos WHERE id = ?', params: [id] }])
export const removePending = (localId: string) => savePending(readJson<Pending[]>(PKEY, []).filter((x) => x.localId !== localId))

// ── 보기 ──
const loading = new Map<string, Promise<string | null>>()
async function ensureLocal(mediaId: string): Promise<string | null> {
  const c = cacheFile(mediaId)
  if (c.exists) return c.uri
  let p = loading.get(mediaId)
  if (!p) {
    p = (async () => {
      const { url, token } = await serverAccess()
      if (!token) return null
      try { const f = await File.downloadFileAsync(`${url}/media/${mediaId}`, c, { headers: { authorization: `Bearer ${token}` }, idempotent: true }); return f.uri } catch { return null }
    })().finally(() => loading.delete(mediaId))
    loading.set(mediaId, p)
  }
  return p
}
/** 사진 주소(기기 파일). 받는 중이면 null */
export function usePhotoUri(mediaId: string | null | undefined): string | null {
  const [uri, setUri] = useState<string | null>(() => { if (!mediaId) return null; const c = cacheFile(mediaId); return c.exists ? c.uri : null })
  useEffect(() => {
    if (!mediaId) { setUri(null); return }
    let live = true
    void ensureLocal(mediaId).then((u) => { if (live) setUri(u) })
    return () => { live = false }
  }, [mediaId])
  return uri
}
