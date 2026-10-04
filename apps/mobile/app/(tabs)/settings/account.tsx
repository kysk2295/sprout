// 설정 › 계정(08 §7.1 휴대폰판 — 틱틱 설정 › 계정 맨 아래 "계정 삭제"): 이메일 · 로그아웃 · 계정 삭제.
// 계정 삭제 = DELETE /auth/account(서버가 다시 확인: 비밀번호 계정은 비밀번호, 구글·애플로만 가입한 계정은 10분 안 소셜 재로그인).
// 휴대폰에는 소셜 로그인이 아직 없어 소셜 전용 계정은 컴퓨터 앱에서 지우도록 안내한다. 성공하면 이 기기 데이터를 지우고 로그인 화면으로.
// 문구·확인 단어("삭제")·오류 문구는 데스크톱 DeleteAccount와 같다.
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, ApiError, freshToken, logout, useAuth } from '../../../src/data/auth'
import { FONT, M } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'

const DELETE_WORD = '삭제'
function deleteErrorText(error: string, status: number): string {
  if (/invalid password/.test(error)) return '비밀번호가 맞지 않아요'
  if (/reauth required/.test(error)) return '보안을 위해 컴퓨터 앱에서 Google 또는 Apple로 다시 로그인한 뒤 삭제해 주세요'
  if (status === 429 || /시도가 너무 많아요/.test(error)) return /분 뒤/.test(error) ? error : '잠시 뒤 다시 시도하세요'
  if (status === 401 || /unauthorized/.test(error)) return '로그인이 만료됐어요. 다시 로그인한 뒤 시도하세요'
  return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
}

export default function Account() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'password' | 'social' | null>(null)
  const [password, setPassword] = useState('')
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setOpen(true); setError(''); setMode(null); setPassword(''); setWord('')
    try {
      const token = await freshToken()
      if (!token) return setError(deleteErrorText('unauthorized', 401))
      const me = await api<{ has_password?: boolean }>('/auth/me', { token })
      setMode(me.has_password === false ? 'social' : 'password')
    } catch (e) {
      setError(deleteErrorText(e instanceof ApiError ? e.message : 'network', e instanceof ApiError ? e.status : 0))
    }
  }
  const ready = mode === 'password' && !busy && word.trim() === DELETE_WORD && password.length > 0
  const submit = async () => {
    if (!ready) return
    setBusy(true); setError('')
    try {
      const token = await freshToken()
      if (!token) throw new ApiError('unauthorized', 401)
      await api('/auth/account', { method: 'DELETE', body: { password }, token })
      // 서버에서 지워졌다 → 로그아웃처럼 이 기기 데이터를 지우고 로그인 화면으로(세션은 서버에서 이미 없어짐)
      await logout()
      Alert.alert('계정을 삭제했어요', '모든 기기에서 데이터가 지워졌어요.', [{ text: '확인' }])
    } catch (e) {
      setBusy(false)
      setError(deleteErrorText(e instanceof ApiError ? e.message : 'network', e instanceof ApiError ? e.status : 0))
    }
  }
  const confirmLogout = () =>
    Alert.alert('로그아웃할까요?', '이 기기의 데이터가 지워져요. 다시 로그인하면 서버에서 내려받아요.', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => void logout() }
    ])

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="계정" left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} right={<View style={{ width: 40 }} />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 120 }}>
        <Cells>
          <Cell first label="이메일" value={user?.email} chevron={false} />
        </Cells>
        <Pressable accessibilityRole="button" onPress={confirmLogout} style={({ pressed }) => [s.btn, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
          <Text style={{ color: p.danger, fontSize: 16 }}>로그아웃</Text>
        </Pressable>

        {!open ? (
          <Pressable accessibilityRole="button" onPress={() => void start()} style={s.link}>
            <Text style={{ color: p.danger, fontSize: 14 }}>계정 삭제</Text>
          </Pressable>
        ) : (
          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            <Text style={[FONT.bodyStrong, { color: p.textPrimary }]}>계정을 삭제할까요?</Text>
            <Text style={[FONT.sub, { color: p.textSecondary }]}>모든 할 일·일기·수집함·캐릭터와 성장 기록이 서버와 모든 기기에서 지워져요. <Text style={{ fontWeight: '700' }}>되돌릴 수 없어요.</Text></Text>
            {!mode && !error ? <ActivityIndicator color={p.textTertiary} /> : null}
            {mode === 'social' ? <Text style={[FONT.sub, { color: p.textSecondary }]}>Google·Apple로만 가입한 계정은 본인 확인을 위해 컴퓨터 앱(설정 › 계정)에서 다시 로그인한 뒤 삭제할 수 있어요.</Text> : null}
            {mode === 'password' ? (
              <>
                <Text style={[FONT.meta, { color: p.textTertiary }]}>비밀번호</Text>
                <TextInput secureTextEntry autoComplete="current-password" textContentType="password" value={password} editable={!busy} onChangeText={setPassword} placeholder="비밀번호" placeholderTextColor={p.textQuaternary} style={[s.input, { color: p.textPrimary, borderColor: p.borderDivider }]} accessibilityLabel="비밀번호" />
                <Text style={[FONT.meta, { color: p.textTertiary }]}>{`확인하려면 "${DELETE_WORD}"를 입력하세요`}</Text>
                <TextInput value={word} editable={!busy} onChangeText={setWord} placeholder={DELETE_WORD} placeholderTextColor={p.textQuaternary} autoCapitalize="none" style={[s.input, { color: p.textPrimary, borderColor: p.borderDivider }]} accessibilityLabel="확인 단어" />
              </>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 13 }}>{error}</Text> : null}
            <View style={s.row}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setOpen(false); setError('') }} style={[s.small, { backgroundColor: p.bgSelected }]}>
                <Text style={{ color: p.textPrimary, fontSize: 15 }}>취소</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => void submit()} style={[s.small, { backgroundColor: ready ? p.danger : p.bgSelected }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: ready ? '#fff' : p.textQuaternary, fontSize: 15, fontWeight: '600' }}>계정 삭제</Text>}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  btn: { marginHorizontal: M.cardInset, marginTop: 4, height: 48, borderRadius: M.radiusCard, alignItems: 'center', justifyContent: 'center' },
  link: { alignItems: 'center', paddingVertical: 22 },
  card: { marginHorizontal: M.cardInset, marginTop: 18, borderRadius: M.radiusCard, padding: 16, gap: 10 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  small: { height: 40, minWidth: 96, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }
})
