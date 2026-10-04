// 사용: node shot.mjs out.png — Electron 렌더러 화면을 캡처
import { writeFileSync } from 'node:fs'
const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9229}/json`)).json()
const page = process.env.TARGET ? targets.find((t) => t.type === 'page' && t.url.includes(process.env.TARGET)) : (targets.find((t) => t.type === 'page' && !t.url.includes('window=')) ?? targets.find((t) => t.type === 'page'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
const r = await new Promise((resolve) => {
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id === 1) resolve(m.result) })
  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }))
})
writeFileSync(process.argv[2], Buffer.from(r.data, 'base64'))
ws.close()
