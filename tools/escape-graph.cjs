// 足場グラフの脱出解析（旧市街）。ゲーム本体は変更しない読み取り専用ツール。
//   node tools/escape-graph.cjs [--difficulty=normal|hard|easy] [--out=docs/escape-graph]
// 1) ヘッドレスでゲームを起動し、ゾンビ用の足場グラフ(NAV)と人間専用の移動(ジップ・鉄棒ルート)を取り出す。
// 2) 各足場に「四方からゾンビが迫った」状況を置き、人間が先に着ける安全な足場(脱出先)と経路を探す。
// 3) 結果を上から見た地図(index.html)と summary.json に保存する。
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const root = path.resolve(__dirname, '..');
const difficulty = arg('difficulty', 'normal');
const outDir = path.resolve(root, arg('out', 'docs/escape-graph'));
// challenge-difficulty.js の最終速度(maxSpeed)。追手は「最速・攻撃加速込み」で見積もる(×1.2)。
const ZOMBIE_MAX = { easy: 5.4, normal: 6.8, hard: 8 };
// zombie-routing.js の跳び移り負荷(LEAP_LOAD)。
const LEAP_LOAD = { easy: { slow: 1.35, fail: .2 }, normal: { slow: 1.25, fail: .12 }, hard: { slow: 1, fail: 0 } };
// 解析の条件(変えたいときはここ)。
const SETTINGS = {
  ring: 7, ringTolerance: 1.5, // ゾンビを置く距離(m)
  window: 6,   // 脱出に使える最大時間(秒)
  margin: 1,   // 脱出先で人間が追手より先に着く余裕(秒)
  pathMargin: .5, // 経路の途中の足場でも、追手より先に着く余裕(秒)
  minTravel: 6, // 脱出先までの水平距離(m)。この距離以上動かない場所は脱出とみなさない
  zipSpeed: 12, barSeconds: 2.5, // ジップの速さ(m/s)と鉄棒ルートの所要時間(秒)は概算
};

async function exportGame(after = null) {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', '8793', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8793/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    await page.goto('http://127.0.0.1:8793/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyEscapeRoutes && window.skyOldTownSwingCourse);
    const data = await page.evaluate(() => {
      const g = __game, N = g.NAV, U = __skyInternals.U, course = window.skyOldTownSwingCourse;
      return {
        nodes: N.nodes.map(n => [n.x, n.y, n.z]),
        edges: N.E.map(e => [e.from, e.to ?? -1, e.kind, e.climb || 0, e.len, e.fall || 0]),
        zips: g.ZIPS.map(z => ({ a: z.a, b: z.b, len: z.len })),
        routes: (course.routes || []).map(r => ({ id: r.id, name: r.name, approach: r.approach, exit: r.exit })),
        bars: course.bars.map(b => ({ id: b.id, at: b.at, route: b.route })),
        hooks: g.HOOKS,
        U: { sprintSpeed: U.sprintSpeed, jumpVel: U.jumpVel, gravity: U.gravity, ladderSpeed: U.ladderSpeed, mantleReach: U.mantleReach },
      };
    });
    if (after) data.extra = await after(page);
    return data;
  } finally { await browser.close(); server.kill(); }
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = [k[0], v[0]], lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

function analyze(data) {
  const { nodes, edges, U } = data, n = nodes.length;
  const zSpeed = ZOMBIE_MAX[difficulty] * (U.sprintSpeed / 6) * 1.2, load = LEAP_LOAD[difficulty];
  const hSpeed = U.sprintSpeed;
  // 人間の移動時間(challenge-difficulty.js travelCost と同じ式)。
  const humanCost = (kind, climb, len, fall) => {
    if (kind === 5) return (climb || 4) / U.ladderSpeed + .8;
    if (kind === 1) return climb > U.mantleReach ? Infinity : .3 + .11 * climb + len / hSpeed;
    if (kind === 3) return len / 2.6;
    if (kind === 6) return len > 2 * U.jumpVel / U.gravity * hSpeed ? Infinity : Math.max(len / hSpeed, 2 * U.jumpVel / U.gravity) + .15;
    if (kind === 7) return Math.max(len / hSpeed, Math.sqrt(2 * Math.max(0, fall) / U.gravity)) + .2;
    return len / hSpeed;
  };
  // ゾンビの移動時間(pursuitCost と zombie-routing.js の跳び移り規則)。
  const zombieCost = (kind, climb, len, fall, dy) => {
    if (kind === 6) return len <= 4.3 && Math.abs(dy) <= 1.2 ? ((.18 + .3 + len / 12) * load.slow + load.fail * 10) : Infinity;
    if (kind === 7) return fall <= 64 ? .3 + Math.sqrt(2 * Math.max(0, fall) / U.gravity) : Infinity;
    if (kind === 5) return climb / U.ladderSpeed + .8;
    if (kind === 1) return (.45 + .38 * climb) * (climb > 1.4 ? 1.8 : 1) + Math.max(0, len - 1.6) / zSpeed;
    if (kind === 3) return len / (zSpeed * .35);
    return len / zSpeed;
  };
  const humanAdj = Array.from({ length: n }, () => []), zombieAdj = Array.from({ length: n }, () => []);
  let skippedNoTarget = 0;
  for (const [from, to, kind, climb, len, fall] of edges) {
    if (to < 0) { skippedNoTarget++; continue; }
    const dy = nodes[to][1] - nodes[from][1];
    const h = humanCost(kind, climb, len, fall), z = zombieCost(kind, climb, len, fall, dy);
    if (Number.isFinite(h)) humanAdj[from].push([to, h, kind]);
    if (Number.isFinite(z)) zombieAdj[from].push([to, z, kind]);
  }
  // 人間だけが使える移動: ジップと鉄棒ルート(開始・終了の足場は最も近い足場に対応づける)。
  const nearest = (p, ok = () => true) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) { const q = nodes[i]; if (!ok(q)) continue; const d = Math.hypot(q[0] - p[0], q[2] - p[2]) + Math.abs(q[1] - p[1]) * 2; if (d < bd) { bd = d; best = i; } }
    return bd < 3 ? best : -1;
  };
  const extras = [];
  for (const z of data.zips) {
    const s = nearest([z.a[0], z.a[1] - 1.5, z.a[2]], q => q[1] <= z.a[1] - .8 && q[1] >= z.a[1] - 3.4), t = nearest(z.b);
    if (s >= 0 && t >= 0) extras.push({ from: s, to: t, cost: z.len / SETTINGS.zipSpeed + .6, kind: 'zip' });
  }
  for (const r of data.routes) {
    const s = nearest(r.approach), t = nearest(r.exit);
    if (s >= 0 && t >= 0 && s !== t) extras.push({ from: s, to: t, cost: SETTINGS.barSeconds, kind: 'bar', name: r.name });
  }
  const KIND_NAME = { 0: '走る', 1: '登る', 2: '走る', 3: '這う', 5: 'はしご', 6: 'ジャンプ', 7: '飛び降り', zip: 'ジップ', bar: '鉄棒' };

  function dijkstra(adj, sources, extraEdges = null, limit = Infinity, ok = null) {
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), prevKind = new Array(n);
    const heap = new Heap();
    for (const s of sources) { dist[s] = 0; heap.push(0, s); }
    const byFrom = extraEdges ? new Map() : null;
    if (extraEdges) for (const e of extraEdges) { if (!byFrom.has(e.from)) byFrom.set(e.from, []); byFrom.get(e.from).push(e); }
    while (heap.size) {
      const [d, u] = heap.pop(); if (d > dist[u]) continue; if (d > limit) break;
      for (const [v, w, k] of adj[u]) { const nd = d + w; if (nd < dist[v] && (!ok || ok(v, nd))) { dist[v] = nd; prev[v] = u; prevKind[v] = k; heap.push(nd, v); } }
      if (byFrom?.has(u)) for (const e of byFrom.get(u)) { const nd = d + e.cost; if (nd < dist[e.to] && (!ok || ok(e.to, nd))) { dist[e.to] = nd; prev[e.to] = u; prevKind[e.to] = e.kind; heap.push(nd, e.to); } }
    }
    return { dist, prev, prevKind };
  }
  const pathTo = (res, t) => {
    const out = []; for (let v = t; v >= 0; v = res.prev[v]) out.push(v); out.reverse();
    const kinds = out.slice(1).map(v => res.prevKind[v]), costs = out.slice(1).map((v, i) => res.dist[v] - res.dist[out[i]]); return { nodes: out, kinds, costs };
  };

  const results = new Array(n);
  for (let s = 0; s < n; s++) {
    const [sx, sy, sz] = nodes[s];
    const hum = dijkstra(humanAdj, [s], extras, SETTINGS.window + 4);
    if (!humanAdj[s].length) { results[s] = { status: 'none' }; continue; }
    // 四方(象限)ごとに、距離ringに近い同じ高さの足場へゾンビを置く(人間が3.5秒以内に着ける=つながっている足場だけ)。
    const quad = [null, null, null, null];
    for (let m = 0; m < n; m++) {
      if (!Number.isFinite(hum.dist[m]) || hum.dist[m] > 3.5) continue;
      const [x, y, z] = nodes[m], dx = x - sx, dz = z - sz, d = Math.hypot(dx, dz);
      if (Math.abs(y - sy) > 1.5 || Math.abs(d - SETTINGS.ring) > SETTINGS.ringTolerance) continue;
      const q = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3), err = Math.abs(d - SETTINGS.ring);
      if (!quad[q] || err < quad[q].err) quad[q] = { m, err };
    }
    const threats = quad.filter(Boolean).map(q => q.m);
    if (threats.length < 3) { results[s] = { status: 'open', threats: threats.length }; continue; }
    const zom = dijkstra(zombieAdj, threats);
    // 経路のどの足場でも、人間が追手より先に着くこと(途中でゾンビに近づく経路を除く)。
    const safe = (v, t) => t + SETTINGS.pathMargin <= Math.min(zom.dist[v], 60);
    const run = dijkstra(humanAdj, [s], extras, SETTINGS.window + 1, safe);
    let best = -1, bestMargin = -Infinity;
    for (let m = 0; m < n; m++) {
      const h = run.dist[m]; if (!Number.isFinite(h) || h > SETTINGS.window) continue;
      if (Math.hypot(nodes[m][0] - sx, nodes[m][2] - sz) < SETTINGS.minTravel) continue;
      const margin = Math.min(zom.dist[m], 60) - h;
      if (margin > bestMargin) { bestMargin = margin; best = m; }
    }
    const trapped = best < 0 || bestMargin < SETTINGS.margin;
    // 人間専用の移動(ジップ・鉄棒)なしでも脱出できるか。
    let withoutExtras = false;
    if (!trapped) {
      const plain = dijkstra(humanAdj, [s], null, SETTINGS.window + 1, safe);
      for (let m = 0; m < n && !withoutExtras; m++) {
        const h = plain.dist[m]; if (!Number.isFinite(h) || h > SETTINGS.window) continue;
        if (Math.hypot(nodes[m][0] - sx, nodes[m][2] - sz) < SETTINGS.minTravel) continue;
        if (Math.min(zom.dist[m], 60) - h >= SETTINGS.margin) withoutExtras = true;
      }
    }
    const route = best >= 0 ? pathTo(run, best) : null;
    results[s] = {
      status: trapped ? 'trapped' : withoutExtras ? 'ok' : 'needs-extras', threats: threats.length,
      margin: best >= 0 ? +bestMargin.toFixed(2) : null, target: best, time: best >= 0 ? +run.dist[best].toFixed(2) : null,
      route: !trapped && route ? route.nodes : null, moves: !trapped && route ? route.kinds.map(k => KIND_NAME[k] || String(k)) : null, costs: !trapped && route ? route.costs : null,
      threatNodes: threats,
    };
  }
  return { results, extras, skippedNoTarget, zSpeed, hSpeed, KIND_NAME, humanAdj, zombieAdj, dijkstra, nearest };
}

function render(data, a) {
  const { nodes } = data, { results } = a;
  const stat = { trapped: 0, ok: 0, 'needs-extras': 0, open: 0, none: 0 };
  for (const r of results) stat[r.status]++;
  const compact = results.map(r => r.status === 'trapped' ? [1, r.margin ?? null] : r.status === 'ok' ? [2, r.margin, r.time, r.target, r.moves.join('→'), r.route.length] :
    r.status === 'needs-extras' ? [3, r.margin, r.time, r.target, r.moves.join('→'), r.route.length] : [0]);
  const routes = {}; results.forEach((r, i) => { if (r.route && r.route.length <= 40) routes[i] = r.route; });
  const html = `<!doctype html><meta charset="utf-8"><title>旧市街 足場グラフ 脱出解析</title>
<style>body{margin:0;font:13px/1.5 sans-serif;background:#10161c;color:#dfe8ef;display:flex;height:100vh}#side{flex:none;box-sizing:border-box;width:300px;padding:12px;overflow:auto;border-right:1px solid #2a3947}
canvas{flex:1;min-width:0;display:block}label{display:block;margin:4px 0}.sw{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-1px}#info{margin-top:10px;white-space:pre-wrap;font-size:12px}</style>
<div id="side"><b>旧市街 脱出解析</b><div>難易度 ${difficulty}（追手 ${a.zSpeed.toFixed(1)} m/s・人間 ${a.hSpeed} m/s）</div>
<p>各足場に、${SETTINGS.ring}m離れた四方からゾンビが迫った状況を置き、${SETTINGS.window}秒以内に追手より${SETTINGS.margin}秒以上先に着ける足場があるかを調べた。</p>
<div><span class="sw" style="background:#e5484d"></span>詰み ${stat.trapped}</div><div><span class="sw" style="background:#f5a623"></span>ジップ・鉄棒がないと詰む ${stat['needs-extras']}</div>
<div><span class="sw" style="background:#3dd68c"></span>通常の移動で脱出可 ${stat.ok}</div><div><span class="sw" style="background:#44525e"></span>対象外（四方に追手を置けない） ${stat.open + stat.none}</div>
<p>高さ（足場のY）</p><label>下限 <input id="lo" type="range" min="-5" max="20" value="-5"><span id="lov"></span></label><label>上限 <input id="hi" type="range" min="-5" max="20" value="20"><span id="hiv"></span></label>
<label><input type="checkbox" id="onlyBad" checked> 詰み・要ジップ鉄棒だけ表示</label><div id="info">足場をクリックすると、その場所から探した脱出経路を表示します。</div></div><canvas id="c"></canvas>
<script>const N=${JSON.stringify(nodes.map(p => p.map(v => +v.toFixed(1))))},R=${JSON.stringify(compact)},ROUTES=${JSON.stringify(routes)};
const cv=document.getElementById('c'),cx=cv.getContext('2d');let sel=-1,minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
for(const p of N){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);}
let S=1,ox=0,oy=0;const col={1:'#e5484d',2:'#3dd68c',3:'#f5a623',0:'#44525e'};
const vis=i=>{const y=N[i][1],lo=+document.getElementById('lo').value,hi=+document.getElementById('hi').value;if(y<lo||y>hi)return false;return !document.getElementById('onlyBad').checked||R[i][0]===1||R[i][0]===3;};
const X=p=>ox+(p[0]-minX)*S,Y=p=>oy+(p[2]-minZ)*S;
function draw(){cv.width=cv.clientWidth;cv.height=cv.clientHeight;S=Math.min((cv.width-40)/(maxX-minX),(cv.height-40)/(maxZ-minZ));ox=20;oy=20;cx.clearRect(0,0,cv.width,cv.height);
document.getElementById('lov').textContent=document.getElementById('lo').value;document.getElementById('hiv').textContent=document.getElementById('hi').value;
for(let i=0;i<N.length;i++){if(!vis(i))continue;cx.fillStyle=col[R[i][0]];cx.globalAlpha=.8;cx.fillRect(X(N[i])-S*.45,Y(N[i])-S*.45,S*.9,S*.9);}cx.globalAlpha=1;
if(sel>=0&&ROUTES[sel]){cx.strokeStyle='#fff';cx.lineWidth=2;cx.beginPath();ROUTES[sel].forEach((v,k)=>{k?cx.lineTo(X(N[v]),Y(N[v])):cx.moveTo(X(N[v]),Y(N[v]));});cx.stroke();
cx.fillStyle='#fff';cx.beginPath();cx.arc(X(N[sel]),Y(N[sel]),5,0,7);cx.fill();const t=R[sel][3];cx.fillStyle='#4aa3ff';cx.beginPath();cx.arc(X(N[t]),Y(N[t]),6,0,7);cx.fill();}}
cv.onclick=e=>{const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;let b=-1,bd=1e9;for(let i=0;i<N.length;i++){if(!vis(i))continue;const d=Math.hypot(X(N[i])-mx,Y(N[i])-my);if(d<bd){bd=d;b=i;}}
if(b<0||bd>20)return;sel=b;const q=R[b],p=N[b];document.getElementById('info').textContent='足場 #'+b+'  X '+p[0]+' / Y '+p[1]+' / Z '+p[2]+'\\n'+(q[0]===1?'詰み（${SETTINGS.window}秒以内に先着できる足場なし）':'脱出先 #'+q[3]+'  余裕 '+q[1]+'秒 / 所要 '+q[2]+'秒\\n動き: '+q[4]+(q[0]===3?'\\n※ジップ・鉄棒を使わないと詰む':''));draw();};
['lo','hi','onlyBad'].forEach(id=>document.getElementById(id).oninput=draw);addEventListener('resize',draw);draw();</script>`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  return stat;
}

module.exports = { exportGame, analyze, SETTINGS };
if (require.main === module) (async () => {
  const t0 = Date.now();
  const data = await exportGame();
  const a = analyze(data);
  const stat = render(data, a);
  const summary = {
    difficulty, settings: SETTINGS, zombieSpeed: +a.zSpeed.toFixed(2), humanSpeed: a.hSpeed,
    nodes: data.nodes.length, edges: data.edges.length, edgesWithoutTarget: a.skippedNoTarget, humanOnlyEdges: a.extras.map(e => ({ kind: e.kind, from: data.nodes[e.from], to: data.nodes[e.to], name: e.name })),
    hooksNotModelled: data.hooks.length, counts: stat,
    trappedSamples: a.results.map((r, i) => r.status === 'trapped' ? data.nodes[i] : null).filter(Boolean).slice(0, 40),
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ ...summary, trappedSamples: summary.trappedSamples.length, humanOnlyEdges: summary.humanOnlyEdges.length, seconds: ((Date.now() - t0) / 1000).toFixed(1) }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
