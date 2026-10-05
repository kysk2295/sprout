// 36 §7.1 앱 ↔ 위젯 저장 칸(modules/sprout-widgets). 모듈이 없는 빌드(Expo Go·옛 개발 빌드)에서는 모두 아무것도 안 한다.
import Constants from 'expo-constants'
import { requireOptionalNativeModule } from 'expo'

type ActionFile = { name: string; raw: string }
type SproutWidgetsNative = {
  configure(appGroup: string): void
  isAvailable(): boolean
  setSnapshot(json: string, reload: boolean): Promise<boolean>
  reload(): Promise<void>
  writeArt(rel: string, base64: string): Promise<boolean>
  hasArt(rel: string): boolean
  readActions(): Promise<ActionFile[]>
  removeActions(names: string[]): Promise<void>
  clearData(): Promise<void>
  addListener?(event: 'onAction', fn: (e: { taskId?: string }) => void): { remove(): void }
}

const native = requireOptionalNativeModule<SproutWidgetsNative>('SproutWidgets')
const extra = (Constants.expoConfig?.extra ?? {}) as { widgets?: { appGroup?: string }; share?: { appGroup?: string } }
export const WIDGET_APP_GROUP = extra.widgets?.appGroup ?? extra.share?.appGroup ?? 'group.app.sprout.mobile'

let configured = false
function mod(): SproutWidgetsNative | null {
  if (!native) return null
  if (!configured) {
    try { native.configure(WIDGET_APP_GROUP) } catch { /* 옛 모듈 */ }
    configured = true
  }
  try { return native.isAvailable() ? native : null } catch { return null }
}

export const widgetsAvailable = () => !!mod()
export async function writeSnapshot(json: string, reload: boolean): Promise<boolean> {
  const m = mod()
  if (!m) return false
  try { return await m.setSnapshot(json, reload) } catch (e) { console.warn('[widgets] snapshot write failed:', e); return false }
}
export async function writeArt(rel: string, base64: string): Promise<boolean> {
  const m = mod()
  if (!m) return false
  try { return await m.writeArt(rel, base64) } catch { return false }
}
export const hasArt = (rel: string) => { const m = mod(); try { return m ? m.hasArt(rel) : true } catch { return true } }
export async function readActions(): Promise<ActionFile[]> {
  const m = mod()
  if (!m) return []
  try { return await m.readActions() } catch { return [] }
}
export async function removeActions(names: string[]): Promise<void> {
  const m = mod()
  if (m && names.length) await m.removeActions(names).catch(() => {})
}
export async function clearWidgetData(): Promise<void> {
  const m = mod()
  if (m) await m.clearData().catch(() => {})
}
/** Android: 위젯 체크 신호(앱 프로세스가 살아 있을 때) */
export function onWidgetAction(fn: () => void): () => void {
  const m = mod()
  if (!m?.addListener) return () => {}
  const sub = m.addListener('onAction', () => fn())
  return () => sub.remove()
}
