import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createAi, aiConfigFromEnv, memoryUsageStore } from './ai.ts'
import { routeRequest, parseRouteDecision, assistantSelfQuestion } from '../../../packages/schema/src/assistantDecision.ts'
for (const text of ['너는 취미가 뭐니','아니 너 취미 있잖아','내 취미 말고, 너 수달의 취미가 뭐야?']) assert.equal(assistantSelfQuestion(text),true)
for (const text of ['내 취미 관련 메모 찾아줘','너 내 할 일 보여줘','너는 취미가 뭐니? 내일 운동 추가해줘']) assert.equal(assistantSelfQuestion(text),false)
const bodies: Record<string, unknown>[] = []
const store = memoryUsageStore()
let malformed = false
const ai = createAi({ routing: true, config: { ...aiConfigFromEnv({}), perMinute: 100, perDay: 100 }, store,
  auth: async req => { if (req.headers.authorization !== 'Bearer test') throw new Error('unauthorized'); return 'route-test' },
  backend: { name: 'direct', tags: async () => ({models:[{name:'qwen3.5:9b'}]}), chat: async body => {
    bodies.push(body)
    const content = body.sprout_route ? JSON.stringify(malformed ? {intent:'write',confidence:2} : {intent:(body.sprout_route as {text:string}).text.includes('너')?'read':'chat',confidence:.99,resolution:'lookup'}) : 'hello'
    return new Response(JSON.stringify({message:{role:'assistant',content},done:true})+'\n')
  } }
})
const server = createServer((req,res) => void ai.handle(req,res,req.url!))
await new Promise<void>(r => server.listen(0,'127.0.0.1',r))
const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`
const call=(body:unknown,turn='route-test-123',auth=true)=>fetch(url+'/ai/assistant',{method:'POST',headers:{'content-type':'application/json','x-sprout-turn':turn,...(auth?{authorization:'Bearer test'}:{})},body:JSON.stringify(body)})
try {
 const input=routeRequest('안녕',[{user:'a'.repeat(400),assistant:'b'.repeat(400)}])
 assert.equal(input.history[0].user.length,300)
 assert.equal((await call(input,'unauth-123',false)).status,401)
 assert.equal((await call({...input,history:[...input.history,...input.history,...input.history]},'bad-size-123')).status,400)
 let r=await call(input);assert.equal(r.status,200)
 assert.equal(parseRouteDecision(JSON.parse((await r.json()).message.content)).intent,'chat')
 assert.deepEqual(bodies[0].sprout_route,{text:input.text,history:input.history})
 assert.equal((await call(input)).status,400,'duplicate classification in one turn is rejected')
 for(let i=0;i<4;i++) {
  r=await call({mode:'agent',messages:[{role:'user',content:'hello'}],tools:[],stream:false});assert.equal(r.status,200)
 }
 assert.equal((await call({mode:'agent',messages:[{role:'user',content:'hello'}],tools:[],stream:false})).status,429)
 assert.equal(bodies[1].sprout_assistant,true)
 assert.match((bodies[1].messages as {content:string}[])[0].content,/사용자와 이야기/)
 assert.ok(!(bodies[1].messages as {content:string}[])[0].content.includes('propose_'))
 assert.equal(await store.count('route-test','2000-01-01'),1,'classification plus four calls count as one turn')
 r=await call(routeRequest('아니 너 취미 있잖아',[]),'self-guard-123');assert.equal(r.status,200);const guarded=parseRouteDecision(JSON.parse((await r.json()).message.content));assert.equal(guarded.intent,'chat');assert.equal(guarded.source,'self_reference_guard')
 r=await call({mode:'agent',messages:[{role:'user',content:'old user'},{role:'assistant',content:'old mistaken answer'},{role:'user',content:'너는 취미가 뭐니'}],tools:[],stream:false},'self-guard-123');assert.equal(r.status,200);assert.equal((bodies.at(-1)!.messages as unknown[]).length,2,'self-contained persona question excludes erroneous old replies')
 malformed=true;r=await call(input,'malformed-123');assert.equal(r.status,503,'invalid decision fails closed')
 console.log('routing: auth, bounds, queue/turn accounting, four answer calls, malformed response passed')
} finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
