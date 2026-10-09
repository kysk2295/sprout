// 43 §5.4 옷장 · §8 도감 — 무대 오른쪽에서 밀려 나오는 떠 있는 카드(폭 300). 같은 패널에 `옷장 · 도감` 두 칸.
// 칸 상태: 기본 · 입은 것(강조 테두리) · 새로 받음(점 — 탭을 보면 지운다) · 잠김(한 색 실루엣 + 조건, 누르면 흔들기만).
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { art, decorIcon, itemIcon, PATHS, titleOf, trophyIcon } from '@sprout/schema/characterArt'
import { STAGES } from '@sprout/schema/growth'
import {
  babyHidesSlot, baseName, conditionText, DECOR, equipItem, ITEMS, itemsOfTab, setPath, SLOTS, toggleDecor, trophyShape, trophySub, unequipSlot,
  type Item, type Path, type Slot, type WardTab
} from '@sprout/schema/wardrobe'
import { markItemsSeen, saveLook, type Raise } from '../../data/raise'

const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* */ } } }
const Svg = ({ html, className }: { html: string; className?: string }) => <span className={`rp-ic${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
const shake = (el: HTMLElement) => el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 220 })

export function RaisePanel({ raise, open, tab, onTab, onClose, onWorn }: {
  raise: Raise; open: boolean; tab: 'ward' | 'dex'; onTab: (t: 'ward' | 'dex') => void; onClose: () => void
  /** 입었을 때 무대 캐릭터가 깡충 */
  onWorn: () => void
}) {
  return (
    <aside className={`rp${open ? ' is-open' : ''}`} aria-label="꾸미기" aria-hidden={!open}>
      <div className="rp-hd">
        <div className="rp-seg" role="tablist">
          <button role="tab" aria-selected={tab === 'ward'} className={tab === 'ward' ? 'is-on' : ''} onClick={() => onTab('ward')} tabIndex={open ? 0 : -1}>옷장</button>
          <button role="tab" aria-selected={tab === 'dex'} className={tab === 'dex' ? 'is-on' : ''} onClick={() => onTab('dex')} tabIndex={open ? 0 : -1}>도감</button>
        </div>
        <button className="rp-x" aria-label="닫기" onClick={onClose} tabIndex={open ? 0 : -1}><X /></button>
      </div>
      {open && (tab === 'ward' ? <Wardrobe raise={raise} onWorn={onWorn} /> : <Dex raise={raise} />)}
    </aside>
  )
}

function Wardrobe({ raise, onWorn }: { raise: Raise; onWorn: () => void }) {
  const [tab, setTab] = useState<WardTab>(() => (SLOTS.some(([k]) => k === ls.get('sprout.wardTab')) ? (ls.get('sprout.wardTab') as WardTab) : 'hat'))
  useEffect(() => ls.set('sprout.wardTab', tab), [tab])
  const { look, owned, fresh, state, stage, species } = raise
  // 탭을 보면 그 탭의 "새로 받음" 점을 지운다(칸의 점은 이번에 연 동안 남긴다)
  const [shownFresh] = useState(() => new Set(fresh))
  useEffect(() => {
    const ids = itemsOfTab(tab).filter((i) => fresh.has(i.id)).map((i) => i.id)
    if (ids.length && raise.characterId) void markItemsSeen(raise.characterId, ids)
  }, [tab, fresh, raise.characterId])
  const wear = (it: Item) => { void saveLook(equipItem(look, it.id)); onWorn() }
  const cell = (it: Item) => {
    const own = owned.has(it.id)
    const on = it.slot === 'bg' ? look.eq.bg === it.id : look.eq[it.slot as Exclude<Slot, 'bg'>] === it.id
    return (
      <button key={it.id} className={`rp-cell${own ? '' : ' is-locked'}${on && own ? ' is-on' : ''}`} aria-pressed={on} aria-disabled={!own}
        title={own ? (on ? '다시 누르면 벗기' : '눌러서 입기') : conditionText(it, state)}
        onClick={(e) => (own ? wear(it) : shake(e.currentTarget))}>
        {(shownFresh.has(it.id) || fresh.has(it.id)) && own ? <i className="rp-dot" aria-label="새로 받음" /> : !own ? <LockIcon /> : null}
        <Svg html={itemIcon(it.id, { locked: !own })} />
        <span className="n">{it.name}</span>
        {!own && <span className="c">{conditionText(it, state)}</span>}
      </button>
    )
  }
  const tabFresh = (k: WardTab) => itemsOfTab(k).some((i) => fresh.has(i.id))
  return (
    <>
      <div className="rp-tabs" role="tablist">
        {SLOTS.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{n}{tabFresh(k) && <i />}</button>)}
      </div>
      <div className="rp-body">
        {tab === 'room' ? (
          <>
            <div className="rp-subh">배경</div>
            <div className="rp-grid">{itemsOfTab('room').map(cell)}</div>
            <div className="rp-subh">장식<span>눌러서 놓기·치우기</span></div>
            <div className="rp-grid">
              {DECOR.map((d) => {
                const own = raise.level >= d.lv, on = own && !look.decorOff.includes(d.id)
                return (
                  <button key={d.id} className={`rp-cell${own ? '' : ' is-locked'}${on ? ' is-on' : ''}`} aria-pressed={on} onClick={(e) => (own ? void saveLook(toggleDecor(look, d.id)) : shake(e.currentTarget))}>
                    {!own && <LockIcon />}<Svg html={decorIcon(d.id, { locked: !own })} /><span className="n">{d.name}</span>{!own && <span className="c">Lv {d.lv}</span>}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="rp-grid">
              <button className={`rp-cell${look.eq[tab] ? '' : ' is-on'}`} onClick={() => void saveLook(unequipSlot(look, tab))} title="그 칸의 진화 소품으로 돌아가요">
                <svg className="rp-ic rp-base" viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="7 7" /></svg>
                <span className="n">기본</span><span className="c">{species ? baseName(tab, species, stage) : '없음'}</span>
              </button>
              {itemsOfTab(tab).map(cell)}
            </div>
            {babyHidesSlot(tab as Slot, stage) && <p className="rp-note">아기 때는 씨앗 껍질 안이라 목·등 옷은 꼬마부터 보여요.</p>}
          </>
        )}
      </div>
    </>
  )
}

const LOOKS: [number, Path][] = [[1, 'a'], [2, 'a'], [3, 'a'], [3, 'b'], [4, 'a'], [4, 'b'], [5, 'a'], [5, 'b']]
function Dex({ raise }: { raise: Raise }) {
  const { species, stage, look, owned, state, trophies } = raise
  const ownCount = ITEMS.filter((i) => owned.has(i.id)).length
  const lookOwn = LOOKS.filter(([s]) => s <= stage).length
  const looks = useMemo(() => (species ? LOOKS.map(([s, p]) => ({ s, p, html: art(species, s, { path: p, size: 64, detail: 'full', noAura: true, fit: false, lock: s > stage, mood: 'smile' }) })) : []), [species, stage])
  return (
    <div className="rp-body">
      <div className="rp-sum">
        <div><b>{ownCount}<small>/{ITEMS.length}</small></b><span>옷</span><i className="rp-bar"><em style={{ width: `${(ownCount / ITEMS.length) * 100}%` }} /></i></div>
        <div><b>{lookOwn}<small>/8</small></b><span>모습</span><i className="rp-bar"><em style={{ width: `${(lookOwn / 8) * 100}%` }} /></i></div>
        <div><b>{trophies.length}</b><span>트로피</span><i className="rp-bar"><em style={{ width: `${Math.min(100, trophies.length * 12)}%` }} /></i></div>
      </div>
      {species && (
        <>
          <div className="rp-subh">모습<span>다른 길은 언제든 바꿀 수 있어</span></div>
          <div className="rp-grid">
            {looks.map(({ s, p, html }) => {
              const ok = s <= stage, cur = s === stage && (s < 3 || p === look.path), swap = ok && s === stage && s >= 3 && p !== look.path
              const sub = ok ? (s >= 3 && p !== look.path ? (s === stage ? '눌러서 바꾸기' : '다른 길') : s >= 3 ? PATHS[species][p].name : '') : `Lv ${STAGES[s - 1].from}`
              return (
                <button key={`${s}${p}`} className={`rp-cell${cur ? ' is-on' : ''}${ok ? '' : ' is-locked'}`} disabled={!swap && !cur} aria-label={`${titleOf(species, s, p)} ${sub}`}
                  onClick={() => swap && void saveLook(setPath(look, p))}>
                  <Svg html={html} className="is-look" />
                  <span className="n">{titleOf(species, s, p)}</span>
                  <span className="c">{sub}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
      {SLOTS.map(([k, n]) => {
        const list = itemsOfTab(k)
        return (
          <div key={k}>
            <div className="rp-subh">{k === 'room' ? '배경' : n}<span>{list.filter((i) => owned.has(i.id)).length}/{list.length}</span></div>
            <div className="rp-grid is-4">
              {list.map((it) => { const o = owned.has(it.id); return <div key={it.id} className={`rp-cell is-static${o ? '' : ' is-locked'}`}><Svg html={itemIcon(it.id, { locked: !o })} /><span className="n">{it.name}</span>{!o && <span className="c">{conditionText(it, state)}</span>}</div> })}
            </div>
          </div>
        )
      })}
      <div className="rp-subh">트로피 선반<span>{trophies.length}개</span></div>
      {trophies.length ? trophies.map((t) => (
        <div key={t.id} className="rp-trow"><Svg html={trophyIcon(trophyShape(t))} /><span className="tx">{t.title}</span><small>{trophySub(t)}</small></div>
      )) : <p className="rp-note">프로젝트를 끝내거나, 할 일을 한 날이 7일 쌓이면 선반에 올라가요.</p>}
    </div>
  )
}

const LockIcon = () => <svg className="rp-lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="10" width="14" height="10" rx="3" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></svg>
