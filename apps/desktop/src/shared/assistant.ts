/** 서버 AI 프록시 경로(/ai/<용도>) — 용도별로 상한을 센다 */
export type AiPurpose='assistant'|'classify'|'map'|'diary'|'kpi-draft'|'weekly-report'|'breakdown'|'tag'
export interface ChatInput {model:string;messages:{role:'system'|'user'|'assistant';content:string}[];format?:Record<string,unknown>;purpose?:AiPurpose;/** /ai/diary 갈래(28 §8.10): chat = 이야기 한 턴, distill·polish = 일기로 옮기기. 없으면 예전 답 */mode?:'chat'|'distill'|'polish';/** 0~2, 없으면 서버 기본(0) */temperature?:number;/** 앱이 저절로 부르는 뒷일 — 서버 대기열에서 사람이 기다리는 요청 뒤로(X-Sprout-Priority) */priority?:'background'}
export interface Intent {action:'create'|'query'|'stats'|'reply';message:string;title:string;listId:string;start:string;due:string;from:string;to:string;keyword:string;status:'all'|'open'|'completed';repeat:string}
const fields=['message','title','listId','start','due','from','to','keyword','repeat'] as const
export const intentSchema={type:'object',properties:{action:{type:'string',enum:['create','query','stats','reply']},status:{type:'string',enum:['all','open','completed']},...Object.fromEntries(fields.map(key=>[key,{type:'string'}]))},required:['action','status',...fields],additionalProperties:false}
Object.assign(intentSchema.properties, {
 start:{type:'string',description:'Event start; empty for deadline-only task',pattern:'^(|[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2})?)$'},
 due:{type:'string',description:'Event END time, or task deadline. For one-hour meeting at 15:00 this is 16:00.',pattern:'^(|[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2})?)$'},
 from:{type:'string',description:'Query beginning date only, empty for create',pattern:'^(|[0-9]{4}-[0-9]{2}-[0-9]{2})$'},
 to:{type:'string',description:'Query ending date inclusive, empty for create',pattern:'^(|[0-9]{4}-[0-9]{2}-[0-9]{2})$'}
})
export function validDate(value:string,dayOnly=false){
 if(!(dayOnly?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).test(value))return false
 const date=new Date(value.includes('T')?`${value}:00Z`:`${value}T00:00:00Z`)
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,value.length)===value
}
export function parseIntent(value:string):Intent{
 const cleaned=value.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')
 let data:Intent
 // 서버(Ollama think:false)에서는 JSON 스키마 강제가 걸리지 않을 때가 있다 → 앞뒤 군말을 걷어 내고 객체만 읽는다
 const object=(text:string)=>{const a=text.indexOf('{'),b=text.lastIndexOf('}');return a>=0&&b>a?text.slice(a,b+1):text}
 try{data=JSON.parse(cleaned)}catch{try{data=JSON.parse(object(cleaned))}catch{throw new Error('AI 응답 형식을 확인할 수 없어요. 다시 말씀해 주세요.')}}
 // 모델이 빈 칸을 빼먹는 일이 잦다(스키마 강제 없음): 빠진 문자열 칸은 빈칸, 상태는 all로 본다
 if(data&&typeof data==='object'&&!Array.isArray(data)){const loose=data as unknown as Record<string,unknown>;for(const key of fields)if(loose[key]===undefined||loose[key]===null)loose[key]='';if(loose.status===undefined||loose.status===null||loose.status==='')loose.status='all'}
 if(!data||!['create','query','stats','reply'].includes(data.action)||!['all','open','completed'].includes(data.status)||fields.some(key=>typeof data[key]!=='string'||data[key].length>4000))throw new Error('AI 응답 형식을 확인할 수 없어요. 다시 말씀해 주세요.')
 for(const key of (data.action==='create'?['start','due'] as const:['from','to'] as const))if(data[key]&&!validDate(data[key],key==='from'||key==='to'))throw new Error('AI가 해석한 날짜가 올바르지 않아요. 날짜를 다시 알려 주세요.')
 if(data.action==='create'&&data.start&&(!data.due||data.start.length!==data.due.length||data.start>=data.due))throw new Error('종료 시각은 시작 시각 이후여야 해요.')
 if(data.from&&data.to&&data.from>data.to)throw new Error('조회 기간이 올바르지 않아요.')
 if(data.action==='create'&&data.repeat&&!/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=[1-9]\d?)?(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?$/.test(data.repeat))throw new Error('반복 조건을 해석하지 못했어요. 매일 또는 매주 요일로 다시 알려 주세요.')
 if(data.action==='create'&&data.repeat&&!data.due)throw new Error('반복 시작 날짜를 알려 주세요.')
 return data
}
export async function localModels(signal?:AbortSignal,base='/api/assistant'):Promise<string[]>{
 const res=await fetch(`${base}/api/tags`,{signal:signal??AbortSignal.timeout(20000)})
 if(!res.ok)throw new Error('Ollama 모델 목록을 가져오지 못했어요.')
 const json=await res.json()
 return (json.models??[]).filter((m:{name:string;remote_host?:string;capabilities?:string[];details?:{family?:string}})=>typeof m.name==='string'&&!m.remote_host&&!/cloud/i.test(m.name)&&(!m.capabilities||m.capabilities.includes('completion'))&&!/bert/i.test(m.details?.family??'')).map((m:{name:string})=>m.name)
}
export async function localChat(input:ChatInput,signal?:AbortSignal,base='/api/assistant',onDelta?:(text:string)=>void):Promise<string>{
 if(!input||typeof input.model!=='string'||!Array.isArray(input.messages)||input.messages.length>30||input.messages.some(m=>!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>30000))throw new Error('요청이 너무 크거나 올바르지 않아요.')
 if(!(await localModels(signal,base)).includes(input.model))throw new Error('설치된 로컬 모델을 선택해 주세요.')
 const res=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({...input,purpose:undefined,priority:undefined,mode:undefined,temperature:undefined,stream:!!onDelta,think:false,keep_alive:'5m',options:{temperature:input.temperature??0,num_ctx:4096,num_predict:input.purpose==='tag'?1600:700}})})
 if(!res.ok){const error=await res.json().catch(()=>null);throw new Error(typeof error?.error==='string'?error.error:`맥미니 모델 요청 실패 (${res.status})`)}
 if(onDelta)return readChatStream(res,onDelta,signal)
 const json=await res.json()
 if(typeof json.message?.content!=='string')throw new Error('모델 응답이 비어 있어요.')
 return json.message.content
}

/** Decode NDJSON across arbitrary UTF-8/network boundaries. An unfinished stream is not a result. */
export async function readChatStream(response:Response,onDelta:(text:string)=>void,signal?:AbortSignal,onQueue?:(queue:{position:number;waiting:number})=>void){
 const reader=response.body?.getReader()
 if(!reader)throw new Error('응답 스트림이 비어 있어요.')
 const decoder=new TextDecoder();let buffer='',result='',done=false
 const line=(value:string)=>{
  if(!value.trim())return
  const item=JSON.parse(value)
  if(item.error)throw new Error(String(item.error))
  // 서버 AI 프록시 대기열 줄: {"queue":{"position":n,"waiting":m}} (13 §6 대기 중 · 앞에 N명)
  if(item.queue&&typeof item.queue.position==='number'){onQueue?.({position:item.queue.position,waiting:Number(item.queue.waiting)||0});return}
  const delta=item.message?.content
  if(typeof delta==='string'&&delta){result+=delta;onDelta(delta)}
  if(item.done)done=true
 }
 try{
  while(!done){signal?.throwIfAborted();const chunk=await reader.read();if(chunk.done){buffer+=decoder.decode();if(buffer.trim())line(buffer);break}buffer+=decoder.decode(chunk.value,{stream:true});let end:number;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end));buffer=buffer.slice(end+1)}}
  signal?.throwIfAborted()
  if(!done)throw new Error('응답 연결이 끊겼어요. 다시 시도해 주세요.')
  return result
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
export type AssistantProgress={phase:'connecting'|'generating'|'validating'|'saving'|'querying';characters?:number;preview?:string;/** 서버 대기열에서 내 앞에 있는 요청 수(0 = 내 차례) */queue?:number}
export function replyPreview(raw:string){
 if(!/"action"\s*:\s*"reply"/.test(raw))return ''
 const match=raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)/)
 if(!match)return ''
 try{return JSON.parse('"'+match[1]+'"') as string}catch{return ''}
}

/** 47 agent: 도구 호출 줄까지 모은다. 글 조각은 onDelta, 대기열은 onQueue. arguments가 글이면 JSON으로 읽는다 */
export type AgentToolCall={name:string;args:Record<string,unknown>}
export function parseToolCalls(raw:unknown):AgentToolCall[]{
 if(!Array.isArray(raw))return []
 const out:AgentToolCall[]=[]
 for(const c of raw){
  const f=(c as {function?:{name?:unknown;arguments?:unknown}})?.function
  if(!f||typeof f.name!=='string')continue
  let args:unknown=f.arguments
  if(typeof args==='string'){try{args=JSON.parse(args)}catch{args={}}}
  out.push({name:f.name,args:args&&typeof args==='object'&&!Array.isArray(args)?args as Record<string,unknown>:{}})
 }
 return out
}
export async function readAgentStream(response:Response,onDelta:(text:string)=>void,signal?:AbortSignal,onQueue?:(queue:{position:number;waiting:number})=>void):Promise<{content:string;tool_calls:AgentToolCall[];prompt_tokens?:number}>{
 const reader=response.body?.getReader()
 if(!reader)throw new Error('응답 스트림이 비어 있어요.')
 const decoder=new TextDecoder();let buffer='',content='',done=false,prompt:number|undefined
 const calls:AgentToolCall[]=[]
 const line=(value:string)=>{
  if(!value.trim())return
  const item=JSON.parse(value)
  if(item.error)throw Object.assign(new Error(String(item.error)),{code:item.code})
  if(item.queue&&typeof item.queue.position==='number'){onQueue?.({position:item.queue.position,waiting:Number(item.queue.waiting)||0});return}
  const delta=item.message?.content
  if(typeof delta==='string'&&delta){content+=delta;onDelta(delta)}
  calls.push(...parseToolCalls(item.message?.tool_calls))
  if(item.done){done=true;if(typeof item.prompt_eval_count==='number')prompt=item.prompt_eval_count}
 }
 try{
  while(!done){signal?.throwIfAborted();const chunk=await reader.read();if(chunk.done){buffer+=decoder.decode();if(buffer.trim())line(buffer);break}buffer+=decoder.decode(chunk.value,{stream:true});let end:number;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end));buffer=buffer.slice(end+1)}}
  signal?.throwIfAborted()
  if(!done)throw new Error('응답 연결이 끊겼어요. 다시 시도해 주세요.')
  return {content,tool_calls:calls,...(prompt!==undefined?{prompt_tokens:prompt}:{})}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
/** 47 agent 요청(메인 IPC assistant:agent) */
export interface AgentInput{messages:unknown[];tools:string[];turn:string}
/** 서버가 agent를 모른다(배포 전) — 렌더러가 13 의도 경로로 바꾼다 */
export const AGENT_UNSUPPORTED='AGENT_UNSUPPORTED'
