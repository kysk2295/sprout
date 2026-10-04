// 작은 가운데 대화 상자: 이름 입력(폴더·리스트 만들기/이름 바꾸기) 또는 확인(삭제). 틱틱 모바일 알림창 모양 [임시].
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'
import { NAME_MAX } from './logic'

export type DialogSpec = { title: string; message?: string; input?: { initial?: string; placeholder: string }; confirm: string; danger?: boolean; onConfirm: (value: string) => void | Promise<void> }

export function Dialog({ spec, onClose }: { spec: DialogSpec | null; onClose: () => void }) {
  const p = usePalette()
  const [value, setValue] = useState('')
  // 떠 있는 메뉴(Modal)가 닫히는 중에 다른 Modal을 띄우면 iOS가 무시한다 → 메뉴가 사라진 뒤 연다
  const [shown, setShown] = useState<DialogSpec | null>(null)
  useEffect(() => {
    setValue(spec?.input?.initial ?? '')
    if (!spec) { setShown(null); return }
    const t = setTimeout(() => setShown(spec), 320)
    return () => clearTimeout(t)
  }, [spec])
  if (!spec || shown !== spec) return null
  const len = [...value.trim()].length
  const bad = !!spec.input && (len === 0 || len > NAME_MAX)
  const ok = async () => { if (bad) return; onClose(); await spec.onConfirm(value) }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.scrim, { backgroundColor: p.scrim }]}>
        <View style={[s.box, { backgroundColor: p.bgPopover }]}>
          <Text style={[s.title, { color: p.textPrimary }]}>{spec.title}</Text>
          {spec.message ? <Text style={[s.msg, { color: p.textSecondary }]}>{spec.message}</Text> : null}
          {spec.input ? (
            <View>
              <TextInput autoFocus value={value} onChangeText={setValue} placeholder={spec.input.placeholder} placeholderTextColor={p.textTertiary} onSubmitEditing={() => void ok()} returnKeyType="done" accessibilityLabel={spec.input.placeholder}
                style={[s.input, { color: p.textPrimary, backgroundColor: p.bgInput, borderColor: len > NAME_MAX ? p.danger : p.borderDivider }]} />
              <Text style={[s.count, { color: len > NAME_MAX ? p.danger : p.textTertiary }]}>{len}/{NAME_MAX}</Text>
            </View>
          ) : null}
          <View style={[s.btns, { borderTopColor: p.borderDivider }]}>
            <Pressable onPress={onClose} style={s.btn} accessibilityRole="button"><Text style={{ color: p.textSecondary, fontSize: 16 }}>취소</Text></Pressable>
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: p.borderDivider }} />
            <Pressable disabled={bad} onPress={() => void ok()} style={s.btn} accessibilityRole="button"><Text style={{ color: spec.danger ? p.danger : p.accent, fontSize: 16, fontWeight: '600', opacity: bad ? 0.4 : 1 }}>{spec.confirm}</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
const s = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  box: { width: '100%', maxWidth: 320, borderRadius: 16, paddingTop: 18, overflow: 'hidden' },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16 },
  msg: { fontSize: 13.5, lineHeight: 19, textAlign: 'center', paddingHorizontal: 16, marginTop: 6 },
  input: { marginHorizontal: 16, marginTop: 12, height: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 16 },
  count: { fontSize: 11, textAlign: 'right', marginRight: 18, marginTop: 4 },
  btns: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14 },
  btn: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' }
})
