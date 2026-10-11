import assert from 'node:assert/strict'
import { agentSystemFor, AGENT_SYSTEM, CHAT_SYSTEM, chatSystemFor } from './assistantTools.ts'
import { toneOf } from './diary.ts'
import { isPersonaId, PERSONA_IDS, PERSONAS, personaChatBlock, personaIdOf, personaOf } from './persona.ts'

// 50: 카드 5개가 다 차 있다(지시문 칸 + 화면 칸)
for (const id of PERSONA_IDS) {
  const p = PERSONAS[id]
  assert.equal(p.id, id)
  assert.equal(p.likes.length, 3, id)
  for (const s of [p.greet, p.identity, p.tone, p.reactions, p.help, p.example.user, p.example.reply, p.ui.kind, p.ui.intro, p.ui.toneLabel, p.ui.help]) assert.ok(s.trim().length > 1, id)
  // 화면 글은 해요체, 캐릭터 예시는 반말(존댓말 금지 — 47 §7)
  assert.ok(/요\.?$/.test(p.ui.intro), id)
  assert.ok(!/(요|니다)\.?$/.test(p.example.reply) && !/(요|니다)\.?$/.test(p.greet), id)
}
assert.equal(personaIdOf(null), 'mascot')
assert.equal(personaIdOf('frog'), 'frog')
assert.equal(personaOf('nope' as never).id, 'mascot')
assert.ok(isPersonaId('bee') && !isPersonaId('otter') && !isPersonaId(3))

// 일반 대화 = 공통 + 카드 전체, 도구 대화 = 공통 + 말투 한 줄, 종 모름 = 공통만
assert.equal(chatSystemFor(), CHAT_SYSTEM)
assert.equal(agentSystemFor(), AGENT_SYSTEM)
assert.ok(chatSystemFor('snail').startsWith(CHAT_SYSTEM) && chatSystemFor('snail').includes('이끼 길 산책'))
assert.ok(chatSystemFor('bee') !== chatSystemFor('worm'))
assert.ok(agentSystemFor('frog').startsWith(AGENT_SYSTEM) && agentSystemFor('frog').endsWith(`${PERSONAS.frog.tone}.`))
assert.ok(!agentSystemFor('frog').includes('좋아하는 것'), '도구 대화에는 말투 한 줄만(결정 ④)')
assert.ok(personaChatBlock('worm').includes('새 취미를 지어내지 마'))
// 공통 일반 대화 지시문: 고정 성격 문장 없음 + 건강·돈 규칙
assert.ok(!CHAT_SYSTEM.includes('상상하는 걸 좋아해'))
assert.ok(/진단·약 이름·종목 추천 금지/.test(CHAT_SYSTEM))
// 일기 말투도 같은 카드에서
assert.equal(toneOf('bee'), PERSONAS.bee.tone)
assert.equal(toneOf(null), PERSONAS.mascot.tone)
console.log('persona ok')
