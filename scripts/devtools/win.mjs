// 사용: node win.mjs w h — 실제 창 크기를 바꾼다(에뮬레이션 해제)
const [w = 1378, h = 884] = process.argv.slice(2)
const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9229}/json`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const call = (method, params) => new Promise((resolve) => {
  const my = ++id
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === my) { ws.removeEventListener('message', on); resolve(m) } }
  ws.addEventListener('message', on)
  ws.send(JSON.stringify({ id: my, method, params }))
})
await call('Emulation.clearDeviceMetricsOverride', {})
const win = await call('Browser.getWindowForTarget', {})
console.log(JSON.stringify(win))
if (win.result) console.log(JSON.stringify(await call('Browser.setWindowBounds', { windowId: win.result.windowId, bounds: { width: +w, height: +h } })))
ws.close()
