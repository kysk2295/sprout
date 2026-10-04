import { useEffect, useRef, useState } from 'react'
import { Bot, RefreshCw, ArrowUp, ArrowDown, Square, Plus, Check, ArrowUpRight, CalendarDays, RotateCcw, LoaderCircle } from 'lucide-react'
import { localModels, type AssistantProgress } from '../../../shared/assistant'
import { askAssistant, undoAssistant, type AssistantResult } from '../data/assistant'
type Message={id:string;role:'user'|'assistant';text:string;result?:AssistantResult}
export function useAssistant(account:string){
 const key=`sprout.assistant.history.${account}`
 const [messages,setMessages]=useState<Message[]>(()=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}})
 const [models,setModels]=useState<string[]>([]),[model,setModel]=useState(localStorage.getItem('sprout.assistant.model')||'')
 const [busy,setBusy]=useState(false),[connecting,setConnecting]=useState(false),[error,setError]=useState('')
 const [progress,setProgress]=useState<AssistantProgress>({phase:'connecting'}),[started,setStarted]=useState(0),[lastRequest,setLastRequest]=useState('')
 const request=useRef<AbortController|null>(null)
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(messages.slice(-100)))}catch{setError('대화 기록을 보관할 공간이 부족해요.')}},[messages,key])
 useEffect(()=>{localStorage.setItem('sprout.assistant.model',model)},[model])
 const refresh=async()=>{setConnecting(true);setError('');try{const found=await(window.sprout?.assistant?.models()??localModels());setModels(found);setModel(old=>found.includes(old)?old:found.find(m=>m==='qwen3.5:9b')||found[0]||'');if(!found.length)setError('설치된 로컬 모델이 없어요. Ollama에서 모델을 먼저 내려받아 주세요.')}catch{setModels([]);setModel('');setError('Ollama에 연결하지 못했어요. 맥미니의 Ollama와 SSH 연결을 확인한 뒤 다시 연결해 주세요.')}finally{setConnecting(false)}}
 useEffect(()=>{void refresh();return()=>request.current?.abort()},[])
 const send=async(text:string)=>{
  if(request.current||!text.trim()||!model)return false
  const abort=new AbortController();request.current=abort;setBusy(true);setError('');setLastRequest(text);setStarted(Date.now());setProgress({phase:'connecting'});const id=crypto.randomUUID()
  const timer=setTimeout(()=>abort.abort(),120000)
  setMessages(old=>[...old,{id:id+'user',role:'user',text}])
  try{const result=await askAssistant(text,model,id,abort.signal,messages.slice(-8).map(m=>({role:m.role,content:m.text})),setProgress);setMessages(old=>[...old,{id,role:'assistant',text:result.text,result}]);return true}
  catch(e){setError(abort.signal.aborted?'요청이 중단되었어요. 내용을 확인한 뒤 다시 보내 주세요.':e instanceof Error?e.message:'요청에 실패했어요.');return false}
  finally{clearTimeout(timer);request.current=null;setBusy(false)}
 }
 const undo=async(message:Message)=>{if(!message.result?.created)return;try{await undoAssistant(message.result.created);setMessages(old=>old.map(m=>m.id===message.id?{...m,text:'등록을 되돌렸어요.',result:undefined}:m))}catch(e){setError(e instanceof Error?e.message:'되돌리지 못했어요.')}}
 return {progress,started,lastRequest,messages,models,model,setModel,busy,connecting,error,refresh,send,undo,cancel:()=>request.current?.abort(),clear:()=>{if(!request.current)setMessages([])}}
}
export type AssistantController=ReturnType<typeof useAssistant>
const phaseLabels:Record<AssistantProgress['phase'],string>={connecting:'맥미니 응답을 기다리는 중',generating:'응답을 받고 있어요',validating:'요청 내용을 확인하는 중',saving:'일정을 저장하는 중',querying:'내 기록을 조회하는 중'}
export function AssistantBody({draft,onDraft,assistant:a,onOpen}:{draft:string;onDraft:(s:string)=>void;assistant:AssistantController;onOpen:(id:string)=>void}){
 const scroll=useRef<HTMLDivElement>(null),follow=useRef(true)
 const [showLatest,setShowLatest]=useState(false),[elapsed,setElapsed]=useState(0)
 useEffect(()=>{if(!a.busy)return;const tick=()=>setElapsed(Math.floor((Date.now()-a.started)/1000));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[a.busy,a.started])
 useEffect(()=>{const box=scroll.current;if(box&&follow.current)box.scrollTop=box.scrollHeight},[a.messages,a.busy,a.progress,a.error])
 const latest=()=>{follow.current=true;setShowLatest(false);const box=scroll.current;if(box)box.scrollTop=box.scrollHeight}
 const submit=async(text=draft)=>{if(a.busy||!a.model||!text.trim())return;if(text===draft)onDraft('');latest();await a.send(text)}
 return <div className="assistant-body assistant-live">
  <div className="assistant-connection"><span className={`assistant-host${a.models.length?' is-connected':''}`}><i/>{a.connecting?'연결 중':'맥미니 AI'}</span><select aria-label="AI 모델" value={a.model} disabled={a.busy||a.connecting} onChange={e=>a.setModel(e.target.value)}>{!a.models.length&&<option value="">모델 미연결</option>}{a.models.map(m=><option key={m}>{m}</option>)}</select><button title="모델 다시 연결" aria-label="모델 다시 연결" disabled={a.connecting||a.busy} onClick={()=>void a.refresh()}><RefreshCw size={14}/></button><button className="assistant-new" disabled={a.busy||!a.messages.length} onClick={a.clear}><Plus size={14}/>새 대화</button></div>
  <div className="assistant-scroll-wrap"><div ref={scroll} className="assistant-messages" role="log" aria-label="AI 대화 기록" aria-live="polite" onScroll={()=>{const el=scroll.current;if(el){follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;setShowLatest(!follow.current)}}}>
   {!a.messages.length&&<div className="assistant-welcome"><span className="assistant-welcome__icon"><Bot size={25}/></span><h2>어떤 일을 정리해 볼까요?</h2><p>일정을 만들고, 할 일을 찾고, 한 주를 돌아보세요.</p><div className="assistant-suggestions">{['내일 오후 3시에 회의 한 시간 등록해 줘','이번 주 일정 보여줘','이번 주 완료한 일은 몇 시간이야?'].map(text=><button key={text} onClick={()=>onDraft(text)}><span>{text}</span><ArrowUpRight size={14}/></button>)}</div></div>}
   {a.messages.map(m=><article key={m.id} className={`assistant-message assistant-message--${m.role}`}><small className="assistant-author">{m.role==='user'?'나':<><Bot size={14}/>AI 비서</>}</small><p>{m.text}</p>{!!m.result?.tasks?.length&&<div className="assistant-results"><div className="assistant-results__label"><Check size={14}/>{m.result.created?'등록한 일정':'조회한 항목'}<span>{m.result.tasks.length}</span></div>{m.result.tasks.map(t=><button className="assistant-task" key={t.id} onClick={()=>onOpen(t.id)}><CalendarDays size={16}/><span className="assistant-task__body"><strong>{t.title}</strong><span>{t.start_at?`${t.start_at.replace('T',' ')} ~ ${t.due_at?.replace('T',' ')}`:t.due_at?.replace('T',' ')||'날짜 없음'}</span></span><ArrowUpRight size={15}/></button>)}</div>}{m.result?.created&&<button className="assistant-undo" onClick={()=>void a.undo(m)}><RotateCcw size={13}/>등록 되돌리기</button>}</article>)}
   {a.busy&&<article className="assistant-message assistant-working"><div className="assistant-progress" role="status"><LoaderCircle size={15} className="assistant-spinner"/><span>{phaseLabels[a.progress.phase]}</span><time>{elapsed}초</time></div>{a.progress.phase==='generating'&&<small>응답 수신 중 · {a.progress.characters??0}자</small>}{a.progress.preview&&<p className="assistant-stream-text">{a.progress.preview}<span className="assistant-caret"/></p>}</article>}
   {a.error&&<div className="assistant-failure" role="alert"><strong>요청을 완료하지 못했어요</strong><p>{a.error}</p>{a.progress.preview&&<><small>중단 전 받은 답변</small><p>{a.progress.preview}</p></>}<div>{a.lastRequest&&<><button disabled={a.busy} onClick={()=>void submit(a.lastRequest)}><RefreshCw size={13}/>다시 시도</button><button onClick={()=>onDraft(a.lastRequest)}>입력으로 가져오기</button></>}<button disabled={a.busy||a.connecting} onClick={()=>void a.refresh()}>연결 확인</button></div></div>}
  </div>{showLatest&&<button className="assistant-latest" onClick={latest}><ArrowDown size={14}/>최신으로</button>}</div>
  <div className="assistant-compose-wrap"><div className="assistant-body__input"><textarea aria-label="AI에게 보낼 내용" placeholder={a.busy?'다음 요청을 미리 적어 두세요':'일정을 등록하거나 내 할 일을 물어보세요'} value={draft} maxLength={4000} onChange={e=>onDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!a.busy)void submit()}}}/><div><small>{a.busy?'작성 중인 내용은 전송되지 않아요':'Enter 전송 · Shift+Enter 줄바꿈'}</small>{a.busy?<button className="assistant-send" aria-label="응답 중단" title="응답 중단" onClick={a.cancel}><Square size={14} fill="currentColor"/></button>:<button className="assistant-send" aria-label="보내기" title="보내기" disabled={!a.model||!draft.trim()||a.connecting} onClick={()=>void submit()}><ArrowUp size={18}/></button>}</div></div><p className="assistant-footnote">맥미니에서 실행 · 등록된 내용은 결과 카드에서 확인할 수 있어요</p></div>
 </div>
}
