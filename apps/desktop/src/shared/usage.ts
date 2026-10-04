export const usageProviders=['codex','claude','grok','gemini'] as const
export type UsageProvider=typeof usageProviders[number]
export const usageInfo:Record<UsageProvider,{name:string;scope:string;url:string;hint:string}>={
 codex:{name:'GPT / Codex',scope:'Codex 구독 한도',url:'https://chatgpt.com/codex/settings/usage',hint:'ChatGPT 일반 채팅 한도는 포함하지 않아요.'},
 claude:{name:'Claude',scope:'Claude 구독 한도',url:'https://claude.ai/settings/usage',hint:'연결한 Claude 계정의 구독 한도를 조회해요.'},
 grok:{name:'Grok',scope:'Grok 공급자 보고 한도',url:'https://grok.com',hint:'계정 플랜과 조회 출처에 따라 표시되는 한도가 달라요.'},
 gemini:{name:'Gemini',scope:'Gemini CLI / Code Assist',url:'https://gemini.google.com',hint:'Gemini Apps 채팅 한도가 아니에요. 현재 연결 방식은 로그인 한 계정만 지원해요.'}
}
export type QuotaStatus='fresh'|'stale'|'auth_required'|'unavailable'|'unsupported'|'error'
export interface QuotaWindow{id:string;label:string;remainingPercent:number|null;resetsAt:string|null;durationMinutes:number|null}
export interface QuotaAccount{id:string;provider:UsageProvider;label:string;identity:string|null;organization:string|null;plan:string|null;source:string;observedAt:string|null;status:QuotaStatus;reason:string|null;windows:QuotaWindow[]}
export interface UsageSnapshot{provider:UsageProvider;accounts:QuotaAccount[];checkedAt:string;nextRefreshAt:string;installed:boolean}
export const isUsageProvider=(value:unknown):value is UsageProvider=>usageProviders.includes(value as UsageProvider)
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const str=(value:unknown)=>typeof value==='string'&&value.trim()?value.slice(0,240):null
const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null
export function quotaError(message:string):{status:QuotaStatus;reason:string}{
 if(/429|rate.?limit|too many/i.test(message))return {status:'error',reason:'조회 요청이 많아 잠시 기다려야 해요.'}
 if(/not logged|auth|credential|token|401|403|session.*expired/i.test(message))return {status:'auth_required',reason:'계정 연결에서 다시 로그인해 주세요.'}
 if(/unsupported|not support|deprecated|ineligible/i.test(message))return {status:'unsupported',reason:'현재 계정 또는 조회 방식에서 한도를 제공하지 않아요.'}
 return {status:'unavailable',reason:'지금 한도를 가져오지 못했어요. 마지막 확인 시각을 확인해 주세요.'}
}
/** Strict display projection: never forward raw provider payloads or invent missing percentages. */
export function normalizeUsage(provider:UsageProvider,payload:unknown):QuotaAccount[]{
 if(!Array.isArray(payload)||!payload.length)throw new Error('Invalid usage response')
 const accounts=payload.map((entry,index)=>{
  const row=object(entry),usage=object(row.usage),identity=object(usage.identity),labels=object(row.rateWindowLabels)
  if(row.provider!==provider)throw new Error('Provider mismatch')
  const email=str(identity.accountEmail)??str(usage.accountEmail),organization=str(identity.accountOrganization)??str(usage.accountOrganization)
  const label=str(row.account)??email??'현재 로그인',externalId=str(identity.accountId)??str(row.accountId)
  // account label + organization + external ID keeps independently managed profiles separate.
  const id=JSON.stringify([provider,str(row.account),externalId,email,organization,...(!str(row.account)&&!email&&!externalId?[index]:[])])
  const windows:QuotaWindow[]=Object.entries(usage).flatMap(([key,value])=>{
   const w=object(value)
   if(!['primary','secondary','tertiary'].includes(key)&&!('usedPercent' in w))return []
   if(!value||typeof value!=='object')return []
   const used=typeof w.usedPercent==='number'&&Number.isFinite(w.usedPercent)&&w.usedPercent>=0&&w.usedPercent<=100?w.usedPercent:null
   const duration=typeof w.windowMinutes==='number'&&Number.isFinite(w.windowMinutes)&&w.windowMinutes>0?w.windowMinutes:null
   return [{id:key,label:(({Weekly:'주간',Session:'세션',Daily:'일간'} as Record<string,string>)[str(labels[key])??'']??str(labels[key]))??(duration?duration%1440===0?`${duration/1440}일 한도`:duration%60===0?`${duration/60}시간 한도`:`${duration}분 한도`:'공급자 한도'),remainingPercent:used===null?null:100-used,resetsAt:date(w.resetsAt),durationMinutes:duration}]
  })
  const err=object(row.error),failure=row.error?quotaError(String(err.message??'')):null
  const observedAt=date(usage.updatedAt)
  return {id,provider,label,identity:email,organization,plan:str(identity.loginMethod)??str(usage.loginMethod),source:str(row.source)??'CodexBar',observedAt,status:failure?.status??(windows.length?(observedAt?'fresh':'stale'):'unavailable'),reason:failure?.reason??(windows.length?null:'공급자가 표시할 한도를 반환하지 않았어요.'),windows} as QuotaAccount
 })
 if(new Set(accounts.map(a=>a.id)).size!==accounts.length)throw new Error('Ambiguous account identity')
 return accounts
}
export function quotaIsStale(account:QuotaAccount,now=Date.now()){
 return account.status==='stale'||!account.observedAt||now-Date.parse(account.observedAt)>6*60_000||account.windows.some(w=>w.resetsAt&&Date.parse(w.resetsAt)<=now)
}

export interface UsageLogin {id:string;provider:UsageProvider;status:"waiting"|"connected"|"cancelled"|"error";message:string;url?:string;requiresCode?:boolean}
/** 이 앱에서 연결한(격리 프로필) 계정만 `연결 해제`할 수 있다. CodexBar·CLI 기본 계정은 앱 밖 로그인이라 건드리지 않는다 — 10 §5 */
export const isAppConnectedAccount=(id:string)=>/^sprout:[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id)
