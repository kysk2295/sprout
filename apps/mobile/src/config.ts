// 서버 주소 — 기본은 Mac mini(Tailscale Funnel 공개 주소, 데스크톱 sync.ts와 같음).
// 바꾸려면 app.json의 extra 또는 실행할 때 EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SYNC_URL.
import Constants from 'expo-constants'

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; syncUrl?: string }
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'https://macmini.tail425c97.ts.net'
export const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL ?? extra.syncUrl ?? 'https://macmini.tail425c97.ts.net:8443'
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0'
