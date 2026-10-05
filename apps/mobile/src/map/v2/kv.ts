// 29 §9.5 기기 기억(동기화 안 함) — SecureStore에 JSON 하나씩. 읽기는 메모리(처음 한 번 불러옴), 쓰기는 바로 메모리 + 뒤에서 저장.
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'

type Entry = { value: unknown; loaded: boolean; subs: Set<() => void> }
const mem = new Map<string, Entry>()
const keyOf = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_')
function entry(key: string, init: unknown): Entry {
  let e = mem.get(key)
  if (!e) {
    e = { value: init, loaded: false, subs: new Set() }
    mem.set(key, e)
    const en = e
    void SecureStore.getItemAsync(keyOf(key)).then((s) => {
      if (s) { try { en.value = JSON.parse(s) } catch { /* 깨진 기억은 버린다 */ } }
      en.loaded = true
      en.subs.forEach((f) => f())
    }).catch(() => { en.loaded = true; en.subs.forEach((f) => f()) })
  }
  return e
}
export function kvGet<T>(key: string, init: T): T { return entry(key, init).value as T }
export function kvSet<T>(key: string, value: T) {
  const e = entry(key, value)
  e.value = value
  e.subs.forEach((f) => f())
  void SecureStore.setItemAsync(keyOf(key), JSON.stringify(value)).catch(() => {})
}
/** 화면용: [값, 바꾸기, 불러왔나] */
export function useKv<T>(key: string, init: T): [T, (v: T) => void, boolean] {
  const e = entry(key, init)
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick((n) => n + 1); e.subs.add(f); return () => { e.subs.delete(f) } }, [e])
  return [e.value as T, (v: T) => kvSet(key, v), e.loaded]
}
