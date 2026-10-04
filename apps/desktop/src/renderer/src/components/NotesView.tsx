import { BookOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '../data/useQuery'
import { convertNote, saveNote, type Note } from '../data/notes'
import { listLabel, type ListRow } from '../data/types'
import './notes.css'

export function NotesView({lists,onOpen,section,onSection}:{lists:ListRow[];onOpen:(id:string)=>void;section:'notes'|'wiki';onSection:(section:'notes'|'wiki')=>void}) {
 const [draft,setDraft]=useState(''), [search,setSearch]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false)
 const [editing,setEditing]=useState<string>(), [edit,setEdit]=useState('')
 const [conversion,setConversion]=useState<{note:Note; scheduled:boolean}>()
 const notes=useQuery<Note>(`SELECT n.*, t.title AS task_title,t.deleted_at AS task_deleted FROM notes n LEFT JOIN tasks t ON t.id=n.task_id WHERE instr(lower(n.content),lower(?))>0 ORDER BY n.created_at DESC,n.id DESC`,[search])
 async function perform(action:()=>Promise<unknown>,done:()=>void) {if(busy)return;setBusy(true);setError('');try{await action();done()}catch(e){setError(e instanceof Error?e.message:'저장하지 못했어요. 다시 시도해 주세요.')}finally{setBusy(false)}}
 return <main className="notes">
  <header><div><h1>메모함</h1><p className="notes__description">빠르게 남기고, 주제별로 정리하는 공간</p></div><input hidden={section!=='notes'} aria-label="메모 검색" placeholder="메모 검색" value={search} onChange={e=>setSearch(e.target.value)}/></header>
  <div className="notes__tabs" role="tablist" aria-label="메모함 보기" onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'notes':e.key==='End'?'wiki':section==='notes'?'wiki':'notes';onSection(next);e.currentTarget.querySelector<HTMLButtonElement>(`#notes-tab-${next}`)?.focus()}}>
   {(['notes','wiki'] as const).map(tab=><button key={tab} role="tab" id={`notes-tab-${tab}`} aria-selected={section===tab} aria-controls={`notes-panel-${tab}`} tabIndex={section===tab?0:-1} onClick={()=>onSection(tab)}>{tab==='notes'?'메모':'주제 위키'}</button>)}
  </div>
  <div className="notes__panel" role="tabpanel" id="notes-panel-notes" aria-labelledby="notes-tab-notes" hidden={section!=='notes'}>
  {error&&<p role="alert">{error}</p>}
  <section className="notes__cards" aria-label="저장된 메모">
   {!notes?<p>메모를 불러오는 중…</p>:!notes.length?<p className="notes__empty">{search?'검색 결과가 없어요.':'생각나는 내용을 남겨 보세요. 필요할 때 할 일이나 일정으로 바꿀 수 있어요.'}</p>:notes.map(note=><article key={note.id}>
    <time>{new Date(note.created_at).toLocaleString('ko-KR')}</time>
    {editing===note.id?<><textarea aria-label="메모 수정" value={edit} onChange={e=>setEdit(e.target.value)}/><button disabled={busy||!edit.trim()} onClick={()=>void perform(()=>saveNote(edit,note.id),()=>setEditing(undefined))}>수정 저장</button><button disabled={busy} onClick={()=>setEditing(undefined)}>취소</button></>:<><p className="notes__content">{note.content}</p><footer>
     <button disabled={busy} onClick={()=>{setEditing(note.id);setEdit(note.content)}}>수정</button>
     {note.task_id?(note.task_title&&!note.task_deleted?<button onClick={()=>onOpen(note.task_id!)}>연결된 항목: {note.task_title}</button>:<span>연결된 항목이 삭제되었어요.</span>):<><button disabled={busy} onClick={()=>setConversion({note,scheduled:false})}>할 일로 만들기</button><button disabled={busy} onClick={()=>setConversion({note,scheduled:true})}>일정으로 만들기</button></>}
    </footer></>}
   </article>)}
  </section>
  <form className="notes__composer" onSubmit={e=>{e.preventDefault();void perform(()=>saveNote(draft),()=>setDraft(''))}}>
   <textarea aria-label="새 메모" placeholder="생각나는 내용을 적어 보세요…" value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();if(draft.trim())void perform(()=>saveNote(draft),()=>setDraft(''))}}}/>
   <div><small>⌘ / Ctrl + Enter로 저장</small><button disabled={busy||!draft.trim()} type="submit">{busy?'저장 중…':'메모 저장'}</button></div>
  </form>
  </div>
  <section className="notes__wiki" role="tabpanel" id="notes-panel-wiki" aria-labelledby="notes-tab-wiki" hidden={section!=='wiki'}>
   <BookOpen size={32}/><h2>메모가 쌓이면, 주제별로 정리해요</h2><p>흩어진 메모를 모아 요약하고 원본과 연결하는 공간이에요.</p><span className="notes__wiki-status">위키 생성 기능 준비 중</span><ul><li>필요할 때 AI로 주제별 정리</li><li>요약에서 원본 메모와 연결된 할 일 열기</li><li>직접 수정한 내용은 보존</li></ul><button onClick={()=>onSection('notes')}>메모로 돌아가기</button>
  </section>
  {conversion&&<Conversion key={conversion.note.id} note={conversion.note} scheduled={conversion.scheduled} lists={lists} onClose={()=>setConversion(undefined)}/>}
 </main>
}
function Conversion({note,scheduled,lists,onClose}:{note:Note;scheduled:boolean;lists:ListRow[];onClose:()=>void}){
 const formRef=useRef<HTMLFormElement>(null)
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;formRef.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>previous?.focus()},[])
 const [title,setTitle]=useState(note.content.split('\n')[0].slice(0,200)),[listId,setListId]=useState(lists.find(l=>l.kind==='inbox')?.id??lists[0]?.id??'')
 const [date,setDate]=useState(''),[time,setTime]=useState(''),[end,setEnd]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 return <div className="notes__backdrop"><form ref={formRef} role="dialog" aria-modal="true" aria-label={scheduled?'일정으로 만들기':'할 일로 만들기'} className="notes__dialog" onKeyDown={e=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const items=Array.from(formRef.current?.querySelectorAll<HTMLElement>('input,select,button:not(:disabled)')??[]);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}} onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{if(scheduled&&!date)throw new Error('날짜를 선택해 주세요.');const point=date?(time?`${date}T${time}`:date):undefined;await convertNote(note.id,{title,listId,due:end?`${date}T${end}`:point,start:end?point:undefined});onClose()}catch(err){setError(err instanceof Error?err.message:'등록하지 못했어요.')}finally{setBusy(false)}}}>
  <h2>{scheduled?'일정으로 만들기':'할 일로 만들기'}</h2>
  <label>제목<input autoFocus required value={title} onChange={e=>setTitle(e.target.value)}/></label>
  <label>리스트<select value={listId} onChange={e=>setListId(e.target.value)}>{lists.map(l=><option key={l.id} value={l.id}>{listLabel(l)}</option>)}</select></label>
  {scheduled&&<><label>날짜<input required type="date" value={date} onInput={e=>setDate(e.currentTarget.value)}/></label><label>시작 시각 · 비워두면 종일<input type="time" value={time} onInput={e=>{setTime(e.currentTarget.value);if(!e.currentTarget.value)setEnd('')}}/></label>{time&&<label>종료 시각 · 선택<input type="time" value={end} onInput={e=>setEnd(e.currentTarget.value)}/></label>}</>}
  <p>원본 메모는 유지되고 항목의 설명에 함께 저장돼요.</p>{error&&<p role="alert">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>취소</button><button disabled={busy||!title.trim()||!listId}>{busy?'등록 중…':'등록'}</button></footer>
 </form></div>
}
