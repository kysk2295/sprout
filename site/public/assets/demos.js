// 첫 화면 체험(할 일 빠른 추가 · 성장 · 작업 지도 · 캘린더) — 프레임워크 없이, 브라우저 안에서만 돈다(서버로 아무것도 안 보냄).
// 앱의 동작(packages/schema recognition·autoTag·planChat, 데스크톱 단계 보드·월 캘린더)을 작게 흉내 낸 것이라 규칙은 일부만 있다.
// CSP(style-src 'self') 때문에 HTML 문자열에 style 속성을 쓰지 않는다 — 위치·색은 el.style / setProperty로만.
(function () {
  'use strict'
  var root = document.documentElement
  var RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }
  var reduced = function () { return RM.matches }
  var lang = function () { return root.getAttribute('data-lang') === 'en' ? 'en' : 'ko' }
  var t = function (ko, en) { return lang() === 'en' ? en : ko }
  var tx = function (o) { return typeof o === 'string' ? o : (lang() === 'en' ? o.en : o.ko) }

  // ── 작은 DOM 도우미 ──
  function h(tag, props) {
    var el = document.createElement(tag)
    if (props) for (var k in props) {
      var v = props[k]
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'text') el.textContent = v
      else if (k === 'html') el.innerHTML = v
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : v)
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i])
    return el
  }
  function add(el, c) {
    if (c == null || c === false) return
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x) }); return }
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild) }
  var $ = function (s, r) { return (r || document).querySelector(s) }
  function live(el, msg) { if (el) { el.textContent = ''; setTimeout(function () { el.textContent = msg }, 30) } }
  function later(fn, ms) { return setTimeout(fn, reduced() ? Math.min(ms, 60) : ms) }

  var ICON = {
    cal: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.6"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.6"/><path d="M8 5v3.2l2 1.3"/></svg>',
    tag: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 8.2V3.3c0-.4.4-.8.8-.8h4.9l5.3 5.3-5.7 5.7-5.3-5.3Z"/><circle cx="5.5" cy="5.5" r=".9"/></svg>',
    repeat: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M3 7a4.5 4.5 0 0 1 8-2.6L12.5 6M12.5 3v3h-3M13 9a4.5 4.5 0 0 1-8 2.6L3.5 10M3.5 13v-3h3"/></svg>',
    flag: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3.5 14V2.5M3.5 3h8l-1.6 3 1.6 3h-8"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    enter: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 3.5v4a2 2 0 0 1-2 2h-7M6 6.5l-3 3 3 3"/></svg>',
    spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5c.4 3.2 1.4 4.6 4.9 5-3.5.5-4.5 1.9-4.9 5.1-.4-3.2-1.4-4.6-4.9-5.1 3.5-.4 4.5-1.8 4.9-5Z"/></svg>',
    grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="6" cy="4" r="1.1"/><circle cx="10" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/><circle cx="10" cy="12" r="1.1"/></g></svg>',
    chevL: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
    chevR: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>'
  }
  var icon = function (n, cls) { return h('span', { class: 'ico' + (cls ? ' ' + cls : ''), html: ICON[n] }) }

  // ── 날짜 ──
  var pad = function (n) { return (n < 10 ? '0' : '') + n }
  var key = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  var parseKey = function (k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12) }
  var addDays = function (k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return key(d) }
  var diffDays = function (a, b) { return Math.round((parseKey(b) - parseKey(a)) / 864e5) }
  var TODAY = key(new Date())
  var WD_KO = ['일', '월', '화', '수', '목', '금', '토']
  var WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  var MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  function dateLabel(k, withWd) {
    var d = parseKey(k), n = diffDays(TODAY, k)
    if (n === 0) return t('오늘', 'Today')
    if (n === 1) return t('내일', 'Tomorrow')
    if (n === -1) return t('어제', 'Yesterday')
    var wd = withWd ? t(' (' + WD_KO[d.getDay()] + ')', ' (' + WD_EN[d.getDay()] + ')') : ''
    return t((d.getMonth() + 1) + '월 ' + d.getDate() + '일', MON_EN[d.getMonth()] + ' ' + d.getDate()) + wd
  }
  function longDate(k) { var d = parseKey(k); return t((d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WD_KO[d.getDay()] + ')', WD_EN[d.getDay()] + ', ' + MON_EN[d.getMonth()] + ' ' + d.getDate()) }
  function timeLabel(hm) {
    if (!hm) return ''
    var p = hm.split(':'), hh = +p[0], mm = p[1]
    if (lang() === 'en') return ((hh + 11) % 12 + 1) + ':' + mm + (hh < 12 ? ' AM' : ' PM')
    return (hh < 12 ? '오전 ' : '오후 ') + ((hh + 11) % 12 + 1) + ':' + mm
  }

  // ── 자연어 인식(앱 recognition.ts를 아주 작게) ──
  var WD_RE = '[일월화수목금토]'
  var EN_WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  function weekdayFrom(base, target, nextWeek) {
    var d = parseKey(base).getDay()
    if (nextWeek) { var mon = addDays(base, -((d + 6) % 7) + 7); return addDays(mon, (target + 6) % 7) }
    return addDays(base, (target - d + 7) % 7)
  }
  function parse(raw) {
    var work = raw, toks = [], out = { title: '', date: null, time: null, tags: [], priority: 0, repeat: null, tokens: toks }
    function take(re, fn) {
      var m = re.exec(work)
      if (!m) return false
      var start = m.index + (m[1] ? m[1].length : 0), str = m[0].slice(m[1] ? m[1].length : 0)
      if (fn(m) === false) return false
      toks.push({ start: start, end: start + str.length })
      work = work.slice(0, start) + new Array(str.length + 1).join(' ') + work.slice(start + str.length)
      return true
    }
    var B = '(^|\\s)', E = '(?=\\s|$)', SUF = '(?:에는|에|까지|부터)?'
    // 날짜(먼저 맞는 것 하나)
    take(new RegExp(B + '매주\\s?(' + WD_RE + ')요일' + SUF + E), function (m) { var i = WD_KO.indexOf(m[2]); out.date = weekdayFrom(TODAY, i); out.repeat = { ko: '매주 ' + m[2] + '요일', en: 'Every ' + WD_EN[i] } }) ||
    take(new RegExp(B + '(이번|다음)\\s?주\\s?(' + WD_RE + ')요일' + SUF + E), function (m) { out.date = weekdayFrom(TODAY, WD_KO.indexOf(m[3]), m[2] === '다음') }) ||
    take(new RegExp(B + '(오늘|내일|모레|글피|매일)' + SUF + E), function (m) { out.date = addDays(TODAY, { 오늘: 0, 매일: 0, 내일: 1, 모레: 2, 글피: 3 }[m[2]]); if (m[2] === '매일') out.repeat = { ko: '매일', en: 'Daily' } }) ||
    take(new RegExp(B + '(\\d{1,2})월\\s?(\\d{1,2})일' + SUF + E), function (m) { return setMD(+m[2], +m[3]) }) ||
    take(new RegExp(B + '(\\d{1,2})/(\\d{1,2})' + SUF + E), function (m) { return setMD(+m[2], +m[3]) }) ||
    take(new RegExp(B + '(' + WD_RE + ')요일' + SUF + E), function (m) { out.date = weekdayFrom(TODAY, WD_KO.indexOf(m[2])) }) ||
    take(new RegExp(B + '(이번\\s?)?주말' + SUF + E), function () { out.date = weekdayFrom(TODAY, 6) }) ||
    take(/(^|\s)(today|tonight|tomorrow|tmr)(?=\s|$)/i, function (m) { var w = m[2].toLowerCase(); out.date = addDays(TODAY, w === 'today' || w === 'tonight' ? 0 : 1); if (w === 'tonight' && !out.time) out.time = '20:00' }) ||
    take(/(^|\s)every\s?day(?=\s|$)|(^|\s)daily(?=\s|$)/i, function () { out.date = TODAY; out.repeat = { ko: '매일', en: 'Daily' } }) ||
    take(/(^|\s)(?:(every|next|this)\s)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?=\s|$)/i, function (m) {
      var i = EN_WD.indexOf(m[3].toLowerCase()), q = (m[2] || '').toLowerCase()
      out.date = weekdayFrom(TODAY, i, q === 'next')
      if (q === 'every') out.repeat = { ko: '매주 ' + WD_KO[i] + '요일', en: 'Every ' + WD_EN[i] }
    })
    function setMD(mo, d) {
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
      var y = parseKey(TODAY).getFullYear(), k = y + '-' + pad(mo) + '-' + pad(d)
      if (parseKey(k).getDate() !== d) return false
      if (diffDays(TODAY, k) < -30) k = (y + 1) + '-' + pad(mo) + '-' + pad(d)
      out.date = k
    }
    // 시각
    take(new RegExp(B + '((오전|오후|아침|저녁|밤|낮)\\s?)?(\\d{1,2})(?:시(?:\\s?(\\d{1,2})분|\\s?(반))?|:(\\d{2}))' + SUF + E), function (m) {
      var hh = +m[4], mm = m[5] ? +m[5] : m[6] ? 30 : m[7] ? +m[7] : 0, ap = m[3]
      if (hh > 23 || mm > 59) return false
      if ((ap === '오후' || ap === '저녁' || ap === '밤' || (ap === '낮' && hh < 6)) && hh < 12) hh += 12
      else if ((ap === '오전' || ap === '아침') && hh === 12) hh = 0
      else if (!ap && !m[7] && hh >= 1 && hh <= 6) hh += 12
      out.time = pad(hh) + ':' + pad(mm)
    }) ||
    take(/(^|\s)(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s|$)/i, function (m) {
      var hh = +m[2] % 12 + (m[4].toLowerCase() === 'pm' ? 12 : 0), mm = m[3] ? +m[3] : 0
      if (+m[2] > 12 || mm > 59) return false
      out.time = pad(hh) + ':' + pad(mm)
    }) ||
    take(/(^|\s)(?:at\s)?(\d{1,2}):(\d{2})(?=\s|$)/i, function (m) { if (+m[2] > 23 || +m[3] > 59) return false; out.time = pad(+m[2]) + ':' + m[3] })
    // 우선순위 · 태그
    take(/(^|\s)!(높음|중간|낮음|high|medium|med|low)(?=\s|$)/i, function (m) { out.priority = { 높음: 3, high: 3, 중간: 2, medium: 2, med: 2, 낮음: 1, low: 1 }[m[2].toLowerCase()] })
    while (take(/(^|\s)#([^\s#]+)/, function (m) { if (out.tags.indexOf(m[2]) < 0) out.tags.push(m[2]) })) { /* 반복 */ }
    if (out.time && !out.date) out.date = TODAY
    out.title = work.replace(/\s+/g, ' ').trim()
    toks.sort(function (a, b) { return a.start - b.start })
    return out
  }

  // ── AI 자동 분류·태그 흉내(앱은 서버 모델 + 사전 규칙. 여기선 낱말 규칙만) ──
  var LISTS = {
    inbox: { ko: '기본함', en: 'Inbox', emoji: '📥', c: 'gray' },
    work: { ko: '업무', en: 'Work', emoji: '💼', c: 'blue' },
    study: { ko: '공부', en: 'Study', emoji: '📚', c: 'purple' },
    family: { ko: '가족', en: 'Family', emoji: '🏠', c: 'orange' },
    health: { ko: '건강', en: 'Health', emoji: '🏃', c: 'green' }
  }
  var PROJECT_CONTEST = { ko: '청년 AI 아이디어 공모전', en: 'Youth AI Idea Contest' }
  var PROJECT_MOVE = { ko: '가을 이사', en: 'Fall move' }
  var RULES = [
    { re: /공모전|contest|hackathon|해커톤/i, tag: PROJECT_CONTEST, project: true, list: 'study' },
    { re: /이사|이삿|짐 싸|moving|move out|movers/i, tag: PROJECT_MOVE, project: true, list: 'family' },
    { re: /교수|과제|강의|시험|공부|스터디|수업|영어|단어|논문|professor|homework|class|exam|study|lecture|essay/i, list: 'study' },
    { re: /미팅|회의|보고|기획|리뷰|면담|발표|meeting|report|review|standup|sync|pitch/i, list: 'work', tag: { ko: '회의', en: 'Meetings' } },
    { re: /엄마|아빠|부모님|가족|생신|동생|할머니|할아버지|mom|dad|parents|family|birthday|grandma/i, list: 'family' },
    { re: /러닝|달리기|헬스|병원|요가|운동|산책|치과|약|run|gym|yoga|workout|doctor|dentist|walk/i, list: 'health' }
  ]
  function autoSort(title, userTags) {
    var hay = title + ' ' + userTags.join(' '), list = null, tags = []
    RULES.forEach(function (r) {
      if (!r.re.test(hay)) return
      if (!list && r.list) list = r.list
      if (r.tag && tags.length < 2 && !userTags.some(function (u) { return u === r.tag.ko || u === r.tag.en })) tags.push({ name: r.tag, project: !!r.project, ai: true })
    })
    return { list: list, tags: tags }
  }

  // ── 반짝 효과(+XP, 꽃가루) ──
  function floatText(host, x, y, text, cls) {
    var el = h('span', { class: 'xp-pop' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', text: text })
    el.style.left = x + 'px'; el.style.top = y + 'px'
    host.appendChild(el)
    setTimeout(function () { el.remove() }, reduced() ? 600 : 1100)
  }
  function confetti(host, n) {
    if (reduced()) return
    var colors = ['#12715e', '#f2b84b', '#f08a5d', '#3db79b', '#4169e8'] // 45 브랜드: 청록·꿀·살구
    for (var i = 0; i < n; i++) {
      var p = h('i', { class: 'confetti', 'aria-hidden': 'true' })
      var a = (Math.PI * 2 * i) / n + Math.random() * 0.5, r = 70 + Math.random() * 70
      p.style.setProperty('--dx', Math.cos(a) * r + 'px')
      p.style.setProperty('--dy', Math.sin(a) * r - 30 + 'px')
      p.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg')
      p.style.background = colors[i % colors.length]
      host.appendChild(p)
      setTimeout(p.remove.bind(p), 1300)
    }
  }
  function bump(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls) }

  // 성장 체험에서 고른 종을 첫 화면 캐릭터에도
  var species = 'worm'
  var onSpecies = []
  var charSrc = function (sp, st) { return '/assets/characters/' + (st ? sp + '-' + st : 'egg') + '.svg' }

  // ════════════════════════════════════════════════════════════════
  // 1. 첫 화면 — 빠른 추가
  // ════════════════════════════════════════════════════════════════
  function heroDemo(host) {
    var seq = 0
    var tasks = [
      { id: ++seq, title: { ko: '디자인 시안 피드백 회의 정리', en: 'Write up design feedback meeting' }, date: TODAY, time: '11:00', list: 'work', tags: [{ name: { ko: '회의', en: 'Meetings' } }], priority: 0 },
      { id: ++seq, title: { ko: '엄마 생신 선물 고르기', en: 'Pick a birthday gift for Mom' }, date: TODAY, list: 'family', tags: [{ name: { ko: '중요', en: 'Important' }, red: true }], priority: 3 },
      { id: ++seq, title: { ko: '공모전 서비스 프로토타입 개발', en: 'Build the contest prototype' }, date: addDays(TODAY, 1), list: 'study', tags: [{ name: PROJECT_CONTEST, project: true }], priority: 2 },
      { id: ++seq, title: { ko: '영어 단어 30개 외우기', en: 'Learn 30 English words' }, date: TODAY, time: '21:00', list: 'study', tags: [], priority: 0 },
      { id: ++seq, title: { ko: '비타민 챙겨 먹기', en: 'Take vitamins' }, date: TODAY, time: '09:00', list: 'health', tags: [], priority: 0, done: true }
    ]
    var xp = 70, lv = 8, need = 110, fresh = null, lastAuto = null, typing = null, touched = false
    var EXAMPLES = [
      { ko: '내일 오후 3시 교수님 미팅 #공모전', en: 'meeting with professor tomorrow 3pm #contest' },
      { ko: '매주 월요일 9시 팀 회의', en: 'team sync every monday 9:00' },
      { ko: '금요일 이사 업체 견적 비교 !높음', en: 'compare movers friday !high' }
    ]

    var input = h('input', { class: 'add-input', type: 'text', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-describedby': 'hd-hint' })
    var hlIn = h('span')
    var hl = h('span', { class: 'add-hl', 'aria-hidden': 'true' }, hlIn)
    var sendBtn = h('button', { class: 'add-send', type: 'button', html: ICON.enter })
    var summary = h('div', { class: 'recog', 'aria-live': 'polite' })
    var exRow = h('div', { class: 'ex-row' })
    var listEl = h('div', { class: 'tl' })
    var toast = h('div', { class: 'app-toast', role: 'status', hidden: true })
    var sr = h('div', { class: 'sr', 'aria-live': 'polite' })
    var sideLists = h('div', { class: 'side-lists' })
    var avatar = h('img', { class: 'side-char', src: charSrc(species, 3), alt: '', width: 34, height: 34 })
    var lvText = h('b'), xpText = h('small'), xpFill = h('i')
    var main = h('div', { class: 'app-main' })
    var head = h('div', { class: 'app-head' })
    var charBox = h('div', { class: 'side-me', 'aria-live': 'off' }, avatar, h('div', { class: 'side-me-t' }, lvText, xpText, h('span', { class: 'xpbar' }, xpFill)))

    var side = h('div', { class: 'app-side' }, sideLists, charBox)
    main.append(head, h('div', { class: 'addbar' }, icon('plus', 'add-plus'), h('div', { class: 'add-field' }, hl, input), sendBtn), summary, exRow, listEl, toast, sr)
    clear(host)
    host.append(side, main)

    function syncHL() {
      var raw = input.value, p = parse(raw)
      clear(hlIn)
      var at = 0
      p.tokens.forEach(function (tk) { hlIn.append(raw.slice(at, tk.start), h('mark', { text: raw.slice(tk.start, tk.end) })); at = tk.end })
      hlIn.append(raw.slice(at))
      hlIn.style.transform = 'translateX(' + -input.scrollLeft + 'px)'
      clear(summary)
      sendBtn.hidden = !raw.trim()
      if (!raw.trim()) { summary.hidden = true; return p }
      summary.hidden = false
      var chips = []
      if (p.date) chips.push(h('span', { class: 'rc' }, icon('cal'), longDate(p.date)))
      if (p.time) chips.push(h('span', { class: 'rc' }, icon('clock'), timeLabel(p.time)))
      if (p.repeat) chips.push(h('span', { class: 'rc' }, icon('repeat'), tx(p.repeat)))
      if (p.priority) chips.push(h('span', { class: 'rc pr' + p.priority }, icon('flag'), [0, t('낮음', 'Low'), t('중간', 'Medium'), t('높음', 'High')][p.priority]))
      p.tags.forEach(function (g) { chips.push(h('span', { class: 'rc' }, icon('tag'), g)) })
      if (!chips.length) chips.push(h('span', { class: 'rc muted' }, t('날짜 없이 기본함에 들어가요', 'No date: goes to the Inbox')))
      add(summary, [h('span', { class: 'recog-l' }, t('알아들은 것', 'Understood')), chips, h('span', { class: 'recog-enter' }, t('Enter로 추가', 'Enter to add'))])
      return p
    }

    function submit() {
      var raw = input.value.trim()
      if (!raw) return
      stopTyping()
      var p = parse(raw)
      var title = p.title || raw
      var task = { id: ++seq, title: title, date: p.date, time: p.time, list: 'inbox', tags: p.tags.map(function (g) { return { name: g } }), priority: p.priority, repeat: p.repeat, sorting: true }
      tasks.push(task)
      fresh = task.id
      input.value = ''
      syncHL()
      render()
      live(sr, t('추가했어요: ', 'Added: ') + title)
      // 잠깐 뒤 AI가 리스트·태그를 붙인다
      later(function () {
        var r = autoSort(title, p.tags)
        task.sorting = false
        var prev = { list: task.list, tags: task.tags.slice() }
        if (r.list) task.list = r.list
        task.tags = task.tags.concat(r.tags)
        task.aiFresh = true
        lastAuto = { task: task, prev: prev }
        render()
        task.aiFresh = false
        if (r.list || r.tags.length) {
          var n = r.tags.length, L = r.list ? LISTS[r.list] : null
          var ko = L ? "'" + L.ko + "'" + (/[가-힣]/.test(L.ko.slice(-1)) && (L.ko.charCodeAt(L.ko.length - 1) - 0xac00) % 28 && (L.ko.charCodeAt(L.ko.length - 1) - 0xac00) % 28 !== 8 ? '으로' : '로') + (n ? ' 옮기고 태그 ' + n + '개를 붙였어요' : ' 옮겼어요') : '태그 ' + n + '개를 붙였어요'
          var en = (L ? 'moved it to ' + L.en + (n ? ' and ' : '') : '') + (n ? 'added ' + n + ' tag' + (n > 1 ? 's' : '') : '')
          showToast(t('✦ AI가 ' + ko, '✦ AI ' + en), true)
        } else showToast(t('기본함에 넣었어요', 'Saved to the Inbox'), false)
      }, 900)
    }
    function showToast(msg, undo) {
      clear(toast)
      toast.append(h('span', { text: msg }))
      if (undo) toast.append(h('button', { type: 'button', text: t('되돌리기', 'Undo'), onclick: function () {
        if (!lastAuto) return
        lastAuto.task.list = lastAuto.prev.list; lastAuto.task.tags = lastAuto.prev.tags; lastAuto = null
        toast.hidden = true; render(); live(sr, t('자동 정리를 되돌렸어요', 'Auto-sort undone'))
      } }))
      toast.hidden = false
      bump(toast, 'in')
      clearTimeout(toast._t)
      toast._t = setTimeout(function () { toast.hidden = true }, 5200)
    }

    function toggle(task, btn) {
      task.done = !task.done
      var r = btn.getBoundingClientRect(), m = host.getBoundingClientRect()
      if (task.done) {
        xp++; if (xp >= need) { xp -= need; lv++; need += 10 }
        floatText(host, r.left - m.left + r.width / 2, r.top - m.top, '+1 XP')
        bump(avatar, 'hop')
        live(sr, t('완료! +1 XP', 'Done! +1 XP'))
      } else { xp = Math.max(0, xp - 1); live(sr, t('완료를 취소했어요', 'Marked as not done')) }
      var row = btn.closest('.row')
      if (row) row.classList.toggle('is-done', task.done)
      renderMe()
      later(render, 650)
    }

    function chip(g) {
      var cls = 'chip' + (g.project ? ' proj' : '') + (g.red ? ' red' : '') + (g.ai ? ' ai' : '')
      return h('span', { class: cls }, g.ai ? icon('spark') : null, tx(g.name))
    }
    function rowEl(task) {
      var L = LISTS[task.list], overdue = task.date && task.date < TODAY && !task.done
      var meta = h('span', { class: 'meta' })
      if (task.sorting) meta.append(h('span', { class: 'sorting' }, icon('spark'), t('정리 중', 'Sorting')))
      task.tags.forEach(function (g) { meta.append(chip(g)) })
      if (task.repeat) meta.append(h('span', { class: 'm-rep', title: tx(task.repeat) }, icon('repeat')))
      meta.append(h('span', { class: 'm-list' + (task.aiFresh ? ' pop' : '') }, L.emoji + ' ' + tx(L)))
      if (task.date) meta.append(h('span', { class: 'm-date' + (overdue ? ' late' : '') }, task.date === TODAY && task.time ? timeLabel(task.time) : dateLabel(task.date) + (task.time ? ' ' + timeLabel(task.time) : '')))
      var title = tx(task.title)
      var btn = h('button', { class: 'check pr' + (task.priority || 0), type: 'button', role: 'checkbox', 'aria-checked': String(!!task.done), 'aria-label': title })
      btn.addEventListener('click', function () { toggle(task, btn) })
      var row = h('div', { class: 'row' + (task.done ? ' is-done' : '') + (task.id === fresh ? ' is-new' : '') + (task.aiFresh ? ' ai-flash' : '') }, btn, h('span', { class: 'r-title', text: title }), meta)
      return row
    }
    function group(label, items, extra) {
      if (!items.length) return null
      return h('div', { class: 'grp' + (extra ? ' ' + extra : '') }, h('div', { class: 'grp-h' }, h('span', { text: label }), h('small', { text: String(items.length) })), items.map(rowEl))
    }
    function render() {
      clear(head)
      head.append(h('h3', { text: t('다음 7일', 'Next 7 Days') }))
      clear(listEl)
      var open = tasks.filter(function (x) { return !x.done }), dates = {}
      open.forEach(function (x) { var k = x.date || 'none'; (dates[k] = dates[k] || []).push(x) })
      Object.keys(dates).sort().forEach(function (k) {
        var items = dates[k].sort(function (a, b) { return (a.time || '99') < (b.time || '99') ? -1 : 1 })
        var n = k === 'none' ? 0 : diffDays(TODAY, k)
        var label = k === 'none' ? t('날짜 없음', 'No date') : n < 0 ? t('기한 지남', 'Overdue') : n <= 1 ? dateLabel(k) + ' · ' + longDate(k) : longDate(k)
        add(listEl, group(label, items))
      })
      add(listEl, group(t('완료', 'Completed'), tasks.filter(function (x) { return x.done }), 'done'))
      fresh = null
      renderSide(); renderMe()
    }
    function renderSide() {
      clear(sideLists)
      var open = tasks.filter(function (x) { return !x.done })
      var cnt = function (f) { return String(open.filter(f).length || '') }
      var smart = [
        [t('오늘', 'Today'), cnt(function (x) { return x.date && x.date <= TODAY })],
        [t('내일', 'Tomorrow'), cnt(function (x) { return x.date === addDays(TODAY, 1) })],
        [t('다음 7일', 'Next 7 Days'), cnt(function (x) { return x.date && diffDays(TODAY, x.date) < 7 })],
        [t('기본함', 'Inbox'), cnt(function (x) { return x.list === 'inbox' })]
      ]
      smart.forEach(function (s, i) { sideLists.append(h('div', { class: 'si' + (i === 2 ? ' on' : '') }, h('span', { text: s[0] }), h('small', { text: s[1] }))) })
      sideLists.append(h('div', { class: 'si-h', text: t('리스트', 'Lists') }))
      ;['work', 'study', 'family', 'health'].forEach(function (k) {
        sideLists.append(h('div', { class: 'si' }, h('span', { text: LISTS[k].emoji + ' ' + tx(LISTS[k]) }), h('small', { text: cnt(function (x) { return x.list === k }) })))
      })
    }
    function renderMe() {
      lvText.textContent = 'Lv ' + lv + ' ' + t('모모', 'Momo')
      xpText.textContent = xp + ' / ' + need + ' XP'
      xpFill.style.width = Math.round((xp / need) * 100) + '%'
    }
    function renderExamples() {
      clear(exRow)
      exRow.append(h('span', { class: 'ex-l', id: 'hd-hint', text: t('눌러서 넣어 보기', 'Try one') }))
      EXAMPLES.forEach(function (ex) {
        exRow.append(h('button', { type: 'button', class: 'ex', text: tx(ex), onclick: function () { touched = true; typeIn(tx(ex), true) } }))
      })
    }
    function stopTyping() { if (typing) { clearInterval(typing); typing = null } }
    function typeIn(text, focus) {
      stopTyping()
      if (focus) input.focus({ preventScroll: true })
      if (reduced()) { input.value = text; syncHL(); return }
      input.value = ''
      var i = 0
      typing = setInterval(function () {
        i++
        input.value = text.slice(0, i)
        input.scrollLeft = input.scrollWidth
        syncHL()
        if (i >= text.length) stopTyping()
      }, 45)
    }
    function setPlaceholder() { input.placeholder = t('할 일 추가 — 예: 내일 오후 3시 교수님 미팅', 'Add a task, e.g. meeting tomorrow 3pm') ; input.setAttribute('aria-label', t('할 일 추가', 'Add a task')); sendBtn.setAttribute('aria-label', t('추가', 'Add')) }

    input.addEventListener('input', function () { touched = true; stopTyping(); syncHL() })
    input.addEventListener('scroll', syncHL)
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit() } else if (e.key === 'Escape') { input.value = ''; syncHL() } })
    input.addEventListener('focus', function () { touched = true })
    sendBtn.addEventListener('click', submit)
    onSpecies.push(function () { avatar.src = charSrc(species, 3) })

    function full() { setPlaceholder(); renderExamples(); render(); syncHL() }
    full()
    // 화면에 보이면 예시 하나를 천천히 적어 둔다(추가는 사용자가 Enter로)
    var auto = function () { if (!touched && !input.value) typeIn(tx(EXAMPLES[0]), false) }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); setTimeout(auto, reduced() ? 0 : 700) } }, { threshold: 0.4 })
      io.observe(host)
    } else auto()
    return { relang: function () { full() } }
  }

  // ════════════════════════════════════════════════════════════════
  // 2. 성장 — 끝내면 자라는 캐릭터
  // ════════════════════════════════════════════════════════════════
  var SPECIES = [
    { id: 'snail', ko: '꾸준한 달팽이', en: 'Steady Snail', dko: '계획·몰입 — 정한 일을 끝까지 차근차근', den: 'Planner & deep focus: finishes what it starts' },
    { id: 'bee', ko: '차곡차곡 꿀벌', en: 'Tidy Bee', dko: '계획·멀티 — 여러 일을 빠짐없이 챙겨요', den: 'Planner & multitasker: keeps every plate spinning' },
    { id: 'worm', ko: '몰두하는 애벌레', en: 'Absorbed Caterpillar', dko: '즉흥·몰입 — 꽂히면 깊게 빠져요', den: 'Spontaneous & deep focus: dives deep once hooked' },
    { id: 'frog', ko: '재주 많은 개구리', en: 'Handy Frog', dko: '즉흥·멀티 — 아이디어가 많고 빨라요', den: 'Spontaneous & multitasker: quick and full of ideas' }
  ]
  var STAGES = [{ ko: '아기', ro: '아기로', en: 'Baby', lv: 1 }, { ko: '꼬마', ro: '꼬마로', en: 'Kid', lv: 3 }, { ko: '친구', ro: '친구로', en: 'Buddy', lv: 6 }, { ko: '단짝', ro: '단짝으로', en: 'Best friend', lv: 10 }, { ko: '전설', ro: '전설로', en: 'Legend', lv: 15 }]
  // 체험용 레벨 표(실제 앱보다 훨씬 빨리 오른다): 레벨 L이 시작되는 XP
  var LV_XP = [1, 20, 40, 55, 70, 85, 100, 115, 125, 135, 145, 152, 158, 164, 170]
  function levelOf(x) { var l = 0; for (var i = 0; i < LV_XP.length; i++) if (x >= LV_XP[i]) l = i + 1; return l }
  function stageOf(l) { var s = 0; STAGES.forEach(function (st, i) { if (l >= st.lv) s = i + 1 }); return s }

  function growthDemo(host) {
    var items = [
      { q: true, xp: 30, ko: '공모전 프로토타입 완성', en: 'Finish the contest prototype' },
      { q: true, xp: 30, ko: '러닝 3번', en: 'Run 3 times' },
      { q: true, xp: 30, ko: '영어 단어 150개', en: 'Learn 150 English words' },
      { q: true, xp: 30, ko: '책 한 권 끝까지 읽기', en: 'Finish one book' },
      { q: true, xp: 30, ko: '주간 점검 하기', en: 'Do the weekly review' },
      { q: true, xp: 20, ko: '밀린 일 정리하기', en: 'Tidy up overdue tasks' },
      { xp: 1, ko: '비타민 챙겨 먹기', en: 'Take vitamins' },
      { xp: 1, ko: '아침 러닝 5km', en: 'Morning run 5 km' },
      { xp: 1, ko: '디자인 리뷰', en: 'Design review' }
    ]
    var xp = 0
    var scene = h('div', { class: 'gscene' })
    var chr = h('button', { class: 'gchar', type: 'button' }, h('img', { alt: '', width: 180, height: 180 }))
    var img = chr.firstChild
    var ring = h('span', { class: 'lvring', html: '<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" class="trk"/><circle cx="22" cy="22" r="19" class="val" pathLength="100"/></svg>' })
    var lvNum = h('b', { class: 'lvnum' })
    var nameEl = h('b', { class: 'gname' }), subEl = h('small', { class: 'gsub' })
    var barFill = h('i'), barText = h('small', { class: 'gbar-t' })
    var card = h('div', { class: 'gcard' }, h('div', { class: 'gcard-top' }, h('span', { class: 'lvwrap' }, ring, lvNum), h('div', null, nameEl, subEl)), h('span', { class: 'gbar' }, barFill), barText)
    var banner = h('div', { class: 'gbanner', 'aria-hidden': 'true' })
    var track = h('ol', { class: 'gtrack' })
    var tabs = h('div', { class: 'gtabs', role: 'radiogroup' })
    var desc = h('p', { class: 'gdesc' })
    var qlist = h('div', { class: 'glist' })
    var reset = h('button', { class: 'linkbtn', type: 'button' })
    var sr = h('div', { class: 'sr', 'aria-live': 'polite' })
    var hint = h('div', { class: 'ghint' })
    scene.append(h('div', { class: 'gsky', 'aria-hidden': 'true', html: '<svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMax slice"><circle class="sun" cx="500" cy="70" r="30"/><path class="hill2" d="M0 230 Q150 170 320 215 T600 205 V300 H0Z"/><path class="hill1" d="M0 255 Q180 215 360 250 T600 245 V300 H0Z"/></svg>' }), card, hint, h('span', { class: 'gshadow', 'aria-hidden': 'true' }), chr, banner)
    var left = h('div', { class: 'gl' }, scene, track, tabs, desc)
    var right = h('div', { class: 'gr' }, h('div', { class: 'gr-h' }, h('b', { class: 'gr-title' }), reset), qlist, h('p', { class: 'gnote' }), sr)
    clear(host); host.append(left, right)

    chr.addEventListener('click', function () {
      bump(chr, 'pet')
      var r = chr.getBoundingClientRect(), s = scene.getBoundingClientRect()
      floatText(scene, r.left - s.left + r.width / 2, r.top - s.top + 10, '♥', 'heart')
    })
    reset.addEventListener('click', function () { xp = 0; items.forEach(function (i) { i.done = false }); renderAll(); live(sr, t('처음부터 다시 키워요', 'Starting over')) })

    function setSpecies(id, focus) {
      species = id
      onSpecies.forEach(function (f) { f() })
      renderTabs(focus); renderChar(); renderTrack()
    }
    function renderTabs(focus) {
      clear(tabs)
      tabs.setAttribute('aria-label', t('캐릭터 종류', 'Species'))
      SPECIES.forEach(function (s) {
        var on = s.id === species
        var b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), tabindex: on ? '0' : '-1', class: on ? 'on' : '' },
          h('img', { src: charSrc(s.id, Math.max(1, stageOf(levelOf(xp)))), alt: '', width: 26, height: 26 }), tx(s))
        b.addEventListener('click', function () { setSpecies(s.id, true) })
        tabs.append(b)
        if (on && focus) setTimeout(function () { b.focus() }, 0)
      })
      var s = SPECIES.filter(function (x) { return x.id === species })[0]
      desc.textContent = t(s.dko, s.den)
    }
    tabs.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!d) return
      e.preventDefault()
      var i = SPECIES.findIndex(function (s) { return s.id === species })
      setSpecies(SPECIES[(i + d + SPECIES.length) % SPECIES.length].id, true)
    })

    function renderChar() {
      var l = levelOf(xp), st = stageOf(l)
      img.src = charSrc(species, st)
      var sp = SPECIES.filter(function (x) { return x.id === species })[0]
      chr.setAttribute('aria-label', st ? t(tx(sp) + ' · ' + STAGES[st - 1].ko + ' 단계 — 눌러서 쓰다듬기', tx(sp) + ', ' + STAGES[st - 1].en + ' stage. Tap to pet') : t('아직 깨어나지 않은 알', 'An egg that has not hatched yet'))
      chr.classList.toggle('is-egg', !st)
      nameEl.textContent = st ? t('모모', 'Momo') : t('알', 'Egg')
      subEl.textContent = st ? tx(sp) + ' · ' + tx(STAGES[st - 1]) : t('할 일을 끝내면 깨어나요', 'Hatches when you finish something')
      lvNum.textContent = l || '–'
      var lo = l ? LV_XP[l - 1] : 0, hi = LV_XP[l] || null
      var pct = hi ? Math.round(((xp - lo) / (hi - lo)) * 100) : 100
      barFill.style.width = (l ? pct : 0) + '%'
      ring.querySelector('.val').style.strokeDasharray = (l ? pct : 0) + ' 100'
      barText.textContent = hi ? xp + ' XP · ' + t('다음 레벨까지 ' + (hi - xp), (hi - xp) + ' to next level') : xp + ' XP · ' + t('최고 레벨!', 'Max level!')
      var narrow = window.matchMedia && matchMedia('(max-width: 860px)').matches
      hint.textContent = xp ? '' : t('퀘스트를 끝내 보세요 ' + (narrow ? '↓' : '→'), 'Finish a quest ' + (narrow ? '↓' : '→'))
      hint.hidden = !!xp
    }
    function renderTrack() {
      clear(track)
      var st = stageOf(levelOf(xp))
      STAGES.forEach(function (s, i) {
        track.append(h('li', { class: (i < st ? 'got' : '') + (i === st - 1 ? ' now' : '') },
          h('img', { src: charSrc(species, i + 1), alt: '', width: 40, height: 40, loading: 'lazy' }),
          h('b', { text: tx(s) }), h('small', { text: 'Lv ' + s.lv })))
      })
      track.setAttribute('aria-label', t('자라는 단계', 'Growth stages'))
    }
    function renderList() {
      clear(qlist)
      var qs = items.filter(function (i) { return i.q }), ts = items.filter(function (i) { return !i.q })
      var mk = function (it) {
        var b = h('button', { type: 'button', role: 'checkbox', class: 'check', 'aria-checked': String(!!it.done), 'aria-label': tx(it) })
        var row = h('div', { class: 'grow' + (it.done ? ' is-done' : '') }, b, h('span', { class: 'r-title', text: tx(it) }), h('span', { class: 'gxp', text: '+' + it.xp }))
        var go = function () { complete(it, b, row) }
        b.addEventListener('click', go)
        row.addEventListener('click', function (e) { if (e.target === row || e.target.classList.contains('r-title')) go() })
        return row
      }
      add(qlist, [h('div', { class: 'glist-h', text: t('이번 주 퀘스트', "This week's quests") }), qs.map(mk), h('div', { class: 'glist-h', text: t('오늘 할 일', 'Today') }), ts.map(mk)])
    }
    function complete(it, btn, row) {
      it.done = !it.done
      var before = levelOf(xp), beforeSt = stageOf(before)
      xp = Math.max(0, xp + (it.done ? it.xp : -it.xp))
      row.classList.toggle('is-done', it.done); btn.setAttribute('aria-checked', String(it.done))
      var l = levelOf(xp), st = stageOf(l)
      if (it.done) {
        var r = row.querySelector('.gxp').getBoundingClientRect(), m = host.getBoundingClientRect()
        floatText(host, r.left - m.left + r.width / 2 - 14, r.top - m.top - 6, '+' + it.xp + ' XP')
      }
      renderChar()
      if (st > beforeSt) celebrate(st, beforeSt === 0)
      else if (l > before) { bump(card, 'lvup'); bump(chr, 'hop'); live(sr, t('레벨 ' + l + '!', 'Level ' + l + '!')) }
      else if (it.done) bump(chr, 'hop')
      if (st !== beforeSt) { renderTrack(); renderTabs(false) }
    }
    function celebrate(st, hatch) {
      var s = STAGES[st - 1]
      var msg = hatch ? t('알이 깨어났어요!', 'It hatched!') : t(s.ro + ' 자랐어요!', 'Evolved to ' + s.en + '!')
      banner.textContent = msg
      bump(banner, 'show'); bump(chr, 'evolve'); bump(scene, 'flash')
      var r = chr.getBoundingClientRect(), sc = scene.getBoundingClientRect()
      var burst = h('span', { class: 'burst' }); burst.style.left = (r.left - sc.left + r.width / 2) + 'px'; burst.style.top = (r.top - sc.top + r.height / 2) + 'px'
      scene.append(burst); confetti(burst, 16); setTimeout(function () { burst.remove() }, 1400)
      live(sr, msg + ' Lv ' + levelOf(xp))
    }
    function renderAll() {
      $('.gr-title', right).textContent = t('끝내면 XP가 쌓여요', 'Finish things, earn XP')
      reset.textContent = t('다시 키우기', 'Start over')
      $('.gnote', right).textContent = t('체험이라 레벨이 빨리 올라요. 앱에서는 할 일 하나에 1 XP, 퀘스트·주간 점검에 30 XP이고 Lv 3 · 6 · 10 · 15에서 자라요.', 'Levels come fast in this demo. In the app a task is 1 XP, a quest or weekly review 30 XP, and your character evolves at Lv 3, 6, 10 and 15.')
      renderTabs(false); renderChar(); renderTrack(); renderList()
    }
    renderAll()
    return { relang: renderAll }
  }

  // ════════════════════════════════════════════════════════════════
  // 3. 작업 지도 — 단계 보드 + 같이 계획 짜기
  // ════════════════════════════════════════════════════════════════
  function mapDemo(host) {
    var sid = 0
    var mk = function (ko, en) { return { id: 's' + (++sid), ko: ko, en: en, done: false, date: null } }
    var INIT = function () { return [mk('요구사항 정의하기', 'Define requirements'), mk('프로토타입 설계도 그리기', 'Sketch the prototype'), mk('프론트엔드 기본 구조 세팅', 'Set up the front end')] }
    var MORE = [['백엔드 API 만들기', 'Build the back-end API'], ['화면 컴포넌트 개발', 'Build the screens'], ['통합 테스트', 'End-to-end testing'], ['발표 자료·데모 영상 만들기', 'Make slides and a demo video']]
    var steps = INIT(), due = null, newIds = {}
    var board = h('div', { class: 'mb' })
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'mb-arrows'); svg.setAttribute('aria-hidden', 'true')
    var grid = h('ol', { class: 'mb-grid' })
    var titleEl = h('div', { class: 'mb-head' })
    var progress = h('div', { class: 'mb-prog' })
    var tips = h('div', { class: 'mb-tips' })
    var sr = h('div', { class: 'sr', 'aria-live': 'assertive' })
    board.append(titleEl, progress, h('div', { class: 'mb-area' }, svg, grid), tips, sr)
    var chat = h('div', { class: 'pc' })
    var pcHead = h('div', { class: 'pc-head' })
    var msgs = h('div', { class: 'pc-msgs', 'aria-live': 'polite' })
    var chips = h('div', { class: 'pc-chips' })
    chat.append(pcHead, msgs, chips)
    clear(host); host.append(board, chat)

    // ── 보드 그리기 ──
    function currentId() { var c = steps.filter(function (s) { return !s.done })[0]; return c ? c.id : null }
    function renderHead() {
      clear(titleEl)
      add(titleEl, [h('b', { text: t('공모전 서비스 프로토타입 개발', 'Contest prototype') }), due ? h('span', { class: 'due', text: t('제출 ', 'Due ') + dateLabel(due) }) : null])
      var d = steps.filter(function (s) { return s.done }).length
      clear(progress)
      var bar = h('i'); bar.style.width = (steps.length ? Math.round(d / steps.length * 100) : 0) + '%'
      progress.append(h('span', { text: d + ' / ' + steps.length + t(' 단계 끝', ' steps done') }), h('span', { class: 'pbar' }, bar))
      tips.textContent = ''
      ;[t('카드를 끌어서 순서 바꾸기', 'Drag cards to reorder'), t('키보드: Space로 잡고 ← →', 'Keyboard: Space, then ← →'), t('동그라미를 눌러 단계 끝내기', 'Tap the circle to finish a step')].forEach(function (s) { tips.append(h('span', { text: s })) })
    }
    function cardEl(s, i) {
      var cur = s.id === currentId()
      var chk = h('button', { type: 'button', class: 'mc-check', role: 'checkbox', 'aria-checked': String(s.done), 'aria-label': t('단계 끝내기: ', 'Finish step: ') + tx(s) })
      chk.addEventListener('click', function (e) { e.stopPropagation(); s.done = !s.done; renderBoard(); live(sr, s.done ? t('끝냈어요: ', 'Done: ') + tx(s) : t('되돌렸어요', 'Reopened')) })
      var li = h('li', { class: 'mc' + (cur ? ' cur' : '') + (s.done ? ' done' : '') + (newIds[s.id] ? ' is-new' : ''), tabindex: '0', 'data-id': s.id, 'aria-roledescription': t('끌 수 있는 단계', 'draggable step'), 'aria-label': (i + 1) + '. ' + tx(s) },
        h('div', { class: 'mc-top' }, chk, h('span', { class: 'mc-n', text: String(i + 1) }), cur ? h('span', { class: 'mc-now', text: t('지금', 'Now') }) : null, h('span', { class: 'mc-grip', html: ICON.grip })),
        h('div', { class: 'mc-t', text: tx(s) }),
        h('div', { class: 'mc-d' + (s.date ? ' has' : ''), text: s.date ? dateLabel(s.date) : t('날짜 없음', 'No date') }))
      li.addEventListener('pointerdown', function (e) { onDown(e, li) })
      li.addEventListener('keydown', function (e) { onKey(e, li) })
      return li
    }
    function renderBoard(keepFocus) {
      var focusId = keepFocus || (document.activeElement && document.activeElement.closest && document.activeElement.closest('.mc') ? document.activeElement.closest('.mc').getAttribute('data-id') : null)
      clear(grid)
      steps.forEach(function (s, i) { grid.append(cardEl(s, i)) })
      newIds = {}
      renderHead()
      drawArrows()
      if (focusId) { var f = grid.querySelector('[data-id="' + focusId + '"]'); if (f) f.focus({ preventScroll: true }) }
    }
    function drawArrows() {
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      var cards = grid.children, NS = 'http://www.w3.org/2000/svg'
      var defs = document.createElementNS(NS, 'defs')
      defs.innerHTML = '<marker id="mb-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0.5 7 4 0 7.5" fill="none" stroke="currentColor" stroke-width="1.4"/></marker>'
      svg.appendChild(defs)
      for (var i = 0; i < cards.length - 1; i++) {
        var a = cards[i], b = cards[i + 1]
        var ax = a.offsetLeft, ay = a.offsetTop, aw = a.offsetWidth, ah = a.offsetHeight
        var bx = b.offsetLeft, by = b.offsetTop, bw = b.offsetWidth, bh = b.offsetHeight
        var d
        if (Math.abs(ay - by) < 8 && bx > ax) d = 'M' + (ax + aw + 5) + ' ' + (ay + ah / 2) + ' H' + (bx - 6)
        else {
          var x1 = ax + aw / 2, y1 = ay + ah + 4, x2 = bx + bw / 2, y2 = by - 6, my = (y1 + y2) / 2
          d = 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (my + 6) + ' ' + x2 + ' ' + (my - 6) + ' ' + x2 + ' ' + y2
        }
        var p = document.createElementNS(NS, 'path')
        p.setAttribute('d', d); p.setAttribute('marker-end', 'url(#mb-ah)')
        if (steps[i] && steps[i].done) p.setAttribute('class', 'done')
        svg.appendChild(p)
      }
    }
    if ('ResizeObserver' in window) new ResizeObserver(function () { drawArrows() }).observe(grid)
    else window.addEventListener('resize', drawArrows)

    // ── 끌기(포인터) ──
    var drag = null
    function onDown(e, li) {
      if (e.button > 0 || e.target.closest('.mc-check')) return
      if (e.pointerType === 'touch' && !e.target.closest('.mc-grip')) return // 터치는 손잡이로만(화면 스크롤을 막지 않게)
      var r = grid.getBoundingClientRect()
      drag = { li: li, id: li.getAttribute('data-id'), sx: e.clientX, sy: e.clientY, gx: e.clientX - r.left - li.offsetLeft, gy: e.clientY - r.top - li.offsetTop, on: false, pid: e.pointerId }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }
    function onMove(e) {
      if (!drag) return
      if (!drag.on) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 5) return
        drag.on = true
        drag.li.classList.add('dragging'); grid.classList.add('is-dragging')
        try { drag.li.setPointerCapture(drag.pid) } catch (err) { /* 합성 이벤트 */ }
      }
      e.preventDefault()
      var r = grid.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
      // 포인터 아래 카드로 자리를 옮긴다
      var cards = Array.prototype.slice.call(grid.children), from = cards.indexOf(drag.li)
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i]
        if (c === drag.li) continue
        if (px > c.offsetLeft && px < c.offsetLeft + c.offsetWidth && py > c.offsetTop && py < c.offsetTop + c.offsetHeight) {
          flip(function () { grid.insertBefore(drag.li, i > from ? c.nextSibling : c) })
          renumber(); drawArrows()
          break
        }
      }
      drag.li.style.transform = 'translate(' + (px - drag.gx - drag.li.offsetLeft) + 'px,' + (py - drag.gy - drag.li.offsetTop) + 'px)'
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (!drag) return
      var d = drag; drag = null
      if (!d.on) return
      d.li.classList.remove('dragging'); grid.classList.remove('is-dragging')
      d.li.classList.add('settle')
      d.li.style.transform = ''
      setTimeout(function () { d.li.classList.remove('settle') }, 220)
      commitOrder(d.id)
    }
    function flip(mutate) {
      var cards = Array.prototype.slice.call(grid.children), before = new Map()
      cards.forEach(function (c) { before.set(c, [c.offsetLeft, c.offsetTop]) })
      mutate()
      if (reduced()) return
      cards.forEach(function (c) {
        if (drag && c === drag.li) return
        var b = before.get(c), dx = b[0] - c.offsetLeft, dy = b[1] - c.offsetTop
        if ((dx || dy) && c.animate) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 180, easing: 'ease-out' })
      })
    }
    function renumber() {
      Array.prototype.forEach.call(grid.children, function (c, i) { var n = c.querySelector('.mc-n'); if (n) n.textContent = String(i + 1) })
    }
    function commitOrder(id) {
      var order = Array.prototype.map.call(grid.children, function (c) { return c.getAttribute('data-id') })
      var byId = {}; steps.forEach(function (s) { byId[s.id] = s })
      var changed = order.join() !== steps.map(function (s) { return s.id }).join()
      steps = order.map(function (k) { return byId[k] })
      renderBoard(null)
      if (changed) { var i = order.indexOf(id); live(sr, t((i + 1) + '번째로 옮겼어요', 'Moved to position ' + (i + 1))) }
    }
    // ── 끌기(키보드) ──
    var grabbed = null
    function onKey(e, li) {
      var id = li.getAttribute('data-id'), i = steps.findIndex(function (s) { return s.id === id })
      if (e.target !== li) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        grabbed = grabbed === id ? null : id
        li.classList.toggle('grabbed', grabbed === id)
        live(sr, grabbed ? t('잡았어요. 화살표로 옮기고 Space로 놓아요', 'Picked up. Use arrow keys, then Space to drop') : t('놓았어요', 'Dropped'))
        return
      }
      if (e.key === 'Escape' && grabbed) { grabbed = null; li.classList.remove('grabbed'); return }
      if (grabbed !== id) return
      var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!d) return
      e.preventDefault()
      var j = i + d
      if (j < 0 || j >= steps.length) return
      var s = steps.splice(i, 1)[0]; steps.splice(j, 0, s)
      flip(function () { renderBoard(id) })
      var n = grid.querySelector('[data-id="' + id + '"]'); if (n) n.classList.add('grabbed')
      live(sr, t((j + 1) + '번째', 'Position ' + (j + 1)))
    }

    // ── 같이 계획 짜기(대본) ──
    var phase = 0, busy = false
    var nextFri = function () { var k = weekdayFrom(TODAY, 5, true); return k }
    function bud(text, then) {
      busy = true; clear(chips)
      var dots = h('div', { class: 'msg bud typing' }, h('img', { src: charSrc(species, 3), alt: '', width: 26, height: 26 }), h('span', { class: 'bubble' }, h('i'), h('i'), h('i')))
      msgs.append(dots); scrollMsgs()
      later(function () {
        dots.remove()
        msgs.append(h('div', { class: 'msg bud' }, h('img', { src: charSrc(species, 3), alt: '', width: 26, height: 26 }), h('span', { class: 'bubble', text: text })))
        scrollMsgs(); busy = false
        if (then) then()
      }, 650)
    }
    function me(text) { msgs.append(h('div', { class: 'msg me' }, h('span', { class: 'bubble', text: text }))); scrollMsgs() }
    function scrollMsgs() { msgs.scrollTop = msgs.scrollHeight }
    function offer(list) {
      clear(chips)
      list.forEach(function (c) {
        chips.append(h('button', { type: 'button', class: 'pchip' + (c.skip ? ' skip' : ''), text: c.label, onclick: function () { if (!busy) { if (!c.silent) me(c.label); clear(chips); c.go() } } }))
      })
    }
    var script = [
      function () {
        bud(t('이 프로젝트, 언제까지 끝내야 해?', 'When does this project need to be done?'), function () {
          var f = nextFri(), two = addDays(TODAY, 14)
          offer([
            { label: dateLabel(f, true), go: function () { setDue(f) } },
            { label: dateLabel(two, true), go: function () { setDue(two) } },
            { label: t('아직 몰라', 'Not sure yet'), go: function () { bud(t('괜찮아, 나중에 정해도 돼.', 'No problem, we can set it later.'), step) } },
            { label: t('건너뛰기', 'Skip'), skip: true, silent: true, go: step }
          ])
        })
      },
      function () {
        bud(t('이 중에 이미 한 거 있어?', 'Have you done any of these already?'), function () {
          offer([
            { label: t('요구사항은 정리했어', 'Requirements are done'), go: function () { var s = steps.filter(function (x) { return /요구사항|requirements/i.test(x.ko + x.en) })[0]; if (s) s.done = true; renderBoard(); bud(t('좋아, 끝낸 걸로 표시했어.', 'Nice, marked it as done.'), step) } },
            { label: t('없어', 'Not yet'), go: function () { bud(t('그럼 처음부터 같이 가 보자.', "Then let's start from the top."), step) } }
          ])
        })
      },
      function () {
        bud(t('남은 일을 더 잘게 나눠 볼까?', 'Want me to break the rest into smaller steps?'), function () {
          offer([
            { label: t('응, 나눠 줘', 'Yes, please'), go: split },
            { label: t('괜찮아', "I'm fine"), go: step }
          ])
        })
      },
      function () {
        var c = steps.filter(function (s) { return !s.done })[0]
        if (!c) { step(); return }
        bud(t("첫 걸음 '" + c.ko + "'은 언제 할래?", "When will you do the first step, '" + c.en + "'?"), function () {
          var pick = function (k) { return function () { c.date = k; renderBoard(); bud(t('좋아, 지도에 적어 뒀어. 끝내면 같이 축하하자!', "Done, it's on the map. Let's celebrate when it's finished!"), step) } }
          offer([
            { label: t('오늘', 'Today'), go: pick(TODAY) },
            { label: t('내일', 'Tomorrow'), go: pick(addDays(TODAY, 1)) },
            { label: t('이번 주말', 'This weekend'), go: pick(weekdayFrom(TODAY, 6)) },
            { label: t('나중에', 'Later'), go: function () { bud(t('알겠어. 생각나면 말해 줘.', 'Okay, tell me when you know.'), step) } }
          ])
        })
      },
      function () {
        offer([{ label: t('처음부터 다시', 'Start over'), skip: true, silent: true, go: restart }])
      }
    ]
    function step() { var f = script[phase++]; if (f) f() }
    function setDue(k) { due = k; renderHead(); bud(t(dateLabel(k) + '까지로 적어 둘게.', "Got it, due " + dateLabel(k) + '.'), step) }
    function split() {
      bud(t('그럼 이렇게 나눠 볼게. 지도 봐 봐!', "Here's how I'd split it. Check the map!"), function () {
        busy = true
        var add1 = function (k) {
          if (k >= MORE.length) { busy = false; step(); return }
          var s = mk(MORE[k][0], MORE[k][1]); newIds[s.id] = true; steps.push(s); renderBoard()
          live(sr, t('단계 추가: ', 'Step added: ') + tx(s))
          later(function () { add1(k + 1) }, 380)
        }
        add1(0)
      })
    }
    function restart() { steps = INIT(); due = null; phase = 0; clear(msgs); renderBoard(); step() }
    function renderPcHead() {
      clear(pcHead)
      pcHead.append(h('img', { src: charSrc(species, 3), alt: '', width: 30, height: 30 }), h('div', null, h('b', { text: t('모모', 'Momo') }), h('small', { text: t('같이 계획 짜기', 'Plan together') })))
    }
    onSpecies.push(function () { renderPcHead(); Array.prototype.forEach.call(msgs.querySelectorAll('img'), function (im) { im.src = charSrc(species, 3) }) })

    renderPcHead(); renderBoard()
    var started = false
    var start = function () { if (!started) { started = true; step() } }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); start() } }, { threshold: 0.3 })
      io.observe(host)
    } else start()
    return { relang: function () { renderPcHead(); renderBoard(); clear(msgs); phase = 0; if (started) step() } }
  }

  // ════════════════════════════════════════════════════════════════
  // 4. 캘린더 — 월 보기, 끌어서 날짜 바꾸기
  // ════════════════════════════════════════════════════════════════
  // 한국 공휴일(packages/schema/holidays.ts에서 뽑음) — YYMMDD
  var HOL = { 260101: '신정', 260216: '설날', 260217: '설날', 260218: '설날', 260301: '3·1절', 260302: '대체공휴일', 260501: '노동절', 260505: '어린이날', 260524: '부처님오신날', 260525: '대체공휴일', 260603: '지방선거', 260606: '현충일', 260717: '제헌절', 260815: '광복절', 260817: '대체공휴일', 260924: '추석', 260925: '추석', 260926: '추석', 261003: '개천절', 261005: '대체공휴일', 261009: '한글날', 261225: '성탄절', 270101: '신정', 270206: '설날', 270207: '설날', 270208: '설날', 270209: '대체공휴일', 270301: '3·1절', 270501: '노동절', 270503: '대체공휴일', 270505: '어린이날', 270513: '부처님오신날', 270606: '현충일', 270717: '제헌절', 270719: '대체공휴일', 270815: '광복절', 270816: '대체공휴일', 270914: '추석', 270915: '추석', 270916: '추석', 271003: '개천절', 271004: '대체공휴일', 271009: '한글날', 271011: '대체공휴일', 271225: '성탄절', 271227: '대체공휴일', 280101: '신정', 280126: '설날', 280127: '설날', 280128: '설날', 280301: '3·1절', 280412: '국회의원 선거', 280501: '노동절', 280502: '부처님오신날', 280505: '어린이날', 280606: '현충일', 280717: '제헌절', 280815: '광복절', 281002: '추석', 281003: '추석', 281004: '추석', 281005: '대체공휴일', 281009: '한글날', 281225: '성탄절' }
  var HOL_EN = { 신정: "New Year's Day", 설날: 'Seollal', '3·1절': 'Independence Mvmt. Day', 대체공휴일: 'Substitute holiday', 노동절: 'Labor Day', 어린이날: "Children's Day", 부처님오신날: "Buddha's Birthday", 지방선거: 'Local elections', '국회의원 선거': 'General election', 현충일: 'Memorial Day', 제헌절: 'Constitution Day', 광복절: 'Liberation Day', 추석: 'Chuseok', 개천절: 'National Foundation Day', 한글날: 'Hangeul Day', 성탄절: 'Christmas' }
  function holiday(k) { var n = HOL[k.slice(2).replace(/-/g, '')]; return n ? t(n, HOL_EN[n] || n) : null }

  function calDemo(host) {
    var base = parseKey(TODAY); base.setDate(1)
    var month = key(base) // 보이는 달 1일
    var filter = 'all', iid = 0, flash = null
    var SEED = [
      [1, 'task', 'study', '공모전 사용자 데이터 분석', 'Analyze contest user data'], [1, 'event', 'family', '이사 업체 견적 비교', 'Compare movers', '10:00'],
      [4, 'task', 'family', '엄마 생신 선물 고르기', "Pick Mom's gift"], [4, 'task', 'work', '주간 업무 계획 세우기', 'Plan the work week'],
      [5, 'event', 'work', '분기 리포트 초안', 'Quarterly report draft', '14:00'], [6, 'task', 'study', '공모전 팀 회의', 'Contest team meeting'],
      [7, 'task', 'health', '치과 정기검진 예약', 'Book a dentist checkup'], [8, 'event', 'family', '가족 저녁 식사', 'Family dinner', '18:30'],
      [11, 'task', 'study', '공모전 발표자료 만들기', 'Make contest slides'], [11, 'event', 'work', '팀 주간 회의', 'Weekly team meeting', '10:00'],
      [13, 'task', 'health', '요가 클래스', 'Yoga class'], [15, 'event', 'study', '공모전 최종 제출', 'Contest final submission', '17:00'],
      [16, 'task', 'family', '이사 당일 체크리스트', 'Moving-day checklist'], [18, 'event', 'work', '팀 주간 회의', 'Weekly team meeting', '10:00'],
      [20, 'task', 'health', '건강검진', 'Health checkup'], [22, 'task', 'study', '독서 모임 책 읽기', 'Read for book club'],
      [25, 'event', 'family', '친구들과 캠핑', 'Camping with friends']
    ]
    var items = []
    function seed() {
      items = []
      var len = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
      SEED.forEach(function (s, i) {
        var d = Math.min(s[0] + 1, len)
        items.push({ id: 'c' + (++iid), date: addDays(month, d - 1), type: s[1], list: s[2], ko: s[3], en: s[4], time: s[5] || null, done: i === 0 })
      })
    }
    seed()
    var head = h('div', { class: 'cal-head' })
    var wk = h('div', { class: 'cal-wd', 'aria-hidden': 'true' })
    var grid = h('div', { class: 'cal-grid', role: 'grid' })
    var toast = h('div', { class: 'app-toast', role: 'status', hidden: true })
    var sr = h('div', { class: 'sr', 'aria-live': 'polite' })
    clear(host); host.append(head, wk, grid, toast, sr)
    var limit = function () { return window.innerWidth < 640 ? 2 : 3 }, curLimit = limit()

    function renderHead() {
      clear(head)
      var b = parseKey(month)
      var seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': t('보기', 'Show') })
      ;[['all', t('모두', 'All')], ['task', t('할 일', 'Tasks')], ['event', t('일정', 'Events')]].forEach(function (o) {
        seg.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(filter === o[0]), class: filter === o[0] ? 'on' : '', text: o[1], onclick: function () { filter = o[0]; render() } }))
      })
      var nav = h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'nb', 'aria-label': t('이전 달', 'Previous month'), html: ICON.chevL, onclick: function () { move(-1) } }),
        h('button', { type: 'button', class: 'nb txt', text: t('오늘', 'Today'), onclick: function () { move(0) } }),
        h('button', { type: 'button', class: 'nb', 'aria-label': t('다음 달', 'Next month'), html: ICON.chevR, onclick: function () { move(1) } }))
      head.append(h('h3', { text: t(b.getFullYear() + '년 ' + (b.getMonth() + 1) + '월', MON_EN[b.getMonth()] + ' ' + b.getFullYear()) }), seg, nav)
      clear(wk)
      ;[1, 2, 3, 4, 5, 6, 0].forEach(function (d) { wk.append(h('span', { class: d === 0 ? 'sun' : d === 6 ? 'sat' : '', text: t(WD_KO[d], WD_EN[d]) })) })
    }
    function move(n) {
      var b = parseKey(month)
      if (n === 0) { b = parseKey(TODAY); b.setDate(1) } else b.setMonth(b.getMonth() + n)
      var old = month; month = key(b)
      // 체험 데이터는 달을 따라 옮겨 다닌다(빈 달이 되지 않게)
      var shift = diffDays(old, month)
      if (shift) {
        var len = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate()
        items.forEach(function (it) { var dd = parseKey(it.date).getDate(); it.date = addDays(month, Math.min(dd, len) - 1) })
      }
      render()
    }
    function render() {
      renderHead()
      clear(grid)
      var first = parseKey(month), m = first.getMonth()
      var start = addDays(month, -((first.getDay() + 6) % 7))
      var last = new Date(first.getFullYear(), m + 1, 0)
      var end = addDays(key(last), (7 - last.getDay()) % 7)
      var weeks = diffDays(start, end) / 7 + 1 | 0
      grid.classList.toggle('w6', weeks > 5)
      curLimit = limit()
      for (var w = 0; w < weeks; w++) {
        var row = h('div', { class: 'cal-row', role: 'row' })
        for (var d = 0; d < 7; d++) {
          var k = addDays(start, w * 7 + d), dt = parseKey(k), hol = holiday(k)
          var dn = h('span', { class: 'dn', text: String(dt.getDate()) })
          var cell = h('div', { class: 'cell' + (dt.getMonth() !== m ? ' other' : '') + (k === TODAY ? ' today' : '') + (hol || dt.getDay() === 0 ? ' red' : dt.getDay() === 6 ? ' blue' : ''), role: 'gridcell', 'data-date': k, 'aria-label': longDate(k) + (hol ? ', ' + hol : '') },
            h('div', { class: 'ch' }, dn, hol ? h('span', { class: 'hol', text: hol }) : null))
          var list = items.filter(function (it) { return it.date === k && (filter === 'all' || it.type === filter) })
          list.sort(function (a, b) { return a.type === b.type ? ((a.time || '') < (b.time || '') ? -1 : 1) : a.type === 'event' ? -1 : 1 })
          list.slice(0, curLimit).forEach(function (it) { cell.append(barEl(it)) })
          if (list.length > curLimit) cell.append(h('span', { class: 'more', text: '+' + (list.length - curLimit) }))
          row.append(cell)
        }
        grid.append(row)
      }
      flash = null
    }
    function barEl(it) {
      var L = LISTS[it.list]
      var el = h('div', { class: 'bar ' + it.type + ' c-' + L.c + (it.done ? ' done' : '') + (it.id === flash ? ' flash' : ''), tabindex: '0', 'data-id': it.id, role: 'button',
        'aria-label': tx(it) + (it.time ? ', ' + timeLabel(it.time) : '') + '. ' + t('끌거나 화살표로 날짜 옮기기', 'Drag or use arrow keys to move') })
      if (it.type === 'task') {
        var cb = h('span', { class: 'bcheck', 'aria-hidden': 'true' })
        cb.addEventListener('click', function (e) { e.stopPropagation(); it.done = !it.done; flash = it.id; render(); live(sr, it.done ? t('완료!', 'Done!') : t('완료 취소', 'Not done')) })
        el.append(cb)
      }
      el.append(h('span', { class: 'bt', text: tx(it) }))
      if (it.time) el.append(h('span', { class: 'btime', text: timeLabel(it.time) }))
      el.addEventListener('pointerdown', function (e) { onDown(e, el, it) })
      el.addEventListener('keydown', function (e) {
        if (e.key === ' ' && it.type === 'task') { e.preventDefault(); it.done = !it.done; flash = it.id; render(); refocus(it); return }
        var n = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
        if (!n) return
        e.preventDefault()
        moveTo(it, addDays(it.date, n), true)
      })
      return el
    }
    function refocus(it) { var f = grid.querySelector('[data-id="' + it.id + '"]'); if (f) f.focus({ preventScroll: true }) }
    function moveTo(it, k, kb) {
      if (k === it.date) return
      var from = it.date
      it.date = k; flash = it.id
      var first = parseKey(month), dk = parseKey(k)
      if (dk.getMonth() !== first.getMonth() && kb) { first.setMonth(first.getMonth() + (k > from ? 1 : -1)); month = key(first) }
      render()
      if (kb) refocus(it)
      var msg = t(longDate(k) + '로 옮겼어요', 'Moved to ' + longDate(k))
      live(sr, msg); showToast(msg)
    }
    function showToast(msg) { toast.textContent = msg; toast.hidden = false; bump(toast, 'in'); clearTimeout(toast._t); toast._t = setTimeout(function () { toast.hidden = true }, 2400) }

    var drag = null
    function onDown(e, el, it) {
      if (e.button > 0 || e.target.closest('.bcheck')) return
      drag = { el: el, it: it, sx: e.clientX, sy: e.clientY, on: false, ghost: null, over: null, pid: e.pointerId }
      window.addEventListener('pointermove', onMove, { passive: false })
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
    }
    function onMove(e) {
      if (!drag) return
      if (!drag.on) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 4) return
        drag.on = true
        var r = drag.el.getBoundingClientRect()
        drag.ox = drag.sx - r.left; drag.oy = drag.sy - r.top
        drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('ghost'); drag.ghost.removeAttribute('tabindex')
        drag.ghost.style.width = r.width + 'px'
        host.append(drag.ghost)
        drag.el.classList.add('lifted'); host.classList.add('is-dragging')
      }
      e.preventDefault()
      var hr = host.getBoundingClientRect()
      drag.ghost.style.transform = 'translate(' + (e.clientX - hr.left - drag.ox) + 'px,' + (e.clientY - hr.top - drag.oy) + 'px)'
      var under = document.elementFromPoint(e.clientX, e.clientY)
      var cell = under && under.closest ? under.closest('.cell') : null
      if (cell && !grid.contains(cell)) cell = null
      if (cell !== drag.over) { if (drag.over) drag.over.classList.remove('drop'); drag.over = cell; if (cell) cell.classList.add('drop') }
    }
    function end() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      var d = drag; drag = null
      if (d && d.on) { d.ghost.remove(); d.el.classList.remove('lifted'); host.classList.remove('is-dragging'); if (d.over) d.over.classList.remove('drop') }
      return d
    }
    function onUp() { var d = end(); if (d && d.on && d.over) moveTo(d.it, d.over.getAttribute('data-date'), false) }
    function onCancel() { end() }
    window.addEventListener('resize', function () { if (limit() !== curLimit) render() })
    render()
    return { relang: render }
  }

  // ── 시작 ──
  var demos = []
  var mount = function (sel, fn) { var el = document.querySelector(sel); if (el) { el.classList.add('ready'); demos.push(fn(el)) } }
  mount('[data-demo="hero"]', heroDemo)
  mount('[data-demo="growth"]', growthDemo)
  mount('[data-demo="map"]', mapDemo)
  mount('[data-demo="cal"]', calDemo)
  document.addEventListener('langchange', function () { demos.forEach(function (d) { d.relang() }) })

  // 스크롤에 맞춰 살짝 나타나기(움직임 줄이기 설정이면 그냥 보인다)
  var rev = document.querySelectorAll('.reveal')
  if ('IntersectionObserver' in window && !reduced()) {
    var ro = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting || e.boundingClientRect.top < 0) { e.target.classList.add('in'); ro.unobserve(e.target) } }) }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
    rev.forEach(function (el) { ro.observe(el) })
  } else rev.forEach(function (el) { el.classList.add('in') })
})()
