// 배포 전 AI 프록시 시험(47 2단계): 이 Mac에서 /ai/* 만 띄운다 — 로그인·동기화는 운영 서버 그대로, AI만 여기로.
//   ssh -N -L 21434:127.0.0.1:11434 macmini          # Mac mini Ollama를 이 Mac 21434로
//   node --experimental-strip-types --no-warnings server/scripts/ai-local.ts   # 127.0.0.1:6070
//   데스크톱: SPROUT_AI_URL=http://127.0.0.1:6070  · 휴대폰(시뮬레이터): EXPO_PUBLIC_AI_URL=http://127.0.0.1:6070
// 토큰은 운영 서버 공개키(JWKS)로 검증한다(가짜 로그인 없음). 사용량은 메모리에만(재시작하면 0) — 운영 DB에 쓰지 않는다.
import { createServer } from 'node:http'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { aiConfigFromEnv, createAi, memoryUsageStore } from '../api/src/ai.ts'
import { directBackend } from '../api/src/ai-backend.ts'

const API = process.env.SPROUT_API_URL ?? 'https://macmini.tail425c97.ts.net'
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:21434'
const PORT = Number(process.env.PORT ?? 6070)
const jwks = createRemoteJWKSet(new URL(`${API}/.well-known/jwks.json`))
const store = memoryUsageStore()
const ai = createAi({
  config: aiConfigFromEnv(),
  backend: directBackend(OLLAMA),
  store,
  auth: async (req) => {
    const h = req.headers.authorization ?? ''
    if (!h.startsWith('Bearer ')) throw new Error('no token')
    const { payload } = await jwtVerify(h.slice(7), jwks, { audience: 'powersync', issuer: process.env.API_ISSUER ?? 'sprout-api' })
    return String(payload.sub)
  },
  log: (l) => console.error(l)
})
createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  const t0 = Date.now()
  res.on('finish', () => console.error(`${req.method} ${path} ${res.statusCode} ${Date.now() - t0}ms turn=${req.headers['x-sprout-turn'] ?? '-'}`))
  if (!(await ai.handle(req, res, path))) { res.writeHead(404); res.end('{"error":"not found"}') }
}).listen(PORT, '127.0.0.1', () => console.error(`ai-local on http://127.0.0.1:${PORT} → ${OLLAMA} (JWKS ${API})`))
