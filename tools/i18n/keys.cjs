// node tools/i18n/keys.cjs        -> append keys that have no id yet to keys.tsv (ids never change)
// node tools/i18n/keys.cjs check  -> fail when keys.tsv does not cover the dictionaries
const fs = require('fs'), path = require('path');
const { esc, readTsv, loadBase, loadExtras, EXTRA_PATTERNS } = require('./lib.cjs');
const file = path.join(__dirname, 'keys.tsv');
const base = loadBase();
const wanted = [...base.exact.map(([jp, en]) => [jp, en]), ...loadExtras()];
const rows = readTsv(file);
const have = new Set(rows.filter(r => /^\d+$/.test(r[0])).map(r => r[1]));
let next = rows.reduce((n, r) => /^\d+$/.test(r[0]) ? Math.max(n, +r[0]) : n, 0) + 1;
const missing = wanted.filter(([jp]) => !have.has(jp));
const patternRows = [...base.patterns, ...EXTRA_PATTERNS].map(([src, rep], i) => ['p' + i, src, typeof rep === 'function' ? 'FN' : rep === null ? 'NULL' : rep]);
if (process.argv[2] === 'check') {
  if (missing.length) { console.error('keys.tsv lacks ' + missing.length + ' keys; run: node tools/i18n/keys.cjs'); process.exit(1); }
  console.log('keys ok: ' + have.size); process.exit(0);
}
const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('p')) : [];
for (const [jp, en] of missing) lines.push([next++, esc(jp), esc(en)].join('\t'));
fs.writeFileSync(file, '# id<TAB>Japanese key<TAB>English. Append-only: never renumber. Patterns (p<index>) are regenerated.\n' + lines.join('\n') + '\n' + patternRows.map(r => r.map(esc).join('\t')).join('\n') + '\n');
console.log('added ' + missing.length + ' keys; total ' + (next - 1));
