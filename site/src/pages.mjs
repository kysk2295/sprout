// 첫 화면·지원·404 본문. 문구를 고칠 땐 여기만 본다(한국어가 기본, 영어는 옆에 같이).
const svg = (d, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const I = {
  laptop: svg('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>', ''),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>', ''),
  inbox: svg('<path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/><path d="M9 7.5h7"/>'),
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

const shot = (T, src, ko, en, { dark, w, h, lazy = true } = {}) =>
  `<img src="/assets/img/${src}.webp"${dark ? ` data-dark="/assets/img/${dark}.webp"` : ''} alt="${ko}" data-alt-ko="${ko}" data-alt-en="${en}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">`
const win = (inner) => `<div class="win"><div class="win-bar" aria-hidden="true"><i></i><i></i><i></i></div>${inner}</div>`

const SPECIES = [
  ['turtle', '꾸준한 거북이', 'Steady Turtle', '계획·몰입 — 정한 일을 끝까지 차근차근', 'Planner & deep focus — finishes what it starts, step by step'],
  ['squirrel', '차곡차곡 다람쥐', 'Tidy Squirrel', '계획·멀티 — 여러 일을 빠짐없이 챙겨요', 'Planner & multitasker — keeps every plate spinning'],
  ['cat', '몰두하는 고양이', 'Absorbed Cat', '즉흥·몰입 — 꽂히면 깊게 빠져요', 'Spontaneous & deep focus — dives deep once hooked'],
  ['otter', '재주 많은 수달', 'Handy Otter', '즉흥·멀티 — 아이디어가 많고 빨라요', 'Spontaneous & multitasker — quick and full of ideas']
]
const STAGES = [[1, '아기', 'Baby', 1], [2, '꼬마', 'Kid', 3], [3, '친구', 'Buddy', 6], [4, '단짝', 'Best friend', 10], [5, '전설', 'Legend', 15]]

export function landing({ cfg, T, esc, val, page }) {
  const N = esc(cfg.name), NE = esc(cfg.nameEn)
  const dlBtn = (ic, label) => `<button class="dl-btn" type="button" aria-disabled="true" disabled>${ic}<span><small>${T('곧 출시', 'Coming soon')}</small>${label}</span></button>`
  const ticks = (pairs) => `<ul class="ticks">${pairs.map(([k, e]) => `<li>${T(k, e)}</li>`).join('')}</ul>`
  const card = (ic, hk, he, pk, pe) => `<div class="card">${ic}<div><h3>${T(hk, he)}</h3><p>${T(pk, pe)}</p></div></div>`
  const faq = (qk, qe, ak, ae) => `<details><summary>${T(qk, qe)}</summary><div class="a">${T(ak, ae)}</div></details>`

  const body = `
<section class="hero" aria-labelledby="hero-title">
<div class="wrap">
<img class="hero-logo" src="/assets/brand/favicon.svg" alt="" width="76" height="76">
<div class="eyebrow">${T('Mac · Windows · iPhone · Android', 'Mac · Windows · iPhone · Android')}</div>
<h1 id="hero-title">${T('해낸 만큼 자라는<br>할 일·캘린더', 'The to-do list<br>that grows with you')}</h1>
<p class="lead">${T(`할 일과 일정을 한곳에 적으면 AI가 알아서 정리해 주고, 하나씩 끝낼 때마다 내 캐릭터가 자라요. 광고 없이 무료예요.`, `Keep tasks and events in one place. AI sorts them for you, and every finished task helps your character grow. Free, with no ads.`)}</p>
<div class="dl" role="group" aria-label="${'다운로드'}" data-aria-ko="다운로드" data-aria-en="Downloads">
${dlBtn(I.laptop, 'Mac')}${dlBtn(I.laptop, 'Windows')}${dlBtn(I.phone, 'App Store')}${dlBtn(I.phone, 'Google Play')}
</div>
<p class="dl-note">${T('지금 출시를 준비하고 있어요. 열리면 이 자리에서 바로 받을 수 있어요.', 'We are getting ready to launch. Downloads will appear right here.')}</p>
<div class="shot-stage">
${win(shot(T, 'tasks', `${N} 데스크톱 앱 — 오늘 할 일과 AI가 붙인 프로젝트 태그`, `${NE} desktop app: today's tasks with AI-applied project tags`, { dark: 'tasks-dark', w: 1600, h: 1000, lazy: false }))}
</div>
</div>
</section>

<section id="features" aria-label="${'기능'}">
<div class="wrap">

<div class="feature">
<div class="f-text">
<div class="kicker">${T('할 일', 'Tasks')}</div>
<h2>${T('떠오르면 바로 적고,<br>정리는 AI에게', 'Jot it down now.<br>Let AI tidy up.')}</h2>
<p>${T('"내일 3시 기획 회의 #업무"처럼 말하듯 적으면 날짜·시간·태그가 알아서 들어가요. 들어온 할 일은 AI가 맞는 리스트로 옮기고 태그를 붙여요.', 'Type naturally, like "planning meeting tomorrow 3pm #work", and the date, time and tag are filled in. AI moves new tasks to the right list and tags them for you.')}</p>
${ticks([
  ['오늘 · 내일 · 다음 7일 · 기본함 스마트 목록', 'Smart lists: Today, Tomorrow, Next 7 Days, Inbox'],
  ['리스트 · 폴더 · 태그 · 필터, 반복 · 알림 · 체크리스트', 'Lists, folders, tags, filters, repeats, reminders, checklists'],
  ['AI 자동 분류 · 자동 태그 — 마음에 안 들면 한 번에 되돌리기', 'Auto-sorting and auto-tagging, with one-tap undo']
])}
</div>
<div class="f-media">${win(shot(T, 'next7', '다음 7일 목록 — 할 일과 일정이 함께', 'Next 7 Days list with tasks and events together', { dark: 'next7-dark', w: 1600, h: 1000 }))}</div>
</div>

<div class="feature flip">
<div class="f-text">
<div class="kicker">${T('캘린더', 'Calendar')}</div>
<h2>${T('할 일과 일정을<br>한 달력에서', 'Tasks and events<br>on one calendar')}</h2>
<p>${T('일·주·월 보기에서 할 일과 일정을 같이 보고, 끌어서 날짜와 시간을 옮겨요. Google 캘린더와 맥 캘린더 일정도 불러와 함께 볼 수 있어요.', 'See tasks and events together in day, week and month views, and drag to reschedule. Bring in events from Google Calendar and the Mac calendar too.')}</p>
${ticks([
  ['한국 공휴일·대체공휴일 내장 — 인터넷 없이도 표시', 'Korean public holidays built in, even offline'],
  ['일요일·공휴일은 빨강, 토요일은 파랑', 'Sundays and holidays in red, Saturdays in blue'],
  ['음력 · 주 번호 표시 선택', 'Optional lunar dates and week numbers']
])}
</div>
<div class="f-media">${win(shot(T, 'calendar', '공휴일이 표시된 월간 캘린더', 'Month view with public holidays', { dark: 'calendar-dark', w: 1600, h: 1000 }))}</div>
</div>

<div class="feature">
<div class="f-text">
<div class="kicker">${T('작업 지도', 'Work map')}</div>
<h2>${T('흩어진 할 일을<br>프로젝트로 묶어 보기', 'Scattered tasks,<br>gathered into projects')}</h2>
<p>${T('공모전·이사·여행처럼 여러 날에 걸친 일은 AI가 관련 할 일을 찾아 프로젝트로 묶어요. 지금 어디까지 왔는지, 다음엔 뭘 할지 한눈에 보여요.', 'For anything that spans days, like a contest entry, a move or a trip, AI finds the related tasks and groups them into a project, so you can see where you are and what comes next.')}</p>
${ticks([
  ['단계 보드 — 끝난 단계와 지금 할 단계', 'Step board: what is done and what is next'],
  ['타임라인 · 관계도 — 끌어서 날짜와 순서 바꾸기', 'Timeline and relationship map, drag to change dates and order'],
  ['같이 계획 짜기 — 대화하며 단계를 나눠요', 'Plan together: break work into steps in a short chat']
])}
</div>
<div class="f-media">${win(shot(T, 'map-plan', '프로젝트 단계 보드와 캐릭터와 같이 계획 짜기', 'Project step board with the plan-together chat', { dark: 'map-plan-dark', w: 1600, h: 1000 }))}</div>
</div>

<div class="feature flip">
<div class="f-text">
<div class="kicker">${T('주간 퀘스트 · 점검', 'Weekly quests & review')}</div>
<h2>${T('한 주는 퀘스트로 정하고,<br>주말엔 같이 돌아봐요', 'Set the week as quests.<br>Look back together.')}</h2>
<p>${T('이번 주에 이루고 싶은 일을 퀘스트로 정하면, 해낼 때마다 캐릭터 방이 채워져요. 주말엔 캐릭터와 한 주를 돌아보고, 쌓인 기본함과 밀린 일도 하나씩 같이 정리해요.', 'Turn this week’s goals into quests and watch your character’s room fill up as you hit them. At the weekend, look back with your character and clear the inbox and overdue tasks together.')}</p>
${ticks([
  ['퀘스트 하나에 +30 XP, 주간 점검 +30 XP, 정리 +20 XP', '+30 XP per quest, +30 for a weekly review, +20 for a tidy-up'],
  ['기한 지난 일은 미루기 · 날짜 바꾸기 · 지우기를 한 번에', 'Snooze, reschedule or remove overdue tasks in one pass'],
  ['레벨이 오르면 방을 꾸밀 장식이 하나씩 열려요', 'Each level unlocks a new decoration for the room']
])}
</div>
<div class="f-media">${win(shot(T, 'growth', '캐릭터 방 — 레벨, 이번 주 퀘스트, 주간 점검', 'Character room with level, weekly quests and review', { dark: 'growth-dark', w: 1600, h: 1000 }))}</div>
</div>

</div>
</section>

<section class="soft" aria-labelledby="more-title">
<div class="wrap">
<div class="sec-head center"><h2 id="more-title">${T('그 밖에도', 'And more')}</h2><p>${T('매일 쓰는 앱이라 작은 것까지 챙겼어요.', 'Small things that matter when you use it every day.')}</p></div>
<div class="grid3">
${card(I.inbox, '수집함', 'Inbox', '메모·링크를 일단 던져 두면 할 일 · 메모 · 볼 것으로 나눠 줘요. iPhone에선 공유하기로 바로 모아요.', 'Drop in notes and links; they get sorted into tasks, notes and things to read. Share straight from other apps on iPhone.')}
${card(I.book, 'LLM 위키', 'LLM wiki', '태그가 곧 위키 페이지예요. 사람 · 프로젝트 · 주제별로 모인 내용을 AI가 한 쪽으로 정리해요.', 'Every tag is a wiki page. AI summarises what you have collected about each person, project or topic.')}
${card(I.diary, '일기 캐릭터', 'Journal buddy', '하루를 적으면 캐릭터가 짧게 말을 걸어요. 기분도 같이 남겨요.', 'Write about your day and your character chats back briefly. Log your mood alongside.')}
${card(I.widget, '위젯', 'Widgets', '맥 데스크톱 위젯으로 오늘 할 일을 바로 보고 체크해요.', 'See and check off today’s tasks from a Mac desktop widget.')}
${card(I.bell, '알림', 'Reminders', '할 일 알림, 하루 요약, 레벨업 소식을 놓치지 않게 알려 줘요.', 'Task reminders, a daily summary and level-up news.')}
${card(I.sync, '오프라인에서도', 'Works offline', '기기에 먼저 저장해서 바로 반응하고, 인터넷이 돌아오면 모든 기기에 맞춰요.', 'Saved on your device first so it feels instant, then synced to every device when you are back online.')}
</div>
</div>
</section>

<section id="growth" aria-labelledby="growth-title">
<div class="wrap">
<div class="sec-head center">
<div class="kicker">${T('성장', 'Growth')}</div>
<h2 id="growth-title">${T('끝낸 할 일이<br>캐릭터를 키워요', 'Finished tasks<br>grow your character')}</h2>
<p>${T('한 주가 끝나도 남는 게 있도록. 할 일 하나에 1 XP, 이번 주 목표를 이루면 30 XP. 레벨이 오르면 캐릭터가 다음 모습으로 자라요.', 'So every week leaves something behind. 1 XP per task, 30 XP per weekly goal. Level up and your character evolves.')}</p>
</div>
<div class="loop" aria-label="${'성장 순서'}" data-aria-ko="성장 순서" data-aria-en="Growth loop">
<span class="step">${T('할 일 끝내기', 'Finish a task')}</span><span class="arr" aria-hidden="true">→</span>
<span class="step">${T('XP 쌓기', 'Earn XP')}</span><span class="arr" aria-hidden="true">→</span>
<span class="step">${T('레벨 업', 'Level up')}</span><span class="arr" aria-hidden="true">→</span>
<span class="step">${T('캐릭터 진화', 'Evolve')}</span>
</div>
<div class="species-tabs" role="tablist" aria-label="${'캐릭터 종류'}" data-aria-ko="캐릭터 종류" data-aria-en="Species">
${SPECIES.map(([id, k, e], i) => `<button type="button" role="tab" data-species="${id}" aria-selected="${i === 2}" aria-controls="stages" tabindex="0">${T(k, e)}</button>`).join('')}
</div>
<div class="stages" id="stages" role="tabpanel">
<div class="stage"><img src="/assets/characters/egg.svg" alt="알" data-alt-ko="아직 모르는 알" data-alt-en="Mystery egg" width="120" height="120" loading="lazy"><b>${T('알', 'Egg')}</b><small>${T('성향 질문 전', 'Before the quiz')}</small></div>
${STAGES.map(([st, k, e, lv]) => `<div class="stage"><img src="/assets/characters/cat-${st}.svg" data-stage="${st}" alt="${k}" data-alt-ko="${k} 단계 캐릭터" data-alt-en="${e} stage character" width="120" height="120" loading="lazy"><b>${T(k, e)}</b><small>Lv ${lv}</small></div>`).join('')}
</div>
${SPECIES.map(([id, , , lk, le]) => `<p class="species-line" data-species-line="${id}"${id === 'cat' ? '' : ' hidden'}>${T(lk, le)}</p>`).join('')}
<div class="growth-extra">
${card(I.quiz, '성향 질문으로 고르는 종', 'A species that fits you', '처음에 짧은 질문 몇 개에 답하면 일하는 방식에 맞는 캐릭터가 알에서 나와요.', 'Answer a few short questions and a character that matches how you work hatches from the egg.')}
${card(I.goal, '이번 주 목표', 'Weekly goals', '한 주에 이룰 목표를 최대 다섯 개 정하고, 이루면 XP를 받아요.', 'Set up to five goals for the week and earn XP as you hit them.')}
${card(I.report, '주간 리포트', 'Weekly report', '한 주에 해낸 일을 숫자와 짧은 글로 돌아봐요. 숫자는 앱이 세고, 글은 AI가 써요.', 'Look back on the week in numbers and a short note. The app counts, AI writes.')}
</div>
</div>
</section>

<section id="privacy" class="soft" aria-labelledby="privacy-title">
<div class="wrap">
<div class="sec-head center">
<div class="kicker">${T('개인정보', 'Privacy')}</div>
<h2 id="privacy-title">${T('내 할 일은 내 것이에요', 'Your tasks stay yours')}</h2>
<p>${T('할 일 앱엔 생활이 다 담겨요. 그래서 처음부터 이렇게 만들었어요.', 'A to-do app holds your whole life, so we built it this way from day one.')}</p>
</div>
<div class="promise">
${card(I.server, 'AI는 우리 서버에서만', 'AI runs on our own server', '자동 분류·태그·요약은 운영자가 직접 돌리는 모델로 처리해요. 외부 AI 회사로 보내지 않아요.', 'Sorting, tagging and summaries run on a model we host ourselves. Nothing is sent to third-party AI companies.')}
${card(I.eyeoff, '요청 원문은 저장하지 않아요', 'Request text is never stored', 'AI에 보낸 글은 처리한 뒤 남기지 않고, 사용 횟수 같은 숫자만 기록해요. 서버 로그에도 할 일 제목을 남기지 않아요.', 'Text sent to AI is not kept after processing; only counts are recorded. Task titles never appear in server logs.')}
${card(I.noad, '광고·추적 없음', 'No ads, no tracking', '완전 무료이고, 광고도 분석·추적 도구도 넣지 않았어요.', 'Completely free, with no ads and no analytics or tracking tools.')}
${card(I.trash, '언제든 완전히 삭제', 'Delete everything, anytime', '앱 설정에서 계정과 모든 데이터를 바로 지울 수 있어요. 백업 사본도 14일 안에 사라져요.', 'Delete your account and all data from settings. Backup copies are gone within 14 days.')}
</div>
<p class="more-link"><a href="/privacy">${T('개인정보 처리방침 전문 보기 →', 'Read the full privacy policy →')}</a></p>
</div>
</section>

<section id="faq" aria-labelledby="faq-title">
<div class="wrap">
<div class="sec-head center"><h2 id="faq-title">${T('자주 묻는 질문', 'FAQ')}</h2></div>
<div class="faq">
${faq('정말 무료예요?', 'Is it really free?', `<p>네. ${N}은 무료이고 앱 안 결제나 광고가 없어요.</p>`, `<p>Yes. ${NE} is free, with no in-app purchases and no ads.</p>`)}
${faq('언제 받을 수 있어요?', 'When can I get it?', '<p>지금 출시를 준비하고 있어요. Mac · Windows · iPhone · Android 앱이 열리면 이 페이지 맨 위 버튼으로 받을 수 있어요.</p>', '<p>We are preparing the launch. When the Mac, Windows, iPhone and Android apps are ready, the buttons at the top of this page will work.</p>')}
${faq('AI가 내 글을 읽거나 저장하나요?', 'Does AI read or keep what I write?', '<p>자동 분류·태그처럼 AI 기능을 쓸 때만 그 내용을 우리 서버의 모델로 보내 처리해요. 처리한 원문은 저장하지 않고, 외부 AI 회사로 보내지도 않아요.</p>', '<p>Only when you use an AI feature such as auto-sorting, the relevant text goes to the model on our own server. The text is not stored afterwards and never goes to third-party AI companies.</p>')}
${faq('인터넷이 없어도 되나요?', 'Does it work offline?', '<p>네. 할 일 추가·수정·완료는 기기에 먼저 저장돼서 오프라인에서도 그대로 돼요. 다시 연결되면 다른 기기와 자동으로 맞춰요. AI 기능만 연결이 필요해요.</p>', '<p>Yes. Adding, editing and completing tasks are saved on the device first, so they work offline and sync when you reconnect. Only AI features need a connection.</p>')}
${faq('캐릭터는 어떻게 자라요?', 'How does the character grow?', '<p>할 일을 끝내면 1 XP(하루 10 XP까지), 이번 주 목표를 이루면 30 XP, 주간 점검은 30 XP, 정리는 20 XP를 받아요. 레벨 3 · 6 · 10 · 15에서 다음 모습으로 자라요.</p>', '<p>1 XP per finished task (up to 10 a day), 30 XP per weekly goal, 30 XP for a weekly review and 20 XP for a tidy-up. It evolves at levels 3, 6, 10 and 15.</p>')}
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
<img src="/assets/characters/egg.svg" alt="" width="120" height="120">
<h1>${T('페이지를 찾을 수 없어요', 'Page not found')}</h1>
<p>${T('주소가 바뀌었거나 없는 페이지예요.', 'This page has moved or does not exist.')}</p>
<p><a class="btn" href="/">${T('처음으로', 'Go home')}</a></p>
</article>`
  return page({ path: '/404', titleKo: `찾을 수 없음 — ${cfg.name}`, titleEn: `Not found — ${cfg.nameEn}`, descKo: '', descEn: '', body })
}
