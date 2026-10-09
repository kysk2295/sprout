// 49 §4.4 · 종 묶음 내려받기(휴대폰). 앱 안 기본 묶음(art3dFiles.ts, ≈ 1 MB)에 없는 512 그림(꼬마~전설 몸·얼굴·옷·소품)을
// 내 종 것만 사이트 정적 파일(ART3D_PACK_URL, 변경 불가 캐시)에서 받아 문서 폴더(art3d/v4/)에 둔다. 받는 동안·실패하면 160 그림으로 대신 그린다.
// 받은 뒤 그리는 곳을 다시 그리게 판 번호(version)를 올린다 — CharacterArt가 useArtPackVersion으로 구독.
import { Directory, File, Paths } from 'expo-file-system'
import { useSyncExternalStore } from 'react'
import { ART3D_PACK_URL, ART3D_VERSION, bgPackFile, packFiles } from '@sprout/schema/characterArt'
import type { Species } from '@sprout/schema/growth'

let version = 0
const listeners = new Set<() => void>()
const bump = () => { version++; seen.clear(); listeners.forEach((l) => l()) }
export const useArtPackVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => version)

let dir: Directory | null = null
function packDir(): Directory | null {
  try {
    if (!dir) {
      const root = new Directory(Paths.document, 'art3d')
      if (!root.exists) root.create()
      dir = new Directory(root, ART3D_VERSION)
      if (!dir.exists) dir.create()
    }
    return dir
  } catch { return null }
}

/** 받은 파일 주소(없으면 null). 판 번호가 바뀔 때까지 있음·없음을 기억한다(그릴 때마다 파일 시스템을 묻지 않게) */
const seen = new Map<string, string | null>()
export function packUri(file: string): string | null {
  if (seen.has(file)) return seen.get(file)!
  const d = packDir()
  let uri: string | null = null
  if (d) {
    try { const f = new File(d, file); if (f.exists) uri = f.uri } catch { /* 없음 */ }
  }
  seen.set(file, uri)
  return uri
}

const running = new Map<string, Promise<void>>()
/** 이 종의 묶음을 받아 둔다(이미 받은 파일은 건너뜀). 동시에 4개씩, 실패한 파일은 다음에 다시 */
export function ensurePack(sp: Species, seed?: number): Promise<void> {
  const prev = running.get(sp)
  if (prev) return prev
  const job = (async () => {
    const d = packDir()
    if (!d) return
    seen.clear()
    const need = packFiles(sp, seed).filter((f) => !packUri(f)) // 내 씨앗의 아기 그림만(49 §14.1)
    let got = 0
    const next = async (): Promise<void> => {
      const f = need.shift()
      if (!f) return
      try {
        const tmp = new File(d, `${f}.part`)
        if (tmp.exists) tmp.delete()
        const out = await File.downloadFileAsync(ART3D_PACK_URL + f, tmp)
        out.move(new File(d, f))
        got++
        if (got % 12 === 0) bump()
      } catch { /* 네트워크 — 다음 실행 때 다시 */ }
      return next()
    }
    await Promise.all([next(), next(), next(), next()])
    if (got) bump()
  })().finally(() => running.delete(sp))
  running.set(sp, job)
  return job
}

/** 배경 묶음(49 §6.1): 고른·미리 보는 장면의 1170 그림 하나를 받는다(받는 동안 390 미리보기) */
const sceneJobs = new Map<string, Promise<void>>()
export function ensureScene(sceneKey: string): Promise<void> {
  const f = bgPackFile(sceneKey)
  if (packUri(f)) return Promise.resolve()
  const prev = sceneJobs.get(f)
  if (prev) return prev
  const job = (async () => {
    const d = packDir()
    if (!d) return
    try {
      const tmp = new File(d, `${f}.part`)
      if (tmp.exists) tmp.delete()
      const out = await File.downloadFileAsync(ART3D_PACK_URL + f, tmp)
      out.move(new File(d, f))
      bump()
    } catch { /* 네트워크 — 다음에 다시 */ }
  })().finally(() => sceneJobs.delete(f))
  sceneJobs.set(f, job)
  return job
}
