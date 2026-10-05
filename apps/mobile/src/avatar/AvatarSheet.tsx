// 35 §4 프로필 이미지 고르기 시트(휴대폰): 화면 안 아래 시트(BottomSheet — 수집 상세·AI 비서와 같은 방식, formSheet 경로 아님).
// 순서 = 데스크톱 팝오버와 같음: 미리 보기 → 배경색 8 → 추천(내 캐릭터 따라가기) → 성장 캐릭터 4×5 → 얼굴 4×2 → 글자로 되돌리기. 누르면 바로 저장.
import {
  AVATAR_COLORS, AVATAR_FACES, avatarLabel, CHAR_SPECIES, charAvatarId, pickAvatar, pickAvatarColor, resolveAvatar, sameAvatar, SPECIES_SHORT, stageName,
  type AvatarKind
} from '@sprout/schema/avatar'
import { STAGES } from '@sprout/schema/growth'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { saveAvatar, useAvatar } from '../data/avatar'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { BottomSheet } from '../ui/BottomSheet'
import { ProfileAvatar } from './ProfileAvatar'

const CELL = 52

export function AvatarSheet({ visible, onClose, letter }: { visible: boolean; onClose: () => void; letter: string }) {
  const p = usePalette()
  const { pref, resolved, growth } = useAvatar()
  const pick = (kind: AvatarKind, id?: string) => void saveAvatar((cur) => pickAvatar(cur, kind, id))
  const ring = (on: boolean) => ({ borderColor: on ? p.accent : 'transparent' })
  const cell = (kind: AvatarKind, id: string | undefined, label: string) => {
    const on = sameAvatar(pref, kind, id)
    return (
      <Pressable key={`${kind}:${id ?? ''}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => pick(kind, id)} style={[s.cell, ring(on)]}>
        <ProfileAvatar avatar={resolveAvatar(pickAvatar(pref, kind, id), growth)} size={CELL - 8} letter={letter} />
      </Pressable>
    )
  }
  const caption = (t: string) => <Text style={[FONT.meta, s.caption, { color: p.textTertiary }]}>{t}</Text>
  const head = (
    <View style={s.head}>
      <Text style={[FONT.nav, { color: p.textPrimary, flex: 1 }]}>프로필 이미지</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="완료" hitSlop={10} onPress={onClose}><Text style={{ color: p.accent, fontSize: 16, fontWeight: '600' }}>완료</Text></Pressable>
    </View>
  )
  const follow = sameAvatar(pref, 'follow')
  return (
    <BottomSheet visible={visible} onClose={onClose} mid={0.72} head={head} label="프로필 이미지">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={s.preview}>
          <ProfileAvatar avatar={resolved} size={72} letter={letter} />
          <Text style={[FONT.meta, { color: p.textTertiary, marginTop: 6 }]}>{avatarLabel(pref)}</Text>
        </View>
        {caption('배경색')}
        <View style={s.colors}>
          {AVATAR_COLORS.map((c) => {
            const on = pref?.color === c.id
            return (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`배경 ${c.name}`} accessibilityState={{ selected: on }} hitSlop={4}
                onPress={() => void saveAvatar((cur) => pickAvatarColor(cur, c.id))} style={[s.colorRing, ring(on)]}>
                <View style={[s.color, { backgroundColor: c.hex }]} />
              </Pressable>
            )
          })}
        </View>
        {caption('추천')}
        <Pressable accessibilityRole="button" accessibilityLabel="내 캐릭터 따라가기" accessibilityState={{ selected: follow }} onPress={() => pick('follow')}
          style={({ pressed }) => [s.follow, { backgroundColor: follow ? p.accentSubtle : pressed ? p.bgSelected : 'transparent' }]}>
          <ProfileAvatar avatar={resolveAvatar(pickAvatar(pref, 'follow'), growth)} size={44} letter={letter} />
          <View style={{ flex: 1 }}>
            <Text style={[FONT.bodyStrong, { color: p.textPrimary }]}>내 캐릭터 따라가기 <Text style={{ color: p.accent, fontSize: 12 }}>추천</Text></Text>
            <Text style={[FONT.meta, { color: p.textTertiary }]} numberOfLines={2}>{growth.species ? `${SPECIES_SHORT[growth.species]} · ${stageName(growth.stage)} — 진화하면 같이 자라요` : '성향 조사를 하면 내 캐릭터가 나와요'}</Text>
          </View>
        </Pressable>
        {caption('성장 캐릭터')}
        {CHAR_SPECIES.map((sp) => (
          <View key={sp}>
            <Text style={[FONT.meta, { color: p.textSecondary, marginTop: 4 }]}>{SPECIES_SHORT[sp]}</Text>
            <View style={s.grid}>{STAGES.map((st) => cell('char', charAvatarId(sp, st.stage), `${SPECIES_SHORT[sp]} ${st.name} 단계`))}</View>
          </View>
        ))}
        {caption('얼굴')}
        <View style={[s.grid, { justifyContent: 'space-around' }]}>{AVATAR_FACES.slice(0, 4).map((f) => cell('face', f.id, f.name))}</View>
        <View style={[s.grid, { justifyContent: 'space-around' }]}>{AVATAR_FACES.slice(4).map((f) => cell('face', f.id, f.name))}</View>
        <Pressable accessibilityRole="button" disabled={!pref} onPress={() => void saveAvatar(null)} style={s.reset}>
          <Text style={{ color: pref ? p.textSecondary : p.textQuaternary, fontSize: 15 }}>글자로 되돌리기</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  preview: { alignItems: 'center', paddingVertical: 8 },
  caption: { marginTop: 14, marginBottom: 6, fontWeight: '600' },
  colors: { flexDirection: 'row', justifyContent: 'space-between' },
  colorRing: { width: 36, height: 36, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  color: { width: 28, height: 28, borderRadius: 14 },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12 },
  grid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  cell: { width: CELL, height: CELL, borderRadius: CELL / 2, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  reset: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12 }
})
