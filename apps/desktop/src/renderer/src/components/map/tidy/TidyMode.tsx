// 작업 지도 v2 — 정리 모드 = 분류 책상(31 §12 정리, 시안 mockups/work-map-modes-v2.html ①②③).
// 왼쪽 더미(탭 4개)를 오른쪽 상자에 넣는다: 위 줄 = 프로젝트에 묶기(태그만), 아래 = 폴더 › 리스트(옮김). AI 제안 = 곡선 화살표 + 좋아/아니.
import { Check, Plus, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { isUnavailable } from '../../../data/ai'
import { askAi, keywordSure, readSuggestContext, serial, suggestStore, SUGGEST } from '../../../data/listSuggest'
import { createList } from '../../../data/mutations'
import { nextMonday } from '../../../data/mapMoments'
import { applyCleanup, beginCleanupSession, type CleanupOp } from '../../../data/overdue'
import {
  addProjectTag, applyProposals, bubbleFor, dragSet, lateGroups, moveToList, nextSelection, proposalsFor, rowMeta, snapshotLate, targetKey, tidyNo,
  TAB_LABEL, TIDY, TIDY_TABS, type Proposal, type Target, type TidyTab, type TidyTask
} from '../../../data/tidy'
import { listView } from '../../../data/types'
import { withRo } from '../../../lib/dates'
import { openInboxOrganize } from '../../listSuggest/ListSuggest'
import type { ModeSlotProps } from '../modes'
import { BuddyAvatar, PartnerLine, useBuddy, useReducedMotion } from '../PlanChat'
import { useTidyData, type TidyData } from './useTidyData'
import './tidy.css'

type Undo = () => Promise<void>
type Drag = { ids: string[]; title: string; x: number; y: number; ox: number; oy: number; over: string | null; from: string }
type Arrow = { d: string; x1: number; y1: number; dashed?: boolean; key: string }
/** AI에 물어본 기본함 할 일(앱이 켜져 있는 동안 한 번만) */
const asked = new Set<string>()
/** 옮기면 30 제안을 지우고(칩이 남지 않게), 되돌리면 그 제안을 되살린다 */
function clearSuggest(ids: string[], undo: Undo): Undo {
  const items = suggestStore.get().items
  const prev = ids.flatMap((id) => (items[id] ? [{ taskId: id, ...items[id] }] : []))
  suggestStore.clear(ids)
  return async () => { await undo(); if (prev.length) suggestStore.put(prev, prev[0].at) }
}
const TAB_KEY = 'sprout.map.tidy.tab'
const readTidyTab = (): TidyTab => { try { const v = localStorage.getItem(TAB_KEY) as TidyTab | null; return v && TIDY_TABS.includes(v) ? v : 'inbox' } catch { return 'inbox' } }
const writeTidyTab = (t: TidyTab) => { try { localStorage.setItem(TAB_KEY, t) } catch { /* 기억만 못 한다 */ } }
/** 다른 모드에서 정리의 특정 탭으로 열 때: 이것을 부른 뒤 onMode('tidy') */
export const openTidyTab = (t: TidyTab) => writeTidyTab(t)

export function TidyMode({ onSelectTask, onMode, notify }: ModeSlotProps & { onClose?: () => void }) {
  const [noVersion, setNoVersion] = useState(0)
  const data = useTidyData(noVersion)
  const [tab, setTabState] = useState<TidyTab>(readTidyTab)
  const setTab = (t: TidyTab) => { setTabState(t); writeTidyTab(t) }
  const [sel, setSel] = useState<string[]>([])
  const anchor = useRef<string | null>(null)
  const [one, setOne] = useState(false)
  const [ai, setAi] = useState<'idle' | 'asking' | 'off'>('idle')
  const [drag, setDrag] = useState<Drag | null>(null)
  const [newList, setNewList] = useState<{ ids: string[] } | null>(null)
  const session = useRef<Undo[]>([])
  const [, setUndoN] = useState(0)
  const reduced = useReducedMotion()

  // 19 만료 정리와 같은 "정리 한 번" — 설정 › 할 일 › 마지막 정리 되돌리기도 이 정리를 가리킨다
  useEffect(() => { beginCleanupSession() }, [])
  useEffect(() => { setSel([]); anchor.current = null; setOne(false) }, [tab])

  const pile = data.piles[tab]
  const order = useMemo(() => pile.map((t) => t.id), [pile])
  // 사라진 할 일은 고름에서 뺀다
  useEffect(() => { setSel((s) => { const n = s.filter((id) => order.includes(id)); return n.length === s.length ? s : n }) }, [order])
  const proposals = useMemo(() => proposalsFor(tab, pile, data.listOf, data.projects, data.liveLists), [tab, pile, data])
  const propOf = useMemo(() => new Map(proposals.map((p) => [p.taskId, p])), [proposals])
  const counts = useMemo(() => Object.fromEntries(TIDY_TABS.map((t) => [t, data.piles[t].length])) as Record<TidyTab, number>, [data.piles])
  const allClear = data.loaded && TIDY_TABS.every((t) => counts[t] === 0)

  const remember = useCallback((u: Undo) => { session.current.push(u); setUndoN(session.current.length) }, [])
  const say = useCallback((text: string, undo?: Undo) => {
    if (undo) remember(undo)
    notify(text, undo ? { label: '되돌리기', run: () => { session.current = session.current.filter((x) => x !== undo); setUndoN(session.current.length); void undo() } } : undefined)
  }, [notify, remember])

  // ── 기본함: 아직 제안이 없는 할 일을 AI에(30 §B.3과 같은 길 — 낱말 검사 먼저, 나머지는 background 우선순위) ──
  const askInbox = useCallback(async (manual: boolean) => {
    const s = suggestStore.get()
    const todo = data.piles.inbox.filter((t) => !s.items[t.id] && !s.dismissed[t.id] && !asked.has(t.id)).slice(0, SUGGEST.batch)
    if (!todo.length) { if (manual) openInboxOrganize(); return }
    todo.forEach((t) => asked.add(t.id))
    setAi('asking')
    try {
      // ① 낱말 검사는 AI 줄을 기다리지 않고 바로(자동 태그 일괄이 AI 줄을 오래 쓸 수 있다)
      const ctx0 = await readSuggestContext()
      const pre = keywordSure(todo, ctx0.lists, ctx0.recent)
      if (pre.length) suggestStore.put(pre)
      const rest = todo.filter((t) => !pre.some((p) => p.taskId === t.id))
      // ② 나머지만 AI에(30과 같은 줄 serial, background 우선순위)
      if (rest.length) await serial(async () => {
        const ctx = await readSuggestContext()
        const left = rest.filter((t) => { const s2 = suggestStore.get(); return !s2.items[t.id] && !s2.dismissed[t.id] })
        if (left.length) suggestStore.put(await askAi(left, ctx.lists, { signal: new AbortController().signal, recent: ctx.recent }))
      })
      setAi('idle')
    } catch (e) {
      todo.forEach((t) => asked.delete(t.id))
      setAi(isUnavailable(e) ? 'off' : 'idle')
      if (!isUnavailable(e)) console.warn('[tidy] 기본함 제안 실패', e)
    }
  }, [data.piles.inbox])
  const autoAsked = useRef(false)
  useEffect(() => {
    if (!data.loaded || autoAsked.current || !data.piles.inbox.length) return
    autoAsked.current = true
    void askInbox(false)
  }, [data.loaded, data.piles.inbox.length, askInbox])

  // ── 이름표 ──
  const targetLabel = useCallback((t: Target) => {
    if (t.kind === 'project') { const g = data.byTag.get(t.id); return g ? `${g.name} 프로젝트에 묶기` : '프로젝트' }
    const l = data.byList.get(t.id)
    if (!l) return '리스트'
    const f = l.folder_id ? data.byFolder.get(l.folder_id) : undefined
    const v = listView(l)
    return `${v.emoji ? `${v.emoji} ` : ''}${f ? `${f.name} › ` : ''}${v.name}`
  }, [data])
  const placeOf = useCallback((t: TidyTask) => {
    const l = t.list_id ? data.byList.get(t.list_id) : undefined
    if (!l || l.kind === 'inbox') return '기본함'
    const f = l.folder_id ? data.byFolder.get(l.folder_id) : undefined
    const v = listView(l)
    return `${v.emoji ? `${v.emoji} ` : ''}${f ? `${f.name} › ` : ''}${v.name}`
  }, [data])

  // ── 동작 ──
  const drop = useCallback(async (ids: string[], to: Target) => {
    if (!ids.length) return
    if (to.kind === 'list') {
      const r = await moveToList(ids, to.id)
      const undo = clearSuggest(ids, r.undo)
      const l = data.byList.get(to.id)
      if (r.moved) say(ids.length === 1 ? `${withRo(l ? listView(l).name : '리스트')} 옮겼어요` : `${r.moved}개를 ${withRo(l ? listView(l).name : '리스트')} 옮겼어요`, undo)
    } else {
      const r = await addProjectTag(ids, to.id)
      const g = data.byTag.get(to.id)
      if (r.added) say(`${r.added}개를 ${g?.name ?? '프로젝트'}에 묶었어요`, r.undo)
    }
    setSel((s) => s.filter((id) => !ids.includes(id)))
  }, [data, say])
  const yes = useCallback((p: Proposal) => void drop([p.taskId], p.to), [drop])
  const no = useCallback((p: Proposal) => {
    if (p.to.kind === 'list') suggestStore.dismiss([p.taskId])
    else { tidyNo.add({ [p.taskId]: p.to.id }); setNoVersion((v) => v + 1) }
  }, [])
  const applyAll = useCallback(async () => {
    if (!proposals.length) return
    const r = await applyProposals(proposals)
    const undo = clearSuggest(proposals.filter((p) => p.to.kind === 'list').map((p) => p.taskId), r.undo)
    const parts = [r.lists ? `${r.lists}개 옮김` : '', r.projects ? `${r.projects}개 프로젝트에 묶음` : ''].filter(Boolean)
    if (parts.length) say(`제안대로 ${parts.join(' · ')}`, undo)
    setOne(false)
  }, [proposals, say])
  const late = useCallback(async (op: 'today' | 'week' | 'done' | 'trash', ids = sel) => {
    if (!ids.length) return
    const today = data.today
    const cleanup: CleanupOp = op === 'today' ? { kind: 'date', date: today } : op === 'week' ? { kind: 'date', date: nextMonday(today) } : { kind: op }
    const undo = await snapshotLate(ids, op === 'done' || op === 'trash')
    await applyCleanup(ids, cleanup, today)
    const msg = { today: `${ids.length}개를 오늘로 옮겼어요`, week: `${ids.length}개를 다음 주로 옮겼어요`, done: `${ids.length}개를 완료했어요 (XP 없음)`, trash: `${ids.length}개를 휴지통으로 옮겼어요` }[op]
    say(msg, undo)
    setSel([])
  }, [sel, data.today, say])
  const undoSession = useCallback(async () => {
    const all = session.current.splice(0)
    setUndoN(0)
    for (const u of all.reverse()) await u()
    if (all.length) notify('이번 정리를 되돌렸어요')
  }, [notify])
  const makeList = useCallback(async (name: string, ids: string[]) => {
    const n = name.trim()
    if (!n) return
    const id = await createList(n)
    if (ids.length) {
      const r = await moveToList(ids, id)
      say(`새 리스트 ${withRo(n)} ${r.moved}개를 옮겼어요`, clearSuggest(ids, r.undo))
    }
    setNewList(null)
  }, [say])

  // ── 고르기 ──
  const pick = (id: string, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, toggle = false) => {
    if (justDragged.current) return
    const r = nextSelection(order, sel, anchor.current, id, { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey, toggle })
    anchor.current = r.anchor
    setSel(r.sel)
  }

  // ── 끌기(포인터 — 끄는 동안 카드가 포인터를 따라가고 상자가 점선으로 켜진다) ──
  const press = useRef<{ id: string; x: number; y: number; el: HTMLElement } | null>(null)
  const deskRef = useRef<HTMLDivElement>(null)
  const onRowDown = (e: RPointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return
    press.current = { id, x: e.clientX, y: e.clientY, el: e.currentTarget }
  }
  // 끌고 나서 생기는 click은 고르기로 치지 않는다
  const justDragged = useRef(false)
  const dragRef = useRef<Drag | null>(null)
  const setDragBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d) }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      const d = dragRef.current
      if (!d && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return
      const ids = d?.ids ?? dragSet(order, sel, p.id)
      const r = p.el.getBoundingClientRect()
      const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]')
      const title = d?.title ?? (pile.find((t) => t.id === p.id)?.title ?? '')
      setDragBoth({ ids, title, x: e.clientX, y: e.clientY, ox: r.right, oy: r.top + r.height / 2, over: hit?.dataset.drop ?? null, from: p.id })
    }
    const up = () => {
      press.current = null
      const d = dragRef.current
      setDragBoth(null)
      if (d) { justDragged.current = true; setTimeout(() => { justDragged.current = false }, 0) }
      if (!d?.over) return
      if (d.over === 'new') setNewList({ ids: d.ids })
      else { const [kind, id] = d.over.split(':'); void drop(d.ids, { kind: kind as Target['kind'], id }) }
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && (press.current || dragRef.current)) { press.current = null; setDragBoth(null) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', key) }
  }, [order, sel, pile, drop])
  useEffect(() => {
    document.body.classList.toggle('td-dragging', !!drag)
    return () => document.body.classList.remove('td-dragging')
  }, [drag])

  // ── 화살표(더미 행 → 상자) ──
  const shown = useMemo(() => {
    const p = proposals.filter((x) => order.includes(x.taskId))
    return one ? p.slice(0, 1) : p.slice(0, TIDY.maxArrows)
  }, [proposals, order, one])
  const [arrows, setArrows] = useState<Arrow[]>([])
  // 행에 올리면 그 화살표·상자만 진하게(나머지는 옅게) — 화살표가 많을 때 어디로 가는지 읽히게
  const [hover, setHover] = useState<string | null>(null)
  const lit = useMemo(() => (hover && shown.some((p) => p.taskId === hover) ? shown.filter((p) => p.taskId === hover) : shown), [hover, shown])
  const pileRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const measure = useCallback(() => {
    const desk = deskRef.current
    if (!desk) return
    const R = desk.getBoundingClientRect()
    const P = pileRef.current?.getBoundingClientRect()
    const B = boxRef.current?.getBoundingClientRect()
    const inside = (r: DOMRect, c?: DOMRect) => !c || (r.top + r.height / 2 >= c.top && r.top + r.height / 2 <= c.bottom)
    const out: Arrow[] = []
    for (const p of shown) {
      const a = desk.querySelector<HTMLElement>(`[data-row="${CSS.escape(p.taskId)}"]`)
      const b = desk.querySelector<HTMLElement>(`[data-drop="${CSS.escape(targetKey(p.to))}"]`)
      if (!a || !b) continue
      const A = a.getBoundingClientRect(), Bt = b.getBoundingClientRect()
      if (!inside(A, P) || !inside(Bt, B)) continue
      const x1 = A.right - R.left, y1 = A.top - R.top + A.height / 2
      const x2 = Bt.left - R.left - 3, y2 = Bt.top - R.top + Bt.height / 2
      const mx = (x1 + x2) / 2
      out.push({ key: p.taskId, x1, y1, d: `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` })
    }
    setArrows((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out))
  }, [shown])
  useLayoutEffect(() => { measure() })
  useEffect(() => {
    const desk = deskRef.current
    if (!desk) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(desk)
    const on = () => requestAnimationFrame(measure)
    desk.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    return () => { ro.disconnect(); desk.removeEventListener('scroll', on, true); window.removeEventListener('resize', on) }
  }, [measure])
  const dragArrow = useMemo(() => {
    const desk = deskRef.current
    if (!drag || !desk) return null
    const R = desk.getBoundingClientRect()
    const x1 = drag.ox - R.left, y1 = drag.oy - R.top, x2 = drag.x - R.left - 6, y2 = drag.y - R.top
    const mx = (x1 + x2) / 2
    return { x1, y1, d: `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` }
  }, [drag])

  // ── 말풍선 ──
  const old = useMemo(() => (tab === 'overdue' ? lateGroups(pile, data.today).find((g) => g.key === 'old')?.tasks ?? [] : []), [tab, pile, data.today])
  const bubble = bubbleFor(tab, pile.length, proposals.length, { old: old.length, aiOk: ai !== 'off' })
  const chipRun = {
    apply: { label: '좋아', run: () => void applyAll() },
    one: { label: '하나씩 볼래', run: () => setOne(true) },
    ask: { label: '좋아', run: () => void askInbox(true) },
    pickOld: { label: '한 달 넘은 것 고르기', run: () => setSel(old.map((t) => t.id)) },
    today: { label: '전부 고르기', run: () => setSel(order) }
  }

  if (!data.loaded) return <div className="td td--loading" aria-busy="true" />
  if (allClear) return <Finished onPlan={() => onMode('plan')} canUndo={session.current.length > 0} onUndo={() => void undoSession()} />

  return (
    <div className={`td${reduced ? ' is-still' : ''}`}>
      <div className="td-bubble">
        <PartnerLine text={ai === 'asking' && tab === 'inbox' && !proposals.length ? '기본함을 살펴보는 중이야…' : bubble.text} chips={bubble.chips.map((c) => chipRun[c])} />
      </div>
      <div className="td-desk" ref={deskRef}>
        <section className="td-pile" aria-label="정리할 것">
          <h4 className="td-pile__h">정리할 것</h4>
          <div className="td-tabs" role="tablist">
            {TIDY_TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`td-tab${tab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>
                {TAB_LABEL[t]} <b>{counts[t]}</b>
              </button>
            ))}
          </div>
          {tab === 'overdue' ? (
            <div className="td-bulk">
              <span className="td-bulk__n">{sel.length ? `${sel.length}개 고름` : '골라서 한꺼번에'}</span>
              <button className="td-act is-primary" disabled={!sel.length} onClick={() => void late('today')}>오늘로</button>
              <button className="td-act" disabled={!sel.length} onClick={() => void late('week')}>다음 주로</button>
              <button className="td-act" disabled={!sel.length} onClick={() => void late('done')} title="완료로 바꿔요. 밀린 일 정리라 XP는 없어요">완료 처리 (XP 없음)</button>
              <button className="td-act is-danger" disabled={!sel.length} onClick={() => void late('trash')}>지우기</button>
            </div>
          ) : null}
          <div className="td-pile__scroll" ref={pileRef}>
            {pile.length === 0 ? <p className="td-empty"><Check /> {TAB_LABEL[tab]} 깨끗해요</p>
              : tab === 'overdue'
                ? lateGroups(pile, data.today).map((g) => {
                  const ids = g.tasks.map((t) => t.id)
                  const all = ids.every((id) => sel.includes(id))
                  return (
                    <div key={g.key} className="td-group">
                      <div className="td-group__h">
                        <span>{g.label} · {g.tasks.length}</span>
                        <button className="td-link" onClick={() => setSel((s) => (all ? s.filter((id) => !ids.includes(id)) : [...new Set([...s, ...ids])]))}>{all ? '고름 풀기' : '모두 고르기'}</button>
                      </div>
                      {g.tasks.map((t) => <Row key={t.id} t={t} tab={tab} data={data} place={placeOf(t)} sel={sel.includes(t.id)} dragging={!!drag?.ids.includes(t.id)} onDown={onRowDown} onPick={pick} onOpen={onSelectTask} />)}
                    </div>
                  )
                })
                : pile.map((t, i) => {
                  const p = propOf.get(t.id)
                  const focus = one && shown[0]?.taskId === t.id
                  return (
                    <Row key={t.id} t={t} tab={tab} data={data} place={placeOf(t)} sel={sel.includes(t.id)} dragging={!!drag?.ids.includes(t.id)}
                      dim={one && !focus} focus={focus} lazy={i > 60} onDown={onRowDown} onPick={pick} onOpen={onSelectTask} onHover={setHover}
                      proposal={p ? { label: targetLabel(p.to), yes: () => yes(p), no: () => no(p) } : undefined} />
                  )
                })}
          </div>
          {tab !== 'overdue' && pile.length > 0 && (
            <footer className="td-pile__foot">
              {/* 고름이 있으면 아래 줄이 고름 줄로(위에 끼우면 행이 밀려 다음 클릭이 빗나간다) */}
              {sel.length > 0 ? (
                <>
                  <span className="td-bulk__n">{sel.length}개 고름 · 끌어서 상자에 놓아요</span>
                  <button className="map-btn" onClick={() => setSel([])}>고름 풀기</button>
                </>
              ) : proposals.length > 0 ? (
                <>
                  <button className="map-btn map-btn--primary" onClick={() => void applyAll()}>제안 {proposals.length}개 모두 옮기기</button>
                  {one ? <button className="map-btn" onClick={() => setOne(false)}>모두 보기</button> : <button className="map-btn" onClick={() => setOne(true)}>하나씩 볼래</button>}
                </>
              ) : tab === 'inbox' ? (
                <button className="map-btn" disabled={ai === 'asking' || ai === 'off'} onClick={() => void askInbox(true)}><Sparkles /> {ai === 'asking' ? '살펴보는 중…' : '어디에 둘지 제안 받기'}</button>
              ) : null}
              {ai === 'off' && tab === 'inbox' && <span className="td-note">지금은 AI를 쓸 수 없어요. 끌어서 직접 옮길 수 있어요.</span>}
            </footer>
          )}
        </section>

        <section className="td-boxes" ref={boxRef} aria-label="놓을 곳">
          <div className="td-proj">
            <span className="td-proj__h">프로젝트에 묶기 <small>리스트는 그대로, 태그만 붙어요</small></span>
            <div className="td-proj__row">
              {data.targets.length ? data.targets.map(({ tag, count }) => {
                const key = targetKey({ kind: 'project', id: tag.id })
                return (
                  <span key={tag.id} data-drop={key} className={`td-chip${drag?.over === key ? ' is-over' : ''}${hit(drag ? [] : lit, key) ? ' is-hit' : ''}`}>
                    {tag.name} <em>{count}</em>
                  </span>
                )
              }) : <span className="td-note">프로젝트 태그가 아직 없어요 — 태그를 ‘프로젝트’ 종류로 바꾸면 여기에 생겨요</span>}
            </div>
          </div>
          <div className="td-buckets">
            {data.buckets.map((b) => b.kind === 'folder' ? (
              <div key={b.id} className={`td-bk${b.lists.some((l) => drag?.over === `list:${l.list.id}`) ? ' is-near' : ''}`}>
                <h5>{b.name} <em>{b.count}</em></h5>
                <ul>
                  {b.lists.map(({ list, count }) => {
                    const key = targetKey({ kind: 'list', id: list.id })
                    const v = listView(list)
                    return (
                      <li key={list.id} data-drop={key} className={`${drag?.over === key ? 'is-over' : ''}${hit(drag ? [] : lit, key) ? ' is-hit' : ''}`}>
                        <span className="td-bk__name">{v.emoji ? `${v.emoji} ` : ''}{v.name}</span><span className="td-bk__n">{count}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <div key={b.id} data-drop={targetKey({ kind: 'list', id: b.box.list.id })}
                className={`td-bk td-bk--list${drag?.over === `list:${b.box.list.id}` ? ' is-over' : ''}${hit(drag ? [] : lit, `list:${b.box.list.id}`) ? ' is-hit' : ''}`}>
                {/* 끄는 중에 높이가 바뀌면 아래 상자가 밀려 놓을 곳이 빗나간다 → 숫자 자리에 `여기에 놓기` */}
                <h5>{listView(b.box.list).emoji ? `${listView(b.box.list).emoji} ` : ''}{listView(b.box.list).name} <em>{drag?.over === `list:${b.box.list.id}` ? '여기에 놓기' : b.box.count}</em></h5>
              </div>
            ))}
            {newList ? (
              <NewListBox count={newList.ids.length} onSave={(n) => void makeList(n, newList.ids)} onCancel={() => setNewList(null)} />
            ) : (
              <button data-drop="new" className={`td-bk td-bk--new${drag?.over === 'new' ? ' is-over' : ''}`} onClick={() => setNewList({ ids: [] })}><Plus /> 새 리스트</button>
            )}
          </div>
        </section>

        <svg className="td-arrows" aria-hidden="true">
          <defs>
            <marker id="td-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>
          </defs>
          {!drag && arrows.map((a) => (
            <g key={a.key} className={`td-arrow${hover && arrows.some((x) => x.key === hover) ? (a.key === hover ? ' is-on' : ' is-off') : ''}`}>
              <path d={a.d} markerEnd="url(#td-ah)" />
              <circle cx={a.x1} cy={a.y1} r="3.5" />
            </g>
          ))}
          {dragArrow && (
            <g className="td-arrow is-drag">
              <path d={dragArrow.d} />
              <circle cx={dragArrow.x1} cy={dragArrow.y1} r="3.5" />
            </g>
          )}
        </svg>
      </div>
      {drag && (
        <div className="td-ghost" style={{ left: drag.x + 14, top: drag.y + 12 }}>
          <span className="td-ghost__t">{drag.title}</span>
          {drag.ids.length > 1 && <span className="td-ghost__n">{drag.ids.length}</span>}
        </div>
      )}
    </div>
  )
}

const hit = (shown: Proposal[], key: string) => shown.some((p) => targetKey(p.to) === key)

function Row({ t, tab, data, place, sel, dragging, dim, focus, lazy, proposal, onHover, onDown, onPick, onOpen }: {
  t: TidyTask; tab: TidyTab; data: TidyData; place: string; sel: boolean; dragging: boolean; dim?: boolean; focus?: boolean; lazy?: boolean
  proposal?: { label: string; yes: () => void; no: () => void }
  onHover?: (id: string | null) => void
  onDown: (e: RPointerEvent<HTMLElement>, id: string) => void
  onPick: (id: string, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, toggle?: boolean) => void
  onOpen: (id: string) => void
}) {
  const meta = rowMeta(tab, t, place, data.today)
  const manual = tab !== 'overdue' && !proposal
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [focus])
  return (
    <div ref={ref} data-row={t.id} role="option" aria-selected={sel} tabIndex={0}
      className={`td-it${sel ? ' is-sel' : ''}${dragging ? ' is-lifted' : ''}${dim ? ' is-dim' : ''}${focus ? ' is-focus' : ''}${manual ? ' is-manual' : ''}${tab === 'overdue' ? ' is-late' : ''}`}
      style={lazy ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 64px' } : undefined}
      onPointerDown={(e) => onDown(e, t.id)}
      onPointerEnter={() => onHover?.(t.id)} onPointerLeave={() => onHover?.(null)}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onPick(t.id, e) }}
      onDoubleClick={() => onOpen(t.id)}
      onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); onPick(t.id, e, true) } else if (e.key === 'Enter') onOpen(t.id) }}>
      <div className="td-it__t">
        <button className={`td-cb${sel ? ' is-on' : ''}`} aria-label={sel ? '고름 풀기' : '고르기'} onClick={(e) => onPick(t.id, e, true)}>{sel && <Check />}</button>
        <span className="td-it__title" title={t.title}>{t.title}</span>
      </div>
      <div className={`td-it__m${tab === 'overdue' ? ' is-late' : ''}`}>{manual && tab !== 'untagged' && tab !== 'outside' ? `${meta} · 확실하지 않아요 — 끌어서 넣어 주세요` : meta}</div>
      {proposal && (
        <div className="td-it__s">
          <span className="td-it__arrow">→</span><span className="td-it__to">{proposal.label}</span>
          <button className="td-yes" onClick={proposal.yes}>좋아</button>
          <button className="td-no" onClick={proposal.no}>아니</button>
        </div>
      )}
    </div>
  )
}

function NewListBox({ count, onSave, onCancel }: { count: number; onSave: (name: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('')
  return (
    <div className="td-bk td-bk--input">
      <input autoFocus value={v} placeholder="새 리스트 이름" maxLength={40} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSave(v); else if (e.key === 'Escape') onCancel() }} />
      <div className="td-bk__acts">
        <span className="td-note">{count ? `${count}개를 옮겨요` : 'Enter로 만들기'}</span>
        <button className="map-btn" onClick={onCancel}>취소</button>
        <button className="map-btn map-btn--primary" disabled={!v.trim()} onClick={() => onSave(v)}>만들기</button>
      </div>
    </div>
  )
}

function Finished({ onPlan, canUndo, onUndo }: { onPlan: () => void; canUndo: boolean; onUndo: () => void }) {
  const { buddy, stage } = useBuddy()
  return (
    <div className="td td-fin">
      <BuddyAvatar buddy={buddy} stage={stage} size={110} mood="happy" />
      <h3>다 정리했어!</h3>
      <p>기본함 0 · 기한 지난 일 0 · 프로젝트 밖 0 · 태그 없음 0</p>
      <div className="td-fin__acts">
        <button className="map-btn map-btn--primary" onClick={onPlan}>계획 보러 가기</button>
        {canUndo && <button className="map-btn" onClick={onUndo}>이번 정리 되돌리기</button>}
      </div>
    </div>
  )
}
