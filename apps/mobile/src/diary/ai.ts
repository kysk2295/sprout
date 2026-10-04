// 일기 대화 AI 호출 — 서버 프록시 POST {API}/ai/diary(Bearer 접근 토큰, stream) → NDJSON 줄(데스크톱 shared/assistant readChatStream과 같은 모양).
// RN 기본 fetch는 응답을 흘려 받지 못해 expo/fetch(ReadableStream)를 쓴다.
import { fetch as streamFetch } from 'expo/fetch'
import { serverAccess } from '../data/auth'
import type { ChatMessage } from './logic'

export const UNAVAILABLE = '지금은 AI를 쓸 수 없어요'
export class AiUnavailable extends Error {}

/** NDJSON 한 줄 → 글 조각·대기열·끝. 오류 줄은 던진다 */
export function readLine(value: string): { delta?: string; queue?: number; done?: boolean } {
  if (!value.trim()) return {}
  const item = JSON.parse(value) as { error?: unknown; queue?: { position?: number }; message?: { content?: unknown }; done?: boolean }
  if (item.error) throw new Error(String(item.error))
  if (item.queue && typeof item.queue.position === 'number') return { queue: item.queue.position }
  const delta = typeof item.message?.content === 'string' && item.message.content ? item.message.content : undefined
  return { delta, done: !!item.done }
}

// Hermes에 TextDecoder가 없을 때를 위한 작은 UTF-8 해독(줄 단위로 완성된 바이트만 넘긴다)
function utf8(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]
    let cp: number
    if (b < 0x80) { cp = b; i += 1 }
    else if (b < 0xe0) { cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2 }
    else if (b < 0xf0) { cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f); i += 3 }
    else { cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f); i += 4 }
    out += String.fromCodePoint(cp)
  }
  return out
}

/** 한 번 묻고 전체 답을 받는다. onDelta = 받는 중 조각. 연결·503·429·로그인 문제는 AiUnavailable */
export async function diaryChat(messages: ChatMessage[], signal: AbortSignal, onDelta?: (delta: string) => void, onQueue?: (position: number) => void): Promise<string> {
  const { url, token } = await serverAccess()
  if (!token) throw new AiUnavailable('로그인하면 AI를 쓸 수 있어요')
  let res: Awaited<ReturnType<typeof streamFetch>>
  try {
    res = await streamFetch(`${url}/ai/diary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages, stream: true }),
      signal
    })
  } catch (e) {
    if (signal.aborted) throw e
    throw new AiUnavailable(UNAVAILABLE)
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AiUnavailable(json?.error ?? UNAVAILABLE)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new AiUnavailable('응답 스트림이 비어 있어요')
  const Dec = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder
  const dec = Dec ? new Dec() : null
  let pending = new Uint8Array(0)
  let buffer = ''
  let result = ''
  let done = false
  const handle = (line: string) => {
    const r = readLine(line)
    if (r.queue !== undefined) onQueue?.(r.queue)
    if (r.delta) { result += r.delta; onDelta?.(r.delta) }
    if (r.done) done = true
  }
  try {
    while (!done) {
      if (signal.aborted) throw new Error('aborted')
      const chunk = await reader.read()
      if (chunk.done) { if (dec) buffer += dec.decode(); if (buffer.trim()) handle(buffer); break }
      if (dec) buffer += dec.decode(chunk.value, { stream: true })
      else {
        const joined = new Uint8Array(pending.length + chunk.value.length)
        joined.set(pending); joined.set(chunk.value, pending.length)
        const cut = joined.lastIndexOf(10) + 1 // 줄바꿈까지만 해독
        buffer += utf8(joined.subarray(0, cut))
        pending = joined.slice(cut)
      }
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) { handle(buffer.slice(0, end)); buffer = buffer.slice(end + 1); if (done) break }
    }
    if (signal.aborted) throw new Error('aborted')
    if (!done) throw new AiUnavailable('응답 연결이 끊겼어요. 다시 시도해 주세요')
    return result
  } finally {
    await reader.cancel().catch(() => {})
  }
}
