// 언어·테마 전환, 다크 스크린샷 바꾸기(체험 창은 demos.js) — 프레임워크 없이
(function () {
  var root = document.documentElement
  var store = {
    get: function (k) { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) {} }
  }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null

  function resolvedTheme() {
    var t = root.getAttribute('data-theme')
    return t ? t : (mq && mq.matches ? 'dark' : 'light')
  }
  function applyTheme() {
    var r = resolvedTheme()
    root.setAttribute('data-theme-resolved', r)
    document.querySelectorAll('img[data-dark]').forEach(function (img) {
      if (!img.dataset.light) img.dataset.light = img.getAttribute('src')
      var want = r === 'dark' ? img.dataset.dark : img.dataset.light
      if (img.getAttribute('src') !== want) img.setAttribute('src', want)
    })
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', r === 'dark' ? '#0e1512' : '#ffffff')
  }
  function applyLang() {
    var l = root.getAttribute('data-lang') || 'ko'
    root.setAttribute('lang', l)
    var t = root.getAttribute('data-title-' + l)
    if (t) document.title = t
    document.querySelectorAll('[data-alt-' + l + ']').forEach(function (el) { el.setAttribute('alt', el.getAttribute('data-alt-' + l)) })
    document.querySelectorAll('[data-aria-' + l + ']').forEach(function (el) { el.setAttribute('aria-label', el.getAttribute('data-aria-' + l)) })
    // 다른 페이지로 가는 링크에 언어를 붙여 둔다(새로 연 탭도 같은 언어)
    document.querySelectorAll('a[href^="/"]').forEach(function (a) {
      var u = new URL(a.getAttribute('href'), location.origin)
      if (l === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang')
      a.setAttribute('href', u.pathname + u.search + u.hash)
    })
  }

  document.addEventListener('click', function (e) {
    var tb = e.target.closest('[data-theme-toggle]')
    if (tb) {
      var next = resolvedTheme() === 'dark' ? 'light' : 'dark'
      root.setAttribute('data-theme', next); store.set('theme', next); applyTheme()
    }
    var lb = e.target.closest('[data-lang-toggle]')
    if (lb) {
      var nl = root.getAttribute('data-lang') === 'en' ? 'ko' : 'en'
      root.setAttribute('data-lang', nl); store.set('lang', nl)
      var u = new URL(location.href)
      if (nl === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang')
      history.replaceState(null, '', u.pathname + u.search + u.hash)
      applyLang()
      document.dispatchEvent(new CustomEvent('langchange'))
    }
  })
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme)

  var top = document.querySelector('.top')
  if (top) {
    var onScroll = function () { top.classList.toggle('is-scrolled', window.scrollY > 8) }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll()
  }
  // 내려받기: 내 컴퓨터(Mac·Windows)에 맞는 버튼을 맨 앞에 칠해 두고, 누르면 설치 방법 카드로 내려 준다
  var dl = document.querySelector('.dl')
  if (dl) {
    var ua = navigator.userAgent || ''
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
    var touch = navigator.maxTouchPoints > 1
    var os = /Win/i.test(plat) || /Windows/i.test(ua) ? 'win' : (/Mac/i.test(plat) || /Macintosh/i.test(ua)) && !touch ? 'mac' : ''
    // 인텔 Mac: 브라우저가 칩을 알려 주지 않아 그래픽 이름으로 짐작한다(모르면 Apple 칩 파일 — 인텔용은 설치 방법 카드에 따로 있음)
    if (os === 'mac') {
      try {
        var gl = document.createElement('canvas').getContext('webgl')
        var ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
        var gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
        if (/Intel|AMD|Radeon/i.test(gpu) && !/Apple/i.test(gpu)) {
          var macBtn = dl.querySelector('[data-dl="mac"]'), intel = document.querySelector('[data-dl="mac-intel"]')
          if (macBtn && intel) macBtn.setAttribute('href', intel.getAttribute('href'))
        }
      } catch (e) {}
    }
    var mine = os && dl.querySelector('[data-dl="' + os + '"]')
    if (mine) { mine.classList.add('is-primary'); dl.insertBefore(mine, dl.firstChild) }
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-dl]')
      if (!a) return
      var card = document.querySelector('.install-card[data-os="' + (a.getAttribute('data-dl') === 'win' ? 'win' : 'mac') + '"]')
      if (!card || card.contains(a)) return
      document.querySelectorAll('.install-card.is-here').forEach(function (c) { c.classList.remove('is-here') })
      setTimeout(function () { card.classList.add('is-here'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 400)
    })
  }

  applyTheme(); applyLang()
})()
