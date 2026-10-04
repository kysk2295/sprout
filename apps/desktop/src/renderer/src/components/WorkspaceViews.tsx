import { Bot, Network, BookOpen, Sprout, Gauge, ArrowUpRight, X, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RailView } from './Rail'
import './workspace.css'

type Props = {view:RailView;onView:(view:RailView)=>void;draft:string;onDraft:(text:string)=>void}
const content = {
 growth: {title:'성장',icon:Sprout,description:'완료한 일들이 나의 성장으로 이어지는 공간',status:'성장 기능 준비 중',items:['주간 목표와 진행 상황','완료 기록을 바탕으로 한 주간 리포트','XP와 캐릭터 성장']},
 map: {title:'작업 지도',icon:Network,description:'학교, 회사, 개인의 할 일과 일정을 한눈에',status:'AI 자동 분류 연결 전',items:['AI가 생활 영역부터 과목·프로젝트까지 자동 분류','주제를 펼쳐 관련 할 일과 일정 탐색','분류를 직접 수정하면 다음 정리에서도 우선 반영']},
 wiki: {title:'주제 위키',icon:BookOpen,description:'쌓인 메모를 주제별로 모아 정리하는 공간',status:'위키 생성 기능 준비 중',items:['필요할 때 AI로 정리하기','요약에서 원본 메모와 연결된 작업 열기','직접 수정한 내용 보호와 갱신 이력']},
 usage: {title:'AI 사용량',icon:Gauge,description:'여러 AI 계정의 남은 구독 한도와 초기화 시간',status:'계정 연결 기능 준비 중',items:['계정별 한도와 초기화 시간','서비스마다 여러 계정을 함께 표시','CodexBar 방식의 공급자별 한도 조회']}
}
export function WorkspaceView({view,onView,draft,onDraft}:Props){
 if(view==='assistant')return <main className="workspace"><header><h1>AI 비서</h1><p>할 일 정리부터 일정 등록, 완료 기록 조회까지</p></header><AssistantBody draft={draft} onDraft={onDraft}/></main>
 const data=content[view as keyof typeof content]
 if(!data)return null
 const Icon=data.icon
 return <main className="workspace"><header><h1>{data.title}</h1><p>{data.description}</p></header><section className="workspace__body"><div className="workspace__intro"><Icon size={32}/><span className="workspace__status">{data.status}</span><h2>{data.description}</h2><ul>{data.items.map(item=><li key={item}>{item}</li>)}</ul>{view==='wiki'&&<button onClick={()=>onView('notes')}>메모함 열기 <ArrowUpRight size={16}/></button>}{view==='map'&&<button onClick={()=>onView('tasks')}>할 일 목록 열기 <ArrowUpRight size={16}/></button>}</div>{view==='usage'&&<div className="workspace__accounts">{['GPT / Codex','Claude','Grok','Gemini'].map(name=><article key={name}><h3>{name}</h3><p>연결된 계정 없음</p><small>연결 후 조회 가능한 한도가 여기에 표시돼요.</small></article>)}</div>}</section></main>
}
function AssistantBody({draft,onDraft}:{draft:string;onDraft:(text:string)=>void}){
 return <div className="assistant-body"><div className="assistant-body__empty"><Bot size={32}/><h2>내 일정과 할 일을 함께 정리해요</h2><p>아직 AI 모델이 연결되지 않았어요.<br/>연결 후 일정 등록과 기록 조회를 사용할 수 있어요.</p><div className="assistant-body__prompts">{['내일 오후 3시에 회의 한 시간 등록해 줘','이번 주 완료한 업무를 보여줘'].map(text=><button key={text} onClick={()=>onDraft(text)}>{text}</button>)}</div></div><div className="assistant-body__input"><textarea aria-label="AI에게 보낼 내용" placeholder="연결 후 물어보고 싶은 내용을 적어 두세요" value={draft} onChange={e=>onDraft(e.target.value)}/><div><small>모델 미연결 · 입력 초안만 보관돼요</small><button disabled>보내기</button></div></div></div>
}
export function AssistantLauncher({view,onView,draft,onDraft}:{view:RailView;onView:(v:RailView)=>void;draft:string;onDraft:(v:string)=>void}){
 const [open,setOpen]=useState(false),[blocked,setBlocked]=useState(false)
 useEffect(()=>{const check=()=>setBlocked(!!document.querySelector('[aria-modal="true"], .popover'));check();const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!blocked)setOpen(false)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[blocked])
 if(view==='assistant'||blocked)return null
 return <><button className={`assistant-fab${view==='notes'?' assistant-fab--notes':''}`} aria-label={open?'AI 빠른 창 닫기':'AI 빠른 창 열기'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<MessageCircle/>}</button>{open&&<aside className="assistant-quick" aria-label="AI 빠른 대화"><header><strong>AI 비서</strong><button aria-label="AI 비서 전체 화면" onClick={()=>{setOpen(false);onView('assistant')}}><ArrowUpRight size={18}/></button><button aria-label="대화창 닫기" onClick={()=>setOpen(false)}><X size={18}/></button></header><AssistantBody draft={draft} onDraft={onDraft}/></aside>}</>
}
