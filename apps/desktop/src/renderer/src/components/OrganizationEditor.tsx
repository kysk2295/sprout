// 05 리스트·폴더·태그 추가/편집 + 30 §A 아이콘 고르기.
// 목록: 틱틱 Add List 2026처럼 두 칸(왼쪽 폼 + 오른쪽 실시간 미리보기, 좁은 창 < 640에서는 미리보기 숨김), `≡` 버튼 → 이모지 선택기(lists.emoji).
// 폴더: 같은 이모지 선택기, 고른 이모지는 이름 앞에 붙여 저장(`🎓Study`)하고 표시할 때 뗀다(스키마 변경 없음).
// 드롭다운은 앱 공용 메뉴 팝오버(브라우저 기본 select 쓰지 않음).
import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Folder, X } from 'lucide-react'
import { Dialog } from './Dialog'
import { EmojiPicker } from './EmojiPicker'
import { MenuItem, Popover } from './Popover'
import { saveOrganization, type FolderRow, type OrganizationItem, type OrganizationKind } from '../data/organization'
import { joinEmoji, splitEmoji } from '../../../shared/emoji'
import './EmojiPicker.css'

const COLORS = ['', '#ff6467', '#ffb74d', '#ffd54f', '#d4e157', '#4ade80', '#60a5fa', '#818cf8', '#c084fc']
const SMART: [string, string][] = [['all', '모든 작업'], ['none', '표시하지 않음']]

/** 메뉴 팝오버 드롭다운 */
function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const cur = options.find(([v]) => v === value)?.[1] ?? options[0]?.[1]
  return (
    <>
      <button type="button" className="org-select" aria-label={label} aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <span>{cur}</span><ChevronDown />
      </button>
      {anchor && (
        <Popover anchor={anchor} align="end" width={Math.max(180, anchor.offsetWidth)} className="menu" onClose={() => setAnchor(null)}>
          <div className="menu__scroll">
            {options.map(([v, l]) => <MenuItem key={v} label={l as string} active={v === value} onClick={() => { onChange(v); setAnchor(null) }} />)}
          </div>
        </Popover>
      )}
    </>
  )
}

export function OrganizationEditor({ kind, item, folderId, folders, tags = [], onClose, onSaved }: { kind: OrganizationKind; item?: OrganizationItem; folderId?: string; folders: FolderRow[]; tags?: OrganizationItem[]; onClose: () => void; onSaved: (id: string) => void }) {
  // 폴더는 이름 앞 이모지를 아이콘으로 떼어 보여 준다
  const initial = kind === 'folder' ? splitEmoji(item?.name ?? '') : { emoji: item?.emoji ?? null, name: item?.name ?? '' }
  const [name, setName] = useState(initial.name)
  const [emoji, setEmoji] = useState<string | null>(initial.emoji ?? null)
  const [color, setColor] = useState(item?.color ?? '')
  const [folder, setFolder] = useState(item?.folder_id ?? folderId ?? '')
  const [parent, setParent] = useState(item?.parent_id ?? '')
  const [smart, setSmart] = useState(item?.show_in_smart ?? 'all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<HTMLElement | null>(null)
  const saving = useRef(false)
  const label = kind === 'list' ? '목록' : kind === 'folder' ? '폴더' : '태그'
  const submit = async () => {
    if (saving.current || !name.trim()) return
    saving.current = true; setBusy(true)
    try {
      const values = kind === 'list'
        ? { name, emoji: emoji || null, color: color || null, folder_id: folder || null, show_in_smart: smart }
        : kind === 'tag' ? { name, color: color || null, parent_id: parent || null } : { name: joinEmoji(emoji, name) }
      const id = await saveOrganization(kind, item?.id, values)
      onSaved(id); onClose()
    } catch (e) { setError(String(e)) } finally { saving.current = false; setBusy(false) }
  }
  const iconBtn = kind !== 'tag' && (
    <button type="button" className={`org-icon-btn${emoji ? ' is-emoji' : ''}`} aria-label="아이콘 고르기" title="아이콘 고르기" onClick={(e) => setPicker(picker ? null : e.currentTarget)}>
      {emoji ?? (kind === 'folder' ? <Folder size={18} /> : '≡')}
    </button>
  )
  const form = (
    <form className="org-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <header><h2>{label} {item ? '편집' : '추가'}</h2><button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><X /></button></header>
      <div className="organization-name">{iconBtn}<input data-autofocus aria-label="이름" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
      {kind !== 'folder' && <div className="settings-row"><span>{label} 색상</span><div className="color-choices">{COLORS.map((c) => <button type="button" key={c} aria-label={c || '색상 없음'} aria-pressed={color === c} className={color === c ? 'is-selected' : ''} style={{ background: c || 'transparent' }} onClick={() => setColor(c)}>{!c ? '∅' : ''}</button>)}</div></div>}
      {kind === 'list' && <>
        <div className="settings-row"><span>폴더</span><Select label="폴더" value={folder} options={[['', '없음'], ...folders.map((f) => [f.id, (() => { const s = splitEmoji(f.name); return s.emoji ? `${s.emoji} ${s.name}` : s.name })()] as [string, string])]} onChange={setFolder} /></div>
        <div className="settings-row"><span>스마트 목록에 표시</span><Select label="스마트 목록에 표시" value={smart} options={SMART} onChange={setSmart} /></div>
      </>}
      {kind === 'tag' && <div className="settings-row"><span>부모 태그</span><Select label="부모 태그" value={parent} options={[['', '없음'], ...tags.filter((t) => !t.parent_id && t.id !== item?.id).map((t) => [t.id, t.name] as [string, string])]} onChange={setParent} /></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" onClick={onClose} disabled={busy}>취소</button><button className="entry-primary" disabled={!name.trim() || busy}>{busy ? '저장 중' : '저장'}</button></footer>
    </form>
  )
  const folderName = folders.find((f) => f.id === folder)?.name
  return (
    <Dialog label={`${label} ${item ? '편집' : '추가'}`} className={`organization-dialog${kind === 'list' ? ' is-split' : ''}`} onClose={() => { if (!saving.current) onClose() }}>
      {form}
      {kind === 'list' && (
        <aside className="org-preview" aria-label="미리보기">
          <div className="org-preview__side">
            <span className="org-preview__icon">{emoji ?? '≡'}</span>
            <span className="org-preview__name">{name.trim() || '이름'}</span>
            {color && <span className="org-preview__dot" style={{ background: color }} />}
          </div>
          <div className="org-preview__page">
            <div className="org-preview__title">{folderName ? `${splitEmoji(folderName).name} › ` : ''}{name.trim() || '이름'}</div>
            <div className="org-preview__row"><i /><b /></div>
            <div className="org-preview__row"><i /><b /></div>
            <div className="org-preview__row"><i /><b /></div>
          </div>
        </aside>
      )}
      {picker && <EmojiPicker anchor={picker} onPick={setEmoji} onClose={() => setPicker(null)} />}
    </Dialog>
  )
}
