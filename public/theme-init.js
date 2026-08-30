(function () {
  try {
    var stored = localStorage.getItem('bidsure.theme')
    var dark = stored ? stored === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    var el = document.documentElement
    if (dark) {
      el.classList.add('dark')
      el.style.colorScheme = 'dark'
    } else {
      el.classList.remove('dark')
      el.style.colorScheme = 'light'
    }
  } catch (e) {}
})()
