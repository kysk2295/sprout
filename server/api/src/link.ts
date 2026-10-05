// 로그인 방법 연결 (08 §3.1.1) — 틱틱 설정 › 계정 "Google · Apple — 연결"
// - 로그인한 사용자(Bearer)가 구글·애플 ID 토큰(검증은 social.ts 그대로)을 보내면 그 (공급자, subject)를 "이 계정"에 붙인다.
//   이메일이 달라도 된다 — 이후 "Google로 계속하기"는 식별자(1번 규칙)로 이 계정에 들어온다.
// - 이미 다른 꿈틀 계정에 붙은 식별자 → 409(빼앗지 않는다). 이 계정에 이미 있으면 그대로 200.
//   한 계정에 공급자마다 하나만(틱틱처럼) — 다른 구글 계정이 이미 붙어 있으면 409, 먼저 해제.
// - 해제: 비밀번호도 없고 다른 공급자도 없으면 로그인할 길이 없어지므로 409.
// - 화면에는 이메일을 가려서 보낸다(qa***@gmail.com).
import { SocialError, type Provider, type VerifiedIdentity } from './social.ts'

export const PROVIDERS: Provider[] = ['google', 'apple']
const NAME: Record<Provider, string> = { google: '구글', apple: '애플' }

export const MSG = {
  taken: (p: Provider) => `이미 다른 꿈틀 계정에 연결된 ${NAME[p]} 계정이에요`,
  other: (p: Provider) => `이미 다른 ${NAME[p]} 계정이 연결돼 있어요. 먼저 연결을 해제해 주세요`,
  last: '로그인할 방법이 하나도 남지 않아 연결을 해제할 수 없어요. 다른 로그인 방법을 먼저 연결해 주세요'
}

export type IdentityRow = { provider: Provider; subject: string; email: string | null }
export type LinkedView = { provider: Provider; email: string | null }

/** qa-ui@sprout.test → qa***@sprout.test. 앞 2자(짧으면 1자)만 남긴다 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at)
  return `${local.slice(0, local.length > 2 ? 2 : 1)}***${email.slice(at)}`
}

export const linkedView = (rows: IdentityRow[]): LinkedView[] =>
  PROVIDERS.flatMap((p) => rows.filter((r) => r.provider === p).slice(0, 1).map((r) => ({ provider: p, email: maskEmail(r.email) })))

/** 이 공급자를 떼어도 로그인할 길이 남나 */
export const canUnlink = (hasPassword: boolean, rows: Pick<IdentityRow, 'provider'>[], provider: Provider) =>
  hasPassword || rows.some((r) => r.provider !== provider)

export const parseProvider = (v: unknown): Provider => {
  if (v === 'google' || v === 'apple') return v
  throw new SocialError('unknown provider', 404)
}

export interface LinkStore {
  /** (공급자, subject)가 붙은 사용자 id */
  ownerOf(provider: Provider, subject: string): Promise<string | null>
  identitiesOf(userId: string): Promise<IdentityRow[]>
  /** 넣었으면 true, 이미 있으면(누가 먼저 넣음) false */
  insert(userId: string, id: VerifiedIdentity): Promise<boolean>
  /** 사용자 행을 잠근 채 확인하고 지운다(동시에 두 개를 떼어 길이 없어지는 일 막기). 없는 계정 = 'gone' */
  unlink(userId: string, provider: Provider): Promise<'ok' | 'none' | 'last' | 'gone'>
}

export type LinkResult = { linked: boolean; identities: LinkedView[] }

export async function linkIdentity(store: LinkStore, userId: string, id: VerifiedIdentity): Promise<LinkResult> {
  const owner = await store.ownerOf(id.provider, id.subject)
  if (owner && owner !== userId) throw new SocialError(MSG.taken(id.provider), 409)
  if (owner === userId) return { linked: false, identities: linkedView(await store.identitiesOf(userId)) }
  const mine = await store.identitiesOf(userId)
  if (mine.some((r) => r.provider === id.provider)) throw new SocialError(MSG.other(id.provider), 409)
  if (!(await store.insert(userId, id))) {
    // 동시에 다른 계정이 먼저 넣었을 수 있다
    const now = await store.ownerOf(id.provider, id.subject)
    if (now !== userId) throw new SocialError(MSG.taken(id.provider), 409)
  }
  return { linked: true, identities: linkedView(await store.identitiesOf(userId)) }
}

export async function unlinkProvider(store: LinkStore, userId: string, provider: Provider): Promise<LinkResult> {
  const r = await store.unlink(userId, provider)
  if (r === 'gone') throw new SocialError('unauthorized', 401)
  if (r === 'last') throw new SocialError(MSG.last, 409)
  return { linked: false, identities: linkedView(await store.identitiesOf(userId)) }
}

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>
/** tx: fn 안의 q는 한 트랜잭션(던지면 되돌림) */
export function pgLinkStore(q: Q, tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>): LinkStore {
  return {
    async ownerOf(provider, subject) {
      const r = await q('SELECT user_id FROM user_identities WHERE provider = $1 AND subject = $2', [provider, subject])
      return r.rows[0]?.user_id ?? null
    },
    async identitiesOf(userId) {
      const r = await q('SELECT provider, subject, email FROM user_identities WHERE user_id = $1 ORDER BY created_at', [userId])
      return r.rows
    },
    async insert(userId, id) {
      const r = await q('INSERT INTO user_identities (user_id, provider, subject, email) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, subject) DO NOTHING', [userId, id.provider, id.subject, id.email])
      return !!r.rowCount
    },
    unlink: (userId, provider) => tx(async (t) => {
      const u = await t('SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1 FOR UPDATE', [userId])
      if (!u.rowCount) return 'gone' as const
      const rows = (await t('SELECT provider FROM user_identities WHERE user_id = $1', [userId])).rows as { provider: Provider }[]
      if (!rows.some((r) => r.provider === provider)) return 'none' as const
      if (!canUnlink(u.rows[0].has_password, rows, provider)) return 'last' as const
      await t('DELETE FROM user_identities WHERE user_id = $1 AND provider = $2', [userId, provider])
      return 'ok' as const
    })
  }
}

/** 시험용 */
export function memoryLinkStore(users: Record<string, { password: boolean }>, rows: (IdentityRow & { userId: string })[] = []): LinkStore & { rows: (IdentityRow & { userId: string })[] } {
  return {
    rows,
    async ownerOf(provider, subject) { return rows.find((r) => r.provider === provider && r.subject === subject)?.userId ?? null },
    async identitiesOf(userId) { return rows.filter((r) => r.userId === userId).map(({ provider, subject, email }) => ({ provider, subject, email })) },
    async insert(userId, id) {
      if (rows.some((r) => r.provider === id.provider && r.subject === id.subject)) return false
      rows.push({ userId, provider: id.provider, subject: id.subject, email: id.email })
      return true
    },
    async unlink(userId, provider) {
      const u = users[userId]
      if (!u) return 'gone'
      const mine = rows.filter((r) => r.userId === userId)
      if (!mine.some((r) => r.provider === provider)) return 'none'
      if (!canUnlink(u.password, mine, provider)) return 'last'
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].userId === userId && rows[i].provider === provider) rows.splice(i, 1)
      return 'ok'
    }
  }
}
