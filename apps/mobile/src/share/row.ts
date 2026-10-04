// 24 §5: 공유 항목 → notes 행·업로드 연산. 순수 함수(시험·확장과 같은 모양).
// 링크만이면 데스크톱 itemRow처럼 kind 'link'·ai_state 'done'(M-S1), 나머지는 ai_state 'pending' → 데스크톱 수집기가 분류.
import { firstUrl, isBareLink } from './link.ts'

/** 대기열 파일 한 개(App Group 폴더 share-queue/<id>.json). 확장과 본 앱이 같이 쓰는 형식 */
export interface ShareItem {
  v: 1
  id: string
  content: string
  captured_at: string // 공유한 시각(ISO). 늦게 들어가도 이 값 유지
  user_id: string | null // 공유할 때 로그인해 있던 사용자(토큰 sub). 다른 계정으로 바뀌었으면 넣지 않는다
}

/** 덧붙인 글 + 공유 내용(앞뒤 공백 정리, 빈 쪽은 뺀다) */
export const composeContent = (memo: string, shared: string) => [memo.trim(), shared.trim()].filter(Boolean).join('\n')

/** notes 칸(owner_id 제외 — 서버가 토큰 사용자로 강제, 로컬은 넣는 쪽이 채움) */
export function shareRow(content: string, capturedAt: string) {
  const text = content.trim()
  const bare = isBareLink(text)
  return {
    content: text,
    task_id: null,
    url: firstUrl(text),
    kind: bare ? 'link' : null,
    kind_source: bare ? 'ai' : null,
    ai_state: bare ? 'done' : 'pending',
    source: 'app',
    captured_at: capturedAt,
    fingerprint: null,
    created_at: capturedAt,
    modified_at: capturedAt
  }
}

/** POST /sync/upload 본문(PowerSync 연결자와 같은 형식). PUT = 같은 id면 덮어쓰기라 두 번 와도 한 줄 */
export const uploadBody = (item: ShareItem) => ({ batch: [{ op: 'PUT' as const, table: 'notes', id: item.id, data: shareRow(item.content, item.captured_at) }] })

export function parseItem(raw: string): ShareItem | null {
  try {
    const o = JSON.parse(raw) as Partial<ShareItem>
    if (o?.v !== 1 || typeof o.id !== 'string' || !o.id || o.id.length > 64) return null
    if (typeof o.content !== 'string' || !o.content.trim() || typeof o.captured_at !== 'string') return null
    return { v: 1, id: o.id, content: o.content, captured_at: o.captured_at, user_id: typeof o.user_id === 'string' ? o.user_id : null }
  } catch {
    return null
  }
}
