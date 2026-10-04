import { LOCAL_OWNER } from './index'

// 첫 실행 데이터. 기본함은 항상 만든다(01-app-shell §4.1). withDemo면 틱틱 8.0 캡처와 같은 구성의 예시 데이터를 더한다.
// 앱(메인 프로세스)과 브라우저 미리보기가 같은 문장을 실행한다.
export type Stmt = { sql: string; params: unknown[] }

export function seedStatements(withDemo: boolean, now = new Date()): Stmt[] {
  const iso = now.toISOString()
  const base = { owner_id: LOCAL_OWNER, created_at: iso, modified_at: iso }
  const out: Stmt[] = []
  const id = () => globalThis.crypto.randomUUID()
  const day = (offset: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const insert = (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row)
    out.push({ sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, params: Object.values(row) })
  }

  const inboxId = id()
  insert('lists', { id: inboxId, ...base, name: '기본함', kind: 'inbox', sort_order: 0, pinned: 0, show_in_smart: 'all' })
  if (!withDemo) return out

  const list = (name: string, emoji: string, color: string | null, order: number) => {
    const listId = id()
    insert('lists', { id: listId, ...base, name, emoji, color, kind: 'normal', sort_order: order, pinned: 0, show_in_smart: 'all' })
    return listId
  }
  const work = list('업무', '💼', '#7F9EC7', 1)
  const family = list('가족', '🏠', '#E4C79A', 2)
  const personal = list('개인', '💖', '#958CAE', 3)
  list('독서', '📚', null, 4)
  list('이달의 목표', '🎯', null, 5)
  const tagId = id()
  insert('tags', { id: tagId, ...base, name: '중요', color: '#D6828A', sort_order: 0, pinned: 0 })

  let order = 0
  const task = (title: string, listId: string, due: string | null, priority = 0, tagged = false) => {
    const taskId = id()
    insert('tasks', {
      id: taskId, ...base, list_id: listId, title, content: '', content_mode: 'text', status: 0, priority,
      due_at: due, is_all_day: due && due.includes('T') ? 0 : 1, time_zone: 'floating', sort_order: order++
    })
    if (tagged) insert('task_tags', { id: id(), ...base, task_id: taskId, tag_id: tagId })
  }
  task('팀 회의', work, day(-3))
  task('칫솔 교체', family, day(-2))
  task('v8.0 콘텐츠 준비', work, day(-1), 3, true)
  task('기념일 편지 마무리', personal, day(-1), 2)
  task('아침 스트레칭', personal, `${day(0)}T07:30`)
  task('안약 넣기', personal, `${day(0)}T15:00`, 1, true)
  task('주간 계획', work, day(0))
  task('장보기', family, day(1))
  task('이사 준비', inboxId, day(9))
  task('여름 여행 계획', inboxId, day(40))
  task('문서 업데이트', inboxId, null)
  return out
}
