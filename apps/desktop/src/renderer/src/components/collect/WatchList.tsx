import { ChevronDown, ExternalLink, Link2 } from 'lucide-react'
import { useState } from 'react'
import { domainOf } from '../../../../shared/collect'
import { setSeen, type CollectItem } from '../../data/collect'
import { Empty, Highlight, SiteMark, sentAt, shortDay } from './shared'

type Props = {
  items: CollectItem[]
  query: string
  selected?: string
  onSelect: (id: string) => void
  onContextMenu: (item: CollectItem, e: React.MouseEvent) => void
}

/** 볼 것(v3-2): 안 본 것 N · 다 본 것 N(접힘). 행 = 동그라미 · 사이트 표시 · 제목 · 회색 도메인 · 저장 날짜 */
export function WatchList({ items, query, selected, onSelect, onContextMenu }: Props) {
  const [open, setOpen] = useState<Record<'unseen' | 'seen', boolean>>({ unseen: true, seen: false })
  const groups = [
    { id: 'unseen' as const, name: '안 본 것', rows: items.filter((n) => !n.seen_at) },
    { id: 'seen' as const, name: '다 본 것', rows: items.filter((n) => n.seen_at) }
  ].filter((g) => g.rows.length)
  if (!items.length) {
    return query
      ? <Empty icon={<Link2 className="notes__empty-icon" />} title={`"${query}"와 맞는 링크가 없어요`} />
      : <Empty icon={<Link2 className="notes__empty-icon" />} title="볼 것으로 모은 링크가 여기에 쌓여요" hint="수집에 유튜브·기사 링크를 던져 두면 제목과 함께 들어와요" />
  }
  return (
    <>
      {groups.map((g) => {
        const closed = !open[g.id] && !query
        return (
          <section key={g.id} className="group">
            <div className="group__header" onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
              <ChevronDown className={`group__chevron${closed ? ' is-collapsed' : ''}`} />
              <span className="group__name">{g.name}</span>
              <span className="group__count">{g.rows.length}</span>
            </div>
            {!closed && g.rows.map((n) => (
              <div
                key={n.id}
                data-id={n.id}
                className={`row note-row watch-row${n.id === selected ? ' is-selected' : ''}${n.seen_at ? ' is-seen' : ''}`}
                onClick={() => onSelect(n.id)}
                onDoubleClick={() => window.open(n.url!, '_blank')}
                onContextMenu={(e) => onContextMenu(n, e)}
              >
                <button
                  className={`watch-row__circle${n.seen_at ? ' is-on' : ''}`}
                  role="checkbox"
                  aria-checked={!!n.seen_at}
                  aria-label={n.seen_at ? '안 본 것으로' : '봤어요'}
                  onClick={(e) => { e.stopPropagation(); void setSeen(n.id, !n.seen_at) }}
                />
                <SiteMark url={n.url!} />
                <div className="row__main">
                  <span className="row__title"><Highlight text={n.link_title || n.url!} query={query} /><span className="watch-row__domain">{domainOf(n.url!)}</span></span>
                </div>
                <a className="watch-row__open" href={n.url!} target="_blank" rel="noreferrer" aria-label="링크 열기" onClick={(e) => e.stopPropagation()}><ExternalLink /></a>
                <span className="row__meta"><span className="row__date">{shortDay(sentAt(n))}</span></span>
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}
