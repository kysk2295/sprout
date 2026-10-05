import { useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Hash } from 'lucide-react'
import { parseAliases, wrapMention, mentionsPlain } from '@sprout/schema/wikiLink'
import { useQuery } from '../../data/useQuery'
import { contentOf, type WikiTopic } from '../../data/collect'
import { listView, type ListRow } from '../../data/types'
import {
  ACCEPTED, DESC_MAX, KIND_ICON, KIND_LABEL, ensureTagTopic, kindOf, linkMention, openLink, openTarget, openWikiTopic, setListDescription, setTagDescription, type TagMeta
} from '../../data/wiki'
import { relatedLists, relatedTags, tagPills } from '../../lib/wikiGraph'
import { updateTask } from '../../data/mutations'
import { useToast } from '../Toast'
import { MenuItem, Popover } from '../Popover'
import { LinkText } from './LinkText'
import { WikiComplete } from './WikiComplete'
import './wiki.css'

// 33 §3 리스트 페이지 머리 · §4 태그 페이지 머리 [sprout]. 목록 머리 바로 아래, 추가 바 위. 내용이 없으면 머리 자체가 없다(= 틱틱 화면).
const OPEN = 't.status = 0 AND t.deleted_at IS NULL'
type Pill = { tag_id: string; count: number; aiOnly: boolean }
type NoteRow = { id: string; content: string | null; kind: string | null; url: string | null; link_title: string | null; seen_at: string | null; topic_id: string | null }
type Backlink = { from_type: string; from_id: string; title: string | null; status: number | null; list_id: string | null; list_name: string | null; list_emoji: string | null }
type Mention = { id: string; title: string; list_id: string | null; list_name: string | null; list_emoji: string | null }

/** 태그 종류 아이콘(👤🚀📍, 주제는 #) */
export function KindIcon({ kind, size = 14 }: { kind: string | null | undefined; size?: number }) {
  const e = KIND_ICON[kindOf(kind)]
  return e ? <span className="wiki-kind" style={{ fontSize: size - 1 }}>{e}</span> : <Hash className="wiki-kind is-topic" size={size} />
}

/** 태그 페이지 머리 제목(§4.1): 종류 아이콘 · 이름 · 종류·별칭(3차) */
export function TagHeading({ tagId, fallback }: { tagId: string; fallback: string }) {
  const tag = useQuery<TagMeta>('SELECT id, name, color, kind, aliases, description, topic_id, source FROM tags WHERE id = ?', [tagId])?.[0]
  if (!tag) return <>{fallback}</>
  const sub = [kindOf(tag.kind) !== 'topic' ? KIND_LABEL[kindOf(tag.kind)] : '', ...parseAliases(tag.aliases).slice(0, 2)].filter(Boolean).join(' · ')
  return (
    <span className="wiki-heading">
      <KindIcon kind={tag.kind} size={18} />
      <span className="wiki-heading__name">{tag.name}</span>
      {sub && <small className="wiki-heading__sub">{sub}</small>}
    </span>
  )
}

/** 머리 접힘 기억(리스트마다 기기에, §3.4). 리스트는 처음 접힘, 태그 페이지는 처음 펼침 */
export function usePageOpen(view: string): [boolean, (v: boolean) => void] {
  const key = 'sprout.listPage.open'
  const read = () => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, boolean> } catch { return {} } }
  const [map, setMap] = useState(read)
  useEffect(() => setMap(read()), [view])
  const open = map[view] ?? view.startsWith('tag:')
  const set = (v: boolean) => { const next = { ...read(), [view]: v }; setMap(next); try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* */ } }
  return [open, set]
}

type Props = {
  view: string
  lists: ListRow[]
  open: boolean
  forced: boolean
  onOpen: (v: boolean) => void
  filter: string[]
  onFilter: (ids: string[]) => void
  narrow: boolean
}

export function PageHeader(p: Props) {
  const [kind, id] = p.view.split(':')
  if (kind !== 'list' && kind !== 'tag') return null
  return <PageHeaderBody key={p.view} {...p} kind={kind} id={id} />
}

function PageHeaderBody({ kind, id, lists, open, forced, onOpen, filter, onFilter, narrow }: Props & { kind: 'list' | 'tag'; id: string }) {
  const toast = useToast()
  const isList = kind === 'list'
  const allTags = useQuery<TagMeta>('SELECT id, name, color, kind, aliases, description, topic_id, source FROM tags') ?? []
  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags])
  const listRow = useQuery<{ description: string | null; name: string; kind: string }>('SELECT description, name, kind FROM lists WHERE id = ?', [isList ? id : ''])?.[0]
  const tag = isList ? undefined : tagById.get(id)
  const description = (isList ? listRow?.description : tag?.description) ?? ''
  const name = isList ? listView({ name: listRow?.name ?? '' }).name : tag?.name ?? ''

  // 태그 줄(리스트) / 리스트 줄(태그)
  const pillRows = useQuery<{ tag_id: string; source: string | null; c: number }>(
    `SELECT tt.tag_id, tt.source, count(*) AS c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE t.list_id = ? AND ${OPEN} AND ${ACCEPTED()} GROUP BY tt.tag_id, tt.source`, [isList ? id : '']
  ) ?? []
  const pills: Pill[] = useMemo(() => tagPills(pillRows).filter((x) => tagById.has(x.tag_id)), [pillRows, tagById])
  const tagLists = useQuery<{ list_id: string; c: number }>(
    `SELECT t.list_id, count(*) AS c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE tt.tag_id = ? AND ${OPEN} AND ${ACCEPTED()} AND t.list_id IS NOT NULL GROUP BY t.list_id ORDER BY c DESC`, [isList ? '' : id]
  ) ?? []
  // 관련 리스트(§3.3) · 관련 태그(§4.1)
  const graph = useQuery<{ list_id: string; tag_id: string; c: number }>(
    `SELECT t.list_id, tt.tag_id, count(*) AS c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id JOIN lists l ON l.id = t.list_id
     WHERE ${OPEN} AND ${ACCEPTED()} AND l.archived_at IS NULL GROUP BY t.list_id, tt.tag_id`
  ) ?? []
  const total = useQuery<{ n: number }>(`SELECT count(*) AS n FROM tasks t WHERE ${OPEN}`)?.[0]?.n ?? 0
  const related = useMemo(() => (isList ? relatedLists(id, graph, total) : []), [isList, id, graph, total])
  const pairs = useQuery<{ task_id: string; tag_id: string }>(
    `SELECT tt.task_id, tt.tag_id FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE ${OPEN} AND ${ACCEPTED()} AND tt.task_id IN (SELECT task_id FROM task_tags WHERE tag_id = ?)`, [isList ? '' : id]
  ) ?? []
  const relTags = useMemo(() => (isList ? [] : relatedTags(id, pairs).filter((r) => tagById.has(r.tag_id))), [isList, id, pairs, tagById])

  // 수집함(§3.2·§4.1): 이 리스트 태그들 / 이 태그의 위키 주제(tags.topic_id, 없으면 같은 이름) + 그 자료 + 이 태그와 이어진 메모
  const topicTags = isList ? pills.map((x) => tagById.get(x.tag_id)!).filter(Boolean) : tag ? [tag] : []
  const topicIds = topicTags.map((t) => t.topic_id).filter(Boolean) as string[]
  const topicNames = topicTags.filter((t) => !t.topic_id).map((t) => t.name)
  const topics = useQuery<WikiTopic>(
    `SELECT * FROM wiki_topics WHERE id IN (${topicIds.map(() => '?').join(',') || 'NULL'}) OR name IN (${topicNames.map(() => '?').join(',') || 'NULL'})`, [...topicIds, ...topicNames]
  ) ?? []
  const notes = useQuery<NoteRow>(
    `SELECT n.id, n.content, n.kind, n.url, n.link_title, n.seen_at, n.topic_id FROM notes n
     WHERE n.topic_id IN (${topics.map(() => '?').join(',') || 'NULL'})
        OR n.id IN (SELECT from_id FROM relations WHERE from_type = 'note' AND to_type = 'tag' AND to_id IN (${topicTags.map(() => '?').join(',') || 'NULL'}) AND COALESCE(state,'accepted') = 'accepted')
     ORDER BY n.created_at DESC LIMIT 6`, [...topics.map((t) => t.id), ...topicTags.map((t) => t.id)]
  ) ?? []

  // 백링크 · 연결 안 된 언급
  const backlinks = useQuery<Backlink>(
    `SELECT r.from_type, r.from_id, t.title, t.status, t.list_id, l.name AS list_name, l.emoji AS list_emoji FROM relations r
     LEFT JOIN tasks t ON r.from_type = 'task' AND t.id = r.from_id LEFT JOIN lists l ON l.id = t.list_id
     WHERE r.source = 'link' AND r.to_type = ? AND r.to_id = ? AND (r.from_type != 'task' OR t.deleted_at IS NULL) ${isList ? '' : "AND r.from_type != 'task'"}
     GROUP BY r.from_type, r.from_id LIMIT 11`, [kind, id]
  ) ?? []
  const mentionLike = name.length >= 2 ? `%${name.replace(/[\\%_]/g, '\\$&')}%` : ''
  const mentionRows = useQuery<Mention>(
    `SELECT t.id, t.title, t.list_id, l.name AS list_name, l.emoji AS list_emoji FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
     WHERE ${OPEN} AND t.title LIKE ? ESCAPE '\\' AND ${isList ? '(t.list_id IS NULL OR t.list_id != ?)' : `NOT EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)`} LIMIT 30`,
    [mentionLike || '\u0000', id]
  ) ?? []
  const mentions = mentionRows.filter((m) => mentionsPlain(m.title, name))

  const [mentionsOpen, setMentionsOpen] = useState(false)
  const [backOpen, setBackOpen] = useState(true)
  const [pillMenu, setPillMenu] = useState<{ tag: string; point: { x: number; y: number } }>()
  const hasContent = !!description || pills.length > 0 || tagLists.length > 0 || related.length > 0 || topics.length > 0 || notes.length > 0 || backlinks.length > 0 || mentions.length > 0
  if (!hasContent && !forced) return null

  const listById = new Map(lists.map((l) => [l.id, l]))
  const listName = (lid: string | null, n?: string | null, e?: string | null) => {
    const l = lid ? listById.get(lid) : undefined
    if (l?.kind === 'inbox') return '기본함'
    const v = listView({ name: l?.name ?? n ?? '', emoji: l?.emoji ?? e })
    return `${v.emoji ? `${v.emoji} ` : ''}${v.name}`
  }
  const tagLabel = (tid: string) => { const t = tagById.get(tid); return t ? <><KindIcon kind={t.kind} size={11} />{t.name}</> : null }
  const clickPill = (tid: string, e: RMouseEvent) => {
    if (e.metaKey || e.ctrlKey) { openTarget({ view: `tag:${tid}` }); return }
    onFilter(filter.includes(tid) ? filter.filter((x) => x !== tid) : [...filter, tid])
  }
  const linkAll = async () => {
    const undos = await Promise.all(mentions.map((m) => linkMention(m.id, name, wrapMention)))
    toast.show(`링크 ${undos.length}곳을 만들었어요`, () => Promise.all(undos.map((u) => u())))
  }

  if (!open) {
    const shown = narrow ? [] : pills.slice(0, 3)
    return (
      <div className="wiki-ph is-collapsed" role="button" tabIndex={0} aria-expanded={false} aria-label="페이지 정보 펼치기" onClick={() => onOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(true) }}>
        {description && <span className="wiki-ph__desc-line">{description.split('\n')[0]}</span>}
        {description && (shown.length > 0 || pills.length > 0) && <span className="wiki-ph__sep">·</span>}
        {shown.map((x) => (
          <button key={x.tag_id} className={`wiki-pill is-sm${filter.includes(x.tag_id) ? ' is-on' : ''}`} onClick={(e) => { e.stopPropagation(); clickPill(x.tag_id, e) }}>{tagLabel(x.tag_id)}</button>
        ))}
        {narrow && pills.length > 0 && <span className="wiki-ph__meta">태그 {pills.length}</span>}
        {!isList && tagLists.length > 0 && <span className="wiki-ph__meta">리스트 {tagLists.length}</span>}
        {related.length > 0 && <span className="wiki-ph__meta">관련 {related.length}</span>}
        {backlinks.length > 0 && <span className="wiki-ph__meta">↩ {backlinks.length}</span>}
        <ChevronDown className="wiki-ph__toggle" />
      </div>
    )
  }

  const topic = topics[0]
  const c = topic ? contentOf(topic) : undefined
  return (
    <div className="wiki-ph">
      <Row label="설명">
        <Description value={description} onSave={(v) => (isList ? setListDescription(id, v) : setTagDescription(id, v))} />
        <button className="wiki-ph__fold" onClick={() => onOpen(false)}>접기 <ChevronDown size={12} style={{ transform: 'rotate(180deg)' }} /></button>
      </Row>
      {!isList && (
        <Row label="위키">
          {topic ? (
            <>
              <span className="wiki-src is-quiet" title={c!.sections.overview.slice(0, 2).map((l) => l.text).join('\n')}>
                📖 {c!.sections.overview[0]?.text ? <span className="wiki-ph__ellipsis">{c!.sections.overview[0].text}</span> : <span className="wiki-dim">개요 없음</span>}
              </span>
              <button className="wiki-src is-accent" onClick={() => openWikiTopic(topic.id)}>핵심 정리 {c!.sections.key.length}줄 ›</button>
            </>
          ) : (
            <button className="wiki-add" onClick={async () => { if (tag) openWikiTopic(await ensureTagTopic(tag)) }}>+ 위키 페이지 만들기</button>
          )}
        </Row>
      )}
      {isList && pills.length > 0 && (
        <Row label="태그">
          <button className={`wiki-pill${filter.length ? '' : ' is-on'}`} onClick={() => onFilter([])}>전체</button>
          {pills.slice(0, 8).map((x) => (
            <button key={x.tag_id} className={`wiki-pill${filter.includes(x.tag_id) ? ' is-on' : ''}`} title="눌러서 이 리스트 안에서 거르기 · ⌘누르기 = 태그 페이지"
              onClick={(e) => clickPill(x.tag_id, e)} onContextMenu={(e) => { e.preventDefault(); setPillMenu({ tag: x.tag_id, point: { x: e.clientX, y: e.clientY } }) }}>
              {x.aiOnly && <span className="wiki-ai" aria-label="AI가 붙인 태그">✦</span>}{tagLabel(x.tag_id)}<span className="wiki-pill__n">{x.count}</span>
            </button>
          ))}
          {pills.length > 8 && <span className="wiki-dim">{pills.length - 8}개 더</span>}
        </Row>
      )}
      {!isList && tagLists.length > 0 && (
        <Row label="리스트">
          {tagLists.slice(0, 8).map((x) => (
            <button key={x.list_id} className="wiki-pill" onClick={() => openTarget({ view: `list:${x.list_id}`, tagFilter: id })}>{listName(x.list_id)}<span className="wiki-pill__n">{x.c}</span></button>
          ))}
        </Row>
      )}
      {related.length > 0 && (
        <Row label="관련 리스트">
          {related.map((r) => (
            <button key={r.list_id} className="wiki-pill" title={`${r.tags.map((t) => `#${tagById.get(t)?.name ?? ''}`).join(' ')}로 이어져요`} onClick={() => openTarget({ view: `list:${r.list_id}` })}>
              {listName(r.list_id)}<span className="wiki-pill__n">{r.tags.map((t) => `#${tagById.get(t)?.name ?? ''}`).join(' ')}</span>
            </button>
          ))}
        </Row>
      )}
      {relTags.length > 0 && (
        <Row label="관련 태그">
          {relTags.map((r) => <button key={r.tag_id} className="wiki-pill" onClick={() => openTarget({ view: `tag:${r.tag_id}` })}>{tagLabel(r.tag_id)}</button>)}
        </Row>
      )}
      {(isList ? topics.length > 0 : false) || notes.length > 0 ? (
        <Row label="수집함">
          {isList && topics.slice(0, 2).map((t) => (
            <button key={t.id} className="wiki-src" onClick={() => openWikiTopic(t.id)}>📖 {t.name} <span className="wiki-dim">· 핵심 정리 {contentOf(t).sections.key.length}줄</span></button>
          ))}
          {notes.slice(0, 4).map((n) => (
            <button key={n.id} className="wiki-src" onClick={() => (n.topic_id ? openWikiTopic(n.topic_id) : openTarget({ view: 'notes' }))}>
              {n.kind === 'link' && !n.seen_at && <i className="wiki-dot" />}
              {n.kind === 'link' ? '🔗' : n.kind === 'wiki' ? '📖' : '📝'} <span className="wiki-ph__ellipsis">{n.link_title || (n.content ?? '').split('\n')[0] || n.url}</span>
            </button>
          ))}
        </Row>
      ) : null}
      {backlinks.length > 0 && (
        <>
          <button className="wiki-gh" onClick={() => setBackOpen(!backOpen)}>
            {backOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}백링크 <span className="wiki-gh__n">{backlinks.length > 10 ? '10+' : backlinks.length}</span>
          </button>
          {backOpen && backlinks.slice(0, 10).map((b) => (
            <div key={`${b.from_type}:${b.from_id}`} className="wiki-mini" onClick={() => b.from_type === 'task' && openLink('task', b.from_id, b.list_id)}>
              {b.from_type === 'task'
                ? <button className={`checkbox wiki-mini__cb${b.status === 1 ? ' is-checked' : ''}`} aria-label="완료" onClick={(e) => { e.stopPropagation(); void updateTask(b.from_id, b.status === 1 ? { status: 0, completed_at: null } : { status: 1, completed_at: new Date().toISOString() }) }}>{b.status === 1 && <Check strokeWidth={3} />}</button>
                : <span className="wiki-mini__icon">{b.from_type === 'tag' ? '#' : b.from_type === 'list' ? '≡' : '📝'}</span>}
              <span className="wiki-mini__title">{b.title ? <LinkText taskId={b.from_id} text={b.title} /> : b.from_type === 'task' ? '제목 없음' : '설명'}</span>
              {b.list_id && <span className="wiki-mini__list">{listName(b.list_id, b.list_name, b.list_emoji)}</span>}
            </div>
          ))}
        </>
      )}
      {mentions.length > 0 && (
        <>
          <div className="wiki-gh is-quiet">
            <button onClick={() => setMentionsOpen(!mentionsOpen)}>{mentionsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}연결 안 된 언급 <span className="wiki-gh__n">{mentions.length}</span></button>
            <button className="wiki-gh__act" onClick={() => void linkAll()}>모두 링크로</button>
          </div>
          {mentionsOpen && mentions.slice(0, 10).map((m) => (
            <div key={m.id} className="wiki-mini" onClick={() => openLink('task', m.id, m.list_id)}>
              <span className="wiki-mini__icon" />
              <span className="wiki-mini__title">{m.title}</span>
              <span className="wiki-mini__list">{listName(m.list_id, m.list_name, m.list_emoji)}</span>
              <button className="wiki-mini__act" onClick={async (e) => { e.stopPropagation(); const undo = await linkMention(m.id, name, wrapMention); toast.show('링크로 바꿨어요', undo) }}>링크로</button>
            </div>
          ))}
        </>
      )}
      {pillMenu && (
        <Popover point={pillMenu.point} onClose={() => setPillMenu(undefined)} className="menu" width={170}>
          <MenuItem label="태그 페이지 열기" onClick={() => { openTarget({ view: `tag:${pillMenu.tag}` }); setPillMenu(undefined) }} />
          <MenuItem label={filter.includes(pillMenu.tag) ? '거르기 해제' : '이 태그만 보기'} onClick={() => { onFilter(filter.includes(pillMenu.tag) ? filter.filter((x) => x !== pillMenu.tag) : [pillMenu.tag]); setPillMenu(undefined) }} />
        </Popover>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="wiki-ph__row"><span className="wiki-ph__k">{label}</span><span className="wiki-ph__v">{children}</span></div>
}

/** 설명: 그 자리 고치기(여러 줄, 500자). ⌘Enter·바깥 클릭 = 저장, Esc = 취소. 비었으면 `+ 설명 쓰기` */
function Description({ value, onSave }: { value: string; onSave: (v: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) { const el = ref.current; el?.focus(); el?.setSelectionRange(el.value.length, el.value.length) } }, [editing])
  const over = draft.length > DESC_MAX
  const save = async () => {
    if (over) return
    setEditing(false)
    if (draft.trim() !== value.trim()) {
      try { await onSave(draft.trim()) } catch { toast.show('저장하지 못했어요') }
    }
  }
  if (!editing) {
    return value
      ? <span className="wiki-desc" role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true) }}>{value}</span>
      : <button className="wiki-add" onClick={() => setEditing(true)}>+ 설명 쓰기</button>
  }
  return (
    <span className="wiki-desc-edit">
      <textarea
        ref={ref}
        rows={Math.min(6, Math.max(2, draft.split('\n').length))}
        value={draft}
        placeholder="이 페이지는 무엇인가요?"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save() }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(value); setEditing(false) }
        }}
      />
      <WikiComplete target={ref} modes={['[[']} />
      {draft.length > DESC_MAX - 50 && <span className={`wiki-desc-edit__n${over ? ' is-over' : ''}`}>{draft.length}/{DESC_MAX}</span>}
    </span>
  )
}
