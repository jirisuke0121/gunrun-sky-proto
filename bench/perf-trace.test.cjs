// 実機計測（perf-trace.js）の単体テスト：オフでは何もしない、オンでは10秒ごとの内訳と遅いフレームを正しく集計し、
// 件数上限を守り、1フレームあたりの負荷が小さいこと。
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'perf-trace.js'), 'utf8');

function load({ search = '', stored = null } = {}) {
  const store = new Map(stored === null ? [] : [['gunrun-perf', stored]]);
  const added = [];
  const sandbox = {
    window: null, performance, URLSearchParams, console, Math, Object, Number, Infinity,
    location: { search },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: { body: { appendChild: el => added.push(el) }, createElement: () => ({ style: {} }) },
    addEventListener() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { trace: sandbox.skyPerfTrace, store, added };
}

// 1) 既定でオン：引数も保存もなくても計測する。バッジは出さない。
{
  const { trace, added } = load();
  assert.equal(trace.on, true);
  assert.equal(added.length, 0, 'no badge');
  trace.frame(16.7, 1, true, 6);
  assert.equal(trace.snapshot().buckets.length, 1);
}
// 2) ?perf=0 でこの端末だけ止まる（保存される）。?perf=1 で戻る。保存済みなら引数なしでも止まったまま。
{
  const off = load({ search: '?perf=0' });
  assert.equal(off.trace.on, false); assert.equal(off.store.get('gunrun-perf'), '0');
  assert.equal(off.trace.t('adv', () => 7), 7, 'off: t() just calls the function');
  off.trace.add('so', 5); off.trace.frame(30, 1, true, 20); off.trace.reset();
  assert.equal(off.trace.snapshot(), null);
  assert.equal(load({ stored: '0' }).trace.on, false, 'the stop is remembered');
  const back = load({ search: '?perf=1', stored: '0' });
  assert.equal(back.trace.on, true); assert.equal(back.store.has('gunrun-perf'), false);
  assert.equal(load({ search: '?perf=2' }).trace.on, true, 'only 0 turns it off');
  assert.equal(load().trace.on, true);
}
// 3) 集計：区間の合計と最大、10秒ごとのバケット、描画待ち（iv - cpu）の材料。
{
  const { trace } = load();
  const f = (iv, t, cpu, parts = {}) => {
    for (const [k, v] of Object.entries(parts)) trace.add(k, v);
    trace.frame(iv, t, true, cpu);
  };
  f(16.7, 1, 6, { adv: 3, cam: 1, hv: 1, render: 0.5, ai: 1.5, so: 0.5 });
  f(16.7, 2, 8, { adv: 5, cam: 1, hv: 1, render: 0.5, ai: 3.5, so: 1.5 });
  f(40, 12, 36, { adv: 30, cam: 1, hv: 3, render: 1, ai: 25, so: 20 });
  const snap = trace.snapshot();
  assert.equal(snap.buckets.length, 2, 'two 10 s windows');
  const [first, second] = snap.buckets;
  assert.equal(first.start, 0); assert.equal(first.n, 2);
  assert.equal(first.cpu, 7); assert.equal(first.cpuMax, 8);
  same(first.s.adv, [4, 5]); same(first.s.ai, [2.5, 3.5]); same(first.s.so, [1, 1.5]);
  assert.equal(first.iv33, 0); assert.equal(first.cpu33, 0);
  assert.equal(second.start, 10); assert.equal(second.n, 1); assert.equal(second.iv33, 1); assert.equal(second.cpu33, 1);
  assert.equal(second.bins[3], 1, '36 ms is in the 33-50 ms bin');
  assert.equal(snap.worst.length, 1, 'only the 36 ms frame is a slow frame');
  const w = snap.worst[0];
  assert.equal(w.cpu, 36); assert.equal(w.adv, 30); assert.equal(w.rest, 1, 'rest = cpu - adv - cam - hv - render');
  assert.equal(w.zMax, null); assert.ok(!('key' in w), 'internal ranking key is not exported');
  assert.ok(Number.isFinite(snap.timerMs) || snap.timerMs === null);
  assert.equal(trace.snapshot().timerMs, snap.timerMs, 'timer resolution is measured once');
}
// 4) 区間は呼ぶたびに加算され、フレームごとに空に戻る。非アクティブなフレームは数えない。
{
  const { trace } = load();
  assert.equal(trace.t('cam', () => 'x'), 'x');
  trace.frame(16, 1, false, 10);
  assert.equal(trace.snapshot().buckets.length, 0, 'inactive frames are skipped');
  trace.add('adv', 50); trace.frame(16, 1, false, 10); trace.frame(16, 1, true, 5);
  assert.equal(trace.snapshot().buckets[0].s.adv[0], 0, 'the skipped frame did not leak into the next one');
  trace.frame(2000, 2, true, 5); trace.frame(16, 2, true, NaN);
  assert.equal(trace.snapshot().buckets[0].n, 1, 'over 1 s intervals and invalid cpu are ignored');
  assert.throws(() => trace.t('adv', () => { throw new Error('boom'); }), /boom/, 'errors pass through');
}
// 5) 上限：バケット18、遅いフレーム12（重い順に残る）、超過は truncated。
{
  const { trace } = load();
  trace.context = () => ({ p: [1.234, 2, 3], z: 5, near: 2, m: 'play' });
  for (let i = 0; i < 25; i++) trace.frame(16, i * 10 + 1, true, 5);
  for (let i = 0; i < 40; i++) trace.frame(30, 1, true, 40 + i);
  const snap = trace.snapshot();
  assert.equal(snap.buckets.length, 18); assert.equal(snap.truncated, 7 + 40, 'truncated counts frames that fell outside the 18 windows (7 late windows + 40 slow frames), while slow frames are still kept');
  assert.equal(snap.worst.length, 12);
  same(snap.worst.map(w => w.cpu).slice(0, 3), [79, 78, 77], 'slowest first');
  assert.ok(snap.worst.every(w => w.cpu >= 68), 'the 12 slowest kept');
  same(snap.worst[0].ctx, { p: [1.2, 2, 3], z: 5, near: 2, m: 'play' });
  assert.ok(JSON.stringify(snap).length < 40000, 'record stays small: ' + JSON.stringify(snap).length);
}
// 6) 1体で一番遅い更新を、位置と状態つきで覚える。
{
  const { trace } = load();
  trace.zombie({ pos: { x: -44.64, y: 1.1, z: 0 }, act: { kind: 'pillar' }, flank: true }, 90);
  trace.zombie({ pos: { x: 3, y: 0, z: 3 } }, 5);
  trace.frame(120, 3, true, 100);
  const w = trace.snapshot().worst[0];
  assert.equal(w.ai, 95); same(w.zMax, { ms: 90, x: -44.6, y: 1.1, z: 0, act: 'pillar', fl: 1, st: 0, dr: 0 });
  assert.equal(trace.snapshot().buckets[0].zMax, 90);
}
// 7) リセットで空に戻る。
{
  const { trace } = load();
  trace.frame(16, 1, true, 5); trace.reset();
  assert.equal(trace.snapshot().buckets.length, 0);
}
// 8) 負荷：計測オンの1フレーム分（区間の計測6回と集計）が小さい。
{
  const { trace } = load();
  const N = 60000, t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    trace.t('adv', () => 0); trace.t('cam', () => 0); trace.t('hv', () => 0); trace.t('render', () => 0);
    trace.add('so', 0.1); for (let k = 0; k < 8; k++) trace.zombie({ pos: { x: 0, y: 0, z: 0 } }, 0.2);
    trace.frame(16.7, (i % 3000) / 60, true, 6);
  }
  const perFrameUs = Number(process.hrtime.bigint() - t0) / 1000 / N;
  console.log('perf-trace overhead per frame: ' + perFrameUs.toFixed(2) + ' us');
  assert.ok(perFrameUs < 30, 'per frame cost ' + perFrameUs);
}
console.log('perf-trace: ok');
