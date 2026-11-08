// 実機計測の分析スクリプト：合成データで、描画待ち支配・人物の腕支配・ゲーム更新支配・滑らかの判定と、perfなしの記録を読まないことを確認する。
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
const bucket = (iv, cpu, s, extra = {}) => ({ start: 0, n: 600, iv, ivMax: iv * 2, cpu, cpuMax: cpu * 2, iv33: 0, iv50: 0, cpu17: 0, cpu33: 0, bins: [600, 0, 0, 0, 0, 0], soCalls: 0, zMax: 0,
  s: Object.fromEntries(['adv', 'cam', 'hv', 'render', 'ai', 'so'].map(k => [k, [s[k] || 0, (s[k] || 0) * 3]])), ...extra });
const run = (channel, env, perf) => ({ json: JSON.stringify({ channel, mapKey: 'old-town', environment: env, diagnostics: perf ? { perf } : {} }) });
const phone = { os: 'ios', osVersion: '17.5', browser: 'safari', cores: 6, screenWidth: 844, screenHeight: 390 };
const rows = [
  // GPU待ちが支配: 間隔40ms・CPU8ms
  run('dev', phone, { schema: 1, timerMs: 1, buckets: [bucket(40, 8, { adv: 3, cam: 1, hv: 2, render: 1.5, ai: 1, so: .5 }, { iv33: 500, iv50: 100 })], worst: [{ t: 12, iv: 90, cpu: 60, adv: 20, cam: 1, hv: 3, render: 2, ai: 15, so: 3, soCalls: 2, rest: 34,
    zMax: { ms: 14, x: -44.6, y: 1.1, z: 0, act: 'pillar', fl: 0, st: 0, dr: 0 }, ctx: { p: [-49.2, 3.6, 4.6], z: 8, near: 3, m: 'play' } }] }),
  // 人物の腕が支配: 間隔30ms・CPU28ms・腕12ms
  run('dev', { ...phone, osVersion: '16.0' }, { schema: 1, timerMs: .1, buckets: [bucket(30, 28, { adv: 8, cam: 2, hv: 12, render: 4, ai: 4, so: 1 }, { iv33: 300 })], worst: [] }),
  // 滑らか
  run('dev', { os: 'windows', browser: 'chrome', cores: 16 }, { schema: 1, timerMs: .1, buckets: [bucket(16.7, 5, { adv: 2, cam: .5, hv: .5, render: 1 })], worst: [] }),
  // 本番の記録でも perf があれば読む: ゲーム更新が支配
  run('production', { os: 'android', browser: 'chrome', cores: 8 }, { schema: 1, timerMs: .1, buckets: [bucket(50, 48, { adv: 40, cam: 1, hv: 2, render: 3, ai: 30, so: 2 }, { iv33: 400, iv50: 300 })], worst: [] }),
  // 読まない: perfなし
  run('production', phone, null),
  run('dev', phone, {}),
];
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-')), 'runs.json');
fs.writeFileSync(file, JSON.stringify([{ results: rows }]));
const out = execFileSync('python3', ['-I', path.join(__dirname, '..', 'tools', 'telemetry', 'analyze_perf.py'), file], { encoding: 'utf8' });
console.log(out);
const section = key => out.split('■ ').find(s => s.startsWith(key)) || '';
const gpu = section('ios 17.5');
assert.match(gpu, /描画（GPU）待ちが支配的/); assert.match(gpu, /最遅ゾンビ14ms@\(-44.6,1.1,0\) pillar/); assert.match(gpu, /自分@\(-49.2,3.6,4.6\) ゾンビ8体\(10m内3\)/);
assert.match(gpu, /1プレイ/, 'runs without a perf block are not counted');
const droid = section('android');
assert.match(droid, /CPU内訳で最大はゲーム更新/); assert.match(droid, /ゾンビ30\.0 ms/); assert.match(droid, /ゾンビ更新を調べる/);
const arm = section('ios 16.0');
assert.match(arm, /CPU内訳で最大は人物の腕/); assert.match(arm, /2番/);
assert.match(section('windows'), /最適化を止めてよい/);
assert.ok(!out.includes('player'), 'no device ids');
fs.writeFileSync(file, JSON.stringify([{ results: [rows[4], rows[5]] }]));
assert.match(execFileSync('python3', ['-I', path.join(__dirname, '..', 'tools', 'telemetry', 'analyze_perf.py'), file], { encoding: 'utf8' }), /perf付きのプレイ記録がありません/);
console.log('perf analyze: ok');
