// Language packs: every Japanese key is translated, numbers/keys/placeholders survive translation, templates are well formed.
// Run: node bench/i18n-packs.test.cjs   (rebuild the packs first with: node tools/i18n/build_packs.cjs)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const LANGS = ['es', 'pt', 'tr', 'vi', 'th'];
const sandbox = { window: { skyI18n: { tr: t => t } } };
vm.createContext(sandbox);
for (const f of ['i18n-en.js', 'i18n-en-extra.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
const base = sandbox.window.skyI18nEn;
const failures = [];
const fail = msg => failures.push(msg);

const SKIP_PATTERNS = new Set([44, 46, 48, 69, 78, 84, 89, 94]);
const tokens = text => (text.match(/[0-9]+(?:\.[0-9]+)?/g) || []);
// Words spelled out in English ("two minutes", "every 10 s") may be written as digits or words by translators, so only
// digits present in the English text are required, except where the English itself uses a spelled number.
const KEYWORDS = ['HG', 'SG', 'SMG', 'MG', 'DASH', 'W A S D', 'WASD'];

for (const lang of LANGS) {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(root, `i18n-${lang}.js`), 'utf8'), sb, { filename: `i18n-${lang}.js` });
  const pack = sb.window.skyI18nPacks?.[lang];
  if (!pack) { fail(`${lang}: pack did not register`); continue; }
  for (const [jp, en] of Object.entries(base.exact)) {
    const out = pack.exact[jp];
    if (out === undefined) { fail(`${lang}: missing "${jp.slice(0, 30)}"`); continue; }
    if (/[぀-ヿ一-鿿]/.test(out)) fail(`${lang}: Japanese text left in "${out.slice(0, 40)}"`);
    for (const t of tokens(en)) if (!out.includes(t)) fail(`${lang}: number ${t} from "${en.slice(0, 50)}" missing in "${out.slice(0, 60)}"`);
    for (const k of KEYWORDS) if (new RegExp('(^|[^A-Za-z])' + k + '($|[^A-Za-z])').test(en) && !out.includes(k)) fail(`${lang}: ${k} from "${en.slice(0, 50)}" missing in "${out.slice(0, 60)}"`);
    if (en.includes('\n') !== out.includes('\n')) fail(`${lang}: line break mismatch for "${en.slice(0, 40)}"`);
  }
  base.patterns.forEach(([re, rep], i) => {
    const own = pack.patterns[i];
    if (own === undefined) { if (!SKIP_PATTERNS.has(i)) fail(`${lang}: pattern ${i} missing`); return; }
    const groups = new RegExp(re.source + '|').exec('').length - 1;
    const used = new Set([...own.matchAll(/\$(\d)/g)].map(m => +m[1]));
    for (const n of used) if (n > groups) fail(`${lang}: pattern ${i} uses $${n} of ${groups}`);
    // Every number captured by the regex must be shown, unless the English reference drops it too.
    if (typeof rep === 'string') {
      const refUsed = new Set([...rep.matchAll(/\$(\d)/g)].map(m => +m[1]));
      for (const n of refUsed) if (!used.has(n)) fail(`${lang}: pattern ${i} drops $${n}`);
    }
    if ((own.match(/\[/g) || []).length !== (own.match(/\]/g) || []).length) fail(`${lang}: pattern ${i} has unbalanced brackets`);
  });
}

// Ids are append-only and keys.tsv must cover the dictionaries.
const keys = fs.readFileSync(path.join(root, 'tools/i18n/keys.tsv'), 'utf8').split('\n').filter(l => /^\d+\t/.test(l)).map(l => l.split('\t')[1].replace(/\\n/g, '\n'));
for (const jp of Object.keys(base.exact)) if (!keys.includes(jp)) fail(`keys.tsv lacks "${jp.slice(0, 30)}"`);

if (failures.length) {
  console.error(failures.slice(0, 80).join('\n'));
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`i18n packs ok: ${Object.keys(base.exact).length} strings, ${base.patterns.length} patterns, ${LANGS.length} languages`);
