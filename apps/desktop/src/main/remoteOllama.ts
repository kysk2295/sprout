import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { localChat, localModels, type ChatInput } from '../shared/assistant'
/** One private SSH tunnel per application process; never expose Ollama on the LAN. */
export function createRemoteOllama(){
 let child:ChildProcess|undefined, endpoint:Promise<string>|undefined
 const close=()=>{child?.kill();child=undefined;endpoint=undefined}
 const connect=()=>endpoint??= (async()=>{
  const server=createServer()
  const port=await new Promise<number>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();const port=typeof address==='object'&&address?address.port:0;server.close(error=>error?reject(error):resolve(port))})})
  const proc=spawn('ssh',['-N','-T','-o','ControlMaster=no','-o','ControlPath=none','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','-L',`127.0.0.1:${port}:127.0.0.1:11434`,'macmini'],{stdio:'ignore'})
  child=proc;let failed=false
  proc.on('error',()=>{failed=true})
  proc.on('exit',()=>{failed=true;if(child===proc){child=undefined;endpoint=undefined}})
  const base=`http://127.0.0.1:${port}`
  for(let attempt=0;attempt<60;attempt++){
   if(failed)break
   try{const response=await fetch(`${base}/api/version`,{signal:AbortSignal.timeout(500)});if(response.ok)return base}catch{}
   await new Promise(resolve=>setTimeout(resolve,200))
  }
  proc.kill();throw new Error('맥미니에 연결하지 못했어요. SSH macmini 연결과 맥미니의 Ollama 실행 상태를 확인해 주세요.')
 })().catch(error=>{endpoint=undefined;throw error})
 return {close,models:async()=>localModels(undefined,await connect()),chat:async(input:ChatInput,signal:AbortSignal,onDelta?:(text:string)=>void)=>{const base=await connect();signal.throwIfAborted();return localChat(input,signal,base,onDelta)}}
}
