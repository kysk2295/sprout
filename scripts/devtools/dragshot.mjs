// 끄는 도중 화면 캡처: node dragshot.mjs out-prefix x1 y1 x2 y2 [steps=12] [shotAt=6,12] [end=drop|esc|hold]
// 누른 채 steps번 나눠 움직이고, shotAt에 적힌 걸음마다 `<prefix>-<걸음>.png`로 캡처한 뒤 놓는다(esc면 Esc로 취소 후 놓기).
// ALT=1이면 ⌥를 누른 채 끈다(복제). 뷰포트는 1378×884로 맞춘다(W·H로 바꿈).
import { writeFileSync } from 'node:fs'
const [prefix, x1, y1, x2, y2, stepsArg = '12', shotArg = '6,12', end = 'drop'] = process.argv.slice(2)
const steps = Number(stepsArg)
const shots = new Set(shotArg.split(',').map(Number))
const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9229}/json`)).json()
const page = targets.find((t) => t.type === 'page' && !t.url.includes('window=')) ?? targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const call = (method, params) => new Promise((resolve) => {
  const my = ++id
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === my) { ws.removeEventListener('message', on); resolve(m.result) } }
  ws.addEventListener('message', on)
  ws.send(JSON.stringify({ id: my, method, params }))
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await call('Emulation.setDeviceMetricsOverride', { width: Number(process.env.W ?? 1378), height: Number(process.env.H ?? 884), deviceScaleFactor: 1, mobile: false })
await wait(300)
const modifiers = process.env.ALT ? 1 : 0
const [ax, ay, bx, by] = [x1, y1, x2, y2].map(Number)
await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax, y: ay, modifiers })
await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, button: 'left', buttons: 1, clickCount: 1, modifiers })
await wait(Number(process.env.HOLD ?? 120))
for (let i = 1; i <= steps; i++) {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + ((bx - ax) * i) / steps, y: ay + ((by - ay) * i) / steps, button: 'left', buttons: 1, modifiers })
  await wait(40)
  if (shots.has(i)) {
    await wait(120)
    const r = await call('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${prefix}-${i}.png`, Buffer.from(r.data, 'base64'))
  }
}
if (end === 'esc') {
  await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(100)
}
if (end !== 'hold') await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, button: 'left', buttons: 0, clickCount: 1, modifiers })
await wait(400)
const r = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${prefix}-after.png`, Buffer.from(r.data, 'base64'))
await call('Emulation.clearDeviceMetricsOverride', {}) // 캡처 뒤 원래 창 크기로(남겨 두면 창 안 화면이 잘려 보인다)
ws.close()
