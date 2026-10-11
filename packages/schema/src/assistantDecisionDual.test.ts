import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TOOL_RESULT_HEAD } from './assistantTools.ts'
import { effectiveIntent, decisionPolicy, type RouteDecision } from './assistantDecision.ts'
import { route, emptyMemory } from './assistantRouter.ts'
import { runTurn, type TurnInput } from './assistantAgent.ts'
import { createTables, seedFixture, FIXTURE_NOW as now } from './assistantFixture.ts'
const decision = (kind: NonNullable<RouteDecision['target']>['kind'], confidence = .99): RouteDecision => ({ intent: 'write', confidence: .99, target: { kind, confidence } })
for (const kind of ['ambiguous','missing','na'] as const) assert.equal(effectiveIntent(decision(kind)), 'clarify')
for (const confidence of [.64, NaN, Infinity, -1, 1.01]) assert.equal(effectiveIntent(decision('explicit',confidence)), 'clarify')
assert.equal(effectiveIntent({...decision('explicit'),confidence:.635}), 'clarify')
assert.equal(effectiveIntent(decision('unique')), 'write')
assert.equal(effectiveIntent({...decision('na'),intent:'chat'}), 'chat')
const SQL = await initSqlJs(), database = new SQL.Database()
createTables((sql,args)=>database.run(sql,args as never));seedFixture((sql,args)=>database.run(sql,args as never))
const input: TurnInput = { text:'그거 완료로 해줘',now,history:[],memory:emptyMemory(),diary:false,name:'도토리',turn:'dual-test',db:{getAll:async(sql,args=[])=>{const q=database.prepare(sql);q.bind(args as never);const rows:any[]=[];while(q.step())rows.push(q.getAsObject());q.free();return rows}},chat:async()=>{throw new Error('unexpected model call')},routeDecision:decision('ambiguous') }
for (const kind of ['ambiguous','missing','na'] as const) {
 const r=await runTurn({...input,routeDecision:decision(kind)});assert.equal(r.calls,0);assert.equal(r.cards.length,0);assert.equal(r.confirm,undefined)
}
const create=await runTurn({...input,text:'내일 3시에 교수님 면담 잡아줘',routeDecision:decision('explicit')});assert.ok(create.cards.some(c=>c.type==='confirm'&&c.op==='create'))
const named=await runTurn({...input,text:'보고서 최종본 제출 완료로 해줘',routeDecision:decision('explicit')});assert.ok(named.cards.some(c=>c.type==='confirm'&&c.op==='complete'&&c.targets?.length===1))
database.run("INSERT INTO tasks (id,title,status,deleted_at) VALUES ('duplicate','보고서 최종본 제출',0,NULL)")
const duplicate=await runTurn({...input,text:'보고서 최종본 제출 완료로 해줘',routeDecision:decision('explicit')});assert.equal(duplicate.cards.length,0);assert.match(duplicate.text,/하나 지정/)
// The model cannot propose a mutation using an old alias without a fresh lookup.
const stale=emptyMemory();stale.aliases['T99']={id:'t-report',title:'보고서 최종본 제출',kind:'task'}
const blocked=await runTurn({...input,text:'요청을 진행해 주세요',memory:stale,routeDecision:decision('unique'),chat:async()=>({content:'',tool_calls:[{name:'propose_update',args:{id:'T99',action:'complete'}}]})});assert.match(blocked.text,/하나 지정/);assert.equal(blocked.cards.length,0)
// A broad lookup must not authorize choosing an arbitrary returned item.
let calls=0
const broad=await runTurn({...input,text:'요청을 진행해 주세요',routeDecision:decision('explicit'),chat:async(req)=>{
 calls++
 if(calls===1)return{content:'',tool_calls:[{name:'find_tasks',args:{status:'open'}}]}
 const m=req.messages.filter(m=>m.role==='tool').at(-1)!;const found=JSON.parse((m.content as string).slice(TOOL_RESULT_HEAD.length))
 return{content:'',tool_calls:[{name:'propose_update',args:{id:found.tasks[0].id,action:'delete'}}]}
}});assert.match(broad.text,/하나 지정/);assert.ok(!broad.cards.some(c=>c.type==='confirm'))
// A fresh unique lookup does permit a confirmation card (never a saved mutation).
calls=0
const unique=await runTurn({...input,text:'요청을 진행해 주세요',routeDecision:decision('unique'),chat:async(req)=>{
 calls++
 if(calls===1)return{content:'',tool_calls:[{name:'find_tasks',args:{query:'빨래',status:'open'}}]}
 if(calls===2){const m=req.messages.filter(m=>m.role==='tool').at(-1)!;const found=JSON.parse((m.content as string).slice(TOOL_RESULT_HEAD.length));return{content:'',tool_calls:[{name:'propose_update',args:{id:found.tasks[0].id,action:'complete'}}]}}
 return{content:'확인해 줘.',tool_calls:[]}
}});assert.ok(unique.cards.some(c=>c.type==='confirm'&&c.op==='complete'));assert.equal(unique.confirm,undefined)
const original=route('응',{now,diary:false,memory:emptyMemory(),pending:create.cards.find(c=>c.type==='confirm') as any});assert.equal(decisionPolicy(original,decision('ambiguous')).routed,original)
database.close();console.log('dual routing: ambiguity/confidence/create/unique/duplicate/stale alias/broad lookup/protected confirmation passed')
