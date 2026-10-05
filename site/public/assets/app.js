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
  applyTheme(); applyLang()
})()
