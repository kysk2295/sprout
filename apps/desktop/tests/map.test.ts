// 14 작업 지도: 고리 거부 · AI 출력 검증 · 직접 옮긴 것 보호 · 합치기/삭제 → 미분류 · 되돌리기 스냅숏
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { createTask, run } from '../src/renderer/src/data/mutations'
import {
  wouldCycle, planClassification, parseAiJson, planStmts, cleanName, buildTree, layoutMap, highlightSet, filterTasks,
  createAreaStmts, renameAreaStmts, placeTaskStmts, mergeAreaStmts, deleteAreaStmts, pruneEmptyAiStmts,
  takeSnapshot, restoreStmts, readMap, connect, acceptLink, dropLink, classifyTasks, reorganize, undoReorganize,
  type MapArea, type TaskArea, type MapLink, type MapTask
} from '../src/renderer/src/data/map'
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql:string, params:unknown[]=[]) => {const s=db.prepare(sql);s.bind(params as never);const r:Record<string,unknown>[]=[];while(s.step())r.push(s.getAsObject());s.free();return r}
const store = new Map<string,string>()
Object.assign(globalThis,{localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)},window:{sprout:{db:{getAll:async(sql:string,p?:unknown[])=>all(sql,p),get:async(sql:string,p?:unknown[])=>all(sql,p)[0]??null,transaction:async(stmts:{sql:string;params?:unknown[]}[])=>{db.run('BEGIN');try{for(const s of stmts)db.run(s.sql,s.params as never);db.run('COMMIT')}catch(e){db.run('ROLLBACK');throw e}}}}}})
const tick = () => new Promise((r) => setTimeout(r, 5))

// ── 고리 검사 ──
const seq = (from_id:string,to_id:string,state:MapLink['state']='accepted') => ({kind:'sequence' as const,from_id,to_id,state})
assert.equal(wouldCycle([], 'a', 'a'), true)
assert.equal(wouldCycle([seq('a','b')], 'b', 'a'), true)
assert.equal(wouldCycle([seq('a','b'),seq('b','c')], 'c', 'a'), true)
assert.equal(wouldCycle([seq('a','b'),seq('b','c')], 'a', 'c'), false)
assert.equal(wouldCycle([seq('a','b','dismissed')], 'b', 'a'), false, '무시한 제안은 고리로 셈하지 않는다')
assert.equal(wouldCycle([{kind:'goal',from_id:'a',to_id:'b',state:'accepted'}], 'b', 'a'), false)

// ── 이름 규칙 ──
assert.equal(cleanName('  학교  과제 '), '학교 과제')
assert.equal(cleanName(''), null)
assert.equal(cleanName('가'.repeat(21)), null)
assert.equal(cleanName('가'.repeat(20)), '가'.repeat(20))

// ── AI 출력 검증 ──
let n = 0
const id = () => `n${++n}`
const area = (id:string,name:string,parent_id:string|null=null,source='ai'):MapArea => ({id,name,parent_id,sort_order:1,source,color:null,archived_at:null})
{
  const ctx = {
    tasks:new Map([['t1','A'],['t2','B'],['t3','C'],['t4','D'],['t5','E']]),
    goals:new Map([['g1','K']]),
    areas:[area('school','학교'),area('os','운영체제','school')],
    taskAreas:[{id:'E',task_id:'E',area_id:'os',source:'user',state:'ok',run_id:null}] as TaskArea[],
    links:[{id:'x',kind:'sequence',from_type:'task',from_id:'C',to_id:'D',source:'ai',state:'dismissed'}] as MapLink[]
  }
  const plan = planClassification({
    items:[
      {id:'t1',area:' 학교 ',topic:'운영체제',confidence:0.9}, // 이미 있는 영역·주제(공백 무시)
      {id:'t2',area:'회사',topic:'결제 리뉴얼',confidence:0.8}, // 새 영역 + 새 주제
      {id:'t3',area:'개인',topic:'',confidence:0.3}, // 확신 낮음 → 미분류·확인 필요
      {id:'t4',area:'가'.repeat(25),topic:'',confidence:0.9}, // 이름이 너무 김 → 확인 필요
      {id:'t5',area:'학교',topic:'',confidence:0.9}, // 직접 옮긴 할 일 → 건드리지 않음
      {id:'zz',area:'학교',topic:'',confidence:0.9}, // 없는 id → 버림
      {id:'t1',area:'회사',topic:'',confidence:0.9} // 같은 할 일 두 번 → 처음 것만
    ],
    sequences:[{before:'t1',after:'t2'},{before:'t2',after:'t1'},{before:'t3',after:'t4'},{before:'t1',after:'t1'},{before:'t1',after:'nope'}],
    goals:[{goal:'g1',task:'t2'},{goal:'g9',task:'t1'}]
  }, ctx, id)
  assert.deepEqual(plan.assign.map(a=>[a.task_id,a.area_id,a.state]), [['A','os','ok'],['B',plan.areas[1].id,'ok'],['C',null,'review'],['D',null,'review']])
  assert.deepEqual(plan.areas.map(a=>[a.name,a.parent_id]), [['회사',null],['결제 리뉴얼',plan.areas[0].id]])
  // 순서 제안: A→B만(반대 방향·무시했던 C→D·자기 자신·없는 id 거부)
  assert.deepEqual(plan.links.map(l=>[l.kind,l.from_id,l.to_id]), [['sequence','A','B'],['goal','K','B']])
  // 저장: 직접 옮긴 행은 계획에 있어도 쓰지 않는다
  const stmts = planStmts({...plan,assign:[...plan.assign,{task_id:'E',area_id:'school',state:'ok'}]}, ctx.taskAreas, 'run1')
  assert.equal(stmts.some(s=>s.params?.includes('E') && /task_areas/.test(s.sql)), false)
}
{
  // 영역은 8개까지: 넘으면 확인 필요로
  const areas = Array.from({length:8},(_,i)=>area(`a${i}`,`영역${i}`))
  const plan = planClassification({items:[{id:'t1',area:'새 영역',topic:'',confidence:1},{id:'t2',area:'영역3',topic:'x',confidence:1}]}, {tasks:new Map([['t1','A'],['t2','B']]),goals:new Map(),areas,taskAreas:[],links:[]}, id)
  assert.deepEqual(plan.assign.map(a=>[a.area_id,a.state]), [[null,'review'],[plan.areas[0].id,'ok']])
  // 주제도 영역당 8개까지: 넘으면 영역 바로 아래로
  const topics = Array.from({length:8},(_,i)=>area(`p${i}`,`주제${i}`,'a3'))
  const p2 = planClassification({items:[{id:'t1',area:'영역3',topic:'아홉째',confidence:1}]}, {tasks:new Map([['t1','A']]),goals:new Map(),areas:[...areas,...topics],taskAreas:[],links:[]}, id)
  assert.deepEqual(p2.assign.map(a=>a.area_id), ['a3'])
  assert.equal(p2.areas.length, 0)
  // 작은 모델이 입력 모양(tasks[])으로 답하거나 확신을 빠뜨려도 받는다(빠뜨림 = 보통 0.7)
  const loose = planClassification(parseAiJson('```json\n{"tasks":[{"id":"t1","area":"영역3","topic":""}]}\n```'), {tasks:new Map([['t1','A']]),goals:new Map(),areas,taskAreas:[],links:[]}, id)
  assert.deepEqual(loose.assign.map(a=>[a.area_id,a.state]), [['a3','ok']])
  // 서버가 스키마를 강제하지 못할 때(Ollama think=false): 맨 배열 = items, 앞뒤 설명 글은 걷어 낸다. JSON이 없으면 던진다
  assert.deepEqual(parseAiJson('[{"id":"t1","area":"영역3"}]').items, [{id:'t1',area:'영역3'}])
  assert.deepEqual(parseAiJson('분류 결과:\n{"items":[{"id":"t1","area":"영역3"}]} 끝').items, [{id:'t1',area:'영역3'}])
  assert.throws(()=>parseAiJson('모르겠어요'))
  // 엉뚱한 모양은 무시
  assert.deepEqual(planClassification({items:'x' as never,sequences:null as never}, {tasks:new Map(),goals:new Map(),areas:[],taskAreas:[],links:[]}).assign, [])
}

// ── 나무·배치·강조 ──
const task = (id:string,extra:Partial<MapTask>={}):MapTask => ({id,title:id,status:0,due_at:null,start_at:null,priority:0,list_id:'L',completed_at:null,created_at:null,...extra})
{
  const areas = [area('s','학교'),area('os','운영체제','s'),area('old','지난 학기','s')]
  areas[2].archived_at = '2026-01-01'
  const rows:TaskArea[] = [{id:'1',task_id:'1',area_id:'os',source:'ai',state:'ok',run_id:null},{id:'2',task_id:'2',area_id:'s',source:'user',state:'ok',run_id:null},{id:'3',task_id:'3',area_id:'gone',source:'ai',state:'ok',run_id:null},{id:'4',task_id:'4',area_id:'old',source:'ai',state:'ok',run_id:null}]
  const tree = buildTree(areas, rows, [task('1'),task('2'),task('3'),task('4'),task('5')])
  assert.deepEqual(tree.areas[0].topics.map(t=>t.tasks.map(x=>x.id)), [['1']])
  assert.deepEqual(tree.areas[0].direct.map(t=>t.id), ['2'])
  assert.deepEqual(tree.unclassified.map(t=>t.id), ['3','5'], '없어진 칸·행 없음 → 미분류, 보관 주제는 숨김')
  assert.equal(buildTree(areas, rows, [task('4')], {showArchived:true}).areas[0].topics.length, 2)
  const links:MapLink[] = [{id:'l',kind:'sequence',from_type:'task',from_id:'1',to_id:'2',source:'user',state:'accepted'}]
  const g = layoutMap({tree,links,goals:[{id:'K',title:'목표',target:1,progress:0,status:'active',week_start:'',achieved_at:null,source:'manual',sort_order:0}],collapsed:{},hasDate:()=>false})
  const node = (id:string) => g.nodes.find(x=>x.id===id)!
  assert.ok(node('root').y < node('area:s').y && node('area:s').y < node('topic:os').y && node('topic:os').y < node('task:1').y, '위 → 아래 층')
  assert.equal(node('task:1').x, node('topic:os').x + 12, '주제 아래 세로로 쌓고 왼쪽 줄기선')
  assert.ok(g.edges.some(e=>e.kind==='seq' && e.source==='task:1' && e.target==='task:2'))
  assert.ok(node('goal:K').y > node('task:1').y, '목표 줄은 맨 아래')
  const hl = highlightSet(g.edges, 'topic:os')
  assert.ok(hl.has('area:s') && hl.has('root') && hl.has('task:1') && !hl.has('task:2'))
  // 접기
  const folded = layoutMap({tree,links:[],goals:[],collapsed:{'area:s':true},hasDate:()=>false})
  assert.equal(folded.nodes.some(x=>x.id==='topic:os'), false)
}
{
  // 기간: 이번 주 = 이번 주 날짜 + 날짜 없음 + 이번 주 완료
  const today = '2026-10-07' // 수요일, 주 시작 10-04(일)
  const f = {period:'week' as const,showDone:false,showNoDate:true,lists:null}
  const ts = [task('in',{due_at:'2026-10-08'}),task('next',{due_at:'2026-10-12'}),task('none'),task('done',{status:1,completed_at:new Date('2026-10-05T10:00').toISOString()}),task('old',{status:1,completed_at:new Date('2026-09-01T10:00').toISOString()})]
  assert.deepEqual(filterTasks(ts, f, today).map(t=>t.id), ['in','none','done'])
  assert.deepEqual(filterTasks(ts, {...f,period:'all'}, today).map(t=>t.id), ['in','next','none'])
  assert.deepEqual(filterTasks(ts, {...f,period:'all',showDone:true}, today).map(t=>t.id), ['in','next','none','done','old'])
  assert.deepEqual(filterTasks(ts, {...f,showNoDate:false}, today).map(t=>t.id), ['in'])
}

// ── DB: 직접 관리(AI 없이) ──
const L = 'list1'
const t1 = await createTask({title:'운영체제 과제',list_id:L})
const t2 = await createTask({title:'기획서 초안',list_id:L})
const t3 = await createTask({title:'기획서 검토',list_id:L})
let m = await readMap()
const school = createAreaStmts(m.areas, '학교')!
await run(...school.stmts)
m = await readMap()
assert.equal(createAreaStmts(m.areas, '   '), null)
const os = createAreaStmts(m.areas, '운영체제', school.id)!
await run(...os.stmts)
const work = createAreaStmts((await readMap()).areas, '회사')!
await run(...work.stmts)
m = await readMap()
assert.notEqual(m.areas.find(a=>a.id===work.id)!.color, m.areas.find(a=>a.id===school.id)!.color, '영역마다 다른 색')
await run(...placeTaskStmts(m.taskAreas, t1, os.id))
await run(...placeTaskStmts((await readMap()).taskAreas, t2, work.id))
m = await readMap()
assert.equal(m.taskAreas.find(r=>r.task_id===t1)!.source, 'user')
assert.equal(renameAreaStmts(school.id, '가'.repeat(21)), null)
await run(...renameAreaStmts(work.id, '인턴 · 회사')!)
assert.equal(all('SELECT name, source FROM map_areas WHERE id=?',[work.id])[0].name, '인턴 · 회사')
// 합치기: 회사 → 학교. 할 일이 따라간다
await run(...mergeAreaStmts((await readMap()).areas, (await readMap()).taskAreas, work.id, school.id))
m = await readMap()
assert.equal(m.areas.some(a=>a.id===work.id), false)
assert.equal(m.taskAreas.find(r=>r.task_id===t2)!.area_id, school.id)
// 같은 이름 주제는 하나로
const a2 = createAreaStmts(m.areas, '대학')!
await run(...a2.stmts)
const os2 = createAreaStmts((await readMap()).areas, '운영체제', a2.id)!
await run(...os2.stmts)
await run(...placeTaskStmts((await readMap()).taskAreas, t3, os2.id))
m = await readMap()
await run(...mergeAreaStmts(m.areas, m.taskAreas, a2.id, school.id))
m = await readMap()
assert.equal(m.taskAreas.find(r=>r.task_id===t3)!.area_id, os.id)
assert.equal(m.areas.filter(a=>a.parent_id===school.id).length, 1)
// 주제 삭제 → 영역 바로 아래, 영역 삭제 → 미분류(할 일은 그대로)
await run(...deleteAreaStmts(m.areas, m.taskAreas, os.id))
m = await readMap()
assert.equal(m.taskAreas.find(r=>r.task_id===t1)!.area_id, school.id)
await run(...deleteAreaStmts(m.areas, m.taskAreas, school.id))
m = await readMap()
assert.equal(m.areas.length, 0)
assert.deepEqual(m.taskAreas.map(r=>r.area_id), [null,null,null])
assert.equal(all('SELECT count(*) n FROM tasks WHERE deleted_at IS NULL')[0].n, 3)

// ── 연결선 ──
assert.equal(await connect('sequence', t2, t3), 'ok')
assert.equal(await connect('sequence', t3, t2), 'cycle')
assert.equal(await connect('sequence', t2, t3), 'exists')
await run({sql:"INSERT INTO map_links (id, kind, from_type, from_id, to_id, source, state) VALUES ('sg','sequence','task',?,?,'ai','suggested')",params:[t3,t1]})
assert.equal(await acceptLink('sg'), 'ok')
await run({sql:"INSERT INTO map_links (id, kind, from_type, from_id, to_id, source, state) VALUES ('bad','sequence','task',?,?,'ai','suggested')",params:[t1,t2]})
assert.equal(await acceptLink('bad'), 'cycle')
await dropLink('bad','suggested')
assert.equal(all("SELECT state FROM map_links WHERE id='bad'")[0].state, 'dismissed', '무시는 남겨 다시 제안하지 않음')
await dropLink('sg','accepted')
assert.equal(all("SELECT count(*) n FROM map_links WHERE id='sg'")[0].n, 0)

// ── AI 분류 + 직접 옮긴 것 보호 + ✦ 되돌리기 ──
// 사용자 영역 하나(이름 지음)와 직접 옮긴 할 일 하나
const mine = createAreaStmts((await readMap()).areas, '개인')!
await run(...mine.stmts)
await run(...placeTaskStmts((await readMap()).taskAreas, t1, mine.id))
const fake = (answer:object) => async (input:{messages:{content:string}[]}) => {
  const payload = JSON.parse(input.messages[1].content)
  assert.ok(payload.tasks.every((t:{title:string})=>t.title!=='운영체제 과제'), '직접 옮긴 할 일은 AI에 보내지 않는다')
  return JSON.stringify(answer)
}
await run({sql:'DELETE FROM map_links'})
await tick()
const res = await reorganize({signal:new AbortController().signal, chat:fake({items:[{id:'t1',area:'학교',topic:'졸업 프로젝트',confidence:0.9},{id:'t2',area:'학교',topic:'졸업 프로젝트',confidence:0.9}],sequences:[{before:'t1',after:'t2'}],goals:[]}) as never})
assert.equal(res.total, 2)
m = await readMap()
const grad = m.areas.find(a=>a.name==='졸업 프로젝트')!
assert.equal(m.taskAreas.find(r=>r.task_id===t2)!.area_id, grad.id)
assert.equal(m.taskAreas.find(r=>r.task_id===t1)!.area_id, mine.id, '직접 옮긴 카드는 그대로')
assert.equal(m.areas.find(a=>a.id===mine.id)!.name, '개인', '사용자 영역 이름은 그대로')
assert.ok(m.links.some(l=>l.state==='suggested' && l.source==='ai'))
// 정리 뒤 사용자가 옮긴 카드는 되돌려도 그대로
await tick()
await run(...placeTaskStmts(m.taskAreas, t3, mine.id))
assert.equal(await undoReorganize(), true)
m = await readMap()
assert.equal(m.areas.some(a=>a.name==='졸업 프로젝트'||a.name==='학교'), false, 'AI가 만든 영역은 사라진다')
assert.equal(m.taskAreas.find(r=>r.task_id===t2)!.area_id, null, '정리 전 미분류로')
assert.equal(m.taskAreas.find(r=>r.task_id===t3)!.area_id, mine.id, '정리 뒤 직접 옮긴 것은 남는다')
assert.equal(m.links.some(l=>l.state==='suggested' && l.source==='ai'), false)
assert.equal(await undoReorganize(), false, '되돌리기는 마지막 1회')
// 스냅숏 순수 함수: 새 AI 영역 지움, 사용자가 만든 새 영역은 남김
{
  const snap = takeSnapshot([area('u','개인',null,'user')], [], 'r', '2026-10-04T00:00:00.000Z')
  const later = '2026-10-05T00:00:00.000Z'
  const st = restoreStmts(snap, [area('u','개인',null,'user'),{...area('ai1','학교'),created_at:later},{...area('u2','새로',null,'user'),created_at:later}], [{id:'x',task_id:'x',area_id:'ai1',source:'ai',state:'ok',run_id:'r',modified_at:later}], [])
  assert.ok(st.some(s=>/DELETE FROM map_areas/.test(s.sql) && s.params?.[0]==='ai1'))
  assert.equal(st.some(s=>/DELETE FROM map_areas/.test(s.sql) && s.params?.[0]==='u2'), false)
  assert.ok(st.some(s=>/UPDATE task_areas/.test(s.sql) && s.params?.[0]===null))
}
// AI를 못 쓰면 던지고 아무것도 쓰지 않는다(호출하는 쪽이 미분류로 두고 재시도)
const before = all('SELECT count(*) n FROM task_areas')[0].n
await assert.rejects(()=>classifyTasks([t2], {signal:new AbortController().signal, runId:'r', chat:(async()=>{throw new Error('connect ECONNREFUSED')}) as never}))
assert.equal(all('SELECT count(*) n FROM task_areas')[0].n, before)
// 비어 있는 AI 영역 정리
assert.equal(pruneEmptyAiStmts([area('e','빈 영역'),area('u','개인',null,'user')], []).length, 1)
console.log('map.test ok')
