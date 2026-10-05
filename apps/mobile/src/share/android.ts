// 24 §5-5 Android 공유 받기: 다른 앱 공유 → 꿈틀 → 수집함. 받는 종류는 app.json android.intentFilters(SEND text/plain),
// 인텐트 읽기는 modules/sprout-share(Kotlin). 확장·App Group이 없으니 본 앱이 바로 로컬 DB에 쓴다(→ PowerSync가 올림, 오프라인이면 연결될 때).
// 로그인 전에 온 공유는 모듈에 쌓여 있다가 로그인하면 들어간다(앱 프로세스가 살아 있는 동안).
import { insertStmt } from '@sprout/schema/taskCore'
import { requireOptionalNativeModule } from 'expo'
import { useRouter, type Href } from 'expo-router'
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { currentUserId } from '../data/auth'
import { run } from '../data/db'
import { useToast } from '../ui/Toast'
import { androidShareContent, shareRow } from './row.ts'

type Shared = { text?: string | null; subject?: string | null; at?: number }
interface SproutShareNative {
  take(): Shared[]
  addListener?(event: 'onShare', fn: () => void): { remove(): void }
}
const native = Platform.OS === 'android' ? requireOptionalNativeModule<SproutShareNative>('SproutShare') : null

/** 이 빌드에서 다른 앱 공유로 꿈틀에 넣을 수 있나 — iOS는 공유 확장, Android는 공유 받기 모듈이 들어간 빌드 */
export const canReceiveShare = Platform.OS === 'ios' || !!native

/** 쌓인 공유를 수집함에 넣는다. 넣은 개수 */
async function drain(): Promise<number> {
  if (!native) return 0
  let items: Shared[] = []
  try { items = native.take() } catch (e) { console.warn('[share] take failed:', e); return 0 }
  let n = 0
  for (const it of items) {
    const content = androidShareContent(it.subject, it.text)
    if (!content) continue
    const at = new Date(typeof it.at === 'number' ? it.at : Date.now()).toISOString()
    await run([insertStmt('notes', { owner_id: currentUserId(), id: crypto.randomUUID(), ...shareRow(content, at) })])
    n++
  }
  return n
}

/** 루트(Screens)에서 한 번: 로그인 상태에서 시작·앞으로 올 때·새 공유 이벤트마다 넣고, 넣었으면 수집함 탭 + 토스트 */
export function useAndroidShare(signedIn: boolean) {
  const router = useRouter()
  const toast = useToast()
  useEffect(() => {
    if (!native || !signedIn) return
    let busy = false
    const go = async () => {
      if (busy) return
      busy = true
      try {
        const n = await drain()
        if (n) {
          router.navigate('/collect' as Href)
          toast.show(n > 1 ? `공유한 ${n}개를 수집함에 넣었어요` : '수집함에 넣었어요')
        }
      } catch (e) {
        console.warn('[share] android save failed:', e)
        toast.show('저장하지 못했어요. 다시 시도해 주세요')
      } finally { busy = false }
    }
    void go()
    const ev = native.addListener?.('onShare', () => void go())
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void go() })
    return () => { ev?.remove(); app.remove() }
  }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps
}
