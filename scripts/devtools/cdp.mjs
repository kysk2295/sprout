// 사용: node cdp.mjs '<js expression>' — Electron 렌더러에서 식을 평가하고 결과를 출력
const targets = await (await fetch('http://127.0.0.1:9229/json')).json()
const page = process.env.TARGET ? targets.find((t) => t.type === 'page' && t.url.includes(process.env.TARGET)) : (targets.find((t) => t.type === 'page' && !t.url.includes('window=')) ?? targets.find((t) => t.type === 'page'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const call = (method, params) => new Promise((resolve) => {
  const my = ++id
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === my) { ws.removeEventListener('message', on); resolve(m.result) } }
  ws.addEventListener('message', on)
  ws.send(JSON.stringify({ id: my, method, params }))
})
const r = await call('Runtime.evaluate', { expression: process.argv[2], awaitPromise: true, returnByValue: true })
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r, null, 1))
ws.close()
