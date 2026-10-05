// 계정 삭제 (08 §7.1) — DELETE /auth/account (Bearer)
// - 다시 확인: 비밀번호가 있는 계정은 비밀번호, 구글·애플로만 가입한 계정은 "방금 로그인"(접근 토큰의 auth_time이 10분 안).
//   리프레시로 받은 토큰에는 auth_time이 없으므로, 소셜 계정은 삭제 직전에 구글·애플로 다시 로그인해야 한다.
// - 한 트랜잭션: ai_usage·device_tokens(푸시)를 명시적으로 지우고(이미 CASCADE지만 확실히) users 행을 지운다 → 동기화 테이블·세션·소셜 식별자는 ON DELETE CASCADE.
//   PowerSync가 지워진 행을 다른 기기에도 내려보내고, 세션이 없어져 다른 기기의 리프레시는 401이 된다.
// - 개인 정보는 로그에 남기지 않는다(이메일·id 없이 "1건"만).
// - 애플 토큰 폐기(지침 5.1.1(v)): apple 훅이 있으면 다시 확인이 통과한 뒤 토큰을 먼저 읽어 두고(행이 지워지기 전), 커밋 뒤 폐기한다.
//   폐기는 최선 노력 — 애플이 응답하지 않아도 삭제는 끝난다(실패 건수만 로그).
import { verifyPassword } from './auth.ts'

export const REAUTH_WINDOW_SEC = 10 * 60

export class AccountError extends Error {
  status: number
  code: string
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status }
}

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>
export type AccountDb = {
  query: Query
  /** fn 안의 query는 같은 트랜잭션. 던지면 되돌린다 */
  transaction: <T>(fn: (q: Query) => Promise<T>) => Promise<T>
}

export type DeleteInput = { userId: string; authTime?: number; password?: unknown; nowSec?: number }
export type AppleRevokeHook<T = unknown> = { read: (userId: string) => Promise<T[]>; revoke: (tokens: T[]) => Promise<unknown> }

/**
 * 다시 확인한 뒤 계정을 지운다. 실패는 AccountError:
 * 401 unauthorized(없는 계정) · 403 invalid password · 403 reauth required(소셜 계정인데 방금 로그인이 아님)
 * onFail은 비밀번호 틀림·재인증 필요 때 불린다(시도 제한 기록용).
 */
export async function deleteAccount(db: AccountDb, input: DeleteInput, onFail?: () => void, apple?: AppleRevokeHook<any>): Promise<void> {
  const u = await db.query('SELECT password_hash FROM users WHERE id = $1', [input.userId])
  if (!u.rowCount) throw new AccountError('unauthorized', 401)
  const hash: string | null = u.rows[0].password_hash
  if (hash) {
    const ok = typeof input.password === 'string' && input.password.length > 0 && input.password.length <= 1024 && (await verifyPassword(input.password, hash))
    if (!ok) { onFail?.(); throw new AccountError('invalid password', 403) }
  } else {
    const now = input.nowSec ?? Math.floor(Date.now() / 1000)
    const fresh = typeof input.authTime === 'number' && input.authTime <= now + 60 && now - input.authTime <= REAUTH_WINDOW_SEC
    if (!fresh) { onFail?.(); throw new AccountError('reauth required', 403) }
  }
  const appleTokens = apple ? await apple.read(input.userId).catch(() => []) : []
  await db.transaction(async (q) => {
    await q('DELETE FROM ai_usage WHERE user_id = $1', [input.userId])
    await q('DELETE FROM device_tokens WHERE user_id = $1', [input.userId]) // 32 푸시: 이 계정의 기기 토큰(이미 CASCADE지만 확실히 — 삭제 뒤 알림이 가지 않게)
    const r = await q('DELETE FROM users WHERE id = $1', [input.userId])
    if (!r.rowCount) throw new AccountError('unauthorized', 401)
  })
  console.log('[account] 계정 1건 삭제')
  if (apple && appleTokens.length) await apple.revoke(appleTokens).catch((e) => console.error('[account] 애플 토큰 폐기 실패:', (e as Error).message))
}
