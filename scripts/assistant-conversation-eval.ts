import {createServer} from 'node:http'
import {appendFileSync,writeFileSync,readFileSync} from 'node:fs'
import initSqlJs from 'sql.js'
import {createAi,aiConfigFromEnv,memoryUsageStore} from '../server/api/src/ai.ts'
import {directBackend} from '../server/api/src/ai-backend.ts'
import {runTurn} from '../packages/schema/src/assistantAgent.ts'
import {emptyMemory} from '../packages/schema/src/assistantRouter.ts'
import {createTables,seedFixture,FIXTURE_NOW} from '../packages/schema/src/assistantFixture.ts'
const old=process.env.BASELINE_ROOT
if(!old)throw Error('BASELINE_ROOT required; isolated checkout of previous revision')
const {createAi:oldAi}=await import(old+'/server/api/src/ai.ts')
const {runTurn:oldTurn}=await import(old+'/packages/schema/src/assistantAgent.ts')
const out=process.env.OUT_FILE!
if(!out)throw Error('OUT_FILE required')
const personaMode=process.env.PERSONA_EVAL==='1'
const cases=process.env.CASE_FILE?JSON.parse(readFileSync(process.env.CASE_FILE,'utf8')):personaMode ? ['snail','bee','worm','frog'].map(species=>({id:species,species,name:'모모',lines:['너는 어떤 친구야? 취미도 알려줘','그 취미에서 뭐가 제일 좋아?','오늘은 지쳤어. 해결책 말고 그냥 내 얘기를 들어줬으면 해','할 일 이야기는 말고, 아까 네가 말한 취미를 한 문장으로 다시 말해줘']})) : [
 {id:'persona',name:'모모',lines:['너 모모의 취미가 뭐야?','어떤 이야기를 상상하는데?','그 이야기의 주인공 이름을 하나 지어줘','그 주인공이 왜 떠난 거야?','내 취미 말고 네 취미를 물어본 거였어']},
 {id:'comfort',name:'도토리',lines:['공부하다 지쳤어. 잠깐 쉬고 싶어.','밖에는 나가기 싫어','몸을 움직이는 것도 싫어. 조용한 게 좋아','그럼 음악 듣는 건 어떨까?','이제 다른 얘기하자. 광합성이 뭐야?']},
 {id:'memory',name:'별이',lines:['우리 엄마 이름은 지연이야. 같이 영화를 보려고 해.','어머니 이름이 뭐였지?','엄마는 무서운 영화를 싫어해','그럼 어떤 장르가 좋겠어?','아까 말한 이름과 싫어하는 장르를 정리해줘']},
 {id:'health',name:'콩이',lines:['두통약은 보통 어떤 종류가 있어?','약 이름을 무조건 말 못 하는 건 아니지? 일반적인 차이만 궁금해','그러면 잠을 충분히 자는 건 왜 중요해?','잠들기 전 화면 밝기는 어떻게 하는 게 좋아?','내가 실제로 약을 먹었다는 말은 안 했어. 기억해줘']},
 {id:'economy',name:'루루',lines:['복리가 뭐야?','단리랑 어떻게 달라?','비유로 설명해줘','그 비유를 더 짧게 말해줘','새 주제로 넘어갈게. 너 이름이 뭐야?']},
 {id:'tasks',name:'모모',lines:['오늘 해야 할 일 보여줘','보고서 최종본 제출 완료로 해줘','취소','그냥 쉬고 싶다는 말이었어','이제 일 얘기 말고 짧은 우주 이야기를 해줘']},
]
writeFileSync(out.replace(/\.jsonl$/,'.cases.json'),JSON.stringify(cases,null,2))
const SQL=await initSqlJs()
for(const variant of (personaMode || process.env.CANDIDATE_ONLY==='1'?['candidate']:['baseline','candidate'])){
 const ai=(variant==='baseline'?oldAi:createAi)({routing:true,config:{...aiConfigFromEnv({}),perMinute:1000,perDay:1000},store:memoryUsageStore(),auth:async()=>`synthetic-${variant}`,backend:directBackend(process.env.GATEWAY_URL??'http://127.0.0.1:28511')})
 const server=createServer((q,s)=>void ai.handle(q,s,q.url!));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(server.address() as any).port}/ai/assistant`
 try{for(const scenario of cases.filter(c=>!process.env.CASE_ONLY||c.id===process.env.CASE_ONLY)){
  const db=new SQL.Database();createTables((s,a)=>db.run(s,a as never));seedFixture((s,a)=>db.run(s,a as never));let memory=emptyMemory(),history:any[]=(scenario.history??[]).map((h:any)=>({...h})),pending:any=null
  try{for(const [n,text] of scenario.lines.entries()){
   const turn=`eval-${variant}-${scenario.id}-${n}`;const start=Date.now();let decision:any,modelCalls=0
   const post=async(body:any)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-sprout-turn':turn},body:JSON.stringify(body)});if(!r.ok)throw Error(`HTTP ${r.status} ${await r.text()}`);return r.json()}
   try{
    const result=await (variant==='baseline'?oldTurn:runTurn)({text,now:FIXTURE_NOW,name:scenario.name,species:'species' in scenario?scenario.species:undefined,history,memory,pending,diary:false,turn,
     db:{getAll:async(s:string,a:any[]=[])=>{const q=db.prepare(s);try{q.bind(a);const rows=[];while(q.step())rows.push(q.getAsObject());return rows}finally{q.free()}}},
     classify:async()=>{const r=await post({mode:'route',text,history:history.slice(-2).map(h=>({user:h.user.slice(0,300),assistant:h.assistant.slice(0,300)})),...((variant==='candidate'||process.env.BASELINE_HAS_PERSONAS==='1')?{name:scenario.name}:{}),stream:false});return decision=JSON.parse(r.message.content)},
     chat:async(req:any)=>{modelCalls++;const r=await post({mode:'agent',messages:req.messages,tools:req.tools,...((variant==='candidate'||process.env.BASELINE_HAS_PERSONAS==='1')?{species:req.species}:{}),stream:false});return{content:r.message.content,tool_calls:(r.message.tool_calls??[]).map((c:any)=>({name:c.function.name,args:c.function.arguments}))}}
    })
    appendFileSync(out,JSON.stringify({variant,case:scenario.id,turn:n+1,input:text,decision,answer:result.text,raw:result.raw,ms:Date.now()-start,modelCalls,chips:result.chips,cards:result.cards,grounding:result.grounding})+'\n')
    history.push({user:text,assistant:result.text});memory=result.memory;pending=result.confirm?null:result.cards.find((c:any)=>c.type==='confirm')??pending
   }catch(e){appendFileSync(out,JSON.stringify({variant,case:scenario.id,turn:n+1,input:text,ms:Date.now()-start,error:String(e)})+'\n')}
   console.log(variant,scenario.id,n+1)
  }}finally{db.close()}
 }}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
}
