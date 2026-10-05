// 설정 › 계정(08 §7.1 휴대폰판 — 틱틱 설정 › 계정 맨 아래 "계정 삭제"): 이메일 · 로그인 방법 · 로그아웃 · 계정 삭제.
// 로그인 방법(20 §4.3.1 = 08 §3.1.1 휴대폰판): 이메일 ✓ · Google [연결]/연결됨 [연결 해제] · Apple 준비 중.
// 계정 삭제 = DELETE /auth/account(서버가 다시 확인: 비밀번호 계정은 비밀번호, 구글·애플로만 가입한 계정은 10분 안 소셜 재로그인).
// 소셜 전용 계정은 데스크톱처럼 "Google로 방금 다시 로그인"(같은 계정이면 토큰만 바꿈). Apple로만 가입한 계정은 Apple 준비 전까지 컴퓨터 앱 안내.
// 문구·확인 단어("삭제")·오류 문구는 데스크톱 DeleteAccount·LoginMethods와 같다.
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  api, ApiError, freshToken, linkGoogle, loginMethods, logout, reauthWithGoogle, socialErrorText, unlinkProvider, useAuth,
  type LinkedIdentity, type LoginMethods, type Provider
} from '../../../src/data/auth'
import { AvatarSheet } from '../../../src/avatar/AvatarSheet'
import { ProfileAvatar } from '../../../src/avatar/ProfileAvatar'
import { useAvatar } from '../../../src/data/avatar'
import { FONT, M } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useToast } from '../../../src/ui/Toast'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'

const DELETE_WORD = '삭제'
const NAME: Record<Provider, string> = { google: 'Google', apple: 'Apple' }
function deleteErrorText(error: string, status: number): string {
  if (/invalid password/.test(error)) return '비밀번호가 맞지 않아요'
  if (/reauth required/.test(error)) return '보안을 위해 Google로 다시 로그인한 뒤 10분 안에 삭제해 주세요'
  if (status === 429 || /시도가 너무 많아요/.test(error)) return /분 뒤/.test(error) ? error : '잠시 뒤 다시 시도하세요'
  if (status === 401 || /unauthorized/.test(error)) return '로그인이 만료됐어요. 다시 로그인한 뒤 시도하세요'
  return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
}

export default function Account() {
  const p = usePalette()
  const space = useTabBarSpace()
  const scrollRef = useRef<ScrollView>(null)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollRef.current?.scrollToEnd({ animated: true }))
    return () => sub.remove()
  }, [])
  const router = useRouter()
  const toast = useToast()
  const { user } = useAuth()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const avatar = useAvatar().resolved
  const letter = (user?.email.slice(0, 1) ?? '?').toUpperCase()

  // ── 로그인 방법 ──
  const [methods, setMethods] = useState<LoginMethods | null>(null)
  const [methodsError, setMethodsError] = useState('')
  const [linking, setLinking] = useState<Provider | null>(null)
  const loadMethods = useCallback(async () => {
    setMethodsError('')
    try { setMethods(await loginMethods()) } catch (e) { setMethodsError(socialErrorText(e) ?? '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요') }
  }, [])
  useEffect(() => { void loadMethods() }, [loadMethods])
  const setIdentities = (identities: LinkedIdentity[]) => setMethods((m) => (m ? { ...m, identities } : m))
  const link = async () => {
    if (linking) return
    setLinking('google'); setMethodsError('')
    try {
      setIdentities(await linkGoogle())
      toast.show("구글 계정을 연결했어요 — 다음부터 'Google로 계속하기'로 들어올 수 있어요", { duration: 3500 })
    } catch (e) {
      const text = socialErrorText(e)
      if (text) setMethodsError(text)
    } finally { setLinking(null) }
  }
  const unlink = (provider: Provider) =>
    Alert.alert(`${NAME[provider]} 연결을 해제할까요?`, `다음부터 이 ${NAME[provider]} 계정으로는 이 계정에 들어올 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '연결 해제', style: 'destructive', onPress: async () => {
          setLinking(provider); setMethodsError('')
          try {
            setIdentities(await unlinkProvider(provider))
            toast.show(`${NAME[provider]} 연결을 해제했어요`)
          } catch (e) { setMethodsError(socialErrorText(e) ?? '') } finally { setLinking(null) }
        }
      }
    ])
  const methodRight = (provider: Provider) => {
    if (!methods) return methodsError ? null : <ActivityIndicator size="small" color={p.textTertiary} />
    const linked = methods.identities.find((i) => i.provider === provider)
    if (linking === provider) return <ActivityIndicator size="small" color={p.textTertiary} />
    if (linked) {
      const canUnlink = methods.hasPassword || methods.identities.some((i) => i.provider !== provider)
      return (
        <View style={s.methodRight}>
          <Text style={[FONT.sub, { color: p.textTertiary, flexShrink: 1 }]} numberOfLines={1}>{`연결됨${linked.email ? ` · ${linked.email}` : ''}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${NAME[provider]} 연결 해제`} accessibilityState={{ disabled: !canUnlink || !!linking }} disabled={!canUnlink || !!linking} onPress={() => unlink(provider)} hitSlop={8}>
            <Text style={{ color: p.danger, fontSize: 15, opacity: canUnlink && !linking ? 1 : 0.4 }}>연결 해제</Text>
          </Pressable>
        </View>
      )
    }
    if (provider === 'apple') return <Text style={[FONT.sub, { color: p.textTertiary }]}>준비 중</Text>
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Google 연결" disabled={!!linking} onPress={() => void link()} hitSlop={8}>
        <Text style={{ color: p.accent, fontSize: 15, fontWeight: '500', opacity: linking ? 0.4 : 1 }}>연결</Text>
      </Pressable>
    )
  }

  // ── 계정 삭제 ──
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'password' | 'google' | 'apple-only' | null>(null)
  const [password, setPassword] = useState('')
  const [word, setWord] = useState('')
  const [reauthed, setReauthed] = useState(false)
  const [reauthing, setReauthing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setOpen(true); setError(''); setMode(null); setPassword(''); setWord(''); setReauthed(false)
    try {
      const token = await freshToken()
      if (!token) return setError(deleteErrorText('unauthorized', 401))
      const me = await api<{ has_password?: boolean; providers?: string[] }>('/auth/me', { token })
      if (me.has_password !== false) return setMode('password')
      const providers = Array.isArray(me.providers) ? me.providers : []
      setMode(providers.includes('google') || !providers.includes('apple') ? 'google' : 'apple-only')
    } catch (e) {
      setError(deleteErrorText(e instanceof ApiError ? e.message : 'network', e instanceof ApiError ? e.status : 0))
    }
  }
  const reauth = async () => {
    if (reauthing || busy) return
    setReauthing(true); setError('')
    try {
      await reauthWithGoogle()
      setReauthed(true)
    } catch (e) {
      const text = socialErrorText(e)
      if (text) setError(text)
    } finally { setReauthing(false) }
  }
  const ready = !busy && word.trim() === DELETE_WORD && ((mode === 'password' && password.length > 0) || (mode === 'google' && reauthed))
  const submit = async () => {
    if (!ready) return
    setBusy(true); setError('')
    try {
      const token = await freshToken()
      if (!token) throw new ApiError('unauthorized', 401)
      await api('/auth/account', { method: 'DELETE', body: mode === 'password' ? { password } : {}, token })
      // 서버에서 지워졌다 → 로그아웃처럼 이 기기 데이터를 지우고 로그인 화면으로(세션은 서버에서 이미 없어짐)
      await logout()
      Alert.alert('계정을 삭제했어요', '모든 기기에서 데이터가 지워졌어요.', [{ text: '확인' }])
    } catch (e) {
      setBusy(false)
      const msg = e instanceof ApiError ? e.message : 'network'
      if (/reauth required/.test(msg)) setReauthed(false) // 10분 지남 → 다시 로그인부터
      setError(deleteErrorText(msg, e instanceof ApiError ? e.status : 0))
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
      {/* 삭제 확인 칸은 화면 아래쪽이라 키보드에 가린다 → 키보드만큼 안쪽 여백을 늘리고(iOS) 키보드가 올라오면 맨 아래(입력·삭제 버튼)로 내린다(20 §3.1) */}
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingTop: 6, paddingBottom: space.pad }}>
        {/* 35 §2: 맨 위 아바타 + "프로필 이미지 바꾸기" → 고르기 시트 */}
        <Pressable accessibilityRole="button" accessibilityLabel="프로필 이미지 바꾸기" onPress={() => setAvatarOpen(true)} style={s.avatar}>
          <ProfileAvatar avatar={avatar} size={64} letter={letter} />
          <Text style={{ color: p.accent, fontSize: 15, marginTop: 8 }}>프로필 이미지 바꾸기</Text>
        </Pressable>
        <Cells>
          <Cell first label="이메일" value={user?.email} chevron={false} />
        </Cells>
        <Cells title="로그인 방법">
          <Cell first label="이메일" chevron={false} right={methods ? <Text style={[FONT.sub, { color: p.textTertiary }]}>{methods.hasPassword ? '✓ 비밀번호 있음' : '비밀번호 없음'}</Text> : null} />
          <Cell label="Google" chevron={false} right={methodRight('google')} />
          <Cell label="Apple" chevron={false} right={methodRight('apple')} />
        </Cells>
        {methodsError ? (
          <View style={s.methodsError}>
            <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 13, flex: 1 }}>{methodsError}</Text>
            {!methods ? <Pressable accessibilityRole="button" onPress={() => void loadMethods()} hitSlop={8}><Text style={{ color: p.accent, fontSize: 13, fontWeight: '500' }}>다시 시도</Text></Pressable> : null}
          </View>
        ) : null}
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
            {mode === 'apple-only' ? <Text style={[FONT.sub, { color: p.textSecondary }]}>Apple로만 가입한 계정은 지금은 컴퓨터 앱(설정 › 계정)에서 삭제할 수 있어요.</Text> : null}
            {mode === 'password' ? (
              <>
                <Text style={[FONT.meta, { color: p.textTertiary }]}>비밀번호</Text>
                <TextInput secureTextEntry autoComplete="current-password" textContentType="password" value={password} editable={!busy} onChangeText={setPassword} placeholder="비밀번호" placeholderTextColor={p.textQuaternary} style={[s.input, { color: p.textPrimary, borderColor: p.borderDivider }]} accessibilityLabel="비밀번호" />
              </>
            ) : null}
            {mode === 'google' ? (
              reauthed ? (
                <Text style={[FONT.sub, { color: p.textSecondary }]}>다시 로그인했어요. 10분 안에 삭제하세요.</Text>
              ) : (
                <Pressable accessibilityRole="button" disabled={reauthing || busy} onPress={() => void reauth()} style={({ pressed }) => [s.reauth, { borderColor: p.borderDivider, backgroundColor: pressed ? p.bgSelected : 'transparent' }]}>
                  {reauthing ? <ActivityIndicator color={p.textSecondary} /> : <Text style={{ color: p.textPrimary, fontSize: 15, fontWeight: '500' }}>Google로 방금 다시 로그인</Text>}
                </Pressable>
              )
            ) : null}
            {mode === 'password' || mode === 'google' ? (
              <>
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
      <AvatarSheet visible={avatarOpen} onClose={() => setAvatarOpen(false)} letter={letter} />
    </View>
  )
}
const s = StyleSheet.create({
  avatar: { alignItems: 'center', paddingTop: 10, paddingBottom: 16 },
  btn: { marginHorizontal: M.cardInset, marginTop: 4, height: 48, borderRadius: M.radiusCard, alignItems: 'center', justifyContent: 'center' },
  link: { alignItems: 'center', paddingVertical: 22 },
  card: { marginHorizontal: M.cardInset, marginTop: 18, borderRadius: M.radiusCard, padding: 16, gap: 10 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  reauth: { height: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  small: { height: 40, minWidth: 96, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  methodRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  methodsError: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: M.cardInset + 14, marginTop: -4, marginBottom: 10 }
})
