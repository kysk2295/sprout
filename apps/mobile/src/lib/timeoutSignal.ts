// Hermes(React Native)에는 AbortSignal.timeout·any가 없을 수 있다 — 직접 만든다(2026-10-11, 47 분류 단계가 이것 때문에 휴대폰에서 멈춤)
export function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController()
  setTimeout(() => c.abort(new Error('timeout')), ms)
  return c.signal
}
