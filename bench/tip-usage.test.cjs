// Tips: which moves a player has used (local only) and who is due for the one-time game-over cards.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createTipUsage, ORDER, SOURCES } = require('../tip-usage.js');
const root = path.join(__dirname, '..');
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, m }; };

// Same order in the demo list and the usage tracker; every tip has a demo, a name and sources.
const demos = fs.readFileSync(path.join(root, 'tips-demos.js'), 'utf8');
const demoOrder = JSON.parse(demos.match(/const ORDER = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
assert.deepEqual(demoOrder, ORDER, 'tips-demos.js and tip-usage.js list the tips in the same order');
for (const id of ORDER) { assert.ok(SOURCES[id]?.length, id + ' has stat sources'); assert.match(demos, new RegExp('\\b' + id + ': \\{ name:'), id + ' has a demo'); }
// Moves the owner chose not to teach stay out.
for (const gone of ['stomp', 'window', 'knife', 'walljump']) assert.ok(!ORDER.includes(gone));

// 1) Fresh player: everything unused, nothing due before the 2nd run.
let s = mem(), t = createTipUsage(s);
assert.deepEqual(t.unused(), ORDER); assert.deepEqual(t.due(), []);
t.record({ wallruns: 3 });
assert.equal(t.state().runs, 1); assert.deepEqual(t.due(), [], 'not after the 1st run');
// 2) 2nd run: the two most important unused moves, in priority order (wall run was used, so items and rope).
t.record({ ropeSwings: 0 });
assert.equal(t.state().runs, 2); assert.deepEqual(t.due(), ['items', 'rope']);
// 3) Any item counts for the whole "items" tip; it is not taught per item.
t.record({ decoys: 1 }); assert.ok(!t.unused().includes('items'));
for (const stat of ['rescues', 'flashbangs']) { const u = createTipUsage(mem()); u.record({ [stat]: 1 }); assert.ok(!u.unused().includes('items'), stat); }
// 4) Shown once only.
t.markShown(); assert.deepEqual(t.due(), []); t.record({}); assert.deepEqual(t.due(), [], 'never again');
// 5) A player who used everything is never shown tips.
const all = createTipUsage(mem()); all.record({ wallruns: 1, decoys: 1, ropeSwings: 1, zips: 1, blastLaunches: 1, jumpGunLaunches: 1, barDropCatches: 1 }); all.record({});
assert.deepEqual(all.unused(), []); assert.deepEqual(all.due(), []);
// 6) A detonation without launching is not a blast jump; negative or junk numbers are ignored.
const b = createTipUsage(mem()); b.record({ blasts: 5, wallruns: -2, ropeSwings: 'x' }); assert.ok(b.unused().includes('blast')); assert.ok(b.unused().includes('wallrun')); assert.ok(b.unused().includes('rope'));
// 7) Survives reloads, bad JSON and missing storage.
const keep = mem(); createTipUsage(keep).record({ zips: 2 }); assert.equal(createTipUsage(keep).state().moves.zip, 2);
const bad = mem(); bad.m['gunrun-tip-usage-v1'] = '{oops'; assert.deepEqual(createTipUsage(bad).unused(), ORDER);
const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }; const bt = createTipUsage(broken); bt.record({}); assert.deepEqual(bt.due(), []);

// 8) Every Japanese string the demos can show has a dictionary key (so all 8 languages have it).
const keys = new Set(fs.readFileSync(path.join(root, 'tools/i18n/keys.tsv'), 'utf8').split('\n').map(l => l.split('\t')[1]));
const strings = new Set(); for (const m of demos.matchAll(/'([^'\n]*[ぁ-んァ-ヶ一-龠][^'\n]*)'/g)) strings.add(m[1]);
const missing = [...strings].filter(x => !keys.has(x)); assert.deepEqual(missing, [], 'untranslated demo strings: ' + missing.join(' / '));
for (const x of ['コツ']) assert.ok(keys.has(x));
console.log('tip usage ok: ' + strings.size + ' demo strings, ' + ORDER.length + ' tips');
