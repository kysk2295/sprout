import { SidebarCharacter } from './growth/GrowthBits'
import { FilterEditor } from './FilterEditor'
import type { FilterRow } from '../data/filters'
import { remove, run } from '../data/mutations'
import { Archive, ListFilter, CalendarRange, CheckSquare, ChevronDown, Folder, Inbox, Layers, MoreHorizontal, Plus, Sunrise, Tag, Trash2, XSquare } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { TodayIcon } from '../icons/TodayIcon'
import { useQuery } from '../data/useQuery'
import { useLocalState, usePreferences } from '../data/preferences'
import { archiveList, deleteOrganization, pinOrganization, type FolderRow, type OrganizationItem, type OrganizationKind } from '../data/organization'
import { listView, type ListRow, type TagRow } from '../data/types'
import { dayKey } from '../lib/dates'
import { MenuItem, Popover } from './Popover'
import { Dialog } from './Dialog'
import { OrganizationEditor } from './OrganizationEditor'
import { ExtSidebarSection } from './calendars/ExtSidebar'
import { splitEmoji } from '../../../shared/emoji'
import './EmojiPicker.css'
const OPEN='t.status=0 AND t.deleted_at IS NULL AND t.parent_id IS NULL'
type Menu={kind:OrganizationKind;item:OrganizationItem;point:{x:number;y:number}}
export function Sidebar({selected,onSelect,lists,tags,onGrowth}:{selected:string;onSelect:(id:string)=>void;lists:ListRow[];tags:TagRow[];onGrowth?:()=>void}){
 const filters=useQuery<FilterRow>('SELECT id,name,emoji,rule_json FROM filters ORDER BY sort_order')??[]
 const [filterEditor,setFilterEditor]=useState<{item?:FilterRow}>()
 const [filterMenu,setFilterMenu]=useState<{item:FilterRow;point:{x:number;y:number}}>()
 const [filterDelete,setFilterDelete]=useState<FilterRow>()
 const {visibility}=usePreferences()
 const today=dayKey()
 const smart=useQuery<{all_c:number;today_c:number;tomorrow_c:number;next7_c:number}>(`SELECT count(*) AS all_c,
 sum(CASE WHEN substr(COALESCE(t.start_at,t.due_at),1,10)<=? THEN 1 ELSE 0 END) AS today_c,
 sum(CASE WHEN substr(COALESCE(t.start_at,t.due_at),1,10)<=? AND substr(t.due_at,1,10)>=? THEN 1 ELSE 0 END) AS tomorrow_c,
 sum(CASE WHEN substr(COALESCE(t.start_at,t.due_at),1,10)<=? AND substr(t.due_at,1,10)>=? THEN 1 ELSE 0 END) AS next7_c
 FROM tasks t LEFT JOIN lists l ON l.id=t.list_id WHERE ${OPEN} AND l.archived_at IS NULL AND COALESCE(l.show_in_smart,'all')='all'`,[today,dayKey(1),dayKey(1),dayKey(6),today])?.[0]
 const counts=useQuery<{list_id:string;c:number}>(`SELECT t.list_id,count(*) AS c FROM tasks t WHERE ${OPEN} GROUP BY t.list_id`)??[]
 const tagCounts=useQuery<{tag_id:string;c:number}>(`SELECT tt.tag_id,count(*) AS c FROM task_tags tt JOIN tasks t ON t.id=tt.task_id WHERE ${OPEN} GROUP BY tt.tag_id`)??[]
 const archives=useQuery<{completed:number;wontdo:number;trash:number}>('SELECT sum(CASE WHEN status=1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS completed,sum(CASE WHEN status=2 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS wontdo,sum(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trash FROM tasks')?.[0]
 const folders=useQuery<FolderRow>('SELECT id,name,sort_order FROM folders ORDER BY sort_order')??[]
 const allLists=useQuery<OrganizationItem>('SELECT id,name,emoji,color,folder_id,show_in_smart,pinned,kind,archived_at FROM lists ORDER BY pinned DESC,sort_order')??[]
 const allTags=useQuery<OrganizationItem>('SELECT id,name,color,parent_id,pinned FROM tags ORDER BY pinned DESC,sort_order')??[]
 const [collapsed,setCollapsed]=useLocalState<string[]>('sprout.sidebar.collapsed',[])
 const toggle=(id:string)=>setCollapsed(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])
 const [editor,setEditor]=useState<{kind:OrganizationKind;item?:OrganizationItem;folderId?:string}>()
 const [menu,setMenu]=useState<Menu>()
 const [addMenu,setAddMenu]=useState<HTMLElement>()
 const [deleting,setDeleting]=useState<Menu>()
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const countOf=(id:string)=>counts.find(x=>x.list_id===id)?.c??0
 const inbox=lists.find(l=>l.kind==='inbox')
 const visible=(id:string,count:number)=>id==='inbox'||(visibility[id]!=='hide'&&(visibility[id]!=='auto'||count>0))
 const context=(kind:OrganizationKind,item:OrganizationItem,e:{clientX:number;clientY:number;preventDefault:()=>void;stopPropagation:()=>void})=>{e.preventDefault();e.stopPropagation();setMenu({kind,item,point:{x:e.clientX,y:e.clientY}})}
 const item=(key:string,label:string,icon:ReactNode,count=0,color?:string|null,org?:{kind:OrganizationKind;item:OrganizationItem})=><div key={key} className={`sidebar__item${selected===key?' is-active':''}`} role="button" tabIndex={0} onClick={()=>onSelect(key)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(key)}}} onContextMenu={org?e=>context(org.kind,org.item,e):undefined} data-drop={key.startsWith('list:')||key.startsWith('tag:')||['smart:today','smart:tomorrow','smart:next7','smart:inbox'].includes(key)?key:undefined}>
  <span className="sidebar__icon">{icon}</span><span className="sidebar__label">{label}</span><span className="sidebar__trail">{color&&<span className="sidebar__dot" style={{background:color}}/>}{count>0&&<span className="sidebar__count">{count}</span>}</span>{org&&<button className="sidebar__more" aria-label={`${label} 메뉴`} onClick={e=>context(org.kind,org.item,e)}><MoreHorizontal/></button>}
 </div>
 const section=(key:string,label:string,add?:()=>void)=><div className="sidebar__section"><button className="sidebar-section-toggle" onClick={()=>toggle(key)} aria-expanded={!collapsed.includes(key)}>{label}<ChevronDown size={12} style={{transform:collapsed.includes(key)?'rotate(-90deg)':undefined}}/></button><span className="sidebar__section-actions">{key==='lists'?<button aria-label="리스트 또는 폴더 추가" onClick={e=>setAddMenu(e.currentTarget)}><Plus/></button>:add&&<button aria-label={`${label} 추가`} onClick={add}><Plus/></button>}</span></div>
 const listItem=(l:OrganizationItem)=>{const v=listView(l);return item(`list:${l.id}`,v.name,v.emoji?<span className="sidebar__emoji">{v.emoji}</span>:<span className="sidebar__glyph">≡</span>,countOf(l.id),l.color,{kind:'list',item:l})}
 const normals=allLists.filter(l=>l.kind!=='inbox'&&!l.archived_at)
 const archived=allLists.filter(l=>l.archived_at)
 const perform=async(fn:()=>Promise<unknown>)=>{setMenu(undefined);try{await fn();setError('')}catch(e){setError(String(e))}}
 return <aside className="sidebar"><div className="sidebar__drag"/><div className="sidebar__scroll">
  {visible('all',smart?.all_c??0)&&item('smart:all','전체',<Layers/>,smart?.all_c)}
  {visible('today',smart?.today_c??0)&&item('smart:today','오늘',<TodayIcon/>,smart?.today_c)}
  {visible('tomorrow',smart?.tomorrow_c??0)&&item('smart:tomorrow','내일',<Sunrise/>,smart?.tomorrow_c)}
  {visible('next7',smart?.next7_c??0)&&item('smart:next7','다음 7일',<CalendarRange/>,smart?.next7_c)}
  {inbox&&item('smart:inbox','기본함',<Inbox/>,countOf(inbox.id))}<div className="sidebar__divider"/>
  {section('lists','리스트')}
  {!collapsed.includes('lists')&&<>{normals.filter(l=>l.pinned||!l.folder_id||!folders.some(f=>f.id===l.folder_id)).map(listItem)}{folders.map(f=><div key={f.id}><div className="sidebar-folder" onContextMenu={e=>context('folder',f,e)}><button aria-label={`${f.name} 펼침`} aria-expanded={!collapsed.includes(f.id)} onClick={()=>toggle(f.id)}><ChevronDown size={13} style={{transform:collapsed.includes(f.id)?'rotate(-90deg)':undefined}}/></button>{item(`folder:${f.id}`,splitEmoji(f.name).name,splitEmoji(f.name).emoji?<span className="sidebar__emoji sidebar__emoji--folder">{splitEmoji(f.name).emoji}</span>:<Folder/>,normals.filter(l=>l.folder_id===f.id).reduce((n,l)=>n+countOf(l.id),0),null,{kind:'folder',item:f})}</div>{!collapsed.includes(f.id)&&<div className="sidebar-folder-children">{normals.filter(l=>l.folder_id===f.id&&!l.pinned).map(listItem)}</div>}</div>)}
  {archived.length>0&&<><button className="sidebar-archive" onClick={()=>toggle('archive')}><Archive size={16}/>보관 목록</button>{collapsed.includes('archive')&&archived.map(l=><div className="sidebar-archive-item" key={l.id}><button onClick={()=>onSelect(`list:${l.id}`)}>{l.name}</button><button onClick={()=>void perform(()=>archiveList(l.id,false))}>복원</button></div>)}</>}
  </>}
  {visible('filters',filters.length)&&<>{section('filters','필터',()=>setFilterEditor({}))}{!collapsed.includes('filters')&&filters.map(f=><div className="filter-sidebar-row" key={f.id} onContextMenu={e=>{e.preventDefault();setFilterMenu({item:f,point:{x:e.clientX,y:e.clientY}})}}>{item(`filter:${f.id}`,f.name,f.emoji||<ListFilter/>)}<button className="filter-row-menu" aria-label={`${f.name} 필터 메뉴`} onClick={e=>setFilterMenu({item:f,point:{x:e.clientX,y:e.clientY}})}><MoreHorizontal size={14}/></button></div>)}</>}
  {visible('tags',allTags.length)&&<>{section('tags','태그',()=>setEditor({kind:'tag'}))}{!collapsed.includes('tags')&&allTags.filter(t=>!t.parent_id||!allTags.some(p=>p.id===t.parent_id)).map(t=><div key={t.id}>{item(`tag:${t.id}`,t.name,<Tag/>,tagCounts.find(c=>c.tag_id===t.id)?.c,t.color,{kind:'tag',item:t})}<div className="sidebar-folder-children">{allTags.filter(c=>c.parent_id===t.id).map(c=>item(`tag:${c.id}`,c.name,<Tag/>,tagCounts.find(n=>n.tag_id===c.id)?.c,c.color,{kind:'tag',item:c}))}</div></div>)}{!allTags.length&&<p className="sidebar-hint">#을 입력하여 태그를 선택할 수 있어요.</p>}</>}
  <ExtSidebarSection item={(key,label,icon,count)=>item(key,label,icon,count)} collapsed={collapsed} toggle={toggle}/>{/* 16 G2 구독 캘린더 */}
  <div className="sidebar__divider"/>{visible('completed',archives?.completed??0)&&item('smart:completed','완료',<CheckSquare/>,archives?.completed)}{visible('wontdo',archives?.wontdo??0)&&item('smart:wontdo','계획 취소',<XSquare/>,archives?.wontdo)}{visible('trash',archives?.trash??0)&&item('smart:trash','휴지통',<Trash2/>,archives?.trash)}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </div>
 {filterEditor&&<FilterEditor {...filterEditor} lists={lists} tags={tags} onClose={()=>setFilterEditor(undefined)} onSaved={id=>{setCollapsed(s=>s.filter(x=>x!=='filters'));onSelect(`filter:${id}`)}}/>}
 {filterMenu&&<Popover point={filterMenu.point} className="menu" onClose={()=>setFilterMenu(undefined)}><MenuItem label="편집" onClick={()=>{setFilterEditor({item:filterMenu.item});setFilterMenu(undefined)}}/><MenuItem label="삭제" onClick={()=>{setFilterDelete(filterMenu.item);setFilterMenu(undefined)}}/></Popover>}
 {filterDelete&&<Dialog label="필터 삭제" className="organization-dialog" onClose={()=>setFilterDelete(undefined)}><h2>{filterDelete.name}</h2><p>필터를 삭제합니다. 할 일은 유지됩니다.</p><footer><button onClick={()=>setFilterDelete(undefined)}>취소</button><button onClick={()=>void perform(async()=>{await run(remove('filters',filterDelete.id));if(selected===`filter:${filterDelete.id}`)onSelect('smart:inbox');setFilterDelete(undefined)})}>삭제</button></footer></Dialog>}
 {addMenu&&<Popover anchor={addMenu} onClose={()=>setAddMenu(undefined)} className="menu"><MenuItem label="목록 추가" onClick={()=>{setAddMenu(undefined);setEditor({kind:'list'})}}/><MenuItem label="폴더 추가" onClick={()=>{setAddMenu(undefined);setEditor({kind:'folder'})}}/></Popover>}
 {menu&&<Popover point={menu.point} onClose={()=>setMenu(undefined)} className="menu" width={140}>
  {menu.kind==='folder'&&<MenuItem label="목록 추가" onClick={()=>{setEditor({kind:'list',folderId:menu.item.id});setMenu(undefined)}}/>}
  <MenuItem label="편집" onClick={()=>{setEditor({kind:menu.kind,item:menu.item});setMenu(undefined)}}/>
  {menu.kind!=='folder'&&<MenuItem label={menu.item.pinned?'상단 고정 해제':'상단 고정'} onClick={()=>void perform(()=>pinOrganization(menu.kind as 'list'|'tag',menu.item.id,!menu.item.pinned))}/>}
  {menu.kind==='list'&&<MenuItem label="기록 보관소" onClick={()=>void perform(()=>archiveList(menu.item.id,true))}/>}
  <MenuItem label={menu.kind==='folder'?'그룹해제':'삭제'} onClick={()=>{setDeleting(menu);setMenu(undefined)}}/>
 </Popover>}
 {editor&&<OrganizationEditor {...editor} folders={folders} tags={allTags} onClose={()=>setEditor(undefined)} onSaved={id=>{setCollapsed(s=>s.filter(x=>x!=='lists'&&x!=='tags'));onSelect(`${editor.kind}:${id}`)}}/>}
 {deleting&&<Dialog label={deleting.kind==='folder'?'폴더 해제':'삭제 확인'} className="organization-dialog" onClose={()=>{if(!busy)setDeleting(undefined)}}><h2>{deleting.item.name}</h2><p>{deleting.kind==='list'?'목록의 할 일을 휴지통으로 옮깁니다. 목록은 보관 목록에서 복원할 수 있어요.':deleting.kind==='tag'?'태그 연결을 삭제합니다. 할 일은 그대로 유지됩니다.':'폴더를 해제합니다. 안의 리스트는 유지됩니다.'}</p><footer><button disabled={busy} onClick={()=>setDeleting(undefined)}>취소</button><button disabled={busy} onClick={async()=>{setBusy(true);try{await deleteOrganization(deleting.kind,deleting.item.id);if(selected===`${deleting.kind}:${deleting.item.id}`)onSelect('smart:inbox');setDeleting(undefined)}catch(e){setError(String(e))}finally{setBusy(false)}}}>확인</button></footer></Dialog>}
 {onGrowth&&<SidebarCharacter onOpen={onGrowth}/>}
 </aside>
}
