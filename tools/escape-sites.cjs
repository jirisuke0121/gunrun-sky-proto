// 逃げ道ギミックの置き場所を、足場グラフの解析から選ぶ（読み取り専用）。
//   node tools/escape-sites.cjs [--difficulty=normal] [--out=docs/escape-sites]
// ジャンプ台: 開けた地上で、同じ地上のゾンビが登るのに時間がかかる高台へ跳べる場所。
// シャッター: 幅の狭い通路で、通れる経路が1本しかない場所（閉めると遠回りになる）。
const fs = require('node:fs'), path = require('node:path');
const { exportGame, analyze } = require('./escape-graph.cjs');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const outDir = path.resolve(__dirname, '..', arg('out', 'docs/escape-sites'));
const OPEN_DENSITY = 40, MIN_GAIN = 6, SPACING = 22, MAX_PADS = 8;

(async () => {
  const data = await exportGame(), a = analyze(data), { nodes } = data, n = nodes.length;
  const density = i => { let c = 0; const [x, y, z] = nodes[i]; for (let j = 0; j < n; j++) { const q = nodes[j]; if (Math.abs(q[1] - y) < 1.2 && Math.hypot(q[0] - x, q[2] - z) <= 5) c++; } return c; };
  const dens = nodes.map((_, i) => density(i));
  // ジャンプ台の候補: 開けた地上の足場 × 高さ+4〜6.5m・水平5〜9mの着地足場。
  const pads = [];
  for (let p = 0; p < n; p++) {
    const [px, py, pz] = nodes[p];
    if (py < -4 || py > 1.5 || dens[p] < OPEN_DENSITY || a.results[p].status === 'none') continue;
    const zomt = a.dijkstra(a.zombieAdj, [p]).dist, humt = a.dijkstra(a.humanAdj, [p]).dist;
    let best = null;
    for (let m = 0; m < n; m++) {
      const [mx, my, mz] = nodes[m], dy = my - py, d = Math.hypot(mx - px, mz - pz);
      if (dy < 4 || dy > 6.5 || d < 5 || d > 9 || dens[m] < 20) continue; // 着地先は十分な広さの床
      const gain = Math.min(zomt[m], 30) - 1.2, walk = Math.min(humt[m], 60);
      if (gain < MIN_GAIN || walk < MIN_GAIN) continue;
      if (!best || gain > best.gain) best = { land: m, gain: +gain.toFixed(1), walk: +walk.toFixed(1) };
    }
    if (best) pads.push({ pad: p, ...best, density: dens[p], trapped: a.results[p].status === 'trapped' });
  }
  pads.sort((x, y) => (y.trapped - x.trapped) || (y.gain - x.gain));
  const chosen = [];
  for (const c of pads) {
    if (chosen.length >= MAX_PADS) break;
    if (chosen.some(o => Math.hypot(nodes[o.pad][0] - nodes[c.pad][0], nodes[o.pad][2] - nodes[c.pad][2]) < SPACING)) continue;
    chosen.push(c);
  }
  const out = {
    difficulty: arg('difficulty', 'normal'), candidates: pads.length,
    allCandidates: pads.map(c => ({ pad: nodes[c.pad], land: nodes[c.land], zombieExtraSeconds: c.gain, humanWalkSeconds: c.walk })),
    jumpPads: chosen.map(c => ({ pad: nodes[c.pad], land: nodes[c.land], zombieExtraSeconds: c.gain, humanWalkSeconds: c.walk, openDensity: c.density, trappedHere: c.trapped })),
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sites.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
