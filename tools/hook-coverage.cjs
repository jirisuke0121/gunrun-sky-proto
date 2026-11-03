// 自由フック（好きな足場にフックして上に乗る救済。1ランに2回まで）で、囲まれた場所がどれだけ助かるかを測る。読み取り専用。
//   node tools/hook-coverage.cjs [--difficulty=normal] [--out=docs/escape-graph]
// 前提（変えたいときは SCENARIOS と下の定数）:
//   動き出しまで0.4秒、フックの引く速さは本編の hookSpeed=18 m/s、乗り上げに0.5秒。
//   フックの先は、NAVの「立てる足場」。自分の目の高さから足場の上までを、壁がさえぎらないこと（実ゲームの raycast で確認）。
//   助かる = 追手が着くまでの時間 − 自分が乗るまでの時間 が、しきい値（秒）以上。
const fs = require('node:fs'), path = require('node:path');
const { exportGame, analyze } = require('./escape-graph.cjs');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const outDir = path.resolve(__dirname, '..', arg('out', 'docs/escape-graph'));
const REACT = .4, HOOK_SPEED = 18, MANTLE = .5, TOP = 10, CAP = 30, THRESHOLDS = [4, 8];
const SCENARIOS = {
  proposal: { name: '提案どおり（水平12m以内・+3〜+8m・自由）', maxXZ: 12, minRise: 3, maxRise: 8, max3D: 22 },
  engine: { name: '本編のフック射程（3D 22m以内・+2m以上）', maxXZ: 22, minRise: 2, maxRise: 40, max3D: 22 },
};

(async () => {
  const t0 = Date.now();
  const data = await exportGame(), a = analyze(data), { nodes } = data, n = nodes.length;
  const targets = []; a.results.forEach((r, i) => { if (r.threatNodes) targets.push(i); });
  const zomOf = new Map(); // 足場 → 追手の到着時間
  const zom = s => { if (!zomOf.has(s)) zomOf.set(s, a.dijkstra(a.zombieAdj, a.results[s].threatNodes).dist); return zomOf.get(s); };
  const hookTime = (p, q) => REACT + Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / HOOK_SPEED + MANTLE;
  const candidates = (s, sc) => {
    const p = nodes[s], out = [];
    for (let m = 0; m < n; m++) {
      const q = nodes[m], rise = q[1] - p[1], dxz = Math.hypot(q[0] - p[0], q[2] - p[2]), d3 = Math.hypot(dxz, rise);
      if (rise < sc.minRise || rise > sc.maxRise || dxz > sc.maxXZ || d3 > sc.max3D || d3 < 2.5) continue;
      out.push(m);
    }
    return out;
  };
  const report = { difficulty: arg('difficulty', 'normal'), assumptions: { REACT, HOOK_SPEED, MANTLE, TOP, CAP }, scenarios: {} };
  for (const [key, sc] of Object.entries(SCENARIOS)) {
    // 1回目: 各足場で、追手との時間差が大きい順に上位TOP個。
    const first = new Map(), pairs = [], pairIndex = new Map();
    const addPair = (s, m) => { const k = s * n + m; if (!pairIndex.has(k)) { pairIndex.set(k, pairs.length); pairs.push([...nodes[s], ...nodes[m]]); } return pairIndex.get(k); };
    for (const s of targets) {
      const z = zom(s), list = candidates(s, sc).map(m => ({ m, reach: Number.isFinite(z[m]), gain: Math.min(Number.isFinite(z[m]) ? z[m] : CAP, CAP) - hookTime(nodes[s], nodes[m]) }))
        .sort((x, y) => y.gain - x.gain).slice(0, TOP);
      first.set(s, list); for (const c of list) c.pair = addPair(s, c.m);
    }
    // 2回目: 1回目の上位3か所から、さらにTOP個のうち上位3つ。
    const second = new Map();
    for (const s of targets) {
      const z = zom(s); const best = first.get(s).slice(0, 3);
      for (const c1 of best) {
        const list = candidates(c1.m, sc).map(m => ({ m, reach: Number.isFinite(z[m]), gain: Math.min(Number.isFinite(z[m]) ? z[m] : CAP, CAP) - hookTime(nodes[s], nodes[c1.m]) - hookTime(nodes[c1.m], nodes[m]) + MANTLE }))
          .sort((x, y) => y.gain - x.gain).slice(0, 3);
        for (const c of list) c.pair = addPair(c1.m, c.m);
        second.set(s * n + c1.m, list);
      }
    }
    // 実ゲームの壁判定（目の高さから足場の上までを、壁がさえぎらないか）。
    const blocked = await (async () => {
      const res = await exportGame(async page => {
        const out = [];
        for (let i = 0; i < pairs.length; i += 15000) out.push(...await page.evaluate(chunk => chunk.map(([sx, sy, sz, mx, my, mz]) => {
          const ox = sx, oy = sy + 1.6, oz = sz, tx = mx, ty = my + 1.0, tz = mz, dx = tx - ox, dy = ty - oy, dz = tz - oz, d = Math.hypot(dx, dy, dz);
          return __skyInternals.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d - .6) ? 1 : 0;
        }), pairs.slice(i, i + 15000)));
        return out;
      }); return res.extra;
    })();
    const stat = { targets: 0, trappedTargets: 0 }, hit = {};
    for (const th of THRESHOLDS) hit[th] = { one: 0, two: 0, oneNoSanctuary: 0, twoNoSanctuary: 0 };
    const trappedIdx = new Set(targets.filter(s => a.results[s].status === 'trapped'));
    const per = {};
    for (const th of THRESHOLDS) per[th] = { trapped: { one: 0, two: 0, oneNS: 0, twoNS: 0 } };
    for (const s of targets) {
      stat.targets++; const isTrapped = trappedIdx.has(s); if (isTrapped) stat.trappedTargets++;
      const ok1 = first.get(s).filter(c => !blocked[c.pair]);
      for (const th of THRESHOLDS) {
        const one = ok1.some(c => c.gain >= th), oneNS = ok1.some(c => c.gain >= th && c.reach);
        let two = one, twoNS = oneNS;
        for (const c1 of first.get(s).slice(0, 3)) {
          if (blocked[c1.pair]) continue;
          for (const c2 of second.get(s * n + c1.m) || []) { if (blocked[c2.pair]) continue; if (c2.gain >= th) { two = true; if (c2.reach) twoNS = true; } }
        }
        if (isTrapped) { per[th].trapped.one += one; per[th].trapped.two += two; per[th].trapped.oneNS += oneNS; per[th].trapped.twoNS += twoNS; }
      }
    }
    report.scenarios[key] = { name: sc.name, targets: stat.targets, trappedTargets: stat.trappedTargets, rescuedAmongTrapped: per, rays: pairs.length };
    console.log(key, JSON.stringify(report.scenarios[key]));
  }
  report.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  fs.writeFileSync(path.join(outDir, 'hook-coverage.json'), JSON.stringify(report, null, 1));
  console.log('seconds', report.seconds);
})().catch(e => { console.error(e); process.exit(1); });
