// 28 §10.3 P2 사진 한 장 시트: 앨범에서(최근 사진이 먼저) · 지금 찍기. 고르면 줄여서 그날에 붙인다(대기열 → 올리기).
import { Camera, Image as ImageIcon } from 'lucide-react-native'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from '../ui/haptics'
import { SlideSheet } from '../ui/SlideSheet'
import { useToast } from '../ui/Toast'
import { addPhoto, pick, takeError, type Source } from './photos'

export function PhotoSheet({ visible, date, count, onClose, onAdded }: { visible: boolean; date: string; count: number; onClose: () => void; onAdded?: () => void }) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const go = (src: Source) => {
    onClose()
    setTimeout(async () => {
      try {
        const r = await pick(src)
        if (r === 'denied') { toast.show(src === 'camera' ? '카메라를 쓰려면 설정에서 허용해 주세요' : '사진을 고르려면 설정에서 허용해 주세요', { action: { label: '설정', onPress: () => void Linking.openSettings() } }); return }
        if (!r) return
        hx.success()
        await addPhoto(date, r, count)
        const err = takeError()
        if (err) toast.show(err, { error: true })
        else onAdded?.()
      } catch { toast.show('사진을 붙이지 못했어요', { error: true }) }
    }, 250)
  }
  return (
    <SlideSheet visible={visible} onClose={onClose} label="사진 한 장" style={[s.sheet, { backgroundColor: p.sheetBg, paddingBottom: insets.bottom + 12 }]}>
      <View style={[s.grab, { backgroundColor: p.borderStrong }]} />
      <Text style={[s.title, { color: p.textPrimary }]}>오늘 사진 한 장</Text>
      <Text style={[s.sub, { color: p.textTertiary }]}>고른 사진만 줄여서 내 일기에 저장해요 · 위치 정보는 빼요</Text>
      <View style={[s.group, { backgroundColor: p.cardBg }]}>
        <Opt icon={<ImageIcon size={20} color={p.textPrimary} />} title="앨범에서 고르기" sub="최근에 찍은 사진이 먼저 보여요" onPress={() => go('library')} />
        <Opt icon={<Camera size={20} color={p.textPrimary} />} title="지금 찍기" sub="카메라" onPress={() => go('camera')} last />
      </View>
    </SlideSheet>
  )
}
function Opt({ icon, title, sub, onPress, last }: { icon: React.ReactNode; title: string; sub: string; onPress: () => void; last?: boolean }) {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.opt, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
      <View style={[s.ic, { backgroundColor: p.bgSelected }]}>{icon}</View>
      <View style={{ flex: 1 }}><Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600' }}>{title}</Text><Text style={{ color: p.textTertiary, fontSize: 12.5 }}>{sub}</Text></View>
    </Pressable>
  )
}
const s = StyleSheet.create({
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 13, textAlign: 'center', marginBottom: 4 },
  group: { borderRadius: 16, overflow: 'hidden' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14 },
  ic: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
})
