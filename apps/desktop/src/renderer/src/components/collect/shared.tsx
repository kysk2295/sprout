// 11 v3 수집함 화면 조각들이 같이 쓰는 표기·작은 부품
import { BookOpen, FileText, Link2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { isBareLink, isYoutube } from '../../../../shared/collect'
import { kindOf, suggestionOf, type CollectItem } from '../../data/collect'
import { dayKey, rowDateLabel } from '../../lib/dates'

export type Section = 'notes' | 'watch' | 'wiki'
export const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim() ?? ''
export const localDay = (iso: string) => dayKey(0, new Date(iso))
export const timeKo = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
export const monthDayKo = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
export const fullKo = (iso: string) => `${monthDayKo(iso)} ${timeKo(iso)}`
/** 원래 보낸 시각(카톡) 또는 작성 시각 */
export const sentAt = (n: Pick<CollectItem, 'captured_at' | 'created_at'>) => n.captured_at ?? n.created_at
/** "오늘" · "어제" · "10월 2일" */
export function shortDay(iso: string) {
  const d = localDay(iso)
  return d === dayKey() ? '오늘' : d === dayKey(-1) ? '어제' : monthDayKo(iso)
}
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }
/** 위키 출처 꼬리표: 카톡 10/2 · 메모 9/30 · 오늘 */
export function sourceLabel(n: Pick<CollectItem, 'source' | 'captured_at' | 'created_at'>) {
  const at = sentAt(n)
  if (n.source === 'kakao_import' || n.source === 'kakao_channel') return `카톡 ${md(at)}`
  return localDay(at) === dayKey() ? '오늘' : `메모 ${md(at)}`
}
/** 행 제목: 링크만 있는 항목은 가져온 제목을 먼저 */
export function titleOf(n: CollectItem) {
  if (n.url && n.link_title && isBareLink(n.content)) return n.link_title
  return firstLine(n.content)
}
export const registered = (n: CollectItem) => !!n.task_id
export const registeredGone = (n: CollectItem) => !!n.task_id && (!n.task_title || !!n.task_deleted)
export const scheduledWord = (n: CollectItem) => (n.task_scheduled ? '일정' : '할 일')
/** 제안 날짜 → 행 표기(02 §6과 같다): "내일 오후 3:00" */
export function suggestionDate(n: CollectItem) {
  const s = suggestionOf(n)
  if (!s?.due) return null
  return rowDateLabel({ start_at: s.start || null, due_at: s.due }, dayKey())
}

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  const ql = query.toLowerCase()
  let i = 0
  for (let at = lower.indexOf(ql); at >= 0; at = lower.indexOf(ql, i)) {
    parts.push(text.slice(i, at), <mark key={at} className="notes__mark">{text.slice(at, at + query.length)}</mark>)
    i = at + query.length
  }
  parts.push(text.slice(i))
  return <>{parts}</>
}

/** 행 왼쪽 종류 표시: 정리 중 = 회전, 할 일 = 점선 칸, 볼 것 = 링크, 위키 = 책, 메모 = 문서 */
export function KindIcon({ item }: { item: CollectItem }) {
  if (item.ai_state === 'pending') return <span className="collect-kind"><span className="collect-spin" aria-label="정리 중" /></span>
  if (item.task_id || (item.kind === 'task')) return <span className="collect-kind"><span className="collect-kind__task" /></span>
  const k = item.kind
  const Icon = k === 'link' ? Link2 : k === 'wiki' ? BookOpen : FileText
  return <span className="collect-kind"><Icon /></span>
}

/** 볼 것 사이트 표시: 유튜브는 빨간 재생 칸, 그 밖은 링크 칸 */
export function SiteMark({ url }: { url: string }) {
  return isYoutube(url) ? <span className="collect-yt" aria-label="유튜브" /> : <span className="collect-web"><Link2 /></span>
}

export function Empty({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty notes__empty">
      {icon}
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {children}
    </div>
  )
}

export const KIND_NAME = { task: '할 일', link: '볼 것', wiki: '위키', memo: '메모' } as const
export { kindOf }
