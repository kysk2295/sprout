// 완료음(02 §12). 틱틱 소리 파일은 쓰지 않고 짧은 두 음을 직접 합성한다.
let ctx: AudioContext | undefined
export function playCompleteSound() {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    ;[880, 1318.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.07
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.12, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.25)
    })
  } catch {
    // 소리를 못 내도 동작에는 영향 없음
  }
}
