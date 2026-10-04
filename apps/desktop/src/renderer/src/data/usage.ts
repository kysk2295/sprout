import type { UsageProvider, UsageSnapshot, UsageLogin } from '../../../shared/usage'
export async function readUsage(provider:UsageProvider,force=false):Promise<UsageSnapshot>{
 if(window.sprout?.usage)return window.sprout.usage.read(provider,force)
 const res=await fetch(`/api/usage/?provider=${provider}&force=${force?1:0}`,{signal:AbortSignal.timeout(100000)})
 if(!res.ok)throw new Error('사용량을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.')
 return res.json()
}
async function loginRequest(path:string,body:object):Promise<UsageLogin>{
 const res=await fetch(`/api/usage/login${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Sprout-Request':'usage'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
 const result=await res.json();if(!res.ok)throw new Error(result.error??'로그인 요청을 처리하지 못했어요.');return result
}
export const startUsageLogin=(provider:UsageProvider)=>window.sprout?.usage?window.sprout.usage.login(provider):loginRequest('',{provider})
export const usageLoginStatus=(id:string)=>window.sprout?.usage?window.sprout.usage.loginStatus(id):loginRequest('/status',{id})
export const cancelUsageLogin=(id:string)=>window.sprout?.usage?window.sprout.usage.cancelLogin(id):loginRequest('/cancel',{id})

export const submitUsageLoginCode=(id:string,code:string)=>window.sprout?.usage?window.sprout.usage.submitLoginCode(id,code):loginRequest('/code',{id,code})
