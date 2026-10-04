import { app, ipcMain } from 'electron'
import type { ChatInput } from '../shared/assistant'
import { createRemoteOllama } from './remoteOllama'
export function registerAssistant(){
 const remote=createRemoteOllama()
 app.on('before-quit',()=>remote.close())
 const requests=new Map<string,AbortController>()
 ipcMain.handle('assistant:models',()=>remote.models())
 ipcMain.handle('assistant:chat',async(event,id:string,input:ChatInput)=>{
  if(typeof id!=='string'||id.length>100)throw new Error('잘못된 요청')
  const key=`${event.sender.id}:${id}`
  if(requests.has(key))throw new Error('중복 요청')
  const abort=new AbortController();requests.set(key,abort)
  const timer=setTimeout(()=>abort.abort(),120000)
  try{return await remote.chat(input,abort.signal,text=>{if(!event.sender.isDestroyed())event.sender.send('assistant:delta',{id,text})})}finally{clearTimeout(timer);requests.delete(key)}
 })
 ipcMain.on('assistant:cancel',(event,id:string)=>requests.get(`${event.sender.id}:${id}`)?.abort())
}
