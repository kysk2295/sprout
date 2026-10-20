// 동기화 진단 기록(2026-10-21 휴대폰·Windows가 서버에 안 붙는 원인 찾기): 문서 폴더 sync-log.txt에 한 줄씩(최근 300줄).
// 릴리스 빌드는 console이 밖으로 안 보이므로 파일로 남기고, 개발 기기에서는 devicectl로 꺼내 본다. 토큰·글 내용은 쓰지 않는다.
import { File, Paths } from 'expo-file-system'

const MAX = 300
let lines: string[] | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const file = () => new File(Paths.document, 'sync-log.txt')

function load() {
  if (lines) return lines
  try { const f = file(); lines = f.exists ? f.textSync().split('\n').filter(Boolean).slice(-MAX) : [] } catch { lines = [] }
  return lines
}
function flush() {
  try { const f = file(); if (!f.exists) f.create(); f.write(load().join('\n') + '\n') } catch { /* 진단일 뿐 */ }
}
export function slog(...parts: unknown[]) {
  const text = parts.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  const l = load()
  l.push(`${new Date().toISOString()} ${text.slice(0, 400)}`)
  if (l.length > MAX) l.splice(0, l.length - MAX)
  clearTimeout(timer)
  timer = setTimeout(flush, 500)
}
