// 24 §5: 링크 찾기·"링크만"(볼 것) 판정 — 데스크톱 apps/desktop/src/shared/collect.ts의 firstUrl·isBareLink를 그대로 옮긴 것.
// 데스크톱 파일은 './assistant'를 함께 끌고 와서 Metro로 바로 가져오지 않는다. 같은지는 share.test.ts가 정규식 원문과 예시로 확인한다.
// iOS 공유 확장(Swift, plugins/share-extension/ios/ShareCore.swift)도 같은 규칙 — 예시는 vectors.json 하나를 같이 쓴다.
export const URL_RE = /https?:\/\/[^\s<>"'）)\]]+/i
export const TASK_HINT = /(까지|해야|내일|오늘|모레|[월화수목금토일]요일|\d{1,2}\s*시|\d{1,2}\/\d{1,2}|\d{1,2}월\s*\d{1,2}일|요약|제출|예약|신청)/

export const firstUrl = (text: string) => text.match(URL_RE)?.[0]?.replace(/[.,!?。]+$/, '') ?? null
/** 링크만 덩그러니 있으면(앞뒤 글 40자 이하, 날짜·마감 말 없음) AI 없이 바로 볼 것 */
export function isBareLink(text: string) {
  const url = firstUrl(text)
  if (!url) return false
  const rest = text.replace(url, '').trim()
  return rest.length <= 40 && !TASK_HINT.test(rest)
}
