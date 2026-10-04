export interface FilterRule { lists:string[];tags:string[];date:string;priorities:number[];keyword:string }
export interface FilterRow { id:string;name:string;emoji:string|null;rule_json:string }
export const EMPTY_FILTER:FilterRule={lists:[],tags:[],date:'all',priorities:[],keyword:''}
export function readFilter(raw:string):FilterRule {
 try {const r=JSON.parse(raw);return {lists:Array.isArray(r.lists)?r.lists.filter((x:unknown)=>typeof x==='string'):[],tags:Array.isArray(r.tags)?r.tags.filter((x:unknown)=>typeof x==='string'):[],date:['all','today','tomorrow','next7','overdue','none'].includes(r.date)?r.date:'all',priorities:Array.isArray(r.priorities)?r.priorities.filter((x:unknown)=>[0,1,2,3].includes(x as number)):[],keyword:typeof r.keyword==='string'?r.keyword:''}}catch{return EMPTY_FILTER}
}
/** Stored JSON is data only: values never become SQL identifiers or operators. */
export function filterScope(id:string,today:string,tomorrow:string,last:string){
 const start='substr(COALESCE(t.start_at,t.due_at),1,10)',end='substr(t.due_at,1,10)'
 return {where:`l.archived_at IS NULL AND EXISTS (SELECT 1 FROM filters f WHERE f.id=? AND json_valid(f.rule_json) AND
 (COALESCE(json_array_length(f.rule_json,'$.lists'),0)=0 OR t.list_id IN (SELECT value FROM json_each(f.rule_json,'$.lists'))) AND
 (COALESCE(json_array_length(f.rule_json,'$.tags'),0)=0 OR EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id=t.id AND tt.tag_id IN (SELECT value FROM json_each(f.rule_json,'$.tags')))) AND
 (COALESCE(json_array_length(f.rule_json,'$.priorities'),0)=0 OR t.priority IN (SELECT value FROM json_each(f.rule_json,'$.priorities'))) AND
 (COALESCE(json_extract(f.rule_json,'$.keyword'),'')='' OR instr(lower(t.title),lower(json_extract(f.rule_json,'$.keyword')))>0 OR instr(lower(COALESCE(t.content,'')),lower(json_extract(f.rule_json,'$.keyword')))>0) AND
 CASE COALESCE(json_extract(f.rule_json,'$.date'),'all') WHEN 'all' THEN 1 WHEN 'none' THEN t.due_at IS NULL WHEN 'today' THEN ${start}<=? AND ${end}>=? WHEN 'tomorrow' THEN ${start}<=? AND ${end}>=? WHEN 'next7' THEN ${start}<=? AND ${end}>=? WHEN 'overdue' THEN ${end}<? ELSE 0 END)`,params:[id,today,today,tomorrow,tomorrow,last,today,today]}
}
