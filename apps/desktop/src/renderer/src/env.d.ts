/// <reference types="vite/client" />
import type { DbApi } from './data/db'
export {}
declare global {
  const __WEB_PREVIEW__: boolean
}
declare global {
  interface Window {
    sprout?: {
      usage?: import('../../preload').SproutUsageApi
    assistant?: import('../../preload').SproutAssistantApi
    collect?: import('../../preload').SproutCollectApi
    ticktick?: import('../../preload').SproutTickTickApi
      platform: NodeJS.Platform
      db: DbApi
      desktop?: import('../../preload').SproutDesktopApi
      auth?: import('../../preload').SproutAuthApi
      mini?: import('../../preload').SproutMiniApi
      reminders?: import('../../preload').SproutRemindersApi
    }
  }
}
