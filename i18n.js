// Language: Japanese stays as written; for everyone else the Japanese text is replaced by English
// (dictionary in i18n-en.js). Choose with ?lang=en / ?lang=ja (remembered) or the button on the home screen.
// Default: Japanese browsers -> Japanese, all others -> English.
(() => {
  const STORE = 'sky.lang';
  const query = new URLSearchParams(location.search).get('lang');
  let saved = null;
  try {
    if (query === 'en' || query === 'ja') localStorage.setItem(STORE, query);
    saved = localStorage.getItem(STORE);
  } catch { /* storage may be unavailable */ }
  const nav = (navigator.language || '').toLowerCase();
  const lang = query === 'en' || query === 'ja' ? query
    : saved === 'en' || saved === 'ja' ? saved
    : nav.startsWith('ja') ? 'ja' : 'en';
  const JP = /[぀-ヿ一-鿿＀-￯]/;
  const ATTRS = ['aria-label', 'title', 'placeholder'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);
  document.documentElement.lang = lang;

  function tr(text) {
    const dict = window.skyI18nEn;
    if (lang !== 'en' || !dict || !text || !JP.test(text)) return text;
    const key = text.replace(/\s+/g, ' ').trim();
    let out = dict.exact[key];
    if (out === undefined) {
      for (const [re, rep] of dict.patterns) {
        if (rep && re.test(key)) { out = key.replace(re, rep); break; }
      }
    }
    if (out === undefined) return text;
    return text.match(/^\s*/)[0] + out + text.match(/\s*$/)[0];
  }
  window.skyI18n = { lang, tr };
  document.body.dataset.skyLang = lang;

  function fix(node) {
    if (node.nodeType === 3) {
      if (SKIP.has(node.parentNode?.nodeName) || !JP.test(node.nodeValue)) return;
      const out = tr(node.nodeValue);
      if (out !== node.nodeValue) node.nodeValue = out;
    } else if (node.nodeType === 1 && !SKIP.has(node.nodeName)) {
      for (const attr of ATTRS) {
        const value = node.getAttribute(attr);
        if (value && JP.test(value)) { const out = tr(value); if (out !== value) node.setAttribute(attr, out); }
      }
      for (let child = node.firstChild; child; child = child.nextSibling) fix(child);
    }
  }

  if (lang === 'en') {
    document.title = 'Zombie Parkour Escape';
    fix(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') fix(record.target);
        else if (record.type === 'attributes') fix(record.target);
        else for (const added of record.addedNodes) fix(added);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // Language switch on the home screen.
  const button = document.createElement('button');
  button.id = 'langToggle';
  button.type = 'button';
  button.textContent = lang === 'en' ? '日本語' : 'English';
  button.setAttribute('aria-label', lang === 'en' ? 'Switch to Japanese' : 'Switch to English');
  button.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('lang', lang === 'en' ? 'ja' : 'en');
    location.href = url.toString();
  });
  document.body.append(button);
  const start = document.getElementById('ovStart');
  const sync = () => { button.hidden = !start || start.hidden; };
  sync();
  if (start) new MutationObserver(sync).observe(start, { attributes: true, attributeFilter: ['hidden'] });
})();
