import { BookOpen, History, Lock, Merge, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WikiSection } from '../../../../shared/collect'
import { domainOf } from '../../../../shared/collect'
import {
  SECTION_NAME, addTopic, contentOf, deleteTopic, editSection, lockedOf, mergeTopic, renameTopic, resolveSuggestion, restoreVersion, unlockSection,
  type CollectItem, type WikiContent, type WikiLine, type WikiTopic
} from '../../data/collect'
import { getDb } from '../../data/db'
import { useQuery } from '../../data/useQuery'
import { dayKey } from '../../lib/dates'
import { MenuItem, Popover, SubMenu } from '../Popover'
import { useToast } from '../Toast'
import { Empty, Highlight, SiteMark, fullKo, localDay, monthDayKo, sourceLabel, timeKo } from './shared'

// 11 v3-5 위키(LLM 위키): 왼쪽 주제 목록(240) + 오른쪽 주제 페이지
const SEEN_KEY = 'sprout.wiki.seen'
const readSeen = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') ?? {} } catch { return {} } }
const writeSeen = (id: string, version: number) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [id]: version })) } catch { /* 새 점이 한 번 더 보일 뿐 */ } }
type Topic = WikiTopic & { count: number }
type Version = { id: string; version: number; content: string; reason: string; created_at: string }
type Props = { query: string; topicId?: string; onTopic: (id: string | undefined) => void; onJump: (noteId: string) => void; onBack: () => void }

export function WikiView({ query, topicId, onTopic, onJump, onBack }: Props) {
  const toast = useToast()
  const topics = useQuery<Topic>('SELECT w.*, (SELECT COUNT(*) FROM notes n WHERE n.topic_id = w.id) AS count FROM wiki_topics w ORDER BY w.name')
  const [seen, setSeen] = useState(readSeen)
  const [menu, setMenu] = useState<{ topic: Topic; anchor?: HTMLElement | null; point?: { x: number; y: number } }>()
  const [renaming, setRenaming] = useState<string>()
  const [adding, setAdding] = useState(false)
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => (topics ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)), [topics, q])
  const current = topics?.find((t) => t.id === topicId)
  // 고른 주제가 없거나 사라졌으면 첫 주제
  useEffect(() => { if (topics && !current && shown.length) onTopic(shown[0].id) }, [topics, current, shown])
  const markSeen = (id: string, version: number) => { writeSeen(id, version); setSeen((s) => ({ ...s, [id]: version })) }

  const remove = async (t: Topic) => {
    setMenu(undefined)
    try {
      const undo = await deleteTopic(t)
      if (topicId === t.id) onTopic(undefined)
      toast.show(`'${t.name}' 주제를 삭제했어요. 자료는 메모로 남겨요`, undo)
    } catch { toast.show('삭제하지 못했어요. 다시 시도해 주세요.') }
  }
  const merge = async (from: Topic, into: Topic) => {
    setMenu(undefined)
    try { await mergeTopic(from, into); onTopic(into.id); toast.show(`'${from.name}'을 '${into.name}'에 합쳤어요`) }
    catch { toast.show('합치지 못했어요. 다시 시도해 주세요.') }
  }

  if (!topics) return <div className="notes__loading">{Array.from({ length: 5 }, (_, i) => <span key={i} />)}</div>
  if (!topics.length && !adding) {
    return (
      <Empty icon={<BookOpen className="notes__empty-icon" />} title="자료가 쌓이면 주제별로 정리해 드려요" hint="공부한 것·알게 된 것을 수집에 던져 두면 AI가 주제 페이지를 만들어요">
        <div className="wiki-empty__acts">
          <button className="notes__back" onClick={onBack}>수집으로 돌아가기</button>
          <button className="notes__back" onClick={() => setAdding(true)}>주제 직접 만들기</button>
        </div>
      </Empty>
    )
  }
  return (
    <div className="wiki">
      <div className="wiki__topics">
        <div className="group__header wiki__topics-head"><span className="group__name">주제</span><span className="group__count">{shown.length}</span></div>
        {shown.map((t) => renaming === t.id ? (
          <NameInput key={t.id} initial={t.name} onCancel={() => setRenaming(undefined)} onSubmit={async (name) => { await renameTopic(t, name); setRenaming(undefined) }} />
        ) : (
          <div
            key={t.id}
            className={`row wiki__topic${t.id === topicId ? ' is-selected' : ''}`}
            onClick={() => onTopic(t.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ topic: t, point: { x: e.clientX, y: e.clientY } }) }}
          >
            <BookOpen className="wiki__topic-icon" />
            <div className="row__main"><span className="row__title"><Highlight text={t.name} query={query} />{t.version > (seen[t.id] ?? 0) && t.id !== topicId && <i className="wiki__newdot" aria-label="새로 바뀜" />}</span></div>
            <button className="wiki__topic-more" aria-label="주제 메뉴" onClick={(e) => { e.stopPropagation(); setMenu({ topic: t, anchor: e.currentTarget }) }}><MoreHorizontal /></button>
            <span className="row__meta">{t.count}</span>
          </div>
        ))}
        {adding
          ? <NameInput initial="" onCancel={() => setAdding(false)} onSubmit={async (name) => { const id = await addTopic(name); setAdding(false); onTopic(id) }} />
          : <button className="wiki__add" onClick={() => setAdding(true)}><Plus />주제 추가</button>}
      </div>
      {current
        ? <TopicPage key={current.id} topic={current} topics={topics} seenVersion={seen[current.id]} onSeen={(v) => markSeen(current.id, v)} onTopic={onTopic} onJump={onJump} />
        : <div className="wiki__page"><Empty icon={<BookOpen className="notes__empty-icon" />} title={q ? `"${query}"와 맞는 주제가 없어요` : '주제를 고르세요'} /></div>}
      {menu && (
        <Popover anchor={menu.anchor} point={menu.point} align="end" onClose={() => setMenu(undefined)} className="menu" width={190}>
          <MenuItem icon={<Pencil />} label="이름 바꾸기" onClick={() => { setRenaming(menu.topic.id); setMenu(undefined) }} />
          <SubMenu icon={<Merge />} label="합치기" disabled={topics.length < 2}>
            {topics.filter((t) => t.id !== menu.topic.id).map((t) => <MenuItem key={t.id} label={`'${t.name}'에 합치기`} onClick={() => void merge(menu.topic, t)} />)}
          </SubMenu>
          <div className="menu__divider" />
          <MenuItem icon={<Trash2 />} label="삭제" danger onClick={() => void remove(menu.topic)} />
        </Popover>
      )}
    </div>
  )
}

function NameInput({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const toast = useToast()
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const submit = async () => {
    if (done.current) return
    if (!value.trim()) { done.current = true; return onCancel() }
    done.current = true
    try { await onSubmit(value) } catch (e) { done.current = false; toast.show(e instanceof Error ? e.message : '저장하지 못했어요.') }
  }
  return (
    <div className="row wiki__topic is-editing">
      <BookOpen className="wiki__topic-icon" />
      <input
        className="wiki__name-input"
        autoFocus
        maxLength={20}
        placeholder="주제 이름"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void submit()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') { e.preventDefault(); void submit() }
          if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel() }
        }}
      />
    </div>
  )
}

type Src = Pick<CollectItem, 'id' | 'source' | 'captured_at' | 'created_at'>
type Link = Pick<CollectItem, 'id' | 'url' | 'link_title' | 'content'>
const SECTIONS: WikiSection[] = ['overview', 'key', 'questions']

function changedAt(iso: string) {
  if (Date.now() - Date.parse(iso) < 60_000) return '방금 고침'
  return localDay(iso) === dayKey() ? `${timeKo(iso)} 고침` : `${monthDayKo(iso)} 고침`
}

function TopicPage({ topic, topics, seenVersion, onSeen, onTopic, onJump }: { topic: Topic; topics: Topic[]; seenVersion?: number; onSeen: (v: number) => void; onTopic: (id: string) => void; onJump: (id: string) => void }) {
  const toast = useToast()
  // 처음 열 때 본 버전 = 띠 기준. 보는 동안 바뀐 버전은 바로 "봤음"으로(목록 점), 띠는 남는다
  const [baseline, setBaseline] = useState(() => seenVersion ?? 0)
  const [preview, setPreview] = useState<Version>()
  const [history, setHistory] = useState<HTMLElement | null>(null)
  const [writing, setWriting] = useState<WikiSection>()
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => { onSeen(topic.version) }, [topic.version])
  const versions = useQuery<Version>('SELECT id, version, content, reason, created_at FROM wiki_versions WHERE topic_id = ? ORDER BY version DESC', [topic.id])
  const content = preview ? contentOf(preview) : contentOf(topic)
  const locked = lockedOf(topic)
  const srcIds = useMemo(() => Array.from(new Set(SECTIONS.flatMap((s) => content.sections[s].map((l) => l.src)).concat(content.suggestions.map((s) => s.src)).filter((s): s is string => !!s))), [content])
  const srcRows = useQuery<Src>(`SELECT id, source, captured_at, created_at FROM notes WHERE id IN (${srcIds.map(() => '?').join(',') || "''"})`, srcIds)
  const sources = useMemo(() => new Map((srcRows ?? []).map((r) => [r.id, r])), [srcRows])
  const links = useQuery<Link>('SELECT id, url, link_title, content FROM notes WHERE topic_id = ? AND url IS NOT NULL ORDER BY COALESCE(captured_at, created_at) DESC', [topic.id])
  const related = content.related.map((id) => topics.find((t) => t.id === id)).filter((t): t is Topic => !!t)
  const base = versions?.find((v) => v.version === baseline)
  const fresh = !preview && topic.version > baseline
  const newSince = fresh ? (base?.created_at ?? '') : null
  const latest = versions?.[0]

  /** 내가 한 고침은 띠로 알리지 않는다 */
  const own = async (op: () => Promise<unknown>, fail = '저장하지 못했어요. 다시 시도해 주세요.') => {
    try {
      await op()
      const row = await (await getDb()).get<{ version: number }>('SELECT version FROM wiki_topics WHERE id = ?', [topic.id])
      if (row) { setBaseline(row.version); onSeen(row.version) }
      return true
    } catch (e) { toast.show(e instanceof Error && /[가-힣]/.test(e.message) ? e.message : fail); return false }
  }
  const showChanges = () => pageRef.current?.querySelector('.is-new')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const reason = fresh ? (topic.version - baseline > 1 ? `${topic.version - baseline}번 바뀌었어요 — ${latest?.reason ?? ''}` : latest?.reason ?? '주제가 바뀌었어요') : ''
  const hidden = SECTIONS.filter((s) => !content.sections[s].length && !locked.includes(s) && s !== writing)
  const block = (s: WikiSection): BlockProps => ({ section: s, content, topic, locked: locked.includes(s), readOnly: !!preview, newSince, sources, onJump, own, writing: writing === s, onWritten: () => setWriting(undefined) })

  return (
    <div className="wiki__page" ref={pageRef}>
      <h3 className="wiki__title">{topic.name}</h3>
      <div className="wiki__info">
        <span>자료 {topic.count}개 · {changedAt(topic.modified_at)} · 버전 {topic.version}</span>
        <button className="wiki__btn" onClick={(e) => setHistory(e.currentTarget)}><History />이력</button>
      </div>
      {preview && (
        <div className="wiki__band">
          <History />
          <span className="wiki__band-text">버전 {preview.version} 미리보기 · {preview.reason}</span>
          <button className="wiki__btn is-primary" onClick={() => void own(() => restoreVersion(topic, preview.version)).then((ok) => { if (ok) { setPreview(undefined); toast.show(`버전 ${preview.version}(으)로 되돌렸어요`) } })}>이 버전으로 되돌리기</button>
          <button className="wiki__btn" onClick={() => setPreview(undefined)}>닫기</button>
        </div>
      )}
      {fresh && (
        <div className="wiki__band">
          <Sparkles />
          <span className="wiki__band-text">{reason}</span>
          <button className="wiki__btn is-ghost" onClick={showChanges}>바뀐 곳</button>
          {baseline >= 1 && <button className="wiki__btn" onClick={() => void own(() => restoreVersion(topic, baseline)).then((ok) => ok && toast.show('되돌렸어요'))}>되돌리기</button>}
          <button className="wiki__band-close" aria-label="닫기" onClick={() => setBaseline(topic.version)}><X /></button>
        </div>
      )}
      <SectionBlock {...block('overview')} />
      <SectionBlock {...block('key')} />
      {!preview && !!links?.length && (
        <section className="wiki__sec">
          <h4>볼 것</h4>
          {links.map((l) => (
            <a key={l.id} className="wiki__link" href={l.url!} target="_blank" rel="noreferrer">
              <SiteMark url={l.url!} /><span className="wiki__link-title">{l.link_title || l.url}</span><span className="watch-row__domain">{domainOf(l.url!)}</span>
            </a>
          ))}
        </section>
      )}
      {!!related.length && (
        <section className="wiki__sec">
          <h4>관련 주제</h4>
          <div className="wiki__rel">{related.map((t) => <button key={t.id} onClick={() => onTopic(t.id)}>{t.name}</button>)}</div>
        </section>
      )}
      <SectionBlock {...block('questions')} />
      {!preview && hidden.length > 0 && (
        <p className="wiki__more">
          <Plus />직접 쓰기: {hidden.map((s, i) => <span key={s}>{i > 0 && ' · '}<button onClick={() => setWriting(s)}>{SECTION_NAME[s]}</button></span>)}
        </p>
      )}
      {history && (
        <Popover anchor={history} align="end" width={300} onClose={() => setHistory(null)} className="menu wiki__history">
          <div className="wiki__history-head">이력</div>
          {(versions ?? []).map((v) => (
            <button key={v.id} className={`wiki__history-item${preview?.version === v.version ? ' is-active' : ''}`} onClick={() => { setPreview(v.version === topic.version ? undefined : v); setHistory(null) }}>
              <span className="wiki__history-v">버전 {v.version}{v.version === topic.version ? ' · 지금' : ''}</span>
              <span className="wiki__history-reason">{v.reason}</span>
              <span className="wiki__history-at">{fullKo(v.created_at)}</span>
            </button>
          ))}
          {!versions?.length && <p className="wiki__history-empty">아직 이력이 없어요</p>}
        </Popover>
      )}
    </div>
  )
}

type BlockProps = {
  section: WikiSection
  content: WikiContent
  topic: Topic
  locked: boolean
  readOnly: boolean
  newSince: string | null
  sources: Map<string, Src>
  onJump: (id: string) => void
  own: (op: () => Promise<unknown>) => Promise<boolean>
  /** 숨은 구역의 "직접 쓰기"를 눌렀다 */
  writing: boolean
  onWritten: () => void
}

/** 구역: 점 목록 + 출처 꼬리표. 글을 누르면 그 자리에서 고치고 저장하면 🔒 직접 고침. 잠긴 구역의 AI 변경은 제안으로 */
function SectionBlock({ section, content, topic, locked, readOnly, newSince, sources, onJump, own, writing, onWritten }: BlockProps) {
  const lines = content.sections[section]
  const suggestions = content.suggestions.map((s, i) => ({ ...s, index: i })).filter((s) => s.section === section)
  const [editing, setEditing] = useState<string | null>(null)
  const [showSug, setShowSug] = useState(false)
  useEffect(() => { if (writing) setEditing('') }, [writing])
  const save = async () => {
    if (editing === null) return
    const before = lines.map((l) => l.text).join('\n')
    const text = editing
    setEditing(null)
    onWritten()
    if (text.trim() === before.trim()) return
    await own(() => editSection(topic, section, text))
  }
  const chip = (l: WikiLine) => {
    const n = l.src ? sources.get(l.src) : undefined
    if (!n) return null
    return <button className="wiki__src" onClick={(e) => { e.stopPropagation(); onJump(n.id) }}>{sourceLabel(n)}</button>
  }
  if (!lines.length && !locked && editing === null && !suggestions.length) return null
  return (
    <section className="wiki__sec">
      <h4>
        {SECTION_NAME[section]}
        {locked && <span className="wiki__lock"><Lock />직접 고침</span>}
        {locked && !readOnly && <button className="wiki__unlock" onClick={() => void own(() => unlockSection(topic, section))}>AI에게 맡기기</button>}
      </h4>
      {editing !== null ? (
        <textarea
          className="wiki__editor"
          autoFocus
          rows={Math.max(3, editing.split('\n').length + 1)}
          value={editing}
          placeholder="한 줄에 하나씩 적어 주세요"
          onChange={(e) => setEditing(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); onWritten() }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save() }
          }}
        />
      ) : (
        <ul className={`wiki__lines${readOnly ? '' : ' is-editable'}`} title={readOnly ? undefined : '눌러서 고치기'} onClick={() => { if (!readOnly) setEditing(lines.map((l) => l.text).join('\n')) }}>
          {lines.map((l, i) => <li key={i} className={newSince !== null && l.at > newSince && l.by === 'ai' ? 'is-new' : ''}>{l.text} {chip(l)}</li>)}
          {!lines.length && <li className="wiki__placeholder">눌러서 적기</li>}
        </ul>
      )}
      {!readOnly && suggestions.length > 0 && (
        <div className="wiki__sug">
          <button className="wiki__sug-toggle" onClick={() => setShowSug((v) => !v)}>{showSug ? '제안 접기' : `제안 ${suggestions.length}개 보기`}</button>
          {showSug && suggestions.map((s) => (
            <div key={s.index} className="wiki__sug-item">
              <span>{s.text} {chip(s)}</span>
              <button className="wiki__btn is-primary" onClick={() => void own(() => resolveSuggestion(topic, s.index, true))}>넣기</button>
              <button className="wiki__btn" onClick={() => void own(() => resolveSuggestion(topic, s.index, false))}>버리기</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
