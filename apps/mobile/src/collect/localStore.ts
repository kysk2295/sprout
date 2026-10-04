// 기기에만 두는 작은 JSON(동기화 안 함): 위키 "본 버전"(새로 바뀐 점·띠 기준), AI 비서 대화 기록(27 M-A5).
// 데스크톱 localStorage 자리. 문서 폴더의 파일 하나 = 키 하나. 읽기·쓰기 실패는 조용히 넘긴다(점이 한 번 더 보일 뿐).
import { File, Paths } from 'expo-file-system'

const fileOf = (key: string) => new File(Paths.document, `${key.replace(/[^\w.@-]/g, '_')}.json`)

export function readJson<T>(key: string, fallback: T): T {
  try {
    const f = fileOf(key)
    return f.exists ? (JSON.parse(f.textSync()) as T) : fallback
  } catch {
    return fallback
  }
}
export function writeJson(key: string, value: unknown) {
  try {
    const f = fileOf(key)
    if (!f.exists) f.create()
    f.write(JSON.stringify(value))
  } catch (e) {
    console.warn('[localStore] write failed', key, e)
  }
}
export function removeJson(key: string) {
  try { const f = fileOf(key); if (f.exists) f.delete() } catch { /* 없으면 그만 */ }
}
