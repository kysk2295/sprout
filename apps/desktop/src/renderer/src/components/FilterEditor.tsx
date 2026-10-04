import { useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Dialog } from './Dialog'
import { EMPTY_FILTER, readFilter, type FilterRow } from '../data/filters'
import { insert, run, update, uuid } from '../data/mutations'
import type { ListRow, TagRow } from '../data/types'

// 07 사용자 필터 편집(filter-edit NOTES): 이름 줄 + 조건 행(왼쪽 라벨 · 오른쪽 입력) + 취소·저장
const DATES = [['all', '전체'], ['today', '오늘'], ['tomorrow', '내일'], ['next7', '다음 7일'], ['overdue', '만료됨'], ['none', '날짜 없음']] as const
const PRIORITY_CHOICES = [[3, '높음'], [2, '중간'], [1, '낮음'], [0, '없음']] as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="filter-row"><span className="filter-row__label">{label}</span><div className="filter-row__value">{children}</div></div>
}
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`filter-pill${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>{children}</button>
}

export function FilterEditor({ item, lists, tags, onClose, onSaved }: { item?: FilterRow; lists: ListRow[]; tags: TagRow[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(item?.name ?? '')
  const [emoji, setEmoji] = useState(item?.emoji ?? '')
  const [rule, setRule] = useState(item ? readFilter(item.rule_json) : EMPTY_FILTER)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const submit = async () => {
    if (saving.current || !name.trim()) return
    saving.current = true
    setBusy(true)
    try {
      const id = item?.id ?? uuid()
      const values = { name: name.trim(), emoji: emoji.trim() || null, rule_json: JSON.stringify(rule) }
      await run(item ? update('filters', id, values) : insert('filters', { id, ...values, sort_order: Date.now() }))
      onSaved(id)
      onClose()
    } catch { setError('필터를 저장하지 못했어요. 다시 시도해 주세요.') } finally { saving.current = false; setBusy(false) }
  }
  const toggle = (key: 'lists' | 'tags', id: string) => setRule((r) => ({ ...r, [key]: r[key].includes(id) ? r[key].filter((x) => x !== id) : [...r[key], id] }))
  const togglePriority = (p: number) => setRule((r) => ({ ...r, priorities: r.priorities.includes(p) ? r.priorities.filter((x) => x !== p) : [...r.priorities, p] }))
  const title = item ? '필터 편집' : '필터 추가'
  return (
    <Dialog label={title} className="organization-dialog filter-editor" onClose={() => { if (!saving.current) onClose() }}>
      <header><h2>{title}</h2><button className="icon-btn" aria-label="닫기" onClick={onClose}><X /></button></header>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="organization-name">
          <input aria-label="이모지" placeholder="≡" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={12} />
          <input data-autofocus aria-label="이름" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <Row label="리스트">
          <Pill on={!rule.lists.length} onClick={() => setRule((r) => ({ ...r, lists: [] }))}>전체</Pill>
          {lists.map((l) => <Pill key={l.id} on={rule.lists.includes(l.id)} onClick={() => toggle('lists', l.id)}>{l.emoji ? `${l.emoji} ` : ''}{l.kind === 'inbox' ? '기본함' : l.name}</Pill>)}
        </Row>
        <Row label="태그">
          <Pill on={!rule.tags.length} onClick={() => setRule((r) => ({ ...r, tags: [] }))}>전체</Pill>
          {tags.map((t) => <Pill key={t.id} on={rule.tags.includes(t.id)} onClick={() => toggle('tags', t.id)}>{t.name}</Pill>)}
        </Row>
        <Row label="날짜">
          <select className="filter-select" aria-label="날짜" value={rule.date} onChange={(e) => setRule({ ...rule, date: e.target.value })}>
            {DATES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Row>
        <Row label="우선순위">
          <Pill on={!rule.priorities.length} onClick={() => setRule((r) => ({ ...r, priorities: [] }))}>전체</Pill>
          {PRIORITY_CHOICES.map(([p, label]) => <Pill key={p} on={rule.priorities.includes(p)} onClick={() => togglePriority(p)}>{label}</Pill>)}
        </Row>
        <Row label="포함">
          <input className="filter-input" aria-label="포함" placeholder="작업 키워드" value={rule.keyword} onChange={(e) => setRule({ ...rule, keyword: e.target.value })} />
        </Row>
        {error && <p role="alert" className="form-error">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>취소</button>
          <button className="entry-primary" disabled={busy || !name.trim()} type="submit">{busy ? '저장 중' : '저장'}</button>
        </footer>
      </form>
    </Dialog>
  )
}
