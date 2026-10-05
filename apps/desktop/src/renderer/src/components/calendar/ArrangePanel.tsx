import { useEffect, useRef, useState } from 'react'
import { Filter, X } from 'lucide-react'
import { dayKey } from '../../lib/dates'
import { MenuItem, Popover } from '../Popover'
import { useQuery } from '../../data/useQuery'
import { TASK_COLUMNS } from '../../data/taskQueries'
import type { ListRow, TagRow, TaskRow } from '../../data/types'
import type { TaskActions } from '../../lib/taskActions'
import { calendarDropAt, outsideDrag, scheduledDrop } from '../../lib/calendarDrop'
import { dragSession } from './dragSession'
export function ArrangePanel({lists,tags,actions,onClose}:{lists:ListRow[];tags:TagRow[];actions:TaskActions;onClose:()=>void}){
 const [group,setGroup]=useState('list')
 const [noDate,setNoDate]=useState(true)
 const [overdue,setOverdue]=useState(false)
 const [filterOpen,setFilterOpen]=useState(false)
 const [collapsed,setCollapsed]=useState<string[]>([])
 const filterBtn=useRef<HTMLButtonElement>(null)
 const [filter,setFilter]=useState('')
 const [ghost,setGhost]=useState<{id:string;title:string;color:string;x:number;y:number;w:number;hidden:boolean}>()
 const [error,setError]=useState('')
 const cleanup=useRef<()=>void>(()=>{})
 useEffect(()=>()=>cleanup.current(),[])
 const rows=useQuery<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id=t.list_id WHERE t.status=0 AND t.deleted_at IS NULL AND (${noDate?'t.due_at IS NULL':'0'} OR ${overdue?'substr(t.due_at,1,10) < ?':'0'}) AND l.archived_at IS NULL ${filter?'AND t.list_id=?':''} ORDER BY t.sort_order`,[...(overdue?[dayKey()]:[]),...(filter?[filter]:[])])??[]
 const groups=group==='list'?lists.map(l=>({id:l.id,name:l.name,items:rows.filter(t=>t.list_id===l.id)})):group==='tag'?[...tags.map(t=>({id:t.id,name:t.name,items:rows.filter(r=>r.tag_ids?.split(',').includes(t.id))})),{id:'none',name:'태그 없음',items:rows.filter(r=>!r.tag_ids)}]:[3,2,1,0].map(p=>({id:String(p),name:['우선순위 없음','낮은 우선순위','중간 우선순위','높은 우선순위'][p],items:rows.filter(r=>r.priority===p)}))
 // 06 §9 끌어서 일정 잡기(틱틱 실측 research 17 §끌기): 행과 같은 모양의 막대가 잡은 자리 그대로 포인터를 따라가고(원래 행은 옅게),
 // 주·일 시간 칸·종일 영역 위에서는 캘린더가 놓일 칸에 붙은 미리 보기를 그리므로 떠 있는 막대를 숨긴다. 월 칸은 칸을 칠한다. Esc = 취소
 const start=(e:React.PointerEvent,t:TaskRow)=>{
  if(e.button!==0)return
  e.preventDefault();cleanup.current()
  const r=(e.currentTarget as HTMLElement).getBoundingClientRect()
  const x0=e.clientX,y0=e.clientY,offX=x0-r.left,offY=y0-r.top
  let active=false
  const finish=()=>{setGhost(undefined);outsideDrag.set(undefined)}
  const end=dragSession({
   onMove:(ev)=>{
    if(!active&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<=4)return
    active=true
    const target=calendarDropAt(ev.clientX,ev.clientY)
    outsideDrag.set({task:t,target})
    setGhost({id:t.id,title:t.title||'제목 없음',color:t.list_color??'var(--color-accent)',x:ev.clientX-offX,y:ev.clientY-offY,w:r.width,hidden:target?.zone==='grid'||target?.zone==='allday'})
   },
   onUp:(ev)=>{finish();if(!active)return;const target=calendarDropAt(ev.clientX,ev.clientY);if(target)void actions.reschedule([scheduledDrop(t,target)]).catch(()=>setError('배치하지 못했어요. 다시 시도해 주세요.'))},
   onCancel:finish
  })
  cleanup.current=()=>{end();finish()}
 }
 return <aside className="arrange-panel"><header><h2>할일 정렬</h2><button ref={filterBtn} className="icon-btn" aria-label="배치 필터" onClick={()=>setFilterOpen(!filterOpen)}><Filter/></button><button className="icon-btn" aria-label="배치 패널 닫기" onClick={onClose}><X/></button></header><div className="arrange-tabs">{[['list','목록'],['tag','태그'],['priority','우선 순위']].map(([id,label])=><button key={id} className={group===id?'is-active':''} onClick={()=>setGroup(id)}>{label}</button>)}</div><select aria-label="배치할 리스트" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">모든 리스트</option>{lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><div className="arrange-scroll">{groups.filter(g=>g.items.length).map(g=><section key={g.id}><h3><button aria-expanded={!collapsed.includes(g.id)} onClick={()=>setCollapsed(v=>v.includes(g.id)?v.filter(id=>id!==g.id):[...v,g.id])}>{collapsed.includes(g.id)?"›":"⌄"} {g.name}</button><small>{g.items.length}</small></h3>{!collapsed.includes(g.id)&&g.items.map(t=><div key={t.id} className={`arrange-task${ghost?.id===t.id?' is-drag-source':''}`} onPointerDown={e=>start(e,t)} style={{background:t.list_color??'var(--color-accent)'}}>{t.title||'제목 없음'}</div>)}</section>)}{!rows.length&&<p className="entry-empty">조건에 맞는 할 일이 없어요</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>{filterOpen&&<Popover anchor={filterBtn.current} align="end" width={180} className="menu" onClose={()=>setFilterOpen(false)}><MenuItem label="날짜 없음" trail={noDate?"✓":undefined} onClick={()=>setNoDate(!noDate)}/><MenuItem label="만료됨" trail={overdue?"✓":undefined} onClick={()=>setOverdue(!overdue)}/></Popover>}{ghost&&!ghost.hidden&&<div className="arrange-task arrange-ghost" style={{left:ghost.x,top:ghost.y,width:ghost.w,background:ghost.color}}>{ghost.title}</div>}</aside>
}
