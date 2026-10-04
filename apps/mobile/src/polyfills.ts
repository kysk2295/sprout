// 앱에서 가장 먼저 불러온다(app/_layout.tsx 첫 줄).
// - PowerSync의 watch(비동기 반복자)용 폴리필
// - crypto.randomUUID: 공용 코드(@sprout/schema seed·taskCore)가 쓴다. Hermes에는 없어 expo-crypto로 채운다.
import '@azure/core-asynciterator-polyfill'
import { randomUUID } from 'expo-crypto'

const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } }
g.crypto ??= {}
g.crypto.randomUUID ??= randomUUID
