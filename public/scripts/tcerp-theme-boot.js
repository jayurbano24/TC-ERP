(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var r = document.documentElement;
    r.setAttribute('data-theme', t);
    r.classList.toggle('dark', t === 'dark');
  } catch (e) {
    /* private mode */
  }
})();
