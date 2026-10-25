// 28 §10.2 P1 그날의 장면 — 크게. 처음 열면 뒤집혀 나타나고 사진이 떨어져 붙는다(§10.5). [사진 붙이기] [그날 일기]
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SceneCardView } from '../../src/diary/SceneCard'
import { useSceneCard } from '../../src/diary/sceneData'
import { PhotoSheet } from '../../src/diary/PhotoSheet'
import { usePhotos, usePendingPhotos } from '../../src/diary/photos'
import { openDay } from '../../src/diary/state'
import { useMotionReduced } from '../../src/growth/motion'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'

export default function SceneScreen() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useMotionReduced()
  const { date: param } = useLocalSearchParams<{ date?: string }>()
  const date = param ?? dayKey()
  const card = useSceneCard(date)
  const photos = usePhotos(date)
  const pending = usePendingPhotos(date)
  const [sheet, setSheet] = useState(false)
  const [n, setN] = useState(0) // 사진을 붙이면 다시 나타나는 움직임
  return (
    <View style={{ flex: 1, backgroundColor: '#14161f' }}>
      <View style={[s.hdr, { marginTop: insets.top }]}>
        <GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <Text style={s.h}>그날의 장면</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        {card ? <SceneCardView key={`${card.photo?.media_id ?? 'none'}:${n}`} card={card} variant="hero" appear reduced={reduced} />
          : <View style={[s.empty]}><Text style={{ color: '#fff9', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>이 날은 아직 남긴 게 없어요.{'\n'}기분이나 사진 한 장만 남겨도 장면이 생겨요.</Text></View>}
      </View>
      <View style={[s.acts, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable accessibilityRole="button" onPress={() => setSheet(true)} style={[s.btn, { backgroundColor: '#fff' }]}><Text style={[s.btnText, { color: '#1D2622' }]}>{photos.length ? '사진 더 붙이기' : '사진 한 장 붙이기'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { openDay(date); router.back() }} style={[s.btn, { backgroundColor: 'rgba(255,255,255,0.16)' }]}><Text style={[s.btnText, { color: '#fff' }]}>그날 일기</Text></Pressable>
      </View>
      <PhotoSheet visible={sheet} date={date} count={photos.length + pending.length} onClose={() => setSheet(false)} onAdded={() => setN((x) => x + 1)} />
    </View>
  )
}
const s = StyleSheet.create({
  hdr: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  h: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { height: 420, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#fff3', alignItems: 'center', justifyContent: 'center', padding: 24 },
  acts: { position: 'absolute', left: 16, right: 16, bottom: 0, flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '800' }
})
