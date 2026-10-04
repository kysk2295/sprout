// 14 작업 지도 v2.0 + 30 §B 리스트 하나로: 폴더 › 리스트 › 할 일 나무·배치, 리스트 옮기기·순서, 순서 선 고리 검사,
// AI 리스트 제안 검증(기존 리스트 재사용·중복 이름 방지)·무시 기억·자동 이동 조건·새 주제 감지, 기본함 정리 승인 트랜잭션·되돌리기,
// 그리고 task_areas에는 아무것도 쓰지 않는다.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { createTask, run } from '../src/renderer/src/data/mutations'
import {
  wouldCycle, cleanName, buildMapTree, layoutMap, highlightSet, zoneAt, moveListStmts, reorderFoldersStmts, renameFolderStmts, renameListStmts,
  createFolderStmts, connect, acceptLink, dropLink, folderView, treeTaskCount, type MapFolder, type MapList, type MapTask, type MapLink
} from '../src/renderer/src/data/map'
import {
  validateItems, parseAiJson, buildProposals, mergeProposals, applyProposalStmts, undoProposalStmts, shouldAutoMove, topicCandidates, chipFor,
  suggestStore, askAi, proposeStructure, applyProposals, undoApply, acceptSuggestions, cleanListName, nameKey, type SuggestList, type Suggestion
} from '../src/renderer/src/data/listSuggest'
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql:string, params:unknown[]=[]) => {const s=db.prepare(sql);s.bind(params as never);const r:Record<string,unknown>[]=[];while(s.step())r.push(s.getAsObject());s.free();return r}
const store = new Map<string,string>()
Object.assign(globalThis,{localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)},window:{sprout:{db:{getAll:async(sql:string,p?:unknown[])=>all(sql,p),get:async(sql:string,p?:unknown[])=>all(sql,p)[0]??null,transaction:async(stmts:{sql:string;params?:unknown[]}[])=>{db.run('BEGIN');try{for(const s of stmts)db.run(s.sql,s.params as never);db.run('COMMIT')}catch(e){db.run('ROLLBACK');throw e}}}}}})

// ── 고리 검사(순서 선은 그대로) ──
const seq = (from_id:string,to_id:string,state:MapLink['state']='accepted') => ({kind:'sequence' as const,from_id,to_id,state})
assert.equal(wouldCycle([], 'a', 'a'), true)
assert.equal(wouldCycle([seq('a','b'),seq('b','c')], 'c', 'a'), true)
assert.equal(wouldCycle([seq('a','b'),seq('b','c')], 'a', 'c'), false)
assert.equal(wouldCycle([seq('a','b','dismissed')], 'b', 'a'), false, '무시한 제안은 고리로 셈하지 않는다')

// ── 이름 규칙 ──
assert.equal(cleanName('  대학교  과제 '), '대학교 과제')
assert.equal(cleanName(''), null)
assert.equal(cleanListName('🏫 대학교'), '대학교', 'AI가 이름에 이모지를 붙여도 뗀다')
assert.equal(cleanListName('가'.repeat(21)), null)
assert.equal(nameKey('🏫 대 학교'), nameKey('대학교'))
assert.deepEqual(folderView('🥺Me'), { emoji: '🥺', name: 'Me' })
assert.deepEqual(folderView('Work'), { emoji: null, name: 'Work' })

// ── 폴더 › 리스트 › 할 일 나무 ──
const L = (id:string,name:string,o:Partial<MapList>={}):MapList => ({id,name,emoji:null,color:null,folder_id:null,kind:'normal',sort_order:1,archived_at:null,...o})
const T = (id:string,list_id:string|null,o:Partial<MapTask>={}):MapTask => ({id,title:id,status:0,due_at:null,start_at:null,priority:0,list_id,completed_at:null,created_at:null,...o})
const folders:MapFolder[] = [{id:'f2',name:'🎓Study',sort_order:2},{id:'f1',name:'Work',sort_order:1},{id:'f3',name:'빈 폴더',sort_order:3}]
const lists:MapList[] = [L('in','Inbox',{kind:'inbox',sort_order:0}),L('a','대학교',{folder_id:'f2',sort_order:2}),L('b','운동',{sort_order:5}),L('c','회사',{folder_id:'f1'}),L('z','보관',{archived_at:'2026-01-01'}),L('o','고아',{folder_id:'gone',sort_order:3})]
{
  const tree = buildMapTree(folders, lists, [T('t1','a'),T('t2','in'),T('t3',null),T('t4','z'),T('t5','b',{status:1}),T('t6','c')])
  assert.deepEqual(tree.groups.map(g=>`${g.kind}:${g.id}`), ['list:in','list:o','list:b','folder:f1','folder:f2','folder:f3'], '기본함 → 폴더 밖 리스트 → 폴더(사이드바 순서), 없는 폴더의 리스트는 밖으로')
  const inbox = tree.groups[0]
  assert.ok(inbox.kind==='list' && inbox.tasks.map(t=>t.id).join()==='t2,t3', '리스트 없는 할 일은 기본함')
  assert.equal(treeTaskCount(tree), 5, '보관한 리스트의 할 일은 빠진다')
  const study = tree.groups.find(g=>g.id==='f2')!
  assert.ok(study.kind==='folder' && study.lists[0].list.id==='a' && study.count===1)
  assert.ok(tree.groups.find(g=>g.id==='b')!.count===0, '완료는 개수에서 뺀다')
  // 범위: 고른 리스트 — 그 리스트만, 빈 폴더 숨김
  const only = buildMapTree(folders, lists, [T('t1','a')], {only:['a']})
  assert.deepEqual(only.groups.map(g=>g.id), ['f2'])
  // 배치: 뿌리 → 폴더·폴더 밖 리스트(1층) → 폴더 안 리스트(2층) → 할 일
  const lay = layoutMap({tree, links:[], goals:[], collapsed:{}, hasDate:()=>false})
  const node = (id:string) => lay.nodes.find(n=>n.id===id)!
  assert.equal(node('folder:f2').level, 1)
  assert.equal(node('list:b').level, 1)
  assert.equal(node('list:a').level, 2)
  assert.ok(node('task:t1').y > node('list:a').y && node('list:a').y > node('folder:f2').y && node('folder:f2').y > node('root').y)
  assert.ok(node('anchor:list:in'), '폴더 밖 리스트 할 일은 닻에서 줄기선')
  // 놓는 자리: 할 일 → 리스트, 리스트 → 폴더
  const t1 = node('task:t1')
  assert.equal(zoneAt(lay.zones, 'list', {x:t1.x+5,y:t1.y+5})?.id, 'a')
  assert.equal(zoneAt(lay.zones, 'folder', {x:t1.x+5,y:t1.y+5})?.id, 'f2')
  const t2 = node('task:t2')
  assert.equal(zoneAt(lay.zones, 'list', {x:t2.x+5,y:t2.y+5})?.id, 'in', '폴더 밖 리스트도 할 일을 받는다')
  assert.ok(highlightSet(lay.edges, 'task:t1').has('folder:f2'))
  // 접기: 폴더 접으면 그 안 리스트·할 일이 빠진다
  const folded = layoutMap({tree, links:[], goals:[], collapsed:{'folder:f2':true}, hasDate:()=>false})
  assert.equal(folded.nodes.some(n=>n.id==='task:t1'), false)
}

// ── 리스트 옮기기 · 순서 ──
{
  const ls = [L('in','in',{kind:'inbox'}),L('a','A',{folder_id:'f1',sort_order:1}),L('b','B',{folder_id:'f1',sort_order:2}),L('c','C',{sort_order:9})]
  const st = moveListStmts(ls, 'c', 'f1', 'b')
  // a(1) · b(2) 사이에 c를 b 앞에 → a 그대로, c = 2 + 폴더, b = 3
  assert.equal(st.length, 2)
  assert.ok(st.some(x=>x.params?.at(-1)==='c' && /folder_id/.test(x.sql) && x.params.includes(2) && x.params.includes('f1')))
  assert.ok(st.some(x=>x.params?.at(-1)==='b' && x.params.includes(3)))
  assert.deepEqual(moveListStmts(ls, 'in', 'f1'), [], '기본함은 옮기지 않는다')
  assert.deepEqual(moveListStmts(ls, 'zz', 'f1'), [])
  assert.equal(reorderFoldersStmts([{id:'x',name:'x',sort_order:1},{id:'y',name:'y',sort_order:2}], ['y','x']).length, 2)
  assert.equal(reorderFoldersStmts([{id:'x',name:'x',sort_order:1}], ['x']).length, 0, '그대로면 쓰지 않는다')
  assert.equal(renameListStmts(L('in','in',{kind:'inbox'}), '새 이름'), null, '기본함 이름은 못 바꾼다')
}
// DB에서: 폴더 만들기 → 리스트 넣기(앞에) → 이름 바꾸기(이모지 아이콘 유지)
await run({sql:"INSERT INTO lists (id,name,kind,sort_order,folder_id,emoji,archived_at) VALUES ('inbox','Inbox','inbox',0,NULL,NULL,NULL),('l1','대학교','normal',1,NULL,'🏫',NULL),('l2','운동','normal',2,NULL,NULL,NULL),('l3','옛 리스트','normal',3,NULL,NULL,'2026-01-01')"})
const nf = createFolderStmts([], '🎓공부')!
await run(...nf.stmts)
const dbLists = () => all('SELECT id,name,emoji,color,folder_id,kind,sort_order,archived_at FROM lists') as unknown as MapList[]
await run(...moveListStmts(dbLists(), 'l2', nf.id))
await run(...moveListStmts(dbLists(), 'l1', nf.id, 'l2'))
assert.deepEqual(all('SELECT id FROM lists WHERE folder_id=? ORDER BY sort_order',[nf.id]).map(r=>r.id), ['l1','l2'])
await run(...renameFolderStmts({id:nf.id,name:'🎓공부',sort_order:1}, '스터디')!)
assert.equal(all('SELECT name FROM folders WHERE id=?',[nf.id])[0].name, '🎓스터디', '폴더 이름을 바꿔도 아이콘(앞 이모지)은 그대로')
await run(...moveListStmts(dbLists(), 'l2', null))
assert.equal(all("SELECT folder_id FROM lists WHERE id='l2'")[0].folder_id, null)

// ── AI 답 검증 ──
const SL = (id:string,name:string,o:Partial<SuggestList>={}):SuggestList => ({id,name,emoji:null,kind:'normal',archived_at:null,...o})
const sl = [SL('in','Inbox',{kind:'inbox'}),SL('u','대학교',{emoji:'🏫'}),SL('w','운동'),SL('old','옛 리스트',{archived_at:'x'})]
{
  const tk = new Map([['t1','A'],['t2','B'],['t3','C'],['t4','D'],['t5','E'],['t6','F'],['t7','G']])
  const lk = new Map([['l1','u'],['l2','w'],['l9','in'],['l8','old']])
  const out = parseAiJson('```json\n' + JSON.stringify({items:[
    {id:'t1',list:'l1',new:'',emoji:'',sure:'high'}, // 있는 리스트, 확실
    {id:'t2',list:'',new:'🏫 대학교',emoji:'🎒',sure:'low'}, // 새 이름이 있는 리스트와 같음 → 그 리스트 다시 씀
    {id:'t3',list:'',new:'자격증',emoji:'📜',sure:'high'}, // 새 리스트 제안 — 확실해도 자동 이동 대상 아님
    {id:'t4',list:'l9',new:'',emoji:'',sure:'high'}, // 기본함은 고를 수 없음
    {id:'t5',list:'l8',new:'',emoji:'',sure:'high'}, // 보관한 리스트는 고를 수 없음
    {id:'zz',list:'l1',new:'',emoji:'',sure:'high'}, // 없는 할 일
    {id:'t1',list:'l2',new:'',emoji:'',sure:'high'}, // 같은 할 일 두 번 → 처음 것만
    {id:'t6',list:'',new:'가'.repeat(30),emoji:'x',sure:'low'}, // 이름 규칙 위반 → 제안 없음
    {id:'t7',list:'운동',new:'',emoji:'',sure:'high'} // 키 대신 이름으로 답해도 받는다
  ]}) + '\n```')
  const r = validateItems(out, tk, lk, sl)
  const by = new Map(r.map(x=>[x.taskId,x]))
  assert.deepEqual(by.get('A'), {taskId:'A',listId:'u',newName:null,emoji:null,sure:true})
  assert.deepEqual(by.get('B'), {taskId:'B',listId:'u',newName:null,emoji:null,sure:false}, '중복 리스트를 만들지 않는다')
  assert.deepEqual(by.get('C'), {taskId:'C',listId:null,newName:'자격증',emoji:'📜',sure:false})
  assert.equal(by.get('D')!.listId, null)
  assert.equal(by.get('E')!.listId, null)
  assert.equal(by.get('F')!.newName, null)
  assert.equal(by.get('G')!.listId, 'w')
  assert.equal(r.length, 7)
  assert.deepEqual(parseAiJson('설명: [{"id":"t1","list":"l1"}] 끝').items?.length, 1, '맨 배열·설명 글 섞임도 받는다')
}

// ── 기본함 정리 묶기 ──
{
  const S = (taskId:string, listId:string|null, newName:string|null, emoji:string|null=null):Suggestion => ({taskId,listId,newName,emoji,sure:false})
  const ps = buildProposals([S('a','u',null),S('b',null,'자격증','📜'),S('c',null,' 자격 증',null),S('d',null,'혼자'),S('e',null,'운동'),S('f',null,null),S('b',null,'자격증')], sl)
  assert.deepEqual(ps.map(p=>[p.key,p.listId,p.name,p.taskIds.join()]), [['new:자격증',null,'자격증','b,c'],['list:u','u','대학교','a'],['list:w','w','운동','e']], '같은 새 이름은 하나로, 있는 리스트 이름이면 그 리스트, 1개뿐인 새 주제는 기본함에')
  assert.equal(ps[0].emoji, '📜')
  const many = buildProposals(Array.from({length:12},(_,i)=>[S(`x${i}a`,null,`주제${i}`),S(`x${i}b`,null,`주제${i}`)]).flat(), sl)
  assert.equal(many.length, 8, '많아도 8개까지')
  const merged = mergeProposals(ps, 'list:w', 'new:자격증')
  assert.deepEqual(merged.map(p=>p.key), ['new:자격증','list:u'])
  assert.deepEqual(merged[0].taskIds, ['b','c','e'])
}

// ── 승인 쓰기 계획: 한 트랜잭션 · 이름 중복 방지 · 기본함에 있는 것만 ──
{
  let n = 0
  const tasks = [{id:'a',title:'a',list_id:'in'},{id:'b',title:'b',list_id:'in'},{id:'c',title:'c',list_id:'w'},{id:'d',title:'d',list_id:'in'},{id:'e',title:'e',list_id:'in'}]
  const r = applyProposalStmts([
    {key:'1',listId:null,name:'자격증',emoji:'📜',taskIds:['a','c'],on:true}, // c는 이미 다른 리스트 → 옮기지 않음
    {key:'2',listId:null,name:' 자격증 ',emoji:null,taskIds:['b'],on:true}, // 고친 이름이 앞과 같음 → 하나만 만든다
    {key:'3',listId:null,name:'🏫대학교',emoji:null,taskIds:['d'],on:true}, // 있는 리스트 이름 → 다시 씀
    {key:'4',listId:null,name:'끈 것',emoji:null,taskIds:['e'],on:false} // 체크 해제 → 기본함에 남음
  ], sl, tasks, 'in', {newId:()=>`new${++n}`, at:'2026-10-05T00:00:00.000Z', sortBase:100})
  assert.deepEqual(r.snapshot.created, ['new1'])
  assert.deepEqual(r.snapshot.moves, [{taskId:'a',to:'new1'},{taskId:'b',to:'new1'},{taskId:'d',to:'u'}])
  assert.equal(r.stmts.filter(s=>/INSERT INTO lists/.test(s.sql)).length, 1)
  // 되돌리기: 그 뒤 다른 곳으로 옮긴 할 일은 그대로, 만든 리스트는 비면 지우고 다른 할 일이 들어갔으면 남김
  const later = [{id:'a',title:'a',list_id:'new1'},{id:'b',title:'b',list_id:'w'},{id:'d',title:'d',list_id:'u'}]
  const u = undoProposalStmts(r.snapshot, later)
  assert.equal(u.filter(s=>/UPDATE tasks/.test(s.sql)).length, 2)
  assert.ok(u.some(s=>/DELETE FROM lists/.test(s.sql)))
  const u2 = undoProposalStmts(r.snapshot, [...later, {id:'x',title:'x',list_id:'new1'}])
  assert.equal(u2.some(s=>/DELETE FROM lists/.test(s.sql)), false, '내가 넣은 할 일이 있으면 리스트를 남긴다')
}

// ── 자동 이동 조건 · 새 주제 감지 · 무시 기억 ──
{
  const since = '2026-10-05T00:00:00.000Z'
  const x:Suggestion = {taskId:'A',listId:'u',newName:null,emoji:null,sure:true}
  const task = {id:'A',title:'과제',list_id:'in',created_at:'2026-10-05T01:00:00.000Z'}
  const o = {enabled:true,dismissed:{},since}
  assert.equal(shouldAutoMove(x, task, 'in', o), true)
  assert.equal(shouldAutoMove({...x,sure:false}, task, 'in', o), false, '애매하면 제안만')
  assert.equal(shouldAutoMove(x, {...task,list_id:'w'}, 'in', o), false, '이미 다른 리스트에 있으면 절대 옮기지 않는다')
  assert.equal(shouldAutoMove(x, {...task,created_at:'2026-10-04T00:00:00.000Z'}, 'in', o), false, '쌓여 있던 기본함 할 일은 자동 이동 안 함')
  assert.equal(shouldAutoMove(x, task, 'in', {...o,enabled:false}), false, '설정을 끄면 제안만')
  assert.equal(shouldAutoMove(x, task, 'in', {...o,dismissed:{A:true}}), false)
  suggestStore.reset()
  suggestStore.put([x, ...['B','C','D','E','F'].map(id=>({taskId:id,listId:null,newName:id==='F'?'🏅 자격증':'자격증',emoji:'📜',sure:false}))])
  assert.equal(chipFor(suggestStore.get(), 'A', sl)?.id, 'u')
  assert.equal(chipFor(suggestStore.get(), 'B', sl), null, '새 이름 제안은 칩이 아니라 새 주제 카드로')
  assert.deepEqual(topicCandidates(suggestStore.get(), ['B','C','D','E','F'], sl).map(t=>[t.name,t.taskIds.length]), [['자격증',5]])
  assert.equal(topicCandidates(suggestStore.get(), ['B','C','D','E'], sl).length, 0, '5개 미만이면 묻지 않는다')
  suggestStore.dismiss(['A'])
  assert.equal(chipFor(suggestStore.get(), 'A', sl), null, '무시하면 다시 제안하지 않는다')
  suggestStore.dismissTopic('자격증')
  assert.equal(topicCandidates(suggestStore.get(), ['B','C','D','E','F'], sl).length, 0)
  assert.ok(store.get('sprout.listSuggest.v1'), '기기에만 저장')
  suggestStore.reset()
}

// ── DB: 기본함 정리(묶음 요청) → 승인 → 되돌리기, task_areas는 쓰지 않는다 ──
const inboxIds:string[] = []
for (let i = 0; i < 45; i++) inboxIds.push(await createTask({title: i < 30 ? `정보처리기사 ${i}` : `과제 ${i}`, list_id:'inbox'}))
const mine = await createTask({title:'이미 리스트에 있음', list_id:'l2'})
let calls = 0
const chat = (async (input:{messages:{content:string}[]}) => {
  calls++
  const p = JSON.parse(input.messages[1].content) as {lists:{id:string;name:string}[];tasks:{id:string;title:string}[]}
  assert.ok(p.tasks.length <= 40, '40개씩 묶어 묻는다')
  assert.equal(p.lists.some(l=>l.name==='Inbox'||l.name==='옛 리스트'), false, '기본함·보관 리스트는 보내지 않는다')
  assert.equal(p.tasks.some(t=>t.title==='이미 리스트에 있음'), false, '다른 리스트의 할 일은 보내지 않는다')
  const uni = p.lists.find(l=>l.name==='대학교')!.id
  return JSON.stringify({items:p.tasks.map(t=>t.title.startsWith('과제') ? {id:t.id,list:uni,new:'',emoji:'',sure:'low'} : {id:t.id,list:'',new:'자격증',emoji:'📜',sure:'low'})})
}) as never
const prop = await proposeStructure({signal:new AbortController().signal, chat})
assert.equal(calls, 2); assert.equal(prop.total, 45)
assert.deepEqual(prop.proposals.map(p=>[p.name,p.listId,p.taskIds.length]), [['자격증',null,30],['대학교','l1',15]])
assert.equal(all('SELECT count(*) n FROM lists')[0].n, 4, '제안만 — 승인 전에는 리스트를 만들지 않는다')
assert.equal(all("SELECT count(*) n FROM tasks WHERE list_id='inbox'")[0].n, 45, '제안만 — 승인 전에는 옮기지 않는다')
const applied = await applyProposals(prop.proposals)
assert.deepEqual(applied, {created:1, moved:45})
assert.equal(all("SELECT count(*) n FROM tasks WHERE list_id='inbox'")[0].n, 0)
assert.equal(all("SELECT list_id FROM tasks WHERE id=?",[mine])[0].list_id, 'l2')
assert.equal(all("SELECT name, emoji FROM lists WHERE name='자격증'")[0].emoji, '📜')
assert.equal(await undoApply(), true)
assert.equal(all("SELECT count(*) n FROM tasks WHERE list_id='inbox'")[0].n, 45, '전체 되돌리기')
assert.equal(all("SELECT count(*) n FROM lists WHERE name='자격증'")[0].n, 0, '만든 리스트도 지운다')
assert.equal(await undoApply(), false)
// 제안 받아들이기(칩): 기본함에 있는 것만, 되돌리기
const acc = await acceptSuggestions([{taskId:inboxIds[0],listId:'l1'},{taskId:mine,listId:'l1'},{taskId:inboxIds[1],listId:'l3'}])
assert.equal(acc.moved, 1, '다른 리스트 할 일·보관 리스트로는 옮기지 않는다')
assert.equal(all('SELECT list_id FROM tasks WHERE id=?',[inboxIds[0]])[0].list_id, 'l1')
await acc.undo()
assert.equal(all('SELECT list_id FROM tasks WHERE id=?',[inboxIds[0]])[0].list_id, 'inbox')
// AI를 못 쓰면 던지고 아무것도 쓰지 않는다
await assert.rejects(()=>askAi([{id:inboxIds[0],title:'x'}], sl, {signal:new AbortController().signal, chat:(async()=>{throw new Error('connect ECONNREFUSED')}) as never}))
assert.equal(all('SELECT count(*) n FROM task_areas')[0].n, 0, '영역 분류 표(task_areas)에는 쓰지 않는다')
assert.equal(all('SELECT count(*) n FROM map_areas')[0].n, 0)

// ── 연결선(map_links) ──
const [s1, s2, s3] = inboxIds
assert.equal(await connect('sequence', s1, s2), 'ok')
assert.equal(await connect('sequence', s2, s1), 'cycle')
assert.equal(await connect('sequence', s1, s2), 'exists')
await run({sql:"INSERT INTO map_links (id, kind, from_type, from_id, to_id, source, state) VALUES ('sg','sequence','task',?,?,'ai','suggested')",params:[s2,s3]})
assert.equal(await acceptLink('sg'), 'ok')
await run({sql:"INSERT INTO map_links (id, kind, from_type, from_id, to_id, source, state) VALUES ('bad','sequence','task',?,?,'ai','suggested')",params:[s3,s1]})
assert.equal(await acceptLink('bad'), 'cycle')
await dropLink('bad','suggested')
assert.equal(all("SELECT state FROM map_links WHERE id='bad'")[0].state, 'dismissed')
await dropLink('sg','accepted')
assert.equal(all("SELECT count(*) n FROM map_links WHERE id='sg'")[0].n, 0)
console.log('map.test ok')
