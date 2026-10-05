import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Hash, Plus } from 'lucide-react'
import { matchRank, parseAliases } from '@sprout/schema/wikiLink'
import { useQuery } from '../../data/useQuery'
import { getDb } from '../../data/db'
import { ensureTags } from '../../data/organization'
import { KIND_ICON, kindOf } from '../../data/wiki'
import { listView } from '../../data/types'
import { splitEmoji } from '../../../../shared/emoji'
import './wiki.css'

// 33 §6.2 `#`·`[[` 자동 완성 드롭다운(같은 부품). 입력칸·글 상자·contentEditable 어디에나 붙는다.
// `#` = 태그만(틱틱 태그 드롭다운), `[[` = 태그 → 리스트 → 할 일. ↑↓ · Enter·Tab = 넣기 · Esc = 닫기(글 그대로).
type Trigger = '#' | '[['
type Open = { mode: Trigger; query: string; start: number; caret: number; rect: { left: number; top: number; bottom: number } }
type Item = { key: string; group?: string; icon: React.ReactNode; label: string; sub?: string; insert: string; create?: string }
const GROUP_MAX = 5

/** 글과 커서 위치 */
function readText(el: HTMLElement): { text: string; caret: number } | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return { text: el.value, caret: el.selectionStart ?? el.value.length }
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !el.contains(sel.focusNode)) return null
  const r = document.createRange()
  r.selectNodeContents(el)
  r.setEnd(sel.focusNode!, sel.focusOffset)
  return { text: el.textContent ?? '', caret: r.toString().length }
}
/** 커서 화면 위치: contentEditable은 선택 범위, 입력칸은 같은 글꼴의 거울 상자로 잰다 */
function caretRect(el: HTMLElement, caret: number): Open['rect'] {
  const box = el.getBoundingClientRect()
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    const sel = window.getSelection()
    const r = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    const rr = r?.getClientRects()[0] ?? r?.getBoundingClientRect()
    if (rr && (rr.width || rr.height || rr.left)) return { left: rr.left, top: rr.top, bottom: rr.bottom }
    return { left: box.left, top: box.top, bottom: box.bottom }
  }
  const cs = getComputedStyle(el)
  const m = document.createElement('div')
  for (const p of ['font', 'letterSpacing', 'padding', 'border', 'boxSizing', 'lineHeight', 'textIndent'] as const) m.style[p] = cs[p]
  m.style.position = 'fixed'; m.style.visibility = 'hidden'; m.style.left = '0'; m.style.top = '0'
  m.style.whiteSpace = el instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre'
  m.style.width = `${box.width}px`
  m.textContent = el.value.slice(0, caret)
  const mark = document.createElement('span')
  mark.textContent = '​'
  m.appendChild(mark)
  document.body.appendChild(m)
  const left = box.left + mark.offsetLeft - el.scrollLeft
  const top = box.top + mark.offsetTop - el.scrollTop
  const h = mark.offsetHeight || parseFloat(cs.lineHeight) || 18
  m.remove()
  return el instanceof HTMLInputElement ? { left, top: box.top, bottom: box.bottom } : { left, top, bottom: top + h }
}
/** 값을 바꾸고 커서를 옮긴 뒤 input 이벤트를 보낸다(React onChange·onInput이 그대로 받는다) */
function writeText(el: HTMLElement, text: string, caret: number) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
    return
  }
  el.textContent = text
  const node = el.firstChild ?? el
  const r = document.createRange()
  r.setStart(node, Math.min(caret, node.textContent?.length ?? 0))
  r.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(r)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function detect(text: string, caret: number, modes: Trigger[]): Omit<Open, 'rect'> | null {
  const before = text.slice(0, caret)
  const link = modes.includes('[[') ? before.match(/\[\[([^[\]\n]{0,40})$/) : null
  if (link) return { mode: '[[', query: link[1], start: caret - link[0].length, caret }
  const tag = modes.includes('#') ? before.match(/(?:^|\s)#([^\s#[\]]{0,30})$/) : null
  if (tag) return { mode: '#', query: tag[1], start: caret - tag[1].length - 1, caret }
  return null
}

type TagOpt = { id: string; name: string; kind: string | null; aliases: string | null; c: number }
type ListOpt = { id: string; name: string; emoji: string | null; folder: string | null }

export function WikiComplete({ target, modes = ['#', '[['] }: { target: RefObject<HTMLElement | null>; modes?: Trigger[] }) {
  const [open, setOpen] = useState<Open>()
  const [index, setIndex] = useState(0)
  const [tasks, setTasks] = useState<{ id: string; title: string; list: string | null }[]>([])
  const tags = useQuery<TagOpt>(
    `SELECT g.id, g.name, g.kind, g.aliases, (SELECT count(*) FROM task_tags tt JOIN tasks t ON t.id = tt.task_id
       WHERE tt.tag_id = g.id AND t.status = 0 AND t.deleted_at IS NULL AND COALESCE(tt.state,'accepted')='accepted') AS c FROM tags g ORDER BY g.sort_order`
  ) ?? []
  const lists = useQuery<ListOpt>("SELECT l.id, l.name, l.emoji, f.name AS folder FROM lists l LEFT JOIN folders f ON f.id = l.folder_id WHERE l.archived_at IS NULL AND l.kind != 'inbox' ORDER BY l.sort_order") ?? []
  const modesKey = modes.join(',')

  // 할 일 후보(§6.2: 제목·리스트, 최근 수정 순, 완료 제외)
  useEffect(() => {
    if (open?.mode !== '[[' || !open.query.trim()) { setTasks([]); return }
    let alive = true
    const like = `%${open.query.trim().replace(/[\\%_]/g, '\\$&')}%`
    void getDb().then((db) => db.getAll<{ id: string; title: string; list: string | null }>(
      "SELECT t.id, t.title, l.name AS list FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND t.title LIKE ? ESCAPE '\\' ORDER BY t.modified_at DESC LIMIT 5", [like]
    )).then((r) => { if (alive) setTasks(r) })
    return () => { alive = false }
  }, [open?.mode, open?.query])

  const items = useMemo<Item[]>(() => {
    if (!open) return []
    const q = open.query.trim()
    const rankTags = tags
      .map((t) => ({ t, m: matchRank(q, t.name, parseAliases(t.aliases)) }))
      .filter((x) => x.m.rank > 0)
      .sort((a, b) => b.m.rank - a.m.rank || b.t.c - a.t.c)
      .slice(0, GROUP_MAX)
    const tagIcon = (k: string | null) => KIND_ICON[kindOf(k)] ?? <Hash size={14} />
    const out: Item[] = rankTags.map(({ t, m }) => ({
      key: `tag:${t.id}`, group: open.mode === '[[' ? '태그' : undefined, icon: tagIcon(t.kind), label: t.name,
      sub: [m.via ? `= ${m.via}` : '', t.c ? String(t.c) : ''].filter(Boolean).join(' · '), insert: t.name
    }))
    if (open.mode === '[[') {
      const ls = lists
        .map((l) => ({ l, v: listView(l), m: matchRank(q, listView(l).name) }))
        .filter((x) => x.m.rank > 0)
        .sort((a, b) => b.m.rank - a.m.rank)
        .slice(0, GROUP_MAX)
      out.push(...ls.map(({ l, v }) => ({ key: `list:${l.id}`, group: '리스트', icon: v.emoji ?? '≡', label: v.name, sub: l.folder ? splitEmoji(l.folder).name : undefined, insert: v.name })))
      out.push(...tasks.filter((t) => t.title.trim() && !t.title.includes('[[')).map((t) => ({ key: `task:${t.id}`, group: '할 일', icon: <span className="wiki-ac__cb" />, label: t.title, sub: t.list ?? undefined, insert: t.title })))
    }
    const exact = tags.some((t) => t.name === q) || (open.mode === '[[' && lists.some((l) => listView(l).name === q))
    if (q && !exact && !/^[ㄱ-ㅎ]+$/.test(q) && (open.mode === '[[' || !/\s/.test(q))) { // 초성만 친 것은 새 이름이 아니다
      out.push({ key: 'create', icon: <Plus size={14} />, label: open.mode === '#' ? `새 태그 "${q}"` : `'${q}' 태그 만들기`, insert: q, create: q })
    }
    return out
  }, [open, tags, lists, tasks])

  const pick = async (item: Item) => {
    const el = target.current
    if (!el || !open) return
    if (item.create && open.mode === '[[') await ensureTags([item.create])
    const cur = readText(el)
    const text = cur?.text ?? ''
    const caret = cur?.caret ?? open.caret
    let after = text.slice(caret)
    let ins: string
    if (open.mode === '[[') {
      if (after.startsWith(']]')) after = after.slice(2)
      ins = `[[${item.insert}]]`
    } else ins = `#${item.insert} `
    const next = text.slice(0, open.start) + ins + after.replace(open.mode === '#' ? /^ / : /^$/, '')
    setOpen(undefined)
    writeText(el, next, open.start + ins.length)
  }
  const pickRef = useRef(pick)
  pickRef.current = pick
  const state = useRef({ open, items, index })
  state.current = { open, items, index }

  useEffect(() => {
    const el = target.current
    if (!el) return
    const modesList = modesKey.split(',') as Trigger[]
    const update = () => {
      const cur = readText(el)
      const d = cur && detect(cur.text, cur.caret, modesList)
      if (!d) { setOpen(undefined); return }
      setOpen((o) => (o && o.mode === d.mode && o.start === d.start && o.query === d.query ? o : { ...d, rect: caretRect(el, d.start) }))
      setIndex(0)
    }
    const key = (e: KeyboardEvent) => {
      const { open: o, items: its, index: i } = state.current
      if (!o) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(undefined); return }
      if (e.isComposing) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        if (its.length) setIndex((i + (e.key === 'ArrowDown' ? 1 : its.length - 1)) % its.length)
      } else if ((e.key === 'Enter' || e.key === 'Tab') && its.length && !e.shiftKey && !e.metaKey) {
        e.preventDefault(); e.stopPropagation()
        void pickRef.current(its[Math.min(i, its.length - 1)])
      } else if (e.key === ' ' && o.mode === '#') setOpen(undefined) // 공백 = 닫고 지금 글자로(없는 이름이면 저장할 때 새 태그)
    }
    const blur = () => window.setTimeout(() => { if (document.activeElement !== el) setOpen(undefined) }, 120)
    const caretMove = (e: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update() }
    el.addEventListener('input', update)
    el.addEventListener('keydown', key)
    el.addEventListener('keyup', caretMove)
    el.addEventListener('blur', blur)
    el.addEventListener('compositionend', update)
    return () => {
      el.removeEventListener('input', update)
      el.removeEventListener('keydown', key)
      el.removeEventListener('keyup', caretMove)
      el.removeEventListener('blur', blur)
      el.removeEventListener('compositionend', update)
    }
  }, [target, modesKey])

  if (!open || !items.length) return null
  const width = open.mode === '#' ? 260 : 300
  const below = window.innerHeight - open.rect.bottom > 220
  const left = Math.max(8, Math.min(open.rect.left - 8, window.innerWidth - width - 8))
  let lastGroup: string | undefined
  return createPortal(
    <div
      className="popover menu wiki-ac"
      role="listbox"
      aria-label={open.mode === '#' ? '태그' : '링크'}
      style={below ? { left, top: open.rect.bottom + 4, width } : { left, bottom: window.innerHeight - open.rect.top + 4, width }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        const head = it.group && it.group !== lastGroup ? it.group : undefined
        lastGroup = it.group ?? lastGroup
        return (
          <div key={it.key}>
            {it.create && i > 0 && <div className="menu__divider" />}
            {head && <div className="menu__caption wiki-ac__cap">{head}</div>}
            <button
              role="option"
              aria-selected={i === index}
              className={`menu__item wiki-ac__item${i === index ? ' is-hover' : ''}${it.create ? ' is-create' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void pick(it)}
            >
              <span className="wiki-ac__icon">{it.icon}</span>
              <span className="menu__label">{it.label}</span>
              {it.sub && <span className="wiki-ac__sub">{it.sub}</span>}
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
