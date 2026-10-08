// 37 탭 사용법 — 본 기억(계정 단위). 규칙은 core.ts(mergeGuidesSeen · encodeGuidesSeen · localSeenTabs).
//  · 동기화 행 view_settings view_key `guides` options_json {"seen":[탭…]} — 다른 기기에서 본 탭은 여기서도 안 뜬다.
//  · 이 기기 localStorage(sprout.guide.<탭> · 작업 지도 sprout.map.guide)에도 같이 적는다 — 행을 읽기 전·시험·오프라인.
//  · 한 번 옮기기: 예전 기기 기억(`다시 보지 않기`·`시작하기`로 done)이 행에 없으면 더해 쓴다.
import { getDb } from '../../data/db'
import { insert, remove, run, update, uuid } from '../../data/mutations'
import { encodeGuidesSeen, GUIDES_VIEW_KEY, localSeenTabs, mergeGuidesSeen, saveSeen, type GuideTab } from './core'

const SQL = `SELECT id, options_json FROM view_settings WHERE view_key = '${GUIDES_VIEW_KEY}' ORDER BY id`
type Row = { id: string; options_json: string | null }

let seen: Set<GuideTab> | null = null
/** 동기화 행을 한 번이라도 읽었나(못 읽는 환경이면 곧 true — 기기 기억만으로) */
let loaded = false
let watching = false
let rowId: string | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const cur = () => (seen ??= new Set(localSeenTabs()))

async function write(tabs: Set<GuideTab>) {
  const db = await getDb()
  const rows = await db.getAll<Row>(SQL)
  const all = new Set([...mergeGuidesSeen(rows), ...tabs])
  const json = encodeGuidesSeen(all)
  const id = rows[0]?.id ?? rowId ?? uuid()
  rowId = id
  if (rows.length === 1 && rows[0].options_json === json) return
  await run(...(rows.length ? [update('view_settings', id, { options_json: json })] : [insert('view_settings', { id, view_key: GUIDES_VIEW_KEY, options_json: json })]),
    ...rows.slice(1).map((r) => remove('view_settings', r.id)))
}

function startWatch() {
  if (watching) return
  watching = true
  const giveUp = () => { if (!loaded) { loaded = true; emit() } }
  // 행을 끝내 못 읽어도(DB 늦음) 1.5초 뒤엔 기기 기억만으로 판단
  const t = setTimeout(giveUp, 1500)
  void getDb().then((db) => {
    if (typeof db.watch !== 'function') { clearTimeout(t); giveUp(); return }
    db.watch(SQL, [], (rows) => {
      const r = rows as Row[]
      rowId = r[0]?.id ?? null
      const mine = cur()
      const theirs = mergeGuidesSeen(r)
      const missing = [...mine].some((x) => !theirs.includes(x))
      let changed = !loaded
      for (const x of theirs) if (!mine.has(x)) { mine.add(x); saveSeen(x, { tour: 'done' }); changed = true }
      loaded = true
      clearTimeout(t)
      if (missing) void write(mine).catch(() => {}) // 한 번 옮기기 · 오프라인에서 본 것
      if (changed) emit()
    }, () => {})
  }).catch(() => { clearTimeout(t); giveUp() })
}

export const guideSeen = {
  has(tab: GuideTab): boolean { startWatch(); return cur().has(tab) },
  /** 동기화 행(또는 포기 시한)을 읽은 뒤 true — 그 전엔 저절로 띄우지 않는다 */
  loaded(): boolean { startWatch(); return loaded },
  mark(tab: GuideTab) {
    const s = cur()
    saveSeen(tab, { tour: 'done' })
    if (s.has(tab)) return
    s.add(tab)
    emit()
    void write(s).catch(() => {})
  },
  subscribe(f: () => void) { startWatch(); subs.add(f); return () => { subs.delete(f) } }
}
