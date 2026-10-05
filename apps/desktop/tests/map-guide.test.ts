// 34 작업 지도 사용법 §4: 빈 상태 한 줄 안내 — 조건·순서·닫은 안내
import assert from 'node:assert/strict'
import { pickHint } from '../src/renderer/src/components/map/guideHints'

const base = { view: 'graph' as const, groupBy: 'list' as const, goals: 1, openTasks: 3, seqLinks: 0, datedOpen: 2, panelOpen: true }
assert.equal(pickHint(base, []), 'noseq')
assert.equal(pickHint({ ...base, seqLinks: 1 }, []), null)
assert.equal(pickHint({ ...base, openTasks: 1 }, []), null, '할 일 1개면 이을 게 없다')
assert.equal(pickHint(base, ['noseq']), null, '닫은 안내는 다시 안 뜬다')
assert.equal(pickHint({ ...base, view: 'board' }, []), null, '순서 선은 그래프에서만 잇는다')
assert.equal(pickHint({ ...base, groupBy: 'goal', goals: 0 }, []), 'nogoal')
assert.equal(pickHint({ ...base, view: 'board', groupBy: 'goal', goals: 0 }, []), 'nogoal')
assert.equal(pickHint({ ...base, groupBy: 'goal', goals: 2 }, []), null)
assert.equal(pickHint({ ...base, view: 'timeline', datedOpen: 0, panelOpen: false }, []), 'nodate')
assert.equal(pickHint({ ...base, view: 'timeline', datedOpen: 0, panelOpen: true }, []), null, '칸이 열려 있으면 화면 안 빈 상태가 맡는다')
assert.equal(pickHint({ ...base, view: 'timeline', groupBy: 'goal', goals: 0, datedOpen: 3 }, []), null)
console.log('map-guide: ok')
