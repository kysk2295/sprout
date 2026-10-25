// 성장 ⋯ → 캐릭터 이름 바꾸기(23 §2 머리). characters.name을 쓴다(데스크톱에도 같은 이름).
import { useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native'
import { Tap } from '../ui/Pressables'
import { KeyboardAvoid } from '../ui/KeyboardAvoid'
import type { Palette } from '../theme/palette'
import { renameCharacter } from './data'
import { useOnce } from '../ui/once'

export function RenameModal({ p, visible, initial, today, onClose }: { p: Palette; visible: boolean; initial: string; today: string; onClose: () => void }) {
  const [v, setV] = useState(initial)
  useEffect(() => { if (visible) setV(initial) }, [visible, initial])
  const save = useOnce(async () => {
    const name = v.trim()
    if (!name) return
    await renameCharacter(today, name)
    onClose()
  })
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoid style={[s.scrim, { backgroundColor: p.scrim }]}>
        <Tap style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[s.card, { backgroundColor: p.bgPopover }]}>
          <Text style={[s.title, { color: p.textPrimary }]}>캐릭터 이름 바꾸기</Text>
          <TextInput
            value={v}
            onChangeText={setV}
            autoFocus
            maxLength={12}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            style={[s.input, { color: p.textPrimary, borderColor: p.accent, backgroundColor: p.bgInput }]}
            accessibilityLabel="캐릭터 이름"
          />
          <View style={s.row}>
            <Tap style={[s.btn, { backgroundColor: p.bgSelected }]} onPress={onClose}><Text style={{ color: p.textPrimary, fontSize: 16 }}>취소</Text></Tap>
            <Tap style={[s.btn, { backgroundColor: p.accent, opacity: v.trim() ? 1 : 0.5 }]} disabled={!v.trim()} onPress={() => void save()}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>저장</Text></Tap>
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  )
}
const s = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: 300, borderRadius: 18, padding: 18, gap: 14 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  input: { height: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 17 },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
})
