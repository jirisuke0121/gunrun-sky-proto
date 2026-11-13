// hook-arc.js の速度の式と、ページへのつなぎ込みを確かめる（ブラウザなし）。
//   node bench/hook-arc.test.cjs
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'hook-arc.js'), 'utf8');
const ctx = { window: {}, location: { search: '' }, URLSearchParams, Math };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const arc = ctx.skyHookArc, D2R = Math.PI / 180, close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
assert.equal(arc.enabled, true);

// 1) 曲がり0なら、直線（目標へ向かう単位ベクトル × 速さ）と同じ。
const e = 6, i = 3, s = -8, r = Math.hypot(e, i, s), o = 18;
let v = arc.velocity(e, i, s, .3, 1, 0, 0, o);
close(v[0], e / r * o); close(v[1], i / r * o); close(v[2], s / r * o);

// 2) どの進み具合でも、速さは変わらない（曲げるだけで速くも遅くもしない）。
for (let k = 0; k <= 20; k++) { v = arc.velocity(e, i, s, k / 20, -1, 28 * D2R, 12 * D2R, o); close(Math.hypot(...v), o, 1e-9); }

// 3) 進み具合 0・.5・1 では曲がり0。到着（τ=1）の向きは直線と同じ。
for (const tau of [0, .5, 1]) { v = arc.velocity(e, i, s, tau, 1, 28 * D2R, 12 * D2R, o); close(v[0], e / r * o, 1e-9); close(v[1], i / r * o, 1e-9); close(v[2], s / r * o, 1e-9); }

// 4) τ=.25 では、横へ ±28° 曲がり、少し下を向く（沈む）。左右は side の符号で決まる。
const plus = arc.velocity(e, i, s, .25, 1, 28 * D2R, 12 * D2R, o), minus = arc.velocity(e, i, s, .25, -1, 28 * D2R, 12 * D2R, o);
const h0 = Math.atan2(s, e), hp = Math.atan2(plus[2], plus[0]), hm = Math.atan2(minus[2], minus[0]);
close(Math.abs(hp - h0), 28 * D2R, 1e-9); close(Math.abs(hm - h0), 28 * D2R, 1e-9); assert.ok(Math.sign(hp - h0) === -Math.sign(hm - h0));
assert.ok(plus[1] < i / r * o, '前半は沈む'); assert.ok(arc.velocity(e, i, s, .75, 1, 28 * D2R, 12 * D2R, o)[1] > i / r * o, '後半は上がる');

// 5) 通り道を積分すると、目標へ着き、横の膨らみは 3 m 以内（遠いフックで最大）。
let x = 0, y = 0, z = 0; const T = [14, 4, -9]; let maxDev = 0, t = 0; const L = Math.hypot(...T);
for (let k = 0; k < 600; k++) {
  const ee = T[0] - x, ii = T[1] - y, ss = T[2] - z, rr = Math.hypot(ee, ii, ss); if (rr < 1.6) break;
  const sp = Math.min(18, 8 + t * 30), vv = arc.velocity(ee, ii, ss, Math.max(0, Math.min(1, 1 - rr / L)), 1, 28 * D2R, 12 * D2R, sp);
  x += vv[0] / 60; y += vv[1] / 60; z += vv[2] / 60; t += 1 / 60;
  const f = (x * T[0] + y * T[1] + z * T[2]) / (L * L); maxDev = Math.max(maxDev, Math.hypot(x - T[0] * f, y - T[1] * f, z - T[2] * f));
  assert.ok(t < 3, '3秒以内に着く');
}
assert.ok(Math.hypot(T[0] - x, T[1] - y, T[2] - z) < 1.6, '到着'); assert.ok(maxDev > 1 && maxDev < 3.2, `膨らみ ${maxDev.toFixed(2)} m`);

// 6) ページへのつなぎ込み（旧市街・渓谷の両方）。
for (const page of ['index.html', 'canyon.html']) {
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', page), 'utf8');
  assert.ok(html.includes('hook-arc.js'), `${page}: hook-arc.js を読み込む`);
  assert.ok(html.includes('window.skyHookArc?.steer(c,t,e,i,s,r,o)||c.vel.set(e/r*o,i/r*o,s/r*o)'), `${page}: 引き寄せから呼ぶ（なければ直線）`);
}
console.log(`PASS hook-arc: 曲がり0は直線と同じ・速さ一定・τ=0/.5/1で直線・膨らみ ${maxDev.toFixed(2)} m で到着・両ページにつなぎ込み`);
