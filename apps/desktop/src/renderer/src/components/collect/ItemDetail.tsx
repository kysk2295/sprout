import { BookOpen, ExternalLink, FileText, Link2, MoreHorizontal, Sparkles, SquareCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CollectKind } from '../../../../shared/collect'
import { domainOf } from '../../../../shared/collect'
import { editItem, reclassify, registerSuggestion, setKind, setSeen, suggestionOf, type CollectItem } from '../../data/collect'
import { collector, summarizeLink, useCollectorStatus } from '../../data/collector'
import { readLinkSummary, summarySourceLabel } from '@sprout/schema/linkSummary'
import { listLabel, type ListRow } from '../../data/types'
import { dayKey, detailDateLabel } from '../../lib/dates'
import { useToast } from '../Toast'
import { PanelClose, panelEsc } from '../PanelClose'
import { KIND_NAME, fullKo, registeredGone, scheduledWord, sentAt } from './shared'

type Props = {
  item?: CollectItem
  lists: ListRow[]
  emptyText: string
  onMenu: (a: HTMLElement) => void
  onConvert: (a: HTMLElement) => void
  onOpen: (id: string) => void
  onTopic: (id: string) => void
  onEmpty: () => void
  /** 01 §2.1 오른쪽 패널 닫기(✕ · Esc) */
  onHide?: () => void
}

/** 상세(336): v2 편집기(첫 줄 = 제목, 0.6초 뒤 자동 저장) + AI 판단 카드(v3-3) */
export function ItemDetail({ item, lists, emptyText, onMenu, onConvert, onOpen, onTopic, onEmpty, onHide }: Props) {
  const split = (s: string) => { const i = s.indexOf('\n'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)] }
  const [title, setTitle] = useState(() => split(item?.content ?? '')[0])
  const [body, setBody] = useState(() => split(item?.content ?? '')[1])
  const saved = useRef(item?.content ?? '')
  const timer = useRef<number>(undefined)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const convertRef = useRef<HTMLButtonElement>(null)
  const join = (t: string, b: string) => (b ? `${t}\n${b}` : t)
  const flush = (t = title, b = body) => {
    window.clearTimeout(timer.current)
    if (!item) return
    const next = join(t, b)
    if (next === saved.current || !next.trim()) return
    saved.current = next
    void editItem(item.id, next)
  }
  const schedule = (t: string, b: string) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => flush(t, b), 600) }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // 다른 곳(동기화)에서 글이 바뀌면 고치는 중이 아닐 때만 따라간다
  useEffect(() => {
    if (!item || item.content === saved.current || document.activeElement === bodyRef.current || document.activeElement === titleRef.current) return
    saved.current = item.content
    const [t, b] = split(item.content)
    setTitle(t); setBody(b)
  }, [item?.content])
  useEffect(() => {
    for (const el of [bodyRef.current, titleRef.current]) {
      if (!el) continue
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [body, title])
  if (!item) {
    return (
      <aside className="detail detail--empty note-detail" onKeyDown={onHide ? panelEsc(onHide) : undefined}>
        {onHide && <PanelClose onClose={onHide} className="detail__close-float" />}
        <FileText className="note-detail__empty-icon" />
        <p className="detail__empty-text">{emptyText}</p>
      </aside>
    )
  }
  const leave = () => {
    if (!join(title, body).trim()) {
      const [t, b] = split(saved.current)
      setTitle(t); setBody(b); onEmpty()
      return
    }
    flush()
  }
  const kakao = item.source === 'kakao_import' || item.source === 'kakao_channel'
  const edited = Date.parse(item.modified_at) - Date.parse(item.created_at) > 60_000 && !kakao
  const links = Array.from(new Set(join(title, body).match(/https?:\/\/[^\s)]+/g) ?? [])).slice(0, 5)
  const linked = !!item.task_id
  const gone = registeredGone(item)
  return (
    <aside className="detail note-detail" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) leave() }} onKeyDown={onHide ? panelEsc(onHide) : undefined}>
      <div className="detail__header">
        <span className="note-detail__meta">{kakao ? `${fullKo(sentAt(item))} · 카톡에서 가져옴` : `${fullKo(item.created_at)} 작성${edited ? ' · 수정됨' : ''}`}</span>
        <div className="detail__footer-actions">
          <button ref={convertRef} className="icon-btn" aria-label={linked && !gone ? '연결된 할 일 열기' : '할 일로 만들기'} onClick={() => convertRef.current && onConvert(convertRef.current)}><SquareCheck /></button>
          <button ref={moreRef} className="icon-btn" aria-label="항목 메뉴" onClick={() => moreRef.current && onMenu(moreRef.current)}><MoreHorizontal /></button>
          {onHide && <PanelClose onClose={() => { leave(); onHide() }} />}
        </div>
      </div>
      <div className="detail__body">
        <textarea
          ref={titleRef}
          rows={1}
          className="detail__title note-detail__title"
          aria-label="제목"
          placeholder="제목"
          value={title}
          onChange={(e) => { const v = e.target.value.replace(/\n/g, ' '); setTitle(v); schedule(v, body) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); bodyRef.current?.focus() } }}
        />
        <textarea
          ref={bodyRef}
          className="note-detail__body"
          aria-label="내용"
          placeholder="내용"
          value={body}
          onChange={(e) => { setBody(e.target.value); schedule(title, e.target.value) }}
        />
        {links.length > 0 && (
          <div className="note-detail__links">
            {links.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer"><Link2 />{l.replace(/^https?:\/\//, '')}</a>)}
          </div>
        )}
        {!linked && <AiCard item={item} lists={lists} onTopic={onTopic} />}
      </div>
      {linked && (
        <div className="detail__footer note-detail__footer">
          {gone ? <span className="note-detail__gone">연결된 항목이 삭제되었어요</span> : (
            <button className="note-detail__link" onClick={() => onOpen(item.task_id!)}>
              <span>↳ {scheduledWord(item)}: {item.task_title}</span>
              <ExternalLink />
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

/** AI 판단 카드: 할 일 = 제목·날짜·리스트 + [할 일로 등록] [메모로 두기], 그 밖 종류는 짧게. 아래에 "다른 종류로" */
function AiCard({ item, lists, onTopic }: { item: CollectItem; lists: ListRow[]; onTopic: (id: string) => void }) {
  const toast = useToast()
  const st = useCollectorStatus()
  const [busy, setBusy] = useState(false)
  const by = item.kind_source === 'user'
  const change = (k: CollectKind) => void setKind(item, k).catch(() => toast.show('바꾸지 못했어요. 다시 시도해 주세요.'))
  const others = (Object.keys(KIND_NAME) as CollectKind[]).filter((k) => k !== item.kind)
  const Other = () => (
    <span className="collect-card__other">다른 종류로:{' '}
      {others.map((k, i) => <span key={k}>{i > 0 && ' · '}<button onClick={() => change(k)}>{KIND_NAME[k]}</button></span>)}
    </span>
  )
  if (item.ai_state === 'pending') {
    return (
      <div className="collect-card">
        <h4>{st.aiDown || st.paused || (!st.auto && !st.working) ? <Sparkles /> : <span className="collect-spin" />}{!st.auto && !st.working ? '자동 분류가 꺼져 있어요' : st.aiDown ? '지금은 AI를 쓸 수 없어요 — 돌아오면 정리해요' : st.paused ? '정리를 멈췄어요' : '정리 중…'}</h4>
        {!st.auto && <div className="collect-card__acts"><button className="is-primary" onClick={() => collector.force(item.id)}>AI로 정리</button></div>}
        <Other />
      </div>
    )
  }
  if (!item.kind || item.ai_state === 'failed') {
    return (
      <div className="collect-card">
        <h4><Sparkles />{item.ai_state === 'failed' ? '정리하지 못했어요' : '아직 정리하지 않았어요'}</h4>
        <div className="collect-card__acts"><button className="is-primary" onClick={() => void reclassify(item.id).then(() => collector.force(item.id))}>AI로 정리</button></div>
        <Other />
      </div>
    )
  }
  if (item.kind === 'task') {
    const s = suggestionOf(item)
    const list = lists.find((l) => l.id === s?.listId) ?? lists.find((l) => l.kind === 'inbox')
    const date = s?.due ? detailDateLabel({ start_at: s.start || null, due_at: s.due }, dayKey()) : null
    const register = async () => {
      setBusy(true)
      try { await registerSuggestion(item, lists); toast.show(`"${s?.title || item.content.split('\n')[0]}" 할 일로 등록했어요`) }
      catch (e) { toast.show(e instanceof Error ? e.message : '등록하지 못했어요. 다시 시도해 주세요.') }
      finally { setBusy(false) }
    }
    return (
      <div className="collect-card">
        <h4><Sparkles />{by ? '할 일로 정했어요' : 'AI가 할 일로 봤어요'}</h4>
        <div className="collect-card__f"><span>제목</span><span>{s?.title || item.content.split('\n')[0]}</span></div>
        <div className="collect-card__f"><span>날짜</span><span className={date ? `is-${date.tone}` : ''}>{date?.label ?? '없음'}</span></div>
        <div className="collect-card__f"><span>리스트</span><span>{list ? listLabel(list) : '기본함'}</span></div>
        <div className="collect-card__acts">
          <button className="is-primary" disabled={busy} onClick={() => void register()}>할 일로 등록</button>
          <button onClick={() => change('memo')}>메모로 두기</button>
        </div>
        <Other />
      </div>
    )
  }
  if (item.kind === 'link') {
    return (
      <div className="collect-card">
        <h4><Link2 />{by ? '볼 것으로 정했어요' : 'AI가 볼 것으로 봤어요'}</h4>
        <div className="collect-card__f"><span>제목</span><span>{item.link_title || (item.url && item.link_title === null ? '제목을 가져오는 중…' : item.url ?? '링크 없음')}</span></div>
        {item.url && <div className="collect-card__f"><span>사이트</span><span>{domainOf(item.url)}</span></div>}
        {item.url && item.link_title !== null && <LinkSummaryBlock item={item} />}
        <div className="collect-card__acts">
          {item.url && <a className="is-primary" href={item.url} target="_blank" rel="noreferrer">링크 열기</a>}
          {item.url && <button onClick={() => void setSeen(item.id, !item.seen_at)}>{item.seen_at ? '안 본 것으로' : '봤어요'}</button>}
        </div>
        <Other />
      </div>
    )
  }
  if (item.kind === 'wiki') {
    return (
      <div className="collect-card">
        <h4><BookOpen />{by ? '위키로 정했어요' : 'AI가 위키로 봤어요'}</h4>
        <div className="collect-card__f"><span>주제</span><span>{item.topic_name ?? '정리 중…'}</span></div>
        {item.topic_id && <div className="collect-card__acts"><button onClick={() => onTopic(item.topic_id!)}>위키에서 보기</button></div>}
        <Other />
      </div>
    )
  }
  return (
    <div className="collect-card">
      <h4><FileText />{by ? '메모로 두었어요' : 'AI가 메모로 봤어요'}</h4>
      <Other />
    </div>
  )
}

/** 11 v3-8 링크 요약: 점 3줄 + 출처 · 없으면 [요약하기] · 못 읽었으면 안내 + [다시 시도] */
function LinkSummaryBlock({ item }: { item: CollectItem }) {
  const s = readLinkSummary(item.suggestion, item.url)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setBusy(false); setFailed(false) }, [item.id])
  const go = async () => {
    if (busy || !item.url) return
    setBusy(true); setFailed(false)
    const ctl = new AbortController()
    const r = await summarizeLink(item.id, item.url, ctl.signal).catch(() => 'fail' as const)
    setBusy(false)
    if (r === 'fail') setFailed(true)
  }
  if (s && 'lines' in s) {
    return (
      <div className="collect-summary">
        <div className="collect-summary__h">요약</div>
        {s.head && <p className="collect-summary__head">{s.head}</p>}
        <ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <div className="collect-summary__src">{summarySourceLabel(s)}</div>
      </div>
    )
  }
  const canRun = !!window.sprout?.collect
  return (
    <div className="collect-summary is-empty">
      <div className="collect-summary__h">요약</div>
      <p>{busy ? '요약하는 중…' : s ? '요약할 내용을 찾지 못했어요' : failed ? 'AI가 답하지 못했어요' : canRun ? '아직 요약하지 않았어요' : '앱에서 요약해요'}</p>
      {canRun && !busy && <button onClick={() => void go()}>{s || failed ? '다시 시도' : '요약하기'}</button>}
    </div>
  )
}
