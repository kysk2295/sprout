/// <reference types="vite/client" />
import type { DbApi } from './data/db'
export {}
declare global {
  const __WEB_PREVIEW__: boolean
}
declare global {
  interface Window {
    sprout?: {
      platform: NodeJS.Platform
      db: DbApi
      desktop?: import('../../preload').SproutDesktopApi
      reminders?: import('../../preload').SproutRemindersApi
    }
  }
}
