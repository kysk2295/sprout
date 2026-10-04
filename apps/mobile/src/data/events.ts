// 앱 안 신호(데스크톱의 window 'sprout:xp'·'sprout:task-done'과 같은 뜻)
// - xp: XP가 들어오면 탭 바 성장 아이콘 위 "+1"(21 §3)
// - taskDone: 어디서든 할 일을 끝내면 — 성장 캐릭터 반응용(10 §3.2). 성장 탭(다음 작업)이 구독한다.
type Handler<T> = (value: T) => void
function channel<T>() {
  const hs = new Set<Handler<T>>()
  return {
    emit: (v: T) => hs.forEach((h) => h(v)),
    on: (h: Handler<T>) => { hs.add(h); return () => { hs.delete(h) } }
  }
}
export const xpGained = channel<number>()
export const taskDone = channel<{ ids: string[] }>()
