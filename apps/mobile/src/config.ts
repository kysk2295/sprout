// 서버 주소 — 기본은 Mac mini(Tailscale Funnel 공개 주소, 데스크톱 sync.ts와 같음).
// 바꾸려면 app.json의 extra 또는 실행할 때 EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SYNC_URL.
import Constants from 'expo-constants'

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; syncUrl?: string }
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'https://macmini.tail425c97.ts.net'
export const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL ?? extra.syncUrl ?? 'https://macmini.tail425c97.ts.net:8443'
/** AI 프록시(/ai/*)만 다른 곳으로 — 배포 전 시험용 로컬 프록시(server/scripts/ai-local.ts). 기본은 API_URL */
export const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? API_URL
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0'
