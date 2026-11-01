// Developer mode: shows the tuning tools that players must not see (free-tuning difficulty,
// raw balance sliders, white-box map). Turn on with ?dev=1 (remembered), off with ?dev=0.
(() => {
  const KEY = 'sky.dev';
  const query = new URLSearchParams(location.search).get('dev');
  let on = false;
  try {
    if (query === '1') localStorage.setItem(KEY, '1');
    if (query === '0') localStorage.removeItem(KEY);
    on = localStorage.getItem(KEY) === '1';
  } catch { on = query === '1'; }
  window.skyDevMode = on;
  document.documentElement.classList.toggle('dev', on);
})();
