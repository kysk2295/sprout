// 리스트·폴더·프로젝트 아이콘 한 규칙(30 §A.4 · A.5, 2026-10-06 "리스트에 폴더 아이콘이 왜 있지"):
// 리스트 = 고른 이모지 → 이름 앞 이모지 → ≡ · 폴더 = 이름 앞 이모지 → 폴더 그림(폴더 그림은 폴더에만) · 프로젝트 = 이름 앞 이모지 → 🚀.
// 이름 앞 이모지를 떼는 규칙은 데스크톱 src/shared/emoji.ts splitEmoji와 같다(저장 값은 그대로).
import { Folder } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { listShow, splitLead } from '../data/emojiLead'
import { usePalette } from '../theme/ThemeProvider'

export { listShow, splitLead }

export function ListGlyph({ list, size = 17 }: { list: { name: string; emoji: string | null }; size?: number }) {
  const p = usePalette()
  const e = listShow(list).emoji
  return e
    ? <Text style={{ fontSize: size, width: size + 5, textAlign: 'center' }}>{e}</Text>
    : <Text style={[s.glyph, { fontSize: size + 3, width: size + 5, color: p.textSecondary }]}>≡</Text>
}

export function FolderGlyph({ name, size = 22 }: { name: string; size?: number }) {
  const p = usePalette()
  const e = splitLead(name).emoji
  return e ? <Text style={{ fontSize: size - 5, width: size, textAlign: 'center' }}>{e}</Text> : <Folder size={size} color={p.textSecondary} />
}

/** 리스트 색(틱틱 서랍: 행 오른쪽 작은 점) */
export function ColorDot({ color }: { color: string | null }) {
  return color ? <View style={[s.dot, { backgroundColor: color }]} /> : null
}

const s = StyleSheet.create({
  glyph: { textAlign: 'center', fontWeight: '400' },
  dot: { width: 8, height: 8, borderRadius: 4 }
})
