// 사용: node input.mjs click x y | rclick x y | key Escape | type 텍스트 | move x y
const [cmd, a, b] = process.argv.slice(2)
const targets = await (await fetch('http://127.0.0.1:9229/json')).json()
const page = process.env.TARGET ? targets.find((t) => t.type === 'page' && t.url.includes(process.env.TARGET)) : (targets.find((t) => t.type === 'page' && !t.url.includes('window=')) ?? targets.find((t) => t.type === 'page'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const call = (method, params) => new Promise((resolve) => {
  const my = ++id
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === my) { ws.removeEventListener('message', on); resolve(m) } }
  ws.addEventListener('message', on)
  ws.send(JSON.stringify({ id: my, method, params }))
})
const mouse = async (button, x, y) => {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 })
}
if (cmd === 'drag') {
  const [x1, y1, x2, y2] = [a, b, process.argv[5], process.argv[6]].map(Number)
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 })
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 })
  if (process.env.HOLD) await new Promise((r) => setTimeout(r, Number(process.env.HOLD)))
  for (let i = 1; i <= 12; i++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 12, y: y1 + ((y2 - y1) * i) / 12, button: 'left', buttons: 1 })
    await new Promise((r) => setTimeout(r, 30))
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 })
}
else if (cmd === 'click') await mouse('left', +a, +b)
else if (cmd === 'rclick') await mouse('right', +a, +b)
else if (cmd === 'move') await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: +a, y: +b })
else if (cmd === 'undo') {
  await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4, commands: ['undo'] })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 })
}
else if (cmd === 'type') await call('Input.insertText', { text: a })
else if (cmd === 'key') {
  const codes = { Escape: 27, Enter: 13, z: 90 }
  await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: a, code: a, windowsVirtualKeyCode: codes[a] })
  if (a === 'Enter') await call('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: a })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: a, code: a, windowsVirtualKeyCode: codes[a] })
}
ws.close()
