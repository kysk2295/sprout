// 43 §5.5 · §18.2 · 49 새 옷 카드(그림 = 3D 옷 층 accIcon · 배경은 장면 썸네일)(레벨업·해금 0.7초 뒤): 짙은 둥근 사각 18 + 그림 칸 46 + 이름(외 N개) + 한 줄 + [입혀 보기 | 깔아 보기] [나중에], 9초 뒤 사라짐.
// 스프링으로 올라온다(움직임 줄이기 = 페이드). 나중에 = 옷장 탭 점만 남는다.
import { ITEM_BY_ID, type CharacterItemRow } from '@sprout/schema/wardrobe'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated'
import { usePalette } from '../theme/ThemeProvider'
import { AccThumb, SceneThumb } from './home/glass'

export function NewItemToast({ rows, level, bottom, reduced, onWear, onClose }: { rows: CharacterItemRow[]; level: number; bottom: number; reduced: boolean; onWear: (itemId: string) => void; onClose: () => void }) {
  const items = rows.filter((r) => r.kind === 'item' && ITEM_BY_ID[r.item_id])
  const it = items[0] ? ITEM_BY_ID[items[0].item_id] : null
  useEffect(() => { if (!it) return; const t = setTimeout(onClose, 9000); return () => clearTimeout(t) }, [it, onClose])
  const p = usePalette()
  if (!it) return null
  const more = items.length - 1
  const canWear = it.slot !== 'bg'
  const why = 'lv' in it.rule ? `Lv ${it.rule.lv ?? level} 선물이야. ${it.why ?? '할 일을 끝내서 받았어'}` : `${it.why ?? '네가 한 일로 받은 선물이야'}`
  return (
    <Animated.View entering={reduced ? FadeIn.duration(200) : SlideInDown.springify().damping(16)} exiting={FadeOut.duration(200)} style={[s.toast, { bottom }]} accessibilityLiveRegion="polite">
      <View style={s.ico}>{it.slot === 'bg' ? <SceneThumb bg={it.id} size={38} radius={10} /> : <AccThumb id={it.id} size={40} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.b} numberOfLines={1}>{it.name}{more > 0 ? ` 외 ${more}개` : ''}</Text>
        <Text style={s.tx} numberOfLines={2}>{why}</Text>
      </View>
      <View style={s.bt}>
        <Pressable style={[s.btn, { backgroundColor: p.accent }]} onPress={() => onWear(it.id)} accessibilityRole="button"><Text style={s.priT}>{canWear ? '입혀 보기' : '깔아 보기'}</Text></Pressable>
        <Pressable style={s.btn} onPress={onClose} accessibilityRole="button"><Text style={s.btnT}>나중에</Text></Pressable>
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  toast: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: '#1B231E', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, zIndex: 40 },
  ico: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  b: { color: '#fff', fontSize: 14.5, fontWeight: '700', marginBottom: 1 },
  tx: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 16.5 },
  bt: { gap: 6 },
  btn: { height: 30, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  priT: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  btnT: { color: '#fff', fontSize: 12.5, fontWeight: '600' }
})
