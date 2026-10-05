// 01 §3.3 알림 패널(레일 종): 이 기기의 앱 알림 기록. 메인 프로세스(main/notices.ts)가 파일로 갖고, 웹 미리보기는 localStorage.
// 여기는 순수 규칙만(합치기·자르기·시각 표기) — 시험(tests/notices.test.ts)에서 바로 부른다.

export type NoticeKind = 'reminder' | 'levelup' | 'report' | 'autotag' | 'project'
export type NoticeTarget =
  | { view: 'tasks'; task: string }
  | { view: 'calendar'; event: string }
  | { view: 'growth' }
  | { view: 'map' }
export type Notice = {
  id: string
  kind: NoticeKind
  /** 같은 일을 두 번 넣지 않는 열쇠(알림 키 · levelup:<캐릭터>:<레벨> · report:<주> · autotag:<날짜>) */
  key: string
  title: string
  body?: string
  at: string
  read: boolean
  target?: NoticeTarget
  /** autotag: 그날 붙인 개수(합친 줄) */
  count?: number
  /** autotag: 되돌릴 묶음 시각들(tagTasks의 at) */
  undo?: string[]
  undone?: boolean
}
export type NoticeInput = Omit<Notice, 'id' | 'at' | 'read'> & { at?: string; read?: boolean }

export const NOTICE_MAX = 100
export const NOTICE_DAYS = 30

/** 새 알림을 맨 앞에. 같은 key가 있으면: autotag는 개수·되돌리기 묶음을 더해 다시 안 읽음으로 맨 앞에, 나머지는 그대로(중복 무시) */
export function mergeNotice(list: Notice[], input: NoticeInput, now: string, id: string): Notice[] {
  const i = list.findIndex((n) => n.key === input.key)
  if (i >= 0) {
    const old = list[i]
    if (input.kind !== 'autotag') return list
    // 되돌린 줄 뒤에 또 붙이면 새 줄로(되돌린 기록은 지운다)
    if (old.undone) return mergeNotice([...list.slice(0, i), ...list.slice(i + 1)], input, now, id)
    const merged: Notice = { ...old, count: (old.count ?? 0) + (input.count ?? 0), undo: [...(old.undo ?? []), ...(input.undo ?? [])], at: input.at ?? now, read: input.read ?? false, title: autoTagTitle((old.count ?? 0) + (input.count ?? 0)) }
    return prune([merged, ...list.slice(0, i), ...list.slice(i + 1)], now)
  }
  const { read, at, ...rest } = input
  return prune([{ ...rest, id, at: at ?? now, read: !!read }, ...list], now)
}

/** 최근 100개 · 30일 */
export function prune(list: Notice[], now: string): Notice[] {
  const cut = Date.parse(now) - NOTICE_DAYS * 86_400_000
  return list.filter((n) => Date.parse(n.at) >= cut).slice(0, NOTICE_MAX)
}

export const markRead = (list: Notice[], id?: string): Notice[] => list.map((n) => (id === undefined || n.id === id ? (n.read ? n : { ...n, read: true }) : n))
export const markUndone = (list: Notice[], id: string): Notice[] => list.map((n) => (n.id === id ? { ...n, undone: true, read: true, title: '자동 태그를 되돌렸어요' } : n))
export const unreadCount = (list: Notice[]) => list.filter((n) => !n.read).length

export const autoTagTitle = (n: number) => `AI가 태그 ${n}개 붙였어요`

/** 행 오른쪽 시각: 방금 · N분 전 · N시간 전 · 어제 · M월 D일 */
export function noticeTime(at: string, now: Date = new Date()): string {
  const t = new Date(at)
  const diff = now.getTime() - t.getTime()
  if (diff < 60_000) return '방금'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(t)) / 86_400_000)
  if (days === 0) return `${Math.floor(diff / 3600_000)}시간 전`
  if (days === 1) return '어제'
  return `${t.getMonth() + 1}월 ${t.getDate()}일`
}
