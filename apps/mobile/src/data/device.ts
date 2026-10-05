// 32 §3.1 기기 id — 처음 쓸 때 만들어 보안 저장소(sprout.deviceId)에 둔다. 다시 설치하면 새 id.
// 서버 device_tokens.id · 업로드 헤더 X-Sprout-Device(올린 기기는 푸시 효과에서 뺀다) · 로그아웃 때 등록 해제에 쓴다.
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

const KEY = 'sprout.deviceId'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let cached: Promise<string> | undefined

export function deviceId(): Promise<string> {
  cached ??= (async () => {
    const saved = await SecureStore.getItemAsync(KEY).catch(() => null)
    if (saved && UUID_RE.test(saved)) return saved.toLowerCase()
    const id = Crypto.randomUUID().toLowerCase()
    await SecureStore.setItemAsync(KEY, id).catch(() => {})
    return id
  })().catch((e) => { cached = undefined; throw e })
  return cached
}
