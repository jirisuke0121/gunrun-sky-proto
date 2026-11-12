// Shared helpers for the i18n tools. Keys are Japanese UI strings; ids are append-only (see keys.tsv).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const LANGS = ['es', 'pt', 'tr', 'vi', 'th'];
const esc = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
const unesc = s => s.replace(/\\(n|t|\\)/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : '\\');
const readTsv = file => !fs.existsSync(file) ? [] : fs.readFileSync(file, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t').map(unesc));

// Extra patterns for strings that the guided scripts assemble from pieces. They are appended after the 95 base patterns.
const EXTRA_PATTERNS = [
  ['^(.+)を試す$', '$1 — try'],
  ['^(.+)の実際のゲーム画面$', '$1 in the actual game'],
  ['^「(.+)」を押す$', 'Press $1'],
  ['^全(\\d+)ステップを通過しました。覚えた操作を、このあと本番（イージー）で使ってみましょう。$', 'You passed all $1 steps. Next, try these moves in a real run on Easy.'],
  ['^お試し：(.+)$', 'Try: $1'],
  ['^ゾンビ (\\d+) · (\\d+)m四方$', 'Zombies $1 · $2m square'],
  ['^全ゾンビ (\\d+)体$', 'All zombies: $1'],
];

function loadBase() {
  const sandbox = { window: { skyI18n: { tr: t => t } } };
  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'i18n-en.js'), 'utf8'), sandbox);
  const base = sandbox.window.skyI18nEn;
  return { exact: Object.entries(base.exact), patterns: base.patterns.map(([re, rep]) => [re.source, rep]) };
}
function loadExtras() { return readTsv(path.join(__dirname, 'extra-src.tsv')); }
module.exports = { ROOT, LANGS, esc, unesc, readTsv, loadBase, loadExtras, EXTRA_PATTERNS };
