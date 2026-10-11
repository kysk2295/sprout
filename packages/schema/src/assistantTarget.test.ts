import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { taskReference } from './assistantTarget.ts'
import { effectiveIntent, type RouteDecision } from './assistantDecision.ts'
import { emptyMemory } from './assistantRouter.ts'
import { runTurn, type TurnInput } from './assistantAgent.ts'
import { createTables,seedFixture,FIXTURE_NOW as now } from './assistantFixture.ts'
const decision: RouteDecision={intent:'write',confidence:.999,resolution:'lookup',target:{kind:'missing',confidence:.999}}
assert.equal(effectiveIntent(decision),'write')
assert.equal(taskReference('그거 완료해줘',{ids:['a','b'],total:2}).id,undefined)
assert.equal(taskReference('그중 두 번째 삭제해줘',{ids:['a','b'],total:2}).id,'b')
assert.equal(taskReference('그거 완료해줘',{ids:['a'],total:10}).id,undefined)
const SQL=await initSqlJs(),db=new SQL.Database()
createTables((s,a)=>db.run(s,a as never));seedFixture((s,a)=>db.run(s,a as never))
const input: TurnInput={text:'',now,history:[],memory:emptyMemory(),diary:false,name:'도토리',turn:'lookup-test',routeDecision:decision,db:{getAll:async(s,a=[])=>{const q=db.prepare(s);q.bind(a as never);const rows:any[]=[];while(q.step())rows.push(q.getAsObject());q.free();return rows}},chat:async()=>{throw new Error('Unexpected model call')}}
for(const [id,text,op] of [['F11','내일 3시에 교수님 면담 잡아줘','create'],['F13','보고서 최종본 제출 완료로 해줘','complete'],['F14','빨래 내일로 미뤄줘','move'],['F15','동아리 회비 정리 지워줘','delete']]) {
 const r=await runTurn({...input,text});assert.ok(r.cards.some(c=>c.type==='confirm'&&c.op===op),id);assert.equal(r.confirm,undefined)
}
const read=await runTurn({...input,text:'빨래 찾아줘',routeDecision:{intent:'read',confidence:.99,resolution:'lookup'},chat:async(req)=> req.call===1?{content:'',tool_calls:[{name:'find_tasks',args:{query:'빨래',status:'open'}}]}:{content:'빨래가 있어.',tool_calls:[]}})
assert.deepEqual(read.memory.taskLookup,{ids:['t-laundry'],total:1})
const one=await runTurn({...input,text:'그거 완료해줘',memory:read.memory});assert.ok(one.cards.some(c=>c.type==='confirm'&&c.targets?.[0].id==='t-laundry'))
const two={...read.memory,taskLookup:{ids:['t-laundry','t-report'],total:2}}
const many=await runTurn({...input,text:'그거 완료해줘',memory:two});assert.equal(many.cards.length,0);assert.match(many.text,/하나 지정/)
const ordinal=await runTurn({...input,text:'그중 두 번째 삭제해줘',memory:two});assert.ok(ordinal.cards.some(c=>c.type==='confirm'&&c.targets?.[0].id==='t-report'))
const missing=await runTurn({...input,text:'그거 완료해줘'});assert.equal(missing.cards.length,0)
const chat=await runTurn({...input,text:'고마워',memory:read.memory,routeDecision:{intent:'chat',confidence:.99,resolution:'lookup'},chat:async()=>({content:'천만에!',tool_calls:[]})});assert.equal(chat.memory.taskLookup,undefined)
const stale=await runTurn({...input,text:'그거 완료해줘',memory:chat.memory});assert.equal(stale.cards.length,0)
db.run("UPDATE tasks SET deleted_at='2026-10-11' WHERE id='t-laundry'")
const gone=await runTurn({...input,text:'그거 완료해줘',memory:read.memory});assert.equal(gone.cards.length,0)
db.run("INSERT INTO tasks (id,title,status) VALUES ('duplicate','보고서 최종본 제출',0)")
const duplicate=await runTurn({...input,text:'보고서 최종본 제출 완료로 해줘'});assert.equal(duplicate.cards.length,0)
assert.equal(duplicate.memory.taskLookup,undefined)
const invented=await runTurn({...input,text:'요청을 진행해 주세요',chat:async()=>({content:'',tool_calls:[{name:'find_tasks',args:{query:'보고서',status:'open'}}]})});assert.equal(invented.cards.length,0);assert.match(invented.text,/하나 지정/)
const nameless=await runTurn({...input,text:'삭제해줘'});assert.equal(nameless.cards.length,0)
const draft=await runTurn({...input,text:'동생에게 보낼 예약 취소 문자 초안을 부탁해. 실제 취소는 하지 마',chat:async req=>{assert.deepEqual(req.tools,[]);return{content:'취소 안내 문자 초안이야.',tool_calls:[]}}});assert.equal(draft.cards.length,0);assert.equal(draft.chips.length,0)
let classifications=0
const classified=await runTurn({...input,text:'안녕',routeDecision:undefined,classify:async()=>{classifications++;return {intent:'chat',confidence:.99,resolution:'lookup'}},chat:async req=>{assert.deepEqual(req.tools,[]);return {content:'안녕!',tool_calls:[]}}})
assert.equal(classifications,1);assert.equal(classified.cards.length,0)
await assert.rejects(runTurn({...input,text:'안녕',routeDecision:undefined,classify:async()=>{throw new Error('routing unavailable')}}),/routing unavailable/)
await runTurn({...input,text:'지난주 일기에 내가 뭐 힘들다고 했었지?',routeDecision:undefined,classify:async()=>{throw new Error('privacy route must bypass classifier')}})
const events: unknown[]=[]
const checked=await runTurn({...input,text:'안녕',routeDecision:{intent:'chat',confidence:.99,resolution:'lookup'},onEvent:e=>events.push(e),chat:async(req,h)=>{assert.ok(!req.messages[0].content.includes('날짜표'));h.onDelta('안녕! 할 일이 20개 있어.');return {content:'안녕! 할 일이 20개 있어.',tool_calls:[]}}})
assert.equal(checked.text,'안녕!');assert.ok(checked.grounding.hits>0)
assert.ok(!events.some((e:any)=>e.type==='delta'),'unchecked answer must never reach the UI')
const uncertain=await runTurn({...input,text:'보고서 최종본 제출 삭제해줘',routeDecision:{intent:'write',confidence:.4,resolution:'lookup'},chat:async req=>{assert.deepEqual(req.tools,[]);return {content:'어떤 보고서를 말하는지 알려 줄래?',tool_calls:[]}}})
assert.equal(uncertain.cards.length,0);assert.equal(uncertain.chips.length,0);assert.equal(uncertain.calls,1)
db.close();console.log('lookup routing: F11/F13/F14/F15, real lookup snapshot, unique/multiple/ordinal/missing/stale/deleted/duplicate targets passed')
