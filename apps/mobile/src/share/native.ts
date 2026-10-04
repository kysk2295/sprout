// 24 §5: 공유 확장과 본 앱이 만나는 곳 — App Group 폴더(대기열 파일)와 키체인 공유 그룹(액세스 토큰).
// - 그룹 이름은 config 플러그인(plugins/share-extension)이 extra.share로 넣는다. 없으면 기본값.
// - 확장에는 **액세스 토큰만** 건넨다(리프레시 토큰은 본 앱 세션에만 — auth.ts 머리 설명). 새로 고침은 본 앱만.
import Constants from 'expo-constants'
import { Directory, File, Paths } from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { QueueIO } from './queue.ts'

const extra = (Constants.expoConfig?.extra ?? {}) as { share?: { appGroup?: string; keychainGroup?: string } }
export const APP_GROUP = extra.share?.appGroup ?? 'group.app.sprout.mobile'
export const KEYCHAIN_GROUP = extra.share?.keychainGroup ?? 'BU697KN34B.app.sprout.mobile.shared'
export const TOKEN_KEY = 'sprout.share.access'
export const QUEUE_DIR = 'share-queue'

const opts: SecureStore.SecureStoreOptions = { accessGroup: KEYCHAIN_GROUP, keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

/** 확장이 읽을 접근 토큰·사용자·API 주소를 키체인 공유 그룹에 둔다(로그인·앞으로 올 때마다) */
export async function publishToken(v: { access_token: string; user_id: string; api_url: string }) {
  if (Platform.OS !== 'ios') return
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(v), opts)
  } catch (e) {
    console.warn('[share] keychain write failed:', e)
  }
}
export async function clearToken() {
  if (Platform.OS !== 'ios') return
  try { await SecureStore.deleteItemAsync(TOKEN_KEY, opts) } catch { /* 없으면 그만 */ }
}

function queueDir(): Directory | null {
  if (Platform.OS !== 'ios') return null
  const root = Paths.appleSharedContainers?.[APP_GROUP]
  return root ? new Directory(root, QUEUE_DIR) : null
}

/** App Group 대기열 파일 입출력 — 넣기는 밖(useShareInbox)에서 로컬 DB로 */
export function fileQueueIO(db: Pick<QueueIO, 'exists' | 'insert'>): QueueIO | null {
  const dir = queueDir()
  if (!dir) return null
  return {
    list: async () => (dir.exists ? dir.list().filter((e) => e instanceof File).map((f) => f.name) : []),
    read: async (name) => new File(dir, name).text(),
    remove: async (name) => { const f = new File(dir, name); if (f.exists) f.delete() },
    exists: db.exists,
    insert: db.insert
  }
}
