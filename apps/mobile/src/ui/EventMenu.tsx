// 일정 길게 누름 메뉴(20 §7.1 — 06 §14.4.4 우클릭 메뉴의 휴대폰판): 열기 · 할 일로 바꾸기 · 복제 · 삭제.
// 캘린더·오늘 목록이 같이 쓴다. 바꾸기·복제·삭제는 토스트 ⟲.
import { useRouter } from 'expo-router'
import { ArrowRightLeft, Copy, ExternalLink, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { convertEventToTask, convertTaskToEvent, deleteEvent, duplicateEvent } from '../data/calEvents'
import { dayKey } from '../lib/dates'
import { eventIdOf } from '../data/eventsModel'
import { usePalette } from '../theme/ThemeProvider'
import { PopMenu, type Rect } from './Menu'
import { useToast } from './Toast'

export function useEventActions() {
  const router = useRouter()
  const toast = useToast()
  return {
    open: (id: string) => router.push(`/event/${eventIdOf(id)}`),
    toTask: async (id: string) => {
      try {
        const r = await convertEventToTask(id)
        if (r) toast.show('할 일로 바꿨어요', { undo: r.undo })
      } catch {
        toast.show('바꾸지 못했어요. 다시 시도해 주세요')
      }
    },
    duplicate: async (id: string) => toast.show('일정을 복제했어요', { undo: await duplicateEvent(id) }),
    /** 할 일 → 일정(06 §14.4.6). 하위 할 일이 있으면 바꾸지 않는다. 돌려주는 값 = 새 일정 id */
    fromTask: async (taskId: string): Promise<string | null> => {
      try {
        const r = await convertTaskToEvent(taskId, dayKey())
        if (r === 'has-children') { toast.show('하위 할 일이 있어서 바꿀 수 없어요'); return null }
        if (!r) return null
        toast.show('일정으로 바꿨어요', { undo: r.undo })
        return r.id
      } catch {
        toast.show('바꾸지 못했어요. 다시 시도해 주세요')
        return null
      }
    },
    remove: async (id: string) => toast.show('일정을 삭제했어요', { undo: await deleteEvent(id), duration: 5000 })
  }
}

export function useEventMenu() {
  const p = usePalette()
  const act = useEventActions()
  const win = useWindowDimensions()
  const [menu, setMenu] = useState<{ id: string; rect: Rect } | null>(null)
  const element = (
    <PopMenu
      anchor={menu?.rect ?? null}
      onClose={() => setMenu(null)}
      width={220}
      align="left"
      items={menu ? [
        { key: 'open', label: '열기', icon: <ExternalLink size={18} color={p.textSecondary} />, onPress: () => act.open(menu.id) },
        { key: 'toTask', label: '할 일로 바꾸기', icon: <ArrowRightLeft size={18} color={p.textSecondary} />, onPress: () => void act.toTask(menu.id) },
        { key: 'dup', label: '복제', icon: <Copy size={18} color={p.textSecondary} />, onPress: () => void act.duplicate(menu.id) },
        { key: 'del', label: '삭제', danger: true, icon: <Trash2 size={18} color={p.danger} />, onPress: () => void act.remove(menu.id) }
      ] : []}
    />
  )
  // 왼쪽 맞춤 메뉴가 화면 오른쪽 밖으로 나가지 않게(3일 보기 오른쪽 열 블록)
  return { openMenu: (id: string, rect: Rect) => setMenu({ id, rect: { ...rect, x: Math.min(rect.x, win.width - 220 - 12) } }), element, act }
}
