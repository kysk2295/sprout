// 로그인·가입(08 A안을 휴대폰 배치로 — 시안 A-1·A-2): 좌우 24, 입력·버튼 폭 꽉 참, 같은 문구·같은 오류 6종(08 §4).
// 이메일 → 비밀번호 → 보내기 키 = 제출. 버튼 안 스피너 = 로딩(입력 잠금). 전환할 때 이메일은 유지.
// 20 §4.3.1: 주 버튼 아래 구분선 → iOS "Apple로 계속하기"(준비 중) · "Google로 계속하기", Android는 Google만.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Lock, Mail, Sprout } from 'lucide-react-native'
import { useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { authErrorText, login, loginWithGoogle, signup, socialErrorText } from '../data/auth'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { AppleMark, GoogleMark } from '../ui/BrandMarks'
import { GlassButton } from '../ui/Glass'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const [email, setEmail] = useState(params.email ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [social, setSocial] = useState<'google' | null>(null) // 기기 구글 창이 열려 있는 동안
  const [error, setError] = useState<{ field: 'email' | 'password' | 'form'; text: string } | null>(null)
  const [focus, setFocus] = useState<'email' | 'password' | null>(null)
  const pw = useRef<TextInput>(null)
  const signupMode = mode === 'signup'
  const locked = busy || !!social

  const continueWithGoogle = async () => {
    if (locked) return
    setSocial('google')
    setError(null)
    try {
      await loginWithGoogle()
    } catch (e) {
      const text = socialErrorText(e)
      if (text) setError({ field: 'form', text })
      setSocial(null)
    }
  }
  // Apple 개발자 계정 전 [임시]: 버튼만 보이고 누르면 안내(20 §4.3.1)
  const continueWithApple = () => { if (!locked) setError({ field: 'form', text: 'Apple 로그인은 준비 중이에요. Google이나 이메일로 계속하세요.' }) }

  const submit = async () => {
    if (locked) return
    if (!EMAIL.test(email.trim())) return setError({ field: 'email', text: '이메일 주소를 확인하세요' })
    if (signupMode && (password.length < 6 || password.length > 64)) return setError({ field: 'password', text: '비밀번호는 6-64자로 입력하세요' })
    if (!password) return setError({ field: 'password', text: '이메일 또는 비밀번호가 맞지 않아요' })
    setBusy(true)
    setError(null)
    try {
      await (signupMode ? signup : login)(email, password)
    } catch (e) {
      const text = authErrorText(e)
      setError({ field: /이메일 주소|이미 가입/.test(text) ? 'email' : /비밀번호는/.test(text) ? 'password' : 'form', text })
      setBusy(false)
    }
  }
  const input = (field: 'email' | 'password') => ({
    backgroundColor: p.loginCard,
    borderColor: focus === field ? p.accent : error?.field === field ? p.danger : p.loginInputBorder
  })
  const err = (field: 'email' | 'password' | 'form') => (error?.field === field ? <Text style={[s.err, { color: p.danger }]}>{error.text}</Text> : null)

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: p.loginBg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, { paddingTop: insets.top + (signupMode ? 0 : 28), paddingBottom: insets.bottom + 20 }]}>
        {signupMode ? (
          <View style={s.nav}>
            <GlassButton label="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/login', params: { email } }))}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
          </View>
        ) : (
          <View style={[s.logo, { backgroundColor: p.accent }]}><Sprout size={32} color="#fff" /></View>
        )}
        <Text style={[FONT.large, { color: p.textPrimary, marginBottom: 6 }]}>{signupMode ? '등록하기' : '로그인'}</Text>
        <Text style={[FONT.sub, { color: p.textSecondary, marginBottom: 26 }]}>
          {signupMode ? '이메일과 비밀번호만 있으면 돼요.' : '컴퓨터와 같은 계정으로 들어가면\n할 일과 캐릭터가 그대로 이어져요.'}
        </Text>
        <View style={s.stack}>
          <View style={[s.input, input('email')]}>
            <Mail size={18} color={p.textTertiary} />
            <TextInput
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null) }}
              placeholder="이메일"
              placeholderTextColor={p.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              editable={!locked}
              onFocus={() => setFocus('email')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={() => pw.current?.focus()}
              style={[s.text, { color: p.textPrimary }]}
              accessibilityLabel="이메일"
            />
          </View>
          {err('email')}
          <View style={[s.input, input('password')]}>
            <Lock size={18} color={p.textTertiary} />
            <TextInput
              ref={pw}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null) }}
              placeholder="비밀번호"
              placeholderTextColor={p.textTertiary}
              secureTextEntry
              textContentType={signupMode ? 'newPassword' : 'password'}
              autoComplete={signupMode ? 'new-password' : 'password'}
              returnKeyType="go"
              editable={!locked}
              onFocus={() => setFocus('password')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={submit}
              style={[s.text, { color: p.textPrimary }]}
              accessibilityLabel="비밀번호"
            />
          </View>
          {err('password') ?? (signupMode ? <Text style={[s.err, { color: p.textTertiary }]}>비밀번호: 6-64자</Text> : null)}
          {err('form')}
          <Pressable accessibilityRole="button" accessibilityLabel={signupMode ? '등록하기' : '로그인'} disabled={locked} onPress={submit} style={({ pressed }) => [s.btn, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{signupMode ? '등록하기' : '로그인'}</Text>}
          </Pressable>
          <View style={[s.divider, { backgroundColor: p.loginInputBorder }]} />
          {Platform.OS === 'ios' ? (
            <SocialButton label="Apple로 계속하기" soon disabled={locked} onPress={continueWithApple} icon={<AppleMark color={p.textPrimary} />} />
          ) : null}
          <SocialButton label="Google로 계속하기" waiting={social === 'google'} disabled={locked} onPress={() => void continueWithGoogle()} icon={<GoogleMark />} />
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => (signupMode ? router.replace({ pathname: '/login', params: { email } }) : router.push({ pathname: '/signup', params: { email } }))}
          style={s.switch}
        >
          <Text style={[FONT.sub, { color: p.textSecondary, textAlign: 'center' }]}>
            {signupMode ? '이미 계정이 있으신가요? ' : '계정이 없으세요? '}
            <Text style={{ color: p.accent, fontWeight: '500' }}>{signupMode ? '로그인' : '등록하기'}</Text>
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {signupMode ? (
          <Text style={[s.terms, { color: p.textTertiary }]}>
            가입함으로써 <Text style={{ textDecorationLine: 'underline', color: p.textSecondary }}>이용 약관</Text> 및 <Text style={{ textDecorationLine: 'underline', color: p.textSecondary }}>개인정보 처리방침</Text>에{'\n'}동의하게 됩니다.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
/** 20 §4.3.1 소셜 버튼: 폭 꽉 참 · 높이 50 · 테두리 · 로고 18. soon = Apple 준비 중(흐림 + "준비 중") */
function SocialButton({ label, icon, onPress, disabled, waiting, soon }: { label: string; icon: ReactNode; onPress: () => void; disabled?: boolean; waiting?: boolean; soon?: boolean }) {
  const p = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={soon ? `${label}, 준비 중` : label}
      accessibilityState={{ disabled: !!disabled, busy: !!waiting }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.social, { backgroundColor: pressed ? p.bgSelected : p.loginCard, borderColor: p.loginInputBorder, opacity: soon || (disabled && !waiting) ? 0.5 : 1 }]}
    >
      {waiting ? <ActivityIndicator color={p.textSecondary} /> : icon}
      <Text style={[s.socialText, { color: p.textPrimary }]}>{label}</Text>
      {soon ? <Text style={[s.soon, { color: p.textTertiary }]}>준비 중</Text> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 24 },
  nav: { height: 52, justifyContent: 'center', marginLeft: -12, marginBottom: 6 },
  logo: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  stack: { gap: 12 },
  input: { height: 50, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  text: { flex: 1, fontSize: 16, height: '100%' },
  err: { fontSize: 13, lineHeight: 18, marginTop: -4, marginHorizontal: 2 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth * 2, marginVertical: 6 },
  social: { height: 50, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  socialText: { fontSize: 16, fontWeight: '500' },
  soon: { position: 'absolute', right: 14, fontSize: 12 },
  switch: { marginTop: 18, paddingVertical: 6 },
  terms: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 10, marginTop: 20 }
})
