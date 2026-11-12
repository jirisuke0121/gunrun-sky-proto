// Language: Japanese stays as written. For every other language the Japanese text is replaced from a dictionary:
//   English  -> i18n-en.js (+ i18n-en-extra.js), always loaded.
//   others   -> i18n-<code>.js (th, vi, pt, tr, es), loaded only for the chosen language; anything a pack lacks falls back to English.
// Choose with ?lang=<code|auto> (remembered) or the language selector on the home screen. "auto" follows the browser
// language (ja/th/vi/pt/tr/es, everything else -> English).
(() => {
  const STORE = 'sky.lang';
  const LANGS = [
    ['auto', 'Auto'], ['ja', '日本語'], ['en', 'English'], ['th', 'ไทย'],
    ['vi', 'Tiếng Việt'], ['pt', 'Português (Brasil)'], ['tr', 'Türkçe'], ['es', 'Español'],
  ];
  const HTML_LANG = { pt: 'pt-BR' };
  const norm = value => {
    const v = String(value || '').toLowerCase();
    if (v === 'auto') return 'auto';
    for (const [code] of LANGS) if (code !== 'auto' && (v === code || v.startsWith(code + '-') || v.startsWith(code + '_'))) return code;
    return null;
  };
  const detect = () => {
    for (const candidate of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const code = norm(candidate);
      if (code && code !== 'auto') return code;
    }
    return 'en';
  };
  const query = norm(new URLSearchParams(location.search).get('lang'));
  let saved = null;
  try {
    if (query) localStorage.setItem(STORE, query);
    saved = norm(localStorage.getItem(STORE));
  } catch { /* storage may be unavailable */ }
  const pref = query || saved || 'auto';
  const lang = pref === 'auto' ? detect() : pref;

  const JP = /[぀-ヿ一-鿿＀-￯]/;
  const ATTRS = ['aria-label', 'title', 'placeholder'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);
  document.documentElement.lang = HTML_LANG[lang] || lang;

  // Pack loading: the pack must be in place before the first pass over the page.
  const self = document.currentScript;
  if (lang !== 'ja' && lang !== 'en' && self?.src) {
    const url = new URL('i18n-' + lang + '.js' + (self.src.includes('?') ? '?' + self.src.split('?')[1] : ''), self.src).href;
    const onReady = () => { cache.clear(); if (document.body) { fix(document.body); } };
    if (document.readyState === 'loading') {
      document.write('<script src="' + url + '"><\/script>');
    } else {
      const el = document.createElement('script');
      el.src = url; el.onload = onReady; document.head.append(el);
    }
  }

  const cache = new Map();
  const template = (tpl, m) => tpl
    .replace(/\[(\d)(?:=([^?\]]*))?\?([^\]]*)\]/g, (_, n, val, body) => ((val === undefined ? m[n] !== undefined : m[n] === val) ? body : ''))
    .replace(/\$(\d)(:t)?/g, (_, n, nested) => { const v = m[n] ?? ''; return nested ? tr(v) : v; });

  function lookup(key) {
    const base = window.skyI18nEn;
    if (!base) return undefined;
    const pack = lang === 'en' ? null : window.skyI18nPacks?.[lang];
    let out = pack?.exact[key];
    if (out === undefined) out = base.exact[key];
    if (out !== undefined) return out;
    const list = base.patterns;
    for (let i = 0; i < list.length; i++) {
      const [re, rep] = list[i];
      if (!rep) continue;
      const m = re.exec(key);
      if (!m) continue;
      const own = pack?.patterns?.[i];
      return typeof own === 'string' ? template(own, m) : key.replace(re, rep);
    }
    return undefined;
  }

  // Strings glued together in code ("もう一度。" + hint, "A · B") are translated piece by piece.
  function lookupParts(key) {
    for (const sep of [/(?<=。)/, / · /]) {
      const parts = key.split(sep);
      if (parts.length < 2) continue;
      const out = [];
      for (const part of parts) {
        const piece = part.trim();
        const done = !JP.test(piece) ? piece : lookup(piece);
        if (done === undefined) return undefined;
        out.push(done);
      }
      return out.join(sep instanceof RegExp && sep.source.includes('。') ? ' ' : ' · ');
    }
    return undefined;
  }

  function tr(text) {
    if (lang === 'ja' || !text || !JP.test(text)) return text;
    const key = text.replace(/\s+/g, ' ').trim();
    let out = cache.get(key);
    if (out === undefined) {
      out = lookup(key);
      if (out === undefined) out = lookupParts(key);
      if (out === undefined) out = null;
      if (cache.size > 4000) cache.clear();
      cache.set(key, out);
    }
    if (out === null) return text;
    return text.match(/^\s*/)[0] + out + text.match(/\s*$/)[0];
  }
  window.skyI18n = { lang, pref, tr, langs: LANGS };
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

  if (lang !== 'ja') {
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

  // Language selector on the home screen (same id the home layout already positions).
  const select = document.createElement('select');
  select.id = 'langToggle';
  select.setAttribute('aria-label', 'Language / 言語');
  for (const [code, label] of LANGS) {
    const option = document.createElement('option');
    option.value = code; option.textContent = label; option.selected = code === pref;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('lang', select.value);
    location.href = url.toString();
  });
  document.body.append(select);
  const start = document.getElementById('ovStart');
  const sync = () => { select.hidden = !start || start.hidden; };
  sync();
  if (start) new MutationObserver(sync).observe(start, { attributes: true, attributeFilter: ['hidden'] });
})();
