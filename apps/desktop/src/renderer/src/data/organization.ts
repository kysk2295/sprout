import { getDb } from './db'
import { insert, now, remove, run, update, uuid } from './mutations'
export interface FolderRow { id:string;name:string;sort_order:number }
export interface OrganizationItem { id:string;name:string;emoji?:string|null;color?:string|null;folder_id?:string|null;parent_id?:string|null;show_in_smart?:string|null;pinned?:number|null;kind?:string;archived_at?:string|null }
export type OrganizationKind='list'|'folder'|'tag'
const tables={list:'lists',folder:'folders',tag:'tags'} as const
export async function saveOrganization(kind:OrganizationKind,id:string|undefined,values:Record<string,unknown>) {
  if(!String(values.name??'').trim())throw new Error('이름을 입력해 주세요.')
  if(kind==='tag' && values.parent_id){
    const db=await getDb()
    const parent=await db.get<{parent_id:string|null}>('SELECT parent_id FROM tags WHERE id=?',[values.parent_id])
    const children=id?await db.getAll('SELECT id FROM tags WHERE parent_id=?',[id]):[]
    if(!parent || parent.parent_id || values.parent_id===id || children.length)throw new Error('태그는 최대 2단계로 정리할 수 있어요.')
  }
  const table=tables[kind]
  const data={...values,name:String(values.name).trim()}
  const next=id??uuid()
  await run(id?update(table,id,data):insert(table,{id:next,sort_order:Date.now(),...(kind==='list'?{kind:'normal',pinned:0,show_in_smart:'all'}:{}),...data}))
  return next
}
export async function pinOrganization(kind:'list'|'tag',id:string,on:boolean){await run(update(tables[kind],id,{pinned:on?1:0}))}
export async function archiveList(id:string,on:boolean){
  const row=await(await getDb()).get<{kind:string}>('SELECT kind FROM lists WHERE id=?',[id])
  if(row?.kind==='inbox')throw new Error('기본함은 보관할 수 없어요.')
  await run(update('lists',id,{archived_at:on?now():null}))
}
export async function deleteOrganization(kind:OrganizationKind,id:string){
  const db=await getDb()
  if(kind==='list'){
    const row=await db.get<{kind:string}>('SELECT kind FROM lists WHERE id=?',[id])
    if(!row||row.kind==='inbox')throw new Error('기본함은 삭제할 수 없어요.')
    const tasks=await db.getAll<{id:string}>('SELECT id FROM tasks WHERE list_id=?',[id])
    await run(...tasks.map(t=>update('tasks',t.id,{deleted_at:now()})),update('lists',id,{archived_at:now()}))
  }else if(kind==='folder'){
    const lists=await db.getAll<{id:string}>('SELECT id FROM lists WHERE folder_id=?',[id])
    await run(...lists.map(l=>update('lists',l.id,{folder_id:null})),remove('folders',id))
  }else{
    const links=await db.getAll<{id:string}>('SELECT id FROM task_tags WHERE tag_id=?',[id])
    const children=await db.getAll<{id:string}>('SELECT id FROM tags WHERE parent_id=?',[id])
    await run(...links.map(t=>remove('task_tags',t.id)),...children.map(t=>update('tags',t.id,{parent_id:null})),remove('tags',id))
  }
}
/** 이름으로 태그를 찾고, 없으면 만든다(02 §4 `#새태그`, 05 태그 고르기 "새 태그 만들기"). 이름 순서대로 id를 돌려준다 */
export async function ensureTags(names:string[]):Promise<string[]>{
  const db=await getDb()
  const ids:string[]=[]
  for(const raw of names){
    const name=raw.trim()
    if(!name)continue
    const found=await db.get<{id:string}>('SELECT id FROM tags WHERE name=? LIMIT 1',[name])
    ids.push(found?found.id:await saveOrganization('tag',undefined,{name,color:null,parent_id:null}))
  }
  return ids
}
