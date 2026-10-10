import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
// 첫 화면·지원·404 본문. 문구를 고칠 땐 여기만 본다(한국어가 기본, 영어는 옆에 같이).
const svg = (d, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const I = {
  laptop: svg('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>', ''),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>', ''),
  inbox: svg('<path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/><path d="M9 7.5h7"/>'),
  cal: svg('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  diary: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/><path d="M12.5 9.5c.6-1 2.4-1 2.8.3.4 1.4-1.6 2.6-2.8 3.4-1.2-.8-3.2-2-2.8-3.4.4-1.3 2.2-1.3 2.8-.3Z" transform="translate(1 0)"/>'),
  widget: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="17" height="7" rx="1.8"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.3-4.4L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.4L20 15.5"/><path d="M20 20v-4.5h-4.5"/>'),
  noad: svg('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
  server: svg('<rect x="4" y="4" width="16" height="7" rx="1.6"/><rect x="4" y="13" width="16" height="7" rx="1.6"/><path d="M8 7.5h.01M8 16.5h.01"/>'),
  eyeoff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.7 3.8M6.3 6.4A13.4 13.4 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7 1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/>'),
  goal: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>'),
  report: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 16v-3M12 16V9M16 16v-5"/>'),
  quiz: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.5"/><path d="M12 17h.01"/>')
}

// 그림 주소 = 파일 내용 해시(?v=) — 캡처를 바꾸면 주소가 바뀌어 브라우저·Caddy 7일 캐시가 옛 그림을 주지 않는다
const imgV = (n) => { try { return createHash('sha1').update(readFileSync(new URL(`../public/assets/img/${n}.webp`, import.meta.url))).digest('hex').slice(0, 8) } catch { return '0' } }
const shot = (T, src, ko, en, { dark, w, h, lazy = true } = {}) =>
  `<img src="/assets/img/${src}.webp?v=${imgV(src)}"${dark ? ` data-dark="/assets/img/${dark}.webp?v=${imgV(dark)}"` : ''} alt="${ko}" data-alt-ko="${ko}" data-alt-en="${en}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">`
const win = (inner) => `<div class="win"><div class="win-bar" aria-hidden="true"><i></i><i></i><i></i></div>${inner}</div>`

export function landing({ cfg, T, esc, val, page }) {
  const N = esc(cfg.name), NE = esc(cfg.nameEn)
  const dlBtn = (ic, label) => `<button class="dl-btn" type="button" aria-disabled="true" disabled>${ic}<span><small>${T('곧 출시', 'Coming soon')}</small>${label}</span></button>`
  // 데스크톱 설치 파일 = GitHub Release(이름 고정, docs/release/desktop-download.md). app.js가 내 컴퓨터에 맞는 버튼을 앞에 세운다.
  const REL = 'https://github.com/kysk2295/sprout/releases/latest/download/'
  const DL = { macArm: REL + 'Kkumteul-mac-arm64.dmg', macIntel: REL + 'Kkumteul-mac-x64.dmg', win: REL + 'Kkumteul-windows-x64-setup.exe' }
  const dlLink = (os, href, ic, label) => `<a class="dl-btn is-live" href="${href}" data-dl="${os}" rel="noopener">${ic}<span><small>${T('내려받기', 'Download')}</small>${label}</span></a>`
  const step = (k, e) => `<li>${T(k, e)}</li>`
  const ticks = (pairs) => `<ul class="ticks">${pairs.map(([k, e]) => `<li>${T(k, e)}</li>`).join('')}</ul>`
  const card = (ic, hk, he, pk, pe) => `<div class="card">${ic}<div><h3>${T(hk, he)}</h3><p>${T(pk, pe)}</p></div></div>`
  const faq = (qk, qe, ak, ae) => `<details><summary>${T(qk, qe)}</summary><div class="a">${T(ak, ae)}</div></details>`
  // 직접 만져 보는 창(내용은 assets/demos.js가 그린다). 자바스크립트가 꺼져 있으면 안내만 보이고, 아래 실제 앱 화면은 그대로 있다.
  const demo = (id, tk, te, cls = '') => `<div class="win app-win ${cls}"><div class="win-bar" aria-hidden="true"><i></i><i></i><i></i><span class="win-title">${T(tk, te)}</span><span class="win-badge">${T('직접 해 보기', 'Try it')}</span></div><div class="demo demo-${id}" data-demo="${id}"><noscript><p class="nojs">${T('자바스크립트를 켜면 여기서 직접 해 볼 수 있어요.', 'Turn on JavaScript to try it here.')}</p></noscript></div></div>`
  const tries = (pairs) => `<ul class="tries" aria-label="해 볼 것" data-aria-ko="해 볼 것" data-aria-en="Things to try">${pairs.map(([k, e]) => `<li>${T(k, e)}</li>`).join('')}</ul>`
  const proof = (img, list) => `<div class="proof reveal"><div class="proof-text"><div class="proof-k">${T('실제 앱 화면', 'The real app')}</div>${list}</div><figure class="proof-shot">${win(img)}</figure></div>`
  const head = (id, kk, ke, hk, he, pk, pe) => `<div class="sec-head center reveal"><div class="kicker">${T(kk, ke)}</div><h2 id="${id}">${T(hk, he)}</h2><p>${T(pk, pe)}</p></div>`

  const body = `
<section class="hero" aria-labelledby="hero-title">
<div class="wrap hero-grid">
<div class="hero-text">
<div class="eyebrow">Mac · Windows · iPhone · Android</div>
<h1 id="hero-title">${T('해낸 만큼 자라는<br>할 일·캘린더', 'The to-do list<br>that grows with you')}</h1>
<p class="lead">${T('말하듯 적으면 날짜와 태그가 알아서 들어가고, AI가 리스트까지 정리해요. 하나씩 끝낼 때마다 내 캐릭터가 자라요. 광고 없이 무료예요.', 'Type the way you talk and the date and tags fill themselves in, then AI files it in the right list. Every finished task helps your character grow. Free, with no ads.')}</p>
<div class="dl" role="group" aria-label="다운로드" data-aria-ko="다운로드" data-aria-en="Downloads">
${dlLink('mac', DL.macArm, I.laptop, 'Mac')}${dlLink('win', DL.win, I.laptop, 'Windows')}${dlBtn(I.phone, 'App Store')}${dlBtn(I.phone, 'Google Play')}
</div>
<p class="dl-note">${T('무료예요. 처음 열 때 보안 확인이 한 번 떠요 — <a href="#install">여는 방법</a>', 'Free. You will see a security prompt the first time you open it — <a href="#install">how to open it</a>')}</p>
</div>
<div class="hero-demo">
${demo('hero', `${N} — 할 일`, `${NE} — Tasks`)}
${tries([['예시를 누르거나 직접 적어 보기', 'Tap an example or type your own'], ['Enter로 추가 → AI가 정리', 'Press Enter, watch AI sort it'], ['동그라미를 눌러 끝내기 → +1 XP', 'Check it off for +1 XP']])}
</div>
</div>
</section>

<section id="tasks" class="soft tight" aria-label="할 일" data-aria-ko="할 일" data-aria-en="Tasks">
<div class="wrap">
${proof(shot(T, 'tasks', `${N} 데스크톱 앱 — 오늘 할 일과 AI가 붙인 프로젝트 태그`, `${NE} desktop app: today's tasks with AI-applied project tags`, { dark: 'tasks-dark', w: 1600, h: 1000 }), `<h2 class="proof-h">${T('떠오르면 바로 적고,<br>정리는 AI에게', 'Jot it down now.<br>Let AI tidy up.')}</h2>${ticks([
  ['오늘 · 내일 · 다음 7일 · 기본함 스마트 목록', 'Smart lists: Today, Tomorrow, Next 7 Days, Inbox'],
  ['리스트 · 폴더 · 태그 · 필터, 반복 · 알림 · 체크리스트', 'Lists, folders, tags, filters, repeats, reminders, checklists'],
  ['AI 자동 분류 · 자동 태그 — 마음에 안 들면 한 번에 되돌리기', 'Auto-sorting and auto-tagging, with one-tap undo'],
  ['AI는 우리 서버에서만 돌고, 보낸 글은 남기지 않아요', 'AI runs on our own server and keeps nothing you send']
])}`)}
</div>
</section>

<section id="growth" aria-labelledby="growth-title">
<div class="wrap">
${head('growth-title', '성장', 'Growth', '끝낸 일이<br>캐릭터를 키워요', 'Finished tasks<br>grow your character', '퀘스트를 하나씩 끝내 보세요. 알이 깨어나고, 레벨이 오르면 다음 모습으로 자라요.', 'Finish a few quests. The egg hatches, and as you level up your character evolves.')}
<div class="demo-wrap reveal">${demo('growth', `${N} — 성장`, `${NE} — Growth`, 'wide')}</div>
${tries([['퀘스트 체크하기', 'Check off quests'], ['캐릭터 눌러 쓰다듬기', 'Tap the character'], ['종 바꿔 보기', 'Switch species']])}
${proof(shot(T, 'growth', '성장 — 마스코트 꿈틀이와 이번 주 퀘스트', 'Growth room with the Kkumteul mascot and weekly quests', { dark: 'growth-dark', w: 1600, h: 1000 }), `<h3 class="proof-h">${T('한 주는 퀘스트로 정하고, 주말엔 같이 돌아봐요', 'Set the week as quests, then look back together')}</h3>${ticks([
  ['처음에 짧은 성향 질문으로 나에게 맞는 종이 알에서 나와요', 'A few quick questions pick the species that hatches'],
  ['할 일 1 XP · 퀘스트 30 XP · 주간 점검 30 XP · 정리 20 XP', '1 XP per task, 30 per quest, 30 per weekly review, 20 per tidy-up'],
  ['레벨이 오르면 방을 꾸밀 장식이 하나씩 열려요', 'Each level unlocks a decoration for the room'],
  ['주간 리포트 — 숫자는 앱이 세고, 글은 AI가 써요', 'Weekly report: the app counts, AI writes the note']
])}`)}
</div>
</section>

<section id="map" class="soft" aria-labelledby="map-title">
<div class="wrap">
${head('map-title', '작업 지도', 'Work map', '큰 일은 단계로 나눠<br>지도처럼 봐요', 'Break big work into steps<br>and see it as a map', '캐릭터와 짧게 이야기하면 단계가 지도에 바로 생겨요. 순서는 끌어서 바꿔요.', 'A short chat with your character puts steps straight onto the map. Drag to reorder.')}
<div class="demo-wrap reveal">${demo('map', `${N} — 작업 지도`, `${NE} — Work map`, 'wide')}</div>
${tries([['대화에서 대답 고르기', 'Pick answers in the chat'], ['카드를 끌어 순서 바꾸기 — 화살표가 따라와요', 'Drag a card; the arrows follow'], ['동그라미로 단계 끝내기', 'Finish a step with the circle']])}
${proof(shot(T, 'map-plan', '작업 지도 — 날짜가 있는 큰 일을 프로젝트로', 'Work map: turn big dated work into a project', { dark: 'map-plan-dark', w: 1600, h: 1000 }), `<h3 class="proof-h">${T('흩어진 할 일을 프로젝트로 묶어 보기', 'Scattered tasks, gathered into projects')}</h3>${ticks([
  ['AI가 관련된 할 일을 찾아 프로젝트로 묶어요', 'AI finds related tasks and groups them into a project'],
  ['단계 보드 — 끝난 단계와 지금 할 단계', 'Step board: what is done and what is next'],
  ['타임라인 · 관계도 — 끌어서 날짜와 순서 바꾸기', 'Timeline and relationship map, drag to change dates and order']
])}`)}
</div>
</section>

<section id="assistant" aria-labelledby="ai-title">
<div class="wrap">
${head('ai-title', 'AI 비서', 'AI assistant', '말로 시키면<br>꿈틀이가 정리해요', 'Just say it,<br>and Kkumteul sorts it out', '할 일을 말로 넣고, 지난 기록을 묻고, 이번 주 급한 일을 같이 골라요.', 'Add tasks by talking, ask about your past, and pick this week’s priorities together.')}
${proof(shot(T, 'assistant', 'AI 비서 — 무엇을 도와줄까? 정원 위 꿈틀이와 추천 질문', 'AI assistant: Kkumteul in the garden with suggested questions', { dark: 'assistant-dark', w: 1600, h: 1000 }), `<h3 class="proof-h">${T('물어보면 내 할 일·일정에서 찾아 답해요', 'Answers from your own tasks and events')}</h3>${ticks([
  ['“내일 오후 3시 회의 잡아 줘” — 말로 할 일·일정 만들기', '“Book a meeting tomorrow at 3pm” — create tasks and events by talking'],
  ['“미용실 간 지 얼마나 지났지?” — 지난 기록 찾아보기', '“How long since my last haircut?” — look things up in your history'],
  ['저장하기 전엔 늘 카드로 보여 주고, 되돌릴 수 있어요', 'Always shows a card before saving, and you can undo'],
  ['꿈틀 서버에서만 돌아가요 — 인터넷은 보지 않아요', 'Runs only on Kkumteul’s server and never browses the web']
])}`)}
</div>
</section>

<section id="diary" class="soft" aria-labelledby="diary-title">
<div class="wrap">
${head('diary-title', '일기', 'Journal', '하루 끝에<br>꿈틀이와 이야기해요', 'End the day<br>with a little chat', '질문에 답하다 보면 일기가 돼요. 기분도 한 번에 남겨요.', 'Answer a few questions and it becomes a journal entry. Log your mood in one tap.')}
${proof(shot(T, 'diary', '일기 — 달력과 꿈틀이와의 대화, 기분 고르기', 'Journal: calendar, a chat with your character and mood picker', { dark: 'diary-dark', w: 1600, h: 1000 }), `<h3 class="proof-h">${T('말하듯 쓰고, 일기로 정리', 'Write like you talk, keep it as a journal')}</h3>${ticks([
  ['오늘 한 일을 보고 캐릭터가 먼저 말을 걸어요', 'Your character starts the chat from what you did today'],
  ['나눈 이야기를 버튼 하나로 일기로 정리', 'Turn the conversation into a journal entry with one button'],
  ['기분 다섯 가지 — 달력에서 한눈에', 'Five moods, seen at a glance on the calendar'],
  ['그냥 쓰고 싶은 날은 자유롭게 쓰기', 'Prefer to just write? Free writing is there too']
])}`)}
</div>
</section>

<section aria-labelledby="more-title">
<div class="wrap">
<div class="sec-head center reveal"><h2 id="more-title">${T('그 밖에도', 'And more')}</h2><p>${T('매일 쓰는 앱이라 작은 것까지 챙겼어요.', 'Small things that matter when you use it every day.')}</p></div>
<div class="grid3 reveal">
${card(I.inbox, '수집함', 'Inbox', '메모·링크를 일단 던져 두면 할 일 · 메모 · 볼 것으로 나눠 줘요. iPhone에선 공유하기로 바로 모아요.', 'Drop in notes and links; they get sorted into tasks, notes and things to read. Share straight from other apps on iPhone.')}
${card(I.book, 'LLM 위키', 'LLM wiki', '태그가 곧 위키 페이지예요. 사람 · 프로젝트 · 주제별로 모인 내용을 AI가 한 쪽으로 정리해요.', 'Every tag is a wiki page. AI summarises what you have collected about each person, project or topic.')}
${card(I.cal, '캘린더', 'Calendar', '할 일과 일정을 한 달력에서 끌어 옮겨요. 한국 공휴일은 인터넷 없이도 보이고, 구글 · 맥 캘린더도 함께 봐요.', 'Drag tasks and events on one calendar. Korean holidays show offline, alongside Google and Mac calendars.')}
${card(I.widget, '위젯', 'Widgets', '맥 데스크톱 · 휴대폰 홈 화면 위젯에서 오늘 할 일을 바로 보고 체크해요.', 'See and check off today’s tasks from desktop and home-screen widgets.')}
${card(I.bell, '알림', 'Reminders', '할 일 알림, 하루 요약, 레벨업 소식을 놓치지 않게 알려 줘요.', 'Task reminders, a daily summary and level-up news.')}
${card(I.sync, '오프라인에서도', 'Works offline', '기기에 먼저 저장해서 바로 반응하고, 인터넷이 돌아오면 모든 기기에 맞춰요.', 'Saved on your device first so it feels instant, then synced to every device when you are back online.')}
</div>
</div>
</section>

<section id="privacy" aria-labelledby="privacy-title">
<div class="wrap">
<div class="sec-head center reveal">
<div class="kicker">${T('개인정보', 'Privacy')}</div>
<h2 id="privacy-title">${T('내 할 일은 내 것이에요', 'Your tasks stay yours')}</h2>
<p>${T('할 일 앱엔 생활이 다 담겨요. 그래서 처음부터 이렇게 만들었어요.', 'A to-do app holds your whole life, so we built it this way from day one.')}</p>
</div>
<div class="promise reveal">
${card(I.server, 'AI는 우리 서버에서만', 'AI runs on our own server', '자동 분류·태그·요약은 운영자가 직접 돌리는 모델로 처리해요. 외부 AI 회사로 보내지 않아요.', 'Sorting, tagging and summaries run on a model we host ourselves. Nothing is sent to third-party AI companies.')}
${card(I.eyeoff, '요청 원문은 저장하지 않아요', 'Request text is never stored', 'AI에 보낸 글은 처리한 뒤 남기지 않고, 사용 횟수 같은 숫자만 기록해요. 서버 로그에도 할 일 제목을 남기지 않아요.', 'Text sent to AI is not kept after processing; only counts are recorded. Task titles never appear in server logs.')}
${card(I.noad, '광고·추적 없음', 'No ads, no tracking', '완전 무료이고, 광고도 분석·추적 도구도 넣지 않았어요.', 'Completely free, with no ads and no analytics or tracking tools.')}
${card(I.trash, '언제든 완전히 삭제', 'Delete everything, anytime', '앱 설정에서 계정과 모든 데이터를 바로 지울 수 있어요. 백업 사본도 14일 안에 사라져요.', 'Delete your account and all data from settings. Backup copies are gone within 14 days.')}
</div>
<p class="more-link">${T('이 페이지의 체험 창은 브라우저 안에서만 움직이고, 적은 내용을 어디에도 보내지 않아요.', 'The try-it windows on this page run only in your browser and send nothing anywhere.')}<br><a href="/privacy">${T('개인정보 처리방침 전문 보기 →', 'Read the full privacy policy →')}</a></p>
</div>
</section>

<section id="install" aria-labelledby="install-title">
<div class="wrap">
<div class="sec-head center"><div class="kicker">${T('설치', 'Install')}</div><h2 id="install-title">${T('내려받고 여는 방법', 'Download and open')}</h2><p>${T('아직 Apple · Microsoft 인증을 받기 전이라 처음 한 번은 직접 열어 줘야 해요. 그다음부터는 그냥 열려요.', 'The app is not yet certified by Apple or Microsoft, so you need to allow it once. After that it opens normally.')}</p></div>
<div class="install">
<div class="card install-card" data-os="mac">
<h3>${I.laptop}Mac</h3>
<ol class="steps">
${step('dmg 파일을 열고 꿈틀을 <b>응용 프로그램</b> 폴더로 끌어 넣어요.', 'Open the dmg and drag Kkumteul into the <b>Applications</b> folder.')}
${step('꿈틀을 열어요. "확인할 수 없음" 창이 뜨면 <b>완료</b>를 눌러요.', 'Open Kkumteul. If it says it can’t be verified, click <b>Done</b>.')}
${step('<b>시스템 설정 › 개인정보 보호 및 보안</b> 맨 아래에서 <b>그래도 열기</b>를 누르고, 한 번 더 <b>열기</b>를 눌러요.', 'In <b>System Settings › Privacy &amp; Security</b>, scroll down, click <b>Open Anyway</b>, then <b>Open</b>.')}
</ol>
<p class="install-sub">${T('macOS 14 이하는 꿈틀을 Control-클릭 › <b>열기</b>로도 돼요.', 'On macOS 14 or earlier you can also Control-click the app › <b>Open</b>.')}</p>
<p class="install-files"><a href="${DL.macArm}" data-dl="mac">${T('Apple 칩(M1 이후)', 'Apple chip (M1 or later)')}</a><a href="${DL.macIntel}" data-dl="mac-intel">${T('인텔 칩', 'Intel chip')}</a></p>
</div>
<div class="card install-card" data-os="win">
<h3>${I.laptop}Windows</h3>
<ol class="steps">
${step('내려받은 설치 파일을 열어요.', 'Open the installer you downloaded.')}
${step('"Windows의 PC 보호" 창이 뜨면 <b>추가 정보</b>를 눌러요.', 'If “Windows protected your PC” appears, click <b>More info</b>.')}
${step('<b>실행</b>을 누르면 설치가 끝나고 꿈틀이 열려요.', 'Click <b>Run anyway</b>. It installs and opens Kkumteul.')}
</ol>
<p class="install-sub">${T('Windows 10 · 11 (64비트)', 'Windows 10 and 11 (64-bit)')}</p>
<p class="install-files"><a href="${DL.win}" data-dl="win">${T('Windows 설치 파일', 'Windows installer')}</a></p>
</div>
</div>
<p class="more-link">${T('새 버전은 이 페이지에서 다시 받아 덮어 설치하면 돼요. 할 일은 그대로 남아요.', 'To update, download again from this page and install over the old one. Your tasks stay.')}<br><a href="https://github.com/kysk2295/sprout/releases/latest" rel="noopener">${T('모든 설치 파일 보기 →', 'All download files →')}</a></p>
</div>
</section>

<section id="faq" class="soft" aria-labelledby="faq-title">
<div class="wrap">
<div class="sec-head center"><h2 id="faq-title">${T('자주 묻는 질문', 'FAQ')}</h2></div>
<div class="faq">
${faq('정말 무료예요?', 'Is it really free?', `<p>네. ${N}은 무료이고 앱 안 결제나 광고가 없어요.</p>`, `<p>Yes. ${NE} is free, with no in-app purchases and no ads.</p>`)}
${faq('어디서 받아요?', 'Where can I get it?', '<p>Mac · Windows 앱은 이 페이지 맨 위 버튼으로 지금 받을 수 있어요(<a href="#install">여는 방법</a>). iPhone · Android 앱은 출시를 준비하고 있어요.</p>', '<p>The Mac and Windows apps are available now from the buttons at the top of this page (<a href="#install">how to open them</a>). The iPhone and Android apps are on the way.</p>')}
${faq('열 때 경고가 떠요. 괜찮아요?', 'I see a warning when opening it. Is that OK?', '<p>네. 아직 Apple · Microsoft 인증서로 서명하기 전이라 처음 한 번 뜨는 확인이에요. 이 페이지의 버튼으로 받은 파일이면 <a href="#install">여는 방법</a>대로 열면 돼요.</p>', '<p>Yes. The app is not signed with an Apple or Microsoft certificate yet, so you see this once. If you downloaded it from this page, follow <a href="#install">these steps</a>.</p>')}
${faq('AI가 내 글을 읽거나 저장하나요?', 'Does AI read or keep what I write?', '<p>자동 분류·태그처럼 AI 기능을 쓸 때만 그 내용을 우리 서버의 모델로 보내 처리해요. 처리한 원문은 저장하지 않고, 외부 AI 회사로 보내지도 않아요.</p>', '<p>Only when you use an AI feature such as auto-sorting, the relevant text goes to the model on our own server. The text is not stored afterwards and never goes to third-party AI companies.</p>')}
${faq('인터넷이 없어도 되나요?', 'Does it work offline?', '<p>네. 할 일 추가·수정·완료는 기기에 먼저 저장돼서 오프라인에서도 그대로 돼요. 다시 연결되면 다른 기기와 자동으로 맞춰요. AI 기능만 연결이 필요해요.</p>', '<p>Yes. Adding, editing and completing tasks are saved on the device first, so they work offline and sync when you reconnect. Only AI features need a connection.</p>')}
${faq('캐릭터는 어떻게 자라요?', 'How does the character grow?', '<p>할 일을 끝내면 1 XP(하루 10 XP까지), 이번 주 목표를 이루면 30 XP, 주간 점검은 30 XP, 정리는 20 XP를 받아요. 레벨 3 · 6 · 10 · 15에서 다음 모습으로 자라요. 이 페이지의 체험은 빨리 보여 드리려고 레벨이 훨씬 빨리 올라요.</p>', '<p>1 XP per finished task (up to 10 a day), 30 XP per weekly goal, 30 XP for a weekly review and 20 XP for a tidy-up. It evolves at levels 3, 6, 10 and 15. The demo on this page levels up much faster so you can see it.</p>')}
${faq('계정을 지우려면요?', 'How do I delete my account?', '<p>앱의 설정 › 계정 › 계정 삭제에서 바로 지울 수 있어요. 앱을 쓸 수 없을 땐 <a href="/account-deletion">계정 삭제 안내</a>를 봐 주세요.</p>', '<p>Go to Settings › Account › Delete account in the app. If you can’t use the app, see <a href="/account-deletion">how to delete your account</a>.</p>')}
${faq('앱 화면은 영어도 되나요?', 'Is the app available in English?', '<p>첫 버전의 앱 화면은 한국어로 나와요.</p>', '<p>The first release of the app is in Korean.</p>')}
</div>
</div>
</section>`
  return page({
    path: '/',
    titleKo: `${cfg.name} — 해낸 만큼 자라는 할 일·캘린더`,
    titleEn: `${cfg.nameEn} — The to-do list that grows with you`,
    descKo: '할 일과 캘린더를 한곳에. AI가 알아서 정리하고, 끝낸 할 일만큼 캐릭터가 자라는 무료 플래너. Mac · Windows · iPhone · Android.',
    descEn: 'Tasks and calendar in one place. AI sorts things for you and your character grows as you get things done. Free for Mac, Windows, iPhone and Android.',
    scripts: ['demos.js'],
    body
  })
}

export function support({ cfg, T, val, page }) {
  const body = `<article class="doc">
<div class="crumbs"><a href="/">${T('홈', 'Home')}</a> › ${T('지원', 'Support')}</div>
<div lang="ko" data-l="ko">
<h1>${cfg.name} 지원</h1>
<p>쓰다가 막히거나 이상한 점이 있으면 편하게 알려 주세요. 혼자 만드는 앱이라 답이 조금 늦을 수 있지만 꼭 읽어요.</p>
<h2>문의하기</h2>
<p>이메일: ${val(cfg.supportEmail)}</p>
<p>운영: ${val(cfg.operator)}</p>
<p>문제를 알려 주실 땐 아래를 같이 적어 주면 빨리 고칠 수 있어요.</p>
<ul><li>쓰는 기기와 운영체제(예: iPhone 15 · iOS 26, MacBook · macOS 26)</li><li>앱 버전(설정 맨 아래)</li><li>어떻게 하면 그 문제가 생기는지, 화면 캡처가 있으면 더 좋아요</li></ul>
<p>할 일 내용·비밀번호는 보내지 않아도 돼요.</p>
<h2>자주 찾는 것</h2>
<ul>
<li><a href="/account-deletion">계정과 데이터 삭제하기</a></li>
<li><a href="/privacy">개인정보 처리방침</a> — 어떤 정보를 왜, 얼마나 보관하는지</li>
<li><a href="/terms">이용약관</a></li>
<li><a href="/#faq">자주 묻는 질문</a></li>
</ul>
<h2>개인정보 문의</h2>
<p>개인정보 열람·정정·삭제 요청은 ${val(cfg.privacyEmail)} 로 보내 주세요. 본인 확인 후 10일 안에 처리 결과를 알려 드려요.</p>
</div>
<div lang="en" data-l="en">
<h1>${cfg.nameEn} Support</h1>
<p>If something is not working or feels off, let us know. ${cfg.nameEn} is built by one person, so replies can take a little while, but every message is read.</p>
<h2>Contact</h2>
<p>Email: ${val(cfg.supportEmail)}</p>
<p>Operator: ${val(cfg.operatorEn)}</p>
<p>To help us fix things quickly, please include:</p>
<ul><li>Your device and OS (e.g. iPhone 15 · iOS 26, MacBook · macOS 26)</li><li>App version (bottom of Settings)</li><li>Steps to reproduce, plus a screenshot if you can</li></ul>
<p>There is no need to send task contents or passwords.</p>
<h2>Quick links</h2>
<ul>
<li><a href="/account-deletion">Delete your account and data</a></li>
<li><a href="/privacy">Privacy Policy</a></li>
<li><a href="/terms">Terms of Service</a></li>
<li><a href="/#faq">FAQ</a></li>
</ul>
<h2>Privacy requests</h2>
<p>Send requests to access, correct or delete personal data to ${val(cfg.privacyEmail)}. We respond within 10 days after verifying your identity.</p>
</div>
</article>`
  return page({ path: '/support', titleKo: `지원 — ${cfg.name}`, titleEn: `Support — ${cfg.nameEn}`, descKo: `${cfg.name} 문의·지원`, descEn: `${cfg.nameEn} help and contact`, body })
}

export function notFound({ cfg, T, page }) {
  const body = `<article class="doc nf">
<img src="/assets/characters/egg.webp" alt="" width="120" height="120">
<h1>${T('페이지를 찾을 수 없어요', 'Page not found')}</h1>
<p>${T('주소가 바뀌었거나 없는 페이지예요.', 'This page has moved or does not exist.')}</p>
<p><a class="btn" href="/">${T('처음으로', 'Go home')}</a></p>
</article>`
  return page({ path: '/404', titleKo: `찾을 수 없음 — ${cfg.name}`, titleEn: `Not found — ${cfg.nameEn}`, descKo: '', descEn: '', body })
}
