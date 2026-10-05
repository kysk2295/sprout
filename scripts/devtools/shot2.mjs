// 사용: node shot2.mjs out.png [w h] — 뷰포트를 w×h로 맞추고 캡처
import { writeFileSync } from 'node:fs'
const [out, w = 1378, h = 884] = process.argv.slice(2)
const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9229}/json`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const call = (method, params) => new Promise((resolve) => {
  const my = ++id
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === my) { ws.removeEventListener('message', on); resolve(m.result) } }
  ws.addEventListener('message', on)
  ws.send(JSON.stringify({ id: my, method, params }))
})
await call('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false })
await new Promise((r) => setTimeout(r, 400))
const r = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(r.data, 'base64'))
await call('Emulation.clearDeviceMetricsOverride', {}) // 캡처 뒤 원래 창 크기로(남겨 두면 창 안 화면이 잘려 보인다)
ws.close()
