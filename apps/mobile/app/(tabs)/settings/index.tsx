// 설정 탭(20 §2, 시안 I-1): 프로필 카드(아바타·이름·Lv·캐릭터) → 색 사각 아이콘 칸 → 빨간 로그아웃
// [다음] 일반(스와이프·완료음) 칸 — 해당 기능이 생길 때 붙인다
// 2026-10-05: 설정은 더보기 안 화면(머리 ‹ 뒤로) · 프로필 카드 → 계정(로그아웃·계정 삭제) · 날짜와 시간(주 시작 월요일 고정 · 휴일·음력·주 번호 — 06 §16) · 리스트 관리
import { useQuery, useStatus } from '@powersync/react-native'
import { progressFromEvents, SPECIES, type Species } from '@sprout/schema/growth'
import { useRouter } from 'expo-router'
import { CalendarDays, ChevronLeft, ChevronRight, Info, ListTree, Palette, RefreshCw } from 'lucide-react-native'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AvatarSheet } from '../../../src/avatar/AvatarSheet'
import { ProfileAvatar } from '../../../src/avatar/ProfileAvatar'
import { APP_VERSION } from '../../../src/config'
import { useAvatar } from '../../../src/data/avatar'
import { logout, syncNow, useAuth } from '../../../src/data/auth'
import { NotificationCell } from '../../../src/notifications/NotificationCell'
import { findTheme } from '../../../src/theme/themes'
import { M } from '../../../src/theme/palette'
import { usePalette, useTheme } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useToast } from '../../../src/ui/Toast'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'

function ago(d: Date | undefined): string {
  if (!d) return '아직 안 됨'
  const m = Math.round((Date.now() - d.getTime()) / 60000)
  return m < 1 ? '방금 전' : m < 60 ? `${m}분 전` : `${Math.round(m / 60)}시간 전`
}

export default function Settings() {
  const p = usePalette()
  const space = useTabBarSpace()
  const { themeId } = useTheme()
  const router = useRouter()
  const toast = useToast()
  const { user } = useAuth()
  const status = useStatus()
  const [syncing, setSyncing] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const avatar = useAvatar().resolved
  const events = useQuery<{ amount: number; created_at: string }>('SELECT amount, created_at FROM xp_events').data
  const ch = useQuery<{ species: Species | null }>('SELECT species FROM characters WHERE species IS NOT NULL LIMIT 1').data[0]
  const level = progressFromEvents(events).level
  const name = user?.email.split('@')[0] ?? ''
  const syncValue = syncing || status.dataFlowStatus?.downloading || status.dataFlowStatus?.uploading ? '동기화 중…'
    : status.dataFlowStatus?.uploadError || status.dataFlowStatus?.downloadError ? '실패 — 다시 시도하는 중'
    : !status.connected ? '오프라인' : ago(status.lastSyncedAt)
  const confirmLogout = () =>
    Alert.alert('로그아웃할까요?', '이 기기의 데이터가 지워져요. 다시 로그인하면 그대로 돌아와요.', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => void logout() }
    ])
  const white = { size: 18, color: '#fff' }
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="설정" left={<GlassButton label="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/more'))}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} right={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: space.pad }}>
        <Pressable accessibilityRole="button" accessibilityLabel="계정" onPress={() => router.push('/settings/account')} style={({ pressed }) => [s.prof, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
          {/* 35 §2: 아바타 = 고르기 시트, 카드 나머지 = 계정 화면 */}
          <Pressable accessibilityRole="button" accessibilityLabel="프로필 이미지 바꾸기" hitSlop={4} onPress={() => setAvatarOpen(true)}>
            <ProfileAvatar avatar={avatar} size={48} letter={name.slice(0, 1).toUpperCase()} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: p.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={{ fontSize: 12, color: p.textTertiary }} numberOfLines={1}>{user?.email}</Text>
            <View style={s.badges}>
              <Text style={[s.badge, { backgroundColor: p.accentSubtle, color: p.accent }]}>Lv {level}</Text>
              {ch?.species ? <Text style={[s.badge, { backgroundColor: p.accentSubtle, color: p.accent }]}>{SPECIES[ch.species].name}</Text> : null}
            </View>
          </View>
          <ChevronRight size={16} color={p.textQuaternary} />
        </Pressable>
        <Cells>
          <Cell first label="외관" value={findTheme(themeId)?.name} icon={<Palette {...white} />} iconBg="#775dbe" onPress={() => router.push('/settings/appearance')} />
          <NotificationCell />
          <Cell label="날짜와 시간" value="휴일 · 음력 · 주 번호" icon={<CalendarDays {...white} />} iconBg="#f29a2e" onPress={() => router.push('/settings/datetime')} />
          <Cell label="리스트 관리" value="스마트 목록 · 보관함" icon={<ListTree {...white} />} iconBg="#4e75f2" onPress={() => router.push('/lists/manage')} />
        </Cells>
        <Cells>
          <Cell
            first
            label="동기화"
            value={syncValue}
            icon={<RefreshCw {...white} />}
            iconBg="#8b8b8b"
            onPress={async () => { setSyncing(true); try { await syncNow() } finally { setSyncing(false) } toast.show('동기화했어요') }}
          />
          <Cell label="앱 정보" value={`v${APP_VERSION}`} icon={<Info {...white} />} iconBg="#8b8b8b" chevron={false} />
        </Cells>
        <Pressable accessibilityRole="button" onPress={confirmLogout} style={({ pressed }) => [s.out, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
          <Text style={{ color: p.danger, fontSize: 16 }}>로그아웃</Text>
        </Pressable>
      </ScrollView>
      <AvatarSheet visible={avatarOpen} onClose={() => setAvatarOpen(false)} letter={name.slice(0, 1).toUpperCase() || '?'} />
    </View>
  )
}
const s = StyleSheet.create({
  prof: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: M.radiusCard, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  badges: { flexDirection: 'row', gap: 4, marginTop: 4 },
  badge: { fontSize: 10.5, lineHeight: 16, fontWeight: '600', paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
  out: { marginHorizontal: M.cardInset, marginTop: 14, height: 48, borderRadius: M.radiusCard, alignItems: 'center', justifyContent: 'center' }
})
