// 24 §3·§5: 본 앱 쪽 공유 연결 — _layout 뿌리에서 한 번 부른다.
// 로그인돼 있고 앱이 앞으로 올 때마다: ① 확장용 접근 토큰을 키체인 공유 그룹에 갱신 ② App Group 대기열을 로컬 DB에 넣는다(→ PowerSync가 올림).
// 로그아웃이면 공유 토큰을 지운다(확장은 로그인 안내 카드를 보인다).
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { currentUserId, serverAccess, useAuth } from '../data/auth'
import { db } from '../data/db'
import { drainQueue } from './queue.ts'
import { clearToken, fileQueueIO, publishToken } from './native.ts'

let running: Promise<void> | undefined
/** 토큰 갱신 + 대기열 비우기(한 번에 하나) */
export function syncShareInbox(): Promise<void> {
  running ??= (async () => {
    try {
      const { url, token } = await serverAccess()
      const userId = currentUserId()
      if (!token || userId === 'local') return
      await publishToken({ access_token: token, user_id: userId, api_url: url })
      const io = fileQueueIO({
        exists: async (id) => !!(await db.getOptional('SELECT id FROM notes WHERE id = ?', [id])),
        insert: async (id, row) => {
          const full = { id, owner_id: userId, ...row }
          const cols = Object.keys(full)
          await db.execute(`INSERT INTO notes (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, Object.values(full) as never[])
        }
      })
      if (!io) return
      const r = await drainQueue(io, userId)
      if (r.inserted || r.dropped || r.failed) console.log('[share] queue drained', r)
    } catch (e) {
      console.warn('[share] sync failed:', e)
    } finally {
      running = undefined
    }
  })()
  return running
}

export function useShareInbox() {
  const { status } = useAuth()
  useEffect(() => {
    if (status === 'signedOut') { void clearToken(); return }
    if (status !== 'signedIn') return
    void syncShareInbox()
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void syncShareInbox() })
    return () => sub.remove()
  }, [status])
}
