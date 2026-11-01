// 47 §20 서버 턴 자식 프로세스 — 사용자 시간대(TZ 환경 변수)로 떠서 날짜 계산이 기기와 같다. 부모(turns.ts zoneRunner)가 시간대마다 하나 띄운다.
// 부모 → {type:'start', id, spec} · {type:'cancel', id} / 자식 → {type:'line', id, payload} · {type:'done', id}
import pg from 'pg'
import { scopedDb } from './assistantDb.ts'
import { execTurn, type TurnSpec } from './turnExec.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
const deps = { db: (userId: string) => scopedDb(pool, userId), self: process.env.TURN_SELF!, routing: process.env.AI_ROUTING === 'jev', log: (l: string) => console.error(l) }
const running = new Map<string, AbortController>()
const send = (m: unknown) => { try { process.send?.(m) } catch { /* 부모가 사라짐 */ } }

process.on('message', (m: { type: string; id: string; spec?: TurnSpec }) => {
  if (m.type === 'cancel') { running.get(m.id)?.abort(Object.assign(new Error('stopped'), { name: 'AbortError' })); return }
  if (m.type !== 'start' || !m.spec || running.has(m.id)) return
  const abort = new AbortController()
  running.set(m.id, abort)
  void execTurn(m.spec, deps, abort.signal, (payload) => send({ type: 'line', id: m.id, payload }))
    .finally(() => { running.delete(m.id); send({ type: 'done', id: m.id }) })
})
process.on('disconnect', () => process.exit(0))
