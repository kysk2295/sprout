import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isUsageProvider, normalizeUsage, quotaError, type UsageProvider, type UsageSnapshot, type QuotaAccount } from '../shared/usage'
const candidates=['/opt/homebrew/bin/codexbar','/usr/local/bin/codexbar','/Applications/CodexBar.app/Contents/Helpers/CodexBarCLI']
async function binary(){for(const path of candidates){try{await access(path,constants.X_OK);return path}catch{}}throw new Error('not-installed')}
function command(path:string,args:string[]){return new Promise<string>((resolve,reject)=>{execFile(path,args,{timeout:45000,maxBuffer:2*1024*1024,encoding:'utf8'},(error,stdout)=>{if(stdout.trim())resolve(stdout);else reject(new Error(error?'조회 프로세스 실패':'빈 응답'))})})}
export function createUsageService(dependencies={binary,command}, localAccounts:(provider:UsageProvider)=>Promise<QuotaAccount[]>=async()=>[]){
 const cache=new Map<UsageProvider,UsageSnapshot>(),pending=new Map<UsageProvider,Promise<UsageSnapshot>>(),failures=new Map<UsageProvider,number>(),invalidated=new Set<UsageProvider>()
 async function fetchProvider(provider:UsageProvider):Promise<UsageSnapshot>{
  let installed=true
  const checkedAt=new Date().toISOString()
  const local=await localAccounts(provider)
  try{
   const path=await dependencies.binary()
   const args=['usage','--provider',provider,'--format','json','--json-only','--no-credits','--source',provider==='codex'||provider==='claude'?'oauth':'auto']
   let payload:unknown=JSON.parse(await dependencies.command(path,provider==='gemini'?args:[...args,'--all-accounts']))
   if(Array.isArray(payload)&&payload.length===1&&/No token accounts configured/i.test(String(payload[0]?.error?.message)))payload=JSON.parse(await dependencies.command(path,args))
   let accounts=[...normalizeUsage(provider,payload),...local]
   const old=cache.get(provider)
   accounts=accounts.map(a=>{const previous=old?.accounts.find(p=>p.id===a.id);return a.status!=='fresh'&&previous?.windows.length?{...a,windows:previous.windows,observedAt:previous.observedAt}:a})
   const errors=accounts.every(a=>a.status!=='fresh')
   const count=errors?(failures.get(provider)??0)+1:0;failures.set(provider,count)
   const limited=accounts.some(a=>a.reason?.includes('요청이 많아'))
   const delay=limited?15:errors?Math.min(30,5*2**Math.min(count-1,3)):5
   const result={provider,accounts,checkedAt,nextRefreshAt:new Date(Date.now()+delay*60_000).toISOString(),installed}
   cache.set(provider,result);return result
  }catch(error){
   installed=!(error instanceof Error&&error.message==='not-installed')
   const previous=cache.get(provider),failure=quotaError('unavailable')
   const accounts=previous?.accounts.length?previous.accounts.map(a=>({...a,status:'stale' as const,reason:failure.reason})):normalizeUsage(provider,[{provider,error:{message:'unavailable'}}])
   const result:UsageSnapshot={provider,accounts:accounts.map(a=>({...a,status:installed&&a.observedAt?'stale':'unavailable',reason:installed?failure.reason:'CodexBar CLI가 필요해요. CodexBar 설정에서 CLI를 설치해 주세요.'})),checkedAt,nextRefreshAt:new Date(Date.now()+5*60_000).toISOString(),installed}
   result.accounts=[...result.accounts.filter(a=>!a.id.startsWith('sprout:')),...local]
   cache.set(provider,result);return result
  }
 }
 const service={invalidate(provider:UsageProvider){cache.delete(provider);invalidated.add(provider)},read(provider:unknown,force=false):Promise<UsageSnapshot>{
  if(!isUsageProvider(provider))return Promise.reject(new Error('지원하지 않는 서비스'))
  const current=cache.get(provider),active=pending.get(provider)
  if(active)return invalidated.has(provider)?active.then(()=>service.read(provider,true)):active
  // Manual refresh coalesces within 30 seconds; longer error cooldowns remain in force.
  const resetPassed=current?.accounts.some(a=>a.windows.some(w=>w.resetsAt&&Date.parse(w.resetsAt)<=Date.now()&&Date.parse(current.checkedAt)<Date.parse(w.resetsAt)))
  if(current&&((!force&&!resetPassed&&Date.now()<Date.parse(current.nextRefreshAt))||(force&&Date.now()-Date.parse(current.checkedAt)<30000)))return Promise.resolve(current)
  if(current?.accounts.some(a=>a.reason?.includes('요청이 많아'))&&Date.now()<Date.parse(current.nextRefreshAt))return Promise.resolve(current)
  invalidated.delete(provider)
  const promise=fetchProvider(provider).finally(()=>{pending.delete(provider);if(invalidated.has(provider))cache.delete(provider)});pending.set(provider,promise);return promise
 }}
 return service
}
