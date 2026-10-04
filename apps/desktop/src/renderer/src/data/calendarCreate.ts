import { insert, run, uuid } from './mutations'
import type { Schedule } from '../lib/taskActions'
/** One write boundary: a calendar item must never exist without its selected range/reminders. */
export async function createCalendarTask(title:string,listId:string,priority:number,schedule:Schedule,content=''){
 if(!title.trim())throw new Error('제목을 입력해 주세요.')
 if(!schedule.due_at)throw new Error('날짜를 선택해 주세요.')
 const id=uuid()
 await run(insert('tasks',{id,title:title.trim(),list_id:listId,content,content_mode:'text',status:0,priority,sort_order:-Date.now(),...{start_at:schedule.start_at,due_at:schedule.due_at,is_all_day:schedule.is_all_day,time_zone:'floating',repeat_rule:schedule.repeat_rule,repeat_from:schedule.repeat_from}}),...schedule.reminders.map(trigger=>insert('reminders',{id:uuid(),task_id:id,trigger})))
 return id
}
