import { useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { EMPTY_FILTER, readFilter, type FilterRow } from '../data/filters'
import { insert, run, update, uuid } from '../data/mutations'
import type { ListRow, TagRow } from '../data/types'
export function FilterEditor({item,lists,tags,onClose,onSaved}:{item?:FilterRow;lists:ListRow[];tags:TagRow[];onClose:()=>void;onSaved:(id:string)=>void}){
 const [name,setName]=useState(item?.name??'')
 const [emoji,setEmoji]=useState(item?.emoji??'')
 const [rule,setRule]=useState(item?readFilter(item.rule_json):EMPTY_FILTER)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const saving=useRef(false)
 const submit=async()=>{if(saving.current||!name.trim())return;saving.current=true;setBusy(true);try{const id=item?.id??uuid(),values={name:name.trim(),emoji,rule_json:JSON.stringify(rule)};await run(item?update('filters',id,values):insert('filters',{id,...values,sort_order:Date.now()}));onSaved(id);onClose()}catch{setError('필터를 저장하지 못했어요. 다시 시도해 주세요.')}finally{saving.current=false;setBusy(false)}}
 return <Dialog label={item?'필터 편집':'필터 추가'} className="organization-dialog filter-editor" onClose={()=>{if(!saving.current)onClose()}}><h2>{item?'필터 편집':'필터 추가'}</h2><form onSubmit={e=>{e.preventDefault();void submit()}}><label>이름<input data-autofocus value={name} onChange={e=>setName(e.target.value)}/></label><label>이모지<input value={emoji} onChange={e=>setEmoji(e.target.value)} maxLength={12}/></label>
 {(['lists','tags'] as const).map(key=><fieldset key={key}><legend>{key==='lists'?'리스트':'태그'}</legend><p className="settings-caption">선택하지 않으면 전체</p><div className="filter-choices">{(key==='lists'?lists:tags).map(x=><label key={x.id}><input type="checkbox" checked={rule[key].includes(x.id)} onChange={e=>setRule(r=>({...r,[key]:e.target.checked?[...r[key],x.id]:r[key].filter(id=>id!==x.id)}))}/>{x.name}</label>)}</div></fieldset>)}
 <label>날짜<select value={rule.date} onChange={e=>setRule({...rule,date:e.target.value})}>{[['all','전체'],['today','오늘'],['tomorrow','내일'],['next7','다음 7일'],['overdue','만료됨'],['none','날짜 없음']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><fieldset><legend>우선순위</legend><div className="filter-choices">{[3,2,1,0].map(p=><label key={p}><input type="checkbox" checked={rule.priorities.includes(p)} onChange={e=>setRule({...rule,priorities:e.target.checked?[...rule.priorities,p]:rule.priorities.filter(x=>x!==p)})}/>{['없음','낮음','중간','높음'][p]}</label>)}</div></fieldset><label>포함<input placeholder="작업 키워드" value={rule.keyword} onChange={e=>setRule({...rule,keyword:e.target.value})}/></label>{error&&<p role="alert" className="form-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="entry-primary" disabled={busy||!name.trim()} type="submit">{busy?'저장 중':'저장'}</button></footer></form></Dialog>
}
