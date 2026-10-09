// 43 §5.4 옷장 · §8 도감 — 무대 오른쪽에서 밀려 나오는 떠 있는 카드(폭 300). 같은 패널에 `옷장 · 도감` 두 칸.
// 칸 상태: 기본 · 입은 것(강조 테두리) · 새로 받음(점 — 탭을 보면 지운다) · 잠김(한 색 실루엣 + 조건, 누르면 흔들기만).
// 49 §6.1 배경 탭(옛 `방`): 칸 = 장면 썸네일, 누르면 무대 장면만 바뀌는 미리 보기 → 패널 아래 `이 배경으로`(적용) · `취소`(원래 배경). 잠긴 배경도 미리 보기만.
// 49 §7: 칸 그림 = 미리 구운 3D(옷 = accIcon 자른 그림, 방 = 장면 가운데 자르기, 장식 = decor 그림). 잠김 = 같은 그림을 한 색으로(mask, 필터 없음).
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { accIcon, DECOR3D, decorKey, PATHS, SCENE_OF_BG, SCENE_PX, SCENES3D, titleOf, trophyIcon, type Box } from '@sprout/schema/characterArt'
import { STAGES } from '@sprout/schema/growth'
import {
  babyHidesSlot, baseName, conditionText, DECOR, equipItem, ITEMS, itemsOfTab, setPath, SLOTS, toggleDecor, trophyShape, trophySub, unequipSlot,
  type Item, type Path, type Slot, type WardTab
} from '@sprout/schema/wardrobe'
import { markItemsSeen, saveLook, type Raise } from '../../data/raise'
import { artUrl } from './art3dUrls'
import { ArtImage, CharacterArt } from './CharacterArt'
import { useDocDark } from './MakeFlow'

const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* */ } } }
const Svg = ({ html, className }: { html: string; className?: string }) => <span className={`rp-ic${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
const shake = (el: HTMLElement) => el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 220 })

export function RaisePanel({ raise, open, tab, onTab, onClose, onWorn, preview = null, onPreview }: {
  raise: Raise; open: boolean; tab: 'ward' | 'dex'; onTab: (t: 'ward' | 'dex') => void; onClose: () => void
  /** 입었을 때 무대 캐릭터가 깡충 */
  onWorn: () => void
  /** 미리 보는 배경 id(아직 적용 아님, 49 §6.1) — null = 지금 배경 */
  preview?: string | null
  onPreview?: (id: string | null) => void
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
      {open && (tab === 'ward' ? <Wardrobe raise={raise} onWorn={onWorn} preview={preview} onPreview={onPreview ?? (() => undefined)} /> : <Dex raise={raise} />)}
    </aside>
  )
}

/** 옷장 탭 이름 — `방` 탭은 49 §6.1에서 `배경` 탭이 됐다 */
export const tabName = (k: WardTab, n: string) => (k === 'room' ? '배경' : n)
/** 잠긴 배경의 버튼 자리 글(49 §6.1 `한 날 14일이면 열려요`) */
export function unlockLine(it: Item): string {
  const r = it.rule
  if ('lv' in r) return `Lv ${r.lv}이 되면 열려요`
  if ('days' in r) return `한 날 ${r.days}일이면 열려요`
  if ('reviews' in r) return `주간 점검 ${r.reviews}번이면 열려요`
  return `${conditionText(it)} 하면 열려요`
}

function Wardrobe({ raise, onWorn, preview, onPreview }: { raise: Raise; onWorn: () => void; preview: string | null; onPreview: (id: string | null) => void }) {
  const [tab, setTab] = useState<WardTab>(() => (SLOTS.some(([k]) => k === ls.get('sprout.wardTab')) ? (ls.get('sprout.wardTab') as WardTab) : 'hat'))
  useEffect(() => ls.set('sprout.wardTab', tab), [tab])
  // 다른 탭으로 가면 미리 보기를 거둔다(원래 배경)
  useEffect(() => { if (tab !== 'room') onPreview(null) }, [tab, onPreview])
  const { look, owned, fresh, state, stage, species } = raise
  // 탭을 보면 그 탭의 "새로 받음" 점을 지운다(칸의 점은 이번에 연 동안 남긴다)
  const [shownFresh] = useState(() => new Set(fresh))
  useEffect(() => {
    const ids = itemsOfTab(tab).filter((i) => fresh.has(i.id)).map((i) => i.id)
    if (ids.length && raise.characterId) void markItemsSeen(raise.characterId, ids)
  }, [tab, fresh, raise.characterId])
  const wear = (it: Item) => { void saveLook(equipItem(look, it.id)); onWorn() }
  const curBg = raise.worn.bg
  const shownBg = preview ?? curBg
  const pv = preview && preview !== curBg ? ITEMS.find((i) => i.id === preview) : undefined
  const bgCell = (it: Item) => {
    const own = owned.has(it.id)
    const on = shownBg === it.id
    const now = curBg === it.id
    return (
      <button key={it.id} className={`rp-cell rp-bg${own ? '' : ' is-locked'}${on ? ' is-on' : ''}`} aria-pressed={on}
        aria-label={`${it.name}${now ? ', 지금 배경' : ''}${own ? '' : `, 잠김 · ${conditionText(it, state)}`}. 눌러서 미리 보기`}
        title={own ? (now ? '지금 배경' : '눌러서 미리 보기') : `${conditionText(it, state)} · 미리 보기만 돼요`}
        onClick={() => onPreview(it.id === curBg ? null : it.id)}>
        {(shownFresh.has(it.id) || fresh.has(it.id)) && own ? <i className="rp-dot" aria-label="새로 받음" /> : !own ? <LockIcon /> : null}
        {now && preview && preview !== curBg ? <span className="rp-now">지금</span> : null}
        <span className="rp-ic"><ItemPic id={it.id} size={52} locked={!own} /></span>
        <span className="n">{it.name}</span>
        {!own && <span className="c">{conditionText(it, state)}</span>}
      </button>
    )
  }
  const apply = () => { if (!pv) return; void saveLook(equipItem(look, pv.id)); onPreview(null); onWorn() }
  const cell = (it: Item) => {
    const own = owned.has(it.id)
    const on = it.slot === 'bg' ? look.eq.bg === it.id : look.eq[it.slot as Exclude<Slot, 'bg'>] === it.id
    return (
      <button key={it.id} className={`rp-cell${own ? '' : ' is-locked'}${on && own ? ' is-on' : ''}`} aria-pressed={on} aria-disabled={!own}
        title={own ? (on ? '다시 누르면 벗기' : '눌러서 입기') : conditionText(it, state)}
        onClick={(e) => (own ? wear(it) : shake(e.currentTarget))}>
        {(shownFresh.has(it.id) || fresh.has(it.id)) && own ? <i className="rp-dot" aria-label="새로 받음" /> : !own ? <LockIcon /> : null}
        <span className="rp-ic"><ItemPic id={it.id} size={52} locked={!own} /></span>
        <span className="n">{it.name}</span>
        {!own && <span className="c">{conditionText(it, state)}</span>}
      </button>
    )
  }
  const tabFresh = (k: WardTab) => itemsOfTab(k).some((i) => fresh.has(i.id))
  return (
    <>
      <div className="rp-tabs" role="tablist">
        {SLOTS.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{tabName(k, n)}{tabFresh(k) && <i />}</button>)}
      </div>
      <div className="rp-body">
        {tab === 'room' ? (
          <>
            <div className="rp-subh">배경<span>눌러서 미리 보기</span></div>
            <div className="rp-grid">{itemsOfTab('room').map(bgCell)}</div>
            <div className="rp-subh">장식<span>눌러서 놓기·치우기</span></div>
            <div className="rp-grid">
              {DECOR.map((d) => {
                const own = raise.level >= d.lv, on = own && !look.decorOff.includes(d.id)
                return (
                  <button key={d.id} className={`rp-cell${own ? '' : ' is-locked'}${on ? ' is-on' : ''}`} aria-pressed={on} onClick={(e) => (own ? void saveLook(toggleDecor(look, d.id)) : shake(e.currentTarget))}>
                    {!own && <LockIcon />}<span className="rp-ic"><DecorPic id={d.id} size={52} locked={!own} /></span><span className="n">{d.name}</span>{!own && <span className="c">Lv {d.lv}</span>}
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
      {tab === 'room' && pv && (
        <div className="rp-apply" role="group" aria-label={`${pv.name} 미리 보는 중`}>
          {owned.has(pv.id)
            ? <button className="gs2-btn pri" onClick={apply}>이 배경으로</button>
            : <span className="rp-cond" role="status">{unlockLine(pv)}</span>}
          <button className="gs2-btn" onClick={() => onPreview(null)}>취소</button>
        </div>
      )}
    </>
  )
}

/** 도감 모습 8칸(아기 · 꼬마 · 친구~전설 × 갈래) */
export const LOOKS: [number, Path][] = [[1, 'a'], [2, 'a'], [3, 'a'], [3, 'b'], [4, 'a'], [4, 'b'], [5, 'a'], [5, 'b']]
function Dex({ raise }: { raise: Raise }) {
  const { species, stage, look, owned, state, trophies } = raise
  const ownCount = ITEMS.filter((i) => owned.has(i.id)).length
  const lookOwn = LOOKS.filter(([s]) => s <= stage).length
  return (
    <div className="rp-body">
      <div className="rp-sum">
        <div><b>{ownCount}<small>/{ITEMS.length}</small></b><span>옷</span><i className="rp-bar"><em style={{ width: `${(ownCount / ITEMS.length) * 100}%` }} /></i></div>
        <div><b>{lookOwn}<small>/{LOOKS.length}</small></b><span>모습</span><i className="rp-bar"><em style={{ width: `${(lookOwn / LOOKS.length) * 100}%` }} /></i></div>
        <div><b>{trophies.length}</b><span>트로피</span><i className="rp-bar"><em style={{ width: `${Math.min(100, trophies.length * 12)}%` }} /></i></div>
      </div>
      {species && (
        <>
          <div className="rp-subh">모습<span>다른 길은 언제든 바꿀 수 있어</span></div>
          <div className="rp-grid rp-dex">
            {LOOKS.map(([s, p]) => {
              const ok = s <= stage, cur = s === stage && (s < 3 || p === look.path), swap = ok && s === stage && s >= 3 && p !== look.path
              const sub = ok ? (s >= 3 && p !== look.path ? (s === stage ? '눌러서 바꾸기' : '다른 길') : s >= 3 ? PATHS[species][p].name : '') : `Lv ${STAGES[s - 1].from}`
              return (
                <button key={`${s}${p}`} className={`rp-cell${cur ? ' is-on' : ''}${ok ? '' : ' is-locked'}`} disabled={!swap && !cur} aria-label={`${ok ? titleOf(species, s, p) : '아직 못 본 모습'} ${sub}${cur ? ' · 지금 내 모습' : ''}`}
                  onClick={() => swap && void saveLook(setPath(look, p))}>
                  {cur && <span className="rp-me">나</span>}
                  <span className="rp-ic is-look"><CharacterArt species={species} stage={s} size={64} crop="full" mood="smile" lock={!ok} wear={{ path: p, seed: look.seed, ...(cur ? { eq: raise.worn } : {}) }} /></span>
                  <span className="n">{ok ? titleOf(species, s, p) : '?'}</span>
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
            <div className="rp-subh">{tabName(k, n)}<span>{list.filter((i) => owned.has(i.id)).length}/{list.length}</span></div>
            <div className="rp-grid is-4">
              {list.map((it) => { const o = owned.has(it.id); return <div key={it.id} className={`rp-cell is-static${o ? '' : ' is-locked'}`}><span className="rp-ic"><ItemPic id={it.id} size={40} locked={!o} /></span><span className="n">{it.name}</span>{!o && <span className="c">{conditionText(it, state)}</span>}</div> })}
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

/* ───── 칸 그림(49 §7) ───── */
const LOCK_LIGHT = '#C9D0CB', LOCK_DARK = '#3A423D'
const useLockTint = () => (useDocDark() ? LOCK_DARK : LOCK_LIGHT)
const squareOf = ([x0, y0, x1, y1]: number[], pad = 0.06): Box => {
  const side = Math.min(1, Math.max(x1 - x0, y1 - y0) + pad * 2), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return { x: Math.min(1 - side, Math.max(0, cx - side / 2)), y: Math.min(1 - side, Math.max(0, cy - side / 2)), w: side, h: side }
}
/** 장면 아이콘: 세로 장면(780×1560)의 받침 둘레를 정사각형으로 가운데 자른다 */
export function SceneIcon({ sceneKey, size, locked }: { sceneKey: string; size: number; locked?: boolean }) {
  const tint = useLockTint()
  const m = SCENES3D[sceneKey]
  const url = artUrl(sceneKey, SCENE_PX)
  if (locked || !url || !m) return <span className="rp-scene is-lock" style={{ width: size, height: size, background: tint }} aria-hidden />
  const w = size / 0.62, h = w * m.aspect
  return (
    <span className="rp-scene" style={{ width: size, height: size }} aria-hidden>
      <img src={url} alt="" draggable={false} style={{ width: w, height: h, left: -(m.perch[0] * w - size / 2), top: -(m.perch[1] * h - size * 0.62) }} />
    </span>
  )
}
/** 옷·배경 칸 그림 — 옷은 꿀벌 친구 몸에 입힌 옷 층을 옷 자리로 확대해 자른 것(accIcon) */
export function ItemPic({ id, size, locked }: { id: string; size: number; locked?: boolean }) {
  const tint = useLockTint()
  if (SCENE_OF_BG[id]) return <SceneIcon sceneKey={SCENE_OF_BG[id]} size={size} locked={locked} />
  const ic = accIcon(id)
  if (!ic) return <span className="rp-blob" style={{ width: size * 0.62, height: size * 0.48, background: tint }} aria-hidden />
  return <ArtImage artKey={ic.key} size={size} box={ic.box} tint={locked ? tint : null} />
}
/** 방 장식 칸 그림 */
export function DecorPic({ id, size, locked }: { id: string; size: number; locked?: boolean }) {
  const tint = useLockTint()
  const bb = DECOR3D[decorKey(id)]
  if (!bb) return <span className="rp-blob" style={{ width: size * 0.62, height: size * 0.48, background: tint }} aria-hidden />
  return <ArtImage artKey={decorKey(id)} size={size} box={squareOf(bb)} px={256} tint={locked ? tint : null} />
}
