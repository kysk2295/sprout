// 10 AI 사용량 · 연결 해제: 이 앱이 만든 격리 프로필 하나만 지우고, 다른 계정·기존 CLI 로그인은 건드리지 않는다
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createUsageLogin, claudeKeychainService, readUsageProfiles } from '../src/main/usageLogin'
import { createUsageService } from '../src/main/usageService'
import { isAppConnectedAccount } from '../src/shared/usage'

const root = await mkdtemp(join(tmpdir(), 'sprout-usage-test-'))
const children: any[] = []
const cleanups: { path: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] = []
// 실제 CLI·브라우저·키체인 없이: 가짜 프로세스와 정리 명령 기록만
const launch = () => { const c = new EventEmitter() as any; c.stdin = new PassThrough(); c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.exitCode = null; c.kill = () => { c.exitCode = 143; return true }; children.push(c); return c }
const service = createUsageLogin({
  root, platform: 'darwin', launch,
  executable: async (p) => `/fake/${p}`,
  cleanup: async (path, args, env, cwd) => { cleanups.push({ path, args, env, cwd }) }
})
const connect = async (provider: 'codex' | 'claude') => {
  const s = await service.start(provider)
  const c = children[children.length - 1]; c.exitCode = 0; c.emit('close', 0)
  for (let i = 0; i < 100 && service.status(s.id).status === 'waiting'; i++) await new Promise((r) => setTimeout(r, 5))
  assert.equal(service.status(s.id).status, 'connected')
  return s.id
}
try {
  assert.ok(isAppConnectedAccount('sprout:12345678-1234-1234-1234-123456789abc'))
  assert.ok(!isAppConnectedAccount('["codex","profile-a",null,null,null]'))
  assert.ok(!isAppConnectedAccount('sprout:../etc'))

  const a = await connect('claude'), b = await connect('codex')
  await writeFile(join(root, a, '.credentials.json'), 'secret')
  // 이상한 ID·경로 탈출·없는 계정은 아무것도 지우지 않는다
  for (const bad of [a, `sprout:../${a}`, 'sprout:', `["codex"]`, 42, `sprout:00000000-0000-0000-0000-000000000000`]) await assert.rejects(() => service.disconnect(bad), /찾지/)
  assert.deepEqual((await readdir(root)).sort(), [a, b].sort())
  assert.equal(cleanups.length, 0)

  // Claude 계정 해제: 격리 환경에서 CLI 로그아웃 → 이 프로필 전용 키체인 항목 → 폴더 삭제
  assert.deepEqual(await service.disconnect(`sprout:${a}`), { provider: 'claude' })
  assert.deepEqual(await readdir(root), [b])
  const [logout, keychain] = cleanups
  assert.equal(logout.path, '/fake/claude'); assert.deepEqual(logout.args, ['auth', 'logout'])
  assert.equal(logout.env.CLAUDE_CONFIG_DIR, join(root, a)); assert.equal(logout.cwd, join(root, a))
  assert.equal(logout.env.ANTHROPIC_API_KEY, undefined)
  assert.equal(keychain.path, '/usr/bin/security')
  assert.deepEqual(keychain.args, ['delete-generic-password', '-s', claudeKeychainService(join(root, a))])
  assert.match(claudeKeychainService(join(root, a)), /^Claude Code-credentials-[0-9a-f]{8}$/) // 기본 항목(접미사 없음)은 절대 가리키지 않는다
  await assert.rejects(() => service.disconnect(`sprout:${a}`), /찾지/) // 두 번째 해제는 실패
  assert.deepEqual(JSON.parse(await readFile(join(root, b, 'connected.json'), 'utf8')), { provider: 'codex', id: b }) // 다른 계정은 그대로

  // Codex 계정 해제: 파일 저장 방식 로그아웃만, 키체인은 건드리지 않는다
  cleanups.length = 0
  await service.disconnect(`sprout:${b}`)
  assert.equal(cleanups.length, 1); assert.equal(cleanups[0].env.CODEX_HOME, join(root, b)); assert.equal(cleanups[0].args[0], 'logout')
  assert.deepEqual(await readdir(root), [])

  // 로그아웃 명령이 실패해도 폴더는 지운다
  const failing = createUsageLogin({ root, executable: async () => { throw new Error('missing cli') }, launch, cleanup: async () => { throw new Error('boom') } })
  const id = 'abcdef01-2345-6789-abcd-ef0123456789'
  await mkdir(join(root, id)); await writeFile(join(root, id, 'connected.json'), JSON.stringify({ provider: 'claude', id }))
  await failing.disconnect(`sprout:${id}`)
  assert.deepEqual(await readdir(root), [])

  // 진행 중인 로그인은 해제 대상이 아니다
  const waiting = await service.start('codex')
  await assert.rejects(() => service.disconnect(`sprout:${waiting.id}`), /찾지/)
  service.cancel(waiting.id)
  assert.deepEqual(await readUsageProfiles('codex', root), [])

  // 조회 캐시: 해제 뒤 invalidate하면 다음 조회에서 그 계정이 빠진다
  let local = [{ id: 'sprout:x', provider: 'codex' as const, label: 'a', identity: null, organization: null, plan: null, source: 'sprout', observedAt: null, status: 'unavailable' as const, reason: null, windows: [] }]
  const quota = createUsageService({ binary: async () => { throw new Error('not-installed') }, command: async () => '' }, async () => local)
  assert.ok((await quota.read('codex')).accounts.some((x) => x.id === 'sprout:x'))
  local = []; quota.invalidate('codex')
  assert.ok(!(await quota.read('codex')).accounts.some((x) => x.id === 'sprout:x'))
} finally { service.close(); await rm(root, { recursive: true, force: true }) }
console.log('Usage disconnect removes only the chosen isolated profile')
