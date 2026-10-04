import { Check, Flag, Plus, Search } from 'lucide-react'
import { ensureTags } from '../data/organization'
import { useState } from 'react'
import type { ListRow, TagRow } from '../data/types'
import { PRIORITIES } from '../lib/priority'
import { MenuItem } from './Popover'

// 여러 메뉴(우클릭·일괄 편집·상세)가 함께 쓰는 고르기 목록

/** 리스트 고르기: 검색 + 목록 (02 §9 "이동 ›", §13.3) */
export function ListPickerBody({ lists, current, onPick }: { lists: ListRow[]; current?: string | null; onPick: (l: ListRow) => void }) {
  const [q, setQ] = useState('')
  const shown = lists.filter((l) => (l.kind === 'inbox' ? '기본함' : l.name).includes(q.trim()))
  return (
    <>
      <div className="menu__search">
        <Search />
        <input autoFocus spellCheck={false} placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="menu__scroll">
        {shown.map((l) => (
          <MenuItem
            key={l.id}
            icon={<span className="sidebar__emoji">{l.kind === 'inbox' ? '📥' : (l.emoji ?? '≡')}</span>}
            label={l.kind === 'inbox' ? '기본함' : l.name}
            active={l.id === current}
            onClick={() => onPick(l)}
          />
        ))}
      </div>
    </>
  )
}

/** 태그 고르기: 검색 + 켜고 끄기 + "새 태그 만들기"(05, research 12). state는 태그별로 'all' | 'some' | 'none' */
export function TagPickerBody({ tags, state, onToggle }: { tags: TagRow[]; state: (tagId: string) => 'all' | 'some' | 'none'; onToggle: (tagId: string, on: boolean) => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const name = q.trim().replace(/^#/, '')
  const shown = tags.filter((t) => t.name.toLowerCase().includes(name.toLowerCase()))
  const canCreate = !!name && !/\s/.test(name) && !tags.some((t) => t.name === name)
  const create = async () => {
    if (!canCreate || busy) return
    setBusy(true)
    try { const [id] = await ensureTags([name]); if (id) onToggle(id, true); setQ('') } finally { setBusy(false) }
  }
  return (
    <>
      <div className="menu__search">
        <Search />
        <input
          autoFocus
          spellCheck={false}
          placeholder="태그 검색 또는 만들기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.key !== 'Enter') return
            e.preventDefault()
            const exact = tags.find((t) => t.name === name)
            if (exact) onToggle(exact.id, state(exact.id) !== 'all')
            else void create()
          }}
        />
      </div>
      <div className="menu__scroll">
        {shown.map((t) => {
          const s = state(t.id)
          return (
            <MenuItem
              key={t.id}
              icon={<span className="sidebar__dot" style={{ background: t.color ?? 'var(--color-priority-none)' }} />}
              label={t.name}
              onClick={() => onToggle(t.id, s !== 'all')}
              trail={s !== 'none' ? <Check className={`menu__check${s === 'some' ? ' is-partial' : ''}`} /> : undefined}
            />
          )
        })}
        {!shown.length && !canCreate && <div className="menu__empty">{tags.length ? '맞는 태그가 없어요' : '태그가 없어요 — 이름을 입력해 만들 수 있어요'}</div>}
        {canCreate && <MenuItem icon={<Plus />} label={`새 태그 만들기 "${name}"`} disabled={busy} onClick={() => void create()} />}
      </div>
    </>
  )
}

/** 우선순위 깃발 줄 (02 §9, §13.1) */
export function PriorityRow({ value, onPick }: { value?: number; onPick: (p: number) => void }) {
  return (
    <>
      <div className="menu__caption">우선 순위</div>
      <div className="menu__flags">
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            className={`menu__flag${value === p.value ? ' is-active' : ''}`}
            title={p.label}
            style={{ color: p.value ? p.color : 'var(--color-menu-icon)' }}
            onClick={() => onPick(p.value)}
          >
            <Flag fill={p.value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </>
  )
}
