import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Dialog } from './Dialog'
import { saveOrganization, type FolderRow, type OrganizationItem, type OrganizationKind } from '../data/organization'
const COLORS=['','#ff6467','#ffb74d','#ffd54f','#d4e157','#4ade80','#60a5fa','#818cf8','#c084fc']
export function OrganizationEditor({kind,item,folderId,folders,tags=[],onClose,onSaved}:{kind:OrganizationKind;item?:OrganizationItem;folderId?:string;folders:FolderRow[];tags?:OrganizationItem[];onClose:()=>void;onSaved:(id:string)=>void}){
 const [name,setName]=useState(item?.name??'')
 const [emoji,setEmoji]=useState(item?.emoji??'')
 const [color,setColor]=useState(item?.color??'')
 const [folder,setFolder]=useState(item?.folder_id??folderId??'')
 const [parent,setParent]=useState(item?.parent_id??'')
 const [smart,setSmart]=useState(item?.show_in_smart??'all')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const saving=useRef(false)
 const label=kind==='list'?'목록':kind==='folder'?'폴더':'태그'
 const submit=async()=>{if(saving.current||!name.trim())return;saving.current=true;setBusy(true);try{const id=await saveOrganization(kind,item?.id,{name,...(kind==='list'?{emoji:emoji.trim()||null,color:color||null,folder_id:folder||null,show_in_smart:smart}:kind==='tag'?{color:color||null,parent_id:parent||null}:{})});onSaved(id);onClose()}catch(e){setError(String(e))}finally{saving.current=false;setBusy(false)}}
 return <Dialog label={`${label} ${item?'편집':'추가'}`} className="organization-dialog" onClose={()=>{if(!saving.current)onClose()}}>
  <header><h2>{label} {item?'편집':'추가'}</h2><button className="icon-btn" aria-label="닫기" onClick={onClose}><X/></button></header>
  <form onSubmit={e=>{e.preventDefault();void submit()}}>
   <div className="organization-name">{kind==='list'&&<input aria-label="이모지" placeholder="≡" value={emoji} onChange={e=>setEmoji(e.target.value)} maxLength={12}/>}<input data-autofocus aria-label="이름" placeholder="이름" value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></div>
   {kind!=='folder'&&<div className="settings-row"><span>{label} 색상</span><div className="color-choices">{COLORS.map(c=><button type="button" key={c} aria-label={c||'색상 없음'} aria-pressed={color===c} className={color===c?'is-selected':''} style={{background:c||'transparent'}} onClick={()=>setColor(c)}>{!c?'∅':''}</button>)}</div></div>}
   {kind==='list'&&<><label className="settings-row"><span>폴더</span><select value={folder} onChange={e=>setFolder(e.target.value)}><option value="">없음</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="settings-row"><span>스마트 목록에 표시</span><select value={smart} onChange={e=>setSmart(e.target.value)}><option value="all">모든 작업</option><option value="none">표시하지 않음</option></select></label></>}
   {kind==='tag'&&<label className="settings-row"><span>부모 태그</span><select value={parent} onChange={e=>setParent(e.target.value)}><option value="">없음</option>{tags.filter(t=>!t.parent_id&&t.id!==item?.id).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <footer><button type="button" onClick={onClose} disabled={busy}>취소</button><button className="entry-primary" disabled={!name.trim()||busy}>{busy?'저장 중':'저장'}</button></footer>
  </form>
 </Dialog>
}
