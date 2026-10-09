import { useState, type ReactNode } from 'react'
import { Check, MoreHorizontal, Tag } from 'lucide-react'
import { MenuItem, Popover } from '../Popover'
import { useToast } from '../Toast'
import { autoTag, KIND_LABEL, kindOf, TAG_KINDS } from '../../data/wiki'
import { tagShow } from '../../../../shared/emoji'
import './wiki.css'

// 33 §4.2 사이드바 태그 구역: 틱틱 그대로(자리·순서·고정·2단계 부모·끌어 붙이기·우클릭) + 종류 아이콘 + `⋯ › 보기: 전부 · 종류별`
// + 조용한 `✦ AI가 붙인 태그` 요약·되돌리기(사용자 결정 2026-10-05: 태그 입력은 귀찮다 → 승인 카드 없이 자동, 되돌리기만 남긴다)
export type TagMode = 'all' | 'kind'
type T = { id: string; name: string; parent_id?: string | null; kind?: string | null }

/** 태그 아이콘(30 §A.5): 이름 앞 이모지(여럿이면 하나) → 종류 아이콘(👤🚀📍) → 주제는 태그 그림. 이름 글은 tagShow(t).name */
export function TagKindIcon({ kind, name = '' }: { kind?: string | null; name?: string }) {
  const e = tagShow({ name, kind: kindOf(kind) }).emoji
  return e ? <span className="sidebar__emoji sidebar__kind">{e}</span> : <Tag />
}

/** 태그 줄들: 전부 = 틱틱(부모 아래 자식), 종류별 = 사람 · 프로젝트 · 장소 · 주제 작은 머리로 묶음 */
export function SidebarTagItems<X extends T>({ tags, mode, render }: { tags: X[]; mode: TagMode; render: (t: X) => ReactNode }) {
  if (mode === 'kind') {
    const order = ['person', 'project', 'place', 'topic'] as const
    return (
      <>
        {order.map((k) => {
          const group = tags.filter((t) => kindOf(t.kind) === k)
          if (!group.length) return null
          return <div key={k}><div className="sidebar__kind-head">{KIND_LABEL[k]}</div>{group.map(render)}</div>
        })}
      </>
    )
  }
  return (
    <>
      {tags.filter((t) => !t.parent_id || !tags.some((p) => p.id === t.parent_id)).map((t) => (
        <div key={t.id}>{render(t)}<div className="sidebar-folder-children">{tags.filter((c) => c.parent_id === t.id).map(render)}</div></div>
      ))}
    </>
  )
}

export function TagSectionMenu({ mode, onMode }: { mode: TagMode; onMode: (m: TagMode) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [info, setInfo] = useState<Awaited<ReturnType<ReturnType<typeof autoTag>['summary']>>>()
  const toast = useToast()
  const openMenu = (el: HTMLElement) => {
    setAnchor(el)
    void autoTag().summary().then(setInfo).catch(() => setInfo(undefined))
  }
  return (
    <>
      <button aria-label="태그 메뉴" onClick={(e) => (anchor ? setAnchor(null) : openMenu(e.currentTarget))}><MoreHorizontal /></button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} className="menu" width={210}>
          <div className="menu__caption">보기</div>
          <MenuItem label="전부" active={mode === 'all'} trail={mode === 'all' ? <Check className="menu__check" /> : undefined} onClick={() => { onMode('all'); setAnchor(null) }} />
          <MenuItem label={`종류별 (${TAG_KINDS.map((k) => KIND_LABEL[k]).join('·')})`} active={mode === 'kind'} trail={mode === 'kind' ? <Check className="menu__check" /> : undefined} onClick={() => { onMode('kind'); setAnchor(null) }} />
          {info && (info.count > 0 || !!info.lastRun?.count) && (
            <>
              <div className="menu__divider" />
              <div className="wiki-summary"><span className="wiki-ai">✦</span> 최근 AI가 붙인 태그 {info.count}개 · 할 일 {info.tasks}개<br />상세에서 ✕로 떼면 다시 안 붙어요</div>
              <MenuItem
                label={info.lastRun?.count ? `마지막 일괄 태그 되돌리기 (${info.lastRun.count})` : '최근 자동 태그 되돌리기'}
                onClick={async () => {
                  setAnchor(null)
                  const n = await autoTag().undoLastRun()
                  toast.show(n ? `자동 태그 ${n}개를 되돌렸어요` : '되돌릴 자동 태그가 없어요')
                }}
              />
            </>
          )}
        </Popover>
      )}
    </>
  )
}
