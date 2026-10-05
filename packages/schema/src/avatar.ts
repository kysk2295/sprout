// 35 프로필 이미지 — 데스크톱·휴대폰이 같이 쓰는 순수 데이터·함수: user_prefs.avatar_json 읽기·검사, 배경색, 얼굴 도형.
// 얼굴 도형은 viewBox 0 0 120 120 기준 데이터 — 데스크톱(SVG)·휴대폰(react-native-svg)이 같은 데이터를 그린다.
// 그림은 전부 sprout가 직접 그린 단순 벡터(성장 캐릭터와 같은 화풍). 틱틱 그림 원본 없음.
import { STAGES, type Species } from './growth.ts'

export type AvatarKind = 'follow' | 'char' | 'face'
export type AvatarPref = { kind: AvatarKind; id?: string; color: AvatarColorId }

/** 35 §1.3 [제안]: 아무것도 안 고른 계정 = 글자 아바타(null). 새 계정 기본을 따라가기로 바꾸려면 여기만 */
export const DEFAULT_AVATAR: AvatarPref | null = null

// ── 배경색 8가지 (35 §1.2): 리스트 색 토큰 35% + 흰색(00 파생 규칙) — 테마와 무관 ──
export const AVATAR_COLORS = [
  { id: 'red', name: '빨강', hex: '#F9C2C7' },
  { id: 'orange', name: '주황', hex: '#FCE2BB' },
  { id: 'yellow', name: '노랑', hex: '#FDF3B4' },
  { id: 'green', name: '초록', hex: '#C6E7C8' },
  { id: 'blue', name: '파랑', hex: '#C2DFFD' },
  { id: 'purple', name: '보라', hex: '#CDCCF9' },
  { id: 'rose', name: '장미', hex: '#E4D0CE' },
  { id: 'slate', name: '회청', hex: '#D4D7E3' }
] as const
export type AvatarColorId = (typeof AVATAR_COLORS)[number]['id']
export const DEFAULT_AVATAR_COLOR: AvatarColorId = 'green'
export const avatarColorHex = (id: string | undefined) => (AVATAR_COLORS.find((c) => c.id === id) ?? AVATAR_COLORS.find((c) => c.id === DEFAULT_AVATAR_COLOR)!).hex

// ── 성장 캐릭터 20개 (4종 × 5단계) ──
export const CHAR_SPECIES: Species[] = ['turtle', 'squirrel', 'cat', 'otter']
export const SPECIES_SHORT: Record<Species, string> = { turtle: '거북이', squirrel: '다람쥐', cat: '고양이', otter: '수달' }
export const charAvatarId = (species: Species, stage: number) => `${species}-${stage}`
export function parseCharId(id: string | undefined): { species: Species; stage: number } | null {
  const m = /^(turtle|squirrel|cat|otter)-([1-5])$/.exec(id ?? '')
  return m ? { species: m[1] as Species, stage: Number(m[2]) } : null
}
export const stageName = (stage: number) => STAGES.find((s) => s.stage === stage)?.name ?? ''

// ── 얼굴 8종 도형 ──
export type FaceShape =
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number; o?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; sw?: number; o?: number; rot?: number }
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number; o?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill?: string; stroke?: string; sw?: number; o?: number }
const INK = '#3A3A3A'
const CHEEK = '#FF9FA8'
/** 점 눈 + 흰 반짝임 — 24px에서도 보이게 반지름 5.5 */
const eyes = (y = 64, dx = 13, r = 5.5): FaceShape[] => [
  { t: 'circle', cx: 60 - dx, cy: y, r, fill: INK }, { t: 'circle', cx: 60 + dx, cy: y, r, fill: INK },
  { t: 'circle', cx: 61.8 - dx, cy: y - 1.8, r: 1.7, fill: '#fff' }, { t: 'circle', cx: 61.8 + dx, cy: y - 1.8, r: 1.7, fill: '#fff' }
]
const cheeks = (y = 75, dx = 22): FaceShape[] => [
  { t: 'circle', cx: 60 - dx, cy: y, r: 6, fill: CHEEK, o: 0.6 }, { t: 'circle', cx: 60 + dx, cy: y, r: 6, fill: CHEEK, o: 0.6 }
]
const smile = (y = 76): FaceShape => ({ t: 'path', d: `M53 ${y} q7 6 14 0`, stroke: INK, sw: 3, fill: 'none' })

export const AVATAR_FACES: { id: string; name: string; shapes: FaceShape[] }[] = [
  {
    id: 'rabbit', name: '토끼', shapes: [
      { t: 'ellipse', cx: 44, cy: 30, rx: 10, ry: 24, fill: '#FBF7F2' }, { t: 'ellipse', cx: 76, cy: 30, rx: 10, ry: 24, fill: '#FBF7F2' },
      { t: 'ellipse', cx: 44, cy: 32, rx: 4.5, ry: 15, fill: '#FFC2CB' }, { t: 'ellipse', cx: 76, cy: 32, rx: 4.5, ry: 15, fill: '#FFC2CB' },
      { t: 'circle', cx: 60, cy: 72, r: 36, fill: '#FBF7F2' },
      ...eyes(68), ...cheeks(79),
      { t: 'ellipse', cx: 60, cy: 77, rx: 4, ry: 3, fill: '#F28C9B' },
      { t: 'path', d: 'M54 82 q6 5 12 0', stroke: INK, sw: 2.6, fill: 'none' }
    ]
  },
  {
    id: 'bear', name: '곰', shapes: [
      { t: 'circle', cx: 30, cy: 38, r: 13, fill: '#B98A63' }, { t: 'circle', cx: 90, cy: 38, r: 13, fill: '#B98A63' },
      { t: 'circle', cx: 30, cy: 38, r: 6.5, fill: '#E8C8A8' }, { t: 'circle', cx: 90, cy: 38, r: 6.5, fill: '#E8C8A8' },
      { t: 'circle', cx: 60, cy: 68, r: 38, fill: '#B98A63' },
      { t: 'ellipse', cx: 60, cy: 81, rx: 15, ry: 11, fill: '#E8C8A8' },
      ...eyes(62),
      { t: 'ellipse', cx: 60, cy: 76, rx: 5.5, ry: 4, fill: INK },
      { t: 'path', d: 'M55 83 q5 4 10 0', stroke: INK, sw: 2.6, fill: 'none' }
    ]
  },
  {
    id: 'chick', name: '병아리', shapes: [
      { t: 'path', d: 'M60 30 C56 20 50 20 50 26 M60 30 C62 18 70 18 69 26', stroke: '#E9B22F', sw: 4, fill: 'none' },
      { t: 'circle', cx: 60, cy: 68, r: 40, fill: '#FFD966' },
      ...eyes(62), ...cheeks(74, 24),
      { t: 'path', d: 'M52 72 L68 72 L60 81 Z', fill: '#F59A3C' }
    ]
  },
  {
    id: 'frog', name: '개구리', shapes: [
      { t: 'circle', cx: 38, cy: 44, r: 15, fill: '#8FD18B' }, { t: 'circle', cx: 82, cy: 44, r: 15, fill: '#8FD18B' },
      { t: 'ellipse', cx: 60, cy: 74, rx: 44, ry: 32, fill: '#8FD18B' },
      { t: 'circle', cx: 38, cy: 44, r: 9.5, fill: '#fff' }, { t: 'circle', cx: 82, cy: 44, r: 9.5, fill: '#fff' },
      { t: 'circle', cx: 39, cy: 45, r: 5.5, fill: INK }, { t: 'circle', cx: 83, cy: 45, r: 5.5, fill: INK },
      ...cheeks(78, 28),
      { t: 'path', d: 'M42 76 q18 14 36 0', stroke: INK, sw: 3, fill: 'none' }
    ]
  },
  {
    id: 'panda', name: '판다', shapes: [
      { t: 'circle', cx: 31, cy: 37, r: 13, fill: '#3E3E46' }, { t: 'circle', cx: 89, cy: 37, r: 13, fill: '#3E3E46' },
      { t: 'circle', cx: 60, cy: 68, r: 38, fill: '#FBFBFB' },
      { t: 'ellipse', cx: 45, cy: 64, rx: 10, ry: 12.5, fill: '#3E3E46', rot: -25 }, { t: 'ellipse', cx: 75, cy: 64, rx: 10, ry: 12.5, fill: '#3E3E46', rot: 25 },
      { t: 'circle', cx: 46, cy: 64, r: 4.2, fill: '#fff' }, { t: 'circle', cx: 74, cy: 64, r: 4.2, fill: '#fff' },
      { t: 'circle', cx: 46.5, cy: 64.5, r: 2.4, fill: INK }, { t: 'circle', cx: 74.5, cy: 64.5, r: 2.4, fill: INK },
      ...cheeks(80, 25),
      { t: 'ellipse', cx: 60, cy: 77, rx: 5, ry: 3.6, fill: INK },
      { t: 'path', d: 'M55 83 q5 4 10 0', stroke: INK, sw: 2.6, fill: 'none' }
    ]
  },
  {
    id: 'fox', name: '여우', shapes: [
      { t: 'path', d: 'M26 52 L32 16 L54 38 Z', fill: '#F0A05A' }, { t: 'path', d: 'M94 52 L88 16 L66 38 Z', fill: '#F0A05A' },
      { t: 'path', d: 'M33 44 L36 26 L46 38 Z', fill: '#FFE3C8' }, { t: 'path', d: 'M87 44 L84 26 L74 38 Z', fill: '#FFE3C8' },
      { t: 'circle', cx: 60, cy: 68, r: 37, fill: '#F0A05A' },
      { t: 'path', d: 'M24 72 C34 70 48 76 60 92 C72 76 86 70 96 72 C94 92 80 105 60 105 C40 105 26 92 24 72 Z', fill: '#FFF4E8' },
      ...eyes(64),
      { t: 'ellipse', cx: 60, cy: 82, rx: 5, ry: 3.8, fill: INK },
      { t: 'path', d: 'M55 88 q5 4 10 0', stroke: INK, sw: 2.4, fill: 'none' }
    ]
  },
  {
    id: 'cactus', name: '선인장', shapes: [
      { t: 'rect', x: 14, y: 54, w: 18, h: 34, rx: 9, fill: '#6DBA7C' }, { t: 'rect', x: 88, y: 46, w: 18, h: 34, rx: 9, fill: '#6DBA7C' },
      { t: 'rect', x: 32, y: 26, w: 56, h: 98, rx: 28, fill: '#7CC48A' },
      { t: 'circle', cx: 52, cy: 20, r: 7, fill: '#FF8FA3' }, { t: 'circle', cx: 66, cy: 19, r: 7, fill: '#FF8FA3' }, { t: 'circle', cx: 60, cy: 25, r: 5, fill: '#FFD166' },
      ...eyes(64, 12), ...cheeks(75, 19),
      smile(77)
    ]
  },
  {
    id: 'mushroom', name: '버섯', shapes: [
      { t: 'rect', x: 34, y: 54, w: 52, h: 66, rx: 22, fill: '#F6E7D2' },
      { t: 'path', d: 'M12 60 C12 28 36 14 60 14 C84 14 108 28 108 60 C108 66 102 68 96 66 C82 62 38 62 24 66 C18 68 12 66 12 60 Z', fill: '#E8736B' },
      { t: 'circle', cx: 40, cy: 36, r: 7, fill: '#fff' }, { t: 'circle', cx: 74, cy: 28, r: 6, fill: '#fff' }, { t: 'circle', cx: 92, cy: 48, r: 5, fill: '#fff' }, { t: 'circle', cx: 24, cy: 52, r: 4, fill: '#fff' },
      ...eyes(82, 12), ...cheeks(92, 19),
      { t: 'path', d: 'M54 93 q6 5 12 0', stroke: INK, sw: 2.6, fill: 'none' }
    ]
  }
]
export const findFace = (id: string | undefined) => AVATAR_FACES.find((f) => f.id === id)

// ── avatar_json 읽기 (깨지거나 모르는 값 → null = 글자) ──
export function parseAvatar(raw: string | null | undefined): AvatarPref | null {
  if (!raw) return DEFAULT_AVATAR
  let v: any
  try { v = JSON.parse(raw) } catch { return DEFAULT_AVATAR }
  if (!v || typeof v !== 'object') return DEFAULT_AVATAR
  const color: AvatarColorId = AVATAR_COLORS.some((c) => c.id === v.color) ? v.color : DEFAULT_AVATAR_COLOR
  if (v.kind === 'follow') return { kind: 'follow', color }
  if (v.kind === 'char' && parseCharId(v.id)) return { kind: 'char', id: v.id, color }
  if (v.kind === 'face' && findFace(v.id)) return { kind: 'face', id: v.id, color }
  return null
}
export const serializeAvatar = (a: AvatarPref | null): string | null =>
  a ? JSON.stringify(a.kind === 'follow' ? { kind: 'follow', color: a.color } : { kind: a.kind, id: a.id, color: a.color }) : null

/** 그릴 것: 글자 · 성장 캐릭터(종·단계) · 알(조사 전 따라가기) · 얼굴 */
export type ResolvedAvatar =
  | { type: 'letter' }
  | { type: 'char'; species: Species; stage: number; bg: string }
  | { type: 'egg'; bg: string }
  | { type: 'face'; faceId: string; bg: string }
export function resolveAvatar(a: AvatarPref | null, growth: { species: Species | null; stage: number }): ResolvedAvatar {
  if (!a) return { type: 'letter' }
  const bg = avatarColorHex(a.color)
  if (a.kind === 'follow') return growth.species ? { type: 'char', species: growth.species, stage: Math.min(5, Math.max(1, growth.stage)), bg } : { type: 'egg', bg }
  if (a.kind === 'char') { const c = parseCharId(a.id); return c ? { type: 'char', ...c, bg } : { type: 'letter' } }
  return findFace(a.id) ? { type: 'face', faceId: a.id!, bg } : { type: 'letter' }
}
/** 같은 칸인지(고른 칸 링 표시) */
export const sameAvatar = (a: AvatarPref | null, kind: AvatarKind, id?: string) => !!a && a.kind === kind && (kind === 'follow' || a.id === id)
/** 이 칸을 눌렀을 때 저장할 값 — 색은 지금 색을 유지 */
export const pickAvatar = (cur: AvatarPref | null, kind: AvatarKind, id?: string): AvatarPref => ({ kind, ...(kind === 'follow' ? {} : { id }), color: cur?.color ?? DEFAULT_AVATAR_COLOR })
/** 색을 눌렀을 때 — 글자 상태면 따라가기 + 그 색(35 §3.2) */
export const pickAvatarColor = (cur: AvatarPref | null, color: AvatarColorId): AvatarPref => (cur ? { ...cur, color } : { kind: 'follow', color })
/** 접근성·툴팁 이름 */
export function avatarLabel(a: AvatarPref | null): string {
  if (!a) return '글자'
  if (a.kind === 'follow') return '내 캐릭터 따라가기'
  if (a.kind === 'char') { const c = parseCharId(a.id); return c ? `${SPECIES_SHORT[c.species]} · ${stageName(c.stage)}` : '글자' }
  return findFace(a.id)?.name ?? '글자'
}

/** 성장 캐릭터를 원 안에 놓는 자리(데스크톱·휴대폰 같은 값): 단계마다 커지는 몸을 같은 크기로 맞춘다(몸 반지름 ≈ 원의 0.36, 새싹 끝은 잘릴 수 있음).
 * CharacterArt(viewBox 120)의 단계 배율 0.72 + 0.07 × 단계, 몸 가운데 y = 108 − 42 × 배율. stage null = 알 */
export function avatarCharBox(size: number, stage: number | null) {
  const s = stage ? 0.72 + stage * 0.07 : 0.9 // CharacterArt의 단계 배율(알은 고정 크기)
  const zoom = stage ? 1.27 / s : 1.3
  const art = size * zoom
  const bodyY = stage ? (108 - 42 * s) / 120 : 64 / 120 // 그림 안 몸 가운데
  return { art: Math.round(art), left: (size - art) / 2, top: size * 0.58 - art * bodyY }
}
