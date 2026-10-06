import { AlarmClock, ChartColumn, Rocket, Sprout, Tag } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { noticeTime, type NoticeKind } from '../../../shared/notices'
import { undoAutoTagAt } from '../data/autoTag'
import { markNoticeUndone, readNotice, type Notice, type NoticeTarget } from '../data/notices'
import { Popover } from './Popover'
import { useToast } from './Toast'

// 01 §3.3 레일 종 알림 패널: 종 오른쪽 팝오버 — 머리(알림 · 모두 읽음) · 줄 목록 · 빈 상태
const ICON: Record<NoticeKind, ReactNode> = { reminder: <AlarmClock />, levelup: <Sprout />, report: <ChartColumn />, autotag: <Tag />, project: <Rocket /> }

export function NoticePanel({ anchor, items, onClose, onOpen }: { anchor: HTMLElement | null; items: Notice[]; onClose: () => void; onOpen: (t: NoticeTarget) => void }) {
  const unread = items.some((n) => !n.read)
  // 열 때 한 번 잰다(Popover가 rect가 바뀔 때마다 다시 자리를 잡으므로 매번 새 객체를 주면 안 된다). 종 오른쪽, 아래를 창 아래에 맞춘다
  const [rect] = useState(() => anchor?.getBoundingClientRect())
  return (
    <Popover rect={rect} placement="side" onClose={onClose} width={340} className="notice-panel" anchor={anchor}>
      <header className="notice-panel__head">
        <h2>알림</h2>
        <button className="notice-panel__all" disabled={!unread} onClick={() => void readNotice()}>모두 읽음</button>
      </header>
      {items.length === 0 ? <NoticeEmpty /> : (
        <ul className="notice-panel__list" role="list">
          {items.map((n) => <NoticeRow key={n.id} n={n} onOpen={(t) => { void readNotice(n.id); onClose(); onOpen(t) }} />)}
        </ul>
      )}
    </Popover>
  )
}

function NoticeRow({ n, onOpen }: { n: Notice; onOpen: (t: NoticeTarget) => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const click = () => { if (n.target) onOpen(n.target); else if (!n.read) void readNotice(n.id) }
  const undo = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await undoAutoTagAt(n.undo ?? [])
      await markNoticeUndone(n.id)
    } catch (err) {
      console.warn('[notices] 되돌리기 실패', err)
      toast.show('되돌리지 못했어요')
    } finally { setBusy(false) }
  }
  return (
    <li className={`notice-row${n.read ? '' : ' is-unread'}`} role="button" tabIndex={0} onClick={click} onKeyDown={(e) => { if (e.key === 'Enter') click() }}>
      <span className="notice-row__dot" aria-label={n.read ? undefined : '안 읽음'} />
      <span className={`notice-row__icon notice-row__icon--${n.kind}`}>{ICON[n.kind]}</span>
      <span className="notice-row__text">
        <span className="notice-row__title">{n.title}</span>
        {n.body && <span className="notice-row__body">{n.body}</span>}
      </span>
      <span className="notice-row__side">
        <time dateTime={n.at}>{noticeTime(n.at)}</time>
        {n.kind === 'autotag' && !n.undone && (n.undo?.length ?? 0) > 0 && <button className="notice-row__undo" disabled={busy} onClick={(e) => void undo(e)}>되돌리기</button>}
      </span>
    </li>
  )
}

/** 빈 상태: 직접 그린 종 선화(틱틱 그림은 쓰지 않는다) */
function NoticeEmpty() {
  return (
    <div className="notice-panel__empty">
      <svg width="88" height="88" viewBox="0 0 96 96" fill="none" aria-hidden>
        <circle cx="48" cy="48" r="40" fill="var(--color-bg-input)" />
        <path d="M34 60V44a14 14 0 0 1 28 0v16l4 5H30z" fill="var(--color-bg-app)" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M43 69a5 5 0 0 0 10 0" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinecap="round" />
        <path d="M48 26v4" stroke="var(--color-text-quaternary)" strokeWidth="2" strokeLinecap="round" />
        <path d="M68 30l2-2M71 38h3M26 30l-2-2" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="empty__title">알림이 없어요</p>
      <p className="empty__hint">할 일 알림·레벨업·주간 리포트 소식이 여기에 모여요</p>
    </div>
  )
}
