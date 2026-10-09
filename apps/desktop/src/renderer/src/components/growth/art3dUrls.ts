// 49 §4.4 · 데스크톱 3D 그림 주소 — packages/schema/art3d/*.webp 전부(데스크톱은 앱 크기 제한이 없어 다 넣는다).
// 작은 파일(≤ 4 KB: 얼굴·160 그림)은 vite가 data: URL로 묶고, 나머지는 out/renderer/assets로 복사된다.
import { artFile } from '@sprout/schema/characterArt'

const FILES = import.meta.glob('../../../../../../../packages/schema/art3d/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const BY_NAME: Record<string, string> = {}
for (const [p, url] of Object.entries(FILES)) BY_NAME[p.slice(p.lastIndexOf('/') + 1)] = url

/** 파일 이름(그림 이름 + 크기) → 주소. 그 크기가 없으면 다른 크기로 */
export function artUrl(key: string, px: number): string | null {
  return BY_NAME[artFile(key, px)] ?? BY_NAME[artFile(key, 768)] ?? BY_NAME[artFile(key, 384)] ?? BY_NAME[artFile(key, 160)] ?? BY_NAME[artFile(key, 512)] ?? BY_NAME[artFile(key, 1170)] ?? BY_NAME[artFile(key, 256)] ?? null
}
export const artFileCount = () => Object.keys(BY_NAME).length
