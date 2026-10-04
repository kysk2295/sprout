import { UsageView } from './UsageView'
import { AssistantBody, type AssistantController } from './AssistantBody'
import { Bot, Network, Sprout, ArrowUpRight, X, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RailView } from './Rail'
import './workspace.css'

type AssistantProps = {assistant:AssistantController;onOpen:(id:string)=>void}
type Props = AssistantProps & {view:RailView;onView:(view:RailView)=>void;draft:string;onDraft:(text:string)=>void}
const content = {
 growth: {title:'성장',icon:Sprout,description:'완료한 일들이 나의 성장으로 이어지는 공간',status:'성장 기능 준비 중',items:['주간 목표와 진행 상황','완료 기록을 바탕으로 한 주간 리포트','XP와 캐릭터 성장']},
 map: {title:'작업 지도',icon:Network,description:'학교, 회사, 개인의 할 일과 일정을 한눈에',status:'AI 자동 분류 연결 전',items:['AI가 생활 영역부터 과목·프로젝트까지 자동 분류','주제를 펼쳐 관련 할 일과 일정 탐색','분류를 직접 수정하면 다음 정리에서도 우선 반영']},
}
export function WorkspaceView({view,onView,draft,onDraft,assistant,onOpen}:Props){
 if(view==='usage')return <UsageView/>
 if(view==='assistant')return <main className="workspace"><header><h1>AI 비서</h1><p>할 일 정리부터 일정 등록, 완료 기록 조회까지</p></header><AssistantBody draft={draft} onDraft={onDraft} assistant={assistant} onOpen={onOpen}/></main>
 const data=content[view as keyof typeof content]
 if(!data)return null
 const Icon=data.icon
 return <main className="workspace"><header><h1>{data.title}</h1><p>{data.description}</p></header><section className="workspace__body"><div className="workspace__intro"><Icon size={32}/><span className="workspace__status">{data.status}</span><h2>{data.description}</h2><ul>{data.items.map(item=><li key={item}>{item}</li>)}</ul>{view==='map'&&<button onClick={()=>onView('tasks')}>할 일 목록 열기 <ArrowUpRight size={16}/></button>}</div></section></main>
}
export function AssistantLauncher({view,onView,draft,onDraft,assistant,onOpen}:AssistantProps & {view:RailView;onView:(v:RailView)=>void;draft:string;onDraft:(v:string)=>void}){
 const [open,setOpen]=useState(false),[blocked,setBlocked]=useState(false)
 useEffect(()=>{const check=()=>setBlocked(!!document.querySelector('[aria-modal="true"], .popover'));check();const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!blocked)setOpen(false)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[blocked])
 if(view==='assistant'||blocked)return null
 return <><button className={`assistant-fab${view==='notes'?' assistant-fab--notes':''}`} aria-label={open?'AI 빠른 창 닫기':'AI 빠른 창 열기'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<MessageCircle/>}</button>{open&&<aside className="assistant-quick" aria-label="AI 빠른 대화"><header><strong>AI 비서</strong><button aria-label="AI 비서 전체 화면" onClick={()=>{setOpen(false);onView('assistant')}}><ArrowUpRight size={18}/></button><button aria-label="대화창 닫기" onClick={()=>setOpen(false)}><X size={18}/></button></header><AssistantBody draft={draft} onDraft={onDraft} assistant={assistant} onOpen={onOpen}/></aside>}</>
}
