// 일기 기기 설정(15 §3.1·§7, 28 §5 "기기에만"): 동의 · 기억하기 · 오늘은 혼자(날짜) · 한계 안내 본 횟수 · 마지막 탭(쓰기/돌아보기).
// 동기화하지 않는다. 저장은 expo-secure-store, 읽기는 메모리 사본(preload 뒤 동기적으로).
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'

const K = { consent: 'sprout.diary.consent', memory: 'sprout.diary.memory', solo: 'sprout.diary.solo', notice: 'sprout.diary.notice' }
const cache = new Map<string, string | null>()
const listeners = new Set<() => void>()
let loaded: Promise<void> | null = null

export function preloadDiaryPrefs(): Promise<void> {
  loaded ??= Promise.all(Object.values(K).map(async (k) => {
    try { cache.set(k, await SecureStore.getItemAsync(k)) } catch { cache.set(k, null) }
  })).then(() => listeners.forEach((l) => l()))
  return loaded
}
const read = (k: string) => cache.get(k) ?? null
function write(k: string, v: string) {
  cache.set(k, v)
  listeners.forEach((l) => l())
  void SecureStore.setItemAsync(k, v).catch(() => { /* 저장 꺼짐 — 이번 실행 동안만 */ })
}

/** null = 아직 묻지 않음 */
export const getConsent = (): boolean | null => (read(K.consent) === 'on' ? true : read(K.consent) === 'off' ? false : null)
export const setConsent = (on: boolean) => write(K.consent, on ? 'on' : 'off')
export const getMemory = () => read(K.memory) === 'on'
export const setMemory = (on: boolean) => write(K.memory, on ? 'on' : 'off')
export const isSolo = (date: string) => (read(K.solo) ?? '').split(',').includes(date)
export function setSolo(date: string, on: boolean) {
  const days = (read(K.solo) ?? '').split(',').filter((d) => d && d !== date).slice(-30)
  write(K.solo, (on ? [...days, date] : days).join(','))
}
/** 한계 안내는 처음 5번만 */
export function takeNotice(limit = 5): boolean {
  const n = Number(read(K.notice) ?? 0)
  if (n >= limit) return false
  write(K.notice, String(n + 1))
  return true
}

/** 설정이 바뀌면 다시 그린다. ready = 저장소를 읽었는지(동의 시트를 너무 일찍 띄우지 않게) */
export function useDiaryPrefs() {
  const [, bump] = useState(0)
  const [ready, setReady] = useState(cache.has(K.consent))
  useEffect(() => {
    const l = () => bump((n) => n + 1)
    listeners.add(l)
    void preloadDiaryPrefs().then(() => setReady(true))
    return () => { listeners.delete(l) }
  }, [])
  return { ready, consent: getConsent(), memory: getMemory(), isSolo }
}
