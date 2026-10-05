import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Flag, Inbox, Plus, Search, X } from 'lucide-react'
import { linkMoveTarget, parseAdd } from '../lib/addParse'
import { WikiComplete } from './wiki/WikiComplete'
import { ro } from '../lib/josa'
import { useToast } from './Toast'
import { dayKey, detailDateLabel } from '../lib/dates'
import { ensureTags } from '../data/organization'
import { getDb } from '../data/db'
import { insert, run, update, uuid } from '../data/mutations'
import type { ListRow, TagRow } from '../data/types'
import { Dialog } from './Dialog'
import { DatePicker, EMPTY_SCHEDULE } from './DatePicker'
import type { Schedule } from '../lib/taskActions'

export interface Command { id: string; label: string; key?: string; group: string; run: () => void }
export function CommandMenu({ commands, onSearch, onClose }: { commands: Command[]; onSearch: (query: string) => void; onClose: () => void }) {
  const [query,setQuery] = useState('')
  const [index,setIndex] = useState(0)
  const results = commands.filter((c) => c.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  if (query.trim()) results.push({id:'search-query',label:`“${query.trim()}” 검색`,group:'검색',run:() => onSearch(query.trim())})
  const choose = (c: Command) => { onClose(); c.run() }
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'}) },[index])
  return <Dialog label="명령 메뉴" className="command-dialog" onClose={onClose}>
    <div className="command-input"><input data-autofocus spellCheck={false} placeholder="명령어를 입력하거나 검색하세요." value={query} onChange={(e) => {setQuery(e.target.value);setIndex(0)}} role="combobox" aria-expanded aria-controls="command-results" aria-activedescendant={results[index] ? `cmd-${results[index].id}` : undefined} onKeyDown={(e) => { if(e.nativeEvent.isComposing)return; if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){e.preventDefault();setIndex((i)=>(i+(e.key==='ArrowDown'?1:-1)+results.length)%results.length)} if(e.key==='Enter' && results[index]){e.preventDefault();choose(results[index])} }}/><kbd>⌘K</kbd></div>
    <div ref={root} id="command-results" role="listbox" className="command-results">{results.map((c,i) => <div key={c.id}>{(i===0 || results[i-1].group!==c.group) && <div className="command-group">{c.group}</div>}<button id={`cmd-${c.id}`} role="option" aria-selected={index===i} className={index===i?'is-active':''} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(c)}><span>{c.label}</span><kbd>{c.key}</kbd></button></div>)}</div>
  </Dialog>
}
interface SearchResult { id: string; title: string; subtitle: string; kind: 'task'|'list'|'tag'|'filter'|'event'; status?: number; /** 일정(event)이면 시작 시각(UNION 칸 이름을 같이 쓴다) */ list_id?: string }
export function SearchDialog({ initial='', onClose, onPick }: { initial?:string;onClose:()=>void;onPick:(r:SearchResult)=>void }) {
  const [query,setQuery]=useState(initial)
  const [rows,setRows]=useState<SearchResult[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [index,setIndex]=useState(0)
  useEffect(()=>{
    let alive=true
    setIndex(0);setError('');setRows([])
    const q=query.trim()
    if(!q){setLoading(false);return}
    setLoading(true)
    const timer=setTimeout(async()=>{
      try {
        const like=`%${q.replace(/[\\%_]/g,'\\$&')}%`
        const db=await getDb()
        const result=await db.getAll<SearchResult>(`SELECT t.id, t.title, COALESCE(l.name,'') AS subtitle, 'task' AS kind, t.status, t.list_id FROM tasks t LEFT JOIN lists l ON l.id=t.list_id WHERE t.deleted_at IS NULL AND (t.title LIKE ? ESCAPE '\\' OR t.content LIKE ? ESCAPE '\\')
          UNION ALL SELECT id,name,'리스트','list',NULL,NULL FROM lists WHERE archived_at IS NULL AND name LIKE ? ESCAPE '\\'
          UNION ALL SELECT id,name,'태그','tag',NULL,NULL FROM tags WHERE name LIKE ? ESCAPE '\\'
          UNION ALL SELECT id,name,'필터','filter',NULL,NULL FROM filters WHERE name LIKE ? ESCAPE '\\'
          UNION ALL SELECT id,title,'일정 · '||CAST(CAST(substr(start_at,6,2) AS INTEGER) AS TEXT)||'월 '||CAST(CAST(substr(start_at,9,2) AS INTEGER) AS TEXT)||'일','event',NULL,start_at FROM events WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\') LIMIT 100`,[like,like,like,like,like,like,like,like])
        if(alive)setRows(result)
      }catch{if(alive)setError('검색하지 못했어요. 검색어를 다시 입력해 주세요.')}
      finally{if(alive)setLoading(false)}
    },120)
    return()=>{alive=false;clearTimeout(timer)}
  },[query])
  const choose=(r:SearchResult)=>{onClose();onPick(r)}
  return <Dialog label="검색" className="search-dialog" onClose={onClose}>
    <div className="command-input"><Search size={18}/><input data-autofocus spellCheck={false} placeholder="검색" value={query} onChange={(e)=>setQuery(e.target.value)} role="combobox" aria-expanded aria-controls="search-results" aria-activedescendant={rows[index]?`search-${index}`:undefined} onKeyDown={(e)=>{if(e.nativeEvent.isComposing)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setIndex((i)=>Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1))))}if(e.key==='Enter'&&rows[index])choose(rows[index])}}/><button className="icon-btn" aria-label="검색 닫기" onClick={onClose}><X/></button></div>
    <div className="command-results" id="search-results" role="listbox" aria-busy={loading}>
      {error?<p className="form-error" role="alert">{error}</p>:loading?<p className="entry-empty" role="status">검색 중…</p>:rows.length?rows.map((r,i)=><button key={`${r.kind}:${r.id}`} id={`search-${i}`} role="option" aria-selected={i===index} className={i===index?'is-active':''} onClick={()=>choose(r)} onMouseEnter={()=>setIndex(i)}><span className={r.status?'search-done':''}>{r.title}<small>{r.subtitle}{r.status===1?' · 완료':r.status===2?' · 계획 취소':''}</small></span></button>):<div className="entry-empty"><Search size={36}/><p>{query.trim()?'검색 결과가 없어요':'작업, 일정, 태그, 목록, 필터를 검색합니다.'}</p></div>}
    </div>
  </Dialog>
}
export function QuickAdd({ lists,tags,inboxId,onClose,onCreated }: {lists:ListRow[];tags:TagRow[];inboxId?:string;onClose:()=>void;onCreated:(id:string,listId:string)=>void}) {
  const [raw,setRaw]=useState('')
  const [inputScroll,setInputScroll]=useState(0)
  const [recognition,setRecognition]=useState(true)
  const parsed=useMemo(()=>parseAdd(raw,lists,tags,{keepDate:false}),[raw,lists,tags])
  const [list,setList]=useState<string>()
  const [priority,setPriority]=useState<number>()
  const [schedule,setSchedule]=useState<Schedule>()
  const [picker,setPicker]=useState(false)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const saving=useRef(false)
  const dateButton=useRef<HTMLButtonElement>(null)
  const titleRef=useRef<HTMLInputElement>(null)
  const toast=useToast()
  const inferred:Schedule={...EMPTY_SCHEDULE,due_at:recognition?parsed.due_at:null,is_all_day:parsed.due_at?.includes('T')?0:1,repeat_rule:recognition?parsed.repeat_rule:null,repeat_from:'due',reminders:recognition&&parsed.due_at?.includes('T')?['-PT0M']:[]}
  const selectedSchedule=schedule??inferred
  // 33 §6.3-4: 기본함으로 가는 새 할 일에 [[리스트]] 하나만 있으면 그 리스트로(토스트 ⟲)
  const moveTo=!list&&recognition?linkMoveTarget(parsed,tags,lists):undefined
  const listId=list??(recognition?parsed.list_id:undefined)??moveTo??inboxId
  const p=priority??(recognition?parsed.priority:undefined)??0
  const title=recognition?parsed.title:raw.trim()
  const submit=async()=>{
    if(saving.current||!title)return
    saving.current=true;setBusy(true);setError('')
    try{
      const id=uuid()
      const s=selectedSchedule
      const tagIds=recognition?[...parsed.tag_ids,...(await ensureTags(parsed.newTags))]:[]
      await run(insert('tasks',{id,title,list_id:listId,content:'',content_mode:'text',status:0,priority:p,start_at:s.start_at,due_at:s.due_at,is_all_day:s.is_all_day,time_zone:'floating',repeat_rule:s.repeat_rule,repeat_from:s.repeat_from,sort_order:-Date.now()}),
        ...tagIds.map((tag_id)=>insert('task_tags',{id:uuid(),task_id:id,tag_id})),
        ...s.reminders.map((trigger)=>insert('reminders',{id:uuid(),task_id:id,trigger})))
      const real=listId||(await (await getDb()).get<{list_id:string}>('SELECT list_id FROM tasks WHERE id=?',[id]))?.list_id||''
      onClose();onCreated(id,real)
      if(moveTo&&listId===moveTo&&inboxId){const l=lists.find(x=>x.id===moveTo);const n=l?.name??'';toast.show(`'${n}'${ro(n).slice(n.length)} 옮겼어요`,()=>run(update('tasks',id,{list_id:inboxId,section_id:null})))}
    }catch{setError('저장하지 못했어요. 입력 내용은 유지됩니다. 다시 시도해 주세요.')}
    finally{saving.current=false;setBusy(false)}
  }
  return <Dialog label="할 일 추가" className="quick-add-dialog" onClose={()=>{if(!saving.current)onClose()}}>
    <div className="quick-add-input-wrap"><div className="quick-add-highlight" aria-hidden="true"><span style={{transform:`translateX(-${inputScroll}px)`}}>{highlightRecognized(raw,recognition?parsed.tokens:[])}</span></div><input ref={titleRef} onScroll={e=>setInputScroll(e.currentTarget.scrollLeft)} data-autofocus spellCheck={false} className="quick-add-title" aria-label="새 할 일" placeholder='"기본함"에 할일 추가' value={raw} onChange={(e)=>setRaw(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&!document.querySelector('.popover')){e.preventDefault();void submit()}}}/><WikiComplete target={titleRef}/></div>
    {recognition&&parsed.tokens.length>0&&<div className="recognition-summary"><span>{parsed.tokens.map(t=>parsed.newTags.includes(t.slice(1))&&t.startsWith('#')?`${t}(새 태그)`:t).join(' · ')}</span><button onClick={()=>setRecognition(false)}>인식 해제</button></div>}
    <div className="quick-add-tools"><button ref={dateButton} onClick={()=>setPicker(true)}><CalendarDays size={17}/>{selectedSchedule.due_at?detailDateLabel({start_at:selectedSchedule.start_at,due_at:selectedSchedule.due_at},dayKey()).label:'날짜'}</button><label title="우선순위"><Flag size={17}/><select aria-label="우선순위" value={p} onChange={(e)=>setPriority(Number(e.target.value))}><option value={0}>없음</option><option value={3}>높음</option><option value={2}>중간</option><option value={1}>낮음</option></select></label><label><Inbox size={17}/><select aria-label="리스트" value={listId??''} onChange={(e)=>setList(e.target.value)}>{lists.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><button className="entry-primary" disabled={busy||!title||!listId} onClick={()=>void submit()}><Plus size={16}/>{busy?'저장 중':'추가'}</button></div>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {picker&&<DatePicker initial={selectedSchedule} anchor={dateButton.current} onSave={setSchedule} onClose={()=>setPicker(false)}/>}
  </Dialog>
}

export function highlightRecognized(raw:string,tokens:string[]) {
 const ranges:{start:number;end:number}[]=[]
 for(const token of tokens){
  let from=0
  while(from<raw.length){const at=raw.indexOf(token,from);if(at<0)break;const end=at+token.length;if((token.startsWith('[[')||(at===0||/\s/.test(raw[at-1]))&&(end===raw.length||/\s/.test(raw[end])))&&!ranges.some(r=>at<r.end&&end>r.start)){ranges.push({start:at,end});break}from=end}
 }
 ranges.sort((a,b)=>a.start-b.start)
 let from=0
 const pieces=[]
 for(const r of ranges){pieces.push(raw.slice(from,r.start),<mark key={r.start}>{raw.slice(r.start,r.end)}</mark>);from=r.end}
 pieces.push(raw.slice(from))
 return pieces
}
