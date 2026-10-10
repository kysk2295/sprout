import assert from 'node:assert/strict'
import { pageFromHtml, pageHasText, parseSummary, readLinkSummary, summaryFirstLine, withLinkSummary, youtubeFromHtml } from './linkSummary.ts'

// 일반 페이지: 메뉴·스크립트 빼고 본문, og 제목·설명
const html = `<html><head><title>기본 제목</title><meta property="og:title" content="좋은 글 &amp; 제목"><meta name="description" content="설명 한 줄"></head>
<body><nav><a>메뉴</a><li>메뉴 항목</li></nav><script>var x = 1</script>
<article><h1>본문 머리</h1><p>첫 문단 <b>강조</b> 내용입니다.</p><ul><li>목록 줄</li></ul></article><footer><p>바닥</p></footer></body></html>`
const p = pageFromHtml(html)
assert.equal(p.title, '좋은 글 & 제목')
assert.equal(p.description, '설명 한 줄')
assert.equal(p.text, '본문 머리\n첫 문단 강조 내용입니다.\n목록 줄')
assert.equal(pageHasText(p), false) // 너무 짧음

// 유튜브: shortDescription(이스케이프 풀기)
const yt = youtubeFromHtml(`<meta property="og:title" content="영상 제목"><script>var a = {"videoDetails":{"shortDescription":"첫 줄\\n둘째 줄 \\"따옴표\\" 설명이 충분히 길어서 요약할 만하다고 봐도 되는 정도의 글"}};</script>`)
assert.equal(yt.title, '영상 제목')
assert.equal(yt.description, '첫 줄\n둘째 줄 "따옴표" 설명이 충분히 길어서 요약할 만하다고 봐도 되는 정도의 글')
assert.equal(pageHasText(yt), true)

// AI 답 읽기: 한 줄 + 요점(점·번호 빼고, 겹침·빈 줄 빼고, 5줄까지)
assert.deepEqual(parseSummary('{"head":"한 줄","lines":["- 첫째","2. 둘째","둘째","","넷째","다섯째","여섯째","일곱째"]}'), { head: '한 줄', lines: ['첫째', '둘째', '넷째', '다섯째', '여섯째'] })
assert.deepEqual(parseSummary('앞말 {"lines":["하나"]} 뒷말'), { head: '하나', lines: ['하나'] })
assert.deepEqual(parseSummary('엉망'), { head: '', lines: [] })
// 목록 줄 = head(없으면 첫 요점)
assert.equal(summaryFirstLine(withLinkSummary(null, { head: '요약', lines: ['a'], from: 'page', at: 't' })), '요약')

// 저장·읽기: 다른 키는 그대로
const s1 = withLinkSummary('{"title":"x"}', { lines: ['a', 'b'], from: 'page', at: '2026-10-10T10:00:00Z' })
assert.equal(JSON.parse(s1).title, 'x')
assert.deepEqual(readLinkSummary(s1), { lines: ['a', 'b'], from: 'page', at: '2026-10-10T10:00:00Z' })
assert.equal(summaryFirstLine(s1), 'a')
assert.deepEqual(readLinkSummary(withLinkSummary(null, { none: 'blocked', at: 't' })), { none: 'blocked', at: 't' })
assert.equal(readLinkSummary('깨짐'), null)
assert.equal(summaryFirstLine(null), null)
// 주소가 바뀌면 옛 요약은 없는 것으로
const s2 = withLinkSummary(null, { lines: ['x'], from: 'page', at: 't', url: 'https://a.com' })
assert.equal(summaryFirstLine(s2, 'https://a.com'), 'x')
assert.equal(readLinkSummary(s2, 'https://b.com'), null)
console.log('linkSummary ok')
import { isPublicHttpUrl } from './linkSummary.ts'
assert.equal(isPublicHttpUrl('https://ko.wikipedia.org/wiki/x'), true)
for (const bad of ['http://192.168.0.1/', 'http://localhost:3000', 'http://10.0.0.5', 'ftp://a.com', 'https://u:p@a.com', 'http://[::1]/', 'http://printer.local']) assert.equal(isPublicHttpUrl(bad), false, bad)
console.log('linkSummary url ok')
