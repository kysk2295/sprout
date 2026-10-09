// 리스트 관리(서랍 아래 관리 아이콘 — 시안 C-1 "관리", 04 설정 스마트 목록 · 05 보관 목록):
// 스마트 목록 표시(보이기 · 숨기기 · 비어 있지 않으면 표시 — 데스크톱 설정과 같은 user_prefs 값, 기본함은 항상) + 보관된 리스트(복원 · 삭제).
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useState } from 'react'
import { Alert, ScrollView, Text, View, type GestureResponderEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { archiveList, deleteList, setSmartVisibility, useArchivedLists, useSmartVisibility } from '../../src/data/organization'
import { VISIBILITY_KEYS, type Visibility } from '../../src/data/views'
import { FONT, M } from '../../src/theme/palette'
import { usePalette } from '../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../src/ui/Cells'
import { GlassButton } from '../../src/ui/Glass'
import { NavRow } from '../../src/ui/Header'
import { PopMenu, type Rect } from '../../src/ui/Menu'
import { useToast } from '../../src/ui/Toast'

const VIS_LABEL: Record<Visibility, string> = { show: '보이기', hide: '숨기기', auto: '비어 있지 않으면 표시' }

export default function ManageLists() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const vis = useSmartVisibility()
  const archived = useArchivedLists()
  const [menu, setMenu] = useState<{ rect: Rect; id: string } | null>(null)
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} title="리스트 관리" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Cells title="스마트 목록">
          {VISIBILITY_KEYS.map(([id, label], i) => (
            <Cell
              key={id}
              first={i === 0}
              label={label}
              value={id === 'inbox' ? '항상 표시' : VIS_LABEL[vis[id] ?? 'show']}
              chevron={id !== 'inbox'}
              onPress={id === 'inbox' ? undefined : (e?: GestureResponderEvent) => setMenu({ rect: { x: 0, y: e?.nativeEvent.pageY ?? 200, width: 10000, height: 0 }, id })}
            />
          ))}
        </Cells>
        <Cells title={`보관된 리스트 ${archived.length}`}>
          {archived.length ? archived.map((l, i) => (
            <Cell
              key={l.id}
              first={i === 0}
              label={`${l.emoji ? `${l.emoji} ` : ''}${l.name}`}
              chevron={false}
              right={
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Text accessibilityRole="button" onPress={() => void archiveList(l.id, false).then(() => toast.show(`"${l.name}"을(를) 복원했어요`))} style={{ color: p.accentInk, fontSize: 15 }}>복원</Text>
                  <Text
                    accessibilityRole="button"
                    onPress={() => Alert.alert(`"${l.name}" 리스트를 삭제할까요?`, '안의 할 일은 휴지통으로 옮겨져요.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void deleteList(l.id) }])}
                    style={{ color: p.danger, fontSize: 15 }}
                  >삭제</Text>
                </View>
              }
            />
          )) : <Cell first label="보관된 리스트가 없어요" chevron={false} />}
        </Cells>
        <Text style={[FONT.meta, { color: p.textTertiary, paddingHorizontal: M.cardInset + 14 }]}>보관한 리스트의 할 일은 스마트 목록·캘린더에 보이지 않아요. 리스트를 보관하려면 서랍에서 리스트를 길게 누르세요.</Text>
      </ScrollView>
      <PopMenu
        anchor={menu?.rect ?? null}
        onClose={() => setMenu(null)}
        width={240}
        items={(['show', 'hide', 'auto'] as Visibility[]).map((v) => ({ key: v, label: VIS_LABEL[v], checked: (vis[menu?.id ?? ''] ?? 'show') === v, onPress: () => void setSmartVisibility(menu!.id, v) }))}
      />
    </View>
  )
}
