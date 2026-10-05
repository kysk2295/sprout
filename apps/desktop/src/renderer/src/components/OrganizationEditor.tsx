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
import './wiki/wiki.css'
import { ORG_COLORS } from '../lib/orgColors'
import { parseAliases } from '@sprout/schema/wikiLink'
import { DESC_MAX, KIND_ICON, KIND_LABEL, TAG_KINDS, kindOf, linkRenameStmts, type TagKind } from '../data/wiki'
import { useToast } from './Toast'

const COLORS = ORG_COLORS
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

type TagExtra = { kind?: string | null; aliases?: string | null; description?: string | null; source?: string | null }
export function OrganizationEditor({ kind, item, folderId, folders, tags = [], onClose, onSaved }: { kind: OrganizationKind; item?: OrganizationItem & TagExtra; folderId?: string; folders: FolderRow[]; tags?: OrganizationItem[]; onClose: () => void; onSaved: (id: string) => void }) {
  // 폴더는 이름 앞 이모지를 아이콘으로 떼어 보여 준다
  const initial = kind === 'folder' ? splitEmoji(item?.name ?? '') : { emoji: item?.emoji ?? null, name: item?.name ?? '' }
  const [name, setName] = useState(initial.name)
  const [emoji, setEmoji] = useState<string | null>(initial.emoji ?? null)
  const [color, setColor] = useState(item?.color ?? '')
  const [folder, setFolder] = useState(item?.folder_id ?? folderId ?? '')
  const [parent, setParent] = useState(item?.parent_id ?? '')
  const [smart, setSmart] = useState(item?.show_in_smart ?? 'all')
  // 33 §4.2 태그 편집 창: 종류 · 별칭(쉼표, 최대 5) · 설명
  const [tagKind, setTagKind] = useState<TagKind>(kindOf(item?.kind))
  const [aliases, setAliases] = useState(parseAliases(item?.aliases).join(', '))
  const [desc, setDesc] = useState(item?.description ?? '')
  const toast = useToast()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<HTMLElement | null>(null)
  const saving = useRef(false)
  const label = kind === 'list' ? '목록' : kind === 'folder' ? '폴더' : '태그'
  const submit = async () => {
    if (saving.current || !name.trim()) return
    saving.current = true; setBusy(true)
    try {
      const aliasList = [...new Set(aliases.split(',').map((a) => a.trim()).filter((a) => a && a !== name.trim()))].slice(0, 5)
      const values = kind === 'list'
        ? { name, emoji: emoji || null, color: color || null, folder_id: folder || null, show_in_smart: smart }
        : kind === 'tag'
          ? { name, color: color || null, parent_id: parent || null, kind: tagKind, aliases: aliasList.length ? JSON.stringify(aliasList) : null, description: desc.trim().slice(0, DESC_MAX) || null,
              // 사용자가 이름·종류를 고친 AI 태그는 사용자 것(§7.6 사람이 이긴다)
              ...(item?.source === 'ai' && (name.trim() !== item.name || tagKind !== kindOf(item.kind)) ? { source: 'user' } : {}) }
          : { name: joinEmoji(emoji, name) }
      // 33 §6.5: 리스트·태그 이름을 바꾸면 [[옛이름]] 링크 글도 같은 트랜잭션에서 고친다
      const links = item && kind !== 'folder' ? await linkRenameStmts(kind, item.id, item.name, name.trim()) : { stmts: [], count: 0 }
      const id = await saveOrganization(kind, item?.id, values, links.stmts)
      if (links.count && item) {
        const oldName = item.name
        toast.show(`이름을 바꿨어요 · 링크 ${links.count}곳도 고쳤어요`, async () => {
          const back = await linkRenameStmts(kind as 'list' | 'tag', id, name.trim(), oldName)
          await saveOrganization(kind, id, { name: oldName }, back.stmts)
        })
      }
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
      {kind === 'tag' && <>
        <div className="settings-row"><span>종류</span>
          <div className="org-seg" role="radiogroup" aria-label="종류">
            {TAG_KINDS.map((k) => <button type="button" key={k} role="radio" aria-checked={tagKind === k} className={tagKind === k ? 'is-on' : ''} onClick={() => setTagKind(k)}>{KIND_ICON[k] ? `${KIND_ICON[k]} ` : '# '}{KIND_LABEL[k]}</button>)}
          </div>
        </div>
        <div className="settings-row"><span>별칭</span><input className="org-input" aria-label="별칭" placeholder="쉼표로 나눠요 (최대 5개)" value={aliases} onChange={(e) => setAliases(e.target.value)} /></div>
        <div className="settings-row is-top"><span>설명</span><textarea className="org-input" aria-label="설명" rows={2} maxLength={DESC_MAX} placeholder="이 태그는 무엇인가요?" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
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
